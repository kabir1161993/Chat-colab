import { useRef, useEffect, useCallback } from 'react';

export default function DrawingCanvas({ onDraw, color, brushSize, onCanvasSave, savedCanvasData }) {
    const canvasRef = useRef(null);
    const isDrawingRef = useRef(false);
    const lastPosRef = useRef({ x: 0, y: 0 });
    const saveTimerRef = useRef(null);
    const hasRestoredRef = useRef(false);

    // Debounced canvas save — saves 500ms after the last stroke
    const scheduleSave = useCallback(() => {
        if (!onCanvasSave) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const canvas = canvasRef.current;
            if (canvas) {
                onCanvasSave(canvas.toDataURL());
            }
        }, 500);
    }, [onCanvasSave]);

    // Get CSS pixel dimensions of the canvas element
    const getCanvasCSSSize = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return { w: 1, h: 1 };
        const rect = canvas.getBoundingClientRect();
        return { w: rect.width || 1, h: rect.height || 1 };
    }, []);

    // Get canvas position relative to viewport (in CSS pixels)
    const getPos = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        if (e.touches && e.touches.length > 0) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top,
            };
        }
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }, []);

    // Draw a line segment on the canvas
    const drawLine = useCallback((x1, y1, x2, y2, strokeColor, strokeSize) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }, []);

    // Mouse/touch handlers
    const handleStart = useCallback((e) => {
        e.preventDefault();
        isDrawingRef.current = true;
        const pos = getPos(e);
        lastPosRef.current = pos;

        // Draw a dot for single clicks
        drawLine(pos.x, pos.y, pos.x + 0.1, pos.y + 0.1, color, brushSize);

        // Normalize coords to 0–1 before sending to peer
        const { w, h } = getCanvasCSSSize();
        onDraw({
            x1: pos.x / w, y1: pos.y / h,
            x2: (pos.x + 0.1) / w, y2: (pos.y + 0.1) / h,
            color, brushSize,
        });
    }, [getPos, getCanvasCSSSize, drawLine, color, brushSize, onDraw]);

    const handleMove = useCallback((e) => {
        if (!isDrawingRef.current) return;
        e.preventDefault();
        const pos = getPos(e);
        const last = lastPosRef.current;

        drawLine(last.x, last.y, pos.x, pos.y, color, brushSize);

        // Normalize coords to 0–1 before sending to peer
        const { w, h } = getCanvasCSSSize();
        onDraw({
            x1: last.x / w, y1: last.y / h,
            x2: pos.x / w, y2: pos.y / h,
            color, brushSize,
        });

        lastPosRef.current = pos;
    }, [getPos, getCanvasCSSSize, drawLine, color, brushSize, onDraw]);

    const handleEnd = useCallback(() => {
        isDrawingRef.current = false;
        scheduleSave();
    }, [scheduleSave]);

    // Listen for peer draw events
    useEffect(() => {
        const handlePeerDraw = (e) => {
            const { x1, y1, x2, y2, color: c, brushSize: s } = e.detail;
            // Convert normalized 0–1 coords back to local CSS pixels
            const { w, h } = getCanvasCSSSize();
            drawLine(x1 * w, y1 * h, x2 * w, y2 * h, c, s);
        };

        const handlePeerClear = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };

        const handleLocalClear = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };

        window.addEventListener('peer-draw', handlePeerDraw);
        window.addEventListener('peer-clear-canvas', handlePeerClear);
        window.addEventListener('local-clear-canvas', handleLocalClear);

        return () => {
            window.removeEventListener('peer-draw', handlePeerDraw);
            window.removeEventListener('peer-clear-canvas', handlePeerClear);
            window.removeEventListener('local-clear-canvas', handleLocalClear);
        };
    }, [drawLine]);

    // Setup canvas resolution
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;

        const resize = () => {
            const w = parent.clientWidth;
            const h = parent.clientHeight;
            if (w === 0 || h === 0) return; // Skip if hidden
            const dpr = window.devicePixelRatio || 1;
            const newW = Math.round(w * dpr);
            const newH = Math.round(h * dpr);

            // Skip if nothing actually changed (e.g. tab switch to same-size panel)
            if (canvas.width === newW && canvas.height === newH) {
                // Still try to restore saved data if we haven't yet
                if (savedCanvasData && !hasRestoredRef.current) {
                    hasRestoredRef.current = true;
                    const img = new Image();
                    img.onload = () => {
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                    };
                    img.src = savedCanvasData;
                }
                return;
            }

            // Save current drawing
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

            canvas.width = newW;
            canvas.height = newH;

            // Scale context so drawing coordinates map 1:1 with CSS pixels
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            // If we have saved data and haven't restored yet, use that instead of tempCanvas
            if (savedCanvasData && !hasRestoredRef.current) {
                hasRestoredRef.current = true;
                const img = new Image();
                img.onload = () => {
                    // Scale saved image to fill the full current canvas
                    ctx.drawImage(img, 0, 0, w, h);
                };
                img.src = savedCanvasData;
            } else {
                // Restore drawing — draw at CSS-pixel size since ctx is already scaled by dpr
                ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width / dpr, tempCanvas.height / dpr);
            }
        };

        // Initial resize
        resize();

        // Use ResizeObserver to handle all size changes (window resize, tab switch, etc.)
        const observer = new ResizeObserver(() => {
            resize();
        });

        observer.observe(parent);

        return () => {
            observer.disconnect();
        };
    }, []);

    return (
        <div className="drawing-panel">
            <div className="panel-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                    <path d="M2 2l7.586 7.586" />
                    <circle cx="11" cy="11" r="2" />
                </svg>
                <h2>Draw</h2>
            </div>
            <div className="canvas-container">
                <canvas
                    ref={canvasRef}
                    className="drawing-canvas"
                    onMouseDown={handleStart}
                    onMouseMove={handleMove}
                    onMouseUp={handleEnd}
                    onMouseLeave={handleEnd}
                    onTouchStart={handleStart}
                    onTouchMove={handleMove}
                    onTouchEnd={handleEnd}
                />
            </div>
        </div>
    );
}
