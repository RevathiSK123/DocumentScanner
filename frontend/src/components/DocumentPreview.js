import React, { useState } from 'react';
import { Box, Paper, Typography, IconButton } from '@mui/material';
import { ZoomIn, ZoomOut, Compare } from '@mui/icons-material';

const DocumentPreview = ({ imageUrl, beforeAfter }) => {
  const [zoom, setZoom] = useState(1);
  const [compareMode, setCompareMode] = useState(false);

  return (
    <Paper sx={{ position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ 
        width: '100%', 
        height: 200, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: '#f0f0f0',
        position: 'relative'
      }}>
        {compareMode && beforeAfter ? (
          <Box sx={{ display: 'flex', width: '100%', height: '100%' }}>
            <Box sx={{ flex: 1, borderRight: '2px dashed #000' }}>
              <img
                src={beforeAfter}
                alt="Original"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left'
                }}
              />
              <Typography variant="caption" sx={{ position: 'absolute', top: 5, left: 5 }}>
                Before
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <img
                src={imageUrl}
                alt="Processed"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top right'
                }}
              />
              <Typography variant="caption" sx={{ position: 'absolute', top: 5, right: 5 }}>
                After
              </Typography>
            </Box>
          </Box>
        ) : (
          <img
            src={imageUrl}
            alt="Document preview"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: `scale(${zoom})`,
              transition: 'transform 0.3s'
            }}
          />
        )}
      </Box>
      
      <Box sx={{ 
        position: 'absolute', 
        bottom: 8, 
        right: 8,
        display: 'flex',
        gap: 1,
        bgcolor: 'rgba(255,255,255,0.8)',
        borderRadius: 1,
        p: 0.5
      }}>
        {beforeAfter && (
          <IconButton 
            size="small" 
            onClick={() => setCompareMode(!compareMode)}
            color={compareMode ? "primary" : "default"}
          >
            <Compare fontSize="small" />
          </IconButton>
        )}
        <IconButton size="small" onClick={() => setZoom(zoom + 0.2)}>
          <ZoomIn fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}>
          <ZoomOut fontSize="small" />
        </IconButton>
      </Box>
    </Paper>
  );
};

export default DocumentPreview;