/**
 * app.js — Main application logic for MediXtract TimeTracker
 */

class TimeTracker {
    constructor() {
        // ── App State ─────────────────────────────
        this.sessions   = [];      // All loaded sessions
        this.theme      = 'dark';
        this.state      = 'idle';  // 'idle' | 'running' | 'paused'
        this.isCollaborative = false; // Toggle for Joan & Tomas


        // ── Timer State ───────────────────────────
        this.startTime    = null;   // Date when timer started
        this.pauseStart   = null;   // Date when pause began
        this.pausedSecs   = 0;      // Accumulated paused seconds
        this.tickInterval = null;   // setInterval handle
        this.pollInterval = null;   // External-change polling
        this.deletedIds   = new Set();

        // ── Last known file mod time ──────────────
        this.lastModTime  = 0;

        this._init();
    }

    /* ════════════════════════════════════════════
       INITIALIZATION
    ════════════════════════════════════════════ */
    _init() {
        // Load persisted settings
        this._loadLocalSettings();

        // Render the initial UI
        this.renderSessionsTable();
        this.renderHistoryTable();
        this._updateStatsRow();
        this._updateButtonsState();

        // Set today's date
        const startInput = document.getElementById('trackerStartDate');
        const endInput   = document.getElementById('trackerEndDate');
        if (startInput) startInput.value = TTUtils.toDateStr();
        if (endInput)   endInput.value   = TTUtils.toDateStr();

        // Theme
        document.documentElement.setAttribute('data-theme', this.theme);
        const themeBtn = document.getElementById('btnTheme');
        if (themeBtn) themeBtn.textContent = TTUI.themeEmoji(this.theme);

        // UI initial state
        TTUI.updateTimerButtons('idle');
        TTUI.setTimerState('idle');
        TTUI.updateHeaderStatus('idle');
        TTUI.showSetupBanner(!TTStorage.isConnected);
        TTUI.updateFolderStatus(false);

        // Folder status click
        document.getElementById('folderStatus')?.addEventListener('click', () => this.connectFolder());
        document.getElementById('setupBannerBtn')?.addEventListener('click', () => this.connectFolder());

        // Tab switching
        document.getElementById('tab-tracker')?.addEventListener('click', () => this.switchToTab('tracker'));
        document.getElementById('tab-history')?.addEventListener('click', () => this.switchToTab('history'));

        // Auto-open picker for time/date inputs on click
        document.addEventListener('click', (e) => {
            const t = e.target;
            if (t.tagName === 'INPUT' && (t.type === 'time' || t.type === 'date')) {
                if (typeof t.showPicker === 'function') {
                    try { t.showPicker(); } catch (err) {}
                }
            }
        });

        // Settings sidebar
        document.getElementById('btnSettings')?.addEventListener('click', () => this.openSettings());
        document.getElementById('btnCloseSettings')?.addEventListener('click', () => this.closeSettings());
        document.getElementById('settingsSidebar')?.addEventListener('click', (e) => {
            if (e.target.id === 'settingsSidebar') this.closeSettings();
        });

        // Theme selection in sidebar
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.addEventListener('click', () => {
                this.theme = btn.dataset.themeVal;
                document.documentElement.setAttribute('data-theme', this.theme);
                TTUI.updateThemeSelection(this.theme);
                this._saveLocalSettings();
            });
        });

        // Username sync from settings
        document.getElementById('inputSettingsUser')?.addEventListener('input', () => {
            this._updateButtonsState();
            this._saveLocalSettings();
            this._updateAquarium();
        });

        // Mandatory field validation on input
        ['inputProject', 'inputSettingsUser', 'trackerStartDate', 'trackerEndDate', 'trackerStartTime', 'trackerEndTime'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this._updateButtonsState());
            document.getElementById(id)?.addEventListener('change', () => this._updateButtonsState());
        });

        // Timer buttons
        document.getElementById('btnStart')?.addEventListener('click',  () => this.start());
        document.getElementById('btnPause')?.addEventListener('click',  () => this.pause());
        document.getElementById('btnResume')?.addEventListener('click', () => this.resume());
        document.getElementById('btnSaveManual')?.addEventListener('click', () => this.save());
        document.getElementById('btnCollab')?.addEventListener('click', () => this.toggleCollaborativeWork());


        // Combobox events
        this._initComboboxes();
        this._initAutoDimming();

        // History filters
        document.getElementById('btnApplyFilters')?.addEventListener('click',  () => this.renderHistoryTable());
        document.getElementById('btnClearFilters')?.addEventListener('click',  () => this._clearFilters());
        document.getElementById('btnExportCsv')?.addEventListener('click',    () => this._exportCsv());
        document.getElementById('filterDateFrom')?.addEventListener('change',  () => this.renderHistoryTable());
        document.getElementById('filterDateTo')?.addEventListener('change',    () => this.renderHistoryTable());

        // Polling for external file changes
        this.pollInterval = setInterval(() => this._checkExternalUpdate(), 8000);

        // Restore tab
        this.switchToTab(this.activeTab);

        // Attempt Auto-connect
        this.autoConnect();

        // Initialize aquarium animation based on monthly hours
        this._updateAquarium();
    }

    /* ════════════════════════════════════════════
       TAB SWITCHING
    ════════════════════════════════════════════ */
    switchToTab(tab) {
        this.activeTab = tab;
        TTUI.switchTab(tab);
        if (tab === 'history') {
            this.renderHistoryTable();
            this._updateStatsRow();
        }
        this._saveLocalSettings();
    }

    _escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

/* ───── Boot ─────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    window.tracker = new TimeTracker();
});
