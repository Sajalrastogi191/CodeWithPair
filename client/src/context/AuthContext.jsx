import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);       // { id, username, email }
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);  // true while restoring from localStorage

    // Restore session from localStorage on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('cwp_token');
        const storedUser = localStorage.getItem('cwp_user');
        if (storedToken && storedUser) {
            try {
                setToken(storedToken);
                setUser(JSON.parse(storedUser));
            } catch {
                localStorage.removeItem('cwp_token');
                localStorage.removeItem('cwp_user');
            }
        }
        setLoading(false);
    }, []);

    const login = useCallback(async (email, password) => {
        const { data } = await axios.post(`${BACKEND}/api/auth/login`, { email, password });
        if (!data.success) throw new Error(data.error || 'Login failed');
        localStorage.setItem('cwp_token', data.token);
        localStorage.setItem('cwp_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        return data.user;
    }, []);

    const register = useCallback(async (username, email, password) => {
        const { data } = await axios.post(`${BACKEND}/api/auth/register`, {
            username,
            email,
            password,
        });
        if (!data.success) throw new Error(data.errors?.[0]?.msg || data.error || 'Registration failed');
        localStorage.setItem('cwp_token', data.token);
        localStorage.setItem('cwp_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        return data.user;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('cwp_token');
        localStorage.removeItem('cwp_user');
        setToken(null);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, loading, login, logout, register }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
};
