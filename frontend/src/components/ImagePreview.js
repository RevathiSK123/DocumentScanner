import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function ImagePreview({ file, isProcessed = false }) {
  const [imageSrc, setImageSrc] = useState('');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMockUrl, setIsMockUrl] = useState(false);
  const containerRef = useRef(null);
  const lastMousePosition = useRef({ x: 0, y: 0 });

  // Handle different file types
  useEffect(() => {
    console.log('ImagePreview received file:', file);
    console.log('File type:', typeof file);
    
    setLoading(true);
    setError('');
    setIsMockUrl(false);
    
    if (!file) {
      console.log('No file provided');
      setImageSrc('');
      setLoading(false);
      return;
    }

    // Check if it's a mock URL first
    if (typeof file === 'string' && (file.includes('mock-cdn.example.com') || file.includes('mock.example.com'))) {
      console.log('⚠️ Mock URL detected:', file);
      setIsMockUrl(true);
      setLoading(false);
      
      // Use a data URL for mock images
      const createMockImage = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        
        // Create gradient background
        const gradient = ctx.createLinearGradient(0, 0, 600, 400);
        gradient.addColorStop(0, '#f8f9fa');
        gradient.addColorStop(1, '#e9ecef');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);
        
        // Draw document border
        ctx.strokeStyle = isProcessed ? '#28a745' : '#007bff';
        ctx.lineWidth = 3;
        ctx.strokeRect(30, 30, 540, 340);
        
        // Draw document icon
        ctx.fillStyle = '#6c757d';
        ctx.font = 'bold 60px Arial';
        ctx.fillText('📄', 270, 140);
        
        // Draw text
        ctx.fillStyle = '#495057';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(isProcessed ? 'PROCESSED DOCUMENT' : 'ORIGINAL DOCUMENT', 300, 200);
        
        ctx.font = '16px Arial';
        ctx.fillStyle = '#6c757d';
        ctx.fillText('Development Mode Preview', 300, 230);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = '#adb5bd';
        ctx.fillText('In production, real images will be shown', 300, 260);
        
        // Draw mock URL info
        ctx.font = '12px monospace';
        ctx.fillStyle = '#868e96';
        ctx.textAlign = 'left';
        ctx.fillText('Mock URL: ' + file.substring(0, 50) + '...', 40, 350);
        
        return canvas.toDataURL('image/jpeg');
      };
      
      setImageSrc(createMockImage());
      return;
    }

    // Case 1: File object with preview
    if (file instanceof File) {
      console.log('File is a File object');
      if (file.preview) {
        console.log('Using file.preview');
        setImageSrc(file.preview);
        setLoading(false);
      } else {
        console.log('Creating preview from File');
        const reader = new FileReader();
        reader.onloadstart = () => {
          console.log('FileReader started');
        };
        reader.onload = (e) => {
          console.log('FileReader loaded successfully');
          setImageSrc(e.target.result);
          setLoading(false);
        };
        reader.onerror = (e) => {
          console.error('FileReader error:', e);
          setError('Failed to load image file');
          setLoading(false);
        };
        reader.readAsDataURL(file);
      }
    }
    // Case 2: URL string
    else if (typeof file === 'string') {
      console.log('File is a string (URL):', file);
      
      // Validate URL format
      if (file.startsWith('http://') || file.startsWith('https://') || 
          file.startsWith('data:image') || file.startsWith('blob:')) {
        console.log('Valid URL detected, loading...');
        
        // Preload image to check if it's valid
        const img = new Image();
        img.onload = () => {
          console.log('✅ Image loaded successfully from URL');
          setImageSrc(file);
          setLoading(false);
        };
        img.onerror = (e) => {
          console.error('❌ Failed to load image from URL:', file);
          
          // Create a fallback image
          const createFallbackImage = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 600;
            canvas.height = 400;
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = '#fff3cd';
            ctx.fillRect(0, 0, 600, 400);
            
            ctx.strokeStyle = '#ffc107';
            ctx.lineWidth = 2;
            ctx.strokeRect(20, 20, 560, 360);
            
            ctx.fillStyle = '#856404';
            ctx.font = 'bold 40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⚠️', 300, 120);
            
            ctx.font = 'bold 20px Arial';
            ctx.fillText('Image Load Failed', 300, 180);
            
            ctx.font = '14px Arial';
            ctx.fillStyle = '#856404';
            ctx.fillText('Could not load image from URL', 300, 220);
            
            ctx.font = '12px monospace';
            ctx.fillText(file.substring(0, 80) + (file.length > 80 ? '...' : ''), 300, 250);
            
            return canvas.toDataURL('image/jpeg');
          };
          
          setImageSrc(createFallbackImage());
          setError('Failed to load image from URL');
          setLoading(false);
        };
        
        img.src = file;
        
        // Timeout fallback
        const timeoutId = setTimeout(() => {
          if (loading) {
            console.log('⏰ Image loading timeout');
            if (!imageSrc) {
              const createTimeoutImage = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 600;
                canvas.height = 400;
                const ctx = canvas.getContext('2d');
                
                ctx.fillStyle = '#e2e3e5';
                ctx.fillRect(0, 0, 600, 400);
                
                ctx.fillStyle = '#383d41';
                ctx.font = 'bold 30px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('⏳ Loading Timeout', 300, 150);
                
                ctx.font = '14px Arial';
                ctx.fillText('Image took too long to load', 300, 200);
                ctx.fillText('Check your network connection', 300, 230);
                
                return canvas.toDataURL('image/jpeg');
              };
              
              setImageSrc(createTimeoutImage());
              setError('Image loading timeout');
            }
            setLoading(false);
          }
        }, 10000); // 10 second timeout
        
        return () => clearTimeout(timeoutId);
      } else {
        console.log('❌ Invalid URL format:', file);
        
        // Create error image
        const createErrorImage = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 600;
          canvas.height = 400;
          const ctx = canvas.getContext('2d');
          
          ctx.fillStyle = '#f8d7da';
          ctx.fillRect(0, 0, 600, 400);
          
          ctx.strokeStyle = '#721c24';
          ctx.lineWidth = 2;
          ctx.strokeRect(20, 20, 560, 360);
          
          ctx.fillStyle = '#721c24';
          ctx.font = 'bold 40px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('❌', 300, 120);
          
          ctx.font = 'bold 20px Arial';
          ctx.fillText('Invalid Image URL', 300, 180);
          
          ctx.font = '14px Arial';
          ctx.fillText('URL must start with http://, https://, or data:image', 300, 220);
          
          ctx.font = '12px monospace';
          ctx.fillText('Received: ' + file.substring(0, 100), 300, 260);
          
          return canvas.toDataURL('image/jpeg');
        };
        
        setImageSrc(createErrorImage());
        setError('Invalid image URL format');
        setLoading(false);
      }
    }
    // Case 3: Object with url or preview property
    else if (file && (file.url || file.preview)) {
      console.log('File is object with url/preview:', file);
      const src = file.url || file.preview;
      
      // Check if it's a mock URL
      if (src && typeof src === 'string' && src.includes('mock-cdn.example.com')) {
        setIsMockUrl(true);
      }
      
      setImageSrc(src);
      setLoading(false);
    }
    else {
      console.log('❌ Unsupported file type:', file);
      
      // Create unsupported type image
      const createUnsupportedImage = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, 600, 400);
        
        ctx.fillStyle = '#6c757d';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('📁', 300, 120);
        
        ctx.font = 'bold 20px Arial';
        ctx.fillText('Unsupported File Type', 300, 180);
        
        ctx.font = '14px Arial';
        ctx.fillText('Expected: File object or image URL', 300, 220);
        
        ctx.font = '12px monospace';
        ctx.fillText('Received type: ' + typeof file, 300, 260);
        
        return canvas.toDataURL('image/jpeg');
      };
      
      setImageSrc(createUnsupportedImage());
      setError('Unsupported file type');
      setLoading(false);
    }
  }, [file, isProcessed, imageSrc, loading]);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => {
      const newScale = prev + delta;
      return Math.max(0.5, Math.min(3, newScale));
    });
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 0) { // Left mouse button
      setIsDragging(true);
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
      e.preventDefault();
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - lastMousePosition.current.x;
    const deltaY = e.clientY - lastMousePosition.current.y;
    
    setPosition(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));
    
    lastMousePosition.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grab';
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseup', handleMouseUp);
      container.addEventListener('mouseleave', handleMouseUp);
      
      return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseup', handleMouseUp);
        container.removeEventListener('mouseleave', handleMouseUp);
      };
    }
  }, [handleWheel, handleMouseMove, handleMouseUp]);

  if (loading && !isMockUrl) {
    return (
      <div style={{
        border: '1px dashed #dee2e6',
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        height: '300px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2">Loading image preview...</p>
        <small className="text-muted mt-1">Please wait</small>
      </div>
    );
  }

  if (error && !imageSrc) {
    return (
      <div style={{
        border: '1px dashed #dc3545',
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center',
        backgroundColor: '#f8d7da',
        height: '300px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{ fontSize: '48px', color: '#dc3545' }}>❌</div>
        <p className="mt-2" style={{ color: '#721c24' }}>{error}</p>
        <small className="text-muted">
          Debug: {typeof file} | Preview: {!!(file && file.preview)}
        </small>
      </div>
    );
  }

  if (!imageSrc && !loading) {
    return (
      <div style={{
        border: '1px dashed #dee2e6',
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        height: '300px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{ fontSize: '48px', color: '#6c757d' }}>📄</div>
        <p className="mt-2">No image to display</p>
        <small className="text-muted">Select an image to see preview</small>
      </div>
    );
  }

  return (
    <div style={{
      border: isProcessed ? '2px solid #28a745' : '1px solid #dee2e6',
      borderRadius: '8px',
      backgroundColor: '#f8f9fa',
      position: 'relative',
      overflow: 'hidden',
      height: '400px',
      userSelect: 'none'
    }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          cursor: isDragging ? 'grabbing' : 'grab',
          position: 'relative',
          overflow: 'hidden'
        }}
        onMouseDown={handleMouseDown}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(${position.x}px, ${position.y}px) translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center',
            transition: isDragging ? 'none' : 'transform 0.1s ease'
          }}
        >
          <img
            src={imageSrc}
            alt="Document Preview"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'block',
              objectFit: 'contain'
            }}
            draggable="false"
            onError={(e) => {
              console.error('Image failed to load:', imageSrc);
              if (!isMockUrl) {
                setError('Image failed to load. Please check the URL.');
              }
            }}
          />
        </div>
      </div>

      {/* Zoom Controls */}
      <div style={{
        position: 'absolute',
        bottom: '15px',
        right: '15px',
        display: 'flex',
        gap: '8px',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        padding: '8px',
        borderRadius: '8px',
        backdropFilter: 'blur(4px)',
        zIndex: 10
      }}>
        <button
          onClick={handleZoomOut}
          disabled={scale <= 0.5}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: scale <= 0.5 ? '#495057' : '#6c757d',
            color: 'white',
            border: 'none',
            fontSize: '18px',
            fontWeight: 'bold',
            cursor: scale <= 0.5 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            opacity: scale <= 0.5 ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (scale > 0.5) e.currentTarget.style.background = '#5a6268';
          }}
          onMouseLeave={(e) => {
            if (scale > 0.5) e.currentTarget.style.background = '#6c757d';
          }}
        >
          −
        </button>
        
        <button
          onClick={handleReset}
          style={{
            minWidth: '70px',
            height: '36px',
            borderRadius: '18px',
            background: isMockUrl ? '#6c757d' : '#28a745',
            color: 'white',
            border: 'none',
            fontSize: '14px',
            cursor: 'pointer',
            padding: '0 12px',
            transition: 'all 0.2s',
            fontWeight: 'bold'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = isMockUrl ? '#5a6268' : '#218838'}
          onMouseLeave={(e) => e.currentTarget.style.background = isMockUrl ? '#6c757d' : '#28a745'}
        >
          {isMockUrl ? 'Mock' : `${Math.round(scale * 100)}%`}
        </button>
        
        <button
          onClick={handleZoomIn}
          disabled={scale >= 3}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: scale >= 3 ? '#495057' : '#007bff',
            color: 'white',
            border: 'none',
            fontSize: '18px',
            fontWeight: 'bold',
            cursor: scale >= 3 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            opacity: scale >= 3 ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (scale < 3) e.currentTarget.style.background = '#0069d9';
          }}
          onMouseLeave={(e) => {
            if (scale < 3) e.currentTarget.style.background = '#007bff';
          }}
        >
          +
        </button>
      </div>

      {/* Instructions */}
      <div style={{
        position: 'absolute',
        top: '15px',
        left: '15px',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        color: 'white',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        backdropFilter: 'blur(4px)',
        zIndex: 10
      }}>
        {isMockUrl ? '🛠️ Development Mode' : '🖱️ Scroll to zoom • Drag to pan'}
      </div>

      {/* Status Badge */}
      <div style={{
        position: 'absolute',
        top: '15px',
        right: '15px',
        backgroundColor: isMockUrl ? 'rgba(108, 117, 125, 0.9)' : 
                        isProcessed ? 'rgba(40, 167, 69, 0.9)' : 'rgba(0, 123, 255, 0.9)',
        color: 'white',
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        backdropFilter: 'blur(4px)',
        zIndex: 10
      }}>
        {isMockUrl ? '🛠️ Mock Preview' : 
         isProcessed ? '✅ Processed' : '📄 Original'}
      </div>

      {/* Mock URL Warning */}
      {isMockUrl && (
        <div style={{
          position: 'absolute',
          bottom: '60px',
          left: '15px',
          right: '15px',
          backgroundColor: 'rgba(255, 193, 7, 0.9)',
          color: '#856404',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          backdropFilter: 'blur(4px)',
          zIndex: 10,
          textAlign: 'center'
        }}>
          <strong>Development Mode:</strong> Using mock image preview. 
          In production, real images will be loaded from Firebase Storage.
        </div>
      )}
    </div>
  );
}