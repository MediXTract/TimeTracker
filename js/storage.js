/**
 * storage.js — File System Access API integration for MediXtract TimeTracker
 *
 * Folder layout (inside user-selected root):
 *   /main_TT/             → active JSON file (TT_data.json)
 *   /security_copies_TT/  → timestamped backups
 */

const TTStorage = {

    /** Root directory handle selected by the user */
    rootHandle: null,

    /** The file handle for the active JSON in main_TT */
    mainFileHandle: null,

    /** Name of the main data file */
    MAIN_FILE: 'TT_data.json',
    MAIN_DIR:  'main_TT',
    BACKUP_DIR: 'security_copies_TT',
    MAX_BACKUPS: 50,

    /** IndexedDB Storage for Directory Handles */
    _db: {
        NAME: 'TT_DB',
        STORE: 'handles',
        KEY: 'rootHandle',
        
        async op(mode, fn) {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.NAME, 1);
                request.onupgradeneeded = () => request.result.createObjectStore(this.STORE);
                request.onsuccess = () => {
                    const db = request.result;
                    const tx = db.transaction(this.STORE, mode);
                    const res = fn(tx.objectStore(this.STORE));
                    tx.oncomplete = () => resolve(res.result);
                    tx.onerror = () => reject(tx.error);
                };
                request.onerror = () => reject(request.error);
            });
        },
        async get() { return this.op('readonly', s => s.get(this.KEY)).catch(() => null); },
        async set(val) { return this.op('readwrite', s => s.put(val, this.KEY)).catch(() => null); }
    },

    /** True when folder is connected */
    get isConnected() {
        return !!this.rootHandle;
    },

    /** ── Connect ─────────────────────────────── */
    async connect(existingHandle = null) {
        try {
            // Use existing handle (auto-connect) or show picker
            this.rootHandle = existingHandle || await window.showDirectoryPicker({ mode: 'readwrite' });
            
            // Save handle for next time
            if (!existingHandle) {
                await this._db.set(this.rootHandle);
            }

            // Ensure sub-folders exist
            await this.rootHandle.getDirectoryHandle(this.MAIN_DIR,   { create: true });
            await this.rootHandle.getDirectoryHandle(this.BACKUP_DIR, { create: true });
            // Get or create main file handle
            const mainDir = await this.rootHandle.getDirectoryHandle(this.MAIN_DIR);
            this.mainFileHandle = await mainDir.getFileHandle(this.MAIN_FILE, { create: true });
            return true;
        } catch (err) {
            if (err.name === 'AbortError') return false;
            console.error('[TTStorage] connect error:', err);
            throw err;
        }
    },

    /** ── Persistence Helpers ─────────────────── */
    async getStoredHandle() {
        return await this._db.get();
    },

    async verifyPermission(handle) {
        if (!handle) return false;
        const options = { mode: 'readwrite' };
        if ((await handle.queryPermission(options)) === 'granted') return true;
        if ((await handle.requestPermission(options)) === 'granted') return true;
        return false;
    },

    /** ── Read main JSON ─────────────────────── */
    async loadData() {
        if (!this.isConnected) return [];
        try {
            const mainDir = await this.rootHandle.getDirectoryHandle(this.MAIN_DIR);
            this.mainFileHandle = await mainDir.getFileHandle(this.MAIN_FILE, { create: true });
            const file = await this.mainFileHandle.getFile();
            const text = await file.text();
            if (!text.trim()) return [];
            return JSON.parse(text);
        } catch (err) {
            console.error('[TTStorage] loadData error:', err);
            return [];
        }
    },

    /**
     * ── Save & Send Workflow ──────────────────
     * 1) Pre-update reload from disk
     * 2) Merge with modifications
     * 3) Save backup copy
     * 4) Overwrite main file
     * 5) Post-update reload (return fresh data)
     *
     * @param {Function} mergeFn  (diskData: Array) => Array  — receives current disk data, returns merged array
     * @param {string}   projectName  for backup filename
     * @param {string}   userName     for backup filename
     * @returns {Array}  the final saved dataset
     */
    async saveAndSend(mergeFn, projectName = 'TT', userName = 'user') {
        if (!this.isConnected) throw new Error('No folder connected.');

        // 1. Pre-update reload
        const diskData = await this.loadData();

        // 2. Merge
        const mergedData = await mergeFn(diskData);

        const jsonStr = JSON.stringify(mergedData, null, 2);

        // 3. Backup
        await this._writeBackup(jsonStr, projectName, userName);

        // 4. Write main file
        await this._writeMain(jsonStr);

        // 5. Post-update reload
        return await this.loadData();
    },

    /** Write (overwrite) main_TT/TT_data.json */
    async _writeMain(jsonStr) {
        const mainDir = await this.rootHandle.getDirectoryHandle(this.MAIN_DIR);
        const fh = await mainDir.getFileHandle(this.MAIN_FILE, { create: true });
        const writable = await fh.createWritable();
        await writable.write(jsonStr);
        await writable.close();
        this.mainFileHandle = fh;
    },

    /** Write a timestamped backup to security_copies_TT */
    async _writeBackup(jsonStr, projectName, userName) {
        try {
            const backupDir = await this.rootHandle.getDirectoryHandle(this.BACKUP_DIR, { create: true });
            const ts = TTUtils.getTimestamp();
            const safePrj  = TTUtils.safeFilename(projectName);
            const safeUser = TTUtils.safeFilename(userName);
            const name = `${ts}-${safePrj}-TT-${safeUser}.json`;

            const fh = await backupDir.getFileHandle(name, { create: true });
            const writable = await fh.createWritable();
            await writable.write(jsonStr);
            await writable.close();

            // Prune old backups (keep last MAX_BACKUPS)
            await this._pruneBackups(backupDir);
        } catch (err) {
            console.warn('[TTStorage] backup error (non-fatal):', err);
        }
    },

    /** Prune old backups past MAX_BACKUPS limit PER USER */
    async _pruneBackups(backupDir) {
        try {
            const files = [];
            for await (const [name] of backupDir.entries()) {
                if (name.endsWith('.json')) {
                    // Filename format: `${ts}-${safePrj}-TT-${safeUser}.json`
                    const parts = name.split('-TT-');
                    if (parts.length === 2) {
                        const userPart = parts[1].split('.json')[0];
                        files.push({ name, user: userPart });
                    }
                }
            }

            // Group by User
            const groups = {};
            files.forEach(f => {
                if (!groups[f.user]) groups[f.user] = [];
                groups[f.user].push(f.name);
            });

            // Prune each user group
            for (const user in groups) {
                const userFiles = groups[user];
                // Sort newest first (timestamp YYMMDDhhmmss is at the start)
                userFiles.sort((a, b) => b.localeCompare(a));

                if (userFiles.length > this.MAX_BACKUPS) {
                    // Keep most recent 50, remove others
                    for (let i = this.MAX_BACKUPS; i < userFiles.length; i++) {
                        await backupDir.removeEntry(userFiles[i]);
                    }
                }
            }
        } catch (err) {
            console.warn('[TTStorage] pruneBackups error:', err);
        }
    },

    /** Poll for external changes (compare file modification time) */
    async getMainFileModTime() {
        if (!this.mainFileHandle) return 0;
        try {
            const file = await this.mainFileHandle.getFile();
            return file.lastModified;
        } catch { return 0; }
    },

    /** Return folder name for display */
    get folderName() {
        return this.rootHandle?.name || null;
    }
};
