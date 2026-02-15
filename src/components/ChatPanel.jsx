import { useState, useRef, useEffect } from 'react';
import GifPicker from './GifPicker';

export default function ChatPanel({ messages, onSendMessage, onSendGif, myUsername, isConnected = true }) {
    const [input, setInput] = useState('');
    const [showGifPicker, setShowGifPicker] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!input.trim()) return;
        onSendMessage(input);
        setInput('');
        inputRef.current?.focus();
    };

    const handleGifSelect = (gifUrl) => {
        if (onSendGif) {
            onSendGif(gifUrl);
        }
        setShowGifPicker(false);
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusIcon = (msg) => {
        if (msg.sender !== 'me') return null;

        if (msg.status === 'pending') {
            return (
                <span className="message-status message-status-pending" title="Pending — will send when reconnected">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                </span>
            );
        }

        return (
            <span className="message-status message-status-sent" title="Sent">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
        );
    };

    return (
        <div className="chat-panel">
            <div className="panel-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <h2>Chat</h2>
            </div>

            <div className="messages-container">
                {messages.length === 0 && (
                    <div className="empty-chat">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                        <p>No messages yet</p>
                        <span>Say hello! 👋</span>
                    </div>
                )}
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`message ${msg.sender === 'me' ? 'message-mine' : 'message-peer'} ${msg.status === 'pending' ? 'message-pending' : ''} ${msg.gifUrl ? 'message-gif' : ''}`}
                    >
                        <div className="message-sender">{msg.sender === 'me' ? 'You' : msg.senderName}</div>
                        <div className={`message-bubble ${msg.gifUrl ? 'message-bubble-gif' : ''}`}>
                            {msg.gifUrl ? (
                                <img
                                    src={msg.gifUrl}
                                    alt="GIF"
                                    className="gif-message-img"
                                    loading="lazy"
                                />
                            ) : (
                                <p>{msg.text}</p>
                            )}
                            <span className="message-meta">
                                <span className="message-time">{formatTime(msg.timestamp)}</span>
                                {getStatusIcon(msg)}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {!isConnected && (
                <div className="offline-input-hint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Messages will send when reconnected
                </div>
            )}

            <div className="chat-input-area">
                {showGifPicker && (
                    <GifPicker
                        onSelectGif={handleGifSelect}
                        onClose={() => setShowGifPicker(false)}
                    />
                )}
                <form className="chat-input-form" onSubmit={handleSubmit}>
                    <button
                        type="button"
                        className={`gif-btn ${showGifPicker ? 'active' : ''}`}
                        onClick={() => setShowGifPicker(!showGifPicker)}
                        title="Send a GIF"
                    >
                        GIF
                    </button>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder={isConnected ? "Type a message..." : "Type a message (will queue)..."}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        autoFocus
                    />
                    <button type="submit" className="send-btn" disabled={!input.trim()}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}
