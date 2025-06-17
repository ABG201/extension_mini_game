// Smart Tab Organizer Background Script

class TabOrganizer {
  constructor() {
    this.tabHistory = [];
    this.groupColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    this.domainGroups = new Map();
    this.init();
  }

  init() {
    // Listen for tab events
    chrome.tabs.onCreated.addListener((tab) => this.onTabCreated(tab));
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => this.onTabUpdated(tabId, changeInfo, tab));
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => this.onTabRemoved(tabId, removeInfo));
    
    // Listen for commands
    chrome.commands.onCommand.addListener((command) => this.handleCommand(command));
    
    // Auto-save session daily
    this.scheduleAutoSave();
    
    // Load existing history on startup
    this.loadHistoryFromStorage();
  }

  async loadHistoryFromStorage() {
    try {
      const { tabHistory = [] } = await chrome.storage.local.get('tabHistory');
      this.tabHistory = tabHistory;
    } catch (error) {
      console.error('Error loading history:', error);
    }
  }

  async onTabCreated(tab) {
    this.addToHistory('created', tab);
    
    // Check if auto-group is enabled
    const { autoGroup = true } = await chrome.storage.sync.get('autoGroup');
    if (autoGroup) {
      // Wait a bit for the tab to load its URL
      setTimeout(() => this.organizeTab(tab), 1000);
    }
  }

  async onTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.url) {
      this.addToHistory('updated', tab);
      
      // Check if auto-group is enabled
      const { autoGroup = true } = await chrome.storage.sync.get('autoGroup');
      if (autoGroup) {
        await this.organizeTab(tab);
      }
    }
  }

  onTabRemoved(tabId, removeInfo) {
    this.addToHistory('removed', { id: tabId, windowId: removeInfo.windowId });
    this.cleanupHistory(tabId);
  }

  addToHistory(action, tab) {
    const historyEntry = {
      action,
      tab: {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl
      },
      timestamp: Date.now()
    };
    
    this.tabHistory.unshift(historyEntry);
    
    // Keep only last 100 entries
    if (this.tabHistory.length > 100) {
      this.tabHistory = this.tabHistory.slice(0, 100);
    }
    
    // Save to storage
    chrome.storage.local.set({ tabHistory: this.tabHistory });
  }

  cleanupHistory(tabId) {
    this.tabHistory = this.tabHistory.filter(entry => entry.tab.id !== tabId);
    chrome.storage.local.set({ tabHistory: this.tabHistory });
  }

  async organizeExistingTabs() {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      
      // Clear existing domain groups to rebuild them
      this.domainGroups.clear();
      
      // Group tabs by domain
      const domainTabs = new Map();
      
      for (const tab of tabs) {
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          continue;
        }
        
        const domain = this.extractDomain(tab.url);
        if (!domainTabs.has(domain)) {
          domainTabs.set(domain, []);
        }
        domainTabs.get(domain).push(tab);
      }
      
      // Create groups for domains with multiple tabs
      for (const [domain, domainTabList] of domainTabs) {
        if (domainTabList.length > 1) {
          await this.createGroupForDomain(domain, domainTabList);
        }
      }
      
    } catch (error) {
      console.error('Error organizing existing tabs:', error);
      throw error;
    }
  }

  async createGroupForDomain(domain, tabs) {
    try {
      const category = this.categorizeTab(tabs[0].url, tabs[0].title);
      const colorIndex = this.domainGroups.size % this.groupColors.length;
      const color = this.groupColors[colorIndex];
      
      // Create group with first tab
      const groupId = await chrome.tabs.group({
        tabIds: [tabs[0].id]
      });
      
      // Update group properties
      await chrome.tabGroups.update(groupId, {
        title: this.getGroupTitle(domain, category),
        color: color,
        collapsed: false
      });
      
      // Add remaining tabs to the group
      if (tabs.length > 1) {
        const remainingTabIds = tabs.slice(1).map(tab => tab.id);
        await chrome.tabs.group({
          tabIds: remainingTabIds,
          groupId: groupId
        });
      }
      
      this.domainGroups.set(domain, groupId);
      
    } catch (error) {
      console.error('Error creating group for domain:', domain, error);
    }
  }

  async organizeTab(tab) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return;
    }

    try {
      const domain = this.extractDomain(tab.url);
      const category = this.categorizeTab(tab.url, tab.title);
      
      let groupId = this.domainGroups.get(domain);
      
      // Check if there are other tabs from the same domain
      const sameDomainTabs = await chrome.tabs.query({ 
        currentWindow: true,
        url: `*://*.${domain}/*`
      });
      
      if (sameDomainTabs.length > 1 && !groupId) {
        // Create new group only if there are multiple tabs from same domain
        const colorIndex = this.domainGroups.size % this.groupColors.length;
        const color = this.groupColors[colorIndex];
        
        const newGroupId = await chrome.tabs.group({
          tabIds: [tab.id]
        });
        
        await chrome.tabGroups.update(newGroupId, {
          title: this.getGroupTitle(domain, category),
          color: color,
          collapsed: false
        });
        
        this.domainGroups.set(domain, newGroupId);
        groupId = newGroupId;
      } else if (groupId) {
        // Add to existing group
        try {
          await chrome.tabs.group({
            tabIds: [tab.id],
            groupId: groupId
          });
        } catch (error) {
          // Group might not exist anymore, remove from our map
          this.domainGroups.delete(domain);
        }
      }
    } catch (error) {
      console.error('Error organizing tab:', error);
    }
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  categorizeTab(url, title) {
    const categories = {
      work: ['docs.google', 'office.com', 'notion.so', 'slack.com', 'zoom.us', 'teams.microsoft'],
      social: ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'reddit.com'],
      entertainment: ['youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv'],
      shopping: ['amazon.com', 'ebay.com', 'etsy.com', 'shopify.com'],
      news: ['cnn.com', 'bbc.com', 'reuters.com', 'techcrunch.com'],
      development: ['github.com', 'stackoverflow.com', 'codepen.io', 'developer.mozilla.org']
    };

    for (const [category, domains] of Object.entries(categories)) {
      if (domains.some(domain => url.includes(domain))) {
        return category;
      }
    }
    
    return 'general';
  }

  getGroupTitle(domain, category) {
    const categoryEmojis = {
      work: '💼',
      social: '👥',
      entertainment: '🎬',
      shopping: '🛒',
      news: '📰',
      development: '💻',
      general: '🌐'
    };
    
    const emoji = categoryEmojis[category] || '🌐';
    return `${emoji} ${domain}`;
  }

  async handleCommand(command) {
    switch (command) {
      case 'organize-tabs':
        await this.organizeExistingTabs();
        break;
      case 'save-session':
        await this.saveCurrentSession();
        break;
    }
  }

  async saveCurrentSession(name = null) {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const savableTabs = tabs.map(tab => ({
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl
        })).filter(tab => tab.url && !tab.url.startsWith('chrome://'));

      // Prevent saving a session with no valid tabs
      if (savableTabs.length === 0) {
        throw new Error("No savable tabs found in the current window.");
      }

      const session = {
        name: name || `Session ${new Date().toLocaleString()}`,
        tabs: savableTabs,
        timestamp: Date.now()
      };

      const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
      savedSessions.unshift(session);
      
      if (savedSessions.length > 20) {
        savedSessions.splice(20);
      }
      
      await chrome.storage.local.set({ savedSessions });
      return session;
    } catch (error) {
      console.error('Error saving session:', error);
      throw error;
    }
  }

  async restoreSession(session) {
    try {
      // THIS IS THE CRUCIAL CHECK:
      // Handle restoring an empty or invalid session before any other action.
      if (!session || !session.tabs || session.tabs.length === 0) {
        // If there are no tabs, just create a new empty window.
        await chrome.windows.create({});
        return; 
      }

      // This code will now only run if the session has at least one tab.
      const newWindow = await chrome.windows.create({ url: session.tabs[0].url });
      
      if (session.tabs.length > 1) {
        for (let i = 1; i < session.tabs.length; i++) {
          await chrome.tabs.create({ 
            url: session.tabs[i].url,
            windowId: newWindow.id
          });
        }
      }
    } catch (error) {
      console.error('Error restoring session:', error);
      throw error;
    }
  }


  scheduleAutoSave() {
    // Auto-save every 4 hours
    setInterval(async () => {
      try {
        await this.saveCurrentSession('Auto-saved');
      } catch (error) {
        console.error('Error auto-saving session:', error);
      }
    }, 4 * 60 * 60 * 1000);
  }

  async getTabHistory() {
    const { tabHistory = [] } = await chrome.storage.local.get('tabHistory');
    return tabHistory;
  }

  async getSavedSessions() {
    const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
    return savedSessions;
  }

  async deleteSession(sessionIndex) {
    try {
      const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
      if (sessionIndex >= 0 && sessionIndex < savedSessions.length) {
        savedSessions.splice(sessionIndex, 1);
        await chrome.storage.local.set({ savedSessions });
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }
}

// Initialize the tab organizer
const tabOrganizer = new TabOrganizer();

// Message handling for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'organizeNow':
      tabOrganizer.organizeExistingTabs().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'saveSession':
      tabOrganizer.saveCurrentSession(request.name).then(session => {
        sendResponse({ success: true, session });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'restoreSession':
      tabOrganizer.restoreSession(request.session).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'getHistory':
      tabOrganizer.getTabHistory().then(history => {
        sendResponse({ history });
      }).catch(error => {
        sendResponse({ history: [] });
      });
      return true;

    case 'getSessions':
      tabOrganizer.getSavedSessions().then(sessions => {
        sendResponse({ sessions });
      }).catch(error => {
        sendResponse({ sessions: [] });
      });
      return true;

    case 'deleteSession':
      tabOrganizer.deleteSession(request.index).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
  }
});