import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner, Container } from 'react-bootstrap';

export default function PrivateRoute({ children }) {
  const { currentUser } = useAuth();

  // You could add a loading state here if needed
  // if (loading) {
  //   return (
  //     <Container className="text-center mt-5">
  //       <Spinner animation="border" />
  //       <p className="mt-2">Loading...</p>
  //     </Container>
  //   );
  // }

  return currentUser ? children : <Navigate to="/login" />;
}