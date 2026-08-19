import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps a route and redirects to /login if the user is not authenticated.
 * Shows nothing while the auth state is loading from localStorage.
 */
const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) return null; // Prevent flash before localStorage is read
    if (!user) return <Navigate to="/login" replace />;
    return children;
};

export default ProtectedRoute;
