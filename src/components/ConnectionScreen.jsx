import { useState } from 'react';
import logo from '../assets/logo.png';

export default function ConnectionScreen({ onCreateRoom, onJoinRoom, status, error, savedSession }) {
    const [username, setUsername] = useState(savedSession?.username || '');
    const [targetUsername, setTargetUsername] = useState(savedSession?.targetUsername || '');
    const [passphrase, setPassphrase] = useState(savedSession?.passphrase || '');
    const [mode, setMode] = useState(savedSession?.mode || 'choose'); // 'choose' | 'create' | 'join'

    const isLoading = status === 'connecting';

    const handleCreate = (e) => {
        e.preventDefault();
        if (!username.trim() || !passphrase.trim()) return;
        onCreateRoom(username.trim().toLowerCase(), passphrase);
    };

    const handleJoin = (e) => {
        e.preventDefault();
        if (!username.trim() || !targetUsername.trim() || !passphrase.trim()) return;
        onJoinRoom(username.trim().toLowerCase(), targetUsername.trim().toLowerCase(), passphrase);
    };

    return (
        <div className="connection-screen">
            <div className="connection-bg">
                <div className="orb orb-1"></div>
                <div className="orb orb-2"></div>
                <div className="orb orb-3"></div>
            </div>

            <div className="connection-card">
                <div className="logo">
                    <div className="logo-icon">
                        <img src={logo} alt="Chat & Draw Logo" className="logo-image" />
                    </div>
                    <h1>Chat & Draw</h1>
                    <p className="subtitle">Collaborate in real time with end-to-end encryption</p>
                </div>

                {error && (
                    <div className="error-banner">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {error}
                    </div>
                )}

                {mode === 'choose' && (
                    <div className="mode-chooser fade-in">
                        <button className="btn btn-primary btn-lg" onClick={() => setMode('create')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 8v8M8 12h8" />
                            </svg>
                            Create Room
                        </button>
                        <button className="btn btn-secondary btn-lg" onClick={() => setMode('join')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
                            </svg>
                            Join Room
                        </button>
                    </div>
                )}

                {mode === 'create' && (
                    <form className="connection-form fade-in" onSubmit={handleCreate}>
                        <button type="button" className="back-btn" onClick={() => setMode('choose')}>
                            ← Back
                        </button>
                        <div className="input-group">
                            <label>Your Username</label>
                            <input
                                type="text"
                                placeholder="e.g. alice"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={isLoading}
                                autoFocus
                            />
                        </div>
                        <div className="input-group">
                            <label>Shared Passphrase</label>
                            <input
                                type="password"
                                placeholder="Secret passphrase for encryption"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                disabled={isLoading}
                            />
                            <span className="input-hint">Share this passphrase with your peer</span>
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg" disabled={isLoading || !username.trim() || !passphrase.trim()}>
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    Waiting for peer...
                                </>
                            ) : (
                                'Create Room'
                            )}
                        </button>
                    </form>
                )}

                {mode === 'join' && (
                    <form className="connection-form fade-in" onSubmit={handleJoin}>
                        <button type="button" className="back-btn" onClick={() => setMode('choose')}>
                            ← Back
                        </button>
                        <div className="input-group">
                            <label>Your Username</label>
                            <input
                                type="text"
                                placeholder="e.g. bob"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={isLoading}
                                autoFocus
                            />
                        </div>
                        <div className="input-group">
                            <label>Connect to Username</label>
                            <input
                                type="text"
                                placeholder="e.g. alice"
                                value={targetUsername}
                                onChange={(e) => setTargetUsername(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                        <div className="input-group">
                            <label>Shared Passphrase</label>
                            <input
                                type="password"
                                placeholder="Same passphrase as your peer"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                disabled={isLoading}
                            />
                            <span className="input-hint">Must match the room creator's passphrase</span>
                        </div>
                        <button type="submit" className="btn btn-primary btn-lg" disabled={isLoading || !username.trim() || !targetUsername.trim() || !passphrase.trim()}>
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    Connecting...
                                </>
                            ) : (
                                'Join Room'
                            )}
                        </button>
                    </form>
                )}

                <div className="encryption-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    End-to-end encrypted
                </div>
            </div>
        </div>
    );
}
