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
    const [peerUsername, setPeerUsername] = useState('');
    const [drawColor, setDrawColor] = useState('#6C5CE7');
    const [brushSize, setBrushSize] = useState(3);
    const [isEraser, setIsEraser] = useState(false);
    const [activeTab, setActiveTab] = useState('chat');
    const [unreadCount, setUnreadCount] = useState(0);
    const [toasts, setToasts] = useState([]);
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const [isNetworkOnline, setIsNetworkOnline] = useState(navigator.onLine);
    const [maxRetriesReached, setMaxRetriesReached] = useState(false);

    const peerRef = useRef(null);
    const connRef = useRef(null);
    const keyRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const activeTabRef = useRef(activeTab);
    const heartbeatIntervalRef = useRef(null);
    const heartbeatTimeoutRef = useRef(null);
    const reconnectAttemptRef = useRef(0);

    // Keep ref in sync with activeTab state
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

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

    // ─── Heartbeat (Ping/Pong) ───────────────────────────
    const stopHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
        if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
        }
    }, []);

    const startHeartbeat = useCallback(() => {
        stopHeartbeat();
        heartbeatIntervalRef.current = setInterval(async () => {
            if (!connRef.current || !connRef.current.open || !keyRef.current) return;

            try {
                const msg = JSON.stringify({ type: 'ping', timestamp: Date.now() });
                const encrypted = await encrypt(msg, keyRef.current);
                sendData(connRef.current, encrypted);

                // Set a timeout — if no pong comes back, trigger reconnection
                heartbeatTimeoutRef.current = setTimeout(() => {
                    if (connRef.current && connRef.current.open) {
                        console.log('[Heartbeat] No pong received, triggering reconnection');
                        connRef.current.close();
                    }
                }, HEARTBEAT_TIMEOUT);
            } catch (err) {
                console.error('[Heartbeat] Error sending ping:', err);
            }
        }, HEARTBEAT_INTERVAL);
    }, [stopHeartbeat]);

    const handlePong = useCallback(() => {
        // Clear the timeout — peer is alive
        if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
        }
    }, []);

    // ─── Flush message queue on reconnect ────────────────
    const flushPendingMessages = useCallback(async () => {
        if (!connRef.current || !keyRef.current) return;

        const count = await flushQueue(async (msg) => {
            const encrypted = await encrypt(JSON.stringify(msg), keyRef.current);
            const sent = sendData(connRef.current, encrypted);
            if (!sent) throw new Error('Connection not open');
        });

        if (count > 0) {
            // Update pending messages to 'sent' status
            setMessages(prev => prev.map(m =>
                m.status === 'pending' ? { ...m, status: 'sent' } : m
            ));
            addToast(`${count} queued message${count > 1 ? 's' : ''} sent!`, 'success');
        }
    }, [addToast]);

    // ─── Setup incoming data handler ─────────────────────
    const setupConnection = useCallback((conn, peerName) => {
        connRef.current = conn;
        setPeerUsername(peerName);
        setStatus('connected');
        setView('main');
        setError('');
        setReconnectAttempt(0);
        reconnectAttemptRef.current = 0;
        setMaxRetriesReached(false);

        // Start heartbeat
        startHeartbeat();

        // Flush any queued messages
        setTimeout(() => flushPendingMessages(), 500);

        conn.on('data', async (data) => {
            try {
                const decrypted = await decrypt(data, keyRef.current);
                const parsed = JSON.parse(decrypted);

                // Handle heartbeat messages
                if (parsed.type === 'ping') {
                    // Respond with pong
                    const pong = JSON.stringify({ type: 'pong', timestamp: Date.now() });
                    const encrypted = await encrypt(pong, keyRef.current);
                    sendData(conn, encrypted);
                    return;
                }

                if (parsed.type === 'pong') {
                    handlePong();
                    return;
                }

                if (parsed.type === 'chat') {
                    setMessages(prev => [...prev, {
                        id: Date.now() + Math.random(),
                        text: parsed.text || '',
                        gifUrl: parsed.gifUrl || null,
                        sender: 'peer',
                        senderName: peerName,
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
                }
            } catch (err) {
                console.error('[App] Failed to decrypt/parse message:', err);
            }
        });

        conn.on('close', () => {
            connRef.current = null;
            stopHeartbeat();
            setStatus('reconnecting');
            setError('Peer went offline. Reconnecting...');
            addToast('Peer went offline', 'warning');
            startReconnectLoop();
        });
    }, [startHeartbeat, stopHeartbeat, handlePong, flushPendingMessages, addToast]);

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
                peer.on('connection', (conn) => {
                    conn.on('open', () => {
                        stopReconnectLoop();
                        setupConnection(conn, conn.peer);
                        addToast('Reconnected!', 'success');
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
    }, [setupConnection, stopReconnectLoop, addToast]);

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
                if (!connRef.current || !connRef.current.open) {
                    scheduleNext();
                }
            }, delay);
        };

        scheduleNext();
    }, [stopReconnectLoop, attemptReconnect, addToast]);

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
            if (saved && (!connRef.current || !connRef.current.open)) {
                setStatus('reconnecting');
                setError('Network restored. Reconnecting...');
                setMaxRetriesReached(false);
                startReconnectLoop();
            }
        };

        const handleOffline = () => {
            setIsNetworkOnline(false);
            addToast('You\'re offline', 'warning');
            stopHeartbeat();

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
    }, [addToast, startReconnectLoop, stopHeartbeat, view]);

    // ─── Create Room ─────────────────────────────────────
    const handleCreateRoom = useCallback(async (username, passphrase) => {
        setError('');
        setStatus('connecting');
        setMyUsername(username);
        stopReconnectLoop();

        try {
            keyRef.current = await deriveKey(passphrase);
            const peer = await createPeer(username);
            peerRef.current = peer;

            peer.on('connection', (conn) => {
                conn.on('open', () => {
                    setupConnection(conn, conn.peer);
                    addToast(`${conn.peer} connected!`, 'success');
                    localStorage.setItem(SESSION_KEY, JSON.stringify({
                        mode: 'create', username, passphrase, peerUsername: conn.peer,
                    }));
                });
            });
        } catch (err) {
            setError(err.message);
            setStatus('disconnected');
        }
    }, [setupConnection, stopReconnectLoop, addToast]);

    // ─── Join Room ───────────────────────────────────────
    const handleJoinRoom = useCallback(async (username, targetUsername, passphrase) => {
        setError('');
        setStatus('connecting');
        setMyUsername(username);
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
            timestamp: Date.now(),
        };

        const isConnected = connRef.current && connRef.current.open;

        if (isConnected) {
            try {
                const encrypted = await encrypt(JSON.stringify(msg), keyRef.current);
                sendData(connRef.current, encrypted);
            } catch (err) {
                console.error('[App] Failed to send message:', err);
                // Queue it if send fails
                enqueue(msg);
            }
        } else {
            // Queue the message for later
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
    }, [myUsername]);

    // ─── Send GIF Message ────────────────────────────────
    const handleSendGif = useCallback(async (gifUrl) => {
        if (!gifUrl) return;

        const msg = {
            type: 'chat',
            gifUrl,
            timestamp: Date.now(),
        };

        const isConnected = connRef.current && connRef.current.open;

        if (isConnected) {
            try {
                const encrypted = await encrypt(JSON.stringify(msg), keyRef.current);
                sendData(connRef.current, encrypted);
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
    }, [myUsername]);

    // ─── Send Draw Data ──────────────────────────────────
    const handleDraw = useCallback(async (drawData) => {
        if (!connRef.current) return;

        const msg = { type: 'draw', ...drawData };
        const encrypted = await encrypt(JSON.stringify(msg), keyRef.current);
        sendData(connRef.current, encrypted);
    }, []);

    // ─── Send Clear Canvas ───────────────────────────────
    const handleClearCanvas = useCallback(async () => {
        if (!connRef.current) return;
        const msg = { type: 'clear-canvas' };
        const encrypted = await encrypt(JSON.stringify(msg), keyRef.current);
        sendData(connRef.current, encrypted);
        window.dispatchEvent(new CustomEvent('local-clear-canvas'));
    }, []);

    // ─── Canvas State Persistence ────────────────────────
    const handleCanvasSave = useCallback((dataUrl) => {
        saveCanvas(dataUrl);
    }, []);

    // ─── Disconnect ──────────────────────────────────────
    const handleDisconnect = useCallback(() => {
        stopReconnectLoop();
        stopHeartbeat();
        if (connRef.current) connRef.current.close();
        if (peerRef.current) peerRef.current.destroy();
        connRef.current = null;
        peerRef.current = null;
        keyRef.current = null;
        setStatus('disconnected');
        setView('connection');
        setMessages([]);
        setError('');
        setPeerUsername('');
        setReconnectAttempt(0);
        setMaxRetriesReached(false);
        localStorage.removeItem(SESSION_KEY);
        clearQueue();
        clearOfflineData();
    }, [stopReconnectLoop, stopHeartbeat]);

    // ─── Auto-reconnect on mount ─────────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SESSION_KEY);
            if (saved) {
                const session = JSON.parse(saved);
                setMyUsername(session.username);
                if (session.targetUsername) setPeerUsername(session.targetUsername);
                if (session.peerUsername) setPeerUsername(session.peerUsername);

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
            stopHeartbeat();
            if (connRef.current) connRef.current.close();
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
                peerUsername={peerUsername}
                drawColor={drawColor}
                onColorChange={setDrawColor}
                brushSize={brushSize}
                onBrushSizeChange={setBrushSize}
                isEraser={isEraser}
                onEraserToggle={() => setIsEraser(!isEraser)}
                onClearCanvas={handleClearCanvas}
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
