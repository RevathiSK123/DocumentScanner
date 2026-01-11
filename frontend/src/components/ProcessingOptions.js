import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Slider,
  Switch,
  Button,
  FormControlLabel,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Alert,
  Chip
} from '@mui/material';
import { 
  ExpandMore, 
  Tune,
  AutoFixHigh,
  Filter,
  AspectRatio,
  Rotate90DegreesCw,
  FormatColorReset
} from '@mui/icons-material';

const ProcessingOptions = ({ onProcess, disabled = false }) => {
  const [options, setOptions] = useState({
    grayscale: true,
    normalize: true,
    sharpen: true,
    threshold: 150,
    resize: 2000,
    quality: 80,
    rotate: 0
  });

  const handleOptionChange = (key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleProcess = () => {
    onProcess(options);
  };

  const handleReset = () => {
    setOptions({
      grayscale: true,
      normalize: true,
      sharpen: true,
      threshold: 150,
      resize: 2000,
      quality: 80,
      rotate: 0
    });
  };

  const presets = {
    'Document Scan': {
      grayscale: true,
      normalize: true,
      sharpen: true,
      threshold: 160,
      resize: 2500,
      quality: 90,
      rotate: 0
    },
    'Receipt Processing': {
      grayscale: false,
      normalize: true,
      sharpen: false,
      threshold: 180,
      resize: 1500,
      quality: 85,
      rotate: 0
    },
    'Text Enhancement': {
      grayscale: true,
      normalize: true,
      sharpen: true,
      threshold: 140,
      resize: 3000,
      quality: 95,
      rotate: 0
    }
  };

  const applyPreset = (presetName) => {
    setOptions(presets[presetName]);
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Accordion defaultExpanded={false}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tune />
            <Typography>Advanced Processing Options</Typography>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails>
          <Alert severity="info" sx={{ mb: 2 }}>
            Adjust these settings to optimize document scanning for different types of documents.
          </Alert>

          {/* Quick Presets */}
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            Quick Presets:
          </Typography>
          <Grid container spacing={1} sx={{ mb: 3 }}>
            {Object.keys(presets).map((preset) => (
              <Grid item key={preset}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => applyPreset(preset)}
                >
                  {preset}
                </Button>
              </Grid>
            ))}
            <Grid item>
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                onClick={handleReset}
              >
                Reset
              </Button>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Options Grid */}
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <FormatColorReset fontSize="small" />
                <Typography variant="body2">Grayscale</Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={options.grayscale}
                    onChange={(e) => handleOptionChange('grayscale', e.target.checked)}
                    size="small"
                  />
                }
                label="Convert to black and white"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AutoFixHigh fontSize="small" />
                <Typography variant="body2">Normalize</Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={options.normalize}
                    onChange={(e) => handleOptionChange('normalize', e.target.checked)}
                    size="small"
                  />
                }
                label="Auto contrast adjustment"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Filter fontSize="small" />
                <Typography variant="body2">Sharpen</Typography>
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={options.sharpen}
                    onChange={(e) => handleOptionChange('sharpen', e.target.checked)}
                    size="small"
                  />
                }
                label="Enhance edges"
              />
            </Grid>

            {/* Threshold Slider */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Tune fontSize="small" />
                <Typography variant="body2">Binarization Threshold</Typography>
                <Chip 
                  label={options.threshold} 
                  size="small" 
                  variant="outlined"
                />
              </Box>
              <Slider
                value={options.threshold}
                onChange={(e, value) => handleOptionChange('threshold', value)}
                min={0}
                max={255}
                step={5}
                marks={[
                  { value: 0, label: 'Dark' },
                  { value: 128, label: 'Medium' },
                  { value: 255, label: 'Light' }
                ]}
                valueLabelDisplay="auto"
                disabled={disabled}
              />
              <Typography variant="caption" color="textSecondary">
                Lower values keep more content, higher values remove noise
              </Typography>
            </Grid>

            {/* Resize Slider */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AspectRatio fontSize="small" />
                <Typography variant="body2">Maximum Width (pixels)</Typography>
                <Chip 
                  label={options.resize === 0 ? 'Original' : `${options.resize}px`} 
                  size="small" 
                  variant="outlined"
                />
              </Box>
              <Slider
                value={options.resize}
                onChange={(e, value) => handleOptionChange('resize', value)}
                min={0}
                max={4000}
                step={100}
                marks={[
                  { value: 0, label: 'Original' },
                  { value: 1000, label: '1K' },
                  { value: 2000, label: '2K' },
                  { value: 4000, label: '4K' }
                ]}
                valueLabelDisplay="auto"
                disabled={disabled}
              />
              <Typography variant="caption" color="textSecondary">
                0 = Keep original size. Smaller sizes process faster.
              </Typography>
            </Grid>

            {/* Quality Slider */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Tune fontSize="small" />
                <Typography variant="body2">JPEG Quality</Typography>
                <Chip 
                  label={`${options.quality}%`} 
                  size="small" 
                  variant="outlined"
                />
              </Box>
              <Slider
                value={options.quality}
                onChange={(e, value) => handleOptionChange('quality', value)}
                min={10}
                max={100}
                step={5}
                marks={[
                  { value: 10, label: 'Low' },
                  { value: 50, label: 'Medium' },
                  { value: 100, label: 'High' }
                ]}
                valueLabelDisplay="auto"
                disabled={disabled}
              />
              <Typography variant="caption" color="textSecondary">
                Higher quality = larger file size
              </Typography>
            </Grid>

            {/* Rotation */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Rotate90DegreesCw fontSize="small" />
                <Typography variant="body2">Rotation</Typography>
                <Chip 
                  label={`${options.rotate}°`} 
                  size="small" 
                  variant="outlined"
                />
              </Box>
              <Slider
                value={options.rotate}
                onChange={(e, value) => handleOptionChange('rotate', value)}
                min={0}
                max={360}
                step={90}
                marks={[
                  { value: 0, label: '0°' },
                  { value: 90, label: '90°' },
                  { value: 180, label: '180°' },
                  { value: 270, label: '270°' },
                  { value: 360, label: '360°' }
                ]}
                valueLabelDisplay="auto"
                disabled={disabled}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={disabled}
            >
              Reset to Defaults
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleProcess}
              disabled={disabled}
              startIcon={<Tune />}
            >
              Process All with These Settings
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
};

export default ProcessingOptions;