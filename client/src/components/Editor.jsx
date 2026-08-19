import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { SocketIOProvider } from 'y-socket.io';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

/**
 * Collaborative Monaco editor backed by Yjs CRDT.
 *
 * - A Y.Doc is created per room. The SocketIOProvider connects to the
 *   server's /yjs namespace and syncs changes across all peers without
 *   cursor jumping or conflict overwriting.
 * - When `restoredCode` is provided (first user back in an empty room),
 *   it is inserted into the Y.Text after the first sync so the doc
 *   reflects the last-saved MongoDB state.
 * - Remote cursors are shown via Yjs awareness (y-monaco handles rendering).
 */
const CodeEditor = ({ roomId, onCodeChange, language, readOnly, restoredCode, username }) => {
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const ydocRef = useRef(null);
    const providerRef = useRef(null);
    const bindingRef = useRef(null);
    // Track whether we have already applied the restored code
    const restoredRef = useRef(false);

    // ── Create the Yjs doc + SocketIOProvider once per room ─────────────────
    useEffect(() => {
        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        const provider = new SocketIOProvider(BACKEND_URL, roomId, ydoc, {
            autoConnect: true,
        });
        providerRef.current = provider;

        // Set local awareness state so peers can show our cursor label
        if (username) {
            provider.awareness.setLocalStateField('user', {
                name: username,
                color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
            });
        }

        // After the first Yjs sync: if we are alone and the doc is empty,
        // seed it from the MongoDB-saved code (persistent reconnection).
        const handleSync = (isSynced) => {
            if (!isSynced || restoredRef.current) return;
            if (!restoredCode) return;

            const yText = ydoc.getText('monaco');
            const current = yText.toString();
            if (current === '' || current === '// Start coding...') {
                ydoc.transact(() => {
                    yText.delete(0, yText.length);
                    yText.insert(0, restoredCode);
                });
                restoredRef.current = true;
            }
        };

        provider.on('sync', handleSync);

        return () => {
            provider.off('sync', handleSync);
            if (bindingRef.current) {
                bindingRef.current.destroy();
                bindingRef.current = null;
            }
            provider.destroy();
            ydoc.destroy();
            restoredRef.current = false;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId]); // Only re-create if room changes

    // ── Update restoredRef when restoredCode arrives (async) ────────────────
    useEffect(() => {
        // If the provider is already synced when restoredCode arrives late,
        // apply it immediately.
        if (!restoredCode || restoredRef.current) return;
        const provider = providerRef.current;
        const ydoc = ydocRef.current;
        if (!provider || !ydoc) return;

        const yText = ydoc.getText('monaco');
        const current = yText.toString();
        if (current === '' || current === '// Start coding...') {
            ydoc.transact(() => {
                yText.delete(0, yText.length);
                yText.insert(0, restoredCode);
            });
            restoredRef.current = true;
        }
    }, [restoredCode]);

    // ── Monaco mount: create the MonacoBinding ───────────────────────────────
    function handleEditorDidMount(editor, monaco) {
        editorRef.current = editor;
        monacoRef.current = monaco;

        const ydoc = ydocRef.current;
        const provider = providerRef.current;

        if (!ydoc || !provider) return;

        const yText = ydoc.getText('monaco');

        // MonacoBinding keeps the Monaco model in sync with the Y.Text.
        // It also wires up awareness so remote cursors appear automatically.
        const binding = new MonacoBinding(
            yText,
            editor.getModel(),
            new Set([editor]),
            provider.awareness
        );
        bindingRef.current = binding;

        // Forward current value to parent for save / run operations
        editor.onDidChangeModelContent(() => {
            onCodeChange(editor.getValue());
        });
    }

    return (
        <Editor
            height="100vh"
            language={language}
            theme="vs-dark"
            onMount={handleEditorDidMount}
            options={{
                minimap: { enabled: false },
                fontSize: 16,
                fontFamily: 'Fira Code, Consolas, monospace',
                readOnly: readOnly,
                cursorStyle: 'line',
                wordWrap: 'on',
                // Do NOT pass onChange here — MonacoBinding owns the model
            }}
        />
    );
};

export default CodeEditor;
