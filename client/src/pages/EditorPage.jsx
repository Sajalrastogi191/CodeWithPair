import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import CodeEditor from '../components/Editor';
import Chat from '../components/Chat';
import { initSocket } from '../socket';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const { user, token } = useAuth();

    const [clients, setClients] = useState([]);
    const [language, setLanguage] = useState('javascript');
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [readOnly, setReadOnly] = useState(false);
    const [showOnlineDropdown, setShowOnlineDropdown] = useState(false);
    const [restoredCode, setRestoredCode] = useState(null); // from MongoDB on rejoin

    const onlineDropdownRef = useRef(null);

    // Close online dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (onlineDropdownRef.current && !onlineDropdownRef.current.contains(event.target)) {
                setShowOnlineDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Socket setup ──────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();

            const handleErrors = () => {
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            };
            socketRef.current.on('connect_error', handleErrors);
            socketRef.current.on('connect_failed', handleErrors);

            // Emit JOIN with username from JWT token
            const emitJoin = () => {
                socketRef.current.emit(ACTIONS.JOIN, {
                    roomId,
                    username: user?.username,
                });
            };
            emitJoin();

            // Re-join on automatic reconnect (persistent connection)
            socketRef.current.on('reconnect', () => {
                toast.success('Reconnected!');
                emitJoin();
            });

            // ── JOINED: another user arrived ──────────────────────────────────
            socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
                if (username !== user?.username) {
                    toast.success(`${username} joined the room.`);
                }
                setClients(clients);
                // Sync current code & language to the new joiner
                socketRef.current.emit(ACTIONS.SYNC_CODE, {
                    code: codeRef.current,
                    socketId,
                    language,
                });
            });

            // ── DISCONNECTED ──────────────────────────────────────────────────
            socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
                toast.success(`${username} left the room.`);
                setClients((prev) => prev.filter((c) => c.socketId !== socketId));
            });
        };

        init();

        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.JOINED);
                socketRef.current.off(ACTIONS.DISCONNECTED);
                socketRef.current.off('reconnect');
                socketRef.current.off('connect_error');
                socketRef.current.off('connect_failed');
                socketRef.current.disconnect();
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Socket listeners that depend on state ────────────────────────────────
    useEffect(() => {
        if (!socketRef.current) return;

        const handleSyncOutput = ({ output, isRunning }) => {
            if (output !== undefined) setOutput(output);
            if (isRunning !== undefined) setIsRunning(isRunning);
        };

        const handleLanguageChange = ({ language }) => setLanguage(language);

        const handleSyncSave = () => downloadCode();

        // ── Persistent reconnection: restore code & language from MongoDB ─────
        const handleRestoreSession = ({ language: savedLang, code: savedCode }) => {
            if (savedLang) setLanguage(savedLang);
            // savedCode is non-null only when the user is alone in the room;
            // pass it to the Yjs Editor to seed the Y.Doc.
            if (savedCode !== null && savedCode !== undefined) {
                setRestoredCode(savedCode);
            }
        };

        socketRef.current.on(ACTIONS.SYNC_OUTPUT, handleSyncOutput);
        socketRef.current.on(ACTIONS.LANGUAGE_CHANGE, handleLanguageChange);
        socketRef.current.on(ACTIONS.SYNC_SAVE, handleSyncSave);
        socketRef.current.on(ACTIONS.RESTORE_SESSION, handleRestoreSession);

        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.SYNC_OUTPUT, handleSyncOutput);
                socketRef.current.off(ACTIONS.LANGUAGE_CHANGE, handleLanguageChange);
                socketRef.current.off(ACTIONS.SYNC_SAVE, handleSyncSave);
                socketRef.current.off(ACTIONS.RESTORE_SESSION, handleRestoreSession);
            }
        };
    }, [socketRef.current]); // eslint-disable-line

    // ── Helpers ───────────────────────────────────────────────────────────────
    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID copied to clipboard');
        } catch {
            toast.error('Could not copy the Room ID');
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    const downloadCode = () => {
        try {
            const blob = new Blob([codeRef.current || ''], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const extMap = {
                javascript: '.js',
                python: '.py',
                'c++': '.cpp',
                cpp: '.cpp',
                java: '.java',
                typescript: '.ts',
                go: '.go',
            };
            link.download = `code-${roomId}${extMap[language] || '.txt'}`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast.success('File downloaded');
        } catch (e) {
            console.error('Download failed', e);
            toast.error('Could not download file');
        }
    };

    const saveCode = async () => {
        downloadCode();

        if (socketRef.current) {
            socketRef.current.emit(ACTIONS.SYNC_SAVE, { roomId });
        }

        try {
            await axios.post(
                `${BACKEND_URL}/api/save`,
                { roomId, code: codeRef.current, language },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Code saved to cloud');
        } catch {
            toast.error('Failed to save to cloud');
        }
    };

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

        const versionMap = {
            javascript: '18.15.0',
            python: '3.10.0',
            'c++': '10.2.0',
            cpp: '10.2.0',
            java: '15.0.2',
            typescript: '5.0.3',
            go: '1.16.2',
        };

        try {
            const response = await axios.post('https://emkc.org/api/v2/piston/execute', {
                language: language === 'c++' ? 'cpp' : language,
                version: versionMap[language] || '18.15.0',
                files: [{ content: codeRef.current || '' }],
            });

            const { run: { output, stderr } } = response.data;
            setOutput(output);

            if (socketRef.current) {
                socketRef.current.emit(ACTIONS.SYNC_OUTPUT, { roomId, isRunning: false, output });
            }

            if (stderr) toast.error('Execution Error');
            else toast.success('Code ran successfully');
        } catch {
            const errOutput = 'Error running code';
            setOutput(errOutput);
            if (socketRef.current) {
                socketRef.current.emit(ACTIONS.SYNC_OUTPUT, { roomId, isRunning: false, output: errOutput });
            }
            toast.error('Failed to run code');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img className="logoImage" src="/code-sync.png" alt="logo" />
                    </div>
                    <h3>Connected</h3>
                    <Chat
                        socketRef={socketRef}
                        roomId={roomId}
                        username={user?.username}
                    />
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
                    <div className="currentUser">{user?.username}</div>

                    {/* Online users dropdown */}
                    <div className="onlineDropdownWrapper" ref={onlineDropdownRef}>
                        <button
                            className="onlineBtn"
                            onClick={() => setShowOnlineDropdown((s) => !s)}
                        >
                            Online Friends{' '}
                            <span className="dropdownArrow">
                                {showOnlineDropdown ? '▲' : '▼'}
                            </span>
                        </button>
                        {showOnlineDropdown && (
                            <div className="onlineDropdown">
                                {clients
                                    .filter((c) => c.socketId !== socketRef.current?.id)
                                    .map((c) => (
                                        <div key={c.socketId} className="onlineUserItem">
                                            {c.username}
                                        </div>
                                    ))}
                                {clients.filter((c) => c.socketId !== socketRef.current?.id)
                                    .length === 0 && (
                                    <div className="onlineUserItem">No other users</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Spectator toggle */}
                    <button
                        className="btn"
                        style={{ background: readOnly ? '#e0e0e0' : '#4aed88', color: '#000' }}
                        onClick={() => setReadOnly((r) => !r)}
                    >
                        {readOnly ? 'Spectator: ON' : 'Spectator: OFF'}
                    </button>

                    {/* Save button */}
                    <button
                        className="btn runBtn"
                        onClick={saveCode}
                        style={{ background: '#2196f3' }}
                    >
                        Save
                    </button>

                    {/* Language selector */}
                    <select
                        className="languageSelector"
                        value={language}
                        onChange={handleLanguageChange}
                    >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="c++">C++</option>
                        <option value="java">Java</option>
                        <option value="typescript">TypeScript</option>
                        <option value="go">Go</option>
                    </select>

                    {/* Run button */}
                    <button className="btn runBtn" onClick={runCode} disabled={isRunning}>
                        {isRunning ? 'Running…' : 'Run Code'}
                    </button>
                </div>

                {/* Yjs-powered collaborative editor */}
                <CodeEditor
                    roomId={roomId}
                    onCodeChange={(code) => { codeRef.current = code; }}
                    language={language === 'c++' ? 'cpp' : language}
                    readOnly={readOnly}
                    restoredCode={restoredCode}
                    username={user?.username}
                />

                {/* Output panel */}
                {output && (
                    <div className="outputWindow">
                        <h4>Output:</h4>
                        <pre>{output}</pre>
                        <button className="closeOutput" onClick={() => setOutput('')}>
                            ✕
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorPage;
