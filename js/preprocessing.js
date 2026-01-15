/**
 * Stroke Preprocessing
 * Algorithms for stroke simplification and resampling
 */

window.BallotPreprocessing = {
  /**
   * Resample stroke at uniform intervals
   * @param {Array} stroke - Array of points {x, y}
   * @param {number} step - Step size in pixels
   * @returns {Array} Resampled stroke
   */
  resampleStroke: function(stroke, step) {
    if (stroke.length < 2) return stroke;

    const resampled = [stroke[0]];
    let accumulated = 0;

    for (let i = 1; i < stroke.length; i++) {
      const d = BallotGeometry.dist(stroke[i - 1], stroke[i]);
      accumulated += d;

      while (accumulated >= step) {
        const t = (accumulated - step) / d;
        const pt = {
          x: stroke[i].x - t * (stroke[i].x - stroke[i - 1].x),
          y: stroke[i].y - t * (stroke[i].y - stroke[i - 1].y)
        };
        resampled.push(pt);
        accumulated -= step;
      }
    }

    if (BallotGeometry.dist(resampled[resampled.length - 1], stroke[stroke.length - 1]) > 0.5) {
      resampled.push(stroke[stroke.length - 1]);
    }

    return resampled;
  },

  /**
   * Simplify stroke using Ramer-Douglas-Peucker algorithm
   * @param {Array} points - Array of points {x, y}
   * @param {number} epsilon - Simplification tolerance in pixels
   * @returns {Array} Simplified stroke
   */
  simplifyRDP: function(points, epsilon) {
    if (points.length < 3) return points;

    let maxDist = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const d = this.pointToSegmentDist(points[i], first, last);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.simplifyRDP(points.slice(0, maxIndex + 1), epsilon);
      const right = this.simplifyRDP(points.slice(maxIndex), epsilon);
      return left.slice(0, -1).concat(right);
    } else {
      return [first, last];
    }
  },

  /**
   * Calculate distance from point to finite line segment
   * @param {Object} pt - Point {x, y}
   * @param {Object} p1 - Segment start {x, y}
   * @param {Object} p2 - Segment end {x, y}
   * @returns {number} Distance in pixels
   */
  pointToSegmentDist: function(pt, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return BallotGeometry.dist(pt, p1);

    let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const proj = { x: p1.x + t * dx, y: p1.y + t * dy };
    return BallotGeometry.dist(pt, proj);
  }
};
