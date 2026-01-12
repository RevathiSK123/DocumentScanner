const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sharp = require('sharp');
const cors = require('cors')({ origin: true });
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Configure sharp for Cloud Functions
sharp.cache(false);
sharp.concurrency(1);

// Utility functions
const base64ToBuffer = (base64String) => {
  // Handle both data URL and plain base64
  if (base64String.startsWith('data:image/')) {
    return Buffer.from(base64String.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  }
  return Buffer.from(base64String, 'base64');
};

const bufferToBase64 = (buffer, mimeType = 'image/jpeg') => {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
};

// 1. HEALTH CHECK (No dependencies)
exports.healthCheck = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: ['sharp', 'pdf', 'ocr']
    });
  });
});

// 2. ENHANCE DOCUMENT (Main function - uses Sharp)
exports.enhanceDocument = functions.runWith({
  timeoutSeconds: 30,
  memory: '512MB',
  maxInstances: 10
}).https.onCall(async (data, context) => {
  try {
    const { image, options = {} } = data;
    
    // Validate input
    if (!image) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image is required'
      );
    }
    
    // Check image size (max 5MB for base64)
    if (image.length > 7 * 1024 * 1024) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image too large. Max 5MB.'
      );
    }
    
    const imageBuffer = base64ToBuffer(image);
    
    // Default options
    const {
      format = 'jpeg',
      quality = 80,
      maxWidth = 2000,
      grayscale = true,
      enhance = true,
      threshold = null
    } = options;
    
    let processor = sharp(imageBuffer);
    
    // Get original metadata
    const metadata = await sharp(imageBuffer).metadata();
    
    // Resize if needed
    if (maxWidth > 0 && metadata.width > maxWidth) {
      processor = processor.resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: 'inside'
      });
    }
    
    // Document enhancement pipeline
    if (grayscale) {
      processor = processor.grayscale();
    }
    
    if (enhance) {
      processor = processor.normalise().sharpen({ sigma: 0.5 });
    }
    
    if (threshold !== null && threshold > 0) {
      processor = processor.threshold(threshold);
    }
    
    // Output in requested format
    let outputBuffer;
    let outputMimeType;
    
    switch (format.toLowerCase()) {
      case 'webp':
        outputBuffer = await processor.webp({ quality }).toBuffer();
        outputMimeType = 'image/webp';
        break;
      case 'png':
        outputBuffer = await processor.png({ quality }).toBuffer();
        outputMimeType = 'image/png';
        break;
      default: // jpeg
        outputBuffer = await processor.jpeg({ 
          quality,
          mozjpeg: true 
        }).toBuffer();
        outputMimeType = 'image/jpeg';
    }
    
    // Get processed dimensions
    const processedMetadata = await sharp(outputBuffer).metadata();
    
    return {
      success: true,
      processedImage: outputBuffer.toString('base64'),
      mimeType: outputMimeType,
      originalSize: imageBuffer.length,
      processedSize: outputBuffer.length,
      dimensions: {
        original: { width: metadata.width, height: metadata.height },
        processed: { width: processedMetadata.width, height: processedMetadata.height }
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('EnhanceDocument Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// IMPROVED DOCUMENT EDGE DETECTION FUNCTION
async function detectDocumentEdges(imageBuffer) {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    
    console.log(`Detecting edges for image: ${width}x${height}`);
    
    // Method 1: Contrast-based edge detection
    try {
      // Create a smaller version for processing
      const targetSize = 800;
      const scale = Math.min(targetSize / width, targetSize / height);
      const smallWidth = Math.round(width * scale);
      const smallHeight = Math.round(height * scale);
      
      // Process image for edge detection
      const processedBuffer = await sharp(imageBuffer)
        .resize(smallWidth, smallHeight, { fit: 'inside' })
        .grayscale()
        .normalise() // Enhance contrast
        .sharpen({ sigma: 1.5 })
        .threshold(160, { grayscale: true })
        .raw()
        .toBuffer();
      
      const pixels = new Uint8Array(processedBuffer);
      
      // Find bounding box of document content
      let minX = smallWidth, maxX = 0, minY = smallHeight, maxY = 0;
      let hasContent = false;
      
      for (let y = 0; y < smallHeight; y++) {
        for (let x = 0; x < smallWidth; x++) {
          if (pixels[y * smallWidth + x] < 128) {
            hasContent = true;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      
      if (!hasContent) {
        console.log('No document content detected in Method 1');
        throw new Error('No content found');
      }
      
      // Add padding (5% of content size)
      const padX = Math.max(5, Math.round((maxX - minX) * 0.05));
      const padY = Math.max(5, Math.round((maxY - minY) * 0.05));
      
      minX = Math.max(0, minX - padX);
      maxX = Math.min(smallWidth - 1, maxX + padX);
      minY = Math.max(0, minY - padY);
      maxY = Math.min(smallHeight - 1, maxY + padY);
      
      const cropW = maxX - minX;
      const cropH = maxY - minY;
      
      // Scale back to original
      const scaleX = width / smallWidth;
      const scaleY = height / smallHeight;
      
      const result = {
        x: Math.round(minX * scaleX),
        y: Math.round(minY * scaleY),
        width: Math.round(cropW * scaleX),
        height: Math.round(cropH * scaleY)
      };
      
      // Validate crop area (at least 5% of original)
      if (result.width > width * 0.05 && result.height > height * 0.05) {
        console.log(`Method 1 successful: ${result.x},${result.y} ${result.width}x${result.height}`);
        return result;
      }
    } catch (method1Error) {
      console.log('Method 1 failed:', method1Error.message);
    }
    
    // Method 2: Brightness gradient scanning
    console.log('Trying Method 2: Gradient scanning');
    
    const workSize = 600;
    const workScale = Math.min(workSize / width, workSize / height);
    const workWidth = Math.round(width * workScale);
    const workHeight = Math.round(height * workScale);
    
    const { data } = await sharp(imageBuffer)
      .resize(workWidth, workHeight, { fit: 'inside' })
      .grayscale()
      .normalise()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Calculate image statistics
    let minBrightness = 255, maxBrightness = 0, sumBrightness = 0;
    for (let i = 0; i < data.length; i++) {
      const brightness = data[i];
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);
      sumBrightness += brightness;
    }
    
    const avgBrightness = sumBrightness / data.length;
    const contrast = maxBrightness - minBrightness;
    const threshold = Math.min(avgBrightness * 0.7, 180);
    
    console.log(`Brightness stats: min=${minBrightness}, max=${maxBrightness}, avg=${avgBrightness.toFixed(1)}, contrast=${contrast}, threshold=${threshold}`);
    
    // If contrast is too low, don't crop
    if (contrast < 10) {
      console.log('Low contrast image, skipping crop');
      return null;
    }
    
    // Scan for document boundaries
    const scanStep = Math.max(1, Math.floor(workWidth / 40));
    let top = 0, bottom = workHeight - 1, left = 0, right = workWidth - 1;
    
    // Scan from top
    for (let y = 0; y < workHeight; y += scanStep) {
      let darkCount = 0;
      for (let x = 0; x < workWidth; x += scanStep) {
        if (data[y * workWidth + x] < threshold) darkCount++;
      }
      if (darkCount > (workWidth / scanStep) * 0.2) {
        top = Math.max(0, y - Math.round(workHeight * 0.03));
        break;
      }
    }
    
    // Scan from bottom
    for (let y = workHeight - 1; y >= 0; y -= scanStep) {
      let darkCount = 0;
      for (let x = 0; x < workWidth; x += scanStep) {
        if (data[y * workWidth + x] < threshold) darkCount++;
      }
      if (darkCount > (workWidth / scanStep) * 0.2) {
        bottom = Math.min(workHeight - 1, y + Math.round(workHeight * 0.03));
        break;
      }
    }
    
    // Scan from left
    for (let x = 0; x < workWidth; x += scanStep) {
      let darkCount = 0;
      for (let y = 0; y < workHeight; y += scanStep) {
        if (data[y * workWidth + x] < threshold) darkCount++;
      }
      if (darkCount > (workHeight / scanStep) * 0.2) {
        left = Math.max(0, x - Math.round(workWidth * 0.03));
        break;
      }
    }
    
    // Scan from right
    for (let x = workWidth - 1; x >= 0; x -= scanStep) {
      let darkCount = 0;
      for (let y = 0; y < workHeight; y += scanStep) {
        if (data[y * workWidth + x] < threshold) darkCount++;
      }
      if (darkCount > (workHeight / scanStep) * 0.2) {
        right = Math.min(workWidth - 1, x + Math.round(workWidth * 0.03));
        break;
      }
    }
    
    const cropW = right - left;
    const cropH = bottom - top;
    
    // Scale back to original
    const scaleX = width / workWidth;
    const scaleY = height / workHeight;
    
    const result = {
      x: Math.round(left * scaleX),
      y: Math.round(top * scaleY),
      width: Math.round(cropW * scaleX),
      height: Math.round(cropH * scaleY)
    };
    
    // Final validation
    if (result.width > width * 0.05 && result.height > height * 0.05) {
      console.log(`Method 2 successful: ${result.x},${result.y} ${result.width}x${result.height}`);
      return result;
    }
    
    console.log('No valid crop area found');
    return null;
    
  } catch (error) {
    console.error('Edge detection error:', error);
    return null;
  }
}

// SIMPLE BORDER REMOVAL FUNCTION (Alternative for high-contrast backgrounds)
async function removeDocumentBorders(imageBuffer) {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    
    // Sample border pixels (5% of each side)
    const borderSample = Math.min(width, height) * 0.05;
    const sampleWidth = Math.min(20, Math.floor(borderSample));
    const sampleHeight = Math.min(20, Math.floor(borderSample));
    
    // Get average brightness of borders
    let borderBrightness = 0;
    let sampleCount = 0;
    
    // Sample top border
    const topBorder = await sharp(imageBuffer)
      .extract({ left: 0, top: 0, width: width, height: sampleHeight })
      .grayscale()
      .raw()
      .toBuffer();
    
    for (let i = 0; i < topBorder.length; i++) {
      borderBrightness += topBorder[i];
      sampleCount++;
    }
    
    // Sample bottom border
    const bottomBorder = await sharp(imageBuffer)
      .extract({ left: 0, top: height - sampleHeight, width: width, height: sampleHeight })
      .grayscale()
      .raw()
      .toBuffer();
    
    for (let i = 0; i < bottomBorder.length; i++) {
      borderBrightness += bottomBorder[i];
      sampleCount++;
    }
    
    const avgBorderBrightness = borderBrightness / sampleCount;
    console.log(`Average border brightness: ${avgBorderBrightness.toFixed(1)}`);
    
    // If borders are very bright (likely white background), crop them
    if (avgBorderBrightness > 220) {
      const cropAmount = Math.floor(borderSample * 0.8);
      return {
        x: cropAmount,
        y: cropAmount,
        width: Math.max(100, width - (2 * cropAmount)),
        height: Math.max(100, height - (2 * cropAmount))
      };
    }
    
    return null;
  } catch (error) {
    console.warn('Border removal failed:', error);
    return null;
  }
}

// 3. CORRECT PERSPECTIVE WITH IMPROVED AUTO-CROP
exports.correctPerspective = functions.runWith({
  timeoutSeconds: 60,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  try {
    const { image, options = {}, userId } = data;
    
    if (!image) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image is required'
      );
    }
    
    console.log('correctPerspective called with options:', options);
    
    const imageBuffer = base64ToBuffer(image);
    const metadata = await sharp(imageBuffer).metadata();
    console.log(`Original image: ${metadata.width}x${metadata.height}, size: ${imageBuffer.length} bytes`);
    
    // Default processing options
    const {
      autoCrop = true,
      enhance = true,
      grayscale = false,
      quality = 85,
      maxWidth = 1600,
      removeBorders = true
    } = options;
    
    let processor = sharp(imageBuffer);
    let cropApplied = false;
    let cropInfo = 'No crop applied';
    
    // AUTO-CROP LOGIC
    if (autoCrop) {
      try {
        console.log('Starting auto-crop detection...');
        
        // First try simple border removal for high-contrast backgrounds
        let cropArea = null;
        
        if (removeBorders) {
          cropArea = await removeDocumentBorders(imageBuffer);
          if (cropArea) {
            console.log(`Border removal crop: ${cropArea.x},${cropArea.y} ${cropArea.width}x${cropArea.height}`);
            cropInfo = 'Border removal crop';
          }
        }
        
        // If border removal didn't work or wasn't applicable, try edge detection
        if (!cropArea) {
          cropArea = await detectDocumentEdges(imageBuffer);
          if (cropArea) {
            console.log(`Edge detection crop: ${cropArea.x},${cropArea.y} ${cropArea.width}x${cropArea.height}`);
            cropInfo = 'Edge detection crop';
          }
        }
        
        // Apply crop if valid area found
        if (cropArea && cropArea.width > 100 && cropArea.height > 100) {
          // Ensure crop is within image bounds
          const safeX = Math.max(0, Math.min(cropArea.x, metadata.width - cropArea.width - 1));
          const safeY = Math.max(0, Math.min(cropArea.y, metadata.height - cropArea.height - 1));
          const safeWidth = Math.min(cropArea.width, metadata.width - safeX);
          const safeHeight = Math.min(cropArea.height, metadata.height - safeY);
          
          if (safeWidth > 100 && safeHeight > 100) {
            processor = processor.extract({
              left: safeX,
              top: safeY,
              width: safeWidth,
              height: safeHeight
            });
            cropApplied = true;
            console.log(`Applied crop: ${safeX},${safeY} ${safeWidth}x${safeHeight}`);
            cropInfo = `Crop applied: ${safeX},${safeY} ${safeWidth}x${safeHeight}`;
          } else {
            console.log('Crop area too small after bounds check');
          }
        } else {
          // Fallback: crop the entire image
          processor = processor.extract({
            left: 0,
            top: 0,
            width: metadata.width,
            height: metadata.height
          });
          cropApplied = true;
          cropInfo = 'Fallback: cropped entire image';
          console.log('No valid crop area found or area too small, fallback to cropping entire image');
        }
      } catch (cropError) {
        console.warn('Auto-crop failed, continuing without crop:', cropError);
      }
    }
    
    // Apply enhancements
    if (enhance) {
      processor = processor.normalise().sharpen({ sigma: 0.8 });
    }
    
    if (grayscale) {
      processor = processor.grayscale();
    }
    
    // Resize if too large
    if (maxWidth > 0 && metadata.width > maxWidth) {
      processor = processor.resize(maxWidth, null, {
        withoutEnlargement: true,
        fit: 'inside'
      });
    }
    
    // Process image
    const processedBuffer = await processor
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    
    const processedMetadata = await sharp(processedBuffer).metadata();
    
    console.log(`Processed image: ${processedMetadata.width}x${processedMetadata.height}, size: ${processedBuffer.length} bytes`);
    
    return {
      success: true,
      croppedImage: processedBuffer.toString('base64'),
      processedImage: processedBuffer.toString('base64'),
      originalSize: imageBuffer.length,
      processedSize: processedBuffer.length,
      dimensions: {
        original: { width: metadata.width, height: metadata.height },
        processed: { width: processedMetadata.width, height: processedMetadata.height }
      },
      mimeType: 'image/jpeg',
      timestamp: new Date().toISOString(),
      cropApplied: cropApplied,
      cropInfo: cropInfo,
      compressionRatio: cropApplied ? `${((imageBuffer.length - processedBuffer.length) / imageBuffer.length * 100).toFixed(1)}%` : '0%'
    };
    
  } catch (error) {
    console.error('CorrectPerspective Error:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to process image. Try enhanceDocument instead.',
      timestamp: new Date().toISOString()
    };
  }
});

// 4. EXTRACT TEXT (OCR function)
exports.extractText = functions.runWith({
  timeoutSeconds: 30,
  memory: '512MB'
}).https.onCall(async (data, context) => {
  try {
    const { image, language = 'eng' } = data;
    
    // Validate input
    if (!image) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image is required'
      );
    }
    
    // Check image size
    if (image.length > 7 * 1024 * 1024) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image too large. Max 5MB.'
      );
    }
    
    const imageBuffer = base64ToBuffer(image);
    
    // First enhance the image for better OCR
    const enhancedBuffer = await sharp(imageBuffer)
      .grayscale()
      .normalise()
      .sharpen({ sigma: 0.8 })
      .threshold(128)
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // Mock OCR result
    const mockText = `📄 DOCUMENT SCANNER - SAMPLE TEXT EXTRACTION

Invoice #: SCAN-${Date.now().toString().slice(-8)}
Date: ${new Date().toLocaleDateString('en-US', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}
Time: ${new Date().toLocaleTimeString()}

Description:
This document demonstrates text extraction capabilities.
The scanner has successfully processed the image and
identified text patterns in the document.

Key Features:
✓ High-quality image enhancement
✓ Automatic perspective correction  
✓ Text extraction with confidence scoring
✓ PDF generation from multiple images
✓ Cloud storage and organization

Technical Details:
• Processing time: < 2 seconds
• Image resolution: 300 DPI
• Text confidence: 85-95%
• Supported formats: JPG, PNG, PDF

Note: For production use, enable Google Cloud Vision API
to get real OCR results with higher accuracy.`;

    return {
      success: true,
      text: mockText,
      confidence: 85.5,
      language: language,
      timestamp: new Date().toISOString(),
      enhancedImage: enhancedBuffer.toString('base64'),
      note: "Using mock OCR. Enable Google Cloud Vision API for production."
    };
    
  } catch (error) {
    console.error('ExtractText Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// 5. BATCH PROCESS IMAGES
exports.processBatch = functions.runWith({
  timeoutSeconds: 60,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  const { images, options = {} } = data;
  
  if (!images || !Array.isArray(images) || images.length === 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'At least one image is required'
    );
  }
  
  if (images.length > 10) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Maximum 10 images per batch'
    );
  }
  
  const results = [];
  const batchOptions = { ...options, batchMode: true };
  
  // Process each image
  for (const [index, image] of images.entries()) {
    try {
      console.log(`Processing image ${index + 1} of ${images.length}`);
      
      let result;
      if (batchOptions.correctPerspective || batchOptions.autoCrop) {
        result = await exports.correctPerspective._method({
          image,
          options: batchOptions,
          userId: context.auth?.uid
        }, context);
      } else {
        result = await exports.enhanceDocument._method({
          image,
          options: batchOptions
        }, context);
      }
      
      results.push({
        success: true,
        index,
        ...result
      });
      
    } catch (error) {
      results.push({
        success: false,
        index,
        error: error.message
      });
    }
  }
  
  return {
    success: true,
    results,
    processed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    timestamp: new Date().toISOString()
  };
});

// 6. CREATE PDF FROM IMAGES (Simplified)
exports.createPDF = functions.runWith({
  timeoutSeconds: 30,
  memory: '512MB'
}).https.onCall(async (data, context) => {
  try {
    const { images, title = 'Scanned Documents' } = data;
    
    if (!images || images.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'At least one image is required'
      );
    }
    
    if (images.length > 50) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Maximum 50 images per PDF'
      );
    }
    
    // Return mock PDF for now (simplified version)
    const mockPdfText = `PDF Generated: ${title}\nPages: ${images.length}\nDate: ${new Date().toLocaleDateString()}`;
    const mockPdfBase64 = Buffer.from(mockPdfText).toString('base64');
    
    return {
      success: true,
      pdf: `data:application/pdf;base64,${mockPdfBase64}`,
      size: mockPdfText.length,
      pages: images.length,
      timestamp: new Date().toISOString(),
      note: "PDF generation simplified for testing. Implement html-pdf for production."
    };
    
  } catch (error) {
    console.error('CreatePDF Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// 7. STORE DOCUMENT IN FIRESTORE
exports.storeDocument = functions.https.onCall(async (data, context) => {
  // Authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Authentication required'
    );
  }
  
  try {
    const { image, text, metadata = {} } = data;
    const userId = context.auth.uid;
    const docId = uuidv4();
    const timestamp = new Date().toISOString();
    
    // Simple metadata
    const safeMetadata = {
      type: metadata.type || 'document',
      source: 'document-scanner',
      timestamp: timestamp,
      hasImage: !!image,
      hasText: !!text,
      textLength: text ? text.length : 0
    };
    
    // Prepare document data
    const documentData = {
      userId,
      docId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      timestamp,
      metadata: safeMetadata,
      status: 'processed'
    };
    
    if (text) {
      documentData.text = text;
      documentData.textPreview = text.substring(0, 200);
    }
    
    // Store in Firestore
    await admin.firestore()
      .collection('documents')
      .doc(docId)
      .set(documentData);
    
    return {
      success: true,
      documentId: docId,
      timestamp
    };
    
  } catch (error) {
    console.error('StoreDocument Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// 8. GET DOCUMENT
exports.getDocument = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const { documentId } = data;
  const userId = context.auth.uid;
  
  try {
    // Get from Firestore
    const docRef = admin.firestore().collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Document not found');
    }
    
    const document = docSnap.data();
    
    // Verify ownership
    if (document.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }
    
    return {
      success: true,
      document
    };
    
  } catch (error) {
    console.error('GetDocument Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// 9. DELETE DOCUMENT
exports.deleteDocument = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const { documentId } = data;
  const userId = context.auth.uid;
  
  try {
    // Verify ownership first
    const docRef = admin.firestore().collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Document not found');
    }
    
    const document = docSnap.data();
    if (document.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }
    
    // Delete from Storage if exists
    const bucket = admin.storage().bucket();
    const fileName = `documents/${userId}/${documentId}.jpg`;
    const file = bucket.file(fileName);
    
    try {
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      }
    } catch (storageError) {
      console.warn('Storage deletion error (might not exist):', storageError);
    }
    
    // Delete from Firestore
    await docRef.delete();
    
    return {
      success: true,
      message: 'Document deleted successfully',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('DeleteDocument Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});


exports.compressImage = functions.storage.object().onFinalize(async (object) => {
  // Only process images
  if (!object.contentType || !object.contentType.startsWith('image/')) {
    return null;
  }
  
  // Skip if already compressed
  if (object.metadata && object.metadata.compressed === 'true') {
    return null;
  }
  
  const bucket = admin.storage().bucket(object.bucket);
  const file = bucket.file(object.name);
  
  try {
    // Download the file
    const [buffer] = await file.download();
    
    // Compress with sharp
    const compressedBuffer = await sharp(buffer)
      .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ 
        quality: 80,
        mozjpeg: true 
      })
      .toBuffer();
    
    // Upload compressed version
    await file.save(compressedBuffer, {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          ...object.metadata,
          compressed: 'true',
          originalSize: buffer.length,
          compressedSize: compressedBuffer.length,
          compressionRatio: `${((1 - compressedBuffer.length / buffer.length) * 100).toFixed(1)}%`
        }
      }
    });
    
    console.log(`Compressed ${object.name}: ${buffer.length} → ${compressedBuffer.length} bytes`);
    
  } catch (error) {
    console.error('Compression error:', error);
  }
  
  return null;
});

// 11. PROCESS DOCUMENT BY URL
exports.processDocumentByUrl = functions.runWith({
  timeoutSeconds: 60,
  memory: '1GB',
  maxInstances: 5
}).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const { url, options = {} } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
      // Fetch image from URL
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ error: 'Failed to fetch image from URL' });
      }
      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      // Use correctPerspective/auto-crop logic
      const {
        format = 'jpeg',
        quality = 80,
        maxWidth = 2000,
        grayscale = true,
        enhance = true,
        threshold = null,
        autoCrop = true
      } = options;

      let processor = sharp(imageBuffer);
      const metadata = await sharp(imageBuffer).metadata();

      // Auto-crop: Find edges and crop
      if (autoCrop) {
        try {
          const edges = await detectDocumentEdges(imageBuffer);
          if (edges && edges.width > 100 && edges.height > 100) {
            processor = processor.extract({
              left: edges.x,
              top: edges.y,
              width: edges.width,
              height: edges.height
            });
            console.log('Auto-cropped to:', edges);
          }
        } catch (cropError) {
          console.warn('Auto-crop failed:', cropError);
        }
      }

      if (maxWidth > 0 && metadata.width > maxWidth) {
        processor = processor.resize(maxWidth, null, {
          withoutEnlargement: true,
          fit: 'inside'
        });
      }
      if (grayscale) {
        processor = processor.grayscale();
      }
      if (enhance) {
        processor = processor.normalise().sharpen({ sigma: 0.5 });
      }
      if (threshold !== null && threshold > 0) {
        processor = processor.threshold(threshold);
      }
      let outputBuffer;
      let outputMimeType;
      if (format === 'png') {
        outputBuffer = await processor.png({ quality }).toBuffer();
        outputMimeType = 'image/png';
      } else {
        outputBuffer = await processor.jpeg({ quality }).toBuffer();
        outputMimeType = 'image/jpeg';
      }
      const base64Image = bufferToBase64(outputBuffer, outputMimeType);
      res.json({
        processedImage: base64Image,
        format: outputMimeType,
        width: metadata.width,
        height: metadata.height
      });
    } catch (error) {
      console.error('processDocumentByUrl error:', error);
      res.status(500).json({ error: error.message || 'Processing failed' });
    }
  });
});

// 12. TEST FUNCTION
exports.testFunction = functions.https.onCall(async (data, context) => {
  console.log('✅ testFunction called with:', data);
  
  return {
    success: true,
    message: '✅ Firebase Functions are working!',
    timestamp: new Date().toISOString(),
    projectId: process.env.GCLOUD_PROJECT,
    region: process.env.FUNCTION_REGION || 'us-central1',
    functions: [
      'enhanceDocument',
      'extractText',
      'createPDF',
      'correctPerspective',
      'storeDocument',
      'getDocument',
      'deleteDocument',
      'processBatch',
      'processDocumentByUrl'
    ]
  };
});

module.exports = exports;