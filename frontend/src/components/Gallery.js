import React, { useState, useEffect } from 'react';
import { Card, Button, Row, Col, Spinner, Alert, Modal, Badge } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { 
  getUserDocuments, 
  deleteDocument, 
  updateDocument
} from '../services/documentService';
import { 
  testFunction,  // Use the Firebase Callable Function
  enhanceDocument,
  extractText,
  healthCheck
} from '../firebase';  // Import from your firebase.js

export default function Gallery() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [processing, setProcessing] = useState({});
  const [firebaseStatus, setFirebaseStatus] = useState('checking');
  const [connectionDetails, setConnectionDetails] = useState(null);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      loadDocuments();
      checkFirebaseConnection();
    }
  }, [currentUser]);

  // Check Firebase connection PROPERLY
  const checkFirebaseConnection = async () => {
    try {
      setFirebaseStatus('checking');
      console.log('🔄 Testing Firebase connection...');
      
      // OPTION 1: Try Callable Function (recommended)
      try {
        const result = await testFunction({ 
          test: 'gallery-connection', 
          timestamp: Date.now(),
          userId: currentUser?.uid 
        });
        
        setFirebaseStatus('connected');
        setConnectionDetails({
          type: 'callable',
          data: result.data,
          message: 'Callable Functions working'
        });
        console.log('✅ Firebase testFunction success:', result.data);
        return;
      } catch (callableError) {
        console.warn('Callable function failed, trying HTTP...', callableError);
      }
      
      // OPTION 2: Try HTTP endpoint as fallback
      try {
        const response = await fetch('https://us-central1-documentscanner-585c9.cloudfunctions.net/healthCheck', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setFirebaseStatus('connected');
          setConnectionDetails({
            type: 'http',
            data: data,
            message: 'HTTP endpoint working'
          });
          console.log('✅ Firebase healthCheck success:', data);
          return;
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (httpError) {
        console.warn('HTTP endpoint failed:', httpError);
      }
      
      // OPTION 3: Try direct test endpoint (not recommended but works)
      try {
        const response = await fetch('https://us-central1-documentscanner-585c9.cloudfunctions.net/testFunction', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ test: 'direct' })
        });
        
        if (response.ok) {
          const data = await response.json();
          setFirebaseStatus('connected');
          setConnectionDetails({
            type: 'direct',
            data: data,
            message: 'Direct HTTP call working'
          });
          console.log('✅ Direct HTTP call success:', data);
          return;
        }
      } catch (directError) {
        console.warn('Direct call failed:', directError);
      }
      
      // All methods failed
      setFirebaseStatus('failed');
      setConnectionDetails({
        message: 'All connection attempts failed',
        suggestion: 'Check if functions are deployed and CORS is enabled'
      });
      console.error('❌ All Firebase connection attempts failed');
      
    } catch (error) {
      console.error('Connection check error:', error);
      setFirebaseStatus('error');
      setError(`Connection error: ${error.message}`);
    }
  };

  // Load documents from Firestore
  const loadDocuments = async () => {
    if (!currentUser) {
      console.log('Gallery: No currentUser, cannot load documents');
      return;
    }
    try {
      setLoading(true);
      setError('');
      console.log('Gallery: Loading documents for user', currentUser.uid);
      const docs = await getUserDocuments();
      console.log('Gallery: Documents fetched from Firestore:', docs);
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading documents:', err);
      if (err.message?.includes('index') || err.code === 'failed-precondition') {
        setError('Database index is being created. Please wait 2-5 minutes and refresh.');
        setDocuments(getMockDocuments());
      } else {
        setError(`Failed to load documents: ${err.message}`);
        setDocuments(getMockDocuments());
      }
    } finally {
      setLoading(false);
    }
  };

  // Mock data for testing
  const getMockDocuments = () => {
    return [
      {
        id: 'mock1',
        filename: 'Sample Document 1',
        originalUrl: 'https://picsum.photos/300/200',
        processedUrl: 'https://picsum.photos/300/200',
        status: 'processed',
        uploadedAt: new Date(),
        fileType: 'image/jpeg',
        fileSize: 1024000,
        userId: currentUser?.uid || 'mock-user'
      },
      {
        id: 'mock2',
        filename: 'Document Scan 2',
        originalUrl: 'https://picsum.photos/300/201',
        processedUrl: null,
        status: 'uploaded',
        uploadedAt: new Date(Date.now() - 86400000),
        fileType: 'image/png',
        fileSize: 2048000,
        userId: currentUser?.uid || 'mock-user'
      }
    ];
  };

  // Delete document
  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      setDeleting(docId);
      await deleteDocument(docId);
      setDocuments(documents.filter(doc => doc.id !== docId));
      if (selectedDoc?.id === docId) {
        setShowModal(false);
      }
    } catch (err) {
      alert('Failed to delete document: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleViewDetails = (doc) => {
    setSelectedDoc(doc);
    setShowModal(true);
  };

  // Process document with Firebase Callable Function
  const handleProcessWithFirebase = async (doc) => {
    if (!doc.originalUrl) {
      alert('No original URL found for processing');
      return;
    }

    if (firebaseStatus !== 'connected') {
      const shouldContinue = window.confirm(
        'Firebase connection not verified. Process anyway? (It may fail)'
      );
      if (!shouldContinue) {
        await checkFirebaseConnection();
        return;
      }
    }

    try {
      setProcessing(prev => ({ ...prev, [doc.id]: true }));
      console.log('Starting Firebase processing for:', doc.id);
      // Convert Data URL to base64 if needed
      let imageBase64 = doc.originalUrl;
      if (doc.originalUrl.startsWith('data:')) {
        imageBase64 = doc.originalUrl.split(',')[1];
      }
      // Call Firebase Callable Function
      const result = await enhanceDocument({
        image: imageBase64,
        options: {
          grayscale: true,
          normalize: true,
          sharpen: true,
          threshold: 150,
          resize: 2000,
          quality: 80
        }
      });
      if (result.data && result.data.processedImage) {
        // Convert base64 back to Data URL
        const processedUrl = `data:image/jpeg;base64,${result.data.processedImage}`;
        // Update document in Firestore
        await updateDocument(doc.id, {
          processedUrl: processedUrl,
          status: 'processed',
          processedAt: new Date().toISOString(),
          metadata: {
            originalSize: result.data.originalSize,
            processedSize: result.data.processedSize,
            ...result.data.metadata
          }
        });
        // Refresh documents after processing
        await loadDocuments();
        // Update selected doc if open
        if (selectedDoc?.id === doc.id) {
          setSelectedDoc(prev => ({
            ...prev,
            processedUrl: processedUrl,
            status: 'processed'
          }));
        }
        alert('✅ Document processed successfully!');
      } else {
        throw new Error('No processed image returned');
      }
    } catch (error) {
      console.error('Processing failed:', error);
      alert(`❌ Processing failed: ${error.message || 'Unknown error'}`);
      
      // Update status to error
      try {
        await updateDocument(doc.id, {
          status: 'error',
          error: error.message,
          processedAt: new Date().toISOString()
        });
      } catch (updateErr) {
        console.error('Failed to update error status:', updateErr);
      }
    } finally {
      setProcessing(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  // Extract text from document
  const handleExtractText = async (doc) => {
    if (!doc.originalUrl) {
      alert('No document to extract text from');
      return;
    }

    try {
      setProcessing(prev => ({ ...prev, [`text-${doc.id}`]: true }));
      
      console.log('Extracting text from:', doc.id);
      
      // Convert Data URL to base64 if needed
      let imageBase64 = doc.originalUrl;
      if (doc.originalUrl.startsWith('data:')) {
        imageBase64 = doc.originalUrl.split(',')[1];
      }
      
      // Call Firebase Callable Function
      const result = await extractText({
        image: imageBase64,
        options: {
          language: 'eng',
          presets: 'document'
        }
      });
      
      if (result.data && result.data.text) {
        alert(`📝 Extracted Text:\n\n${result.data.text}\n\nConfidence: ${(result.data.confidence * 100).toFixed(1)}%`);
      } else {
        alert('No text found in the document');
      }
      
    } catch (error) {
      console.error('Text extraction failed:', error);
      alert(`❌ Text extraction failed: ${error.message}`);
    } finally {
      setProcessing(prev => ({ ...prev, [`text-${doc.id}`]: false }));
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'processed':
        return <Badge bg="success">Processed</Badge>;
      case 'uploaded':
        return <Badge bg="primary">Uploaded</Badge>;
      case 'processing':
        return <Badge bg="warning">Processing</Badge>;
      case 'error':
        return <Badge bg="danger">Error</Badge>;
      default:
        return <Badge bg="secondary">{status || 'Unknown'}</Badge>;
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFirebaseStatusConfig = () => {
    switch (firebaseStatus) {
      case 'connected':
        return {
          variant: 'success',
          icon: 'bi-check-circle-fill',
          text: '✅ Firebase Connected',
          message: connectionDetails?.message || 'Cloud Functions are working'
        };
      case 'failed':
        return {
          variant: 'danger',
          icon: 'bi-x-circle-fill',
          text: '❌ Connection Failed',
          message: 'Cannot connect to Firebase Functions'
        };
      case 'error':
        return {
          variant: 'danger',
          icon: 'bi-exclamation-triangle-fill',
          text: '⚠️ Connection Error',
          message: error || 'Unknown error'
        };
      case 'checking':
        return {
          variant: 'warning',
          icon: 'bi-hourglass-split',
          text: '🔄 Checking Connection...',
          message: 'Testing Firebase Functions'
        };
      default:
        return {
          variant: 'secondary',
          icon: 'bi-question-circle',
          text: '🔗 Connection Status',
          message: 'Click Test Connection'
        };
    }
  };

  if (loading && documents.length === 0) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
        <p className="mt-2">Loading your documents...</p>
      </div>
    );
  }

  const statusConfig = getFirebaseStatusConfig();

  return (
    <div>
      {/* Firebase Status */}
      <Alert variant={statusConfig.variant} className="mb-4">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <i className={`bi ${statusConfig.icon} me-2`}></i>
            <strong>{statusConfig.text}</strong>
            <div className="mt-1 small">
              {statusConfig.message}
              {firebaseStatus === 'failed' && (
                <div className="mt-2">
                  <code className="bg-dark text-white p-1 rounded">
                    https://us-central1-documentscanner-585c9.cloudfunctions.net
                  </code>
                  <div className="mt-2">
                    <Button 
                      variant="outline-danger" 
                      size="sm"
                      onClick={() => window.open('https://console.firebase.google.com/project/documentscanner-585c9/functions', '_blank')}
                      className="me-2"
                    >
                      <i className="bi bi-server"></i> View Functions
                    </Button>
                    <Button 
                      variant="outline-secondary" 
                      size="sm"
                      onClick={checkFirebaseConnection}
                    >
                      <i className="bi bi-arrow-clockwise"></i> Test Again
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <Button 
            variant="outline-secondary" 
            size="sm"
            onClick={checkFirebaseConnection}
            disabled={firebaseStatus === 'checking'}
          >
            {firebaseStatus === 'checking' ? (
              <>
                <Spinner animation="border" size="sm" className="me-1" />
                Testing...
              </>
            ) : (
              <>
                <i className="bi bi-arrow-clockwise"></i> Test Connection
              </>
            )}
          </Button>
        </div>
      </Alert>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>My Documents</h2>
        <div className="d-flex gap-2">
          <Button 
            variant="outline-primary" 
            onClick={loadDocuments}
            disabled={loading}
          >
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </Button>
          <Button 
            variant="primary" 
            onClick={() => window.location.href = '/upload'}
          >
            <i className="bi bi-upload"></i> Upload
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mb-4" onClose={() => setError('')} dismissible>
          <Alert.Heading>Error Loading Documents</Alert.Heading>
          <p>{error}</p>
        </Alert>
      )}

      {documents.length === 0 ? (
        <Card className="text-center py-5">
          <Card.Body>
            <i className="bi bi-folder-x" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
            <h5 className="mt-3">No documents yet</h5>
            <p className="text-muted">Upload your first document to get started</p>
            <Button 
              variant="primary" 
              onClick={() => window.location.href = '/upload'}
            >
              Upload Document
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <>
          <div className="mb-3">
            <p className="mb-0">
              Showing {documents.length} document{documents.length !== 1 ? 's' : ''}
              <span className="ms-3">
                <Badge bg="success" className="me-2">
                  {documents.filter(d => d.status === 'processed').length} Processed
                </Badge>
                <Badge bg="warning" className="me-2">
                  {documents.filter(d => d.status === 'uploaded' || d.status === 'processing').length} Pending
                </Badge>
              </span>
            </p>
          </div>

          <Row>
            {documents.map((doc) => (
              <Col key={doc.id} md={6} lg={4} className="mb-4">
                <Card className="h-100 shadow-sm">
                  <div style={{ height: '200px', overflow: 'hidden', position: 'relative' }}>
                    {doc.processedUrl ? (
                      <img 
                        src={doc.processedUrl} 
                        alt="Processed document"
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          objectFit: 'cover' 
                        }}
                      />
                    ) : doc.originalUrl ? (
                      <div style={{ position: 'relative' }}>
                        <img 
                          src={doc.originalUrl} 
                          alt="Original document"
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover',
                            opacity: 0.8
                          }}
                        />
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(0,0,0,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white'
                        }}>
                          <Badge bg="warning" className="p-2">
                            Needs Processing
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="d-flex align-items-center justify-content-center h-100 bg-light">
                        <i className="bi bi-file-earmark-text" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
                      </div>
                    )}
                  </div>
                  
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div>
                        {getStatusBadge(doc.status)}
                      </div>
                      <small className="text-muted">
                        {formatDate(doc.uploadedAt)}
                      </small>
                    </div>
                    
                    <Card.Title className="text-truncate" title={doc.filename}>
                      {doc.filename}
                    </Card.Title>
                    
                    <Card.Text className="mb-0">
                      <small className="text-muted d-block">
                        <i className="bi bi-filetype-jpg me-1"></i>
                        {doc.fileType || 'Unknown'}
                      </small>
                      <small className="text-muted d-block">
                        <i className="bi bi-hdd me-1"></i>
                        {formatFileSize(doc.fileSize)}
                      </small>
                    </Card.Text>
                  </Card.Body>
                  
                  <Card.Footer className="bg-white border-top-0">
                    <div className="d-flex justify-content-between mb-2">
                      <Button 
                        variant="outline-primary" 
                        size="sm"
                        onClick={() => handleViewDetails(doc)}
                      >
                        <i className="bi bi-eye me-1"></i>
                        View
                      </Button>
                      
                      {(doc.processedUrl || doc.originalUrl) && (
                        <Button 
                          variant="outline-success" 
                          size="sm"
                          href={doc.processedUrl || doc.originalUrl}
                          target="_blank"
                          download={doc.filename}
                        >
                          <i className="bi bi-download me-1"></i>
                          Download
                        </Button>
                      )}
                      
                      <Button 
                        variant="outline-danger" 
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deleting === doc.id}
                      >
                        {deleting === doc.id ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          <>
                            <i className="bi bi-trash me-1"></i>
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="d-grid gap-1">
                      {(!doc.processedUrl || doc.status === 'uploaded') && (
                        <Button 
                          variant="warning"
                          size="sm"
                          onClick={() => handleProcessWithFirebase(doc)}
                          disabled={processing[doc.id]}
                        >
                          {processing[doc.id] ? (
                            <>
                              <Spinner animation="border" size="sm" className="me-2" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-magic me-1"></i>
                              Enhance Document
                            </>
                          )}
                        </Button>
                      )}
                      
                      {(doc.processedUrl || doc.originalUrl) && (
                        <Button 
                          variant="info"
                          size="sm"
                          onClick={() => handleExtractText(doc)}
                          disabled={processing[`text-${doc.id}`]}
                        >
                          {processing[`text-${doc.id}`] ? (
                            <>
                              <Spinner animation="border" size="sm" className="me-2" />
                              Extracting...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-text-paragraph me-1"></i>
                              Extract Text
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </Card.Footer>
                </Card>
              </Col>
            ))}
          </Row>
        </>
      )}

      {/* Details Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Document Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedDoc && (
            <div>
              <Row className="mb-4">
                <Col md={6}>
                  <h6>Original</h6>
                  {selectedDoc.originalUrl && (
                    <div>
                      <img 
                        src={selectedDoc.originalUrl} 
                        alt="Original" 
                        className="img-fluid rounded border"
                        style={{ maxHeight: '250px', objectFit: 'contain' }}
                      />
                    </div>
                  )}
                </Col>
                <Col md={6}>
                  <h6>Processed</h6>
                  {selectedDoc.processedUrl ? (
                    <img 
                      src={selectedDoc.processedUrl} 
                      alt="Processed" 
                      className="img-fluid rounded border"
                      style={{ maxHeight: '250px', objectFit: 'contain' }}
                    />
                  ) : (
                    <div className="text-center py-4 border rounded bg-light">
                      <i className="bi bi-hourglass-top" style={{ fontSize: '2rem', color: '#ffc107' }}></i>
                      <p className="mt-2 mb-3">Not processed yet</p>
                      <Button 
                        variant="warning"
                        onClick={() => handleProcessWithFirebase(selectedDoc)}
                        disabled={processing[selectedDoc.id]}
                      >
                        {processing[selectedDoc.id] ? (
                          <>
                            <Spinner animation="border" size="sm" className="me-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-magic me-1"></i>
                            Process Now
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </Col>
              </Row>
              
              <div className="row">
                <Col md={6}>
                  <h6>Document Info</h6>
                  <table className="table table-sm table-borderless">
                    <tbody>
                      <tr>
                        <th width="120">Filename:</th>
                        <td>{selectedDoc.filename}</td>
                      </tr>
                      <tr>
                        <th>Type:</th>
                        <td>{selectedDoc.fileType}</td>
                      </tr>
                      <tr>
                        <th>Size:</th>
                        <td>{formatFileSize(selectedDoc.fileSize)}</td>
                      </tr>
                      <tr>
                        <th>Status:</th>
                        <td>{getStatusBadge(selectedDoc.status)}</td>
                      </tr>
                      <tr>
                        <th>Uploaded:</th>
                        <td>{formatDate(selectedDoc.uploadedAt)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Col>
                
                <Col md={6}>
                  <h6>Actions</h6>
                  <div className="d-flex flex-column gap-2">
                    {selectedDoc.originalUrl && (
                      <Button 
                        variant="outline-primary"
                        href={selectedDoc.originalUrl}
                        target="_blank"
                        download={selectedDoc.filename}
                      >
                        <i className="bi bi-download me-1"></i>
                        Download Original
                      </Button>
                    )}
                    
                    {selectedDoc.processedUrl && (
                      <Button 
                        variant="outline-success"
                        href={selectedDoc.processedUrl}
                        target="_blank"
                        download={`processed_${selectedDoc.filename}`}
                      >
                        <i className="bi bi-download me-1"></i>
                        Download Processed
                      </Button>
                    )}
                    
                    <Button 
                      variant="outline-info"
                      onClick={() => handleExtractText(selectedDoc)}
                      disabled={processing[`text-${selectedDoc.id}`]}
                    >
                      <i className="bi bi-text-paragraph me-1"></i>
                      Extract Text
                    </Button>
                  </div>
                </Col>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}