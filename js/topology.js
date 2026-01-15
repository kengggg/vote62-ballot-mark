/**
 * Global Topology Analysis
 * Branch counting, angle clustering, and intersection clustering
 */

window.BallotTopology = {
  /**
   * Count distinct angular directions around a point
   * @param {Object} P - Center point {x, y}
   * @param {Array} allStrokes - All strokes (array of point arrays)
   * @returns {number} Number of distinct branches
   */
  countGlobalBranches: function(P, allStrokes) {
    const nearbySegments = [];

    for (const stroke of allStrokes) {
      for (let i = 0; i < stroke.length - 1; i++) {
        const seg = { p1: stroke[i], p2: stroke[i + 1] };
        const mid = BallotGeometry.segmentMidpoint(seg);

        if (BallotGeometry.dist(mid, P) <= BallotConfig.TOPOLOGY_ANALYSIS_RADIUS_PX) {
          const angle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x);
          const normalized = ((angle * 180 / Math.PI) % 180 + 180) % 180;
          const length = BallotGeometry.dist(seg.p1, seg.p2);

          nearbySegments.push({ angle: normalized, weight: length });
        }
      }
    }

    if (nearbySegments.length === 0) return 0;

    const branches = this.clusterAngles(nearbySegments, BallotConfig.BRANCH_ANGLE_CLUSTER_TOL_DEG);
    return branches.length;
  },

  /**
   * Cluster angles by tolerance with wrap-around handling
   * @param {Array} angleData - Array of {angle, weight} objects
   * @param {number} tolerance - Clustering tolerance in degrees
   * @returns {Array} Array of clustered modes {angle, weight}
   */
  clusterAngles: function(angleData, tolerance) {
    if (angleData.length === 0) return [];

    angleData.sort((a, b) => a.angle - b.angle);

    const modes = [];
    let currentMode = { angle: angleData[0].angle, weight: angleData[0].weight };

    for (let i = 1; i < angleData.length; i++) {
      const diff = Math.min(
        Math.abs(angleData[i].angle - currentMode.angle),
        180 - Math.abs(angleData[i].angle - currentMode.angle)
      );

      if (diff <= tolerance) {
        const totalWeight = currentMode.weight + angleData[i].weight;
        currentMode.angle = (currentMode.angle * currentMode.weight +
                            angleData[i].angle * angleData[i].weight) / totalWeight;
        currentMode.weight = totalWeight;
      } else {
        modes.push(currentMode);
        currentMode = { angle: angleData[i].angle, weight: angleData[i].weight };
      }
    }
    modes.push(currentMode);

    // Check wrap-around
    if (modes.length > 1) {
      const wrapDiff = Math.abs(modes[0].angle - (modes[modes.length - 1].angle - 180));
      if (wrapDiff <= tolerance) {
        const totalWeight = modes[0].weight + modes[modes.length - 1].weight;
        modes[0].angle = (modes[0].angle * modes[0].weight +
                         (modes[modes.length - 1].angle - 180) * modes[modes.length - 1].weight) / totalWeight;
        modes[0].weight = totalWeight;
        modes.pop();
      }
    }

    return modes.sort((a, b) => b.weight - a.weight);
  },

  /**
   * Cluster intersections spatially (DBSCAN-like greedy clustering)
   * @param {Array} intersections - Array of intersection points {x, y}
   * @param {number} epsilon - Clustering radius in pixels
   * @returns {Array} Array of clusters {points, indices, centroid, count}
   */
  clusterIntersections: function(intersections, epsilon) {
    if (intersections.length === 0) return [];

    const clusters = [];
    const visited = new Array(intersections.length).fill(false);

    for (let i = 0; i < intersections.length; i++) {
      if (visited[i]) continue;

      const cluster = {
        points: [intersections[i]],
        indices: [i]
      };
      visited[i] = true;

      // Greedy expansion
      for (let j = i + 1; j < intersections.length; j++) {
        if (visited[j]) continue;

        // Check if j is within epsilon of any point in cluster
        let isNear = false;
        for (const pt of cluster.points) {
          if (BallotGeometry.dist(pt, intersections[j]) <= epsilon) {
            isNear = true;
            break;
          }
        }

        if (isNear) {
          cluster.points.push(intersections[j]);
          cluster.indices.push(j);
          visited[j] = true;
        }
      }

      // Compute centroid
      let cx = 0, cy = 0;
      for (const pt of cluster.points) {
        cx += pt.x;
        cy += pt.y;
      }
      cluster.centroid = {
        x: cx / cluster.points.length,
        y: cy / cluster.points.length
      };
      cluster.count = cluster.points.length;

      clusters.push(cluster);
    }

    return clusters;
  }
};
