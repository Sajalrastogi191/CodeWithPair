import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import EditorPage from './pages/EditorPage';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';

function AppRoutes() {
    const { user, loading } = useAuth();

    if (loading) return null; // Avoid flash while restoring auth from localStorage

    return (
        <Routes>
            {/* Public routes */}
            <Route
                path="/login"
                element={user ? <Navigate to="/" replace /> : <Login />}
            />
            <Route
                path="/register"
                element={user ? <Navigate to="/" replace /> : <Register />}
            />

            {/* Protected routes */}
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Home />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/editor/:roomId"
                element={
                    <ProtectedRoute>
                        <EditorPage />
                    </ProtectedRoute>
                }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <div>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        success: { theme: { primary: '#4aed88' } },
                    }}
                />
            </div>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
