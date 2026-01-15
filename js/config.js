/**
 * Configuration Constants
 * Central configuration for all thresholds and parameters
 */

window.BallotConfig = {
  // Canvas dimensions (logical pixels)
  LOGICAL_WIDTH: 500,
  LOGICAL_HEIGHT: 400,

  // Vote box geometry (logical pixels)
  VOTE_BOX: {
    x: 90,
    y: 85,
    width: 320,
    height: 220
  },

  // Drawing & preprocessing
  STROKE_WIDTH_PX: 8,
  BOX_TOLERANCE_PX: 3,
  RESAMPLE_STEP_PX: 3,
  SIMPLIFY_EPSILON_PX: 3,
  MIN_TOTAL_INK_LENGTH_PX: 30,  // Lowered for blank detection (dot filter)
  MAX_POINTS_TOTAL: 1200,

  // Intersection detection
  ENDPOINT_EPS_PX: 6,
  MIN_CROSSING_ANGLE_DEG: 15,

  // 4-arm extension analysis
  MIN_ARM_EXTENSION_PX: 18,
  ARM_CORRIDOR_ANGLE_TOL_DEG: 25,
  ARM_CORRIDOR_DIST_PX: 12,

  // Global topology (star rejection)
  TOPOLOGY_ANALYSIS_RADIUS_PX: 60,
  MAX_BRANCHES: 2,  // Proper X/+ cross has exactly 2 angular directions
  BRANCH_ANGLE_CLUSTER_TOL_DEG: 30,

  // Multi-mark detection (scale-adaptive)
  CROSS_CLUSTER_EPS_PX: 26,  // Initial clustering radius for intersection points
  RETRACE_TOLERANCE_RATIO: 0.12,  // Max 12% of arm length = retracing (tremor/dry pen)
  INTENTIONAL_MIN_RATIO: 0.20,  // Min 20% of arm length = intentional invalidation
  MULTI_MARK_MIN_RATIO: 1.0,  // Min 100% of arm length = distinct marks

  // Extra writing detection (stroke-count adaptive)
  MIN_EXPLAINED_INK_RATIO: 0.70,  // Default for multi-stroke (3+)
  MIN_EXPLAINED_INK_RATIO_SINGLE: 0.50,  // Lenient for 1-stroke with loops (50%)
  MIN_EXPLAINED_INK_RATIO_DOUBLE: 0.62,  // Moderate for 2-stroke

  // Arm balance (for branchCount = 3 validation)
  MIN_ARM_BALANCE_RATIO: 0.70,

  // UI timing
  EVALUATION_DEBOUNCE_MS: 450
};
