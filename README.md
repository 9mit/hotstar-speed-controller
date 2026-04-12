# Hotstar Pro Speed
### Content-Aware Playback Assistant for Hotstar & JioHotstar

![Banner](coverpage.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.0-green.svg)](manifest.json)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20|%20Edge-lightgrey.svg)](https://developer.chrome.com/docs/extensions/)

Hotstar Pro Speed is a browser extension designed to enhance the viewing experience on Disney+ Hotstar and JioHotstar. It features intelligent playback rate control and automated advertisement handling.

---

## 🔥 Features

- **⚡ Automated Ad Handling**: Detects advertisements to automatically mute audio and increase the playback rate up to 16x (available for VOD).

- **🛡️ Buffer Monitoring**: Continuously monitors video buffer levels and automatically resets the playback rate to 1.0x if a buffer depletion is detected.
- **💾 Per-Show Persistence**: Remembers and automatically applies your preferred playback rate for individual series or movies.
- **⌨️ Keyboard Controls**: 
    - `[` / `]`: Increase or decrease playback rate by 0.1 increments.
    - `Shift` (Hold): Temporarily activate 2.5x "Burst Mode" for quick skips.

---

## 🛠️ Technical Implementation

The extension is built using modular components to ensure performance and reliability:

- **Intelligence Engine (`HSE_Intel`)**: Utilizes DOM pattern analysis to distinguish between standard content and advertisements. It also monitors the `video.buffered` API to manage stability.
- **Enforcement Loop (`HSE_Engine`)**: Operates on a 1-second interval to audit and correct the video playback state, preventing player-side resets from overriding user preferences.
- **State Management (`HSE_Store`)**: Uses `chrome.storage.local` for persistent, asynchronous storage of user settings and show-specific speeds.
- **Interface Layer (`HSE_UI`)**: A lightweight, overlay-based control panel built with standard CSS glassmorphism, providing visual status indicators and manual controls.

---

## 🧩 Problem Solving Approach

### 1. Handling Single Page Application (SPA) Navigation
Hotstar uses internal navigation that does not trigger standard page loads. To address this, the extension patches the browser's `history.pushState` API and listens for `popstate` events to re-initialize the assistant whenever a new video is loaded.



### 3. Buffer-Safe Playback
To prevent stuttering during high-speed playback on inconsistent network conditions, the extension identifies the "Buffer Margin". If the buffered range ahead of the playhead falls below 3 seconds, the speed is automatically throttled back to 1.0x to allow the buffer to recover.

---

## 📦 Installation

1.  Clone or download this repository to your local machine.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (top right corner).
4.  Click **Load unpacked** and select the root directory of this project.
5.  Navigate to a video on Hotstar or JioHotstar to start the assistant.

---

## 🤝 Contributing
Contributions are welcome. Please ensure that any pull requests follow the existing modular architecture and maintain consistent stylistic standards.

---
*Disclaimer: This project is an independent tool and is not affiliated with, endorsed by, or connected to Disney+ Hotstar or Jio Platforms.*
