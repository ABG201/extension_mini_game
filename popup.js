// Smart Tab Organizer Popup Script

class TabOrganizerPopup {
    constructor() {
        this.currentTab = 'organize';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInitialData();
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Action buttons
        document.getElementById('organizeNow').addEventListener('click', () => {
            this.organizeNow();
        });

        document.getElementById('saveSession').addEventListener('click', () => {
            this.showSessionModal();
        });

        document.getElementById('saveNewSession').addEventListener('click', () => {
            this.showSessionModal();
        });

        // Modal events
        document.getElementById('confirmSave').addEventListener('click', () => {
            this.saveSession();
        });

        document.getElementById('cancelSave').addEventListener('click', () => {
            this.hideSessionModal();
        });

        // Settings
        document.getElementById('autoGroup').addEventListener('change', (e) => {
            this.updateSetting('autoGroup', e.target.checked);
        });

        document.getElementById('collapseGroups').addEventListener('change', (e) => {
            this.updateSetting('collapseGroups', e.target.checked);
        });

        // Close modal on outside click
        document.getElementById('sessionModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.hideSessionModal();
            }
        });
    }

    async loadInitialData() {
        try {
            await this.updateTabStats();
            await this.loadCurrentGroups();
            await this.loadSavedSessions();
            await this.loadTabHistory();
            await this.loadSettings();
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Load data for the active tab
        switch (tabName) {
            case 'organize':
                this.loadCurrentGroups();
                break;
            case 'sessions':
                this.loadSavedSessions();
                break;
            case 'history':
                this.loadTabHistory();
                break;
        }
    }

    async updateTabStats() {
        try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const groups = await chrome.tabGroups.query({ currentWindow: true });
            
            document.getElementById('tabCount').textContent = `${tabs.length} tabs`;
            document.getElementById('groupCount').textContent = `${groups.length} groups`;
        } catch (error) {
            console.error('Error updating tab stats:', error);
            // Fallback display
            document.getElementById('tabCount').textContent = '0 tabs';
            document.getElementById('groupCount').textContent = '0 groups';
        }
    }

    async organizeNow() {
        const btn = document.getElementById('organizeNow');
        const originalText = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = '<span class="icon">⏳</span>Organizing...';

        try {
            const response = await this.sendMessage({ action: 'organizeNow' });
            if (response && response.success !== false) {
                this.showStatus('Tabs organized successfully!', 'success');
                await this.updateTabStats();
                await this.loadCurrentGroups();
            } else {
                throw new Error(response?.error || 'Organization failed');
            }
        } catch (error) {
            console.error('Organize error:', error);
            this.showStatus('Failed to organize tabs: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    showSessionModal() {
        document.getElementById('sessionModal').classList.add('show');
        document.getElementById('sessionName').focus();
        document.getElementById('sessionName').value = `Session ${new Date().toLocaleString()}`;
    }

    hideSessionModal() {
        document.getElementById('sessionModal').classList.remove('show');
        document.getElementById('sessionName').value = '';
    }

    async saveSession() {
        const name = document.getElementById('sessionName').value.trim();
        if (!name) {
            this.showStatus('Please enter a session name', 'error');
            return;
        }

        try {
            const response = await this.sendMessage({ action: 'saveSession', name });
            if (response && response.success !== false) {
                this.showStatus('Session saved successfully!', 'success');
                this.hideSessionModal();
                await this.loadSavedSessions();
            } else {
                throw new Error(response?.error || 'Save failed');
            }
        } catch (error) {
            console.error('Save session error:', error);
            this.showStatus('Failed to save session: ' + error.message, 'error');
        }
    }

    async loadCurrentGroups() {
        const container = document.getElementById('currentGroups');
        if (!container) return;
        
        container.innerHTML = '<div class="loading">Loading groups...</div>';

        try {
            const groups = await chrome.tabGroups.query({ currentWindow: true });
            const groupsWithTabs = await Promise.all(
                groups.map(async (group) => {
                    try {
                        const tabs = await chrome.tabs.query({ groupId: group.id });
                        return { ...group, tabCount: tabs.length };
                    } catch (error) {
                        console.error('Error getting tabs for group:', group.id, error);
                        return { ...group, tabCount: 0 };
                    }
                })
            );

            if (groupsWithTabs.length === 0) {
                container.innerHTML = '<div class="empty-state">No tab groups found. Click "Organize Now" to create groups.</div>';
                return;
            }

            container.innerHTML = groupsWithTabs.map(group => `
                <div class="group-item ${group.color}">
                    <div class="group-info">
                        <div class="group-title">${group.title || 'Untitled Group'}</div>
                        <div class="group-count">${group.tabCount} tabs</div>
                    </div>
                    <div class="group-actions">
                        <button class="group-action" onclick="popup.toggleGroup(${group.id})" title="Toggle collapse">
                            ${group.collapsed ? '👁️' : '👁️‍🗨️'}
                        </button>
                        <button class="group-action" onclick="popup.ungroupTabs(${group.id})" title="Ungroup">
                            ❌
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading groups:', error);
            container.innerHTML = '<div class="empty-state">Error loading groups. Please try refreshing.</div>';
        }
    }

    async loadSavedSessions() {
    const container = document.getElementById('savedSessions');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading sessions...</div>';

    try {
        const response = await this.sendMessage({ action: 'getSessions' });
        const sessions = response?.sessions || [];

        if (sessions.length === 0) {
            container.innerHTML = '<div class="empty-state">No saved sessions found. Save your current tab setup to get started.</div>';
            return;
        }

        container.innerHTML = sessions.map((session, index) => `
            <div class="session-item" data-session-index="${index}">
                <div class="session-info">
                    <div class="session-name">${this.escapeHtml(session.name)}</div>
                    <div class="session-meta">
                        <span>${session.tabs?.length || 0} tabs</span>
                        <span>${new Date(session.timestamp).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="session-actions">
                    <button class="session-action restore-btn">
                        Restore
                    </button>
                    <button class="session-action delete-btn delete">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');

        // Add event listeners programmatically
        container.querySelectorAll('.session-item').forEach(item => {
            const index = parseInt(item.dataset.sessionIndex, 10);
            
            item.querySelector('.restore-btn').addEventListener('click', () => {
                this.restoreSession(index);
            });

            item.querySelector('.delete-btn').addEventListener('click', () => {
                this.deleteSession(index);
            });
        });

    } catch (error) {
        console.error('Error loading sessions:', error);
        container.innerHTML = '<div class="empty-state">Error loading sessions. Please try refreshing.</div>';
    }
}

    async loadTabHistory() {
        const container = document.getElementById('tabHistory');
        if (!container) return;
        
        container.innerHTML = '<div class="loading">Loading history...</div>';

        try {
            const response = await this.sendMessage({ action: 'getHistory' });
            const history = response?.history || [];

            if (history.length === 0) {
                container.innerHTML = '<div class="empty-state">No tab history found. Your tab activity will appear here.</div>';
                return;
            }

            container.innerHTML = history.slice(0, 50).map(entry => `
                <div class="history-item">
                    <div class="history-action ${entry.action}">${entry.action}</div>
                    <div class="history-tab">
                        ${entry.tab.favIconUrl ? `<img src="${entry.tab.favIconUrl}" class="history-favicon" onerror="this.style.display='none'">` : ''}
                        <div class="history-title">${this.escapeHtml(entry.tab.title || 'Untitled')}</div>
                    </div>
                    <div class="history-time">${this.formatTime(entry.timestamp)}</div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading history:', error);
            container.innerHTML = '<div class="empty-state">Error loading history. Please try refreshing.</div>';
        }
    }

    async loadSettings() {
        try {
            const settings = await chrome.storage.sync.get(['autoGroup', 'collapseGroups']);
            document.getElementById('autoGroup').checked = settings.autoGroup !== false;
            document.getElementById('collapseGroups').checked = settings.collapseGroups || false;
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async updateSetting(key, value) {
        try {
            await chrome.storage.sync.set({ [key]: value });
            this.showStatus('Settings updated', 'success');
        } catch (error) {
            console.error('Error updating settings:', error);
            this.showStatus('Failed to update settings', 'error');
        }
    }

    async toggleGroup(groupId) {
        try {
            const group = await chrome.tabGroups.get(groupId);
            await chrome.tabGroups.update(groupId, { collapsed: !group.collapsed });
            await this.loadCurrentGroups();
            this.showStatus('Group toggled', 'success');
        } catch (error) {
            console.error('Error toggling group:', error);
            this.showStatus('Failed to toggle group', 'error');
        }
    }

    async ungroupTabs(groupId) {
        try {
            const tabs = await chrome.tabs.query({ groupId });
            if (tabs.length > 0) {
                await chrome.tabs.ungroup(tabs.map(tab => tab.id));
                await this.loadCurrentGroups();
                await this.updateTabStats();
                this.showStatus('Group removed', 'success');
            }
        } catch (error) {
            console.error('Error ungrouping tabs:', error);
            this.showStatus('Failed to remove group', 'error');
        }
    }

    async restoreSession(sessionIndex) {
        try {
            const response = await this.sendMessage({ action: 'getSessions' });
            const session = response?.sessions?.[sessionIndex];
            
            if (!session) {
                this.showStatus('Session not found', 'error');
                return;
            }

            const restoreResponse = await this.sendMessage({ action: 'restoreSession', session });
            if (restoreResponse && restoreResponse.success !== false) {
                this.showStatus(`Restored session: ${session.name}`, 'success');
                setTimeout(() => this.updateTabStats(), 1000);
            } else {
                throw new Error(restoreResponse?.error || 'Restore failed');
            }
        } catch (error) {
            console.error('Error restoring session:', error);
            this.showStatus('Failed to restore session: ' + error.message, 'error');
        }
    }

    async deleteSession(sessionIndex) {
        if (!confirm('Are you sure you want to delete this session?')) {
            return;
        }

        try {
            const response = await this.sendMessage({ action: 'deleteSession', index: sessionIndex });
            if (response && response.success !== false) {
                this.showStatus('Session deleted', 'success');
                await this.loadSavedSessions();
            } else {
                throw new Error(response?.error || 'Delete failed');
            }
        } catch (error) {
            console.error('Error deleting session:', error);
            this.showStatus('Failed to delete session: ' + error.message, 'error');
        }
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showStatus(message, type) {
        const statusEl = document.getElementById('statusMessage');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
        statusEl.classList.add('show');
        
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 3000);
    }

    sendMessage(message) {
        return new Promise((resolve, reject) => {
            if (!chrome.runtime) {
                reject(new Error('Chrome runtime not available'));
                return;
            }

            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }
}

// Initialize the popup
let popup;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    popup = new TabOrganizerPopup();
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (!popup) return;
    
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case '1':
                e.preventDefault();
                popup.switchTab('organize');
                break;
            case '2':
                e.preventDefault();
                popup.switchTab('sessions');
                break;
            case '3':
                e.preventDefault();
                popup.switchTab('history');
                break;
            case 'Enter':
                if (document.getElementById('sessionModal').classList.contains('show')) {
                    e.preventDefault();
                    popup.saveSession();
                }
                break;
        }
    }
    
    if (e.key === 'Escape') {
        if (document.getElementById('sessionModal').classList.contains('show')) {
            popup.hideSessionModal();
        }
    }
});