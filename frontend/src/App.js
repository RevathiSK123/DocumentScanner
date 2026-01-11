import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Container, Box } from '@mui/material';
import PrivateRoute from './components/PrivateRoute';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import Signup from './components/Signup';
import Upload from './components/Upload';
import Gallery from './components/Gallery';
import Navigation from './components/Navigation';
import DocumentScanner from './components/DocumentScanner'; // New component
import ProcessedDocuments from './components/ProcessedDocuments'; // New component

function App() {
  return (
    <Router>
      <AuthProvider>
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Navigation />
          <Container 
            maxWidth="xl" 
            sx={{ 
              mt: 2, 
              mb: 4,
              flex: 1
            }}
          >
            <Routes>
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/scanner" element={<PrivateRoute><DocumentScanner /></PrivateRoute>} />
              <Route path="/upload" element={<PrivateRoute><Upload /></PrivateRoute>} />
              <Route path="/gallery" element={<PrivateRoute><Gallery /></PrivateRoute>} />
              <Route path="/processed" element={<PrivateRoute><ProcessedDocuments /></PrivateRoute>} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Container>
        </Box>
      </AuthProvider>
    </Router>
  );
}

export default App;