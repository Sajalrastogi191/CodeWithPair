import React, { useState, useEffect, useRef } from 'react';
import ACTIONS from '../Actions';

const Chat = ({ socketRef, roomId, username }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!socketRef.current) return;

        const handleReceiveMessage = ({ message, username: sender }) => {
            setMessages((prev) => [...prev, { message, username: sender }]);
        };

        socketRef.current.on(ACTIONS.RECEIVE_MESSAGE, handleReceiveMessage);

        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.RECEIVE_MESSAGE, handleReceiveMessage);
            }
        };
    }, [socketRef.current]);

    const sendMessage = () => {
        if (!input.trim()) return;

        socketRef.current.emit(ACTIONS.SEND_MESSAGE, {
            roomId,
            message: input,
            username,
        });

        setMessages((prev) => [...prev, { message: input, username: 'You' }]);
        setInput('');
    };

    const handleEnter = (e) => {
        if (e.key === 'Enter') sendMessage();
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="chatContainer">
            <div className="messagesList">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.username === 'You' ? 'myMessage' : ''}`}>
                        <span className="msgAuthor">{msg.username}</span>: {msg.message}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="chatInputWrap">
                <input
                    type="text"
                    className="chatInput"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyUp={handleEnter}
                    placeholder="Type a message..."
                />
                <button className="btn chatSendBtn" onClick={sendMessage}>Send</button>
            </div>
        </div>
    );
};

export default Chat;
