/**
 * Session management (CRUD and Rendering) for TimeTracker
 */
Object.assign(TimeTracker.prototype, {
    async save() {
        if (this.state === 'running' || this.state === 'paused') {
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
        } catch (err) {}
    },

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
        record.duration = TTUtils.calcDuration(record.startTime, record.endTime, record.pausedTime);

        await this._appendAndSave(record);
        TTUI.toast('Session logged successfully.', 'success');
        this._saveLocalSettings();
    },

    async _appendAndSave(record) {
        this.sessions.push(record);
        await this._persistSessions(record.projectName, record.userName);
        this.renderSessionsTable();
        this._updateStatsRow();
        this._updateAquarium();
    },

    async _persistSessions(projectName, userName) {
        if (!TTStorage.isConnected) {
            TTUI.setSaveStatus('', '');
            return;
        }
        TTUI.setSaveStatus('saving');
        try {
            const finalData = await TTStorage.saveAndSend(
                (diskData) => {
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
    },

    renderSessionsTable() {
        const tbody = document.getElementById('sessionsBody');
        const empty = document.getElementById('sessionsEmpty');
        const badge = document.getElementById('sessionCount');
        if (!tbody) return;
        const rows = [...this.sessions].reverse().slice(0, 50);
        if (badge) badge.textContent = this.sessions.length;
        if (rows.length === 0) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';
        tbody.innerHTML = rows.map(s => this._sessionRow(s)).join('');
        tbody.querySelectorAll('[data-edit-field]').forEach(cell => {
            cell.addEventListener('click', (e) => this._onCellClick(e, cell));
        });
        tbody.querySelectorAll('.btn-row-delete').forEach(btn => {
            btn.addEventListener('click', () => this._deleteSession(btn.dataset.id));
        });
    },

    _sessionRow(s) {
        const fields = [
            { field: 'projectName', val: s.projectName, type: 'project-select' },
            { field: 'userName',    val: s.userName,    type: 'user-select' },
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
    },

    _getTaskForSession(s) {
        return s.taskType || '';
    },

    _onCellClick(e, cell) {
        if (cell.querySelector('input, select')) return;
        const id      = cell.dataset.id;
        const field   = cell.dataset.editField;
        const type    = cell.dataset.type;
        const session = this.sessions.find(s => s.id === id);
        if (!session) return;
        const currentVal = session[field] || '';
        let editor;
        const isCombobox = ['task-select', 'subtask-select', 'project-select', 'user-select'].includes(type);

        if (isCombobox) {
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
            let options = [];
            if (type === 'task-select') options = this.knownTaskTypes;
            else if (type === 'subtask-select') options = this.knownSubtaskTypes(session.taskType);
            else if (type === 'project-select') options = this.knownProjects;
            else if (type === 'user-select') options = this.knownUsers;
            const trigger = (e) => {
                TTUI.openCombobox(editor, options, (val) => {
                    editor.value = val;
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
            trigger();
        } else {
            editor = document.createElement('input');
            editor.value = currentVal;
            const isDate = field === 'date';
            const isTime = ['startTime', 'endTime', 'pausedTime'].includes(field);

            if (isDate || isTime) {
                editor.type = isDate ? 'date' : 'time';
                if (isTime) editor.step = '1';
                cell.innerHTML = '';
                cell.appendChild(editor);
                editor.focus();
                if (typeof editor.showPicker === 'function') {
                    try {
                        editor.showPicker();
                    } catch (err) {
                        console.debug('showPicker failed', err);
                    }
                }
            } else {
                editor.className = 'cell-edit-input';
                cell.innerHTML = '';
                cell.appendChild(editor);
                editor.focus();
            }
        }
        if (editor.tagName === 'INPUT') editor.select();
        const commit = async () => {
            const newVal = editor.value;
            TTUI.closeAllComboboxes();
            editor.removeEventListener('blur', commit);
            editor.removeEventListener('keydown', onKey);
            session[field] = newVal;
            if (['startTime', 'endTime', 'pausedTime'].includes(field)) {
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
    },

    async _deleteSession(id) {
        const session = this.sessions.find(s => s.id === id);
        if (!session) return;
        const ok = await TTUI.confirm('Delete Session', 'Are you sure you want to delete this time entry?');
        if (!ok) return;
        this.deletedIds.add(id);
        this.sessions = this.sessions.filter(s => s.id !== id);
        this.renderSessionsTable();
        this.renderHistoryTable();
        this._updateStatsRow();
        await this._persistSessions(session.projectName, session.userName);
    }
});
