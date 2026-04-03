/**
 * History Page logic for TimeTracker
 */
Object.assign(TimeTracker.prototype, {
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
    },

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
        this._populateHistoryFilters();
    },

    _populateHistoryFilters() {
        this._fillFilterSelect('filterProject',     this.knownProjects);
        this._fillFilterSelect('filterUser',        this.knownUsers);
        this._fillFilterSelect('filterTaskType',    this.knownTaskTypes);
        const taskVal = document.getElementById('filterTaskType')?.value || '';
        // Fix: Use knownSubtaskTypes instead of TASK_MAP which was missing
        this._fillFilterSelect('filterSubtaskType', taskVal ? (this.knownSubtaskTypes(taskVal) || []) : []);
    },

    _fillFilterSelect(id, options) {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = el.value;
        el.innerHTML = `<option value="">All</option>` +
            options.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    },

    _clearFilters() {
        ['filterDateFrom','filterDateTo','filterProject','filterUser','filterTaskType','filterSubtaskType'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        this.renderHistoryTable();
        this._updateStatsRow();
    },

    _updateStatsRow() {
        const filtered = this._getFilteredSessions();
        const totalSecs = filtered.reduce((acc, s) => acc + TTUtils.parseTimeToSecs(s.duration), 0);
        const el = id => document.getElementById(id);

        if (el('statTotalTime'))    el('statTotalTime').textContent    = TTUtils.secsToTime(totalSecs);
        if (el('statSessions'))     el('statSessions').textContent     = filtered.length;
        if (el('statAvgSession'))   {
            const avg = filtered.length > 0 ? Math.round(totalSecs / filtered.length) : 0;
            el('statAvgSession').textContent = TTUtils.secsToTime(avg);
        }
        const projSecs = {};
        filtered.forEach(s => {
            projSecs[s.projectName] = (projSecs[s.projectName] || 0) + TTUtils.parseTimeToSecs(s.duration);
        });
        const topProject = Object.entries(projSecs).sort((a, b) => b[1] - a[1])[0];
        if (el('statTopProject')) el('statTopProject').textContent = topProject ? topProject[0] : '—';
    },

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
});
