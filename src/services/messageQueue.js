/**
 * Message Queue Service
 * 
 * Queues outgoing messages when the peer connection is unavailable.
 * Messages are stored in localStorage so they survive page refreshes.
 * On reconnect, the queue is flushed in order.
 */

const QUEUE_KEY = 'chatcolab-message-queue';

function loadQueue() {
    try {
        const data = localStorage.getItem(QUEUE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Add a message to the pending queue.
 * @param {{ type: string, text?: string, timestamp: number, [key: string]: any }} msg
 */
export function enqueue(msg) {
    const queue = loadQueue();
    queue.push({ ...msg, queuedAt: Date.now() });
    saveQueue(queue);
}

/**
 * Get all pending messages without removing them.
 */
export function getPending() {
    return loadQueue();
}

/**
 * Flush all queued messages using the provided async send function.
 * Removes each message from the queue after it's successfully sent.
 * @param {(msg: object) => Promise<void>} sendFn
 * @returns {Promise<number>} Number of messages flushed
 */
export async function flush(sendFn) {
    const queue = loadQueue();
    if (queue.length === 0) return 0;

    let sent = 0;
    const remaining = [...queue];

    for (const msg of queue) {
        try {
            // Remove queuedAt before sending
            const { queuedAt, ...payload } = msg;
            await sendFn(payload);
            remaining.shift(); // Remove from front
            sent++;
        } catch (err) {
            console.error('[MessageQueue] Failed to flush message:', err);
            break; // Stop on first failure to maintain order
        }
    }

    saveQueue(remaining);
    return sent;
}

/**
 * Clear the entire queue.
 */
export function clear() {
    localStorage.removeItem(QUEUE_KEY);
}

/**
 * Get the number of queued messages.
 */
export function size() {
    return loadQueue().length;
}
