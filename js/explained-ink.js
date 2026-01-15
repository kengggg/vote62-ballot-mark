/**
 * Explained Ink Ratio Calculation
 * Calculate what percentage of ink aligns with cross axes
 */

window.BallotExplainedInk = {
  /**
   * Calculate explained ink ratio for extra writing detection
   * @param {Object} bestCandidate - Best cross candidate {point, armAngles}
   * @param {Array} processedStrokes - Processed strokes (not used, kept for compatibility)
   * @param {Array} segments - All segments from buildSegments()
   * @returns {number} Ratio [0, 1] of explained ink
   */
  calculateExplainedInkRatio: function(bestCandidate, processedStrokes, segments) {
    const P = bestCandidate.point;
    const dirA = bestCandidate.armAngles[0] % 180;
    const dirB = bestCandidate.armAngles[2] % 180;

    let totalLength = 0;
    let explainedLength = 0;

    for (const seg of segments) {
      const mid = BallotGeometry.segmentMidpoint(seg);
      const segLen = seg.length;
      totalLength += segLen;

      // Calculate segment angle
      const segAngle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x);
      const segDir = ((segAngle * 180 / Math.PI) % 180 + 180) % 180;

      // Check alignment with dirA
      const angleDiffA = Math.min(
        Math.abs(segDir - dirA),
        180 - Math.abs(segDir - dirA)
      );
      const perpDistA = BallotGeometry.pointToLineDistance(mid, P, dirA);

      // Check alignment with dirB
      const angleDiffB = Math.min(
        Math.abs(segDir - dirB),
        180 - Math.abs(segDir - dirB)
      );
      const perpDistB = BallotGeometry.pointToLineDistance(mid, P, dirB);

      // Segment is explained if aligned with either direction
      const explainedByA = (angleDiffA <= BallotConfig.ARM_CORRIDOR_ANGLE_TOL_DEG &&
                           perpDistA <= BallotConfig.ARM_CORRIDOR_DIST_PX);
      const explainedByB = (angleDiffB <= BallotConfig.ARM_CORRIDOR_ANGLE_TOL_DEG &&
                           perpDistB <= BallotConfig.ARM_CORRIDOR_DIST_PX);

      if (explainedByA || explainedByB) {
        explainedLength += segLen;
      }
    }

    return totalLength > 0 ? explainedLength / totalLength : 0;
  }
};
