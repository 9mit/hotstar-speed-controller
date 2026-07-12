# Stream Pro Speed
### Playback speed control for Hotstar, Netflix & Prime Video

![Banner](coverpage.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.1-green.svg)](manifest.json)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20|%20Edge-lightgrey.svg)](https://developer.chrome.com/docs/extensions/)

Stream Pro Speed is a browser extension for playback rate control on **Disney+ Hotstar / JioHotstar**, **Netflix**, and **Amazon Prime Video**.

---

## Features

- **Multi-platform**: Works on Hotstar, JioHotstar, Netflix, and Prime Video (including regional Amazon video pages).
- **Speed presets**: Overlay controls for 1x, 1.5x, 2x, and 2.5x.
- **Keyboard**: `[` / `]` adjust speed by 0.1 (up to 16x).
- **Per-title memory**: Remembers your preferred speed per show/movie (namespaced per platform).
- **SPA-aware**: Reloads settings on client-side navigation (`pushState` / `replaceState` / `popstate`).
- **Shadow DOM video discovery**: Finds player `<video>` elements inside open shadow roots (needed on Netflix).

---

## Usage

1. Open a supported streaming site and start a video.
2. Click the extension icon to toggle the speed panel.
3. Use presets or `[` / `]` to change speed.

Supported hosts:
- `*.hotstar.com`, `*.jiohotstar.com`
- `*.netflix.com`
- `*.primevideo.com`
- Amazon video paths: `*/gp/video/*` on major regional Amazon domains

---

## Technical notes

- **Platform adapters** detect the host and extract content IDs from URL patterns (Hotstar watch IDs, Netflix title/watch IDs, Prime ASINs).
- **Enforcement loop** re-applies `playbackRate` every second if the site player resets it.
- **Storage** uses `chrome.storage.local` with keys like `netflix:80057281` so platforms never collide.

---

## Installation

1. Clone or download this repository.
2. Open Chrome → `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this project folder.
5. Open Hotstar, Netflix, or Prime Video and click the toolbar icon.

---

## Contributing

Contributions are welcome. Keep platform-specific URL/title/video logic inside the adapters in `content.js`.

---
*Disclaimer: This project is an independent tool and is not affiliated with Disney, Hotstar, Jio, Netflix, Amazon, or Prime Video.*
