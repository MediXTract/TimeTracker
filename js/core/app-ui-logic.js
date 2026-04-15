/**
 * UI components logic (Comboboxes, Aquarium, settings) for TimeTracker
 */

// ── Getters for derived data (must use defineProperties to avoid immediate execution)
Object.defineProperties(TimeTracker.prototype, {
    knownProjects: {
        get() {
            const sortedSessions = [...(this.sessions || [])].reverse();
            return [...new Set(sortedSessions.map(s => s.projectName).filter(Boolean))];
        },
        configurable: true
    },
    knownUsers: {
        get() {
            const sortedSessions = [...(this.sessions || [])].reverse();
            return [...new Set(sortedSessions.map(s => s.userName).filter(Boolean))];
        },
        configurable: true
    },
    knownTaskTypes: {
        get() {
            const sortedSessions = [...(this.sessions || [])].reverse();
            const historical = sortedSessions.map(s => s.taskType).filter(Boolean);
            return [...new Set(historical)];
        },
        configurable: true
    }
});

Object.assign(TimeTracker.prototype, {
    knownSubtaskTypes(taskType) {
        const sortedSessions = [...(this.sessions || [])].reverse();
        const historical = sortedSessions
            .filter(s => !taskType || s.taskType === taskType)
            .map(s => s.subtaskType)
            .filter(Boolean);
        return [...new Set(historical)];
    },
    _getPotentialTaskTypesForSubtask(subtask) {
        const sortedSessions = [...(this.sessions || [])].reverse();
        const historical = sortedSessions
            .filter(s => s.subtaskType === subtask)
            .map(s => s.taskType)
            .filter(Boolean);
        return [...new Set(historical)];
    },

    // ── Local Settings ────────────────────────────
    _loadLocalSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('tt_settings') || '{}');
            this.theme     = s.theme     || 'dark';
            this.activeTab = s.activeTab || 'tracker';
            this.sessions  = [];
            const settingsUserEl = document.getElementById('inputSettingsUser');
            if (s.lastUser && settingsUserEl) settingsUserEl.value = s.lastUser;
            if (s.lastProject) {
                const el = document.getElementById('inputProject');
                if (el) el.value = s.lastProject;
            }
            TTUI.updateThemeSelection(this.theme);
        } catch {}
    },
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
    },

    // ── Settings Sidebar ──────────────────────────
    openSettings() {
        TTUI.toggleSidebar(true);
        TTUI.updateThemeSelection(this.theme);
    },
    closeSettings() {
        TTUI.toggleSidebar(false);
    },

    // ── Comboboxes ────────────────────────────────
    _initComboboxes() {
        const ids = ['inputProject', 'inputSettingsUser', 'inputTaskType', 'inputSubtaskType', 'trackerStartTime', 'trackerEndTime', 'trackerPausedTime'];
        ids.forEach(id => {
            const input = document.getElementById(id);
            if (!input || input.dataset.initDone) return;
            input.dataset.initDone = "true";

            const trigger = (e) => {
                let options = [];
                if (id === 'inputProject')     options = this.knownProjects;
                else if (id === 'inputSettingsUser')   options = ["Joan", "Tomas"];
                else if (id === 'inputTaskType') options = this.knownTaskTypes;
                else if (id === 'inputSubtaskType') {
                    const taskType = document.getElementById('inputTaskType')?.value || '';
                    options = this.knownSubtaskTypes(taskType);
                }
                else if (['trackerStartTime', 'trackerEndTime', 'trackerPausedTime'].includes(id)) {
                    options = TTUtils.getTimeOptions();
                }

                const isTimeOrUser = ['inputSettingsUser', 'trackerStartTime', 'trackerEndTime', 'trackerPausedTime'].includes(id);
                const isTimeOnly   = ['trackerStartTime', 'trackerEndTime', 'trackerPausedTime'].includes(id);

                if (isTimeOnly) {
                    TTUI.openTimePicker(id, val => {
                        input.value = val;
                        this._updateButtonsState();
                        this._saveLocalSettings();
                    });
                } else {
                    TTUI.openCombobox(id, options, val => {
                        input.value = val;
                        if (id === 'inputSubtaskType') {
                            const taskInput = document.getElementById('inputTaskType');
                            if (taskInput && !taskInput.value) {
                                const tasks = this._getPotentialTaskTypesForSubtask(val);
                                if (tasks.length === 1) taskInput.value = tasks[0];
                            }
                        }
                        this._updateButtonsState();
                        this._saveLocalSettings();
                    }, !isTimeOrUser);
                }
                if (e.type === 'input') this._updateButtonsState();
            };
            input.addEventListener('focus', trigger);
            input.addEventListener('input', trigger);
            input.addEventListener('click', trigger);

            if (['trackerStartTime', 'trackerEndTime', 'trackerPausedTime'].includes(id)) {
                TTUI.applyTimeMask(input);
            }
        });
    },

    // ── Visual Effects ────────────────────────────
    _initAutoDimming() {
        const sidePanel = document.querySelector('.tracker-side-left');
        if (!sidePanel) return;
        let dimTimeout;
        const resetDim = () => {
            clearTimeout(dimTimeout);
            sidePanel.classList.remove('dimmed');
            dimTimeout = setTimeout(() => sidePanel.classList.add('dimmed'), 5000);
        };
        sidePanel.addEventListener('mouseleave', resetDim);
        sidePanel.addEventListener('mouseenter', () => {
            clearTimeout(dimTimeout);
            sidePanel.classList.remove('dimmed');
        });
        resetDim();
    },

    _updateAquarium() {
        const user = document.getElementById('inputSettingsUser')?.value?.trim();
        if (!user) {
            TTUI.createFloatingElements('aquarium-elements', 0);
            return;
        }
        const now = new Date();
        const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthSessions = (this.sessions || []).filter(s => 
            s.userName === user && s.startDate && s.startDate.startsWith(monthPrefix)
        );
        const totalSecs = monthSessions.reduce((acc, s) => acc + TTUtils.parseTimeToSecs(s.duration), 0);
        const fishCount = Math.min(Math.floor(totalSecs / 3600), 48);
        TTUI.createFloatingElements('aquarium-elements', fishCount);
    },

    toggleCollaborativeWork() {
        this.isCollaborative = !this.isCollaborative;
        const btn = document.getElementById('btnCollab');
        if (btn) {
            btn.classList.toggle('active', this.isCollaborative);
            if (this.isCollaborative) {
                TTUI.toast('Collaborative mode active: hours will count for Joan & Tomas.', 'success');
            }
        }
    }
});
