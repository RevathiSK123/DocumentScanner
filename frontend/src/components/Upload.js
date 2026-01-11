import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Alert from 'react-bootstrap/Alert';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { useAuth } from '../contexts/AuthContext';
import { uploadDocument, processDocumentByUrl, getDocumentById, updateDocumentWithProcessedUrl } from '../services/documentService';
import ImagePreview from './ImagePreview';

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const { currentUser } = useAuth();

  // Add the missing cleanupProgress function here
  const cleanupProgress = () => {
    // Clear all intervals
    const maxIntervalId = setTimeout(() => {}, 0);
    for (let i = 0; i < maxIntervalId; i++) {
      clearInterval(i);
    }
    // Clear all timeouts
    for (let i = 0; i < maxIntervalId; i++) {
      clearTimeout(i);
    }
    // Reset progress states
    setProcessingProgress(0);
    setUploadProgress(0);
    console.log('🧹 Cleaned up all intervals and timeouts');
  };

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    onDrop: acceptedFiles => {
      // Revoke previous object URLs
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
      setFiles(acceptedFiles.map(file => Object.assign(file, {
        preview: URL.createObjectURL(file),
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9)
      })));
      setResult(null);
      setError('');
    }
  });

  useEffect(() => {
    return () => {
      // Cleanup object URLs
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
      // Cleanup any running intervals
      cleanupProgress();
    };
  }, [files]);

  const handleUpload = async () => {
    if (files.length === 0 || !currentUser) return;

    console.log('=== UPLOAD DEBUG START ===');
    console.log('Files:', files);
    console.log('Current User:', currentUser);

    try {
      setUploading(true);
      setProcessing(false);
      setError('');
      setResult(null);
      setUploadProgress(0);
      setProcessingProgress(0);

      let allResults = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const userId = currentUser.uid;

        console.log('Starting upload for file:', file.name);

        // Step 1: Upload document
        console.log('Calling uploadDocument...');
        const uploadResult = await uploadDocument(
          file,
          userId,
          (progress) => {
            console.log('Upload progress:', progress);
            setUploadProgress(progress);
          }
        );

        console.log('✅ Upload successful:', uploadResult);
        console.log('Upload result ID:', uploadResult?.id);

        setUploading(false);
        setProcessing(true);

        // Progress simulation for each file
        let progressInterval = null;
        progressInterval = setInterval(() => {
          setProcessingProgress(prev => {
            if (prev < 85) {
              return prev + 15;
            } else if (prev < 90) {
              return prev + 5;
            } else {
              return 90;
            }
          });
        }, 300);

        // Step 2: Process the document
        console.log('Calling getDocumentById with ID:', uploadResult.id);
        const doc = await getDocumentById(uploadResult.id, userId);
        let processedResult;
        if (doc.metadata && doc.metadata._base64) {
          console.log('Calling correctPerspective for base64 image from metadata');
          const { correctPerspective } = await import('../firebase');
          processedResult = await correctPerspective({
            image: doc.metadata._base64,
            options: { autoCrop: true, enhance: true, grayscale: false }
          });
          processedResult = processedResult.data || processedResult;
        } else if (doc.originalUrl && doc.originalUrl.startsWith('data:')) {
          console.log('Calling correctPerspective for base64 image (legacy)');
          const { correctPerspective } = await import('../firebase');
          processedResult = await correctPerspective({
            image: doc.originalUrl.split(',')[1],
            options: { autoCrop: true, enhance: true, grayscale: false }
          });
          processedResult = processedResult.data || processedResult;
        } else {
          console.log('Calling processDocumentByUrl with URL:', doc.originalUrl);
          processedResult = await processDocumentByUrl(doc.originalUrl);
        }

        console.log('✅ Processing successful:', processedResult);

        // Update Firestore with processedUrl
        let processedUrl = null;
        if (processedResult.processedImage) {
          processedUrl = processedResult.processedImage.startsWith('data:')
            ? processedResult.processedImage
            : `data:image/jpeg;base64,${processedResult.processedImage}`;
        } else if (processedResult.processedUrl) {
          processedUrl = processedResult.processedUrl;
        } else if (processedResult.url) {
          processedUrl = processedResult.url;
        }
        try {
          await updateDocumentWithProcessedUrl(uploadResult.id, processedUrl, 'processed');
        } catch (updateErr) {
          console.warn('Failed to update Firestore with processedUrl:', updateErr);
        }

        if (progressInterval) {
          clearInterval(progressInterval);
        }
        setProcessingProgress(100);
        await new Promise(resolve => setTimeout(resolve, 300));

        let displayOriginalUrl = null;
        if (doc.metadata && doc.metadata._base64) {
          displayOriginalUrl = `data:${doc.fileType || 'image/jpeg'};base64,${doc.metadata._base64}`;
        } else if (doc.originalUrl && doc.originalUrl.startsWith('data:')) {
          displayOriginalUrl = doc.originalUrl;
        } else if (doc.originalUrl && (doc.originalUrl.startsWith('http://') || doc.originalUrl.startsWith('https://'))) {
          displayOriginalUrl = doc.originalUrl;
        }

        allResults.push({
          ...processedResult,
          id: uploadResult.id,
          originalUrl: displayOriginalUrl,
          processedUrl
        });
      }

      setResult(allResults.length === 1 ? allResults[0] : allResults);
      setProcessing(false);

      setTimeout(() => {
        files.forEach(file => {
          if (file.preview) {
            URL.revokeObjectURL(file.preview);
          }
        });
        setFiles([]);
      }, 1000);

      console.log('=== UPLOAD DEBUG END ===');

    } catch (err) {
      console.error('Upload error:', err);
      console.error('Full error:', err);
      cleanupProgress();
      setError(err.message || 'Upload failed');
      setUploading(false);
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    // Cleanup object URLs
    files.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    setFiles([]);
    setResult(null);
    setError('');
    // Also cleanup any running progress intervals
    cleanupProgress();
  };

  const handleRetry = () => {
    setError('');
    if (files.length > 0) {
      handleUpload();
    }
  };

  const handleDownload = (url, filename) => {
    if (!url) {
      alert('No URL available for download');
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'scanned-document.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add debug useEffect to track state changes
  useEffect(() => {
    console.log('📊 Progress State Update:', {
      uploading,
      processing,
      uploadProgress,
      processingProgress,
      hasError: !!error,
      hasResult: !!result,
      timestamp: new Date().toISOString()
    });
  }, [uploading, processing, uploadProgress, processingProgress, error, result]);

  return (
    <div className="upload-container">
      <h2 className="mb-4">📄 Document Scanner</h2>
      
      {!uploading && !processing && !result && (
        <Card className="mb-4 shadow-sm">
          <Card.Body className="text-center">
            <div 
              {...getRootProps({className: 'dropzone'})} 
              style={{
                border: '3px dashed #6c757d',
                borderRadius: '10px',
                padding: '60px 20px',
                backgroundColor: '#f8f9fa',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#007bff'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#6c757d'}
            >
              <input {...getInputProps()} />
              <div className="mb-3">
                <i className="bi bi-cloud-upload" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
              </div>
              <h5>Drag & drop your document here</h5>
              <p className="text-muted">or click to browse files</p>
              <div className="mt-3">
                <small className="text-muted">
                  Supports: JPG, PNG, PDF (first page) • Max 10MB
                </small>
              </div>
            </div>
          </Card.Body>
        </Card>
      )}

      {files.length > 0 && !uploading && !processing && !result && (
        <Card className="mb-4 shadow-sm">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">Preview</h5>
              <Button 
                variant="outline-danger" 
                size="sm" 
                onClick={handleCancel}
              >
                <i className="bi bi-x-circle me-1"></i> Cancel
              </Button>
            </div>
            
            <Row>
              <Col md={8}>
                {files[0] && (
                  <>
                    <ImagePreview file={files[0]} />
                    <div className="mt-3">
                      <p>
                        <strong>File:</strong> {files[0].name}<br />
                        <strong>Size:</strong> {(files[0].size / 1024 / 1024).toFixed(2)} MB<br />
                        <strong>Type:</strong> {files[0].type || 'Unknown'}
                      </p>
                    </div>
                  </>
                )}
              </Col>
              <Col md={4} className="d-flex flex-column justify-content-center">
                <div className="text-center">
                  <Button 
                    onClick={handleUpload} 
                    disabled={uploading}
                    variant="primary"
                    size="lg"
                    className="mb-3"
                    style={{ minWidth: '150px' }}
                  >
                    <i className="bi bi-scanner me-2"></i>
                    Scan Document
                  </Button>
                  <p className="text-muted small">
                    Document will be automatically cropped and perspective-corrected
                  </p>
                </div>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      {(uploading || processing) && (
        <Card className="mb-4 shadow-sm">
          <Card.Body>
            <h5 className="mb-3">
              {uploading ? '📤 Uploading...' : '🔧 Processing Document...'}
            </h5>
            
            {uploading && (
              <>
                <ProgressBar 
                  now={uploadProgress} 
                  label={`${Math.round(uploadProgress)}%`} 
                  animated 
                  striped 
                  className="mb-3"
                />
                <div className="text-center">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Uploading...</span>
                  </div>
                  <p className="mt-2">Uploading to cloud storage...</p>
                  <small className="text-muted">
                    Please don't close this window
                  </small>
                </div>
              </>
            )}
            
            {processing && (
              <>
                <ProgressBar 
                  now={processingProgress} 
                  label={`${Math.round(processingProgress)}%`} 
                  animated 
                  striped 
                  variant="success"
                  className="mb-3"
                />
                <div className="text-center">
                  <div className="spinner-border text-success" role="status">
                    <span className="visually-hidden">Processing...</span>
                  </div>
                  <p className="mt-2">
                    Detecting document edges and applying perspective correction...
                  </p>
                  <small className="text-muted">
                    This may take a few seconds depending on image size
                  </small>
                </div>
              </>
            )}
            
            <div className="text-center mt-4">
              <Button 
                variant="outline-secondary" 
                onClick={() => {
                  setUploading(false);
                  setProcessing(false);
                  handleCancel();
                }}
                disabled={processingProgress > 80}
              >
                Cancel Processing
              </Button>
            </div>
          </Card.Body>
        </Card>
      )}

      {error && (
        <Alert variant="danger" className="shadow-sm">
          <Alert.Heading>
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            Processing Error
          </Alert.Heading>
          <p>{error}</p>
          <hr />
          <div className="d-flex justify-content-end">
            <Button variant="outline-danger" onClick={handleCancel} className="me-2">
              Start Over
            </Button>
            <Button variant="primary" onClick={handleRetry}>
              <i className="bi bi-arrow-clockwise me-2"></i>
              Try Again
            </Button>
          </div>
        </Alert>
      )}

      {result && (
        <Card className="shadow-sm">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h4 className="mb-0">
                <i className="bi bi-check-circle-fill text-success me-2"></i>
                Scan Complete
              </h4>
              <Button 
                variant="outline-primary" 
                size="sm"
                onClick={() => {
                  setResult(null);
                  setFiles([]);
                }}
              >
                <i className="bi bi-plus-circle me-1"></i>
                New Scan
              </Button>
            </div>
            
            <Row className="mb-4">
              <Col md={6}>
                <Card className="h-100">
                  <Card.Header className="bg-light">
                    <strong>Original Document</strong>
                  </Card.Header>
                  <Card.Body className="text-center">
                    {result.originalUrl ? (
                      <>
                        <ImagePreview file={result.originalUrl} isProcessed={false} />
                        <div className="mt-3">
                          <Button 
                            variant="outline-secondary" 
                            size="sm"
                            onClick={() => handleDownload(result.originalUrl, 'original-document.jpg')}
                          >
                            <i className="bi bi-download me-1"></i>
                            Download Original
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="py-5 text-muted">
                        <i className="bi bi-image" style={{ fontSize: '3rem' }}></i>
                        <p className="mt-2">No original image available</p>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6}>
                <Card className="h-100">
                  <Card.Header className="bg-light">
                    <strong className="text-success">Scanned Result</strong>
                    {result.warning && (
                      <span className="badge bg-warning text-dark ms-2">
                        <i className="bi bi-exclamation-triangle me-1"></i>
                        Warning
                      </span>
                    )}
                  </Card.Header>
                  <Card.Body className="text-center">
                    {result.processedUrl ? (
                      <>
                        <ImagePreview file={result.processedUrl} isProcessed={true} />
                        {result.warning && (
                          <Alert variant="warning" className="mt-3 small">
                            <i className="bi bi-info-circle me-2"></i>
                            {result.warning}
                          </Alert>
                        )}
                        <div className="mt-3">
                          <Button 
                            variant="success"
                            onClick={() => handleDownload(result.processedUrl, 'scanned-document.jpg')}
                          >
                            <i className="bi bi-download me-1"></i>
                            Download Scanned
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="py-5 text-muted">
                        <i className="bi bi-exclamation-circle" style={{ fontSize: '3rem' }}></i>
                        <p className="mt-2">No processed image available</p>
                        {result.warning && (
                          <Alert variant="warning" className="mt-3">
                            {result.warning}
                          </Alert>
                        )}
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
            
            <Card className="mb-3">
              <Card.Body className="py-2">
                <small className="text-muted">
                  <i className="bi bi-clock-history me-1"></i>
                  Processing time: {result.processingTime || 'N/A'}ms • 
                  Document ID: {result.id || 'N/A'} • 
                  Status: {result.success ? '✅ Success' : '⚠️ Warning'}
                </small>
              </Card.Body>
            </Card>
            
            <div className="d-flex justify-content-between">
              <div>
                <Button 
                  variant="outline-primary"
                  onClick={() => {
                    window.location.href = '/gallery';
                  }}
                >
                  <i className="bi bi-images me-1"></i>
                  View All Scans
                </Button>
              </div>
              <div>
                {result.processedUrl && (
                  <Button 
                    variant="outline-success"
                    className="me-2"
                    onClick={() => {
                      navigator.clipboard.writeText(result.processedUrl);
                      alert('Link copied to clipboard!');
                    }}
                  >
                    <i className="bi bi-link me-1"></i>
                    Copy Link
                  </Button>
                )}
                <Button 
                  variant="primary"
                  onClick={() => {
                    setResult(null);
                    setFiles([]);
                  }}
                >
                  <i className="bi bi-plus-circle me-1"></i>
                  Scan Another
                </Button>
              </div>
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}