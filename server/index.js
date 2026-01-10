const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./Actions');

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

const CodeSession = require('./models/CodeSession');

app.use(express.static('build'));
app.use(express.json()); // Body parser

app.post('/api/save', async (req, res) => {
    const { roomId, code, language } = req.body;
    try {
        let session = await CodeSession.findOne({ roomId });
        if (session) {
            session.code = code;
            session.language = language;
            session.versions.push({ code });
            await session.save();
        } else {
            session = await CodeSession.create({ roomId, code, language, versions: [{ code }] });
        }
        res.status(200).json({ success: true, message: 'Code saved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to save code' });
    }
});

app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

const userSocketMap = {};
function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SEND_MESSAGE, ({ roomId, message, username }) => {
        socket.in(roomId).emit(ACTIONS.RECEIVE_MESSAGE, { message, username });
    });

    socket.on(ACTIONS.CURSOR_CHANGE, ({ roomId, cursor }) => {
        socket.in(roomId).emit(ACTIONS.CURSOR_CHANGE, {
            cursor,
            socketId: socket.id,
            username: userSocketMap[socket.id]
        });
    });

    socket.on(ACTIONS.SYNC_OUTPUT, ({ roomId, output, isRunning }) => {
        socket.in(roomId).emit(ACTIONS.SYNC_OUTPUT, { output, isRunning });
    });

    socket.on(ACTIONS.LANGUAGE_CHANGE, ({ roomId, language }) => {
        socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
    });

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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
