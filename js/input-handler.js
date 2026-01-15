/**
 * Input Handler
 * Pointer event handling for drawing
 */

// Shared application state
window.ballotState = {
  strokes: [],
  currentStroke: null,
  activePointerId: null,
  evaluationTimer: null,
  debugData: null
};

(function() {
  // Module-private variable
  let canvas = null;
  let ctx = null;

  window.BallotInput = {
    /**
     * Initialize input handler with canvas
     * @param {HTMLCanvasElement} canvasElement - Canvas element
     * @param {CanvasRenderingContext2D} context - Canvas context
     */
    init: function(canvasElement, context) {
      canvas = canvasElement;
      ctx = context;
    },

    /**
     * Convert viewport coordinates to canvas coordinates
     * @param {PointerEvent} evt - Pointer event
     * @returns {Object} Point {x, y, t}
     */
    getCanvasPoint: function(evt) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (evt.clientX - rect.left) * (BallotConfig.LOGICAL_WIDTH / rect.width),
        y: (evt.clientY - rect.top) * (BallotConfig.LOGICAL_HEIGHT / rect.height),
        t: Date.now()
      };
    },

    /**
     * Handle pointer down event
     * @param {PointerEvent} evt - Pointer event
     */
    handlePointerDown: function(evt) {
      if (window.ballotState.activePointerId !== null) return;

      window.ballotState.activePointerId = evt.pointerId;
      canvas.setPointerCapture(evt.pointerId);

      const pt = this.getCanvasPoint(evt);
      window.ballotState.currentStroke = [pt];

      evt.preventDefault();
    },

    /**
     * Handle pointer move event
     * @param {PointerEvent} evt - Pointer event
     */
    handlePointerMove: function(evt) {
      if (evt.pointerId !== window.ballotState.activePointerId) return;

      const pt = this.getCanvasPoint(evt);
      window.ballotState.currentStroke.push(pt);

      // Draw incremental segment
      if (window.ballotState.currentStroke.length >= 2) {
        const prev = window.ballotState.currentStroke[window.ballotState.currentStroke.length - 2];
        ctx.strokeStyle = '#222';
        ctx.lineWidth = BallotConfig.STROKE_WIDTH_PX;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }

      evt.preventDefault();
    },

    /**
     * Handle pointer up event
     * @param {PointerEvent} evt - Pointer event
     */
    handlePointerUp: function(evt) {
      if (evt.pointerId !== window.ballotState.activePointerId) return;

      canvas.releasePointerCapture(evt.pointerId);
      window.ballotState.activePointerId = null;

      if (window.ballotState.currentStroke && window.ballotState.currentStroke.length >= 2) {
        window.ballotState.strokes.push(window.ballotState.currentStroke);
        this.scheduleEvaluation();
      }

      window.ballotState.currentStroke = null;
      evt.preventDefault();
    },

    /**
     * Handle pointer cancel event
     * @param {PointerEvent} evt - Pointer event
     */
    handlePointerCancel: function(evt) {
      if (evt.pointerId !== window.ballotState.activePointerId) return;

      canvas.releasePointerCapture(evt.pointerId);
      window.ballotState.activePointerId = null;
      window.ballotState.currentStroke = null;

      evt.preventDefault();
    },

    /**
     * Schedule validation with debounce
     */
    scheduleEvaluation: function() {
      if (window.ballotState.evaluationTimer) {
        clearTimeout(window.ballotState.evaluationTimer);
      }

      window.ballotState.evaluationTimer = setTimeout(() => {
        const result = BallotValidation.validateMark(window.ballotState.strokes, { debug: true });

        // Store validation result and debug data globally
        window.lastValidation = result;
        window.ballotState.debugData = result.debug || null;

        // Log validation result with debug info if available
        if (result.debug) {
          console.log('Validation result:', {
            valid: result.valid,
            invalid_type: result.invalid_type,
            reason: result.reason,
            debug: result.debug
          });
        }

        BallotUI.updateResult(result);

        // Redraw with debug overlay if enabled
        const debugToggle = document.getElementById('debugToggle');
        if (debugToggle && debugToggle.checked) {
          BallotUI.redrawAllStrokes(window.ballotState.strokes, window.ballotState.debugData);
        }
      }, BallotConfig.EVALUATION_DEBOUNCE_MS);
    },

    /**
     * Clear all strokes and reset state
     */
    clear: function() {
      window.ballotState.strokes = [];
      window.ballotState.currentStroke = null;
      window.ballotState.debugData = null;
      BallotUI.clearCanvas();

      // Show waiting state
      BallotUI.updateResult({
        valid: null,
        label: 'รอการทำเครื่องหมาย',
        invalid_type: null,
        reason: ''
      });
    }
  };
})();
