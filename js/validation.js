/**
 * Main Validation Engine
 * Core validation algorithm implementing 7-category precedence system
 */

window.BallotValidation = {
  /**
   * Validate a ballot mark
   * @param {Array} strokes - Array of strokes (each stroke is array of points {x, y})
   * @param {Object} options - Options {debug: boolean}
   * @returns {Object} Validation result {valid, label, invalid_type, reason, debug}
   */
  validateMark: function(strokes, options = { debug: false }) {
    const debugData = {
      allIntersections: [],
      bestCandidate: null,
      clusters: [],
      info: ''
    };

    // (0) WAITING - Check if empty
    if (strokes.length === 0) {
      return {
        valid: null,
        label: 'รอการทำเครื่องหมาย',
        invalid_type: null,
        reason: '',
        debug: {}
      };
    }

    // Preprocess strokes
    let totalInkLength = 0;
    const processedStrokes = [];

    for (const stroke of strokes) {
      totalInkLength += BallotGeometry.strokeLength(stroke);
      let processed = BallotPreprocessing.resampleStroke(stroke, BallotConfig.RESAMPLE_STEP_PX);
      processed = BallotPreprocessing.simplifyRDP(processed, BallotConfig.SIMPLIFY_EPSILON_PX);
      processedStrokes.push(processed);
    }

    // (1) BLANK - Check for insufficient ink (dot filter)
    if (totalInkLength < BallotConfig.MIN_TOTAL_INK_LENGTH_PX) {
      return {
        valid: false,
        label: 'บัตรเสีย',
        invalid_type: 'blank',
        reason: 'ไม่มีเครื่องหมาย',
        debug: { totalInkLength }
      };
    }

    // Check max points (anti-scribble)
    let totalPoints = processedStrokes.reduce((sum, s) => sum + s.length, 0);
    if (totalPoints > BallotConfig.MAX_POINTS_TOTAL) {
      return {
        valid: false,
        label: 'บัตรเสีย',
        invalid_type: 'wrong_symbol',
        reason: 'ทำเครื่องหมายแบบอื่น',
        debug: { totalPoints }
      };
    }

    // (2) OUTSIDE_BOX - Check if any ink goes outside
    for (const stroke of processedStrokes) {
      for (let i = 0; i < stroke.length - 1; i++) {
        const p1 = stroke[i];
        const p2 = stroke[i + 1];
        const d = BallotGeometry.dist(p1, p2);
        const steps = Math.ceil(d / BallotConfig.RESAMPLE_STEP_PX);

        for (let j = 0; j <= steps; j++) {
          const t = j / steps;
          const pt = {
            x: p1.x + t * (p2.x - p1.x),
            y: p1.y + t * (p2.y - p1.y)
          };

          if (!BallotGeometry.pointInRect(pt, BallotConfig.VOTE_BOX, BallotConfig.BOX_TOLERANCE_PX)) {
            return {
              valid: false,
              label: 'บัตรเสีย',
              invalid_type: 'outside_box',
              reason: 'ล้ำออกนอกกรอบ',
              debug: { outsidePoint: pt }
            };
          }
        }
      }
    }

    // Build segments and find intersections
    const segments = BallotIntersection.buildSegments(processedStrokes);
    const intersections = BallotIntersection.findAllIntersections(segments);

    debugData.allIntersections = intersections;

    // (4) NO_CROSS - Check if no intersections found
    if (intersections.length === 0) {
      return {
        valid: false,
        label: 'บัตรเสีย',
        invalid_type: 'no_cross',
        reason: 'ไม่มีจุดตัดแบบกากบาท',
        debug: { intersections: 0 }
      };
    }

    // Cluster intersections for multi-mark detection
    const clusters = BallotTopology.clusterIntersections(intersections, BallotConfig.CROSS_CLUSTER_EPS_PX);
    debugData.clusters = clusters;

    // Analyze each cluster to determine if it's a valid cross center
    for (const cluster of clusters) {
      let hasValidCross = false;

      for (const inter of cluster.points) {
        const result = BallotArmExtension.measure4ArmExtension(
          { x: inter.x, y: inter.y },
          inter.seg1,
          inter.seg2,
          processedStrokes
        );

        if (result.valid) {
          hasValidCross = true;
          break;
        }
      }

      cluster.isCrossValid = hasValidCross;

      // NEW: Count unique strokes across all intersections in this cluster
      const uniqueStrokesInCluster = new Set();
      for (const inter of cluster.points) {
        if (inter.seg1 && inter.seg1.strokeIndex !== undefined) {
          uniqueStrokesInCluster.add(inter.seg1.strokeIndex);
        }
        if (inter.seg2 && inter.seg2.strokeIndex !== undefined) {
          uniqueStrokesInCluster.add(inter.seg2.strokeIndex);
        }
      }
      cluster.strokesAtCluster = uniqueStrokesInCluster.size;
    }

    // Count cross-valid clusters that are far apart
    const validClusters = clusters.filter(c => c.isCrossValid);

    // Calculate adaptive scale reference based on average arm length of valid crosses
    let scaleReference = 60;  // Default fallback (typical arm length)

    if (validClusters.length > 0) {
      // Collect all valid cross candidates to calculate scale
      const validCrossArmLengths = [];

      for (const cluster of validClusters) {
        for (const inter of cluster.points) {
          const result = BallotArmExtension.measure4ArmExtension(
            { x: inter.x, y: inter.y },
            inter.seg1,
            inter.seg2,
            processedStrokes
          );

          if (result.valid) {
            // Average of all 4 arm extensions for this cross
            const avgArmLength = Object.values(result.extensions)
              .reduce((sum, len) => sum + len, 0) / 4;
            validCrossArmLengths.push(avgArmLength);
          }
        }
      }

      if (validCrossArmLengths.length > 0) {
        // Use median to be robust against outliers
        validCrossArmLengths.sort((a, b) => a - b);
        const mid = Math.floor(validCrossArmLengths.length / 2);
        scaleReference = validCrossArmLengths.length % 2 === 0
          ? (validCrossArmLengths[mid - 1] + validCrossArmLengths[mid]) / 2
          : validCrossArmLengths[mid];
      }
    }

    // (3) MULTI_MARK / INTENTIONAL INVALIDATION - Scale-adaptive cluster separation check
    if (validClusters.length >= 2) {
      // Calculate adaptive thresholds based on cross scale
      const retraceThreshold = scaleReference * BallotConfig.RETRACE_TOLERANCE_RATIO;
      const intentionalThreshold = scaleReference * BallotConfig.INTENTIONAL_MIN_RATIO;
      const multiMarkThreshold = scaleReference * BallotConfig.MULTI_MARK_MIN_RATIO;

      let hasIntentionalInvalidation = false;
      let hasMultiMark = false;

      for (let i = 0; i < validClusters.length; i++) {
        for (let j = i + 1; j < validClusters.length; j++) {
          const d = BallotGeometry.dist(validClusters[i].centroid, validClusters[j].centroid);

          if (d >= multiMarkThreshold) {
            hasMultiMark = true;
            break;
          } else if (d >= intentionalThreshold) {
            hasIntentionalInvalidation = true;
            // Don't break - keep checking for multi-mark (higher priority)
          }
          // else: d < intentionalThreshold means retracing (valid, continue)
        }
        if (hasMultiMark) break;
      }

      // Multi-mark takes precedence (more severe violation)
      if (hasMultiMark) {
        return {
          valid: false,
          label: 'บัตรเสีย',
          invalid_type: 'multi_mark',
          reason: 'ทำเครื่องหมายมากกว่า 1 จุด',
          debug: {
            validClusters: validClusters.length,
            scaleReference: scaleReference.toFixed(1),
            threshold: multiMarkThreshold.toFixed(1)
          }
        };
      }

      // Intentional invalidation (medium distance relative to cross size)
      if (hasIntentionalInvalidation) {
        return {
          valid: false,
          label: 'บัตรเสีย',
          invalid_type: 'wrong_symbol',
          reason: 'ทำเครื่องหมายเพิ่มเติมเพื่อให้บัตรเสีย',
          debug: {
            validClusters: validClusters.length,
            scaleReference: scaleReference.toFixed(1),
            threshold: intentionalThreshold.toFixed(1)
          }
        };
      }

      // All clusters very close (< intentionalThreshold) - treat as single cross from retracing
      // Continue to next validation steps...
    }

    // Find all cross candidates across all intersections
    const crossCandidates = [];

    for (const inter of intersections) {
      const result = BallotArmExtension.measure4ArmExtension(
        { x: inter.x, y: inter.y },
        inter.seg1,
        inter.seg2,
        processedStrokes
      );

      if (result.valid) {
        // NEW: Find which cluster this intersection belongs to
        let strokesAtCluster = 2;  // Default: just the 2 strokes at this intersection
        for (const cluster of clusters) {
          if (cluster.points.includes(inter)) {
            strokesAtCluster = cluster.strokesAtCluster;
            break;
          }
        }

        crossCandidates.push({
          point: { x: inter.x, y: inter.y },
          minExtension: result.minExtension,
          extensions: Object.values(result.extensions),
          armAngles: result.armAngles,
          strokesAtIntersection: strokesAtCluster  // NEW: Use cluster stroke count
        });
      }
    }

    // (5) WRONG_SYMBOL - Part A: No valid cross candidates
    if (crossCandidates.length === 0) {
      return {
        valid: false,
        label: 'บัตรเสีย',
        invalid_type: 'wrong_symbol',
        reason: 'ทำเครื่องหมายแบบอื่น',
        debug: { crossCandidates: 0 }
      };
    }

    // Find best candidate (highest minExtension)
    const bestCandidate = crossCandidates.reduce((best, curr) =>
      curr.minExtension > best.minExtension ? curr : best
    );

    debugData.bestCandidate = bestCandidate;

    // (5) WRONG_SYMBOL - Part B: Global topology check (star rejection)
    const branchCount = BallotTopology.countGlobalBranches(bestCandidate.point, processedStrokes);

    debugData.info = `Intersections: ${intersections.length}\n` +
                     `Clusters: ${clusters.length} (${validClusters.length} valid)\n` +
                     `Cross candidates: ${crossCandidates.length}\n` +
                     `Best min arm: ${bestCandidate.minExtension.toFixed(1)}px\n` +
                     `Strokes at center: ${bestCandidate.strokesAtIntersection}\n` +
                     `Global branches: ${branchCount}`;

    // Check for minimum angular diversity
    if (branchCount < 2) {
      return {
        valid: false,
        label: 'บัตรเสีย',
        invalid_type: 'wrong_symbol',
        reason: 'ไม่มีรูปร่างกากบาท',
        debug: { branchCount }
      };
    }

    // NEW: Enhanced branch count check with stroke-count and balance validation
    if (branchCount > 2) {
      // Special case: branchCount = 3 could be natural loop OR star
      if (branchCount === 3) {
        // TIER 1: Check stroke count first (natural loop detection)
        if (strokes.length <= 2) {
          // 1-2 strokes with 3 branches → Natural loop at intersection → ALLOW
          // This is a valid drawing style where the loop creates extra angular directions
          // Will be further validated by explained ink ratio (55% for 1 stroke, 62% for 2 strokes)
          debugData.info += `\nStroke count: ${strokes.length} (natural loop allowed)`;
        } else {
          // TIER 2: 3+ strokes with 3 branches → Check arm balance
          // Could be intentional star OR cross with separate emphasis mark
          const minArm = bestCandidate.minExtension;
          const maxArm = Math.max(...bestCandidate.extensions);
          const armBalanceRatio = minArm / maxArm;

          debugData.info += `\nStroke count: ${strokes.length}, Arm balance: ${(armBalanceRatio * 100).toFixed(1)}%`;

          // If arms are well-balanced (ratio >= 0.70), it's a strong cross with emphasis
          if (armBalanceRatio < 0.70) {
            // Imbalanced arms with 3+ strokes → likely intentional star
            return {
              valid: false,
              label: 'บัตรเสีย',
              invalid_type: 'wrong_symbol',
              reason: 'ทำเครื่องหมายแบบอื่น',
              debug: {
                branchCount,
                strokeCount: strokes.length,
                armBalanceRatio,
                reason: 'imbalanced_arms'
              }
            };
          }
          // else: balanced arms with 3+ strokes → continue to ink ratio check
        }
      } else {
        // branchCount >= 4: Too many branches, definitely not a simple cross
        return {
          valid: false,
          label: 'บัตรเสีย',
          invalid_type: 'wrong_symbol',
          reason: 'ทำเครื่องหมายแบบอื่น',
          debug: { branchCount }
        };
      }
    }

    // (6) EXTRA_WRITING - Adaptive explained ink ratio check based on stroke count
    // Calculate adaptive threshold
    let explainedInkThreshold = BallotConfig.MIN_EXPLAINED_INK_RATIO;  // Default: 70% for 3+ strokes

    if (strokes.length === 1) {
      // Single stroke: lenient (allows natural loops/curves)
      explainedInkThreshold = BallotConfig.MIN_EXPLAINED_INK_RATIO_SINGLE;  // 50%
    } else if (strokes.length === 2) {
      // Two strokes: moderate (standard crosses)
      explainedInkThreshold = BallotConfig.MIN_EXPLAINED_INK_RATIO_DOUBLE;  // 62%
    }
    // else: 3+ strokes use default 70% (strict - catches extra writing)

    const explainedRatio = BallotExplainedInk.calculateExplainedInkRatio(bestCandidate, processedStrokes, segments);

    debugData.info += `\nExplained ratio: ${(explainedRatio * 100).toFixed(1)}%`;

    if (explainedRatio < explainedInkThreshold) {
      return {
        valid: false,
        label: 'บัตรเสีย',
        invalid_type: 'extra_writing',
        reason: 'มีสัญลักษณ์หรือข้อความเพิ่มเติม',
        debug: {
          explainedRatio,
          threshold: explainedInkThreshold,
          strokeCount: strokes.length
        }
      };
    }

    // (7) VALID - All checks passed
    return {
      valid: true,
      label: 'บัตรดี',
      invalid_type: null,
      reason: '',
      debug: options.debug ? debugData : {
        intersections: intersections.length,
        crossCandidates: crossCandidates.length,
        minExtension: bestCandidate.minExtension,
        branchCount,
        explainedRatio
      }
    };
  }
};
