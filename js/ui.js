/**
 * ui.js — UI utilities for MediXtract TimeTracker
 */

const TTUI = {

    /* ── Toast Notifications ──────────────────── */
    toast(message, type = 'info', duration = 3200) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
        container.appendChild(el);
        setTimeout(() => el.remove(), duration + 200);
    },

    /* ── Confirm Modal ────────────────────────── */
    confirm(title, message) {
        return new Promise(resolve => {
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            const overlay = document.getElementById('confirmModal');
            overlay.classList.remove('hidden');

            const cleanup = (result) => {
                overlay.classList.add('hidden');
                resolve(result);
            };
            document.getElementById('confirmOk').onclick = () => cleanup(true);
            document.getElementById('confirmCancel').onclick = () => cleanup(false);
        });
    },

    /* ── Save Status ──────────────────────────── */
    setSaveStatus(state, text) {
        const el = document.getElementById('saveStatus');
        if (!el) return;
        el.className = `save-status ${state}`;
        el.innerHTML = {
            saving: '⟳ Saving…',
            saved: '✓ Saved',
            error: '✗ Error',
            '': ''
        }[state] || text || '';
    },

    /* ── Header Status ────────────────────────── */
    updateHeaderStatus(state) {
        const el = document.getElementById('headerStatus');
        if (!el) return;
        el.className = `header-status ${state}`;
        const texts = {
            running: 'Running',
            paused: 'Paused',
            idle: 'Idle'
        };
        el.querySelector('.status-text').textContent = texts[state] || 'Idle';
    },

    /* ── Folder Status Display ────────────────── */
    updateFolderStatus(connected, name) {
        const el = document.getElementById('folderStatus');
        if (!el) return;
        if (connected && name) {
            el.classList.add('connected');
            el.querySelector('.folder-status-text').textContent = name;
            el.title = `Connected: ${name}`;
        } else {
            el.classList.remove('connected');
            el.querySelector('.folder-status-text').textContent = 'Connect folder…';
            el.title = 'Click to connect Google Drive folder';
        }
    },

    /* ── Setup Banner ─────────────────────────── */
    showSetupBanner(show) {
        const el = document.getElementById('setupBanner');
        if (el) el.classList.toggle('hidden', !show);
    },

    /* ── Page Tabs ────────────────────────────── */
    switchTab(tab) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const page = document.getElementById(`page-${tab}`);
        const btn = document.getElementById(`tab-${tab}`);
        if (page) page.classList.add('active');
        if (btn) btn.classList.add('active');
    },

    /* ── Theme Cycling ────────────────────────── */
    getNextTheme(current) {
        const order = ['light', 'dark', 'joan'];
        const idx = order.indexOf(current);
        return order[(idx + 1) % order.length];
    },

    themeEmoji(theme) {
        return { light: '☀️', dark: '🌙', joan: '⬛' }[theme] || '☀️';
    },

    /* ── Settings Sidebar ─────────────────────── */
    toggleSidebar(show) {
        const el = document.getElementById('settingsSidebar');
        if (el) el.classList.toggle('hidden', !show);
    },

    updateThemeSelection(activeTheme) {
        document.querySelectorAll('.theme-option').forEach(btn => {
            const isMatch = btn.dataset.themeVal === activeTheme;
            btn.classList.toggle('active', isMatch);
        });
    },

    /* ── Timer Card State ─────────────────────── */
    setTimerState(state) {
        const card = document.getElementById('trackerCard');
        if (!card) return;
        card.className = 'tracker-card card';
        if (state === 'running') card.classList.add('running');
        if (state === 'paused') card.classList.add('paused');

        const clockEl = document.getElementById('timerClock');
        if (clockEl) {
            clockEl.className = `timer-clock ${state === 'running' ? 'running' : state === 'paused' ? 'paused' : ''}`;
        }
        const displayEl = document.getElementById('timerDisplay');
        if (displayEl) {
            displayEl.className = `timer-display ${state === 'paused' ? 'paused' : ''}`;
        }
    },

    /* ── Button Visibility ────────────────────── */
    updateTimerButtons(state) {
        const startBtn = document.getElementById('btnStart');
        const pauseBtn = document.getElementById('btnPause');
        const resumeBtn = document.getElementById('btnResume');
        const saveBtn = document.getElementById('btnSaveManual');

        if (!startBtn || !saveBtn) return;

        // Idle: [Start, Save]
        startBtn.style.display = state === 'idle' ? '' : 'none';
        saveBtn.style.display = (state === 'idle' || state === 'paused') ? '' : 'none';

        // Running: [Pause]
        pauseBtn.style.display = state === 'running' ? '' : 'none';

        // Paused: [Resume, Save]
        resumeBtn.style.display = state === 'paused' ? '' : 'none';
    },

    /* ── Combobox ─────────────────────────────── */
    openCombobox(inputOrId, options, onSelect, allowAdd = true) {
        const input = (typeof inputOrId === 'string') ? document.getElementById(inputOrId) : inputOrId;
        if (!input) return;

        const wrap = input.closest('.combobox-wrap');
        let dd = wrap.querySelector('.combobox-dropdown');
        if (!dd) {
            dd = document.createElement('div');
            dd.className = 'combobox-dropdown';
            wrap.appendChild(dd);
        }

        const query = input.readOnly ? '' : input.value.toLowerCase();
        const filtered = options.filter(o => o.toLowerCase().includes(query));

        dd.innerHTML = '';
        if (allowAdd && query && !options.map(o => o.toLowerCase()).includes(query)) {
            const newOpt = document.createElement('div');
            newOpt.className = 'combobox-option new-entry';
            newOpt.innerHTML = `<span class="combobox-option-icon">✚</span> Add "${input.value}"`;
            newOpt.onmousedown = (e) => { e.preventDefault(); onSelect(input.value); this.closeCombobox(dd); };
            dd.appendChild(newOpt);
        }
        filtered.forEach(o => {
            const opt = document.createElement('div');
            opt.className = 'combobox-option';
            opt.innerHTML = `<span class="combobox-option-icon">◈</span> ${o}`;
            opt.onmousedown = (e) => { e.preventDefault(); onSelect(o); this.closeCombobox(dd); };
            dd.appendChild(opt);
        });

        if (dd.children.length === 0) {
            dd.innerHTML = '<div class="combobox-option" style="color:var(--text-muted);pointer-events:none;">No options</div>';
        }

        dd.classList.add('open');

        // Close on outside click
        const close = (e) => {
            if (!wrap.contains(e.target)) {
                this.closeCombobox(dd);
                document.removeEventListener('mousedown', close);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', close), 50);
    },

    closeCombobox(dd) {
        if (dd) dd.classList.remove('open');
    },

    /* ── Specialized Time Picker ──────────────── */
    openTimePicker(inputOrId, onSelect) {
        const input = (typeof inputOrId === 'string') ? document.getElementById(inputOrId) : inputOrId;
        if (!input) return;

        const wrap = input.closest('.combobox-wrap');
        let dd = wrap.querySelector('.time-picker-dropdown');
        if (!dd) {
            dd = document.createElement('div');
            dd.className = 'time-picker-dropdown';
            wrap.appendChild(dd);
        }

        const currentVal = input.value || '00:00';
        let [curH, curM] = currentVal.includes(':') ? currentVal.split(':') : ['00', '00'];

        const hours = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0'));
        const mins  = Array.from({length: 12}, (_, i) => String(i * 5).padStart(2, '0'));

        dd.innerHTML = `
            <div class="time-picker-columns">
                <div class="time-column hours-col">
                    ${hours.map(h => `<div class="time-opt ${h === curH ? 'active' : ''}" data-h="${h}">${h}</div>`).join('')}
                </div>
                <div class="time-column mins-col">
                    ${mins.map(m => `<div class="time-opt ${m === curM ? 'active' : ''}" data-m="${m}">${m}</div>`).join('')}
                </div>
            </div>
        `;

        dd.querySelectorAll('.time-opt[data-h]').forEach(opt => {
            opt.onmousedown = (e) => {
                e.preventDefault();
                curH = opt.dataset.h;
                dd.querySelectorAll('.hours-col .time-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                onSelect(`${curH}:${curM}`);
            };
        });

        dd.querySelectorAll('.time-opt[data-m]').forEach(opt => {
            opt.onmousedown = (e) => {
                e.preventDefault();
                curM = opt.dataset.m;
                onSelect(`${curH}:${curM}`);
                this.closeTimePicker(dd);
            };
        });

        dd.classList.add('open');

        const close = (e) => {
            if (!wrap.contains(e.target)) {
                this.closeTimePicker(dd);
                document.removeEventListener('mousedown', close);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', close), 50);
    },

    closeTimePicker(dd) {
        if (dd) dd.classList.remove('open');
    },

    closeAllTimePickers() {
        document.querySelectorAll('.time-picker-dropdown.open').forEach(d => d.classList.remove('open'));
    },

    closeAllComboboxes() {
        document.querySelectorAll('.combobox-dropdown.open').forEach(d => d.classList.remove('open'));
    },

    /* ── Aquarium Floating Elements ───────────── */
    createFloatingElements(containerId, count) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = ''; // Clear existing

        for (let i = 0; i < count; i++) {
            const fish = document.createElement('div');
            fish.className = 'fish-element';

            const rand = Math.random();
            let isBlurred = false;
            // Small fish are defined as roughly 30% of the population (0.5 mean - 0.2 units)
            if (rand < 0.3) {
                fish.classList.add('small');
                // 50% chance of blur for smallest fish
                if (Math.random() < 0.5) {
                    fish.style.setProperty('--blur', '1.5px');
                    isBlurred = true;
                }
            } else if (rand > 0.85) {
                fish.classList.add('featured');
            }

            // Randomize timing and paths
            const paths = ['swim-path-a', 'swim-path-b', 'swim-path-c', 'swim-path-d'];
            let path = paths[Math.floor(Math.random() * paths.length)];

            // Constrain blurred small fish to the left third as requested
            if (isBlurred) {
                path = 'swim-path-left-third';
            }

            const duration = Math.random() * 60 + 100; // 50s - 90s
            const delay = Math.random() * -100;    // start at random offset
            const top = Math.random() * 50 + 15; // 15% - 65% vertical start to avoid clipping margins

            fish.style.top = `${top}%`;
            fish.style.animation = `${path} ${duration}s ease-in-out ${delay}s infinite`;

            // Randomize size factor (0.8x to 1.3x)
            const scale = Math.random() * 0.5 + 0.8;
            fish.style.setProperty('--scale', scale);

            // Randomize hue with 20% probability
            if (Math.random() < 0.2) {
                const hueRotate = Math.floor(Math.random() * 360);
                fish.style.setProperty('--hue', `${hueRotate}deg`);
            }

            container.appendChild(fish);
        }
    },

    /* ── Time Input Masking ───────────────────── */
    applyTimeMask(input) {
        if (input.dataset.masked) return;
        input.dataset.masked = "true";

        // Initialize if empty
        if (!input.value || input.value === '--:--') input.value = '00:00';

        let justFocused = false;

        input.addEventListener('keydown', (e) => {
            const isDigit = /^\d$/.test(e.key);
            const isBackspace = e.key === 'Backspace';
            const isDelete = e.key === 'Delete';

            if (e.key === 'Enter') {
                input.blur();
                return;
            }

            if (!isDigit && !isBackspace && !isDelete && !e.key.startsWith('Arrow') && e.key !== 'Tab') {
                e.preventDefault();
                return;
            }

            if (isDigit || isBackspace || isDelete) {
                e.preventDefault();
                
                let seq = input.dataset.timeSeq || "";
                
                if (isDigit) {
                    if (justFocused) {
                        seq = e.key;
                    } else if (seq.length < 4) {
                        seq += e.key;
                    }
                    justFocused = false;
                } else {
                    if (justFocused || !seq) {
                        seq = input.value.replace(/\D/g, '');
                    }
                    seq = seq.slice(0, -1);
                    justFocused = false;
                }
                
                input.dataset.timeSeq = seq;
                
                let hStr = "00";
                let mStr = "00";

                if (seq.length === 1) {
                    hStr = `0${seq}`;
                } else if (seq.length === 2) {
                    hStr = seq;
                } else if (seq.length === 3) {
                    hStr = seq.slice(0, 2);
                    let m = parseInt(seq[2]);
                    // Round single digit minute: 1,2->0, 3,4,5,6,7->5, 8,9->10 (rollover)
                    m = Math.round(m / 5) * 5;
                    mStr = `0${m}`;
                } else if (seq.length === 4) {
                    hStr = seq.slice(0, 2);
                    let m = parseInt(seq.slice(2));
                    m = Math.round(m / 5) * 5;
                    if (m >= 60) {
                        m = 55; // Keep it simple within the same hour for the mask
                    }
                    mStr = String(m).padStart(2, '0');
                }
                
                input.value = `${hStr}:${mStr}`;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        input.addEventListener('focus', () => {
            justFocused = true;
            const clean = input.value.replace(/\D/g, '');
            input.dataset.timeSeq = (clean === '0000') ? "" : clean;
            setTimeout(() => input.select(), 10);
        });

        input.addEventListener('mousedown', () => {
            if (document.activeElement === input) {
            }
        });
    }
};
