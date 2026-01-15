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

    console.log('Thai Ballot Validator initialized');
  }
})();
