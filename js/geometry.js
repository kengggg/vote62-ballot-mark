/**
 * Geometry Utilities
 * Pure geometry functions with no side effects
 */

window.BallotGeometry = {
  /**
   * Calculate Euclidean distance between two points
   * @param {Object} p1 - First point {x, y}
   * @param {Object} p2 - Second point {x, y}
   * @returns {number} Distance in pixels
   */
  dist: function(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /**
   * Calculate total length of a stroke (polyline)
   * @param {Array} stroke - Array of points {x, y}
   * @returns {number} Total length in pixels
   */
  strokeLength: function(stroke) {
    let len = 0;
    for (let i = 1; i < stroke.length; i++) {
      len += this.dist(stroke[i - 1], stroke[i]);
    }
    return len;
  },

  /**
   * Check if point is inside rectangle with optional tolerance
   * @param {Object} pt - Point {x, y}
   * @param {Object} rect - Rectangle {x, y, width, height}
   * @param {number} tolerance - Boundary tolerance in pixels (default: 0)
   * @returns {boolean} True if point is inside rectangle
   */
  pointInRect: function(pt, rect, tolerance = 0) {
    return pt.x >= rect.x - tolerance &&
           pt.x <= rect.x + rect.width + tolerance &&
           pt.y >= rect.y - tolerance &&
           pt.y <= rect.y + rect.height + tolerance;
  },

  /**
   * Calculate midpoint of a line segment
   * @param {Object} seg - Segment {p1: {x, y}, p2: {x, y}}
   * @returns {Object} Midpoint {x, y}
   */
  segmentMidpoint: function(seg) {
    return {
      x: (seg.p1.x + seg.p2.x) / 2,
      y: (seg.p1.y + seg.p2.y) / 2
    };
  },

  /**
   * Calculate perpendicular distance from point to infinite line
   * @param {Object} point - Point {x, y}
   * @param {Object} linePoint - Point on line {x, y}
   * @param {number} lineAngleDeg - Line angle in degrees
   * @returns {number} Perpendicular distance in pixels
   */
  pointToLineDistance: function(point, linePoint, lineAngleDeg) {
    const rad = lineAngleDeg * Math.PI / 180;
    const dx = point.x - linePoint.x;
    const dy = point.y - linePoint.y;
    const vx = Math.cos(rad);
    const vy = Math.sin(rad);
    return Math.abs(dx * vy - dy * vx);
  }
};
