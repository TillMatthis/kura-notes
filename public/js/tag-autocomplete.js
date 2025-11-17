/**
 * Tag Autocomplete Component
 *
 * Provides autocomplete functionality for tag input fields.
 * Supports:
 * - Comma-separated tags
 * - Autocomplete dropdown with suggestions
 * - Tag counts displayed next to suggestions
 * - Creating new tags
 * - Keyboard navigation (arrow keys, enter, escape)
 */

class TagAutocomplete {
  /**
   * @param {HTMLInputElement} inputElement - The input field for tags
   * @param {Object} options - Configuration options
   */
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      minChars: 1,           // Minimum characters before showing suggestions
      maxSuggestions: 10,    // Maximum number of suggestions to show
      debounceMs: 200,       // Debounce delay for API calls
      placeholder: 'Type to search tags...',
      ...options
    };

    this.dropdown = null;
    this.suggestions = [];
    this.selectedIndex = -1;
    this.debounceTimer = null;
    this.isOpen = false;

    this.init();
  }

  /**
   * Initialize the autocomplete component
   */
  init() {
    // Create dropdown element
    this.createDropdown();

    // Set up event listeners
    this.input.addEventListener('input', (e) => this.handleInput(e));
    this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.input.addEventListener('focus', (e) => this.handleFocus(e));

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.hideDropdown();
      }
    });
  }

  /**
   * Create the dropdown element
   */
  createDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'tag-autocomplete-dropdown';
    this.dropdown.style.display = 'none';

    // Position dropdown below the input
    this.dropdown.style.position = 'absolute';
    this.dropdown.style.zIndex = '1000';
    this.dropdown.style.backgroundColor = 'var(--bg-primary)';
    this.dropdown.style.border = '1px solid var(--border-color)';
    this.dropdown.style.borderRadius = 'var(--radius-md)';
    this.dropdown.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    this.dropdown.style.maxHeight = '300px';
    this.dropdown.style.overflowY = 'auto';
    this.dropdown.style.minWidth = '250px';

    // Insert dropdown after input
    this.input.parentNode.style.position = 'relative';
    this.input.parentNode.appendChild(this.dropdown);
  }

  /**
   * Handle input event
   */
  handleInput(e) {
    clearTimeout(this.debounceTimer);

    const query = this.getCurrentTagQuery();

    if (query.length >= this.options.minChars) {
      this.debounceTimer = setTimeout(() => {
        this.fetchSuggestions(query);
      }, this.options.debounceMs);
    } else {
      this.hideDropdown();
    }
  }

  /**
   * Handle focus event
   */
  handleFocus(e) {
    const query = this.getCurrentTagQuery();
    if (query.length >= this.options.minChars) {
      this.fetchSuggestions(query);
    }
  }

  /**
   * Handle keydown event
   */
  handleKeydown(e) {
    if (!this.isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectPrevious();
        break;
      case 'Enter':
        if (this.selectedIndex >= 0) {
          e.preventDefault();
          this.selectSuggestion(this.suggestions[this.selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        this.hideDropdown();
        break;
    }
  }

  /**
   * Get the current tag being typed (after the last comma)
   */
  getCurrentTagQuery() {
    const cursorPosition = this.input.selectionStart;
    const value = this.input.value.substring(0, cursorPosition);
    const lastCommaIndex = value.lastIndexOf(',');

    if (lastCommaIndex === -1) {
      return value.trim();
    }

    return value.substring(lastCommaIndex + 1).trim();
  }

  /**
   * Get the position to insert selected tag
   */
  getInsertPosition() {
    const cursorPosition = this.input.selectionStart;
    const value = this.input.value;
    const beforeCursor = value.substring(0, cursorPosition);
    const afterCursor = value.substring(cursorPosition);
    const lastCommaIndex = beforeCursor.lastIndexOf(',');

    return {
      start: lastCommaIndex === -1 ? 0 : lastCommaIndex + 1,
      end: cursorPosition,
      beforeCursor,
      afterCursor
    };
  }

  /**
   * Fetch tag suggestions from API
   */
  async fetchSuggestions(query) {
    try {
      const response = await apiRequest(`/api/tags/search?q=${encodeURIComponent(query)}&limit=${this.options.maxSuggestions}`);

      this.suggestions = response.tags || [];
      this.renderSuggestions();
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error);
      this.hideDropdown();
    }
  }

  /**
   * Render suggestions in dropdown
   */
  renderSuggestions() {
    if (this.suggestions.length === 0) {
      this.hideDropdown();
      return;
    }

    this.dropdown.innerHTML = '';
    this.selectedIndex = -1;

    this.suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'tag-autocomplete-item';
      item.style.padding = 'var(--spacing-sm) var(--spacing-md)';
      item.style.cursor = 'pointer';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.transition = 'background-color 0.2s';

      // Tag name
      const tagName = document.createElement('span');
      tagName.textContent = suggestion.tag;
      tagName.style.fontWeight = '500';

      // Tag count badge
      const tagCount = document.createElement('span');
      tagCount.textContent = suggestion.count;
      tagCount.className = 'tag-count-badge';
      tagCount.style.fontSize = '0.75rem';
      tagCount.style.color = 'var(--text-muted)';
      tagCount.style.backgroundColor = 'var(--bg-secondary)';
      tagCount.style.padding = '2px 8px';
      tagCount.style.borderRadius = 'var(--radius-sm)';
      tagCount.style.fontWeight = '600';

      item.appendChild(tagName);
      item.appendChild(tagCount);

      // Hover effect
      item.addEventListener('mouseenter', () => {
        this.selectIndex(index);
      });

      // Click event
      item.addEventListener('click', () => {
        this.selectSuggestion(suggestion);
      });

      this.dropdown.appendChild(item);
    });

    this.showDropdown();
  }

  /**
   * Select a suggestion by index
   */
  selectIndex(index) {
    // Remove previous selection
    const items = this.dropdown.querySelectorAll('.tag-autocomplete-item');
    items.forEach((item) => {
      item.style.backgroundColor = '';
    });

    // Select new item
    this.selectedIndex = index;
    if (index >= 0 && index < items.length) {
      items[index].style.backgroundColor = 'var(--bg-secondary)';
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Select next suggestion
   */
  selectNext() {
    const nextIndex = (this.selectedIndex + 1) % this.suggestions.length;
    this.selectIndex(nextIndex);
  }

  /**
   * Select previous suggestion
   */
  selectPrevious() {
    const prevIndex = this.selectedIndex <= 0
      ? this.suggestions.length - 1
      : this.selectedIndex - 1;
    this.selectIndex(prevIndex);
  }

  /**
   * Select a suggestion and insert it into the input
   */
  selectSuggestion(suggestion) {
    const position = getInsertPosition();
    const currentValue = this.input.value;
    const beforeCursor = currentValue.substring(0, position.start);
    const afterCursor = currentValue.substring(position.end);

    // Build new value with selected tag
    let newValue = '';
    if (beforeCursor.trim().length > 0) {
      // There are existing tags
      newValue = beforeCursor.trim() + ', ' + suggestion.tag;
    } else {
      // This is the first tag
      newValue = suggestion.tag;
    }

    // Add comma and space if there are tags after cursor
    if (afterCursor.trim().length > 0 && !afterCursor.startsWith(',')) {
      newValue += ', ' + afterCursor.trim();
    } else if (afterCursor.trim().length > 0) {
      newValue += afterCursor;
    }

    this.input.value = newValue;

    // Position cursor after the inserted tag
    const cursorPos = newValue.length - afterCursor.length;
    this.input.setSelectionRange(cursorPos, cursorPos);

    this.hideDropdown();
    this.input.focus();

    // Helper function to get insert position
    function getInsertPosition() {
      const cursorPosition = this.input.selectionStart;
      const value = this.input.value;
      const beforeCursor = value.substring(0, cursorPosition);
      const afterCursor = value.substring(cursorPosition);
      const lastCommaIndex = beforeCursor.lastIndexOf(',');

      return {
        start: lastCommaIndex === -1 ? 0 : lastCommaIndex + 1,
        end: cursorPosition,
        beforeCursor,
        afterCursor
      };
    }
  }

  /**
   * Show dropdown
   */
  showDropdown() {
    // Position dropdown
    const inputRect = this.input.getBoundingClientRect();
    this.dropdown.style.top = `${this.input.offsetHeight + 4}px`;
    this.dropdown.style.left = '0';
    this.dropdown.style.width = `${this.input.offsetWidth}px`;

    this.dropdown.style.display = 'block';
    this.isOpen = true;
  }

  /**
   * Hide dropdown
   */
  hideDropdown() {
    this.dropdown.style.display = 'none';
    this.isOpen = false;
    this.selectedIndex = -1;
  }

  /**
   * Destroy the autocomplete component
   */
  destroy() {
    if (this.dropdown && this.dropdown.parentNode) {
      this.dropdown.parentNode.removeChild(this.dropdown);
    }
    clearTimeout(this.debounceTimer);
  }
}

/**
 * Initialize tag autocomplete on an input element
 * @param {string|HTMLInputElement} selector - CSS selector or input element
 * @param {Object} options - Configuration options
 * @returns {TagAutocomplete} The autocomplete instance
 */
function initTagAutocomplete(selector, options = {}) {
  const input = typeof selector === 'string'
    ? document.querySelector(selector)
    : selector;

  if (!input) {
    console.error('Tag autocomplete: Input element not found');
    return null;
  }

  return new TagAutocomplete(input, options);
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.TagAutocomplete = TagAutocomplete;
  window.initTagAutocomplete = initTagAutocomplete;
}
