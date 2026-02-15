import { useState, useEffect, useRef, useCallback } from 'react';

const GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

export default function GifPicker({ onSelectGif, onClose }) {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const searchTimerRef = useRef(null);
    const panelRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                onClose();
            }
        };
        // Delay to avoid the opening click triggering close
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    // Fetch GIFs (trending or search)
    const fetchGifs = useCallback(async (searchQuery = '') => {
        setLoading(true);
        setError('');
        try {
            const endpoint = searchQuery.trim()
                ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=20&rating=pg`
                : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg`;

            const res = await fetch(endpoint);
            if (!res.ok) throw new Error('Failed to fetch GIFs');
            const data = await res.json();
            setGifs(data.data || []);
        } catch (err) {
            console.error('[GifPicker] Error:', err);
            setError('Could not load GIFs');
            setGifs([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load trending on mount
    useEffect(() => {
        fetchGifs();
    }, [fetchGifs]);

    // Debounced search
    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            fetchGifs(query);
        }, 300);
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, [query, fetchGifs]);

    const handleSelect = (gif) => {
        // Use the fixed_width version for a good balance of quality and size
        const url = gif.images?.fixed_width?.url || gif.images?.original?.url;
        if (url) {
            onSelectGif(url);
            onClose();
        }
    };

    return (
        <div className="gif-picker" ref={panelRef}>
            <div className="gif-picker-header">
                <div className="gif-picker-search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search GIFs..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>
                <button className="gif-picker-close" onClick={onClose}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            <div className="gif-picker-grid">
                {loading && gifs.length === 0 && (
                    <div className="gif-picker-loading">
                        <span className="spinner"></span>
                    </div>
                )}
                {error && (
                    <div className="gif-picker-error">{error}</div>
                )}
                {!loading && !error && gifs.length === 0 && (
                    <div className="gif-picker-empty">No GIFs found</div>
                )}
                {gifs.map((gif) => (
                    <button
                        key={gif.id}
                        className="gif-picker-item"
                        onClick={() => handleSelect(gif)}
                        title={gif.title}
                    >
                        <img
                            src={gif.images?.fixed_width_small?.url || gif.images?.fixed_width?.url}
                            alt={gif.title}
                            loading="lazy"
                        />
                    </button>
                ))}
            </div>

            <div className="gif-picker-footer">
                <img
                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Giphy-logo.svg/200px-Giphy-logo.svg.png"
                    alt="Powered by GIPHY"
                    className="giphy-attribution"
                />
            </div>
        </div>
    );
}
