const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const generateToken = (user) =>
    jwt.sign(
        { id: user._id, username: user.username, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

// POST /api/auth/register
router.post(
    '/register',
    [
        body('username')
            .trim()
            .isLength({ min: 2, max: 30 })
            .withMessage('Username must be 2–30 characters'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { username, email, password } = req.body;
        try {
            const existing = await User.findOne({ $or: [{ email }, { username }] });
            if (existing) {
                const field = existing.email === email ? 'Email' : 'Username';
                return res.status(409).json({ success: false, error: `${field} already taken` });
            }

            const passwordHash = await bcrypt.hash(password, 12);
            const user = await User.create({ username, email, passwordHash });
            const token = generateToken(user);

            res.status(201).json({
                success: true,
                token,
                user: { id: user._id, username: user.username, email: user.email },
            });
        } catch (err) {
            console.error('Register error:', err);
            res.status(500).json({ success: false, error: 'Registration failed' });
        }
    }
);

// POST /api/auth/login
router.post(
    '/login',
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
        body('password').notEmpty().withMessage('Password required'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { email, password } = req.body;
        try {
            const user = await User.findOne({ email });
            if (!user) {
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }

            const isValid = await bcrypt.compare(password, user.passwordHash);
            if (!isValid) {
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }

            const token = generateToken(user);
            res.json({
                success: true,
                token,
                user: { id: user._id, username: user.username, email: user.email },
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ success: false, error: 'Login failed' });
        }
    }
);

module.exports = router;
