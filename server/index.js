const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { YSocketIO } = require('y-socket.io/dist/server');

dotenv.config();

const ACTIONS = require('./Actions');
const CodeSession = require('./models/CodeSession');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');

// ─── HTTP + Socket.IO server ───────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        // Only allow requests from the configured frontend origin
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
});

// ─── Yjs CRDT via y-socket.io ─────────────────────────────────────────────
// Creates a /yjs namespace on the Socket.IO server.
// Each room gets its own Y.Doc; clients sync edits without cursor jumping.
const ySocketIO = new YSocketIO(io);
ySocketIO.initialize();

// ─── Express middleware ────────────────────────────────────────────────────

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
}));

app.use(express.static('build'));
app.use(express.json());

// Rate-limiter for the save endpoint
const saveLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please slow down.' },
});

// ─── Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);

// Protected cloud-save endpoint
app.post('/api/save', saveLimiter, authMiddleware, async (req, res) => {
    const { roomId, code, language } = req.body;
    if (!roomId || typeof code !== 'string' || !language) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    try {
        let session = await CodeSession.findOne({ roomId });
        if (session) {
            session.code = code;
            session.language = language;
            session.versions.push({ code });
            await session.save();
        } else {
            session = await CodeSession.create({
                roomId,
                code,
                language,
                versions: [{ code }],
            });
        }
        res.status(200).json({ success: true, message: 'Code saved' });
    } catch (err) {
        console.error('Save error:', err);
        res.status(500).json({ success: false, error: 'Failed to save code' });
    }
});

// Serve React SPA for all non-API routes
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// ─── MongoDB ──────────────────────────────────────────────────────────────

mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

// Graceful shutdown
process.on('SIGTERM', async () => {
    await mongoose.disconnect();
    server.close(() => process.exit(0));
});

// ─── Socket.IO: room management ──────────────────────────────────────────

const userSocketMap = {}; // socketId → username

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => ({ socketId, username: userSocketMap[socketId] })
    );
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    // ── JOIN ────────────────────────────────────────────────────────────────
    socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        const clients = getAllConnectedClients(roomId);

        // Notify all members about the updated client list
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });

        // ── Persistent reconnection ──────────────────────────────────────────
        // Load the last-saved code & language from MongoDB.
        // - Language is always restored (Yjs doesn't track it).
        // - Code is only sent when the joining user is alone in the room
        //   (Yjs has nothing to sync from other peers). The client uses this
        //   to populate the Y.Doc on first load / after everyone left.
        try {
            const session = await CodeSession.findOne({ roomId });
            if (session) {
                const isOnlyClient = clients.length === 1;
                io.to(socket.id).emit(ACTIONS.RESTORE_SESSION, {
                    language: session.language,
                    code: isOnlyClient ? session.code : null,
                });
            }
        } catch (err) {
            console.error('Session restore error:', err);
        }
    });

    // ── Legacy code sync for new joiners (Yjs handles ongoing edits) ────────
    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code, language }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
        if (language) {
            io.to(socketId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
        }
    });

    // ── Chat ─────────────────────────────────────────────────────────────────
    socket.on(ACTIONS.SEND_MESSAGE, ({ roomId, message, username }) => {
        socket.in(roomId).emit(ACTIONS.RECEIVE_MESSAGE, { message, username });
    });

    // ── Code execution output sync ────────────────────────────────────────────
    socket.on(ACTIONS.SYNC_OUTPUT, ({ roomId, output, isRunning }) => {
        socket.in(roomId).emit(ACTIONS.SYNC_OUTPUT, { output, isRunning });
    });

    // ── Language change ───────────────────────────────────────────────────────
    socket.on(ACTIONS.LANGUAGE_CHANGE, ({ roomId, language }) => {
        socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
    });

    // ── Save & download trigger ───────────────────────────────────────────────
    socket.on(ACTIONS.SYNC_SAVE, ({ roomId }) => {
        socket.in(roomId).emit(ACTIONS.SYNC_SAVE, {});
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

// ─── Start ────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
