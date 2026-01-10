import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import CodeEditor from '../components/Editor';
import Chat from '../components/Chat';
import { initSocket } from '../socket';
import {
    useLocation,
    useNavigate,
    Navigate,
    useParams,
} from 'react-router-dom';
import axios from 'axios';

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [language, setLanguage] = useState('javascript');
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [readOnly, setReadOnly] = useState(false);
    const [showOnlineDropdown, setShowOnlineDropdown] = useState(false);
    const onlineDropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (onlineDropdownRef.current && !onlineDropdownRef.current.contains(event.target)) {
                setShowOnlineDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();
            socketRef.current.on('connect_error', (err) => handleErrors(err));
            socketRef.current.on('connect_failed', (err) => handleErrors(err));

            function handleErrors(e) {
                console.log('socket error', e);
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            }

            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            // Listening for joined event
            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                        console.log(`${username} joined`);
                    }
                    setClients(clients);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                        language // Sync language too
                    });
                }
            );

            // Listening for disconnected
            socketRef.current.on(
                ACTIONS.DISCONNECTED,
                ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) => {
                        return prev.filter(
                            (client) => client.socketId !== socketId
                        );
                    });
                }
            );
        };
        init();
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current.off(ACTIONS.JOINED);
                socketRef.current.off(ACTIONS.DISCONNECTED);
            }
        };
    }, []);

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to your clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    const saveCode = async () => {
        // Download file logic
        try {
            const blob = new Blob([codeRef.current], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            let extension = '.js';
            if (language === 'python') extension = '.py';
            else if (language === 'c++' || language === 'cpp') extension = '.cpp';
            else if (language === 'java') extension = '.java';

            link.download = `code-${roomId}${extension}`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast.success('File downloaded');
        } catch (e) {
            console.error("Download failed", e);
            toast.error("Could not download file");
        }

        // Cloud save
        try {
            await axios.post(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/save`, {
                roomId,
                code: codeRef.current,
                language
            });
            toast.success('Code saved to cloud');
        } catch (error) {
            toast.error('Failed to save to cloud');
            console.error(error);
        }
    };

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.SYNC_OUTPUT, ({ output, isRunning }) => {
                if (output !== undefined) setOutput(output);
                if (isRunning !== undefined) setIsRunning(isRunning);
            });

            socketRef.current.on(ACTIONS.LANGUAGE_CHANGE, ({ language }) => {
                setLanguage(language);
            });
        }
        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.SYNC_OUTPUT);
                socketRef.current.off(ACTIONS.LANGUAGE_CHANGE);
            }
        }
    }, [socketRef.current]);

    const handleLanguageChange = (e) => {
        const lang = e.target.value;
        setLanguage(lang);
        if (socketRef.current) {
            socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: lang });
        }
    };

    const runCode = async () => {
        setIsRunning(true);
        if (socketRef.current) {
            socketRef.current.emit(ACTIONS.SYNC_OUTPUT, { roomId, isRunning: true });
        }

        try {
            // Using Piston API (public) or Judge0 (needs key usually, but there are public instances)
            // For stability in this demo, I'll use Piston which is free and public.
            // Language versions: javascript(18.15.0), python(3.10.0), cpp(10.2.0)

            const sourceCode = codeRef.current;
            const response = await axios.post('https://emkc.org/api/v2/piston/execute', {
                language: language,
                version: language === 'javascript' ? '18.15.0' : language === 'python' ? '3.10.0' : '10.2.0',
                files: [
                    {
                        content: sourceCode
                    }
                ]
            });

            const { run: { output, stderr, stdout } } = response.data;
            setOutput(output);

            if (socketRef.current) {
                socketRef.current.emit(ACTIONS.SYNC_OUTPUT, { roomId, isRunning: false, output });
            }

            if (stderr) {
                toast.error('Execution Error');
            } else {
                toast.success('Code Ran Successfully');
            }

        } catch (error) {
            console.error(error);
            toast.error('Failed to run code');
            const errOutput = 'Error running code';
            setOutput(errOutput);
            if (socketRef.current) {
                socketRef.current.emit(ACTIONS.SYNC_OUTPUT, { roomId, isRunning: false, output: errOutput });
            }
        } finally {
            setIsRunning(false);
            // Redundant if we emitted above, but safe local reset
        }
    }

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img
                            className="logoImage"
                            src="/code-sync.png"
                            alt="logo"
                        />
                    </div>
                    <h3>Connected</h3>
                    <Chat socketRef={socketRef} roomId={roomId} username={location.state?.username} />
                </div>
                <button className="btn copyBtn" onClick={copyRoomId}>
                    Copy ROOM ID
                </button>
                <button className="btn leaveBtn" onClick={leaveRoom}>
                    Leave
                </button>
            </div>
            <div className="editorWrap">
                <div className="actionsBar">
                    <div className="currentUser">
                        {location.state?.username}
                    </div>
                    <div className="onlineDropdownWrapper" ref={onlineDropdownRef}>
                        <button className="onlineBtn" onClick={() => setShowOnlineDropdown(!showOnlineDropdown)}>
                            Online Friends <span className="dropdownArrow">{showOnlineDropdown ? '▲' : '▼'}</span>
                        </button>
                        {showOnlineDropdown && (
                            <div className="onlineDropdown">
                                {clients
                                    .filter(client => client.socketId !== socketRef.current?.id)
                                    .map(client => (
                                        <div key={client.socketId} className="onlineUserItem">
                                            {client.username}
                                        </div>
                                    ))
                                }
                                {clients.filter(client => client.socketId !== socketRef.current?.id).length === 0 && (
                                    <div className="onlineUserItem">No other users</div>
                                )}
                            </div>
                        )}
                    </div>
                    <button className="btn" style={{ background: readOnly ? '#e0e0e0' : '#4aed88', color: '#000' }} onClick={() => setReadOnly(!readOnly)}>
                        {readOnly ? 'Spectator: ON' : 'Spectator: OFF'}
                    </button>
                    <button className="btn runBtn" onClick={saveCode} style={{ background: '#2196f3' }}>
                        Save
                    </button>
                    <select
                        className="languageSelector"
                        value={language}
                        onChange={handleLanguageChange}
                    >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="c++">C++</option>
                    </select>
                    <button className="btn runBtn" onClick={runCode} disabled={isRunning}>
                        {isRunning ? 'Running...' : 'Run Code'}
                    </button>
                </div>
                <CodeEditor
                    socketRef={socketRef}
                    roomId={roomId}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                    language={language === 'c++' ? 'cpp' : language}
                    readOnly={readOnly}
                />
                {output && (
                    <div className="outputWindow">
                        <h4>Output:</h4>
                        <pre>{output}</pre>
                        <button className="closeOutput" onClick={() => setOutput('')}>X</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorPage;
