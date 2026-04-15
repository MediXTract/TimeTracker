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

    /** Return array of "HH:mm" strings in 5-min increments */
    getTimeOptions() {
        const opts = [];
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 5) {
                opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            }
        }
        return opts;
    },

    /** Format a Date to HH:mm (rounded to nearest 5 mins) */
    toTimeStr(date = new Date()) {
        let h = date.getHours();
        let m = date.getMinutes();
        
        // Round to nearest 5
        m = Math.round(m / 5) * 5;
        if (m === 60) {
            m = 0;
            h = (h + 1) % 24;
        }
        
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        return `${hh}:${mm}`;
    },

    /** Format a Date to YYYY-MM-DD */
    toDateStr(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
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

    /** Parse "HH:mm" or "HH:mm:ss" to total seconds */
    parseTimeToSecs(str) {
        if (!str) return 0;
        const parts = String(str).split(':').map(Number);
        if (parts.length >= 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
        return 0;
    },

    /** Format seconds to "HH:mm" (rounded to nearest 5 mins) */
    secsToTime(totalSecs) {
        if (isNaN(totalSecs) || totalSecs < 0) return '00:00';
        
        // Round to nearest 300 seconds (5 minutes)
        const roundedSecs = Math.round(totalSecs / 300) * 300;
        
        const h = Math.floor(roundedSecs / 3600);
        const m = Math.floor((roundedSecs % 3600) / 60);
        return [h, m].map(v => String(Math.floor(v)).padStart(2, '0')).join(':');
    },

    /**
     * Calculate duration in seconds:
     *   (endDateTime - startDateTime) - pausedTime
     */
    calcDuration(startDate, startTime, endDate, endTime, pausedTime = '00:00:00') {
        if (!startDate || !startTime || !endDate || !endTime) return '00:00:00';
        
        const start = new Date(`${startDate}T${startTime}`);
        const end   = new Date(`${endDate}T${endTime}`);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return '00:00:00';

        const diffMs = end - start;
        const pausedSecs = this.parseTimeToSecs(pausedTime);
        const durSecs = Math.max(0, Math.floor(diffMs / 1000) - pausedSecs);
        
        return this.secsToTime(durSecs);
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
            startDate:   r.startDate   || r.date || this.toDateStr(),
            endDate:     r.endDate     || r.date || this.toDateStr(),
            startTime:   r.startTime   || '',
            endTime:     r.endTime     || '',
            pausedTime:  r.pausedTime  || '00:00:00',
            duration:    r.duration    || '00:00:00',
            notes:       r.notes       || '',
            isCollaborative: !!r.isCollaborative
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
