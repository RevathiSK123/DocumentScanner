import React, { useState, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Snackbar,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  CloudUpload,
  AutoFixHigh,
  TextFields,
  PictureAsPdf,
  Download,
  Delete,
  CameraAlt,
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  Cloud,
  WifiOff,
  Refresh,
  Info,
  Crop
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext';
import {
  processDocument,
  extractTextFromImage,
  generatePDF,
  saveDocument,
  testConnection,
  compressImage,
  correctPerspective
} from '../firebase';
import DocumentPreview from './DocumentPreview';
import ProcessingOptions from './ProcessingOptions';
import TextResult from './TextResult';

const DocumentScanner = () => {
  const { currentUser } = useAuth();
  const [files, setFiles] = useState([]);
  const [processedImages, setProcessedImages] = useState([]);
  const [textResults, setTextResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [openCamera, setOpenCamera] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  // Helper to create data URL from base64
  const createDataUrl = (base64, mimeType = 'image/jpeg') => {
    if (!base64) return '';
    // Check if already has data URL prefix
    if (base64.startsWith('data:')) {
      return base64;
    }
    return `data:${mimeType};base64,${base64}`;
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    onDrop: async (acceptedFiles) => {
      try {
        const processedFiles = await Promise.all(
          acceptedFiles.map(async (file) => {
            if (file.size > 5 * 1024 * 1024) {
              showSnackbar(`Compressing ${file.name}...`, 'info');
              const compressed = await compressImage(file);
              return {
                id: Date.now() + Math.random(),
                name: compressed.name,
                size: compressed.originalSize,
                type: compressed.type,
                dataUrl: compressed.dataUrl,
                compressed: true,
                compressedSize: compressed.compressedSize,
                base64: compressed.dataUrl.split(',')[1] // Store just base64
              };
            }
            const reader = new FileReader();
            return new Promise((resolve) => {
              reader.onload = () => {
                const dataUrl = reader.result;
                resolve({
                  id: Date.now() + Math.random(),
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  dataUrl: dataUrl,
                  base64: dataUrl.split(',')[1], // Extract base64 part
                  compressed: false
                });
              };
              reader.readAsDataURL(file);
            });
          })
        );
        
        setFiles(prev => [...prev, ...processedFiles]);
        showSnackbar(`Added ${acceptedFiles.length} file(s)`, 'success');
        
      } catch (err) {
        setError('Failed to process uploaded files: ' + err.message);
        showSnackbar('Upload failed', 'error');
      }
    },
    maxFiles: 10,
    maxSize: 10 * 1024 * 1024,
    onDropRejected: (rejectedFiles) => {
      const messages = rejectedFiles.map(file => {
        if (file.size > 10 * 1024 * 1024) {
          return `${file.name} is too large (max 10MB)`;
        }
        return `${file.name} is not a valid image file`;
      });
      setError(messages.join(', '));
      showSnackbar(messages[0], 'error');
    }
  });

  const testFirebaseConnection = async () => {
    setConnectionStatus('testing');
    setError(null);
    setConnectionDetails(null);
    
    try {
      const result = await testConnection({ 
        test: 'document-scanner',
        timestamp: Date.now(),
        userId: currentUser?.uid
      });
      
      if (result.data?.success) {
        setConnectionStatus('connected');
        setConnectionDetails(result.data);
        showSnackbar('✅ Firebase Functions connected!', 'success');
      } else {
        setConnectionStatus('failed');
        setError(result.data?.error || 'Connection failed');
        showSnackbar('❌ Connection failed', 'error');
      }
      
    } catch (err) {
      setConnectionStatus('failed');
      setError(err.message);
      showSnackbar('❌ Connection test error', 'error');
    }
  };

  // FIXED: Handle crop document
  const handleCropDocument = async (imageData, options = {}, fileInfo = {}) => {
    if (!currentUser) {
      setError('Please login to use this feature');
      showSnackbar('Please login first', 'warning');
      return;
    }

    if (connectionStatus !== 'connected') {
      showSnackbar('Please test connection first', 'warning');
      await testFirebaseConnection();
      if (connectionStatus !== 'connected') {
        return;
      }
    }

    setLoading(true);
    setError(null);
    
    try {
      // Extract base64 from data URL
      const base64Image = imageData.includes(',') 
        ? imageData.split(',')[1] 
        : imageData;

      const requestPayload = { 
        image: base64Image, // Send only base64
        options: {
          autoCrop: options.autoCrop !== undefined ? options.autoCrop : true,
          enhance: options.enhance !== undefined ? options.enhance : true,
          contrast: options.contrast || 1.2,
          brightness: options.brightness || 1.1,
          grayscale: options.grayscale || false,
          quality: options.quality || 0.8
        },
        userId: currentUser.uid,
        fileName: fileInfo.name || 'document.jpg'
      };
      
      console.log('🖼️ Sending crop request, image size:', base64Image.length);
      
      const result = await correctPerspective(requestPayload);

      if (!result.data) {
        throw new Error('No response from server');
      }
      
      if (!result.data.success) {
        throw new Error(result.data.error || 'Cropping failed');
      }

      // Get the cropped image base64 from response
      const croppedImageBase64 = result.data.croppedImage || result.data.processedImage;
      
      if (!croppedImageBase64) {
        console.error('Response:', result.data);
        throw new Error('No processed image returned');
      }

      console.log('✅ Cropped image received, size:', croppedImageBase64.length);
      
      const croppedImage = {
        id: Date.now() + Math.random(),
        original: base64Image, // Store original base64
        processed: croppedImageBase64, // Store processed base64 (no data URL prefix)
        originalSize: result.data.originalSize || base64Image.length,
        processedSize: result.data.processedSize || croppedImageBase64.length,
        userId: currentUser.uid,
        timestamp: new Date().toISOString(),
        options: options,
        fileName: fileInfo.name || 'document.jpg',
        type: 'cropped',
        mimeType: result.data.mimeType || 'image/jpeg'
      };
      
      setProcessedImages(prev => [...prev, croppedImage]);
      
      // Save to Firestore
      try {
        await saveDocument({
          image: croppedImageBase64,
          text: '',
          metadata: {
            type: 'cropped_document',
            originalSize: croppedImage.originalSize,
            processedSize: croppedImage.processedSize,
            fileName: croppedImage.fileName,
            source: 'document-scanner',
            timestamp: croppedImage.timestamp,
            compressionRatio: result.data.compressionRatio
          }
        });
        showSnackbar('✅ Document cropped and saved!', 'success');
      } catch (storeErr) {
        console.warn('Storage failed:', storeErr.message);
        showSnackbar('✅ Cropped, but storage failed', 'warning');
      }
      
    } catch (err) {
      const errorMessage = err.message || 'Failed to crop document';
      setError(errorMessage);
      showSnackbar(`❌ ${errorMessage}`, 'error');
      console.error('Crop error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEnhanceDocument = async (imageData, options = {}, fileInfo = {}) => {
    if (!currentUser) {
      setError('Please login to use this feature');
      showSnackbar('Please login first', 'warning');
      return;
    }

    if (connectionStatus !== 'connected') {
      showSnackbar('Please test connection first', 'warning');
      await testFirebaseConnection();
      if (connectionStatus !== 'connected') {
        return;
      }
    }

    setLoading(true);
    setError(null);
    
    try {
      const base64Image = imageData.includes(',') 
        ? imageData.split(',')[1] 
        : imageData;

      const result = await processDocument({ 
        image: base64Image,
        options: options,
        userId: currentUser.uid
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Processing failed');
      }

      const enhancedImage = {
        id: Date.now() + Math.random(),
        original: base64Image,
        processed: result.data.processedImage || result.data.image,
        originalSize: result.data.originalSize || base64Image.length,
        processedSize: result.data.processedSize || 0,
        userId: currentUser.uid,
        timestamp: new Date().toISOString(),
        options: options,
        fileName: fileInfo.name || 'document.jpg',
        type: 'enhanced',
        mimeType: result.data.mimeType || 'image/jpeg'
      };
      
      setProcessedImages(prev => [...prev, enhancedImage]);

      try {
        await saveDocument({ 
          image: enhancedImage.processed,
          text: '',
          metadata: {
            type: 'enhanced_document',
            originalSize: enhancedImage.originalSize,
            processedSize: enhancedImage.processedSize,
            options: options,
            fileName: enhancedImage.fileName,
            source: 'document-scanner',
            timestamp: new Date().toISOString()
          }
        });
        showSnackbar('✅ Document enhanced and saved!', 'success');
      } catch (storeErr) {
        console.warn('Document storage failed:', storeErr.message);
        showSnackbar('✅ Enhanced, but storage failed', 'warning');
      }    
        
    } catch (err) {
      const errorMessage = err.message || 'Failed to enhance document';
      setError(errorMessage);
      showSnackbar(`❌ ${errorMessage}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExtractText = async (imageData, fileInfo = {}) => {
    if (!currentUser) {
      setError('Please login to use this feature');
      showSnackbar('Please login first', 'warning');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const base64Image = imageData.includes(',') 
        ? imageData.split(',')[1] 
        : imageData;

      const result = await extractTextFromImage({ 
        image: base64Image,
        userId: currentUser.uid
      });
      
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Text extraction failed');
      }
      
      const textResult = {
        id: Date.now() + Math.random(),
        image: base64Image,
        text: result.data.text || '',
        confidence: result.data.confidence || 0,
        userId: currentUser.uid,
        timestamp: new Date().toISOString(),
        fileName: fileInfo.name || 'document.jpg'
      };
      
      setTextResults(prev => [...prev, textResult]);
      
      try {
        await saveDocument({ 
          image: base64Image,
          text: textResult.text,
          metadata: {
            confidence: textResult.confidence,
            type: 'ocr_result',
            wordCount: textResult.text.split(/\s+/).filter(word => word.length > 0).length,
            fileName: textResult.fileName,
            source: 'document-scanner',
            timestamp: new Date().toISOString()
          }
        });
        showSnackbar('✅ Text extracted and saved!', 'success');
      } catch (storeErr) {
        console.warn('Text storage failed:', storeErr.message);
        showSnackbar('✅ Text extracted, but storage failed', 'warning');
      }

    } catch (err) {
      const errorMessage = err.message || 'Failed to extract text';
      setError(errorMessage);
      showSnackbar(`❌ ${errorMessage}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePDF = async () => {
    if (!currentUser) {
      setError('Please login to use this feature');
      showSnackbar('Please login first', 'warning');
      return;
    }

    // Convert base64 images to data URLs for PDF generation
    const imagesToConvert = processedImages.length > 0 
      ? processedImages.map(img => createDataUrl(img.processed, img.mimeType))
      : files.map(file => file.dataUrl);

    if (imagesToConvert.length === 0) {
      setError('No images to convert to PDF');
      showSnackbar('No images available', 'warning');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Send data URLs to PDF generator
      const result = await generatePDF({ 
        images: imagesToConvert,
        options: {
          pageSize: 'A4',
          margin: 50
        },
        userId: currentUser.uid
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'PDF creation failed');
      }
      
      setPdfUrl(result.data.pdf);
      
      const link = document.createElement('a');
      link.href = result.data.pdf;
      link.download = `documents_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSnackbar('✅ PDF created and downloaded!', 'success');
      
    } catch (err) {
      const errorMessage = err.message || 'Failed to create PDF';
      setError(errorMessage);
      showSnackbar(`❌ ${errorMessage}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError('Camera access denied or not available');
      showSnackbar('Camera access denied', 'error');
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      setFiles(prev => [...prev, {
        id: Date.now() + Math.random(),
        name: `camera_${Date.now()}.jpg`,
        size: imageData.length,
        type: 'image/jpeg',
        dataUrl: imageData,
        base64: imageData.split(',')[1],
        compressed: false
      }]);
      
      setOpenCamera(false);
      showSnackbar('📸 Image captured successfully!', 'success');
      
      const stream = video.srcObject;
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      }
    }
  };

  const handleClearAll = () => {
    setFiles([]);
    setProcessedImages([]);
    setTextResults([]);
    setPdfUrl(null);
    setError(null);
    showSnackbar('All documents cleared', 'info');
  };

  const removeFile = (id) => {
    setFiles(files.filter(file => file.id !== id));
    showSnackbar('File removed', 'info');
  };

  const handleProcessAll = async (options) => {
    if (files.length === 0) {
      showSnackbar('No files to process', 'warning');
      return;
    }

    for (const file of files) {
      if (options.autoCrop || options.crop) {
        await handleCropDocument(file.dataUrl, options, file);
      } else {
        await handleEnhanceDocument(file.dataUrl, options, file);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <CheckCircle sx={{ color: '#4caf50' }} />;
      case 'testing': return <CircularProgress size={20} />;
      case 'failed': return <ErrorIcon sx={{ color: '#f44336' }} />;
      default: return <Cloud sx={{ color: '#757575' }} />;
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'success';
      case 'testing': return 'info';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        📄 Document Scanner
      </Typography>

      {/* Connection Status Card */}
      <Paper sx={{ 
        p: 2, 
        mb: 3,
        bgcolor: connectionStatus === 'connected' ? '#e8f5e9' : 
                 connectionStatus === 'failed' ? '#ffebee' :
                 connectionStatus === 'testing' ? '#e3f2fd' :
                 '#fafafa',
        border: `2px solid ${
          connectionStatus === 'connected' ? '#4caf50' : 
          connectionStatus === 'failed' ? '#f44336' :
          connectionStatus === 'testing' ? '#2196f3' :
          '#e0e0e0'
        }`
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {getStatusIcon()}
            <Box sx={{ ml: 2 }}>
              <Typography variant="h6">
                {connectionStatus === 'connected' && '✅ Firebase Connected'}
                {connectionStatus === 'testing' && '🔄 Testing Connection...'}
                {connectionStatus === 'failed' && '❌ Connection Failed'}
                {connectionStatus === 'idle' && '🔗 Connection Status'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {connectionStatus === 'connected' && 'Functions are ready to use'}
                {connectionStatus === 'testing' && 'Testing connection to Firebase...'}
                {connectionStatus === 'failed' && 'Unable to connect to Firebase Functions'}
                {connectionStatus === 'idle' && 'Click Test Connection to verify'}
              </Typography>
            </Box>
          </Box>
          
          <Box>
            <Button
              variant="contained"
              color={connectionStatus === 'connected' ? "success" : "primary"}
              onClick={testFirebaseConnection}
              disabled={connectionStatus === 'testing' || loading}
              startIcon={connectionStatus === 'connected' ? <CheckCircle /> : <Refresh />}
            >
              {connectionStatus === 'connected' ? 'Re-test' : 'Test Connection'}
            </Button>
            
            {connectionStatus === 'failed' && (
              <Button
                sx={{ ml: 1 }}
                variant="outlined"
                color="error"
                onClick={() => window.open('https://console.firebase.google.com/project/documentscanner-585c9/functions', '_blank')}
              >
                <WifiOff sx={{ mr: 1 }} />
                Check Functions
              </Button>
            )}
          </Box>
        </Box>

        {connectionDetails && (
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
            <Typography variant="caption" color="textSecondary">
              Project: {connectionDetails.projectId || 'documentscanner-585c9'} • 
              Region: {connectionDetails.region || 'us-central1'} • 
              Environment: {process.env.NODE_ENV}
            </Typography>
          </Box>
        )}
      </Paper>

      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }} 
          onClose={() => setError(null)}
          action={
            <Button 
              color="inherit" 
              size="small" 
              onClick={testFirebaseConnection}
            >
              Test Again
            </Button>
          }
        >
          <Typography variant="body2">{error}</Typography>
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Upload & Camera Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Upload or Capture Documents
            </Typography>
            
            <Grid container spacing={2}>
              {/* Dropzone */}
              <Grid item xs={12} md={6}>
                <Box
                  {...getRootProps()}
                  sx={{
                    border: '2px dashed',
                    borderColor: isDragActive ? '#1976d2' : '#bdbdbd',
                    borderRadius: 2,
                    p: 4,
                    cursor: 'pointer',
                    textAlign: 'center',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    bgcolor: isDragActive ? '#e3f2fd' : '#fafafa',
                    '&:hover': {
                      bgcolor: '#f5f5f5',
                      borderColor: '#1976d2'
                    }
                  }}
                >
                  <input {...getInputProps()} />
                  <CloudUpload sx={{ fontSize: 48, color: '#1976d2', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    {isDragActive ? 'Drop files here' : 'Drag & drop files'}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    or click to browse files
                  </Typography>
                  <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
                    Supports JPG, PNG, WEBP • Max 10MB each
                  </Typography>
                </Box>
              </Grid>

              {/* Camera Capture */}
              <Grid item xs={12} md={6}>
                <Box
                  sx={{
                    border: '2px solid #4caf50',
                    borderRadius: 2,
                    p: 4,
                    textAlign: 'center',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    bgcolor: '#f1f8e9'
                  }}
                >
                  <CameraAlt sx={{ fontSize: 48, color: '#4caf50', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Capture with Camera
                  </Typography>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Perfect for scanning physical documents
                  </Typography>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CameraAlt />}
                    onClick={() => setOpenCamera(true)}
                  >
                    Open Camera
                  </Button>
                </Box>
              </Grid>
            </Grid>

            {/* Selected Files */}
            {files.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1">
                    Selected Files ({files.length})
                  </Typography>
                  <Chip 
                    label={`${formatFileSize(files.reduce((sum, f) => sum + f.size, 0))} total`} 
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                </Box>
                
                <Grid container spacing={2}>
                  {files.map((file) => (
                    <Grid item xs={12} sm={6} md={4} key={file.id}>
                      <Card>
                        <DocumentPreview imageUrl={file.dataUrl} />
                        <CardContent sx={{ py: 1 }}>
                          <Typography variant="body2" noWrap title={file.name}>
                            {file.name}
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" color="textSecondary">
                              {formatFileSize(file.size)}
                              {file.compressed && (
                                <Tooltip title="This file was compressed">
                                  <Info sx={{ fontSize: 12, ml: 0.5, verticalAlign: 'middle' }} />
                                </Tooltip>
                              )}
                            </Typography>
                            <Chip 
                              label={file.type.split('/')[1].toUpperCase()} 
                              size="small" 
                              variant="outlined"
                            />
                          </Box>
                        </CardContent>
                        <CardActions sx={{ py: 1 }}>
                          <Button
                            size="small"
                            startIcon={<AutoFixHigh />}
                            onClick={() => handleEnhanceDocument(file.dataUrl, {}, file)}
                            disabled={loading || connectionStatus !== 'connected'}
                          >
                            Enhance
                          </Button>
                          <Button
                            size="small"
                            startIcon={<Crop />} 
                            onClick={() => handleCropDocument(file.dataUrl, {}, file)}
                            disabled={loading || connectionStatus !== 'connected'}
                          >
                            Crop
                          </Button>
                          <Button
                            size="small"
                            startIcon={<TextFields />}
                            onClick={() => handleExtractText(file.dataUrl, file)}
                            disabled={loading || connectionStatus !== 'connected'}
                          >
                            Extract Text
                          </Button>
                          <IconButton 
                            size="small" 
                            onClick={() => removeFile(file.id)}
                            sx={{ ml: 'auto' }}
                          >
                            <Delete />
                          </IconButton>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Processing Options */}
        {files.length > 0 && connectionStatus === 'connected' && (
          <Grid item xs={12}>
            <ProcessingOptions 
              onProcess={(options) => handleProcessAll(options)}
              disabled={loading}
              fileCount={files.length}
            />
          </Grid>
        )}

        {/* Loading Indicator */}
        {loading && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography gutterBottom>Processing documents...</Typography>
              <Typography variant="caption" color="textSecondary">
                This may take a moment depending on file size and options
              </Typography>
            </Paper>
          </Grid>
        )}

        {/* Processed Images */}
        {processedImages.length > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Processed Documents ({processedImages.length})
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {processedImages.some(img => img.type === 'cropped') && (
                    <Chip 
                      label="Cropped" 
                      color="info" 
                      variant="outlined"
                      icon={<Crop />}
                      size="small"
                    />
                  )}
                  <Chip 
                    label="Processed" 
                    color="success" 
                    variant="outlined"
                    icon={<CheckCircle />}
                    size="small"
                  />
                </Box>
              </Box>
              
              <Grid container spacing={2}>
                {processedImages.map((img) => (
                  <Grid item xs={12} sm={6} md={4} key={img.id}>
                    <Card>
                      <DocumentPreview 
                        imageUrl={createDataUrl(img.processed, img.mimeType)} 
                        beforeAfter={createDataUrl(img.original, img.mimeType)}
                      />
                      <CardContent>
                        <Typography variant="body2" color="success.main" gutterBottom>
                          {img.type === 'cropped' ? '📐 Cropped document' : '✨ Enhanced document'}
                          {img.processedSize && img.originalSize && (
                            <span> • Size reduced by {((1 - img.processedSize / img.originalSize) * 100).toFixed(1)}%</span>
                          )}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {new Date(img.timestamp).toLocaleTimeString()} • {img.fileName}
                        </Typography>
                      </CardContent>
                      <CardActions>
                        <Button
                          size="small"
                          startIcon={<Download />}
                          href={createDataUrl(img.processed, img.mimeType)}
                          download={`${img.type}_${img.fileName}`}
                        >
                          Download
                        </Button>
                        <Button
                          size="small"
                          startIcon={<TextFields />}
                          onClick={() => handleExtractText(createDataUrl(img.processed, img.mimeType), { name: img.fileName })}
                          disabled={loading}
                        >
                          Extract Text
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          </Grid>
        )}

        {/* Extracted Text Results */}
        {textResults.length > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Extracted Text ({textResults.length})
              </Typography>
              <Tabs 
                value={activeTab} 
                onChange={(e, val) => setActiveTab(val)}
                variant="scrollable"
                scrollButtons="auto"
              >
                {textResults.map((result, index) => (
                  <Tab 
                    key={result.id} 
                    label={`Doc ${index + 1}`}
                    icon={result.confidence > 0.8 ? <CheckCircle color="success" /> : <Warning color="warning" />}
                    iconPosition="start"
                  />
                ))}
              </Tabs>
              
              {textResults.map((result, index) => (
                <Box key={result.id} hidden={activeTab !== index}>
                  <TextResult 
                    text={result.text}
                    confidence={result.confidence}
                    imageUrl={createDataUrl(result.image)}
                    timestamp={result.timestamp}
                    fileName={result.fileName}
                  />
                </Box>
              ))}
            </Paper>
          </Grid>
        )}

        {/* Actions */}
        {(files.length > 0 || processedImages.length > 0) && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<PictureAsPdf />}
                onClick={handleCreatePDF}
                disabled={loading || connectionStatus !== 'connected'}
                size="large"
              >
                Export All as PDF
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<Delete />}
                onClick={handleClearAll}
                disabled={loading}
                size="large"
              >
                Clear All
              </Button>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Camera Dialog */}
      <Dialog 
        open={openCamera} 
        onClose={() => setOpenCamera(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Capture Document
          <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>
            Position document in frame with good lighting
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                maxHeight: '60vh',
                border: '2px solid #ddd',
                borderRadius: 8,
                backgroundColor: '#000'
              }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCamera(false)} color="inherit">
            Cancel
          </Button>
          <Button 
            variant="outlined" 
            color="primary"
            onClick={startCamera}
          >
            Start Camera
          </Button>
          <Button 
            variant="contained" 
            color="success"
            onClick={captureImage}
            startIcon={<CameraAlt />}
          >
            Capture Image
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
};

export default DocumentScanner;