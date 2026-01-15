/**
 * UI & Rendering
 * Canvas drawing and result display
 */

(function() {
  // Module-private variables
  let canvas = null;
  let ctx = null;
  let resultBadge = null;
  let resultReason = null;
  let debugToggle = null;

  window.BallotUI = {
    /**
     * Initialize canvas and UI elements
     * @param {HTMLCanvasElement} canvasElement - Canvas element
     */
    initCanvas: function(canvasElement) {
      canvas = canvasElement;
      ctx = canvas.getContext('2d');

      // Get UI elements
      resultBadge = document.getElementById('resultBadge');
      resultReason = document.getElementById('resultReason');
      debugToggle = document.getElementById('debugToggle');

      // High-DPI scaling
      const dpr = window.devicePixelRatio || 1;
      canvas.width = BallotConfig.LOGICAL_WIDTH * dpr;
      canvas.height = BallotConfig.LOGICAL_HEIGHT * dpr;
      canvas.style.width = BallotConfig.LOGICAL_WIDTH + 'px';
      canvas.style.height = BallotConfig.LOGICAL_HEIGHT + 'px';
      ctx.scale(dpr, dpr);

      // Initial clear
      this.clearCanvas();
    },

    /**
     * Get canvas context
     * @returns {CanvasRenderingContext2D}
     */
    getContext: function() {
      return ctx;
    },

    /**
     * Draw vote box border
     */
    drawVoteBox: function() {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        BallotConfig.VOTE_BOX.x,
        BallotConfig.VOTE_BOX.y,
        BallotConfig.VOTE_BOX.width,
        BallotConfig.VOTE_BOX.height
      );
    },

    /**
     * Clear canvas to white background with vote box
     */
    clearCanvas: function() {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, BallotConfig.LOGICAL_WIDTH, BallotConfig.LOGICAL_HEIGHT);
      this.drawVoteBox();
    },

    /**
     * Redraw all strokes
     * @param {Array} strokes - Array of strokes to draw
     * @param {Object} debugData - Optional debug data for overlay
     */
    redrawAllStrokes: function(strokes, debugData) {
      this.clearCanvas();

      // Redraw all strokes
      ctx.strokeStyle = '#222';
      ctx.lineWidth = BallotConfig.STROKE_WIDTH_PX;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const stroke of strokes) {
        if (stroke.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.stroke();
      }

      // Draw debug overlay if enabled
      if (debugToggle && debugToggle.checked && debugData) {
        this.drawDebugOverlay(debugData);
      }
    },

    /**
     * Draw debug overlay showing validation internals
     * @param {Object} debugData - Debug data from validation
     */
    drawDebugOverlay: function(debugData) {
      if (!debugData) return;

      // Draw cluster centroids
      if (debugData.clusters) {
        for (const cluster of debugData.clusters) {
          const c = cluster.centroid;
          ctx.fillStyle = cluster.isCrossValid ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 100, 0, 0.5)';
          ctx.beginPath();
          ctx.arc(c.x, c.y, 8, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // Draw best cross candidate
      if (debugData.bestCandidate) {
        const c = debugData.bestCandidate.point;

        // Draw crossing point
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Draw 4 arms
        if (debugData.bestCandidate.extensions) {
          const ext = debugData.bestCandidate.extensions;
          ctx.strokeStyle = 'rgba(0, 200, 0, 0.7)';
          ctx.lineWidth = 2;

          if (Array.isArray(ext)) {
            // Extensions is an array
            ext.forEach((len, idx) => {
              const angle = debugData.bestCandidate.armAngles[idx];
              const rad = angle * Math.PI / 180;

              ctx.beginPath();
              ctx.moveTo(c.x, c.y);
              ctx.lineTo(
                c.x + Math.cos(rad) * len,
                c.y + Math.sin(rad) * len
              );
              ctx.stroke();
            });
          } else {
            // Extensions is an object
            Object.keys(ext).forEach((armLabel, idx) => {
              const len = ext[armLabel];
              const angle = debugData.bestCandidate.armAngles[idx];
              const rad = angle * Math.PI / 180;

              ctx.beginPath();
              ctx.moveTo(c.x, c.y);
              ctx.lineTo(
                c.x + Math.cos(rad) * len,
                c.y + Math.sin(rad) * len
              );
              ctx.stroke();
            });
          }
        }
      }

      // Draw all intersections
      if (debugData.allIntersections) {
        ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
        for (const pt of debugData.allIntersections) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // Draw text info
      if (debugData.info) {
        ctx.fillStyle = 'black';
        ctx.font = '11px monospace';
        const lines = debugData.info.split('\n');
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], 10, 20 + i * 13);
        }
      }
    },

    /**
     * Update result badge and reason display
     * @param {Object} result - Validation result
     */
    updateResult: function(result) {
      if (!resultBadge || !resultReason) return;

      resultBadge.className = 'result-badge';

      if (result.valid === null) {
        resultBadge.classList.add('neutral');
        resultBadge.textContent = result.label || 'รอการทำเครื่องหมาย';
        resultReason.textContent = '';
      } else if (result.valid) {
        resultBadge.classList.add('valid');
        resultBadge.textContent = result.label || 'บัตรดี';
        resultReason.textContent = '';
      } else {
        resultBadge.classList.add('invalid');
        resultBadge.textContent = result.label || 'บัตรเสีย';
        resultReason.textContent = result.reason;
      }
    }
  };
})();
