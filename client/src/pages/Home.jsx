import React, { useState } from 'react';
import { v4 as uuidV4 } from 'uuid';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Home = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [roomId, setRoomId] = useState('');

    const createNewRoom = (e) => {
        e.preventDefault();
        const id = uuidV4();
        setRoomId(id);
        toast.success('Created a new room');
    };

    const joinRoom = () => {
        if (!roomId) {
            toast.error('Room ID is required');
            return;
        }
        navigate(`/editor/${roomId}`);
    };

    const handleInputEnter = (e) => {
        if (e.code === 'Enter') joinRoom();
    };

    return (
        <div className="homePageWrapper">
            <div className="formWrapper">
                <img
                    className="homePageLogo"
                    src="/code-sync.png"
                    alt="code-sync-logo"
                />
                <p className="authSwitchText" style={{ marginBottom: '0.5rem' }}>
                    Signed in as <strong style={{ color: '#4aed88' }}>{user?.username}</strong>
                    {' — '}
                    <span
                        className="authLink"
                        onClick={logout}
                        style={{ cursor: 'pointer' }}
                    >
                        Sign out
                    </span>
                </p>
                <h4 className="mainLabel">Paste invitation ROOM ID</h4>
                <div className="inputGroup">
                    <input
                        id="room-id-input"
                        type="text"
                        className="inputBox"
                        placeholder="ROOM ID"
                        onChange={(e) => setRoomId(e.target.value)}
                        value={roomId}
                        onKeyUp={handleInputEnter}
                    />
                    <button id="join-btn" className="btn joinBtn" onClick={joinRoom}>
                        Join
                    </button>
                    <span className="createInfo">
                        If you don't have an invite then create&nbsp;
                        <a
                            id="create-room-link"
                            onClick={createNewRoom}
                            href=""
                            className="createNewBtn"
                        >
                            new room
                        </a>
                    </span>
                </div>
            </div>
            <footer />
        </div>
    );
};

export default Home;
