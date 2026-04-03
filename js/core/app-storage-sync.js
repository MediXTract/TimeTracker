/**
 * Storage and Synchronization logic for TimeTracker
 */
Object.assign(TimeTracker.prototype, {
    async autoConnect() {
        try {
            const handle = await TTStorage.getStoredHandle();
            if (!handle) return;
            const options = { mode: 'readwrite' };
            if ((await handle.queryPermission(options)) === 'granted') {
                return await this.connectFolder(handle);
            }
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
    },

    async connectFolder(existingHandle = null) {
        try {
            if (existingHandle) {
                const ok = await TTStorage.verifyPermission(existingHandle);
                if (!ok) return;
            }
            const ok = await TTStorage.connect(existingHandle);
            if (!ok) return;

            TTUI.updateFolderStatus(true, TTStorage.folderName);
            TTUI.showSetupBanner(false);
            TTUI.setSaveStatus('', '');

            const data = await TTStorage.loadData();
            this.sessions = data.map(TTUtils.normalizeRecord.bind(TTUtils));
            this.lastModTime = await TTStorage.getMainFileModTime();

            this.renderSessionsTable();
            this.renderHistoryTable();
            this._updateStatsRow();
            this._updateAquarium();
            this._initComboboxes();

            TTUI.toast('Folder connected. Data loaded!', 'success');
        } catch (err) {
            TTUI.toast(`Failed to connect: ${err.message}`, 'error');
        }
    },

    async _checkExternalUpdate() {
        if (!TTStorage.isConnected || this.state !== 'idle') return;
        try {
            const modTime = await TTStorage.getMainFileModTime();
            if (modTime > this.lastModTime) {
                const diskData = await TTStorage.loadData();
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
        } catch {}
    }
});
