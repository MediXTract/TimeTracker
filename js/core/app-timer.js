/**
 * Timer Lifecycle logic for TimeTracker
 */
Object.assign(TimeTracker.prototype, {
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

        const startDate = document.getElementById('trackerStartDate')?.value;
        const endDate   = document.getElementById('trackerEndDate')?.value;
        const start     = document.getElementById('trackerStartTime')?.value;
        const end       = document.getElementById('trackerEndTime')?.value;
        
        // If we have both dates and times, compare fully to support multi-day sessions
        let timeValid = true;
        if (startDate && endDate && start && end && start !== '--:--' && end !== '--:--') {
            const startDt = new Date(`${startDate}T${start}`);
            const endDt   = new Date(`${endDate}T${end}`);
            timeValid = !isNaN(startDt) && !isNaN(endDt) && endDt >= startDt;
        }

        const errorEl = document.getElementById('timeError');
        if (errorEl) {
            errorEl.classList.toggle('hidden', timeValid);
        }

        const canSave = canStart && !!startDate && !!endDate && (!!start && start !== '--:--') && (!!end && end !== '--:--') && timeValid;

        const btnSaveManual = document.getElementById('btnSaveManual');
        if (btnSaveManual) btnSaveManual.disabled = !canSave;
    },

    start() {
        this.state = 'running';
        this.startTime = new Date();
        this.pausedSecs = 0;
        this._updateButtonsState();

        const pausedEl = document.getElementById('trackerPausedTime');
        if (pausedEl) pausedEl.value = '';

        const startEl = document.getElementById('trackerStartTime');
        if (startEl) startEl.value = TTUtils.toTimeStr(this.startTime);

        const startDateEl = document.getElementById('trackerStartDate');
        if (startDateEl) startDateEl.value = TTUtils.toDateStr(this.startTime);

        const endDateEl = document.getElementById('trackerEndDate');
        if (endDateEl) endDateEl.value = TTUtils.toDateStr(this.startTime);

        this._tick();
        this.tickInterval = setInterval(() => this._tick(), 1000);

        TTUI.updateTimerButtons('running');
        TTUI.setTimerState('running');
        TTUI.updateHeaderStatus('running');
        document.getElementById('trackerCard')?.classList.add('running');
        document.getElementById('trackerCard')?.classList.remove('paused');
    },

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

        const endEl = document.getElementById('trackerEndTime');
        if (endEl && !endEl.value) {
            endEl.value = TTUtils.toTimeStr(new Date());
        }
        const endDateEl = document.getElementById('trackerEndDate');
        if (endDateEl) {
            endDateEl.value = TTUtils.toDateStr(new Date());
        }
        this._updateButtonsState();
    },

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

        const endEl = document.getElementById('trackerEndTime');
        if (endEl) endEl.value = '';

        document.getElementById('trackerPausedTime').value = TTUtils.secsToTime(this.pausedSecs);
        this._updateButtonsState();
    },

    _tick() {
        if (!this.startTime) return;
        const elapsed = Math.floor((new Date() - this.startTime) / 1000) - this.pausedSecs;
        const display = TTUtils.secsToTime(Math.max(0, elapsed));
        const clockEl = document.getElementById('timerClock');
        if (clockEl) clockEl.textContent = display;
    },

    _resetTrackerForm() {
        document.getElementById('inputDescription').value = '';
        document.getElementById('inputNotes').value        = '';
        document.getElementById('trackerStartTime').value  = '';
        document.getElementById('trackerEndTime').value    = '';
        document.getElementById('trackerPausedTime').value = '';
        document.getElementById('trackerStartDate').value  = TTUtils.toDateStr();
        document.getElementById('trackerEndDate').value    = TTUtils.toDateStr();
        const clockEl = document.getElementById('timerClock');
        if (clockEl) clockEl.textContent = '00:00';
        this.pausedSecs = 0;
        this._updateButtonsState();
    }
});
