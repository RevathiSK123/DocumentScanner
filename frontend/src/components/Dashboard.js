import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, ProgressBar, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDocumentStats } from '../services/documentService';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      loadStats();
    }
  }, [currentUser]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const statsData = await getDocumentStats(currentUser.uid);
      setStats(statsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4">Dashboard</h2>
      
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Quick Actions */}
      <Row className="mb-4">
        <Col md={4}>
          <Card className="text-center h-100 shadow-sm">
            <Card.Body>
              <i className="bi bi-cloud-upload" style={{ fontSize: '3rem', color: '#0d6efd' }}></i>
              <Card.Title className="mt-3">Upload Document</Card.Title>
              <Card.Text>
                Scan and perspective-correct documents
              </Card.Text>
              <Button as={Link} to="/upload" variant="primary">
                Start Scanning
              </Button>
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={4}>
          <Card className="text-center h-100 shadow-sm">
            <Card.Body>
              <i className="bi bi-images" style={{ fontSize: '3rem', color: '#198754' }}></i>
              <Card.Title className="mt-3">View Gallery</Card.Title>
              <Card.Text>
                Access your scanned documents
              </Card.Text>
              <Button as={Link} to="/gallery" variant="success">
                View Documents
              </Button>
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={4}>
          <Card className="text-center h-100 shadow-sm">
            <Card.Body>
              <i className="bi bi-info-circle" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
              <Card.Title className="mt-3">How to Use</Card.Title>
              <Card.Text>
                Upload images or PDFs for automatic document scanning
              </Card.Text>
              <Button variant="outline-secondary">
                Learn More
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Statistics */}
      {stats && (
        <Card className="mb-4 shadow-sm">
          <Card.Header>
            <h5 className="mb-0">📊 Document Statistics</h5>
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={3}>
                <div className="text-center">
                  <h1 className="display-4">{stats.total}</h1>
                  <p className="text-muted">Total Documents</p>
                </div>
              </Col>
              
              <Col md={3}>
                <div className="text-center">
                  <h1 className="display-4 text-success">{stats.processed}</h1>
                  <p className="text-muted">Successfully Processed</p>
                </div>
              </Col>
              
              <Col md={3}>
                <div className="text-center">
                  <h1 className="display-4 text-warning">{stats.warnings}</h1>
                  <p className="text-muted">With Warnings</p>
                </div>
              </Col>
              
              <Col md={3}>
                <div className="text-center">
                  <h1 className="display-4 text-danger">{stats.errors}</h1>
                  <p className="text-muted">Errors</p>
                </div>
              </Col>
            </Row>
            
            <div className="mt-4">
              <h6>Storage Usage</h6>
              <ProgressBar 
                now={(stats.totalSize / (10 * 1024 * 1024)) * 100} 
                label={`${(stats.totalSize / (1024 * 1024)).toFixed(2)} MB / 10 MB`}
                className="mb-3"
              />
              <small className="text-muted">
                {((stats.totalSize / (10 * 1024 * 1024)) * 100).toFixed(1)}% of free storage used
              </small>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Recent Activity */}
      <Card className="shadow-sm">
        <Card.Header>
          <h5 className="mb-0">🔄 Recent Activity</h5>
        </Card.Header>
        <Card.Body>
          <p className="text-muted">
            Your recent document scans will appear here.
          </p>
          <Button as={Link} to="/gallery" variant="outline-primary">
            View All Activity
          </Button>
        </Card.Body>
      </Card>
    </div>
  );
}