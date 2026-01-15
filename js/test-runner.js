/**
 * Test Runner Module
 * Automated test execution and result visualization
 */

(function() {
  /**
   * Ballot Test Runner Class
   */
  class BallotTestRunner {
    constructor() {
      this.tests = [];
      this.results = [];
      this.running = false;
      this.currentFilter = 'all';
    }

    /**
     * Load tests from JSON data
     * @param {Object} jsonData - Test data object
     */
    async loadTests(jsonData) {
      // Validate schema
      if (!jsonData.version || jsonData.version !== '1.0') {
        throw new Error('Unsupported test data version: ' + (jsonData.version || 'missing'));
      }

      if (!jsonData.tests || !Array.isArray(jsonData.tests)) {
        throw new Error('Invalid JSON schema: tests array not found');
      }

      this.tests = jsonData.tests;
      this.results = [];

      console.log('Loaded', this.tests.length, 'tests');
    }

    /**
     * Run all tests sequentially
     * @param {number} delay - Optional delay between tests (ms)
     */
    async runAll(delay = 100) {
      if (this.running) {
        console.warn('Tests already running');
        return;
      }

      this.running = true;
      this.results = [];

      const progressSection = document.getElementById('progressSection');
      const progressBar = document.getElementById('progressBar');
      const progressText = document.getElementById('progressText');
      const stopBtn = document.getElementById('stopBtn');
      const runAllBtn = document.getElementById('runAllBtn');

      progressSection.classList.add('active');
      stopBtn.style.display = 'inline-flex';
      runAllBtn.disabled = true;

      for (let i = 0; i < this.tests.length; i++) {
        if (!this.running) {
          console.log('Test run stopped by user');
          break;
        }

        const test = this.tests[i];
        const result = this.runTest(test);
        this.results.push(result);

        // Update progress
        const percent = Math.round((i + 1) / this.tests.length * 100);
        progressBar.style.width = percent + '%';
        progressBar.textContent = percent + '%';
        progressText.textContent = `Running tests... ${i + 1}/${this.tests.length}`;

        // Update UI incrementally
        this.updateSummaryUI();
        this.updateResultsUI();

        // Optional delay for visual verification
        if (delay > 0) {
          await this.delay(delay);
        }
      }

      // Hide progress, show summary
      progressSection.classList.remove('active');
      stopBtn.style.display = 'none';
      runAllBtn.disabled = false;

      console.log('Test run complete:', this.getSummary());

      return this.getSummary();
    }

    /**
     * Stop running tests
     */
    stop() {
      this.running = false;
    }

    /**
     * Run a single test
     * @param {Object} testCase - Test case object
     * @returns {Object} Test result
     */
    runTest(testCase) {
      // Execute validation
      const actual = BallotValidation.validateMark(
        testCase.strokes,
        { debug: true }
      );

      // Compare with expected
      const passed = (
        actual.valid === testCase.expected.valid &&
        (testCase.expected.invalid_type === null ||
         actual.invalid_type === testCase.expected.invalid_type)
      );

      return {
        testId: testCase.id,
        testName: testCase.name,
        testCase: testCase, // Keep reference for "Open in Main App"
        passed: passed,
        expected: testCase.expected,
        actual: {
          valid: actual.valid,
          invalid_type: actual.invalid_type,
          label: actual.label,
          reason: actual.reason
        },
        debug: actual.debug
      };
    }

    /**
     * Get summary statistics
     * @returns {Object} Summary object
     */
    getSummary() {
      const total = this.results.length;
      const passed = this.results.filter(r => r.passed).length;
      const failed = total - passed;
      const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

      return {
        total,
        passed,
        failed,
        passRate
      };
    }

    /**
     * Get failed tests
     * @returns {Array} Array of failed results
     */
    getFailures() {
      return this.results.filter(r => !r.passed);
    }

    /**
     * Open a test case in the main app (index.html)
     * Saves test data to localStorage and opens index.html in new tab
     * @param {Object} testCase - Test case object from this.tests
     */
    openInMainApp(testCase) {
      // Prepare data for localStorage
      const testData = {
        testId: testCase.id,
        testName: testCase.name,
        strokes: testCase.strokes,
        expected: testCase.expected,
        timestamp: Date.now()
      };

      // Save to localStorage (overwrites previous)
      localStorage.setItem('ballotTest_current', JSON.stringify(testData));

      // Open index.html in new tab
      const mainAppWindow = window.open('index.html', '_blank');

      // Optional: Log for debugging
      console.log('Opened test in main app:', testCase.name);

      // Optional: Focus the new window after a delay
      setTimeout(() => {
        if (mainAppWindow) mainAppWindow.focus();
      }, 500);
    }

    /**
     * Open the current test result in main app
     * Useful for investigating failures
     * @param {Object} result - Test result from this.results
     */
    openResultInMainApp(result) {
      // Find the original test case
      const testCase = this.tests.find(t => t.id === result.testId);
      if (testCase) {
        this.openInMainApp(testCase);
      } else {
        console.error('Test case not found:', result.testId);
      }
    }

    /**
     * Update summary UI
     */
    updateSummaryUI() {
      const summary = this.getSummary();
      const summarySection = document.getElementById('summarySection');

      if (summary.total > 0) {
        summarySection.classList.add('active');
      }

      document.getElementById('totalTests').textContent = summary.total;
      document.getElementById('passedTests').textContent = summary.passed;
      document.getElementById('failedTests').textContent = summary.failed;
      document.getElementById('passRate').textContent = summary.passRate + '%';
    }

    /**
     * Update results grid UI
     */
    updateResultsUI() {
      const resultsSection = document.getElementById('resultsSection');
      const testGrid = document.getElementById('testGrid');

      if (this.results.length === 0) {
        resultsSection.classList.remove('active');
        return;
      }

      resultsSection.classList.add('active');

      // Filter results
      let filteredResults = this.results;
      if (this.currentFilter === 'passed') {
        filteredResults = this.results.filter(r => r.passed);
      } else if (this.currentFilter === 'failed') {
        filteredResults = this.results.filter(r => !r.passed);
      }

      if (filteredResults.length === 0) {
        testGrid.innerHTML = '<div class="empty-state">No tests match the current filter</div>';
        return;
      }

      // Render test cards
      testGrid.innerHTML = filteredResults.map(result => {
        const statusClass = result.passed ? 'passed' : 'failed';
        const statusText = result.passed ? '✓ PASS' : '✗ FAIL';

        return `
          <div class="test-card ${statusClass}">
            <canvas class="test-thumbnail" data-test-id="${result.testId}" width="180" height="120"></canvas>
            <div class="test-status ${statusClass}">${statusText}</div>
            <div class="test-name" title="${result.testName}">${result.testName}</div>
            <div class="test-actions">
              <button onclick="runner.openResultInMainApp(runner.results.find(r => r.testId === '${result.testId}'))">
                🔗 Open
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Render thumbnails
      filteredResults.forEach(result => {
        const canvas = document.querySelector(`canvas[data-test-id="${result.testId}"]`);
        if (canvas) {
          this.renderThumbnail(canvas, result.testCase.strokes);
        }
      });

      // Update failures section
      this.updateFailuresUI();
    }

    /**
     * Render test mark thumbnail on canvas
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Array} strokes - Array of strokes
     */
    renderThumbnail(canvas, strokes) {
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;

      // Clear canvas
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);

      // Draw vote box (scaled)
      const scaleX = width / BallotConfig.LOGICAL_WIDTH;
      const scaleY = height / BallotConfig.LOGICAL_HEIGHT;

      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        BallotConfig.VOTE_BOX.x * scaleX,
        BallotConfig.VOTE_BOX.y * scaleY,
        BallotConfig.VOTE_BOX.width * scaleX,
        BallotConfig.VOTE_BOX.height * scaleY
      );

      // Draw strokes
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      strokes.forEach(stroke => {
        if (stroke.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(stroke[0].x * scaleX, stroke[0].y * scaleY);

        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x * scaleX, stroke[i].y * scaleY);
        }

        ctx.stroke();
      });
    }

    /**
     * Update failures section UI
     */
    updateFailuresUI() {
      const failures = this.getFailures();
      const failuresSection = document.getElementById('failuresSection');
      const failureCount = document.getElementById('failureCount');
      const failureList = document.getElementById('failureList');

      if (failures.length === 0) {
        failuresSection.classList.remove('active');
        return;
      }

      failuresSection.classList.add('active');
      failureCount.textContent = failures.length;

      failureList.innerHTML = failures.map(result => {
        const expectedText = result.expected.valid
          ? 'Valid'
          : `Invalid (${result.expected.invalid_type})`;
        const actualText = result.actual.valid
          ? 'Valid'
          : `Invalid (${result.actual.invalid_type})`;

        return `
          <div class="failure-item">
            <div class="failure-title">❌ ${result.testName}</div>
            <div class="failure-details">
              <div><strong>Expected:</strong> ${expectedText}</div>
              <div><strong>Got:</strong> ${actualText}</div>
              ${result.actual.reason ? `<div><strong>Reason:</strong> ${result.actual.reason}</div>` : ''}
            </div>
            <div class="failure-actions">
              <button class="btn btn-primary" onclick="runner.openResultInMainApp(runner.results.find(r => r.testId === '${result.testId}'))">
                🔗 Open in Main App
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    /**
     * Export test results as JSON
     */
    exportJSON() {
      if (this.results.length === 0) {
        alert('No results to export');
        return;
      }

      const summary = this.getSummary();

      const reportData = {
        summary: summary,
        results: this.results.map(r => ({
          testId: r.testId,
          testName: r.testName,
          passed: r.passed,
          expected: r.expected,
          actual: r.actual
        })),
        failures: this.getFailures().map(r => ({
          testId: r.testId,
          testName: r.testName,
          expected: r.expected,
          actual: r.actual
        })),
        timestamp: new Date().toISOString()
      };

      const jsonStr = JSON.stringify(reportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `test-report-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Exported test report');
    }

    /**
     * Helper: delay
     */
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // Global runner instance
  window.runner = new BallotTestRunner();

  // Initialize UI
  function init() {
    const loadTestsBtn = document.getElementById('loadTestsBtn');
    const loadTestsFile = document.getElementById('loadTestsFile');
    const runAllBtn = document.getElementById('runAllBtn');
    const stopBtn = document.getElementById('stopBtn');
    const exportReportBtn = document.getElementById('exportReportBtn');

    // Load Tests button
    loadTestsBtn.addEventListener('click', () => {
      loadTestsFile.click();
    });

    // File input change
    loadTestsFile.addEventListener('change', async (evt) => {
      const file = evt.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        await runner.loadTests(data);

        runAllBtn.disabled = false;
        exportReportBtn.disabled = false;

        alert(`Loaded ${runner.tests.length} tests successfully`);

      } catch (e) {
        alert('Failed to load tests: ' + e.message);
        console.error('Load error:', e);
      }

      // Reset file input
      loadTestsFile.value = '';
    });

    // Run All button
    runAllBtn.addEventListener('click', async () => {
      await runner.runAll(100);
    });

    // Stop button
    stopBtn.addEventListener('click', () => {
      runner.stop();
    });

    // Export Report button
    exportReportBtn.addEventListener('click', () => {
      runner.exportJSON();
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (evt) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        evt.target.classList.add('active');

        runner.currentFilter = evt.target.dataset.filter;
        runner.updateResultsUI();
      });
    });

    console.log('Test Runner initialized');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
