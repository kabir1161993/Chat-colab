/**
 * E2E Encryption Service using Web Crypto API (AES-GCM)
 * 
 * Both peers must enter the same passphrase to derive the same key.
 * All messages are encrypted before being sent over WebRTC.
 */

const SALT = new TextEncoder().encode('chat-colab-e2e-salt-v1');
const ITERATIONS = 100000;

/**
 * Derives an AES-GCM CryptoKey from a shared passphrase using PBKDF2.
 */
export async function deriveKey(passphrase) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: SALT,
            iterations: ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a string using AES-GCM. Returns a base64-encoded string (iv + ciphertext).
 */
export async function encrypt(plaintext, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );

    // Combine IV + ciphertext into a single array
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64-encoded AES-GCM ciphertext back to a string.
 */
export async function decrypt(base64Ciphertext, key) {
    const combined = Uint8Array.from(atob(base64Ciphertext), c => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);
}
