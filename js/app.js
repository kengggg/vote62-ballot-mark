/**
 * Application Initialization
 * Wire everything together and set up event listeners
 */

(function() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Get DOM elements
    const canvas = document.getElementById('ballotCanvas');
    const clearBtn = document.getElementById('clearBtn');
    const debugToggle = document.getElementById('debugToggle');

    if (!canvas || !clearBtn || !debugToggle) {
      console.error('Required DOM elements not found');
      return;
    }

    // Initialize UI
    BallotUI.initCanvas(canvas);
    const ctx = BallotUI.getContext();

    // Initialize input handler
    BallotInput.init(canvas, ctx);

    // Attach pointer event listeners
    canvas.addEventListener('pointerdown', (evt) => BallotInput.handlePointerDown(evt));
    canvas.addEventListener('pointermove', (evt) => BallotInput.handlePointerMove(evt));
    canvas.addEventListener('pointerup', (evt) => BallotInput.handlePointerUp(evt));
    canvas.addEventListener('pointercancel', (evt) => BallotInput.handlePointerCancel(evt));

    // Clear button
    clearBtn.addEventListener('click', () => {
      BallotInput.clear();
    });

    // Debug toggle
    debugToggle.addEventListener('change', () => {
      BallotUI.redrawAllStrokes(window.ballotState.strokes, window.ballotState.debugData);
    });

    // Check for test data from test runner
    loadTestDataIfPresent();

    console.log('Thai Ballot Validator initialized');
  }

  /**
   * Load test data from localStorage if present
   * Enables AI collaboration loop from test runner
   */
  function loadTestDataIfPresent() {
    const testData = localStorage.getItem('ballotTest_current');

    if (testData) {
      try {
        const test = JSON.parse(testData);

        // Load strokes into state
        window.ballotState.strokes = test.strokes;

        // Redraw canvas with loaded strokes
        BallotUI.redrawAllStrokes(test.strokes, null);

        // Trigger validation
        const result = BallotValidation.validateMark(test.strokes, { debug: true });
        window.ballotState.debugData = result.debug || null;
        BallotUI.updateResult(result);

        // Show indicator that this is test data
        showTestDataBanner(test);

        console.log('Loaded test data:', test.testName);
        console.log('Expected:', test.expected);
        console.log('Actual:', {
          valid: result.valid,
          invalid_type: result.invalid_type,
          reason: result.reason
        });

      } catch (e) {
        console.error('Failed to load test data:', e);
      }
    }
  }

  /**
   * Show banner indicating test data is loaded
   * @param {Object} test - Test data object
   */
  function showTestDataBanner(test) {
    const banner = document.createElement('div');
    banner.id = 'testDataBanner';
    banner.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #ff9800;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 16px;
    `;
    banner.innerHTML = `
      <span>🧪 Test: ${test.testName}</span>
      <span style="opacity: 0.8;">Expected: ${test.expected.valid ? 'Valid' : 'Invalid (' + test.expected.invalid_type + ')'}</span>
      <button onclick="closeTestMode()" style="
        background: rgba(255,255,255,0.2);
        border: 1px solid white;
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      ">Clear Test</button>
    `;
    document.body.appendChild(banner);
  }

  /**
   * Clear test mode - global function
   */
  window.closeTestMode = function() {
    localStorage.removeItem('ballotTest_current');
    const banner = document.getElementById('testDataBanner');
    if (banner) banner.remove();
    BallotInput.clear();
  };
})();
