/**
 * Offline Storage Service
 * 
 * Persists chat messages and canvas state to localStorage
 * so data survives page refreshes and app restarts.
 */

const MESSAGES_KEY = 'chatcolab-messages';
const CANVAS_KEY = 'chatcolab-canvas';

// ─── Messages ────────────────────────────────────────────

/**
 * Save the messages array to localStorage.
 * @param {Array} messages
 */
export function saveMessages(messages) {
    try {
        // Keep only the last 500 messages to avoid storage limits
        const trimmed = messages.slice(-500);
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed));
    } catch (err) {
        console.error('[OfflineStorage] Failed to save messages:', err);
    }
}

/**
 * Load messages from localStorage.
 * @returns {Array}
 */
export function loadMessages() {
    try {
        const data = localStorage.getItem(MESSAGES_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// ─── Canvas ──────────────────────────────────────────────

/**
 * Save the canvas state as a data URL.
 * @param {string} dataUrl - The result of canvas.toDataURL()
 */
export function saveCanvas(dataUrl) {
    try {
        localStorage.setItem(CANVAS_KEY, dataUrl);
    } catch (err) {
        console.error('[OfflineStorage] Failed to save canvas:', err);
    }
}

/**
 * Load the saved canvas data URL.
 * @returns {string|null}
 */
export function loadCanvas() {
    try {
        return localStorage.getItem(CANVAS_KEY);
    } catch {
        return null;
    }
}

// ─── Cleanup ─────────────────────────────────────────────

/**
 * Clear all offline data (messages + canvas).
 */
export function clearAll() {
    localStorage.removeItem(MESSAGES_KEY);
    localStorage.removeItem(CANVAS_KEY);
}
