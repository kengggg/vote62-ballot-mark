/**
 * 4-Arm Extension Measurement
 * Measure how far ink extends in 4 directions from intersection point
 */

window.BallotArmExtension = {
  /**
   * Measure 4-arm extension from intersection point
   * @param {Object} P - Intersection point {x, y}
   * @param {Object} seg1 - First intersecting segment
   * @param {Object} seg2 - Second intersecting segment
   * @param {Array} allStrokes - All strokes (array of point arrays)
   * @returns {Object} {valid, extensions, minExtension, armAngles}
   */
  measure4ArmExtension: function(P, seg1, seg2, allStrokes) {
    // Determine the two primary directions
    const dir1 = Math.atan2(seg1.p2.y - seg1.p1.y, seg1.p2.x - seg1.p1.x);
    const dir2 = Math.atan2(seg2.p2.y - seg2.p1.y, seg2.p2.x - seg2.p1.x);

    // Normalize to [0, 180)
    const angle1 = ((dir1 * 180 / Math.PI) % 180 + 180) % 180;
    const angle2 = ((dir2 * 180 / Math.PI) % 180 + 180) % 180;

    // Define 4 arm directions
    const armAngles = [
      angle1,
      (angle1 + 180) % 360,
      angle2,
      (angle2 + 180) % 360
    ];

    // Measure extension along each arm
    const extensions = {};
    const armLabels = ['seg1+', 'seg1-', 'seg2+', 'seg2-'];

    armAngles.forEach((angle, idx) => {
      const extension = this.findInkInCorridor(P, angle, allStrokes);
      extensions[armLabels[idx]] = extension;
    });

    // Check if all 4 arms meet minimum
    const minExtension = Math.min(...Object.values(extensions));
    const valid = minExtension >= BallotConfig.MIN_ARM_EXTENSION_PX;

    return {
      valid: valid,
      extensions: extensions,
      minExtension: minExtension,
      armAngles: armAngles
    };
  },

  /**
   * Find maximum ink extension along a direction corridor
   * @param {Object} P - Starting point {x, y}
   * @param {number} direction - Direction angle in degrees
   * @param {Array} allStrokes - All strokes (array of point arrays)
   * @returns {number} Maximum distance in pixels
   */
  findInkInCorridor: function(P, direction, allStrokes) {
    const dirRad = direction * Math.PI / 180;
    const dirVec = { x: Math.cos(dirRad), y: Math.sin(dirRad) };

    let maxDist = 0;

    for (const stroke of allStrokes) {
      for (let i = 0; i < stroke.length - 1; i++) {
        const seg = { p1: stroke[i], p2: stroke[i + 1] };

        // Check alignment - segment should be aligned with the line (either direction)
        const segAngle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x);
        const segDir = ((segAngle * 180 / Math.PI) % 360 + 360) % 360;

        // Check alignment with both forward and backward directions of the line
        const angleDiff1 = Math.min(
          Math.abs(segDir - direction),
          360 - Math.abs(segDir - direction)
        );
        const angleDiff2 = Math.min(
          Math.abs(segDir - ((direction + 180) % 360)),
          360 - Math.abs(segDir - ((direction + 180) % 360))
        );
        const angleDiff = Math.min(angleDiff1, angleDiff2);

        if (angleDiff > BallotConfig.ARM_CORRIDOR_ANGLE_TOL_DEG) continue;

        // Check perpendicular distance from segment to the ray
        const mid = BallotGeometry.segmentMidpoint(seg);
        const perpDist = BallotGeometry.pointToLineDistance(mid, P, direction);
        if (perpDist > BallotConfig.ARM_CORRIDOR_DIST_PX) continue;

        // Check both endpoints to see if either is ahead of P in the desired direction
        // This handles segments that pass through P correctly
        const vecToP1 = { x: seg.p1.x - P.x, y: seg.p1.y - P.y };
        const vecToP2 = { x: seg.p2.x - P.x, y: seg.p2.y - P.y };

        const dot1 = vecToP1.x * dirVec.x + vecToP1.y * dirVec.y;
        const dot2 = vecToP2.x * dirVec.x + vecToP2.y * dirVec.y;

        // If either endpoint is ahead, measure the farthest one
        if (dot1 > 0 || dot2 > 0) {
          const dist1 = dot1 > 0 ? BallotGeometry.dist(P, seg.p1) : 0;
          const dist2 = dot2 > 0 ? BallotGeometry.dist(P, seg.p2) : 0;
          maxDist = Math.max(maxDist, dist1, dist2);
        }
      }
    }

    return maxDist;
  }
};
