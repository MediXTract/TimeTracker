/**
 * app.js — Main application logic for MediXtract TimeTracker
 */

class TimeTracker {
    constructor() {
        // ── App State ─────────────────────────────
        this.sessions   = [];      // All loaded sessions
        this.theme      = 'dark';
        this.state      = 'idle';  // 'idle' | 'running' | 'paused'

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
        const dateInput = document.getElementById('trackerDate');
        if (dateInput) dateInput.value = TTUtils.toDateStr();

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
        document.getElementById('inputSettingsUser')?.addEventListener('input', (e) => {
            this._updateButtonsState();
            this._saveLocalSettings();
            this._updateAquarium();
        });

        // Mandatory field validation on input
        ['inputProject', 'inputSettingsUser', 'trackerDate', 'trackerStartTime', 'trackerEndTime'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this._updateButtonsState());
            document.getElementById(id)?.addEventListener('change', () => this._updateButtonsState());
        });

        // Timer buttons
        document.getElementById('btnStart')?.addEventListener('click',  () => this.start());
        document.getElementById('btnPause')?.addEventListener('click',  () => this.pause());
        document.getElementById('btnResume')?.addEventListener('click', () => this.resume());
        document.getElementById('btnSaveManual')?.addEventListener('click', () => this.save());

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
       LOCAL SETTINGS (theme, userName, projectName)
    ════════════════════════════════════════════ */
    _loadLocalSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('tt_settings') || '{}');
            this.theme     = s.theme     || 'dark';
            this.activeTab = s.activeTab || 'tracker';
            this.sessions  = [];

            // Restore user/project
            const settingsUserEl = document.getElementById('inputSettingsUser');
            if (s.lastUser) {
                if (settingsUserEl) settingsUserEl.value = s.lastUser;
            }
            if (s.lastProject) {
                const el = document.getElementById('inputProject');
                if (el) el.value = s.lastProject;
            }

            // Sync UI
            TTUI.updateThemeSelection(this.theme);
        } catch {}
    }

    _saveLocalSettings() {
        try {
            const userVal = document.getElementById('inputSettingsUser')?.value || '';
            localStorage.setItem('tt_settings', JSON.stringify({
                theme:       this.theme,
                activeTab:   this.activeTab,
                lastUser:    userVal,
                lastProject: document.getElementById('inputProject')?.value || '',
            }));
        } catch {}
    }

    /* ════════════════════════════════════════════
       KNOWN USERS / PROJECTS (derived from sessions)
    ════════════════════════════════════════════ */
    get knownProjects() {
        const sortedSessions = [...this.sessions].reverse();
        return [...new Set(sortedSessions.map(s => s.projectName).filter(Boolean))];
    }
    get knownUsers() {
        const sortedSessions = [...this.sessions].reverse();
        return [...new Set(sortedSessions.map(s => s.userName).filter(Boolean))];
    }
    get knownTaskTypes() {
        const sortedSessions = [...this.sessions].reverse();
        const historical = sortedSessions.map(s => s.taskType).filter(Boolean);
        return [...new Set(historical)];
    }

    knownSubtaskTypes(taskType) {
        const sortedSessions = [...this.sessions].reverse();
        const historical = sortedSessions
            .filter(s => !taskType || s.taskType === taskType)
            .map(s => s.subtaskType)
            .filter(Boolean);
        return [...new Set(historical)];
    }

    _getPotentialTaskTypesForSubtask(subtask) {
        const sortedSessions = [...this.sessions].reverse();
        const historical = sortedSessions
            .filter(s => s.subtaskType === subtask)
            .map(s => s.taskType)
            .filter(Boolean);
        return [...new Set(historical)];
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

    /* ════════════════════════════════════════════
       SETTINGS SIDEBAR
    ════════════════════════════════════════════ */
    openSettings() {
        TTUI.toggleSidebar(true);
        TTUI.updateThemeSelection(this.theme);
    }
    closeSettings() {
        TTUI.toggleSidebar(false);
    }

    /* ════════════════════════════════════════════
       CONNECT FOLDER
    ════════════════════════════════════════════ */
    async autoConnect() {
        try {
            const handle = await TTStorage.getStoredHandle();
            if (!handle) return;

            // Check if we already have permission (might happen if user granted persistent permission)
            const options = { mode: 'readwrite' };
            if ((await handle.queryPermission(options)) === 'granted') {
                return await this.connectFolder(handle);
            }

            // Otherwise, update the UI to show a "RestoreSession" button in the banner
            const bannerBtn = document.getElementById('setupBannerBtn');
            if (bannerBtn) {
                bannerBtn.textContent = '⚡ Restore Session';
                bannerBtn.onclick = () => this.connectFolder(handle);
            }
            const folderBtn = document.getElementById('folderStatus');
            if (folderBtn) {
                folderBtn.classList.add('waiting');
                folderBtn.title = 'Click to restore folder access';
            }
        } catch (err) {
            console.warn('[TimeTracker] autoConnect error:', err);
        }
    }

    async connectFolder(existingHandle = null) {
        try {
            // If we have a handle but need permission, request it
            if (existingHandle) {
                const ok = await TTStorage.verifyPermission(existingHandle);
                if (!ok) return;
            }

            const ok = await TTStorage.connect(existingHandle);
            if (!ok) return;

            TTUI.updateFolderStatus(true, TTStorage.folderName);
            TTUI.showSetupBanner(false);
            TTUI.setSaveStatus('', '');

            // Load existing data
            const data = await TTStorage.loadData();
            this.sessions = data.map(TTUtils.normalizeRecord.bind(TTUtils));
            this.lastModTime = await TTStorage.getMainFileModTime();

            this.renderSessionsTable();
            this.renderHistoryTable();
            this._updateStatsRow();
            this._updateAquarium();
            this._initComboboxes(); // refresh with known projects/users

            TTUI.toast('Folder connected. Data loaded!', 'success');
        } catch (err) {
            TTUI.toast(`Failed to connect: ${err.message}`, 'error');
        }
    }

    /* ════════════════════════════════════════════
       TIMER LIFECYCLE
    ════════════════════════════════════════════ */
    _updateButtonsState() {
        const project = document.getElementById('inputProject')?.value?.trim();
        const user    = document.getElementById('inputSettingsUser')?.value?.trim();
        const canStart = !!project && !!user;

        const btnStart  = document.getElementById('btnStart');
        const btnPause  = document.getElementById('btnPause');
        const btnResume = document.getElementById('btnResume');
        if (btnStart)  btnStart.disabled  = !canStart;
        if (btnPause)  btnPause.disabled  = !canStart;
        if (btnResume) btnResume.disabled = !canStart;

        const date  = document.getElementById('trackerDate')?.value;
        const start = document.getElementById('trackerStartTime')?.value;
        const end   = document.getElementById('trackerEndTime')?.value;
        
        const startSecs = TTUtils.parseTimeToSecs(start);
        const endSecs   = TTUtils.parseTimeToSecs(end);
        const timeValid = (!!start && !!end) ? (endSecs >= startSecs) : true;

        // Visual validation message
        const errorEl = document.getElementById('timeError');
        if (errorEl) {
            errorEl.classList.toggle('hidden', timeValid);
        }

        const canSave = canStart && !!date && (!!start && start !== '--:--:--') && (!!end && end !== '--:--:--') && timeValid;

        const btnSaveManual = document.getElementById('btnSaveManual');
        if (btnSaveManual) btnSaveManual.disabled = !canSave;
    }

    start() {
        this.state = 'running';
        this.startTime = new Date();
        this.pausedSecs = 0;
        this._updateButtonsState();

        const pausedEl = document.getElementById('trackerPausedTime');
        if (pausedEl) pausedEl.value = '';

        // Populate start time field
        const startEl = document.getElementById('trackerStartTime');
        if (startEl) startEl.value = TTUtils.toTimeStr(this.startTime);

        this._tick();
        this.tickInterval = setInterval(() => this._tick(), 1000);

        TTUI.updateTimerButtons('running');
        TTUI.setTimerState('running');
        TTUI.updateHeaderStatus('running');
        document.getElementById('trackerCard')?.classList.add('running');
        document.getElementById('trackerCard')?.classList.remove('paused');
    }

    pause() {
        if (this.state !== 'running') return;
        this.pauseStart = new Date();
        this.state      = 'paused';

        clearInterval(this.tickInterval);
        this.tickInterval = null;

        TTUI.setTimerState('paused');
        TTUI.updateTimerButtons('paused');
        TTUI.updateHeaderStatus('paused');
        document.getElementById('trackerCard')?.classList.add('paused');

        // Auto-fill end time when pausing so Save button is ready
        const endEl = document.getElementById('trackerEndTime');
        if (endEl && !endEl.value) {
            endEl.value = TTUtils.toTimeStr(new Date());
        }
        this._updateButtonsState();
    }

    resume() {
        if (this.state !== 'paused' || !this.pauseStart) return;
        this.pausedSecs += Math.floor((new Date() - this.pauseStart) / 1000);
        this.pauseStart  = null;
        this.state       = 'running';

        this._tick();
        this.tickInterval = setInterval(() => this._tick(), 1000);

        TTUI.setTimerState('running');
        TTUI.updateTimerButtons('running');
        TTUI.updateHeaderStatus('running');
        document.getElementById('trackerCard')?.classList.remove('paused');

        // Clear end time when resuming
        const endEl = document.getElementById('trackerEndTime');
        if (endEl) endEl.value = '';

        // Update paused time display field
        document.getElementById('trackerPausedTime').value = TTUtils.secsToTime(this.pausedSecs);
        this._updateButtonsState();
    }

    /**
     * Unified Save: Finalizes an active session OR logs manual entries.
     */
    async save() {
        // If active/paused, finalize end time
        if (this.state === 'running' || this.state === 'paused') {
            // Finalize pause if currently paused
            if (this.state === 'paused' && this.pauseStart) {
                this.pausedSecs += Math.floor((new Date() - this.pauseStart) / 1000);
                this.pauseStart = null;
            }

            const endTime = new Date();
            const endEl = document.getElementById('trackerEndTime');
            if (endEl) endEl.value = TTUtils.toTimeStr(endTime);
        }

        try {
            await this._saveSessionFromFields();
            
            // Post-save cleanup (only if successful)
            if (this.state !== 'idle') {
                this.state = 'idle';
                this.startTime = null;
                this.pauseStart = null;
                this.pausedSecs = 0;
                if (this.tickInterval) clearInterval(this.tickInterval);
                this.tickInterval = null;

                TTUI.updateTimerButtons('idle');
                TTUI.setTimerState('idle');
                TTUI.updateHeaderStatus('idle');
                document.getElementById('trackerCard')?.classList.remove('running', 'paused');
            }
            
            this._resetTrackerForm();
        } catch (err) {
            // Logic handled in _saveSessionFromFields
        }
    }

    async _saveSessionFromFields() {
        const recordRaw = {
            id:           TTUtils.uuid(),
            userName:     document.getElementById('inputSettingsUser')?.value?.trim() || 'Tomas',
            projectName:  document.getElementById('inputProject')?.value?.trim() || 'TT',
            description:  document.getElementById('inputDescription')?.value?.trim() || '',
            taskType:     document.getElementById('inputTaskType')?.value || '',
            subtaskType:  document.getElementById('inputSubtaskType')?.value || '',
            date:         document.getElementById('trackerDate')?.value || TTUtils.toDateStr(),
            startTime:    document.getElementById('trackerStartTime')?.value || '--:--:--',
            endTime:      document.getElementById('trackerEndTime')?.value || '--:--:--',
            pausedTime:   document.getElementById('trackerPausedTime')?.value || '00:00:00',
            notes:        document.getElementById('inputNotes')?.value?.trim() || '',
        };

        if (recordRaw.startTime === '--:--:--' || recordRaw.endTime === '--:--:--' || !recordRaw.startTime || !recordRaw.endTime) {
            TTUI.toast('Please enter both Start and End times.', 'warning');
            throw new Error('Incomplete time fields');
        }

        const startSecs = TTUtils.parseTimeToSecs(recordRaw.startTime);
        const endSecs   = TTUtils.parseTimeToSecs(recordRaw.endTime);
        if (endSecs < startSecs) {
            TTUI.toast('Finish time cannot be earlier than start time.', 'error');
            throw new Error('Invalid time order');
        }

        const record = TTUtils.normalizeRecord(recordRaw);
        // Recalculate duration explicitly
        record.duration = TTUtils.calcDuration(record.startTime, record.endTime, record.pausedTime);

        await this._appendAndSave(record);
        TTUI.toast('Session logged successfully.', 'success');
        this._saveLocalSettings();
    }

    _tick() {
        if (!this.startTime) return;
        const elapsed = Math.floor((new Date() - this.startTime) / 1000) - this.pausedSecs;
        const display = TTUtils.secsToTime(Math.max(0, elapsed));
        const clockEl = document.getElementById('timerClock');
        if (clockEl) clockEl.textContent = display;
    }

    _resetTrackerForm() {
        // Keep project, user, task for convenience
        document.getElementById('inputDescription').value = '';
        document.getElementById('inputNotes').value        = '';
        document.getElementById('trackerStartTime').value  = '';
        document.getElementById('trackerEndTime').value    = '';
        document.getElementById('trackerPausedTime').value = '';
        document.getElementById('trackerDate').value       = TTUtils.toDateStr();
        // Reset clock
        const clockEl = document.getElementById('timerClock');
        if (clockEl) clockEl.textContent = '00:00:00';
        this.pausedSecs = 0;
        this._updateButtonsState();
    }

    /* ════════════════════════════════════════════
       SAVE LOGIC
    ════════════════════════════════════════════ */
    async _appendAndSave(record) {
        this.sessions.push(record);
        await this._persistSessions(record.projectName, record.userName);
        this.renderSessionsTable();
        this._updateStatsRow();
        this._updateAquarium();
    }

    async _persistSessions(projectName, userName) {
        if (!TTStorage.isConnected) {
            TTUI.setSaveStatus('', '');
            return;
        }

        TTUI.setSaveStatus('saving');

        try {
            const finalData = await TTStorage.saveAndSend(
                (diskData) => {
                    // Merge strategy: disk is authoritative for records not in local additions,
                    // but we MUST skip anything we explicitly deleted in this session.
                    const localIds = new Set(this.sessions.map(s => s.id));
                    const diskOnlyRecords = diskData.filter(d => !localIds.has(d.id) && !this.deletedIds.has(d.id));
                    
                    return [...diskOnlyRecords, ...this.sessions]
                        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
                },
                projectName || 'TT',
                userName    || 'user'
            );

            this.sessions    = finalData.map(TTUtils.normalizeRecord.bind(TTUtils));
            this.lastModTime = await TTStorage.getMainFileModTime();

            TTUI.setSaveStatus('saved');
            setTimeout(() => TTUI.setSaveStatus('', ''), 3000);
        } catch (err) {
            TTUI.setSaveStatus('error');
            TTUI.toast(`Save failed: ${err.message}`, 'error');
        }
    }

    /* ════════════════════════════════════════════
       EXTERNAL CHANGE POLLING
    ════════════════════════════════════════════ */
    async _checkExternalUpdate() {
        if (!TTStorage.isConnected || this.state !== 'idle') return;
        try {
            const modTime = await TTStorage.getMainFileModTime();
            if (modTime > this.lastModTime) {
                const data = await TTStorage.loadData();
                this.sessions    = data.map(TTUtils.normalizeRecord.bind(TTUtils));
                this.lastModTime = modTime;
                this.renderSessionsTable();
                this.renderHistoryTable();
                this._updateStatsRow();
                TTUI.toast('Data updated from Drive.', 'info', 2500);
            }
        } catch {}
    }

    /* ════════════════════════════════════════════
       SESSIONS TABLE RENDER
    ════════════════════════════════════════════ */
    renderSessionsTable() {
        const tbody = document.getElementById('sessionsBody');
        const empty = document.getElementById('sessionsEmpty');
        const badge = document.getElementById('sessionCount');

        if (!tbody) return;

        // Show last 50 sessions in reverse-chrono order
        const rows = [...this.sessions].reverse().slice(0, 50);

        if (badge) badge.textContent = this.sessions.length;

        if (rows.length === 0) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        tbody.innerHTML = rows.map(s => this._sessionRow(s)).join('');

        // Attach edit/delete events
        tbody.querySelectorAll('[data-edit-field]').forEach(cell => {
            cell.addEventListener('click', (e) => this._onCellClick(e, cell));
        });
        tbody.querySelectorAll('.btn-row-delete').forEach(btn => {
            btn.addEventListener('click', () => this._deleteSession(btn.dataset.id));
        });
    }

    _sessionRow(s) {
        const fields = [
            { field: 'projectName', val: s.projectName },
            { field: 'userName',    val: s.userName },
            { field: 'date',        val: s.date },
            { field: 'startTime',   val: s.startTime },
            { field: 'endTime',     val: s.endTime },
            { field: 'pausedTime',  val: s.pausedTime },
            { field: 'duration',    val: s.duration,     readonly: true },
            { field: 'description', val: s.description },
            { field: 'taskType',    val: s.taskType,      type: 'task-select' },
            { field: 'subtaskType', val: s.subtaskType,   type: 'subtask-select' },
        ];

        const cells = fields.map(f => {
            if (f.readonly) {
                return `<td class="duration-cell"><div class="cell-content">${f.val || '—'}</div></td>`;
            }
            const displayVal = this._escHtml(f.val) || '<span style="color:var(--text-muted)">—</span>';
            return `<td class="editable" data-edit-field="${f.field}" data-id="${s.id}" data-type="${f.type || 'text'}" data-task="${f.field === 'subtaskType' ? this._getTaskForSession(s) : ''}"><div class="cell-content">${displayVal}</div></td>`;
        }).join('');

        return `<tr data-id="${s.id}">
            ${cells}
            <td style="text-align:center;">
                <button class="btn-row-delete" data-id="${s.id}" title="Delete">✕</button>
            </td>
        </tr>`;
    }

    _getTaskForSession(s) {
        return s.taskType || '';
    }

    _escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ════════════════════════════════════════════
       INLINE CELL EDITING
    ════════════════════════════════════════════ */
    _onCellClick(e, cell) {
        // Don't double-open
        if (cell.querySelector('input, select')) return;

        const id      = cell.dataset.id;
        const field   = cell.dataset.editField;
        const type    = cell.dataset.type;
        const session = this.sessions.find(s => s.id === id);
        if (!session) return;

        const currentVal = session[field] || '';

        let editor;

        if (type === 'task-select' || type === 'subtask-select') {
            const wrap = document.createElement('div');
            wrap.className = 'combobox-wrap';
            editor = document.createElement('input');
            editor.className  = 'combobox-input cell-edit-input';
            editor.value      = currentVal;
            editor.autocomplete = 'off';
            wrap.appendChild(editor);
            
            cell.innerHTML = '';
            cell.appendChild(wrap);
            editor.focus();

            const options = (type === 'task-select') 
                ? this.knownTaskTypes 
                : this.knownSubtaskTypes(session.taskType);
            
            const trigger = (e) => {
                TTUI.openCombobox(editor, options, (val) => {
                    editor.value = val;
                    // Smart pre-loading for inline editing
                    if (type === 'subtask-select' && !session.taskType) {
                        const tasks = this._getPotentialTaskTypesForSubtask(val);
                        if (tasks.length === 1) {
                            session.taskType = tasks[0];
                        }
                    }
                    commit();
                });
            };
            editor.addEventListener('focus', trigger);
            editor.addEventListener('input', trigger);
            // Initial trigger
            trigger();
        } else {
            editor = document.createElement('input');
            editor.className  = 'cell-edit-input';
            editor.value      = currentVal;
            if (field === 'date')      { editor.type = 'date'; }
            else if (['startTime','endTime','pausedTime'].includes(field)) { editor.type = 'time'; editor.step = '1'; }
            cell.innerHTML = '';
            cell.appendChild(editor);
            editor.focus();
        }
        
        if (editor.tagName === 'INPUT') editor.select();

        const commit = async () => {
            const newVal = editor.value;
            TTUI.closeAllComboboxes();
            editor.removeEventListener('blur', commit);
            editor.removeEventListener('keydown', onKey);

            // Update session
            session[field] = newVal;

            // Recalculate duration if time fields changed
            if (['startTime', 'endTime', 'pausedTime'].includes(field)) {
                // Normalize time from 'HH:mm' to 'HH:mm:ss'
                if (newVal.length === 5) session[field] = newVal + ':00';
                session.duration = TTUtils.calcDuration(session.startTime, session.endTime, session.pausedTime);
            }

            this.renderSessionsTable();
            this.renderHistoryTable();
            this._updateStatsRow();

            await this._persistSessions(session.projectName, session.userName);
        };

        const onKey = (e) => {
            if (e.key === 'Enter')  commit();
            if (e.key === 'Escape') {
                TTUI.closeAllComboboxes();
                editor.removeEventListener('blur', commit);
                cell.innerHTML = '';
                cell.innerHTML = `<div class="cell-content">${this._escHtml(currentVal) || '—'}</div>`;
            }
        };

        editor.addEventListener('blur',   commit);
        editor.addEventListener('keydown', onKey);
    }

    /* ════════════════════════════════════════════
       DELETE SESSION
    ════════════════════════════════════════════ */
    async _deleteSession(id) {
        const session = this.sessions.find(s => s.id === id);
        if (!session) return;

        const ok = await TTUI.confirm('Delete Session', 'Are you sure you want to delete this time entry?');
        if (!ok) return;

        // Mark as deleted so merge logic ignores it
        this.deletedIds.add(id);
        
        this.sessions = this.sessions.filter(s => s.id !== id);
        this.renderSessionsTable();
        this.renderHistoryTable();
        this._updateStatsRow();
        
        await this._persistSessions(session.projectName, session.userName);
    }

    /* ════════════════════════════════════════════
       HISTORY PAGE
    ════════════════════════════════════════════ */
    _getFilteredSessions() {
        const dateFrom = document.getElementById('filterDateFrom')?.value || '';
        const dateTo   = document.getElementById('filterDateTo')?.value   || '';
        const project  = document.getElementById('filterProject')?.value  || '';
        const user     = document.getElementById('filterUser')?.value     || '';
        const task     = document.getElementById('filterTaskType')?.value || '';
        const subtask  = document.getElementById('filterSubtaskType')?.value || '';

        return this.sessions.filter(s => {
            if (dateFrom && s.date < dateFrom) return false;
            if (dateTo   && s.date > dateTo)   return false;
            if (project  && s.projectName !== project) return false;
            if (user     && s.userName    !== user)    return false;
            if (task     && s.taskType    !== task)    return false;
            if (subtask  && s.subtaskType !== subtask) return false;
            return true;
        });
    }

    renderHistoryTable() {
        const filtered = this._getFilteredSessions();
        const tbody = document.getElementById('historyBody');
        const empty = document.getElementById('historyEmpty');
        const countEl = document.getElementById('historyCount');

        if (!tbody) return;
        if (countEl) countEl.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        const sorted = [...filtered].sort((a, b) =>
            (b.date + b.startTime).localeCompare(a.date + a.startTime)
        );

        tbody.innerHTML = sorted.map(s => `
            <tr>
                <td>${this._escHtml(s.date)}</td>
                <td>${this._escHtml(s.projectName)}</td>
                <td>${this._escHtml(s.userName)}</td>
                <td>${this._escHtml(s.startTime)}</td>
                <td>${this._escHtml(s.endTime)}</td>
                <td>${this._escHtml(s.pausedTime)}</td>
                <td class="duration-cell">${this._escHtml(s.duration)}</td>
                <td>${this._escHtml(s.description)}</td>
                <td>${this._escHtml(s.taskType)}</td>
                <td>${this._escHtml(s.subtaskType)}</td>
                <td class="truncate" style="max-width:200px;" title="${this._escHtml(s.notes)}">${this._escHtml(s.notes)}</td>
            </tr>
        `).join('');

        // Populate filter dropdowns with known values
        this._populateHistoryFilters();
    }

    _populateHistoryFilters() {
        this._fillFilterSelect('filterProject',     this.knownProjects);
        this._fillFilterSelect('filterUser',        this.knownUsers);
        this._fillFilterSelect('filterTaskType',    this.knownTaskTypes);
        const taskVal = document.getElementById('filterTaskType')?.value || '';
        this._fillFilterSelect('filterSubtaskType', taskVal ? (this.TASK_MAP[taskVal] || []) : []);
    }

    _fillFilterSelect(id, options) {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = el.value;
        el.innerHTML = `<option value="">All</option>` +
            options.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    }

    _clearFilters() {
        ['filterDateFrom','filterDateTo','filterProject','filterUser','filterTaskType','filterSubtaskType'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        this.renderHistoryTable();
        this._updateStatsRow();
    }

    /* ════════════════════════════════════════════
       STATS ROW
    ════════════════════════════════════════════ */
    _updateStatsRow() {
        const filtered = this._getFilteredSessions();

        // Total duration
        const totalSecs = filtered.reduce((acc, s) => acc + TTUtils.parseTimeToSecs(s.duration), 0);
        const el = id => { const e = document.getElementById(id); return e; };

        if (el('statTotalTime'))    el('statTotalTime').textContent    = TTUtils.secsToTime(totalSecs);
        if (el('statSessions'))     el('statSessions').textContent     = filtered.length;
        if (el('statAvgSession'))   {
            const avg = filtered.length > 0 ? Math.round(totalSecs / filtered.length) : 0;
            el('statAvgSession').textContent = TTUtils.secsToTime(avg);
        }

        // Most active project
        const projSecs = {};
        filtered.forEach(s => {
            projSecs[s.projectName] = (projSecs[s.projectName] || 0) + TTUtils.parseTimeToSecs(s.duration);
        });
        const topProject = Object.entries(projSecs).sort((a, b) => b[1] - a[1])[0];
        if (el('statTopProject')) el('statTopProject').textContent = topProject ? topProject[0] : '—';
    }

    /* ════════════════════════════════════════════
       CSV EXPORT
    ════════════════════════════════════════════ */
    _exportCsv() {
        const filtered = this._getFilteredSessions();
        if (filtered.length === 0) { TTUI.toast('No data to export.', 'warning'); return; }

        const headers = ['Date','Project','User','Start Time','End Time','Paused Time','Duration','Description','Task Type','Subtask Type','Notes'];
        const rows = filtered.map(s => [
            s.date, s.projectName, s.userName, s.startTime, s.endTime,
            s.pausedTime, s.duration, s.description, s.taskType, s.subtaskType, s.notes
        ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href  = url;
        a.download = `TT_export_${TTUtils.getTimestamp()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        TTUI.toast(`Exported ${filtered.length} records.`, 'success');
    }

    /* ════════════════════════════════════════════
       POLLING & SYNC
    ════════════════════════════════════════════ */
    async _checkExternalUpdate() {
        if (!TTStorage.isConnected || this.state !== 'idle') return;

        const modTime = await TTStorage.getMainFileModTime();
        if (modTime <= this.lastModTime) return;

        console.log('[TimeTracker] External change detected. Reloading...');
        const diskData = await TTStorage.loadData();
        
        // Merge: missing IDs come in, but skip things we just deleted
        const localIds = new Set(this.sessions.map(s => s.id));
        const diskOnlyData = diskData.filter(d => !localIds.has(d.id) && !this.deletedIds.has(d.id));

        if (diskOnlyData.length > 0) {
            this.sessions = [...diskOnlyData, ...this.sessions]
                .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
            this.renderSessionsTable();
            this.renderHistoryTable();
            this._updateStatsRow();
            this._updateAquarium();
            TTUI.toast('Data updated from Google Drive.', 'info');
        }
        this.lastModTime = modTime;
    }

    /* ════════════════════════════════════════════
       COMBOBOXES (Project, User, Task, Subtask)
    ════════════════════════════════════════════ */
    _initComboboxes() {
        const ids = ['inputProject', 'inputUser', 'inputTaskType', 'inputSubtaskType'];
        
        ids.forEach(id => {
            const input = document.getElementById(id);
            if (!input) return;

            const trigger = (e) => {
                let options = [];
                if (id === 'inputProject')     options = this.knownProjects;
                else if (id === 'inputUser')   options = this.knownUsers;
                else if (id === 'inputTaskType') options = this.knownTaskTypes;
                else if (id === 'inputSubtaskType') {
                    const taskType = document.getElementById('inputTaskType')?.value || '';
                    options = this.knownSubtaskTypes(taskType);
                }

                TTUI.openCombobox(id, options, val => {
                    input.value = val;
                    if (id === 'inputTaskType') {
                        // Optional scroll or focus logic
                    }
                    if (id === 'inputSubtaskType') {
                        // Smart pre-loading: if no task selected, and this subtask only exists in ONE task, fill it
                        const taskInput = document.getElementById('inputTaskType');
                        if (taskInput && !taskInput.value) {
                            const tasks = this._getPotentialTaskTypesForSubtask(val);
                            if (tasks.length === 1) {
                                taskInput.value = tasks[0];
                            }
                        }
                    }
                    this._updateButtonsState();
                    this._saveLocalSettings();
                });
                if (e.type === 'input') this._updateButtonsState();
            };

            input.addEventListener('focus', trigger);
            input.addEventListener('input', trigger);
        });
    }

    /** Dim the side panel if cursor is away for long */
    _initAutoDimming() {
        const sidePanel = document.querySelector('.tracker-side-left');
        if (!sidePanel) return;
        
        let dimTimeout;
        const resetDim = () => {
            clearTimeout(dimTimeout);
            sidePanel.classList.remove('dimmed');
            dimTimeout = setTimeout(() => {
                sidePanel.classList.add('dimmed');
            }, 5000);
        };
        sidePanel.addEventListener('mouseleave', resetDim);
        sidePanel.addEventListener('mouseenter', () => {
            clearTimeout(dimTimeout);
            sidePanel.classList.remove('dimmed');
        });
        // Initial timer
        resetDim();
    }

    _updateAquarium() {
        const user = document.getElementById('inputSettingsUser')?.value?.trim();
        if (!user) {
            TTUI.createFloatingElements('aquarium-elements', 0);
            return;
        }

        const now = new Date();
        const year = now.getFullYear();
        const monthNum = now.getMonth() + 1;
        const monthPrefix = `${year}-${String(monthNum).padStart(2, '0')}`;

        // Filter sessions purely by current user and current month string (YYYY-MM-DD)
        const monthSessions = this.sessions.filter(s => 
            s.userName === user && s.date && s.date.startsWith(monthPrefix)
        );

        const totalSecs = monthSessions.reduce((acc, s) => acc + TTUtils.parseTimeToSecs(s.duration), 0);
        const totalHours = Math.floor(totalSecs / 3600);
        
        // Final count: 1 fish per completed hour, capped at 48
        const fishCount = Math.min(totalHours, 48);
        
        // Only re-create if the count changed significantly or if forced (simplified for now)
        TTUI.createFloatingElements('aquarium-elements', fishCount);
    }
}

/* ───── Boot ─────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    window.tracker = new TimeTracker();
});
