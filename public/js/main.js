/**
 * KURA Notes - Client-side JavaScript
 * Basic functionality for web interface
 */

// API Configuration
const API_BASE_URL = window.location.origin;

/**
 * Check if user is authenticated
 */
async function checkAuth() {
  try {
    const response = await fetch('/api/me', {
      credentials: 'include',
    });

    if (!response.ok) {
      // Not authenticated, redirect to login
      window.location.href = '/auth/login.html';
      return null;
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/auth/login.html';
    return null;
  }
}

/**
 * Load user profile and show in menu
 */
async function loadUser() {
  const user = await checkAuth();
  if (!user) return;

  // Show user menu
  const userMenu = document.getElementById('user-menu');
  const userEmail = document.getElementById('user-email');

  if (userMenu && userEmail) {
    userEmail.textContent = user.email;
    userMenu.style.display = 'flex';
  }
}

/**
 * Logout user
 */
async function logout() {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    console.error('Logout failed:', error);
  }

  // Always redirect to login, even if API call fails
  window.location.href = '/auth/login.html';
}

/**
 * Make API request with authentication
 */
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

/**
 * Show loading overlay
 */
function showLoading() {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loading-overlay';
  overlay.innerHTML = '<div class="loading-spinner"></div>';
  document.body.appendChild(overlay);
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Show message to user (legacy - inserts at top of page)
 */
function showMessage(message, type = 'info') {
  const messageEl = document.createElement('div');
  messageEl.className = `message message-${type}`;
  messageEl.textContent = message;

  const main = document.querySelector('.main .container');
  if (main) {
    main.insertBefore(messageEl, main.firstChild);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      messageEl.remove();
    }, 5000);
  }
}

/**
 * Toast Notification System
 * Shows floating notifications in the top-right corner
 */
const Toast = {
  container: null,

  /**
   * Initialize toast container
   */
  init() {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  },

  /**
   * Show a toast notification
   * @param {string} message - The message to display
   * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Duration in ms (0 for no auto-dismiss)
   */
  show(message, type = 'info', duration = 4000) {
    this.init();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      background: ${this.getBackgroundColor(type)};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 300px;
      max-width: 400px;
      pointer-events: auto;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      line-height: 1.4;
      animation: slideInRight 0.3s ease-out;
      transition: transform 0.2s, opacity 0.2s;
    `;

    // Add icon
    const icon = document.createElement('span');
    icon.textContent = this.getIcon(type);
    icon.style.fontSize = '20px';
    icon.style.flexShrink = '0';
    toast.appendChild(icon);

    // Add message
    const messageEl = document.createElement('span');
    messageEl.textContent = message;
    messageEl.style.flex = '1';
    toast.appendChild(messageEl);

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      margin: 0;
      opacity: 0.8;
      transition: opacity 0.2s;
      line-height: 1;
    `;
    closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.8';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.dismiss(toast);
    };
    toast.appendChild(closeBtn);

    // Click anywhere to dismiss
    toast.onclick = () => this.dismiss(toast);

    // Hover pause
    toast.onmouseenter = () => {
      if (toast.timeout) {
        clearTimeout(toast.timeout);
        toast.timeout = null;
      }
    };

    toast.onmouseleave = () => {
      if (duration > 0) {
        toast.timeout = setTimeout(() => this.dismiss(toast), 2000);
      }
    };

    // Add to container
    this.container.appendChild(toast);

    // Auto-dismiss
    if (duration > 0) {
      toast.timeout = setTimeout(() => this.dismiss(toast), duration);
    }

    return toast;
  },

  /**
   * Dismiss a toast
   */
  dismiss(toast) {
    toast.style.animation = 'slideOutRight 0.3s ease-out';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(400px)';

    setTimeout(() => {
      if (toast.timeout) clearTimeout(toast.timeout);
      if (toast.parentElement) toast.remove();
    }, 300);
  },

  /**
   * Get background color for toast type
   */
  getBackgroundColor(type) {
    const colors = {
      success: '#28a745',
      error: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8',
    };
    return colors[type] || colors.info;
  },

  /**
   * Get icon for toast type
   */
  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };
    return icons[type] || icons.info;
  },

  /**
   * Convenience methods
   */
  success(message, duration = 4000) {
    return this.show(message, 'success', duration);
  },

  error(message, duration = 5000) {
    return this.show(message, 'error', duration);
  },

  warning(message, duration = 5000) {
    return this.show(message, 'warning', duration);
  },

  info(message, duration = 4000) {
    return this.show(message, 'info', duration);
  },
};

// Make Toast globally available
window.Toast = Toast;

/**
 * Format date to relative time
 */
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

  return date.toLocaleDateString();
}

/**
 * Get content type icon
 */
function getContentTypeIcon(contentType) {
  const icons = {
    'text': '📝',
    'image': '🖼️',
    'pdf': '📄',
  };
  return icons[contentType] || '📎';
}

/**
 * Set active navigation link
 */
function setActiveNavLink() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '/' && href === '/')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/**
 * Global Keyboard Shortcuts
 */
function setupGlobalKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore if user is typing in an input/textarea
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    const isContentEditable = document.activeElement.isContentEditable;

    // Don't trigger shortcuts when typing (except Escape)
    if ((isTyping || isContentEditable) && e.key !== 'Escape') {
      return;
    }

    // "/" - Focus search (redirect to search page if not on search page)
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const searchInput = document.getElementById('search-query');
      if (searchInput) {
        // Already on search page, focus the input
        searchInput.focus();
      } else {
        // Redirect to search page
        window.location.href = '/search.html';
      }
    }

    // "n" - Create new note
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      window.location.href = '/create.html';
    }

    // "Escape" - Close any open modals
    if (e.key === 'Escape') {
      // Look for any visible modals
      const modals = document.querySelectorAll('.modal');
      modals.forEach(modal => {
        if (modal.style.display === 'block' || !modal.classList.contains('hidden')) {
          modal.style.display = 'none';
          modal.classList.add('hidden');
        }
      });

      // Look for any custom modal close functions
      if (typeof closeRenameModal === 'function') closeRenameModal();
      if (typeof closeDeleteModal === 'function') closeDeleteModal();
      if (typeof closeImageModal === 'function') closeImageModal();
    }
  });
}

/**
 * Offline Indicator
 * Shows a notification when the app goes offline/online
 */
const OfflineIndicator = {
  indicator: null,
  isOnline: navigator.onLine,

  init() {
    // Create indicator element
    this.indicator = document.createElement('div');
    this.indicator.id = 'offline-indicator';
    document.body.appendChild(this.indicator);

    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Check initial state
    if (!navigator.onLine) {
      this.handleOffline();
    }
  },

  handleOffline() {
    this.isOnline = false;
    this.indicator.innerHTML = '⚠️ You are offline';
    this.indicator.classList.remove('online');
    this.indicator.classList.add('show');
  },

  handleOnline() {
    // Show "back online" message briefly
    this.isOnline = true;
    this.indicator.innerHTML = '✓ Back online';
    this.indicator.classList.add('online');
    this.indicator.classList.add('show');

    // Hide after 3 seconds
    setTimeout(() => {
      this.indicator.classList.remove('show');
      setTimeout(() => {
        this.indicator.classList.remove('online');
      }, 300);
    }, 3000);
  },
};

/**
 * Initialize page
 */
function init() {
  // Set active navigation link
  setActiveNavLink();

  // Setup global keyboard shortcuts
  setupGlobalKeyboardShortcuts();

  // Initialize offline indicator
  OfflineIndicator.init();

  // Load user profile (skip on login page)
  if (!window.location.pathname.includes('/auth/login')) {
    loadUser();
  }

  // Expose logout function globally
  window.logout = logout;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
