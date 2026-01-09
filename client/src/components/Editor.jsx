import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import ACTIONS from '../Actions';

const CodeEditor = ({ socketRef, roomId, onCodeChange, language, readOnly }) => {
    const editorRef = useRef(null);

    function handleEditorDidMount(editor, monaco) {
        editorRef.current = editor;
    }

    function handleEditorChange(value, event) {
        onCodeChange(value);
        if (socketRef.current) {
            socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                roomId,
                code: value,
            });
        }
    }

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
                if (code !== null && editorRef.current) {
                    const currentValue = editorRef.current.getValue();
                    if (code !== currentValue) {
                        editorRef.current.setValue(code);
                    }
                }
            });
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.CODE_CHANGE);
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
