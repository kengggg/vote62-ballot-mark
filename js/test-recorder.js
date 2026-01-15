/**
 * Test Recorder Module
 * Records ballot marks with metadata for automated testing
 */

(function() {
  // Test Recorder Module
  window.TestRecorder = {
    // State
    testCollection: [],
    currentEditingId: null,

    /**
     * Initialize the test recorder
     */
    init: function() {
      // Load from localStorage if available
      this.loadFromLocalStorage();

      // Setup UI event listeners
      this.setupEventListeners();

      // Setup canvas and input handling
      const canvas = document.getElementById('ballotCanvas');
      if (canvas) {
        BallotUI.initCanvas(canvas);
        const ctx = BallotUI.getContext();

        // Initialize input handler
        BallotInput.init(canvas, ctx);

        // Attach pointer event listeners
        canvas.addEventListener('pointerdown', (evt) => BallotInput.handlePointerDown(evt));
        canvas.addEventListener('pointermove', (evt) => BallotInput.handlePointerMove(evt));
        canvas.addEventListener('pointerup', (evt) => BallotInput.handlePointerUp(evt));
        canvas.addEventListener('pointercancel', (evt) => BallotInput.handlePointerCancel(evt));
      }

      // Update UI
      this.updateCollectionUI();

      console.log('Test Recorder initialized');
    },

    /**
     * Setup event listeners for UI elements
     */
    setupEventListeners: function() {
      // Test Current button
      document.getElementById('testCurrentBtn').addEventListener('click', () => {
        this.testCurrentMark();
      });

      // Clear Canvas button
      document.getElementById('clearCanvasBtn').addEventListener('click', () => {
        BallotInput.clear();
        document.getElementById('currentResult').textContent = 'Ready to draw';
        document.getElementById('currentResult').className = 'result-badge neutral';
      });

      // Save Test button
      document.getElementById('saveTestBtn').addEventListener('click', () => {
        this.saveTest();
      });

      // Export button
      document.getElementById('exportBtn').addEventListener('click', () => {
        this.exportJSON();
      });

      // Import button
      document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
      });

      // Import file input
      document.getElementById('importFile').addEventListener('change', (evt) => {
        const file = evt.target.files[0];
        if (file) {
          this.importJSON(file);
        }
      });

      // Clear All button
      document.getElementById('clearAllBtn').addEventListener('click', () => {
        if (confirm('Clear all tests? This cannot be undone.')) {
          this.testCollection = [];
          this.saveToLocalStorage();
          this.updateCollectionUI();
        }
      });

      // Expected result radio buttons
      document.querySelectorAll('input[name="expectedResult"]').forEach(radio => {
        radio.addEventListener('change', (evt) => {
          const invalidTypeGroup = document.getElementById('invalidTypeGroup');
          invalidTypeGroup.style.display = evt.target.value === 'invalid' ? 'block' : 'none';
        });
      });
    },

    /**
     * Test current mark and show validation result
     */
    testCurrentMark: function() {
      const strokes = window.ballotState.strokes;

      if (strokes.length === 0) {
        alert('Please draw a mark first');
        return;
      }

      const result = BallotValidation.validateMark(strokes, { debug: false });

      // Update result display
      const resultBadge = document.getElementById('currentResult');
      resultBadge.textContent = result.label + (result.reason ? ' - ' + result.reason : '');

      if (result.valid === null) {
        resultBadge.className = 'result-badge neutral';
      } else if (result.valid) {
        resultBadge.className = 'result-badge valid';
      } else {
        resultBadge.className = 'result-badge invalid';
      }

      // Auto-fill form based on result
      if (result.valid) {
        document.querySelector('input[name="expectedResult"][value="valid"]').checked = true;
        document.getElementById('invalidTypeGroup').style.display = 'none';
      } else if (result.valid === false) {
        document.querySelector('input[name="expectedResult"][value="invalid"]').checked = true;
        document.getElementById('invalidTypeGroup').style.display = 'block';
        if (result.invalid_type) {
          document.getElementById('invalidType').value = result.invalid_type;
        }
      }

      console.log('Validation result:', result);
    },

    /**
     * Save current test to collection
     */
    saveTest: function() {
      const strokes = window.ballotState.strokes;

      if (strokes.length === 0) {
        alert('Please draw a mark first');
        return;
      }

      const name = document.getElementById('testName').value.trim();
      if (!name) {
        alert('Please enter a test name');
        document.getElementById('testName').focus();
        return;
      }

      const expectedValid = document.querySelector('input[name="expectedResult"]:checked').value === 'valid';
      const invalidType = expectedValid ? null : document.getElementById('invalidType').value;
      const notes = document.getElementById('testNotes').value.trim();

      const expected = {
        valid: expectedValid,
        invalid_type: invalidType
      };

      // Create test object
      const test = {
        id: this.currentEditingId || this.generateId(),
        name: name,
        category: expectedValid ? 'valid' : 'invalid',
        expected: expected,
        strokes: JSON.parse(JSON.stringify(strokes)), // Deep copy
        notes: notes,
        recordedAt: Date.now()
      };

      // Add or update test
      if (this.currentEditingId) {
        // Update existing test
        const index = this.testCollection.findIndex(t => t.id === this.currentEditingId);
        if (index !== -1) {
          this.testCollection[index] = test;
        }
        this.currentEditingId = null;
      } else {
        // Add new test
        this.testCollection.push(test);
      }

      // Save and update UI
      this.saveToLocalStorage();
      this.updateCollectionUI();

      // Clear canvas and form
      BallotInput.clear();
      document.getElementById('testName').value = '';
      document.getElementById('testNotes').value = '';
      document.getElementById('currentResult').textContent = 'Ready to draw';
      document.getElementById('currentResult').className = 'result-badge neutral';

      console.log('Test saved:', test.name);
    },

    /**
     * Edit existing test
     */
    editTest: function(testId) {
      const test = this.testCollection.find(t => t.id === testId);
      if (!test) return;

      this.currentEditingId = testId;

      // Load strokes into canvas
      window.ballotState.strokes = JSON.parse(JSON.stringify(test.strokes)); // Deep copy
      BallotUI.redrawAllStrokes(window.ballotState.strokes, null);

      // Fill form
      document.getElementById('testName').value = test.name;
      document.getElementById('testNotes').value = test.notes || '';

      if (test.expected.valid) {
        document.querySelector('input[name="expectedResult"][value="valid"]').checked = true;
        document.getElementById('invalidTypeGroup').style.display = 'none';
      } else {
        document.querySelector('input[name="expectedResult"][value="invalid"]').checked = true;
        document.getElementById('invalidTypeGroup').style.display = 'block';
        if (test.expected.invalid_type) {
          document.getElementById('invalidType').value = test.expected.invalid_type;
        }
      }

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Run validation
      this.testCurrentMark();

      console.log('Editing test:', test.name);
    },

    /**
     * Delete test from collection
     */
    deleteTest: function(testId) {
      const test = this.testCollection.find(t => t.id === testId);
      if (!test) return;

      if (confirm(`Delete test "${test.name}"?`)) {
        this.testCollection = this.testCollection.filter(t => t.id !== testId);
        this.saveToLocalStorage();
        this.updateCollectionUI();
        console.log('Test deleted:', test.name);
      }
    },

    /**
     * Update collection UI list
     */
    updateCollectionUI: function() {
      const list = document.getElementById('testList');
      const count = document.getElementById('collectionCount');

      count.textContent = `(${this.testCollection.length}/32)`;

      if (this.testCollection.length === 0) {
        list.innerHTML = '<li class="empty-state">No tests recorded yet. Draw a mark and save it to get started.</li>';
        return;
      }

      list.innerHTML = this.testCollection.map(test => {
        const icon = test.expected.valid ? '✓' : '✗';
        const statusText = test.expected.valid ? 'Valid' : `Invalid (${test.expected.invalid_type})`;

        return `
          <li class="test-item">
            <div class="test-info">
              <div class="test-name">${icon} ${test.name}</div>
              <div class="test-meta">Expected: ${statusText}</div>
            </div>
            <div class="test-actions">
              <button class="btn btn-secondary btn-small" onclick="TestRecorder.editTest('${test.id}')">Edit</button>
              <button class="btn btn-danger btn-small" onclick="TestRecorder.deleteTest('${test.id}')">Delete</button>
            </div>
          </li>
        `;
      }).join('');
    },

    /**
     * Export tests as JSON
     */
    exportJSON: function() {
      if (this.testCollection.length === 0) {
        alert('No tests to export');
        return;
      }

      const data = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        config: BallotConfig,
        tests: this.testCollection
      };

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `test-cases-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Exported', this.testCollection.length, 'tests');
    },

    /**
     * Import tests from JSON file
     */
    importJSON: function(file) {
      const reader = new FileReader();

      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);

          // Validate schema
          if (!data.version || !data.tests || !Array.isArray(data.tests)) {
            throw new Error('Invalid JSON schema');
          }

          // Ask user: merge or replace
          let shouldMerge = false;
          if (this.testCollection.length > 0) {
            shouldMerge = confirm('Merge with existing tests? (Cancel to replace all)');
          }

          if (shouldMerge) {
            // Merge: add tests with new IDs to avoid conflicts
            data.tests.forEach(test => {
              test.id = this.generateId();
              this.testCollection.push(test);
            });
          } else {
            // Replace all
            this.testCollection = data.tests;
          }

          // Save and update
          this.saveToLocalStorage();
          this.updateCollectionUI();

          alert(`Imported ${data.tests.length} tests successfully`);
          console.log('Imported tests:', data.tests.length);

        } catch (e) {
          alert('Failed to import: ' + e.message);
          console.error('Import error:', e);
        }

        // Reset file input
        document.getElementById('importFile').value = '';
      };

      reader.readAsText(file);
    },

    /**
     * Generate unique ID
     */
    generateId: function() {
      return 'test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Save collection to localStorage
     */
    saveToLocalStorage: function() {
      try {
        localStorage.setItem('ballotTestCollection', JSON.stringify(this.testCollection));
      } catch (e) {
        console.error('Failed to save to localStorage:', e);
      }
    },

    /**
     * Load collection from localStorage
     */
    loadFromLocalStorage: function() {
      try {
        const data = localStorage.getItem('ballotTestCollection');
        if (data) {
          this.testCollection = JSON.parse(data);
          console.log('Loaded', this.testCollection.length, 'tests from localStorage');
        }
      } catch (e) {
        console.error('Failed to load from localStorage:', e);
        this.testCollection = [];
      }
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TestRecorder.init());
  } else {
    TestRecorder.init();
  }
})();
