/**
 * utils.js — Shared utilities for MediXtract TimeTracker
 */

const TTUtils = {

    /** Generate a UUID v4 */
    uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },

    /** Format a Date to HH:mm:ss */
    toTimeStr(date = new Date()) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    },

    /** Format a Date to YYYY-MM-DD */
    toDateStr(date = new Date()) {
        return date.toISOString().slice(0, 10);
    },

    /** Get backup filename timestamp [YYMMDDhhmmss] */
    getTimestamp() {
        const d = new Date();
        const YY = String(d.getFullYear()).slice(2);
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const DD = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${YY}${MM}${DD}${hh}${mm}${ss}`;
    },

    /** Parse "HH:mm:ss" to total seconds */
    parseTimeToSecs(str) {
        if (!str) return 0;
        const parts = String(str).split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
    },

    /** Format seconds to "HH:mm:ss" */
    secsToTime(totalSecs) {
        if (isNaN(totalSecs) || totalSecs < 0) return '00:00:00';
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        return [h, m, s].map(v => String(Math.floor(v)).padStart(2, '0')).join(':');
    },

    /**
     * Calculate duration in seconds:
     *   (endTime - startTime) - pausedTime
     * All args are "HH:mm:ss" strings.
     */
    calcDuration(startTime, endTime, pausedTime = '00:00:00') {
        if (!startTime || !endTime) return '00:00:00';
        const [sh, sm, ss] = startTime.split(':').map(Number);
        const [eh, em, es] = endTime.split(':').map(Number);
        const startSecs = sh * 3600 + sm * 60 + ss;
        const endSecs   = eh * 3600 + em * 60 + es;

        const pausedSecs = this.parseTimeToSecs(pausedTime);
        const dur = Math.max(0, endSecs - startSecs - pausedSecs);
        return this.secsToTime(dur);
    },

    /** Parse a stored record to ensure all fields are present */
    normalizeRecord(r) {
        return {
            id:          r.id          || this.uuid(),
            userName:    r.userName    || '',
            projectName: r.projectName || '',
            description: r.description || '',
            taskType:    r.taskType    || '',
            subtaskType: r.subtaskType || '',
            date:        r.date        || this.toDateStr(),
            startTime:   r.startTime   || '',
            endTime:     r.endTime     || '',
            pausedTime:  r.pausedTime  || '00:00:00',
            duration:    r.duration    || '00:00:00',
            notes:       r.notes       || ''
        };
    },

    /** Sanitize a string for filenames */
    safeFilename(str) {
        return String(str).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);
    },

    /**
     * Debounce wrapper
     */
    debounce(fn, delay = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }
};
