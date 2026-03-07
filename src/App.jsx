import { useState, useRef, useCallback, useEffect } from 'react';
import ConnectionScreen from './components/ConnectionScreen';
import ChatPanel from './components/ChatPanel';
import DrawingCanvas from './components/DrawingCanvas';
import Toolbar from './components/Toolbar';
import Toast from './components/Toast';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
    createPeer, connectToPeer, sendData,
    HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT,
    MAX_RECONNECT_ATTEMPTS, INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY,
} from './services/peerConnection';
import { deriveKey, encrypt, decrypt } from './services/encryption';
import { enqueue, flush as flushQueue, clear as clearQueue } from './services/messageQueue';
import { saveMessages, loadMessages, saveCanvas, loadCanvas, clearAll as clearOfflineData } from './services/offlineStorage';

const SESSION_KEY = 'chatcolab-session';

export default function App() {
    const [view, setView] = useState('connection'); // 'connection' | 'main'
    const [status, setStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'offline'
    const [error, setError] = useState('');
    const [messages, setMessages] = useState([]);
    const [myUsername, setMyUsername] = useState('');
    const [peerUsernames, setPeerUsernames] = useState([]); // Array of connected peer names
    const [drawColor, setDrawColor] = useState('#6C5CE7');
    const [brushSize, setBrushSize] = useState(3);
    const [isEraser, setIsEraser] = useState(false);
    const [activeTab, setActiveTab] = useState('chat');
    const [unreadCount, setUnreadCount] = useState(0);
    const [toasts, setToasts] = useState([]);
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const [isNetworkOnline, setIsNetworkOnline] = useState(navigator.onLine);
    const [maxRetriesReached, setMaxRetriesReached] = useState(false);
    const [isRoomCreator, setIsRoomCreator] = useState(false);
    const [canUndo, setCanUndo] = useState(false);

    const peerRef = useRef(null);
    // Map<peerId, DataConnection> for multi-user support
    const connsRef = useRef(new Map());
    const keyRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const activeTabRef = useRef(activeTab);
    const heartbeatIntervalsRef = useRef(new Map()); // Map<peerId, intervalId>
    const heartbeatTimeoutsRef = useRef(new Map()); // Map<peerId, timeoutId>
    const reconnectAttemptRef = useRef(0);
    const isRoomCreatorRef = useRef(false);

    // Keep refs in sync with state
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    useEffect(() => {
        isRoomCreatorRef.current = isRoomCreator;
    }, [isRoomCreator]);

    // ─── Toast Helpers ───────────────────────────────────
    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev.slice(-4), { id, message, type }]); // Keep max 5 toasts
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // ─── Persist messages whenever they change ───────────
    useEffect(() => {
        if (messages.length > 0) {
            saveMessages(messages);
        }
    }, [messages]);

    // ─── Broadcast to all connected peers ────────────────
    const broadcastToAll = useCallback(async (msg, excludePeerId = null) => {
        if (!keyRef.current) return;
        const encrypted = await encrypt(JSON.stringify(msg), keyRef.current);
        for (const [peerId, conn] of connsRef.current.entries()) {
            if (peerId !== excludePeerId) {
                sendData(conn, encrypted);
            }
        }
    }, []);

    // Check if any connection is open
    const hasAnyConnection = useCallback(() => {
        for (const conn of connsRef.current.values()) {
            if (conn && conn.open) return true;
        }
        return false;
    }, []);

    // ─── Heartbeat (Ping/Pong) ───────────────────────────
    const stopHeartbeatForPeer = useCallback((peerId) => {
        const interval = heartbeatIntervalsRef.current.get(peerId);
        if (interval) {
            clearInterval(interval);
            heartbeatIntervalsRef.current.delete(peerId);
        }
        const timeout = heartbeatTimeoutsRef.current.get(peerId);
        if (timeout) {
            clearTimeout(timeout);
            heartbeatTimeoutsRef.current.delete(peerId);
        }
    }, []);

    const stopAllHeartbeats = useCallback(() => {
        for (const peerId of heartbeatIntervalsRef.current.keys()) {
            stopHeartbeatForPeer(peerId);
        }
    }, [stopHeartbeatForPeer]);

    const startHeartbeatForPeer = useCallback((peerId) => {
        stopHeartbeatForPeer(peerId);

        const intervalId = setInterval(async () => {
            const conn = connsRef.current.get(peerId);
            if (!conn || !conn.open || !keyRef.current) return;

            try {
                const msg = JSON.stringify({ type: 'ping', timestamp: Date.now() });
                const encrypted = await encrypt(msg, keyRef.current);
                sendData(conn, encrypted);

                // Set a timeout — if no pong comes back, trigger reconnection
                const timeoutId = setTimeout(() => {
                    const c = connsRef.current.get(peerId);
                    if (c && c.open) {
                        console.log(`[Heartbeat] No pong from ${peerId}, closing connection`);
                        c.close();
                    }
                }, HEARTBEAT_TIMEOUT);
                heartbeatTimeoutsRef.current.set(peerId, timeoutId);
            } catch (err) {
                console.error(`[Heartbeat] Error sending ping to ${peerId}:`, err);
            }
        }, HEARTBEAT_INTERVAL);

        heartbeatIntervalsRef.current.set(peerId, intervalId);
    }, [stopHeartbeatForPeer]);

    const handlePong = useCallback((peerId) => {
        const timeout = heartbeatTimeoutsRef.current.get(peerId);
        if (timeout) {
            clearTimeout(timeout);
            heartbeatTimeoutsRef.current.delete(peerId);
        }
    }, []);

    // ─── Flush message queue on reconnect ────────────────
    const flushPendingMessages = useCallback(async () => {
        if (connsRef.current.size === 0 || !keyRef.current) return;

        const count = await flushQueue(async (msg) => {
            const encrypted = await encrypt(JSON.stringify(msg), keyRef.current);
            let sent = false;
            for (const conn of connsRef.current.values()) {
                if (sendData(conn, encrypted)) sent = true;
            }
            if (!sent) throw new Error('No open connections');
        });

        if (count > 0) {
            // Update pending messages to 'sent' status
            setMessages(prev => prev.map(m =>
                m.status === 'pending' ? { ...m, status: 'sent' } : m
            ));
            addToast(`${count} queued message${count > 1 ? 's' : ''} sent!`, 'success');
        }
    }, [addToast]);

    // ─── Remove a peer from connected list ───────────────
    const removePeer = useCallback((peerId) => {
        connsRef.current.delete(peerId);
        stopHeartbeatForPeer(peerId);
        setPeerUsernames(prev => prev.filter(u => u !== peerId));

        if (connsRef.current.size === 0) {
            setStatus('reconnecting');
            setError('All peers disconnected. Waiting for new connections...');
        }
    }, [stopHeartbeatForPeer]);

    // ─── Setup incoming data handler ─────────────────────
    const setupConnection = useCallback((conn, peerName) => {
        // Add to connections map
        connsRef.current.set(peerName, conn);

        // Update peer usernames list
        setPeerUsernames(prev => {
            if (prev.includes(peerName)) return prev;
            return [...prev, peerName];
        });

        setStatus('connected');
        setView('main');
        setError('');
        setReconnectAttempt(0);
        reconnectAttemptRef.current = 0;
        setMaxRetriesReached(false);

        // Start heartbeat for this peer
        startHeartbeatForPeer(peerName);

        // Flush any queued messages
        setTimeout(() => flushPendingMessages(), 500);

        conn.on('data', async (data) => {
            try {
                const decrypted = await decrypt(data, keyRef.current);
                const parsed = JSON.parse(decrypted);

                // Handle heartbeat messages
                if (parsed.type === 'ping') {
                    const pong = JSON.stringify({ type: 'pong', timestamp: Date.now() });
                    const encrypted = await encrypt(pong, keyRef.current);
                    sendData(conn, encrypted);
                    return;
                }

                if (parsed.type === 'pong') {
                    handlePong(peerName);
                    return;
                }

                // ─── Relay logic (room creator only) ─────────
                // If we are the room creator, relay the message to all other peers
                if (isRoomCreatorRef.current) {
                    const encrypted = await encrypt(JSON.stringify(parsed), keyRef.current);
                    for (const [peerId, c] of connsRef.current.entries()) {
                        if (peerId !== peerName) {
                            sendData(c, encrypted);
                        }
                    }
                }

                if (parsed.type === 'chat') {
                    setMessages(prev => [...prev, {
                        id: Date.now() + Math.random(),
                        text: parsed.text || '',
                        gifUrl: parsed.gifUrl || null,
                        sender: 'peer',
                        senderName: parsed.senderName || peerName,
                        timestamp: parsed.timestamp,
                        status: 'received',
                    }]);
                    // Vibrate on new message using native haptics
                    try {
                        Haptics.impact({ style: ImpactStyle.Heavy });
                    } catch (e) {
                        // Haptics not available (web browser)
                    }
                    if (activeTabRef.current !== 'chat') {
                        setUnreadCount(prev => prev + 1);
                    }
                } else if (parsed.type === 'draw') {
                    window.dispatchEvent(new CustomEvent('peer-draw', { detail: parsed }));
                } else if (parsed.type === 'clear-canvas') {
                    window.dispatchEvent(new CustomEvent('peer-clear-canvas'));
                } else if (parsed.type === 'undo-canvas-state') {
                    // Peer undid a stroke, sync canvas to the restored state
                    window.dispatchEvent(new CustomEvent('peer-undo', { detail: parsed }));
                } else if (parsed.type === 'peer-joined') {
                    // Another peer joined (relayed by creator)
                    setPeerUsernames(prev => {
                        if (prev.includes(parsed.username)) return prev;
                        return [...prev, parsed.username];
                    });
                    addToast(`${parsed.username} joined the room!`, 'success');
                } else if (parsed.type === 'peer-left') {
                    setPeerUsernames(prev => prev.filter(u => u !== parsed.username));
                    addToast(`${parsed.username} left the room`, 'warning');
                }
            } catch (err) {
                console.error('[App] Failed to decrypt/parse message:', err);
            }
        });

        conn.on('close', () => {
            removePeer(peerName);
            addToast(`${peerName} disconnected`, 'warning');

            // If we're the room creator, notify remaining peers
            if (isRoomCreatorRef.current) {
                broadcastToAll({ type: 'peer-left', username: peerName });
            }
        });
    }, [startHeartbeatForPeer, handlePong, flushPendingMessages, addToast, removePeer, broadcastToAll]);

    // ─── Reconnect Logic (Exponential Backoff) ───────────
    const stopReconnectLoop = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }, []);

    const attemptReconnect = useCallback(async (session) => {
        try {
            if (peerRef.current) {
                peerRef.current.destroy();
                peerRef.current = null;
            }

            keyRef.current = await deriveKey(session.passphrase);
            const peer = await createPeer(session.username);
            peerRef.current = peer;

            if (session.mode === 'create') {
                setIsRoomCreator(true);
                peer.on('connection', (conn) => {
                    conn.on('open', () => {
                        stopReconnectLoop();
                        setupConnection(conn, conn.peer);
                        addToast(`${conn.peer} connected!`, 'success');

                        // Notify all existing peers about the new joiner
                        broadcastToAll({ type: 'peer-joined', username: conn.peer }, conn.peer);
                    });
                });
            } else if (session.mode === 'join' && session.targetUsername) {
                const conn = await connectToPeer(peer, session.targetUsername);
                stopReconnectLoop();
                setupConnection(conn, session.targetUsername);
                addToast('Reconnected!', 'success');
            }
        } catch (err) {
            console.log('[App] Reconnect attempt failed, will retry...', err.message);
            if (peerRef.current) {
                peerRef.current.destroy();
                peerRef.current = null;
            }
        }
    }, [setupConnection, stopReconnectLoop, addToast, broadcastToAll]);

    const startReconnectLoop = useCallback(() => {
        stopReconnectLoop();
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        setMaxRetriesReached(false);

        const scheduleNext = () => {
            const attempt = reconnectAttemptRef.current;

            if (attempt >= MAX_RECONNECT_ATTEMPTS) {
                setMaxRetriesReached(true);
                setError('Could not reconnect. Check your connection and try again.');
                addToast('Reconnection failed after multiple attempts', 'error');
                return;
            }

            // Exponential backoff: 2s, 4s, 8s, 16s, 30s, 30s...
            const delay = Math.min(
                INITIAL_RECONNECT_DELAY * Math.pow(2, attempt),
                MAX_RECONNECT_DELAY
            );

            reconnectTimerRef.current = setTimeout(async () => {
                reconnectAttemptRef.current++;
                setReconnectAttempt(reconnectAttemptRef.current);

                try {
                    const saved = localStorage.getItem(SESSION_KEY);
                    if (!saved) { stopReconnectLoop(); return; }
                    const session = JSON.parse(saved);
                    await attemptReconnect(session);
                } catch (err) {
                    console.error('[App] Reconnect loop error:', err);
                }

                // Schedule next attempt if still not connected
                if (!hasAnyConnection()) {
                    scheduleNext();
                }
            }, delay);
        };

        scheduleNext();
    }, [stopReconnectLoop, attemptReconnect, addToast, hasAnyConnection]);

    // Manual retry after max retries reached
    const handleManualRetry = useCallback(() => {
        setMaxRetriesReached(false);
        setError('Reconnecting...');
        setStatus('reconnecting');
        startReconnectLoop();
    }, [startReconnectLoop]);

    // ─── Network Online/Offline Detection ────────────────
    useEffect(() => {
        const handleOnline = () => {
            setIsNetworkOnline(true);
            addToast('Back online!', 'success');

            // If we were in a session, trigger reconnection
            const saved = localStorage.getItem(SESSION_KEY);
            if (saved && !hasAnyConnection()) {
                setStatus('reconnecting');
                setError('Network restored. Reconnecting...');
                setMaxRetriesReached(false);
                startReconnectLoop();
            }
        };

        const handleOffline = () => {
            setIsNetworkOnline(false);
            addToast('You\'re offline', 'warning');
            stopAllHeartbeats();

            if (view === 'main') {
                setStatus('offline');
                setError('No network connection');
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [addToast, startReconnectLoop, stopAllHeartbeats, view, hasAnyConnection]);

    // ─── Create Room ─────────────────────────────────────
    const handleCreateRoom = useCallback(async (username, passphrase) => {
        setError('');
        setStatus('connecting');
        setMyUsername(username);
        setIsRoomCreator(true);
        stopReconnectLoop();

        try {
            keyRef.current = await deriveKey(passphrase);
            const peer = await createPeer(username);
            peerRef.current = peer;

            peer.on('connection', (conn) => {
                conn.on('open', () => {
                    setupConnection(conn, conn.peer);
                    addToast(`${conn.peer} connected!`, 'success');

                    // Notify all existing peers about the new joiner
                    broadcastToAll({ type: 'peer-joined', username: conn.peer }, conn.peer);

                    // Tell the new joiner about all existing peers
                    const existingPeers = Array.from(connsRef.current.keys()).filter(p => p !== conn.peer);
                    for (const existingPeer of existingPeers) {
                        encrypt(JSON.stringify({ type: 'peer-joined', username: existingPeer }), keyRef.current)
                            .then(encrypted => sendData(conn, encrypted));
                    }

                    localStorage.setItem(SESSION_KEY, JSON.stringify({
                        mode: 'create', username, passphrase,
                    }));
                });
            });
        } catch (err) {
            setError(err.message);
            setStatus('disconnected');
        }
    }, [setupConnection, stopReconnectLoop, addToast, broadcastToAll]);

    // ─── Join Room ───────────────────────────────────────
    const handleJoinRoom = useCallback(async (username, targetUsername, passphrase) => {
        setError('');
        setStatus('connecting');
        setMyUsername(username);
        setIsRoomCreator(false);
        stopReconnectLoop();

        try {
            keyRef.current = await deriveKey(passphrase);
            const peer = await createPeer(username);
            peerRef.current = peer;
            const conn = await connectToPeer(peer, targetUsername);
            setupConnection(conn, targetUsername);
            addToast(`Connected to ${targetUsername}!`, 'success');
            localStorage.setItem(SESSION_KEY, JSON.stringify({
                mode: 'join', username, targetUsername, passphrase,
            }));
        } catch (err) {
            setError(err.message);
            setStatus('disconnected');
        }
    }, [setupConnection, stopReconnectLoop, addToast]);

    // ─── Send Chat Message ───────────────────────────────
    const handleSendMessage = useCallback(async (text) => {
        if (!text.trim()) return;

        const msg = {
            type: 'chat',
            text: text.trim(),
            senderName: myUsername,
            timestamp: Date.now(),
        };

        const isConnected = hasAnyConnection();

        if (isConnected) {
            try {
                await broadcastToAll(msg);
            } catch (err) {
                console.error('[App] Failed to send message:', err);
                enqueue(msg);
            }
        } else {
            enqueue(msg);
        }

        setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            text: text.trim(),
            sender: 'me',
            senderName: myUsername,
            timestamp: msg.timestamp,
            status: isConnected ? 'sent' : 'pending',
        }]);
    }, [myUsername, hasAnyConnection, broadcastToAll]);

    // ─── Send GIF Message ────────────────────────────────
    const handleSendGif = useCallback(async (gifUrl) => {
        if (!gifUrl) return;

        const msg = {
            type: 'chat',
            gifUrl,
            senderName: myUsername,
            timestamp: Date.now(),
        };

        const isConnected = hasAnyConnection();

        if (isConnected) {
            try {
                await broadcastToAll(msg);
            } catch (err) {
                console.error('[App] Failed to send GIF:', err);
                enqueue(msg);
            }
        } else {
            enqueue(msg);
        }

        setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            text: '',
            gifUrl,
            sender: 'me',
            senderName: myUsername,
            timestamp: msg.timestamp,
            status: isConnected ? 'sent' : 'pending',
        }]);
    }, [myUsername, hasAnyConnection, broadcastToAll]);

    // ─── Send Draw Data ──────────────────────────────────
    const handleDraw = useCallback(async (drawData) => {
        if (!hasAnyConnection()) return;
        const msg = { type: 'draw', ...drawData };
        await broadcastToAll(msg);
    }, [hasAnyConnection, broadcastToAll]);

    // ─── Send Clear Canvas ───────────────────────────────
    const handleClearCanvas = useCallback(async () => {
        if (!hasAnyConnection()) return;
        await broadcastToAll({ type: 'clear-canvas' });
        window.dispatchEvent(new CustomEvent('local-clear-canvas'));
    }, [hasAnyConnection, broadcastToAll]);

    // ─── Undo Canvas Stroke ──────────────────────────────
    const handleUndo = useCallback(() => {
        // Dispatch local undo event — DrawingCanvas will handle restoring snapshot
        window.dispatchEvent(new CustomEvent('local-undo'));
    }, []);

    // Called by DrawingCanvas after undo with restored canvas data
    const handleUndoComplete = useCallback(async (canvasDataUrl) => {
        if (hasAnyConnection()) {
            await broadcastToAll({ type: 'undo-canvas-state', dataUrl: canvasDataUrl });
        }
    }, [hasAnyConnection, broadcastToAll]);

    // Called by DrawingCanvas to report undo stack state
    const handleUndoStackChange = useCallback((hasItems) => {
        setCanUndo(hasItems);
    }, []);

    // ─── Canvas State Persistence ────────────────────────
    const handleCanvasSave = useCallback((dataUrl) => {
        saveCanvas(dataUrl);
    }, []);

    // ─── Disconnect ──────────────────────────────────────
    const handleDisconnect = useCallback(() => {
        stopReconnectLoop();
        stopAllHeartbeats();

        // Close all connections
        for (const conn of connsRef.current.values()) {
            if (conn) conn.close();
        }
        connsRef.current.clear();

        if (peerRef.current) peerRef.current.destroy();
        peerRef.current = null;
        keyRef.current = null;
        setStatus('disconnected');
        setView('connection');
        setMessages([]);
        setError('');
        setPeerUsernames([]);
        setIsRoomCreator(false);
        setReconnectAttempt(0);
        setMaxRetriesReached(false);
        setCanUndo(false);
        localStorage.removeItem(SESSION_KEY);
        clearQueue();
        clearOfflineData();
    }, [stopReconnectLoop, stopAllHeartbeats]);

    // ─── Auto-reconnect on mount ─────────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SESSION_KEY);
            if (saved) {
                const session = JSON.parse(saved);
                setMyUsername(session.username);
                if (session.mode === 'create') setIsRoomCreator(true);

                // Restore persisted messages
                const savedMessages = loadMessages();
                if (savedMessages.length > 0) {
                    setMessages(savedMessages);
                }

                setView('main');
                setStatus('reconnecting');
                setError('Reconnecting...');
                attemptReconnect(session);
                startReconnectLoop();
            }
        } catch (err) {
            console.error('[App] Failed to restore session:', err);
            localStorage.removeItem(SESSION_KEY);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Cleanup on unmount ──────────────────────────────
    useEffect(() => {
        return () => {
            stopReconnectLoop();
            stopAllHeartbeats();
            for (const conn of connsRef.current.values()) {
                if (conn) conn.close();
            }
            if (peerRef.current) peerRef.current.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Read saved session for pre-filling connection screen
    const savedSession = (() => {
        try {
            const s = localStorage.getItem(SESSION_KEY);
            return s ? JSON.parse(s) : null;
        } catch { return null; }
    })();

    if (view === 'connection') {
        return (
            <>
                <ConnectionScreen
                    onCreateRoom={handleCreateRoom}
                    onJoinRoom={handleJoinRoom}
                    status={status}
                    error={error}
                    savedSession={savedSession}
                />
                <Toast toasts={toasts} onDismiss={dismissToast} />
            </>
        );
    }

    return (
        <div className="main-layout">
            <Toolbar
                status={status}
                myUsername={myUsername}
                peerUsernames={peerUsernames}
                drawColor={drawColor}
                onColorChange={setDrawColor}
                brushSize={brushSize}
                onBrushSizeChange={setBrushSize}
                isEraser={isEraser}
                onEraserToggle={() => setIsEraser(!isEraser)}
                onClearCanvas={handleClearCanvas}
                onUndo={handleUndo}
                canUndo={canUndo}
                onDisconnect={handleDisconnect}
                activeTab={activeTab}
                reconnectAttempt={reconnectAttempt}
                maxReconnectAttempts={MAX_RECONNECT_ATTEMPTS}
                isNetworkOnline={isNetworkOnline}
                maxRetriesReached={maxRetriesReached}
                onManualRetry={handleManualRetry}
            />
            <div className="panels-container">
                <div className={`panel-wrapper ${activeTab === 'chat' ? 'active' : ''}`} data-panel="chat">
                    <ChatPanel
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        onSendGif={handleSendGif}
                        myUsername={myUsername}
                        isConnected={status === 'connected'}
                    />
                </div>
                <div className={`panel-wrapper ${activeTab === 'draw' ? 'active' : ''}`} data-panel="draw">
                    <DrawingCanvas
                        onDraw={handleDraw}
                        color={isEraser ? '#1a1a2e' : drawColor}
                        brushSize={isEraser ? brushSize * 3 : brushSize}
                        onCanvasSave={handleCanvasSave}
                        savedCanvasData={loadCanvas()}
                        onUndoComplete={handleUndoComplete}
                        onUndoStackChange={handleUndoStackChange}
                    />
                </div>
            </div>

            {/* Mobile Tab Bar */}
            <div className="mobile-tab-bar">
                <button
                    className={`mobile-tab ${activeTab === 'chat' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('chat'); setUnreadCount(0); }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    Chat
                    {unreadCount > 0 && (
                        <span className="unread-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                </button>
                <button
                    className={`mobile-tab ${activeTab === 'draw' ? 'active' : ''}`}
                    onClick={() => setActiveTab('draw')}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 19l7-7 3 3-7 7-3-3z" />
                        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                        <path d="M2 2l7.586 7.586" />
                        <circle cx="11" cy="11" r="2" />
                    </svg>
                    Draw
                </button>
                <button
                    className="mobile-tab mobile-tab-disconnect"
                    onClick={handleDisconnect}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    Leave
                </button>
            </div>

            <Toast toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
}
