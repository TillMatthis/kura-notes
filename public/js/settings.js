/**
 * KURA Notes - Settings Module
 * Handles API key management and settings UI
 */

const Settings = {
  /**
   * Initialize settings module
   */
  init() {
    // Create settings modal
    this.createSettingsModal();

    // Check if API key exists, if not show modal automatically
    const apiKey = localStorage.getItem('kura_api_key');
    if (!apiKey) {
      // Show modal after a short delay to let page load
      setTimeout(() => {
        this.openModal();
      }, 500);
    }

    // Update status indicator
    this.updateStatusIndicator();

    // Make functions globally available
    window.openSettings = () => this.openModal();
    window.closeSettings = () => this.closeModal();
  },

  /**
   * Create settings modal DOM structure
   */
  createSettingsModal() {
    // Check if modal already exists
    if (document.getElementById('settings-modal')) {
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="closeSettings()"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">⚙️ Settings</h2>
          <button class="modal-close" onclick="closeSettings()" aria-label="Close">&times;</button>
        </div>

        <div class="modal-body">
          <!-- Status Indicator -->
          <div class="settings-status" id="settings-status">
            <div class="status-indicator" id="status-indicator">
              <span class="status-icon" id="status-icon">❌</span>
              <span class="status-text" id="status-text">No API Key Set</span>
            </div>
          </div>

          <!-- API Key Form -->
          <div class="form-group">
            <label class="form-label" for="api-key-input">
              API Key
              <span class="form-help" style="font-weight: normal; color: var(--text-muted);">
                Required to access KURA Notes
              </span>
            </label>
            <div class="input-with-toggle">
              <input
                type="password"
                id="api-key-input"
                class="form-input"
                placeholder="Enter your API key"
                autocomplete="off"
              >
              <button
                type="button"
                class="input-toggle-btn"
                id="toggle-visibility-btn"
                onclick="Settings.togglePasswordVisibility()"
                aria-label="Toggle password visibility"
              >
                👁️
              </button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="settings-actions">
            <button
              type="button"
              class="btn btn-primary"
              onclick="Settings.saveApiKey()"
              id="save-btn"
            >
              💾 Save
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              onclick="Settings.testConnection()"
              id="test-btn"
            >
              🔌 Test Connection
            </button>
            <button
              type="button"
              class="btn btn-danger"
              onclick="Settings.clearApiKey()"
              id="clear-btn"
            >
              🗑️ Clear
            </button>
          </div>

          <!-- Test Result -->
          <div id="test-result" class="test-result" style="display: none;"></div>
        </div>

        <div class="modal-footer">
          <p class="text-muted" style="font-size: 0.875rem; margin: 0;">
            Your API key is stored locally in your browser and never sent to any third party.
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Load current API key if exists
    const apiKey = localStorage.getItem('kura_api_key');
    if (apiKey) {
      document.getElementById('api-key-input').value = apiKey;
    }

    // Setup ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('settings-modal');
        if (modal && !modal.classList.contains('hidden')) {
          this.closeModal();
        }
      }
    });
  },

  /**
   * Open settings modal
   */
  openModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';

      // Load current API key if exists
      const apiKey = localStorage.getItem('kura_api_key');
      const input = document.getElementById('api-key-input');
      if (input) {
        input.value = apiKey || '';
      }

      // Update status
      this.updateModalStatus();

      // Focus input
      setTimeout(() => {
        if (input) input.focus();
      }, 100);
    }
  },

  /**
   * Close settings modal
   */
  closeModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';

      // Clear test result
      const testResult = document.getElementById('test-result');
      if (testResult) {
        testResult.style.display = 'none';
      }
    }
  },

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility() {
    const input = document.getElementById('api-key-input');
    const toggleBtn = document.getElementById('toggle-visibility-btn');

    if (input.type === 'password') {
      input.type = 'text';
      toggleBtn.textContent = '🙈';
      toggleBtn.setAttribute('aria-label', 'Hide password');
    } else {
      input.type = 'password';
      toggleBtn.textContent = '👁️';
      toggleBtn.setAttribute('aria-label', 'Show password');
    }
  },

  /**
   * Save API key to localStorage
   */
  saveApiKey() {
    const input = document.getElementById('api-key-input');
    const apiKey = input.value.trim();

    if (!apiKey) {
      this.showTestResult('Please enter an API key', 'error');
      return;
    }

    // Save to localStorage
    localStorage.setItem('kura_api_key', apiKey);

    // Update status
    this.updateModalStatus();
    this.updateStatusIndicator();

    // Show success message
    this.showTestResult('✓ API key saved successfully!', 'success');

    // Show toast notification
    if (window.Toast) {
      Toast.success('API key saved successfully!');
    }

    // Reload page after short delay to apply new key
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  },

  /**
   * Clear API key from localStorage
   */
  clearApiKey() {
    const confirmed = confirm('Are you sure you want to remove your API key? You will need to enter it again to use KURA Notes.');

    if (!confirmed) {
      return;
    }

    // Remove from localStorage
    localStorage.removeItem('kura_api_key');

    // Clear input
    const input = document.getElementById('api-key-input');
    if (input) {
      input.value = '';
    }

    // Update status
    this.updateModalStatus();
    this.updateStatusIndicator();

    // Show message
    this.showTestResult('API key cleared', 'info');

    // Show toast notification
    if (window.Toast) {
      Toast.info('API key cleared');
    }
  },

  /**
   * Test API connection
   */
  async testConnection() {
    const input = document.getElementById('api-key-input');
    const apiKey = input.value.trim();

    if (!apiKey) {
      this.showTestResult('Please enter an API key to test', 'error');
      return;
    }

    // Show loading state
    const testBtn = document.getElementById('test-btn');
    const originalText = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = '⏳ Testing...';

    try {
      // Test the API key by calling /api/health
      const response = await fetch(`${window.location.origin}/api/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.showTestResult('✓ Connection successful! API key is valid.', 'success');

        if (window.Toast) {
          Toast.success('Connection successful!');
        }
      } else {
        this.showTestResult(`✕ Connection failed: ${response.status} ${response.statusText}`, 'error');

        if (window.Toast) {
          Toast.error('Invalid API key or connection failed');
        }
      }
    } catch (error) {
      console.error('Test connection error:', error);
      this.showTestResult(`✕ Connection error: ${error.message}`, 'error');

      if (window.Toast) {
        Toast.error('Connection test failed');
      }
    } finally {
      // Restore button
      testBtn.disabled = false;
      testBtn.innerHTML = originalText;
    }
  },

  /**
   * Show test result message
   */
  showTestResult(message, type = 'info') {
    const testResult = document.getElementById('test-result');
    if (!testResult) return;

    testResult.className = `test-result test-result-${type}`;
    testResult.textContent = message;
    testResult.style.display = 'block';

    // Auto-hide after 5 seconds for success/info messages
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        testResult.style.display = 'none';
      }, 5000);
    }
  },

  /**
   * Update status indicator in modal
   */
  updateModalStatus() {
    const apiKey = localStorage.getItem('kura_api_key');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.getElementById('status-indicator');

    if (!statusIcon || !statusText || !statusIndicator) return;

    if (apiKey) {
      statusIcon.textContent = '✅';
      statusText.textContent = 'API Key Configured';
      statusIndicator.classList.remove('status-error');
      statusIndicator.classList.add('status-success');
    } else {
      statusIcon.textContent = '❌';
      statusText.textContent = 'No API Key Set';
      statusIndicator.classList.remove('status-success');
      statusIndicator.classList.add('status-error');
    }
  },

  /**
   * Update status indicator in header
   */
  updateStatusIndicator() {
    const indicator = document.getElementById('api-status-indicator');
    if (!indicator) return;

    const apiKey = localStorage.getItem('kura_api_key');

    if (apiKey) {
      indicator.className = 'api-status-indicator api-status-success';
      indicator.setAttribute('title', 'API Key Configured');
    } else {
      indicator.className = 'api-status-indicator api-status-error';
      indicator.setAttribute('title', 'No API Key Set');
    }
  },
};

// Make Settings globally available
window.Settings = Settings;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Settings.init());
} else {
  Settings.init();
}
