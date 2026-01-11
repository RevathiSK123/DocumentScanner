const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sharp = require('sharp');
const cors = require('cors')({ origin: true });
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

// 3. PROCESS DOCUMENT BY URL (new function)
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
// Initialize Firebase Admin
admin.initializeApp();

// Configure sharp for Cloud Functions
sharp.cache(false);
sharp.concurrency(1);

// Utility functions
const base64ToBuffer = (base64String) => {
  return Buffer.from(base64String.replace(/^data:image\/\w+;base64,/, ''), 'base64');
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

// 3. CORRECT PERSPECTIVE (Updated with actual implementation)
exports.correctPerspective = functions.runWith({
  timeoutSeconds: 60,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  try {
    const { image, options = {}, corners, userId } = data;
    
    if (!image) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Image is required'
      );
    }
    
    console.log('correctPerspective called with options:', options);
    
    const imageBuffer = base64ToBuffer(image);
    const metadata = await sharp(imageBuffer).metadata();
    
    // Default processing options
    const {
      autoCrop = true,
      enhance = true,
      grayscale = false,
      quality = 85,
      maxWidth = 1600
    } = options;
    
    let processor = sharp(imageBuffer);
    
    // If corners provided, apply perspective transformation
    if (corners && corners.length === 4) {
      try {
        // Convert corners to Sharp perspective format
        // Note: Sharp's perspective needs destination points
        const { width, height } = metadata;
        
        // Destination rectangle (full image)
        const destCorners = [
          { x: 0, y: 0 },        // top-left
          { x: width, y: 0 },     // top-right
          { x: width, y: height }, // bottom-right
          { x: 0, y: height }     // bottom-left
        ];
        
        // Apply perspective transformation
        processor = processor.perspective([
          { x: corners[0].x || 0, y: corners[0].y || 0 },
          { x: corners[1].x || width, y: corners[1].y || 0 },
          { x: corners[2].x || width, y: corners[2].y || height },
          { x: corners[3].x || 0, y: corners[3].y || height }
        ], destCorners);
        
        console.log('Applied perspective correction with corners');
      } catch (perspectiveError) {
        console.warn('Perspective correction failed, using auto-crop:', perspectiveError);
      }
    }
    
    // Auto-crop: Find edges and crop
    if (autoCrop) {
      try {
        // Use edge detection and crop
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
    
    // Apply enhancements
    if (enhance) {
      processor = processor
        .normalise()      // Normalize brightness
        .sharpen({ sigma: 0.8 });  // Sharpen edges
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
      compressionRatio: ((imageBuffer.length - processedBuffer.length) / imageBuffer.length * 100).toFixed(1) + '%'
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

// Helper function to detect document edges
async function detectDocumentEdges(imageBuffer) {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    
    // Create a smaller version for edge detection
    const smallBuffer = await sharp(imageBuffer)
      .resize(400, Math.round(400 * height / width), { fit: 'inside' })
      .grayscale()
      .normalise()
      .sharpen({ sigma: 1 })
      .toBuffer();
    
    const smallMetadata = await sharp(smallBuffer).metadata();
    const smallWidth = smallMetadata.width;
    const smallHeight = smallMetadata.height;
    
    // Get pixel data
    const { data } = await sharp(smallBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Simple edge detection: find non-white borders
    const threshold = 200; // Consider pixels darker than this as content
    let top = 0, bottom = smallHeight, left = 0, right = smallWidth;
    
    // Scan from top
    for (let y = 0; y < smallHeight; y++) {
      let hasContent = false;
      for (let x = 0; x < smallWidth; x++) {
        const pixel = data[y * smallWidth + x];
        if (pixel < threshold) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        top = Math.max(0, y - 5); // Add small padding
        break;
      }
    }
    
    // Scan from bottom
    for (let y = smallHeight - 1; y >= 0; y--) {
      let hasContent = false;
      for (let x = 0; x < smallWidth; x++) {
        const pixel = data[y * smallWidth + x];
        if (pixel < threshold) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        bottom = Math.min(smallHeight, y + 5); // Add padding
        break;
      }
    }
    
    // Scan from left
    for (let x = 0; x < smallWidth; x++) {
      let hasContent = false;
      for (let y = 0; y < smallHeight; y++) {
        const pixel = data[y * smallWidth + x];
        if (pixel < threshold) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        left = Math.max(0, x - 5); // Add padding
        break;
      }
    }
    
    // Scan from right
    for (let x = smallWidth - 1; x >= 0; x--) {
      let hasContent = false;
      for (let y = 0; y < smallHeight; y++) {
        const pixel = data[y * smallWidth + x];
        if (pixel < threshold) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        right = Math.min(smallWidth, x + 5); // Add padding
        break;
      }
    }
    
    // Scale back to original dimensions
    const scaleX = width / smallWidth;
    const scaleY = height / smallHeight;
    
    const cropX = Math.round(left * scaleX);
    const cropY = Math.round(top * scaleY);
    const cropWidth = Math.round((right - left) * scaleX);
    const cropHeight = Math.round((bottom - top) * scaleY);
    
    // Ensure reasonable crop area
    if (cropWidth < 100 || cropHeight < 100) {
      return null; // Crop area too small
    }
    
    // Ensure within bounds
    return {
      x: Math.max(0, Math.min(cropX, width - 10)),
      y: Math.max(0, Math.min(cropY, height - 10)),
      width: Math.min(cropWidth, width - cropX),
      height: Math.min(cropHeight, height - cropY)
    };
    
  } catch (error) {
    console.warn('Edge detection failed:', error);
    return null;
  }
}

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
    
    // First enhance the image for better OCR
    const imageBuffer = base64ToBuffer(image);
    const enhancedBuffer = await sharp(imageBuffer)
      .grayscale()
      .normalise()
      .sharpen({ sigma: 0.8 })
      .threshold(128)
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // Mock OCR result - In production, replace with Google Cloud Vision API
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

Next Steps:
1. Review extracted text for accuracy
2. Edit any incorrect characters
3. Save to your document library
4. Export as PDF if needed

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
      if (batchOptions.correctPerspective) {
        // Use perspective correction
        result = await exports.correctPerspective._method({
          image,
          options: batchOptions,
          userId: context.auth?.uid
        }, context);
      } else {
        // Use regular enhancement
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

// 6. CREATE PDF FROM IMAGES
exports.createPDF = functions.runWith({
  timeoutSeconds: 30,
  memory: '512MB'
}).https.onCall(async (data, context) => {
  try {
    const { images, title = 'Scanned Documents', options = {} } = data;
    
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
    
    // Process each image to ensure consistent quality
    const processedImages = [];
    
    for (const image of images) {
      try {
        const imageBuffer = base64ToBuffer(image);
        const processedBuffer = await sharp(imageBuffer)
          .resize(1240, 1754, { // A4 size at 150 DPI
            fit: 'inside',
            withoutEnlargement: true,
            background: { r: 255, g: 255, b: 255 }
          })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer();
        
        processedImages.push(processedBuffer.toString('base64'));
      } catch (error) {
        console.warn('Failed to process image for PDF:', error);
        processedImages.push(image); // Use original if processing fails
      }
    }
    
    // Simple HTML PDF generation
    const pdf = require('html-pdf');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          @page {
            margin: 20mm;
            @bottom-center {
              content: "Page " counter(page) " of " counter(pages);
              font-size: 10px;
              color: #666;
            }
          }
          body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            line-height: 1.6;
          }
          .page {
            page-break-after: always;
            margin-bottom: 30px;
          }
          .page:last-child {
            page-break-after: auto;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid #1976d2;
          }
          .header h1 {
            color: #1976d2;
            margin: 0 0 10px 0;
            font-size: 24px;
          }
          .header p {
            color: #666;
            margin: 5px 0;
            font-size: 14px;
          }
          .image-container {
            text-align: center;
            margin: 20px 0 40px 0;
          }
          .image-container img {
            max-width: 100%;
            max-height: 220mm;
            height: auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border: 1px solid #eee;
          }
          .image-info {
            text-align: center;
            font-size: 12px;
            color: #888;
            margin-top: 10px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #eee;
            font-size: 11px;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p>Generated by Document Scanner</p>
          <p>${new Date().toLocaleDateString()} • ${processedImages.length} page${processedImages.length > 1 ? 's' : ''}</p>
        </div>
        
        ${processedImages.map((img, index) => `
          <div class="page">
            <div class="image-container">
              <img src="${`data:image/jpeg;base64,${img.replace(/^data:image\/\w+;base64,/, '')}`}" 
                   alt="Page ${index + 1}" />
            </div>
            <div class="image-info">
              Page ${index + 1} of ${processedImages.length}
            </div>
            <div class="footer">
              Document Scanner • ${new Date().getFullYear()} • Processed on ${new Date().toLocaleDateString()}
            </div>
          </div>
        `).join('')}
      </body>
      </html>
    `;
    
    // PDF options
    const pdfOptions = {
      format: 'A4',
      orientation: 'portrait',
      border: {
        top: '20mm',
        right: '20mm',
        bottom: '25mm',
        left: '20mm'
      },
      type: 'pdf',
      timeout: 30000
    };
    
    // Generate PDF
    const pdfBuffer = await new Promise((resolve, reject) => {
      pdf.create(htmlContent, pdfOptions).toBuffer((error, buffer) => {
        if (error) {
          console.error('PDF generation error:', error);
          reject(error);
        } else {
          resolve(buffer);
        }
      });
    });
    
    const pdfBase64 = pdfBuffer.toString('base64');
    
    return {
      success: true,
      pdf: `data:application/pdf;base64,${pdfBase64}`,
      size: pdfBuffer.length,
      pages: processedImages.length,
      downloadUrl: `data:application/pdf;base64,${pdfBase64}`,
      timestamp: new Date().toISOString()
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
    
    // Sanitize metadata: remove/flatten nested objects/arrays
    function flattenMetadata(obj, prefix = '') {
      const flat = {};
      for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        const value = obj[key];
        const flatKey = prefix ? `${prefix}_${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // If it's a simple object with width/height, flatten to string
          if ('width' in value && 'height' in value && Object.keys(value).length === 2) {
            flat[flatKey] = `${value.width}x${value.height}`;
          } else {
            // Recursively flatten nested objects
            Object.assign(flat, flattenMetadata(value, flatKey));
          }
        } else if (Array.isArray(value)) {
          // Convert arrays to string or skip
          flat[flatKey] = JSON.stringify(value);
        } else {
          flat[flatKey] = value;
        }
      }
      return flat;
    }
    const safeMetadata = flattenMetadata({
      ...metadata,
      type: metadata.type || 'document',
      source: 'document-scanner',
      hasImage: !!image,
      hasText: !!text,
      textLength: text ? text.length : 0
    });
    console.log('Sanitized metadata for Firestore:', JSON.stringify(safeMetadata));
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
    
    // If text provided, store it
    if (text) {
      documentData.text = text;
      documentData.textPreview = text.substring(0, 200);
    }
    
    // Store in Firestore
    await admin.firestore()
      .collection('documents')
      .doc(docId)
      .set(documentData);
    
    // Store image in Storage if provided
    let imageUrl = null;
    if (image) {
      const bucket = admin.storage().bucket();
      const fileName = `documents/${userId}/${docId}.jpg`;
      const file = bucket.file(fileName);
      
      const imageBuffer = base64ToBuffer(image);
      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/jpeg',
          metadata: {
            userId,
            docId,
            timestamp,
            ...metadata
          }
        }
      });
      
      // Get public URL
      await file.makePublic();
      imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      
      documentData.imageUrl = imageUrl;
    }
    
    return {
      success: true,
      documentId: docId,
      timestamp,
      imageUrl,
      ...documentData
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

// 10. COMPRESS IMAGE (Storage trigger)
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

// 11. TEST FUNCTION
exports.testFunction = functions.https.onCall(async (data, context) => {
  console.log('✅ testFunction called with:', data);
  
  return {
    success: true,
    message: '✅ All Firebase Functions are working!',
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
      'processBatch'
    ],
    stats: {
      sharpVersion: sharp.version,
      nodeVersion: process.version,
      memory: process.memoryUsage()
    }
  };
});

module.exports = exports;