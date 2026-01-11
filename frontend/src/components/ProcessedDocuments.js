import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  LinearProgress,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  Delete,
  Download,
  Search,
  FilterList,
  Refresh,
  PictureAsPdf,
  TextFields
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

const ProcessedDocuments = () => {
  const { currentUser } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [deleteDialog, setDeleteDialog] = useState(null);

  useEffect(() => {
    if (currentUser) {
      fetchDocuments();
    }
  }, [currentUser]);

  const fetchDocuments = async () => {
    if (!currentUser) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const q = query(
        collection(db, 'documents'),
        where('userId', '==', currentUser.uid)
      );
      
      const querySnapshot = await getDocs(q);
      const docs = [];
      
      querySnapshot.forEach((doc) => {
        docs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort by timestamp (newest first)
      docs.sort((a, b) => {
        const timeA = a.processedAt?.toDate?.() || new Date(a.timestamp || 0);
        const timeB = b.processedAt?.toDate?.() || new Date(b.timestamp || 0);
        return timeB - timeA;
      });
      
      setDocuments(docs);
    } catch (err) {
      setError('Failed to load documents: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      await deleteDoc(doc(db, 'documents', docId));
      setDocuments(documents.filter(doc => doc.id !== docId));
      setDeleteDialog(null);
    } catch (err) {
      setError('Failed to delete document: ' + err.message);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = searchTerm === '' || 
      (doc.text && doc.text.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (doc.metadata?.type && doc.metadata.type.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = filterType === 'all' || 
      (doc.metadata?.type === filterType);
    
    return matchesSearch && matchesFilter;
  });

  const getDocumentStats = () => {
    const stats = {
      total: documents.length,
      enhanced: documents.filter(d => d.metadata?.type === 'enhanced_document').length,
      ocr: documents.filter(d => d.metadata?.type === 'ocr_result').length,
      pdf: documents.filter(d => d.metadata?.type === 'pdf').length
    };
    
    return stats;
  };

  const stats = getDocumentStats();

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading your documents...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        📁 Processed Documents
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats & Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6">{stats.total}</Typography>
              <Typography variant="caption" color="textSecondary">Total</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6">{stats.enhanced}</Typography>
              <Typography variant="caption" color="textSecondary">Enhanced</Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6">{stats.ocr}</Typography>
              <Typography variant="caption" color="textSecondary">OCR</Typography>
            </Box>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={fetchDocuments}
            >
              Refresh
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: <Search sx={{ mr: 1, color: 'action.active' }} />
            }}
            sx={{ flexGrow: 1, maxWidth: 300 }}
          />
          
          <Button
            variant={filterType === 'all' ? 'contained' : 'outlined'}
            onClick={() => setFilterType('all')}
            size="small"
          >
            All
          </Button>
          <Button
            variant={filterType === 'enhanced_document' ? 'contained' : 'outlined'}
            onClick={() => setFilterType('enhanced_document')}
            size="small"
            startIcon={<PictureAsPdf />}
          >
            Enhanced
          </Button>
          <Button
            variant={filterType === 'ocr_result' ? 'contained' : 'outlined'}
            onClick={() => setFilterType('ocr_result')}
            size="small"
            startIcon={<TextFields />}
          >
            OCR Results
          </Button>
        </Box>
      </Paper>

      {/* Documents Grid */}
      {filteredDocuments.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="textSecondary">
            {searchTerm || filterType !== 'all' 
              ? 'No documents match your search' 
              : 'No processed documents yet. Start by scanning some documents!'}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filteredDocuments.map((docItem) => (
            <Grid item xs={12} sm={6} md={4} key={docItem.id}>
              <Card>
                {docItem.image && (
                  <Box sx={{ height: 200, overflow: 'hidden' }}>
                    <img
                      src={docItem.image}
                      alt="Processed document"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  </Box>
                )}
                
                <CardContent>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    {docItem.metadata?.type?.replace('_', ' ').toUpperCase() || 'Document'}
                  </Typography>
                  
                  {docItem.text && (
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical'
                      }}
                    >
                      {docItem.text}
                    </Typography>
                  )}
                  
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      {docItem.processedAt?.toDate?.().toLocaleDateString() || 
                       new Date(docItem.timestamp).toLocaleDateString()}
                    </Typography>
                    
                    {docItem.metadata?.confidence && (
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          ml: 2,
                          color: docItem.metadata.confidence > 80 ? 'success.main' : 
                                 docItem.metadata.confidence > 60 ? 'warning.main' : 'error.main'
                        }}
                      >
                        {docItem.metadata.confidence.toFixed(1)}% confidence
                      </Typography>
                    )}
                  </Box>
                </CardContent>
                
                <CardActions>
                  {docItem.image && (
                    <Button
                      size="small"
                      startIcon={<Download />}
                      href={docItem.image}
                      download={`document_${docItem.id}.jpg`}
                    >
                      Download
                    </Button>
                  )}
                  
                  <IconButton 
                    size="small" 
                    onClick={() => setDeleteDialog(docItem.id)}
                    sx={{ ml: 'auto' }}
                    color="error"
                  >
                    <Delete />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>Delete Document</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this document? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button 
            onClick={() => handleDeleteDocument(deleteDialog)} 
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProcessedDocuments;