import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!username || !email || !password) {
            setError('All fields are required');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        setLoading(true);
        try {
            await register(username, email, password);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Registration failed');
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
                <h2 className="authTitle">Create account</h2>
                <p className="authSubtitle">Join and start coding together</p>

                {error && <p className="authError">{error}</p>}

                <div className="authInputGroup">
                    <input
                        id="register-username"
                        type="text"
                        className="inputBox"
                        placeholder="Username (2–30 characters)"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyUp={handleKeyUp}
                        autoComplete="username"
                    />
                    <input
                        id="register-email"
                        type="email"
                        className="inputBox"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyUp={handleKeyUp}
                        autoComplete="email"
                    />
                    <input
                        id="register-password"
                        type="password"
                        className="inputBox"
                        placeholder="Password (min 6 characters)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyUp={handleKeyUp}
                        autoComplete="new-password"
                    />
                    <button
                        id="register-btn"
                        className="btn joinBtn"
                        onClick={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? 'Creating account…' : 'Create Account'}
                    </button>
                </div>

                <p className="authSwitchText">
                    Already have an account?{' '}
                    <Link to="/login" className="authLink">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default Register;
