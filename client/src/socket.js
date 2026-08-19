import { io } from 'socket.io-client';

export const initSocket = async () => {
    const options = {
        'force new connection': true,
        reconnection: true,
        reconnectionAttempts: Infinity, // was misspelled as reconnectionAttempt
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        transports: ['websocket'],
    };
    return io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', options);
};
