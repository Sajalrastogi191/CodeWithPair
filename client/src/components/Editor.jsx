import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import ACTIONS from '../Actions';

const CodeEditor = ({ socketRef, roomId, onCodeChange, language, readOnly }) => {
    const editorRef = useRef(null);

    const isRemoteUpdate = useRef(false);

    function handleEditorDidMount(editor, monaco) {
        editorRef.current = editor;

        // Listen for local cursor moves
        editor.onDidChangeCursorPosition((e) => {
            const position = e.position;
            // Only emit if it's the user's manual move, assuming socket updates don't move cursor directly 
            // (actually setValue might move cursor, but we want to broadcast user's active cursor)
            if (socketRef.current) {
                socketRef.current.emit(ACTIONS.CURSOR_CHANGE, {
                    roomId,
                    cursor: position
                });
            }
        });
    }

    function handleEditorChange(value, event) {
        onCodeChange(value);
        if (isRemoteUpdate.current) return;

        if (socketRef.current) {
            socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                roomId,
                code: value,
            });
        }
    }

    // Handle remote cursors
    // We need to store decorations for each user: { socketId: [decorationId] }
    const cursorDecorations = useRef({});

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
                if (code !== null && editorRef.current) {
                    const currentValue = editorRef.current.getValue();
                    if (code !== currentValue) {
                        isRemoteUpdate.current = true;
                        editorRef.current.setValue(code);
                        isRemoteUpdate.current = false;
                    }
                }
            });

            socketRef.current.on(ACTIONS.CURSOR_CHANGE, ({ cursor, socketId, username }) => {
                if (editorRef.current) {
                    const editor = editorRef.current;
                    const monaco = window.monaco; // Monaco instance usually available globally on window.monaco if not passed directly, but we might need to access it differently. 
                    // However, @monaco-editor/react doesn't expose 'monaco' globally by default inside this component easily without handleEditorDidMount.
                    // Let's use clean approach: we need access to 'monaco' instance. 
                    // Actually, editor.deltaDecorations is available on the editor instance. 

                    let oldDecorations = cursorDecorations.current[socketId] || [];

                    // Create new decorations
                    const newDecorations = [
                        {
                            range: new window.monaco.Range(cursor.lineNumber, cursor.column, cursor.lineNumber, cursor.column),
                            options: {
                                className: 'remote-cursor',
                                stickiness: window.monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                                beforeContentClassName: 'remote-cursor-label',
                                // We can use content to show label, but CSS before/after is easier or GlyphMargin.
                                // Unfortunately passing dynamic text to CSS content is hard.
                                // We can use hoverMessage for username!
                                hoverMessage: { value: `User: ${username}` }
                            }
                        }
                    ];

                    // For label, we might need a OverlayWidget or similar, but let's try CSS-only first with 'remote-cursor'.
                    // To show name, we can use a separate decoration or a ContentWidget. 
                    // Simpler: use CSS class and maybe ignore name for now or use fixed color.
                    // Let's rely on hover or just simple bar.

                    const decorationIds = editor.deltaDecorations(oldDecorations, newDecorations);
                    cursorDecorations.current[socketId] = decorationIds;
                }
            });
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.CODE_CHANGE);
                socketRef.current.off(ACTIONS.CURSOR_CHANGE);
            }
        };
    }, [socketRef.current]);

    return (
        <Editor
            height="100vh"
            language={language}
            // defaultLanguage="javascript"
            defaultValue="// Start coding..."
            theme="vs-dark"
            onMount={handleEditorDidMount}
            onChange={handleEditorChange}
            options={{
                minimap: {
                    enabled: false,
                },
                fontSize: 16, // User requested nicely designed app
                fontFamily: 'Fira Code, Consolas, monospace',
                readOnly: readOnly,
            }}
        />
    );
};

export default CodeEditor;
