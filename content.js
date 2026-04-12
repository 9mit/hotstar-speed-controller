/**
 * Hotstar Pro 'Smart Assistant' (v2.0)
 * Intelligent, modular playback engine for Hotstar & JioHotstar.
 */
(function () {
    'use strict';

    // --- CONFIGURATION & CONSTANTS ---
    const APP_NAME = 'Hotstar Pro Speed';
    const ROOT_FLAG = 'hsSpeedBootedV2';
    const TOGGLE_EVENT = 'hs-speed-toggle-v2';
    const DEFAULT_SPEEDS = [1, 1.5, 2, 2.5];
    const REFRESH_MS = 1000;
    const AD_SPEED = 16;

    const HYSTERESIS_MS = 2000; // Delay before changing speed again

    // Prevent double injection
    if (document.documentElement.dataset[ROOT_FLAG] === 'true') {
        window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
        return;
    }
    document.documentElement.dataset[ROOT_FLAG] = 'true';

    // --- HSE_Store: Persistence & Settings ---
    const HSE_Store = {
        settings: {
            smartAds: true,
            smartMute: true,

            globalSpeed: 1,
            showSpeeds: {} // { showId: speed }
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

        getSpeedForShow(showId) {
            return this.settings.showSpeeds[showId] || this.settings.globalSpeed;
        },

        setSpeedForShow(showId, speed) {
            this.settings.showSpeeds[showId] = speed;
            this.save();
        }
    };

    // --- HSE_Intel: DOM & Pattern Analysis ---
    const HSE_Intel = {
        getContentInfo() {
            const video = this.getVideo();
            const path = window.location.pathname;
            const match = path.match(/\/([0-9]{8,15})\/watch/);
            const id = match ? match[1] : 'generic';
            
            let title = 'Current Video';
            try {
                title = document.title.replace(/\s*-\s*(JioHotstar|Disney\+ Hotstar|Hotstar).*$/i, '').trim() || 'Current Video';
            } catch(e) {}

            // Context Detection (Multi-Signal)
            return { id, title, isLive: false };
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



        isAdShowing() {
            // Hotstar marks ads with specific containers or "Ad •" text
            const adOverlay = document.querySelector('.ad-showing, [class*="ad-overlay"], [class*="ad-container"]');
            const adText = Array.from(document.querySelectorAll('div, span'))
                .find(el => (el.textContent.includes('Ad •') || el.textContent.includes('Advertisement')) && el.offsetWidth > 0);
            return !!(adOverlay || adText);
        },

        getVideo() {
            const videos = Array.from(document.querySelectorAll('video')).filter(v => v.isConnected && v.readyState >= 1);
            if (videos.length === 0) return Array.from(document.querySelectorAll('video'))[0] || null;
            return videos.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
        }
    };

    // --- HSE_Engine: Action & Enforcement ---
    const HSE_Engine = {
        currentSpeed: 1,
        activeVideo: null,
        isBursting: false,
        lastSpeedChange: 0,
        currentContext: null,
        enforceCount: 0,

        setSpeed(speed, isPersistent = true) {
            const video = HSE_Intel.getVideo();
            if (!video) return;

            // Hysteresis (only for automatic changes, not user clicks)
            if (!isPersistent && (Date.now() - this.lastSpeedChange < HYSTERESIS_MS)) return;

            this.currentSpeed = speed;
            video.playbackRate = speed;
            video.defaultPlaybackRate = speed;
            this.lastSpeedChange = Date.now();
            
            if (isPersistent) {
                const info = HSE_Intel.getContentInfo();
                HSE_Store.setSpeedForShow(info.id, speed);
                HSE_UI.update();
                HSE_UI.flash(speed + 'x');
            }
        },

        enforce() {
            const video = HSE_Intel.getVideo();
            if (!video) return;

            const info = HSE_Intel.getContentInfo();
            
            // 0. Context Swap Reset


            // 1. Check for Ads
            if (HSE_Store.settings.smartAds && HSE_Intel.isAdShowing()) {
                // Muting logic
                if (HSE_Store.settings.smartMute && !video.muted) {
                    video.muted = true;
                    video._hse_muted = true;
                }
                HSE_UI.updateAdOverlay(true, 'CONTENT');
                if (video.playbackRate !== AD_SPEED) video.playbackRate = AD_SPEED;
                return;
            }

            // Reset Ad state
            if (video._hse_muted) {
                video.muted = false;
                video._hse_muted = false;
            }
            HSE_UI.updateAdOverlay(false);

            // 2. Buffer Guard (Preemptive Safety)


            // 4. Burst mode (VOD ONLY)
            if (this.isBursting) {
                if (video.playbackRate !== 2.5) video.playbackRate = 2.5;
                return;
            }

            // 5. Standard selected speed
            const target = this.currentSpeed;
            if (Math.abs(video.playbackRate - target) > 0.01) {
                this.setSpeed(target, false);
            }
            HSE_UI.updateStatus();

            // 6. Diagnostics
            this.enforceCount++;
            if (this.enforceCount % 5 === 0) {
                const margin = HSE_Intel.getBufferMargin(video);
                console.log(`[HSE] Context: VOD | Buffer: ${Math.round(margin)}s | Speed: ${video.playbackRate}x`);
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
            this.createAdOverlay();
            window.addEventListener(TOGGLE_EVENT, () => this.toggle());
        },

        createIndicator() {
            const ind = document.createElement('div');
            ind.id = 'hse-flash-indicator';
            document.body.appendChild(ind);
        },

        createAdOverlay() {
            const overlay = document.createElement('div');
            overlay.id = 'hse-ad-blocker-overlay';
            overlay.innerHTML = `
                <div class="hse-ad-content">
                    <div class="hse-ad-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    </div>
                    <div class="hse-ad-title">Blocking Ad</div>
                    <div class="hse-ad-subtitle" id="hse-ad-type">Match will resume shortly...</div>
                </div>
            `;
            document.body.appendChild(overlay);
        },

        updateAdOverlay(visible, type = '') {
            const overlay = document.getElementById('hse-ad-blocker-overlay');
            const typeEl = document.getElementById('hse-ad-type');
            if (!overlay) return;

            if (visible) {
                overlay.classList.add('is-visible');
                if (typeEl) typeEl.textContent = `${type} will resume shortly...`;
            } else {
                overlay.classList.remove('is-visible');
            }
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

            const panel = document.createElement('div');
            panel.id = 'hs-speed-panel';
            panel.className = 'mode-vod';
            
            const controlsHtml = `
                    <div class="hs-speed-btn-container">
                        ${DEFAULT_SPEEDS.map(s => `<button class="hs-speed-btn ${Math.abs(s - HSE_Engine.currentSpeed) < 0.01 ? 'is-active' : ''}" data-speed="${s}">${s}x</button>`).join('')}
                    </div>
                `;

            panel.innerHTML = `
                <div id="hs-speed-header">
                    <span id="hs-speed-title">${info.title}</span>
                    <span class="hse-badge">PRO</span>
                </div>
                <div id="hs-speed-status">Initialising...</div>
                ${controlsHtml}
                <div class="hse-toggles">
                    <div class="hse-toggle-item">
                        <span>Smart Ad Control</span>
                        <label class="hse-switch">
                            <input type="checkbox" id="hse-smart-ads" ${HSE_Store.settings.smartAds ? 'checked' : ''}>
                            <span class="hse-slider"></span>
                        </label>
                    </div>

                    <div class="hse-toggle-item">
                        <span>Mute & Hide My Ads</span>
                        <label class="hse-switch">
                            <input type="checkbox" id="hse-smart-mute" ${HSE_Store.settings.smartMute ? 'checked' : ''}>
                            <span class="hse-slider"></span>
                        </label>
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            this.panel = panel;

            // Events
            panel.querySelectorAll('.hs-speed-btn').forEach(btn => {
                btn.onclick = () => {
                    HSE_Engine.setSpeed(parseFloat(btn.dataset.speed));
                    this.resetHideTimer();
                };
            });

            panel.querySelector('#hse-smart-ads').onchange = (e) => {
                HSE_Store.settings.smartAds = e.target.checked;
                HSE_Store.save();
            };

            panel.querySelector('#hse-smart-mute').onchange = (e) => {
                HSE_Store.settings.smartMute = e.target.checked;
                HSE_Store.save();
            };

            this.resetHideTimer();
        },

        update() {
            if (!this.panel) return;
            const speed = HSE_Engine.currentSpeed;
            this.panel.querySelectorAll('.hs-speed-btn').forEach(btn => {
                btn.classList.toggle('is-active', Math.abs(parseFloat(btn.dataset.speed) - speed) < 0.01);
            });
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

    // --- HSE_Input: Keyboard Ninja ---
    const HSE_Input = {
        init() {
            window.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                // Burst mode: Hold Shift
                if (e.key === 'Shift') {
                    HSE_Engine.isBursting = true;
                    HSE_UI.flash('BURST: 2.5x');
                    return;
                }

                // Increments: [ and ]
                if (e.key === '[') {
                    HSE_Engine.setSpeed(Math.max(0.1, HSE_Engine.currentSpeed - 0.1));
                } else if (e.key === ']') {
                    HSE_Engine.setSpeed(Math.min(16, HSE_Engine.currentSpeed + 0.1));
                }
            });

            window.addEventListener('keyup', (e) => {
                if (e.key === 'Shift') {
                    HSE_Engine.isBursting = false;
                    HSE_UI.flash('Burst Ended');
                }
            });
        }
    };

    // --- INITIALIZATION ---
    async function init() {
        console.log('[HSE] Initialising Hotstar Pro Speed...');
        await HSE_Store.init();
        HSE_UI.init();
        HSE_Input.init();

        // Background loop
        setInterval(() => {
            HSE_Engine.enforce();
        }, REFRESH_MS);

        // Auto-load speed on navigation
        const loadInitialSpeed = () => {
            const info = HSE_Intel.getContentInfo();
            const lastSpeed = HSE_Store.getSpeedForShow(info.id);
            if (lastSpeed !== HSE_Engine.currentSpeed) {
                HSE_Engine.setSpeed(lastSpeed, false);
            }
        };

        window.addEventListener('popstate', loadInitialSpeed);
        // Patching history for Hotstar SPA
        const originalPush = history.pushState;
        history.pushState = function() {
            originalPush.apply(this, arguments);
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
