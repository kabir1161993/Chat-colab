const COLORS = [
    '#6C5CE7', '#a29bfe', '#fd79a8', '#e17055',
    '#00b894', '#00cec9', '#0984e3', '#fdcb6e',
    '#e84393', '#d63031', '#ffffff', '#2d3436',
];

export default function Toolbar({
    status,
    myUsername,
    peerUsername,
    drawColor,
    onColorChange,
    brushSize,
    onBrushSizeChange,
    isEraser,
    onEraserToggle,
    onClearCanvas,
    onDisconnect,
    activeTab,
    reconnectAttempt = 0,
    maxReconnectAttempts = 10,
    isNetworkOnline = true,
    maxRetriesReached = false,
    onManualRetry,
}) {
    const getStatusInfo = () => {
        if (!isNetworkOnline) {
            return { dotClass: 'status-offline', text: 'You\'re offline' };
        }
        switch (status) {
            case 'connected':
                return { dotClass: 'status-connected', text: `Connected with ${peerUsername}` };
            case 'reconnecting':
                if (maxRetriesReached) {
                    return { dotClass: 'status-disconnected', text: 'Connection lost' };
                }
                return {
                    dotClass: 'status-reconnecting',
                    text: `Reconnecting… (${reconnectAttempt}/${maxReconnectAttempts})`,
                };
            case 'offline':
                return { dotClass: 'status-offline', text: 'No network connection' };
            default:
                return { dotClass: 'status-disconnected', text: 'Disconnected' };
        }
    };

    const { dotClass, text } = getStatusInfo();

    return (
        <div className={`toolbar ${activeTab === 'draw' ? 'show-draw-tools' : ''}`}>
            <div className="toolbar-left">
                <div className={`status-indicator ${status}`}>
                    <span className={`status-dot ${dotClass}`}></span>
                    <span className="status-text">{text}</span>
                </div>
                {maxRetriesReached && onManualRetry && (
                    <button className="btn btn-retry btn-sm" onClick={onManualRetry}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                        </svg>
                        Try Again
                    </button>
                )}
            </div>

            <div className="toolbar-center drawing-tools">
                <div className="color-palette">
                    {COLORS.map((c) => (
                        <button
                            key={c}
                            className={`color-swatch ${drawColor === c && !isEraser ? 'active' : ''}`}
                            style={{ backgroundColor: c }}
                            onClick={() => {
                                onColorChange(c);
                                if (isEraser) onEraserToggle();
                            }}
                            title={c}
                        />
                    ))}
                </div>

                <div className="brush-controls">
                    <label className="brush-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <circle cx="12" cy="12" r="10" />
                        </svg>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            value={brushSize}
                            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                        />
                        <span className="brush-size-value">{brushSize}px</span>
                    </label>
                </div>

                <button
                    className={`tool-btn ${isEraser ? 'active' : ''}`}
                    onClick={onEraserToggle}
                    title="Eraser"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M20 20H7L3 16a1 1 0 010-1.4l9.6-9.6a2 2 0 012.8 0L21 10.6a2 2 0 010 2.8L15 19" />
                    </svg>
                    Eraser
                </button>

                <button className="tool-btn" onClick={onClearCanvas} title="Clear Canvas">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </svg>
                    Clear
                </button>
            </div>

            <div className="toolbar-right desktop-only">
                <span className="username-badge">@{myUsername}</span>
                <button className="btn btn-danger btn-sm" onClick={onDisconnect}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    Leave
                </button>
            </div>
        </div>
    );
}
