/**
 * PeerJS Connection Service
 * 
 * Manages WebRTC peer-to-peer connections using PeerJS.
 * The username is used as the Peer ID for easy discovery.
 * 
 * Includes TURN server configuration for NAT traversal,
 * proper timeout cleanup, and heartbeat constants.
 */

import { Peer } from 'peerjs';

// ─── ICE Server Config (STUN + TURN) ────────────────────
// Free TURN servers from Open Relay Project for NAT traversal
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
    {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
    {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
];

// ─── Heartbeat Config ────────────────────────────────────
export const HEARTBEAT_INTERVAL = 15000; // Send ping every 15s
export const HEARTBEAT_TIMEOUT = 5000;   // Consider dead if no pong in 5s

// ─── Reconnect Config ────────────────────────────────────
export const MAX_RECONNECT_ATTEMPTS = 10;
export const INITIAL_RECONNECT_DELAY = 2000; // 2s
export const MAX_RECONNECT_DELAY = 30000;    // 30s

/**
 * Creates a new PeerJS instance with the given username as its ID.
 * Returns a promise that resolves when the peer is ready.
 */
export function createPeer(username) {
    return new Promise((resolve, reject) => {
        const peer = new Peer(username, {
            debug: 1,
            config: {
                iceServers: ICE_SERVERS,
            },
        });

        peer.on('open', (id) => {
            console.log(`[Peer] Connected to signaling server as: ${id}`);
            resolve(peer);
        });

        peer.on('error', (err) => {
            console.error('[Peer] Error:', err);
            if (err.type === 'unavailable-id') {
                reject(new Error('This username is already taken. Please choose another.'));
            } else if (err.type === 'peer-unavailable') {
                reject(new Error('Could not find the user you are trying to connect to.'));
            } else {
                reject(err);
            }
        });
    });
}

/**
 * Connects to another peer by their username.
 * Returns the DataConnection.
 * Properly cleans up on timeout.
 */
export function connectToPeer(peer, targetUsername) {
    return new Promise((resolve, reject) => {
        const conn = peer.connect(targetUsername, { reliable: true });

        const timeoutId = setTimeout(() => {
            if (!conn.open) {
                conn.close();
                reject(new Error('Connection timed out. Make sure the other user is online.'));
            }
        }, 15000);

        conn.on('open', () => {
            clearTimeout(timeoutId);
            console.log(`[Peer] Connected to: ${targetUsername}`);
            resolve(conn);
        });

        conn.on('error', (err) => {
            clearTimeout(timeoutId);
            console.error('[Peer] Connection error:', err);
            reject(err);
        });
    });
}

/**
 * Sends data through a PeerJS data connection.
 * Returns true if sent, false if connection is unavailable.
 */
export function sendData(connection, data) {
    if (connection && connection.open) {
        connection.send(data);
        return true;
    }
    return false;
}
