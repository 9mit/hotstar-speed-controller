/**
 * Stream Pro Speed (v2.1)
 * Playback rate control for Hotstar, JioHotstar, Netflix, and Prime Video.
 */
(function () {
    'use strict';

    const APP_NAME = 'Stream Pro Speed';
    const ROOT_FLAG = 'hsSpeedBootedV2';
    const TOGGLE_EVENT = 'hs-speed-toggle-v2';
    const DEFAULT_SPEEDS = [1, 1.5, 2, 2.5];
    const REFRESH_MS = 1000;
    const MAX_SPEED = 16;

    if (document.documentElement.dataset[ROOT_FLAG] === 'true') {
        window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
        return;
    }
    document.documentElement.dataset[ROOT_FLAG] = 'true';

    // --- Shared video discovery (incl. open shadow roots) ---
    function collectVideos(root, results) {
        if (!root) return results;
        try {
            root.querySelectorAll('video').forEach((v) => results.push(v));
            root.querySelectorAll('*').forEach((el) => {
                if (el.shadowRoot) collectVideos(el.shadowRoot, results);
            });
        } catch (_) { /* cross-origin or closed shadow roots */ }
        return results;
    }

    function pickLargestVideo(videos) {
        const connected = videos.filter((v) => v.isConnected && v.readyState >= 1);
        const pool = connected.length ? connected : videos.filter((v) => v.isConnected);
        if (!pool.length) return videos[0] || null;
        return pool.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
    }

    function cleanTitle(raw, suffixes) {
        let title = (raw || '').trim();
        for (const suffix of suffixes) {
            title = title.replace(suffix, '').trim();
        }
        return title || 'Current Video';
    }

    // --- Platform adapters ---
    const Platforms = {
        hotstar: {
            id: 'hotstar',
            label: 'Hotstar',
            match(hostname) {
                return /(^|\.)hotstar\.com$|(^|\.)jiohotstar\.com$/i.test(hostname);
            },
            getContentId(pathname) {
                const match = pathname.match(/\/([0-9]{8,15})\/watch/);
                return match ? match[1] : 'generic';
            },
            getTitle() {
                return cleanTitle(document.title, [
                    /\s*-\s*(JioHotstar|Disney\+ Hotstar|Hotstar).*$/i
                ]);
            }
        },

        netflix: {
            id: 'netflix',
            label: 'Netflix',
            match(hostname) {
                return /(^|\.)netflix\.com$/i.test(hostname);
            },
            getContentId(pathname) {
                const watch = pathname.match(/\/watch\/(\d+)/);
                if (watch) return watch[1];
                const title = pathname.match(/\/title\/(\d+)/);
                if (title) return title[1];
                return 'generic';
            },
            getTitle() {
                return cleanTitle(document.title, [
                    /\s*\|\s*Netflix\s*$/i,
                    /\s*-\s*Netflix\s*$/i
                ]);
            }
        },

        prime: {
            id: 'prime',
            label: 'Prime Video',
            match(hostname, pathname) {
                if (/(^|\.)primevideo\.com$/i.test(hostname)) return true;
                if (/(^|\.)amazon\./i.test(hostname)) {
                    return /\/gp\/video\b|\/detail\//i.test(pathname || '');
                }
                return false;
            },
            getContentId(pathname) {
                const detail = pathname.match(/\/(?:gp\/video\/)?detail\/([A-Z0-9]+)/i);
                if (detail) return detail[1];
                const watch = pathname.match(/\/(?:region\/[^/]+\/)?video\/detail\/([A-Z0-9]+)/i);
                if (watch) return watch[1];
                const asins = pathname.match(/\/([A-Z0-9]{10})(?:\/|$|\?)/);
                if (asins) return asins[1];
                return 'generic';
            },
            getTitle() {
                return cleanTitle(document.title, [
                    /\s*:\s*Prime Video\s*$/i,
                    /\s*-\s*Prime Video\s*$/i,
                    /\s*\|\s*Prime Video\s*$/i,
                    /\s*:\s*Amazon\.co.*$/i,
                    /\s*-\s*Amazon\.co.*$/i,
                    /\s*:\s*Amazon\.com.*$/i,
                    /\s*-\s*Amazon\.com.*$/i
                ]);
            }
        }
    };

    function detectPlatform() {
        const hostname = window.location.hostname;
        const pathname = window.location.pathname;
        for (const platform of Object.values(Platforms)) {
            if (platform.match(hostname, pathname)) return platform;
        }
        return null;
    }

    const Platform = detectPlatform();
    if (!Platform) {
        console.warn(`[${APP_NAME}] Unsupported host: ${window.location.hostname}`);
        return;
    }

    // --- HSE_Store: Persistence & Settings ---
    const HSE_Store = {
        settings: {
            globalSpeed: 1,
            showSpeeds: {}
        },

        async init() {
            return new Promise((resolve) => {
                if (typeof chrome === 'undefined' || !chrome.storage) {
                    console.warn('[HSE] Chrome Storage unavailable, using defaults.');
                    return resolve();
                }
                chrome.storage.local.get(['hse_settings'], (result) => {
                    if (result.hse_settings) {
                        this.settings = { ...this.settings, ...result.hse_settings };
                    }
                    resolve();
                });
            });
        },

        async save() {
            return new Promise((resolve) => {
                chrome.storage.local.set({ hse_settings: this.settings }, resolve);
            });
        },

        storageKey(showId) {
            return `${Platform.id}:${showId}`;
        },

        getSpeedForShow(showId) {
            const key = this.storageKey(showId);
            // Prefer platform-namespaced key; fall back to bare Hotstar IDs for migration
            if (this.settings.showSpeeds[key] != null) {
                return this.settings.showSpeeds[key];
            }
            if (Platform.id === 'hotstar' && this.settings.showSpeeds[showId] != null) {
                return this.settings.showSpeeds[showId];
            }
            return this.settings.globalSpeed;
        },

        setSpeedForShow(showId, speed) {
            this.settings.showSpeeds[this.storageKey(showId)] = speed;
            this.save();
        }
    };

    // --- HSE_Intel: DOM & Pattern Analysis ---
    const HSE_Intel = {
        getContentInfo() {
            const path = window.location.pathname;
            const id = Platform.getContentId(path);
            let title = 'Current Video';
            try {
                title = Platform.getTitle();
            } catch (_) {}
            return { id, title, platform: Platform.id, isLive: false };
        },

        getBufferMargin(video) {
            if (!video || !video.buffered.length) return 0;
            const current = video.currentTime;
            for (let i = 0; i < video.buffered.length; i++) {
                if (current >= video.buffered.start(i) && current <= video.buffered.end(i)) {
                    return video.buffered.end(i) - current;
                }
            }
            return 0;
        },

        getVideo() {
            return pickLargestVideo(collectVideos(document, []));
        }
    };

    // --- HSE_Engine: Action & Enforcement ---
    const HSE_Engine = {
        currentSpeed: 1,
        activeVideo: null,
        currentContext: null,
        enforceCount: 0,
        lastContentId: null,

        setSpeed(speed, isPersistent = true) {
            const video = HSE_Intel.getVideo();
            if (!video) return;

            const clamped = Math.min(MAX_SPEED, Math.max(0.1, speed));
            this.currentSpeed = clamped;
            video.playbackRate = clamped;
            video.defaultPlaybackRate = clamped;

            if (isPersistent) {
                const info = HSE_Intel.getContentInfo();
                HSE_Store.setSpeedForShow(info.id, clamped);
                HSE_UI.update();
                HSE_UI.flash(clamped + 'x');
            }
        },

        syncContentSpeed() {
            const info = HSE_Intel.getContentInfo();
            if (info.id === this.lastContentId) return;
            this.lastContentId = info.id;
            const saved = HSE_Store.getSpeedForShow(info.id);
            this.setSpeed(saved, false);
            HSE_UI.update();
        },

        enforce() {
            const video = HSE_Intel.getVideo();
            if (!video) return;

            this.syncContentSpeed();

            const target = this.currentSpeed;
            if (Math.abs(video.playbackRate - target) > 0.01) {
                this.setSpeed(target, false);
            }
            HSE_UI.updateStatus();

            this.enforceCount++;
            if (this.enforceCount % 5 === 0) {
                const margin = HSE_Intel.getBufferMargin(video);
                console.log(
                    `[HSE] ${Platform.label} | Buffer: ${Math.round(margin)}s | Speed: ${video.playbackRate}x`
                );
            }
        }
    };

    // --- HSE_UI: Interface & Indicators ---
    const HSE_UI = {
        panel: null,
        hideTimer: null,
        flashTimer: null,

        init() {
            this.createIndicator();
            window.addEventListener(TOGGLE_EVENT, () => this.toggle());
        },

        createIndicator() {
            const ind = document.createElement('div');
            ind.id = 'hse-flash-indicator';
            document.body.appendChild(ind);
        },

        flash(text, isLong = false) {
            const ind = document.getElementById('hse-flash-indicator');
            if (!ind) return;
            ind.textContent = text;
            ind.classList.add('is-visible');
            if (this.flashTimer) clearTimeout(this.flashTimer);
            this.flashTimer = setTimeout(() => ind.classList.remove('is-visible'), isLong ? 2000 : 800);
        },

        toggle() {
            if (this.panel) {
                this.remove();
            } else {
                console.log('[HSE] Building UI Panel...');
                this.build();
            }
        },

        build() {
            if (this.panel) this.panel.remove();

            const info = HSE_Intel.getContentInfo();
            HSE_Engine.currentSpeed = HSE_Store.getSpeedForShow(info.id);
            HSE_Engine.lastContentId = info.id;

            const panel = document.createElement('div');
            panel.id = 'hs-speed-panel';
            panel.className = 'mode-vod';

            const controlsHtml = `
                    <div class="hs-speed-btn-container">
                        ${DEFAULT_SPEEDS.map((s) =>
                            `<button class="hs-speed-btn ${Math.abs(s - HSE_Engine.currentSpeed) < 0.01 ? 'is-active' : ''}" data-speed="${s}">${s}x</button>`
                        ).join('')}
                    </div>
                `;

            panel.innerHTML = `
                <div id="hs-speed-header">
                    <span id="hs-speed-title">${info.title}</span>
                    <span class="hse-badge">${Platform.label}</span>
                </div>
                <div id="hs-speed-status">Initialising...</div>
                ${controlsHtml}
            `;

            document.body.appendChild(panel);
            this.panel = panel;

            panel.querySelectorAll('.hs-speed-btn').forEach((btn) => {
                btn.onclick = () => {
                    HSE_Engine.setSpeed(parseFloat(btn.dataset.speed));
                    this.resetHideTimer();
                };
            });

            this.resetHideTimer();
        },

        update() {
            if (!this.panel) return;
            const speed = HSE_Engine.currentSpeed;
            this.panel.querySelectorAll('.hs-speed-btn').forEach((btn) => {
                btn.classList.toggle('is-active', Math.abs(parseFloat(btn.dataset.speed) - speed) < 0.01);
            });
            const titleEl = document.getElementById('hs-speed-title');
            if (titleEl) {
                titleEl.textContent = HSE_Intel.getContentInfo().title;
            }
        },

        updateStatus(text) {
            const status = document.getElementById('hs-speed-status');
            if (status) {
                status.textContent = text || `Current Speed: ${HSE_Engine.currentSpeed}x`;
            }
        },

        resetHideTimer() {
            if (this.hideTimer) clearTimeout(this.hideTimer);
            this.hideTimer = setTimeout(() => {
                if (this.panel) {
                    this.panel.classList.add('fade-out');
                    setTimeout(() => this.remove(), 400);
                }
            }, 4000);
        },

        remove() {
            if (this.panel) {
                this.panel.remove();
                this.panel = null;
            }
            if (this.hideTimer) clearTimeout(this.hideTimer);
        }
    };

    // --- HSE_Input: Keyboard ---
    const HSE_Input = {
        init() {
            window.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                    return;
                }

                if (e.key === '[') {
                    HSE_Engine.setSpeed(Math.max(0.1, +(HSE_Engine.currentSpeed - 0.1).toFixed(1)));
                } else if (e.key === ']') {
                    HSE_Engine.setSpeed(Math.min(MAX_SPEED, +(HSE_Engine.currentSpeed + 0.1).toFixed(1)));
                }
            });
        }
    };

    // --- INITIALIZATION ---
    async function init() {
        console.log(`[HSE] Initialising ${APP_NAME} on ${Platform.label}...`);
        await HSE_Store.init();
        HSE_UI.init();
        HSE_Input.init();

        setInterval(() => {
            HSE_Engine.enforce();
        }, REFRESH_MS);

        const loadInitialSpeed = () => {
            HSE_Engine.lastContentId = null;
            HSE_Engine.syncContentSpeed();
        };

        window.addEventListener('popstate', loadInitialSpeed);

        const originalPush = history.pushState;
        history.pushState = function () {
            originalPush.apply(this, arguments);
            setTimeout(loadInitialSpeed, 500);
        };

        const originalReplace = history.replaceState;
        history.replaceState = function () {
            originalReplace.apply(this, arguments);
            setTimeout(loadInitialSpeed, 500);
        };

        loadInitialSpeed();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
