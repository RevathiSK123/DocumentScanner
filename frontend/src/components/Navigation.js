import React from 'react';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navigation() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
      <Container>
        <Navbar.Brand as={Link} to="/">
          📄 DocScanner Pro
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          {currentUser ? (
            <>
              <Nav className="me-auto">
                <Nav.Link as={Link} to="/">
                  🏠 Dashboard
                </Nav.Link>
                <Nav.Link as={Link} to="/scanner">
                  📷 Document Scanner
                </Nav.Link>
                <Nav.Link as={Link} to="/upload">
                  📤 Upload
                </Nav.Link>
                <Nav.Link as={Link} to="/processed">
                  📁 Processed Docs
                </Nav.Link>
                <Nav.Link as={Link} to="/gallery">
                  🖼️ Gallery
                </Nav.Link>
              </Nav>
              <Nav>
                <Navbar.Text className="me-3">
                  Welcome, <span className="text-info fw-bold">
                    {currentUser.email?.split('@')[0] || currentUser.email}
                  </span>
                </Navbar.Text>
                <Button variant="outline-light" onClick={handleLogout}>
                  Logout
                </Button>
              </Nav>
            </>
          ) : (
            <Nav className="ms-auto">
              <Nav.Link as={Link} to="/login">
                🔐 Login
              </Nav.Link>
              <Nav.Link as={Link} to="/signup">
                📝 Sign Up
              </Nav.Link>
            </Nav>
          )}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}