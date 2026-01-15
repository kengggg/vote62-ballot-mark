/**
 * Intersection Detection
 * Find intersection points between stroke segments
 */

window.BallotIntersection = {
  /**
   * Build line segments from strokes
   * @param {Array} strokes - Array of strokes (each stroke is array of points)
   * @returns {Array} Array of segments with metadata
   */
  buildSegments: function(strokes) {
    const segments = [];
    for (let si = 0; si < strokes.length; si++) {
      const stroke = strokes[si];
      const strokeStart = stroke[0];
      const strokeEnd = stroke[stroke.length - 1];

      for (let i = 0; i < stroke.length - 1; i++) {
        segments.push({
          p1: stroke[i],
          p2: stroke[i + 1],
          strokeIndex: si,
          segmentIndex: i,
          length: BallotGeometry.dist(stroke[i], stroke[i + 1]),
          strokeStart: strokeStart,  // Store actual stroke endpoints
          strokeEnd: strokeEnd
        });
      }
    }
    return segments;
  },

  /**
   * Find intersection between two line segments
   * @param {Object} seg1 - First segment {p1, p2, strokeStart, strokeEnd}
   * @param {Object} seg2 - Second segment {p1, p2, strokeStart, strokeEnd}
   * @returns {Object|null} Intersection {x, y, angle, seg1, seg2} or null
   */
  findSegmentIntersection: function(seg1, seg2) {
    const dx1 = seg1.p2.x - seg1.p1.x;
    const dy1 = seg1.p2.y - seg1.p1.y;
    const dx2 = seg2.p2.x - seg2.p1.x;
    const dy2 = seg2.p2.y - seg2.p1.y;

    const det = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(det) < 1e-10) return null;

    const t = ((seg2.p1.x - seg1.p1.x) * dy2 - (seg2.p1.y - seg1.p1.y) * dx2) / det;
    const u = ((seg2.p1.x - seg1.p1.x) * dy1 - (seg2.p1.y - seg1.p1.y) * dx1) / det;

    if (t < 0 || t > 1 || u < 0 || u > 1) return null;

    const ix = seg1.p1.x + t * dx1;
    const iy = seg1.p1.y + t * dy1;

    // Exclude endpoint touches - but only check ACTUAL stroke endpoints, not RDP intermediate points
    const nearStrokeEndpoint = (pt) => {
      return BallotGeometry.dist(pt, seg1.strokeStart) < BallotConfig.ENDPOINT_EPS_PX ||
             BallotGeometry.dist(pt, seg1.strokeEnd) < BallotConfig.ENDPOINT_EPS_PX ||
             BallotGeometry.dist(pt, seg2.strokeStart) < BallotConfig.ENDPOINT_EPS_PX ||
             BallotGeometry.dist(pt, seg2.strokeEnd) < BallotConfig.ENDPOINT_EPS_PX;
    };
    if (nearStrokeEndpoint({x: ix, y: iy})) return null;

    // Calculate crossing angle
    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);
    let crossAngle = Math.abs(angle1 - angle2) * 180 / Math.PI;
    if (crossAngle > 90) crossAngle = 180 - crossAngle;

    if (crossAngle < BallotConfig.MIN_CROSSING_ANGLE_DEG) return null;

    // Return WITH segment references
    return {
      x: ix,
      y: iy,
      angle: crossAngle,
      seg1: seg1,
      seg2: seg2
    };
  },

  /**
   * Find all intersections between segments (within vote box)
   * @param {Array} segments - Array of segments from buildSegments()
   * @returns {Array} Array of intersections
   */
  findAllIntersections: function(segments) {
    const intersections = [];

    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const seg1 = segments[i];
        const seg2 = segments[j];

        // Different strokes, or same stroke but non-adjacent
        if (seg1.strokeIndex !== seg2.strokeIndex ||
            Math.abs(seg1.segmentIndex - seg2.segmentIndex) > 1) {

          const inter = this.findSegmentIntersection(seg1, seg2);
          if (inter && BallotGeometry.pointInRect(inter, BallotConfig.VOTE_BOX)) {
            intersections.push(inter);
          }
        }
      }
    }

    return intersections;
  }
};
