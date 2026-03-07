# Chat & Draw

A peer-to-peer chat and collaborative drawing app built with React and WebRTC. No server stores your messages — everything is encrypted end-to-end and sent directly between peers.

🔗 **Live Demo:** [GitHub Pages](https://kabir1161993.github.io/Chat-colab/)

---

## ✨ Features

- **Peer-to-Peer Chat** — Direct WebRTC connections via [PeerJS](https://peerjs.com/). No middleman server.
- **End-to-End Encryption** — All messages encrypted with AES-256-GCM using a shared passphrase (PBKDF2 key derivation).
- **Collaborative Drawing Canvas** — Draw together in real-time with customizable colors and brush sizes.
- **GIF Support** — Search and send GIFs inline, powered by GIPHY.
- **Offline Message Queuing** — Messages typed while disconnected are queued and sent automatically on reconnect.
- **Auto-Reconnect** — Exponential backoff reconnection with up to 10 retry attempts.
- **Heartbeat System** — Ping/pong mechanism to detect dropped connections early.
- **Session Persistence** — Refreshing the page automatically restores your session.
- **Haptic Feedback** — Native vibration on new messages (Android app via Capacitor).
- **Mobile-First UI** — Responsive design with a tab bar for switching between Chat and Draw modes.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Real-time | PeerJS (WebRTC) |
| Encryption | Web Crypto API (AES-GCM + PBKDF2) |
| Mobile | Capacitor (Android) |
| Hosting | GitHub Pages |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
# Clone the repo
git clone https://github.com/kabir1161993/Chat-colab.git
cd Chat-colab

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for GitHub Pages

```bash
npm run build:pages
```

This outputs to the `docs/` directory with relative asset paths.

---

## 📱 Android Build (Capacitor)

```bash
# Build the web app
npm run build

# Sync with Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android
```

---

## 🏗 Project Structure

```
src/
├── App.jsx                    # Main app — state management, peer lifecycle
├── main.jsx                   # Entry point
├── index.css                  # Global styles
├── components/
│   ├── ConnectionScreen.jsx   # Create/Join room UI
│   ├── ChatPanel.jsx          # Message list + input
│   ├── DrawingCanvas.jsx      # Collaborative canvas
│   ├── GifPicker.jsx          # GIPHY search + picker
│   ├── Toast.jsx              # Toast notifications
│   └── Toolbar.jsx            # Top bar with controls
├── services/
│   ├── peerConnection.js      # PeerJS setup, ICE/TURN config
│   ├── encryption.js          # AES-GCM encrypt/decrypt
│   ├── messageQueue.js        # Offline message queue
│   └── offlineStorage.js      # localStorage persistence
└── assets/
    ├── logo.png
    └── logo.jpg
```

---

## 🔒 How Encryption Works

1. Both peers enter the **same passphrase** when creating/joining a room.
2. The passphrase is run through **PBKDF2** (100,000 iterations, SHA-256) to derive an AES-256 key.
3. Every message is encrypted with **AES-GCM** using a random 12-byte IV before transmission.
4. The PeerJS signaling server only sees encrypted blobs — it cannot read your messages.

---

## 📄 License

This project is for personal use.
