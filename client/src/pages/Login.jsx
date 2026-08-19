import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email || !password) {
            setError('Email and password are required');
            return;
        }
        setLoading(true);
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyUp = (e) => {
        if (e.key === 'Enter') handleSubmit(e);
    };

    return (
        <div className="authPageWrapper">
            <div className="authFormWrapper">
                <img className="homePageLogo" src="/code-sync.png" alt="CodeWithPair" />
                <h2 className="authTitle">Welcome back</h2>
                <p className="authSubtitle">Sign in to continue coding together</p>

                {error && <p className="authError">{error}</p>}

                <div className="authInputGroup">
                    <input
                        id="login-email"
                        type="email"
                        className="inputBox"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyUp={handleKeyUp}
                        autoComplete="email"
                    />
                    <input
                        id="login-password"
                        type="password"
                        className="inputBox"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyUp={handleKeyUp}
                        autoComplete="current-password"
                    />
                    <button
                        id="login-btn"
                        className="btn joinBtn"
                        onClick={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </div>

                <p className="authSwitchText">
                    No account?{' '}
                    <Link to="/register" className="authLink">
                        Create one
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
