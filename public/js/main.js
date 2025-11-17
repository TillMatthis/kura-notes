/**
 * KURA Notes - Client-side JavaScript
 * Basic functionality for web interface
 */

// API Configuration
const API_BASE_URL = window.location.origin;
const API_KEY = localStorage.getItem('kura_api_key') || '';

/**
 * Set API key in localStorage
 */
function setApiKey(apiKey) {
  localStorage.setItem('kura_api_key', apiKey);
  window.location.reload();
}

/**
 * Check if API key is configured
 */
function checkApiKey() {
  if (!API_KEY) {
    const message = document.createElement('div');
    message.className = 'message message-error';
    message.innerHTML = `
      <strong>API Key Required</strong>
      <p>Please set your API key to use KURA Notes.</p>
      <p>You can set it in your browser console: <code>setApiKey('your-api-key')</code></p>
    `;

    const main = document.querySelector('.main');
    if (main) {
      main.insertBefore(message, main.firstChild);
    }

    return false;
  }
  return true;
}

/**
 * Make API request with authentication
 */
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
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
 * Show message to user
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
 * Initialize page
 */
function init() {
  // Set active navigation link
  setActiveNavLink();

  // Expose setApiKey function globally for console access
  window.setApiKey = setApiKey;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
