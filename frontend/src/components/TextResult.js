import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Alert
} from '@mui/material';
import {
  ContentCopy,
  Download,
  Edit,
  Save,
  Cancel,
  CheckCircle
} from '@mui/icons-material';

const TextResult = ({ text, confidence, imageUrl }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(text);
  const [copied, setCopied] = useState(false);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleDownloadText = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `extracted_text_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedText(text);
    setIsEditing(false);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6">Extracted Text</Typography>
          {confidence && (
            <Chip
              label={`Confidence: ${confidence.toFixed(1)}%`}
              color={confidence > 80 ? "success" : confidence > 60 ? "warning" : "error"}
              size="small"
            />
          )}
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!isEditing ? (
            <>
              <Tooltip title="Copy Text">
                <IconButton onClick={handleCopyText} size="small">
                  {copied ? <CheckCircle color="success" /> : <ContentCopy />}
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Download as TXT">
                <IconButton onClick={handleDownloadText} size="small">
                  <Download />
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Edit Text">
                <IconButton onClick={() => setIsEditing(true)} size="small">
                  <Edit />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip title="Save">
                <IconButton onClick={handleSaveEdit} color="primary" size="small">
                  <Save />
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Cancel">
                <IconButton onClick={handleCancelEdit} color="error" size="small">
                  <Cancel />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>

      {confidence && confidence < 60 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Low confidence detected. You may want to review the extracted text carefully.
        </Alert>
      )}

      {isEditing ? (
        <TextField
          fullWidth
          multiline
          rows={10}
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          variant="outlined"
          sx={{ mb: 2 }}
        />
      ) : (
        <Paper 
          sx={{ 
            p: 2, 
            bgcolor: '#fafafa',
            border: '1px solid #e0e0e0',
            borderRadius: 1,
            whiteSpace: 'pre-wrap',
            maxHeight: 400,
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}
        >
          {text || "No text extracted"}
        </Paper>
      )}

      {copied && (
        <Alert severity="success" sx={{ mt: 1 }}>
          Text copied to clipboard!
        </Alert>
      )}

      {imageUrl && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Source Image:
          </Typography>
          <Box
            component="img"
            src={imageUrl}
            alt="Source for text extraction"
            sx={{
              maxWidth: 300,
              maxHeight: 200,
              border: '1px solid #ddd',
              borderRadius: 1
            }}
          />
        </Box>
      )}
    </Box>
  );
};

export default TextResult;