# Thai Ballot Validator - Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Validation Flow](#validation-flow)
4. [Core Algorithms](#core-algorithms)
5. [Configuration Parameters](#configuration-parameters)
6. [Recent Improvements](#recent-improvements)
7. [Edge Cases and Special Handling](#edge-cases-and-special-handling)
8. [Testing Guide](#testing-guide)

---

## Overview

### Purpose
This application validates Thai ballot marks according to Election Commission of Thailand rules. It determines whether a voter's mark (typically an X or + cross) constitutes a valid vote or should be considered invalid (spoiled ballot).

### Valid vs Invalid Marks

**Valid Marks:**
- Standard X cross (two diagonal strokes)
- Standard + cross (horizontal and vertical strokes)
- Single-stroke crosses with natural loops at intersection
- Crosses with minor variations due to natural drawing motion
- Crosses with emphasis marks (circles/ovals) if the core cross is clear

**Invalid Marks:**
- No mark (blank)
- Mark outside the voting box
- No clear cross structure (no intersection)
- Multiple separate crosses (multi-mark)
- Intentional invalidation (widely separated intersections)
- Star patterns (3+ strokes meeting at center)
- Too many branches (4+ angular directions)
- Extra writing/symbols beyond the cross

### 7-Category Precedence System

The validator uses a strict precedence order to classify ballots:

1. **BLANK** - No ink or insufficient ink
2. **OUTSIDE_BOX** - Mark extends beyond ballot box boundaries
3. **NO_CROSS** - No valid intersection found
4. **MULTI_MARK** / **INTENTIONAL** - Multiple crosses or intentionally invalidated
5. **WRONG_SYMBOL** - Not a cross (star, parallel lines, etc.)
6. **EXTRA_WRITING** - Cross with excessive additional marks
7. **VALID** - Acceptable cross mark

---

## System Architecture

### Data Flow

```
Raw Strokes (drawing input)
    ↓
Preprocessing (simplification, segmentation)
    ↓
Intersection Detection (find crossing points)
    ↓
Clustering (group nearby intersections)
    ↓
4-Arm Extension Analysis (measure cross arms)
    ↓
Topology Analysis (branch counting, stroke counting)
    ↓
Validation Checks (7-category system)
    ↓
Result (Valid or Invalid with specific reason)
```

### Key Data Structures

#### Stroke
```javascript
{
  points: [{x, y}, ...],  // Raw points from drawing
  length: number          // Number of points
}
```

#### Segment
```javascript
{
  p1: {x, y},              // Start point
  p2: {x, y},              // End point
  strokeIndex: number,     // Which stroke this belongs to
  segmentIndex: number     // Position within stroke
}
```

#### Intersection
```javascript
{
  x: number,              // X coordinate
  y: number,              // Y coordinate
  seg1: Segment,          // First intersecting segment
  seg2: Segment,          // Second intersecting segment
  angle: number           // Angle between segments (degrees)
}
```

#### Cluster
```javascript
{
  points: [Intersection, ...],  // Intersections in this cluster
  center: {x, y},                // Cluster centroid
  isCrossValid: boolean,         // Has valid 4-arm structure
  strokesAtCluster: number       // Unique strokes in cluster
}
```

#### Cross Candidate
```javascript
{
  point: {x, y},                   // Intersection location
  minExtension: number,            // Shortest arm length
  extensions: {                    // All 4 arm lengths
    angle1: number,
    angle1_opposite: number,
    angle2: number,
    angle2_opposite: number
  },
  armAngles: [number, ...],        // The 4 arm directions
  strokesAtIntersection: number    // Unique strokes (from cluster)
}
```

---

## Validation Flow

### Detailed Step-by-Step Process

#### Phase 1: Preprocessing (Lines 910-980)

**1.1 Empty Check**
- Check if any strokes exist
- Return WAITING if empty (neutral state)

**1.2 Blank Check**
```javascript
if (totalInkLength < CONFIG.MIN_TOTAL_INK_PX) {
  return BLANK;  // 30px minimum
}
```

**1.3 Scribble Check**
```javascript
if (totalPoints > CONFIG.MAX_TOTAL_POINTS) {
  return BLANK;  // 1200 points maximum
}
```

**1.4 Stroke Simplification**
- Apply Ramer-Douglas-Peucker (RDP) algorithm
- Epsilon = 2.0 pixels
- Reduces noise while preserving shape

**1.5 Segment Creation**
- Convert simplified strokes into line segments
- Each segment connects consecutive points
- Segments track their source stroke

#### Phase 2: Boundary Validation (Lines 964-973)

**2.1 Outside Box Check**
```javascript
VOTE_BOX = {
  x1: 353, y1: 313,
  x2: 671, y2: 528
};
TOLERANCE = 3px;

// Check every segment
if (segment extends beyond box + tolerance) {
  return OUTSIDE_BOX;
}
```

#### Phase 3: Intersection Detection (Lines 974-1008)

**3.1 Find All Intersections**
- Test every segment pair (O(n²) but acceptable for small n)
- Skip same-stroke adjacent segments
- Use line-line intersection formula
- Keep only intersections inside ballot box

**3.2 No Cross Check**
```javascript
if (intersections.length === 0) {
  return NO_CROSS;
}
```

#### Phase 4: Clustering (Lines 1009-1046)

**4.1 Cluster Intersections**
```javascript
// Group intersections within 26px of each other
CROSS_CLUSTER_EPS_PX = 26;

// DBSCAN-like greedy clustering
clusters = clusterIntersections(intersections, 26);
```

**4.2 Count Strokes per Cluster**
```javascript
// NEW: Track unique strokes across all intersections in cluster
for each intersection in cluster:
  uniqueStrokes.add(seg1.strokeIndex);
  uniqueStrokes.add(seg2.strokeIndex);
cluster.strokesAtCluster = uniqueStrokes.size;
```

This is critical for detecting 3-line stars where 3 lines create 3 intersections at nearly the same point.

**4.3 Validate Cross Structure**
- For each cluster, check if ANY intersection has valid 4-arm structure
- Mark cluster as cross-valid or not

#### Phase 5: Multi-Mark Detection (Lines 1074-1141)

**5.1 Scale-Adaptive Intentional Invalidation**

Calculate scale reference from valid crosses:
```javascript
scaleReference = median(all arm lengths);  // Robust to outliers
```

Check cluster separation:
```javascript
intentionalThreshold = scaleReference * 1.60;  // 160% of cross size

if (multiple clusters farther than threshold apart) {
  return INTENTIONAL_INVALIDATION;
}
```

**Key Insight:** Using relative thresholds (160% of arm length) instead of absolute pixels makes the detection robust across different drawing sizes.

**Edge Cases:**
- Clusters within 20% of cross size: Treated as single cross (retracing)
- Clusters within 100% of cross size: Check explained ink ratio

#### Phase 6: Cross Candidate Selection (Lines 1143-1172)

**6.1 Build Candidates**
For each intersection with valid 4-arm structure:
```javascript
candidate = {
  point: {x, y},
  minExtension: min(4 arm lengths),
  extensions: all 4 arms,
  armAngles: [a1, a1+180, a2, a2+180],
  strokesAtIntersection: cluster.strokesAtCluster  // Use cluster count!
};
```

**6.2 No Valid Cross Check**
```javascript
if (crossCandidates.length === 0) {
  return WRONG_SYMBOL;  // Has intersection but no valid arms
}
```

**6.3 Select Best Candidate**
```javascript
bestCandidate = max(candidates, by: minExtension);
// Choose cross with strongest (longest) minimum arm
```

#### Phase 7: Topology Validation (Lines 1177-1244)

**7.1 Branch Counting**
```javascript
branchCount = countGlobalBranches(point, strokes);
// Returns number of distinct angular directions
```

**7.2 Multi-Line Star Detection** ⭐ NEW
```javascript
if (bestCandidate.strokesAtIntersection >= 3) {
  return WRONG_SYMBOL;  // 3+ strokes meeting at center
}
```

This catches intentional invalidation where voter adds third line through center, regardless of angular spacing.

**7.3 Minimum Branch Check**
```javascript
if (branchCount < 2) {
  return WRONG_SYMBOL;  // Parallel lines or single direction
}
```

**7.4 Maximum Branch Check with Stroke-Count Awareness** ⭐ ENHANCED
```javascript
if (branchCount > 2) {
  if (branchCount === 3) {
    // TIER 1: Natural loop detection
    if (strokes.length <= 2) {
      // 1-2 strokes with loop → ALLOW
      // Continue to explained ink ratio check
    } else {
      // TIER 2: 3+ strokes → Check arm balance
      armBalanceRatio = minArm / maxArm;
      if (armBalanceRatio < 0.70) {
        return WRONG_SYMBOL;  // Imbalanced star
      }
      // Balanced cross with emphasis → Continue
    }
  } else {
    // branchCount >= 4 → Too many branches
    return WRONG_SYMBOL;
  }
}
```

**7.5 Explained Ink Ratio Check** ⭐ ENHANCED (Adaptive Thresholds)
```javascript
// Adaptive thresholds based on stroke count
if (strokes.length === 1) {
  threshold = 0.55;  // Lenient for single stroke with loops
} else if (strokes.length === 2) {
  threshold = 0.62;  // Moderate for 2-stroke crosses
} else {
  threshold = 0.70;  // Strict for 3+ strokes
}

explainedRatio = calculateExplainedInkRatio(candidate, strokes);

if (explainedRatio < threshold) {
  return EXTRA_WRITING;
}
```

**7.6 Valid**
```javascript
return VALID;  // All checks passed!
```

---

## Core Algorithms

### 1. Intersection Detection

**Algorithm:** Line-Line Intersection using parametric equations

```javascript
function findSegmentIntersection(seg1, seg2) {
  // Parametric form: P = P1 + t*(P2-P1)
  const dx1 = seg1.p2.x - seg1.p1.x;
  const dy1 = seg1.p2.y - seg1.p1.y;
  const dx2 = seg2.p2.x - seg2.p1.x;
  const dy2 = seg2.p2.y - seg2.p1.y;

  // Determinant (cross product)
  const det = dx1 * dy2 - dy1 * dx2;

  // Parallel lines
  if (Math.abs(det) < 1e-10) return null;

  // Calculate intersection parameters
  const t = ((seg2.p1.x - seg1.p1.x) * dy2 -
             (seg2.p1.y - seg1.p1.y) * dx2) / det;
  const u = ((seg2.p1.x - seg1.p1.x) * dy1 -
             (seg2.p1.y - seg1.p1.y) * dx1) / det;

  // Check if intersection is within both segments
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  // Calculate intersection point
  const ix = seg1.p1.x + t * dx1;
  const iy = seg1.p1.y + t * dy1;

  // Calculate crossing angle
  const angle1 = Math.atan2(dy1, dx1);
  const angle2 = Math.atan2(dy2, dx2);
  const crossAngle = Math.abs(angle1 - angle2) * (180 / Math.PI);

  return {
    x: ix,
    y: iy,
    angle: Math.min(crossAngle, 180 - crossAngle),
    seg1: seg1,
    seg2: seg2
  };
}
```

**Key Features:**
- Uses determinant to check for parallel lines
- Returns null if lines don't intersect within segment bounds
- Calculates acute crossing angle (always ≤ 90°)
- Preserves segment references for stroke tracking

### 2. 4-Arm Extension Analysis

**Purpose:** Measure how far ink extends in all 4 directions from intersection

**Algorithm:**

```javascript
function measure4ArmExtension(P, seg1, seg2, allStrokes) {
  // 1. Extract two primary directions from intersecting segments
  const dir1 = Math.atan2(seg1.p2.y - seg1.p1.y,
                          seg1.p2.x - seg1.p1.x);
  const dir2 = Math.atan2(seg2.p2.y - seg2.p1.y,
                          seg2.p2.x - seg2.p1.x);

  // 2. Normalize to [0, 180) - direction is bidirectional
  const angle1 = normalizeAngle(dir1);
  const angle2 = normalizeAngle(dir2);

  // 3. Create 4 arm directions (opposite pairs)
  const armAngles = [
    angle1,
    (angle1 + 180) % 360,
    angle2,
    (angle2 + 180) % 360
  ];

  // 4. Measure extension along each arm
  const extensions = {};
  for (const angle of armAngles) {
    extensions[angle] = findInkInCorridor(P, angle, allStrokes);
  }

  // 5. Validate: all 4 arms must meet minimum threshold
  const minExtension = Math.min(...Object.values(extensions));
  const valid = minExtension >= CONFIG.MIN_ARM_EXTENSION_PX;  // 18px

  return {
    valid,
    minExtension,
    extensions
  };
}
```

**findInkInCorridor Algorithm:**

```javascript
function findInkInCorridor(P, direction, strokes) {
  const corridorHalfWidth = 12px;  // Perpendicular tolerance
  const angleTolerance = 25°;      // Angular alignment tolerance

  let maxDistance = 0;

  for each segment in strokes:
    // 1. Check angular alignment (bidirectional)
    segmentAngle = angle of segment;
    angleDiff = min(|direction - segmentAngle|,
                    |direction - segmentAngle - 180|);

    if (angleDiff > angleTolerance) continue;

    // 2. Check perpendicular distance from ray
    perpDist = distanceFromRay(segment, P, direction);
    if (perpDist > corridorHalfWidth) continue;

    // 3. Check directionality (dot product)
    // Must extend AWAY from P, not toward it
    toSegment = vector from P to segment;
    directionVector = unit vector at direction;

    if (dot(toSegment, directionVector) < 0) continue;

    // 4. Calculate distance along direction
    dist1 = dot(segment.p1 - P, directionVector);
    dist2 = dot(segment.p2 - P, directionVector);
    maxDistance = max(maxDistance, dist1, dist2);

  return maxDistance;
}
```

**Why This Works:**
- **Corridor approach**: Allows for slight curvature and wobble
- **Bidirectional alignment**: Segments can point forward or backward along arm
- **Directionality check**: Ensures ink extends away from center, not back toward it
- **12px perpendicular tolerance**: Forgiving of natural hand-drawing variation
- **25° angular tolerance**: Allows for arm curvature while rejecting unrelated ink

### 3. Branch Counting (Angular Clustering)

**Purpose:** Count how many distinct angular directions exist near intersection

**Algorithm:**

```javascript
function countGlobalBranches(P, strokes) {
  const radius = 60px;  // Analysis radius around intersection

  // 1. Collect all segments within radius
  const nearbySegments = [];
  for each segment in strokes:
    if (segmentNearPoint(segment, P, radius)) {
      nearbySegments.push(segment);
    }

  // 2. Extract direction and weight for each segment
  const angleData = [];
  for each segment:
    angle = atan2(dy, dx);
    angle = angle % 180;  // Normalize to [0, 180)
    weight = segmentLength;
    angleData.push({angle, weight});

  // 3. Cluster angles using 30° tolerance
  const modes = clusterAngles(angleData, tolerance=30°);

  return modes.length;
}

function clusterAngles(angleData, tolerance) {
  // Sort by angle
  angleData.sort(by: angle);

  const modes = [];
  let currentMode = null;

  for each angle:
    if (currentMode === null ||
        |angle - currentMode.angle| > tolerance) {
      // Start new cluster
      currentMode = {angle, weight};
      modes.push(currentMode);
    } else {
      // Merge into current cluster (weighted average)
      totalWeight = currentMode.weight + angle.weight;
      currentMode.angle = (currentMode.angle * currentMode.weight +
                          angle * angle.weight) / totalWeight;
      currentMode.weight = totalWeight;
    }

  // Handle wrap-around at 0°/180° boundary
  if (modes.length >= 2) {
    firstMode = modes[0];
    lastMode = modes[modes.length - 1];
    if (180 - lastMode.angle + firstMode.angle <= tolerance) {
      // Merge first and last modes
      mergedAngle = (lastMode.angle * lastMode.weight +
                    (firstMode.angle + 180) * firstMode.weight) /
                    (lastMode.weight + firstMode.weight);
      mergedAngle = mergedAngle % 180;

      lastMode.angle = mergedAngle;
      lastMode.weight += firstMode.weight;
      modes.shift();  // Remove first mode
    }
  }

  // Sort by weight (strongest modes first)
  modes.sort(by: weight, descending);

  return modes;
}
```

**Key Features:**
- **30° tolerance**: Two lines within 30° cluster into same branch
- **Weighted clustering**: Longer segments have more influence
- **Wrap-around handling**: 0° and 180° are the same direction
- **Greedy clustering**: Fast O(n log n) algorithm

**Examples:**

| Mark | Angles | Clusters | Branch Count |
|------|--------|----------|--------------|
| X cross | 45°, 135° | 2 clusters | 2 |
| + cross | 0°, 90° | 2 clusters | 2 |
| 3-line star | 30°, 60°, 90° | 2 clusters (30°+60°), 1 cluster (90°) | 2 |
| 5-line star | 0°, 36°, 72°, 108°, 144° | 3+ clusters | 3+ |

### 4. Explained Ink Ratio

**Purpose:** Measure what percentage of ink is explained by the 2-line cross model

**Algorithm:**

```javascript
function calculateExplainedInkRatio(candidate, strokes) {
  // 1. Extract the two primary cross directions
  const dirA = candidate.armAngles[0] % 180;
  const dirB = candidate.armAngles[2] % 180;

  let explainedLength = 0;
  let totalLength = 0;

  // 2. For each segment, check if it aligns with either direction
  for each segment in strokes:
    segmentAngle = atan2(dy, dx) % 180;
    segmentLength = sqrt(dx² + dy²);
    totalLength += segmentLength;

    // Check alignment with direction A
    angleDiffA = min(|dirA - segmentAngle|,
                     180 - |dirA - segmentAngle|);
    perpDistA = distanceFromLine(segment.midpoint,
                                  line through P at dirA);

    // Check alignment with direction B
    angleDiffB = min(|dirB - segmentAngle|,
                     180 - |dirB - segmentAngle|);
    perpDistB = distanceFromLine(segment.midpoint,
                                  line through P at dirB);

    // Segment is explained if it aligns with either direction
    const explainedByA = (angleDiffA <= 25° && perpDistA <= 12px);
    const explainedByB = (angleDiffB <= 25° && perpDistB <= 12px);

    if (explainedByA || explainedByB) {
      explainedLength += segmentLength;
    }
  }

  return explainedLength / totalLength;
}
```

**Thresholds (Stroke-Count Adaptive):**
- **1 stroke**: 55% threshold (lenient - allows loops and curves)
- **2 strokes**: 62% threshold (moderate - standard crosses)
- **3+ strokes**: 70% threshold (strict - catches extra writing)

**Examples:**

| Mark | Explained Ratio | Threshold | Result |
|------|----------------|-----------|--------|
| Clean X cross | 100% | 62% | Pass ✓ |
| X with natural loop | 62-70% | 55% (1 stroke) | Pass ✓ |
| X with thick circle | 55-65% | 70% (3+ strokes) | May fail |
| X with extra line | 40-50% | 70% | Fail ✗ |

### 5. Multi-Line Star Detection

**Purpose:** Detect when 3+ distinct strokes meet at the same center point

**Problem:** When 3 lines meet at nearly the same point, they create 3 intersections (line1×line2, line1×line3, line2×line3). These get clustered together, but each individual intersection only involves 2 strokes.

**Solution:** Count unique strokes across the entire cluster, not just at one intersection.

**Algorithm:**

```javascript
// Phase 1: Cluster Analysis (after clustering intersections)
for each cluster:
  uniqueStrokes = new Set();

  for each intersection in cluster.points:
    uniqueStrokes.add(intersection.seg1.strokeIndex);
    uniqueStrokes.add(intersection.seg2.strokeIndex);

  cluster.strokesAtCluster = uniqueStrokes.size;

// Phase 2: Cross Candidate Building
for each intersection:
  // Find which cluster this intersection belongs to
  for each cluster:
    if (cluster.points.includes(intersection)):
      strokesAtCluster = cluster.strokesAtCluster;
      break;

  candidate.strokesAtIntersection = strokesAtCluster;

// Phase 3: Validation
if (bestCandidate.strokesAtIntersection >= 3) {
  return WRONG_SYMBOL;  // 3+ strokes meeting at center
}
```

**Examples:**

| Scenario | Intersections | Strokes in Cluster | Result |
|----------|---------------|-------------------|--------|
| Normal X (2 strokes) | 1 | 2 | Valid ✓ |
| 3-line star (clustered angles) | 3 | 3 | Invalid ✗ |
| 3-line star (well-spaced) | 3 | 3 | Invalid ✗ |
| Single-stroke loop | 1 | 1 | Valid ✓ |

---

## Configuration Parameters

### Geometric Thresholds

```javascript
CONFIG = {
  // Stroke preprocessing
  RDP_EPSILON: 2.0,                    // Simplification tolerance (pixels)

  // Ink quantity
  MIN_TOTAL_INK_PX: 30,                // Minimum total ink (blank detection)
  MAX_TOTAL_POINTS: 1200,              // Maximum points (scribble detection)

  // Ballot box boundaries
  VOTE_BOX: {x1: 353, y1: 313, x2: 671, y2: 528},
  BOX_TOLERANCE_PX: 3,                 // Allowed overshoot

  // Intersection clustering
  CROSS_CLUSTER_EPS_PX: 26,            // Cluster radius for intersections

  // 4-arm extension
  MIN_ARM_EXTENSION_PX: 18,            // Minimum arm length
  ARM_ANGLE_TOLERANCE_DEG: 25,         // Angular alignment tolerance
  ARM_CORRIDOR_WIDTH_PX: 12,           // Perpendicular tolerance

  // Branch counting
  TOPOLOGY_ANALYSIS_RADIUS_PX: 60,     // Analysis radius around intersection
  BRANCH_ANGLE_CLUSTER_TOL_DEG: 30,    // Angular clustering tolerance
  MAX_BRANCHES: 2,                     // Maximum allowed branches

  // Multi-mark detection (scale-adaptive)
  INTENTIONAL_SEPARATION_RATIO: 1.60,  // 160% of cross size
  RETRACE_THRESHOLD_RATIO: 0.20,       // 20% of cross size
  CLUSTER_PROXIMITY_RATIO: 1.00,       // 100% of cross size

  // Explained ink ratio (stroke-count adaptive)
  MIN_EXPLAINED_INK_RATIO: 0.70,       // 3+ strokes (strict)
  MIN_EXPLAINED_INK_RATIO_DOUBLE: 0.62,// 2 strokes (moderate)
  MIN_EXPLAINED_INK_RATIO_SINGLE: 0.55,// 1 stroke (lenient)

  // Arm balance (for branchCount = 3 with 3+ strokes)
  MIN_ARM_BALANCE_RATIO: 0.70          // minArm / maxArm ≥ 70%
};
```

### Threshold Selection Rationale

**Why 26px for clustering?**
- Typical cross size: 60-100px
- 26px ≈ 30-40% of cross size
- Allows for slight intersection displacement from hand tremor
- Small enough to distinguish intentional multi-marks

**Why 30° for branch clustering?**
- X cross has 45° and 135° (90° apart) - clearly separate
- Two lines within 30° appear as single direction
- Catches stars with closely-spaced lines
- Allows natural variation in cross arm angles

**Why 18px minimum arm?**
- Ensures visible cross structure
- Filters out tiny accidental marks
- Typical valid cross has 40-80px arms

**Why 0.70 (70%) for arm balance?**
- Allows 30% variation in arm lengths (natural drawing)
- Rejects highly imbalanced patterns (stars, intentional invalidation)
- Tested empirically on sample ballots

---

## Recent Improvements

### 1. Star Rejection (MAX_BRANCHES: 3 → 2)

**Problem:** Marks with 5-6 lines meeting at center (asterisk/star) were accepted with branchCount = 3.

**Solution:** Changed `MAX_BRANCHES` from 3 to 2.

**Impact:**
- Normal X and + crosses have exactly 2 branches → Still valid ✓
- Stars with 3+ branches → Now rejected ✗

### 2. Single-Stroke Crosses with Loops

**Problem:** Single continuous stroke forming X with loop at intersection rejected due to low explained ink ratio (62.7% < 70%).

**Solution:** Implemented stroke-count adaptive thresholds:
- 1 stroke: 55% (allows natural loops)
- 2 strokes: 62% (standard crosses)
- 3+ strokes: 70% (strict - catches extra writing)

**Rationale:** Single-stroke crosses inherently have loops and curves at the intersection, which create "unexplained" ink. This is natural drawing behavior, not intentional invalidation.

### 3. Parallel Strokes Rejection (Minimum Branch Count)

**Problem:** Two parallel/close strokes accepted as valid even though branchCount = 1 (only one angular direction).

**Solution:** Added minimum branch count check:
```javascript
if (branchCount < 2) {
  return WRONG_SYMBOL;
}
```

**Impact:**
- Two parallel lines → Rejected (no cross shape) ✗
- Normal crosses → Still valid (branchCount = 2) ✓

### 4. Natural Loop Handling (branchCount = 3)

**Problem:** Crosses with natural loops at intersection rejected when branchCount = 3.

**Solution:** Two-tier validation for branchCount = 3:
- **Tier 1**: If 1-2 strokes → Natural loop → Allow
- **Tier 2**: If 3+ strokes → Check arm balance (ratio ≥ 0.70)

**Impact:**
- Single-stroke cross with loop → Valid (Tier 1) ✓
- Cross + emphasis mark (balanced) → Valid (Tier 2) ✓
- 3-line star (imbalanced) → Invalid (Tier 2) ✗

### 5. Multi-Line Star Detection (Stroke Counting at Cluster)

**Problem:** 3-line star accepted as valid when two lines were angularly close (branchCount = 2), even though 3 distinct strokes met at center.

**Root Cause:** When 3 lines meet at nearly the same point, they create 3 intersections (A×B, A×C, B×C). These cluster together, but each individual intersection only shows 2 strokes.

**Solution:** Count unique strokes across entire cluster, not just at one intersection:

```javascript
// Count strokes across ALL intersections in cluster
cluster.strokesAtCluster =
  uniqueCount([
    intersection1.seg1.strokeIndex,
    intersection1.seg2.strokeIndex,
    intersection2.seg1.strokeIndex,
    intersection2.seg2.strokeIndex,
    intersection3.seg1.strokeIndex,
    intersection3.seg2.strokeIndex
  ]);

// Validate
if (strokesAtCluster >= 3) {
  return WRONG_SYMBOL;
}
```

**Impact:**
- Normal X cross (2 strokes) → Valid ✓
- 3-line star (any angle configuration) → Invalid ✗
- Independent of branch count (catches all star patterns)

### 6. Scale-Adaptive Intentional Invalidation

**Problem:** Fixed pixel thresholds (80px) didn't work for different-sized crosses.

**Solution:** Use relative thresholds based on cross size:
```javascript
scaleReference = median(all arm lengths);
intentionalThreshold = scaleReference * 1.60;  // 160% of cross size
```

**Impact:**
- Small cross (30px arms): 48px threshold
- Large cross (100px arms): 160px threshold
- Robust across all drawing sizes

---

## Edge Cases and Special Handling

### 1. Elderly Voter Scenarios

**Scenario:** Voter draws 2 parallel lines, realizes mistake, adds crossing line.

**Handling:**
- 2 parallel lines alone → Invalid (branchCount = 1)
- After adding 3rd crossing line → Valid (branchCount = 2)

**Why:** Third line creates distinct angular direction, forming clear cross.

### 2. Emphasis Marks

**Scenario:** Voter draws circle/oval around cross to emphasize their choice.

**Handling:**
- 1-2 stroke cross + emphasis → Valid (if arms balanced)
- 3+ strokes with branchCount = 3 → Check arm balance
- If arms well-balanced (≥70%) → Valid
- If arms imbalanced → Invalid (likely star)

### 3. Retracing

**Scenario:** Voter draws over same cross multiple times (thick lines).

**Handling:**
- Multiple intersections within 20% of cross size → Treated as single cross
- Passes to normal validation

**Why:** Retracing is natural behavior, not multi-marking.

### 4. Wobbly Crosses

**Scenario:** Cross with shaky lines, varying arm lengths.

**Handling:**
- 12px perpendicular tolerance in corridor detection
- 25° angular tolerance in alignment checks
- Arm balance check uses 70% threshold (allows 30% variation)

**Result:** Natural hand variation is accepted.

### 5. Self-Intersecting Strokes

**Scenario:** Single stroke that loops and crosses itself.

**Handling:**
- Self-intersection creates intersection with strokesAtIntersection = 1
- branchCount can be 2 or 3 (depending on loop shape)
- Uses lenient 55% explained ink threshold (1 stroke)

**Result:** Single-stroke crosses with loops are valid.

### 6. Non-Standard Angles

**Scenario:** X cross at unusual angles (not 45°/135°).

**Handling:**
- No assumption about specific angles
- Only checks: 2 distinct directions with good 4-arm extensions
- Works for any angle as long as cross structure is clear

**Result:** All X and + variations accepted.

---

## Testing Guide

### Manual Testing Procedure

#### Test 1: Valid Marks
Draw each and verify "บัตรดี" (Valid):
- [ ] Standard X cross (diagonal strokes)
- [ ] Standard + cross (horizontal/vertical)
- [ ] X with slightly curved arms
- [ ] + with slightly angled arms
- [ ] Single continuous stroke forming X with loop
- [ ] Two-stroke X with small loop at center

#### Test 2: Invalid - Wrong Symbol
Draw each and verify "บัตรเสีย" with "ทำเครื่องหมายแบบอื่น":
- [ ] Two parallel vertical lines (branchCount = 1)
- [ ] Two parallel horizontal lines (branchCount = 1)
- [ ] Single diagonal line (no intersection)
- [ ] 3-line star (any angle configuration)
- [ ] 5-line star/asterisk pattern
- [ ] Circle only (no cross)

#### Test 3: Invalid - Intentional
Draw each and verify "บัตรเสีย" with "ทำเครื่องหมายเพิ่มเติมเพื่อให้บัตรเสีย":
- [ ] Two separate X crosses far apart (>160% spacing)
- [ ] X cross + separate checkmark
- [ ] X cross + underline (far below)

#### Test 4: Invalid - Extra Writing
Draw each and verify "บัตรเสีย" with "มีสัญลักษณ์หรือข้อความเพิ่มเติม":
- [ ] X cross + thick circle around it (low explained ratio)
- [ ] X cross + extra squiggles nearby
- [ ] X cross + additional straight line not through center

#### Test 5: Invalid - Other Categories
- [ ] Empty canvas → "รอการทำเครื่องหมาย" (Waiting)
- [ ] Tiny dot → "บัตรเสีย" with "บัตรเปล่า" (Blank)
- [ ] Mark extending far outside box → "บัตรเสีย" with "ทำเครื่องหมายนอกกรอบ"
- [ ] Scribble covering entire box → "บัตรเสีย" with "บัตรเปล่า" (Scribble)

### Debug Mode

Enable debug output by checking the "Debug" checkbox:
- Shows intersection count, clusters, candidates
- Shows arm lengths, stroke count at center
- Shows branch count, explained ratio
- Helps diagnose validation path

### Edge Case Verification

**Elderly Voter Scenario:**
1. Draw 2 close vertical lines → Should be Invalid (branchCount = 1)
2. Add diagonal line crossing both → Should become Valid (branchCount = 2)

**Emphasis Mark Scenario:**
1. Draw clean X → Should be Valid
2. Add thin circle around it → Should stay Valid (if balanced)
3. Add very thick oval → May become Invalid (low explained ratio)

**Multi-Line Star Detection:**
1. Draw X (2 strokes) → Valid, shows "Strokes at center: 2"
2. Add 3rd line through center → Invalid, shows "Strokes at center: 3"
3. Verify works regardless of 3rd line angle

### Regression Testing

After any changes, verify:
- [ ] All normal X and + crosses still valid
- [ ] Stars/asterisks still rejected
- [ ] Multi-marks still rejected
- [ ] Outside-box marks still rejected
- [ ] Blank/scribble still rejected

---

## Architecture Decisions

### Why Cluster-Based Stroke Counting?

**Alternatives Considered:**
1. Count strokes at single "best" intersection
   - **Problem**: Misses other intersections in cluster
2. Count strokes globally across all ink
   - **Problem**: Not localized to cross center
3. Use branch count only
   - **Problem**: Angular clustering can hide 3rd stroke

**Chosen Solution:** Count unique strokes across all intersections in cluster
- **Pros**: Detects all strokes meeting at center point
- **Pros**: Robust to intersection clustering
- **Pros**: Independent of angular distribution
- **Cons**: Slightly more complex implementation

### Why Two-Tier Branch Validation?

**For branchCount = 3:**

**Tier 1: Stroke Count** (1-2 strokes)
- Single/double stroke can't be intentional star
- Natural loops create 3rd angular direction
- Allow immediately, no further checks

**Tier 2: Arm Balance** (3+ strokes)
- Could be star OR cross + emphasis
- Check if core cross is strong (balanced arms)
- If balanced → likely emphasis → allow
- If imbalanced → likely star → reject

**Rationale:**
- Handles both natural drawing variation AND intentional invalidation
- Stroke count is definitive for 1-2 strokes
- Arm balance is good heuristic for 3+ strokes
- Covers all edge cases without excessive complexity

### Why Scale-Adaptive Thresholds?

**Problem:** Different voters draw different-sized crosses (30px to 120px).

**Solution:** Calculate scale reference from actual cross size, use relative thresholds.

**Benefits:**
- Works for all drawing sizes
- No manual calibration needed
- Robust to different drawing styles
- Handles zoom/resolution differences

---

## Performance Considerations

### Time Complexity

- **Stroke simplification**: O(n) per stroke (RDP algorithm)
- **Intersection detection**: O(s²) where s = segment count (typically < 100)
- **Clustering**: O(i²) where i = intersection count (typically < 10)
- **4-arm extension**: O(s) per intersection
- **Branch counting**: O(s) per intersection
- **Overall**: O(s²) dominated by intersection detection

**Typical Performance:**
- Input: 2-5 strokes, 50-200 points
- Simplified: 2-5 strokes, 10-30 segments
- Intersections: 1-5
- Validation time: < 10ms

### Memory Usage

- Raw strokes: ~1KB (200 points × 2 coords × 4 bytes)
- Simplified strokes: ~200 bytes (30 segments)
- Intersections: ~100 bytes (5 intersections)
- Candidates: ~100 bytes (3 candidates)
- **Total**: < 2KB per ballot

### Optimization Opportunities

**If Performance Becomes Issue:**
1. Spatial indexing for segment queries (quadtree)
2. Early termination on first invalid check
3. Caching of segment calculations
4. WebAssembly for core algorithms

**Current Status:** Performance is excellent for interactive use. No optimization needed.

---

## Future Enhancements

### Potential Improvements

1. **Machine Learning Integration**
   - Train CNN on real ballot images
   - Use current algorithm as teacher/validator
   - Handle more edge cases automatically

2. **Confidence Scoring**
   - Return confidence level (0-100%)
   - Allow manual review for borderline cases
   - Improve transparency for election observers

3. **Multi-Language Support**
   - Internationalize error messages
   - Support different ballot layouts
   - Adapt to other election systems

4. **Real-Time Feedback**
   - Show validation result during drawing
   - Guide user to draw valid mark
   - Reduce invalid ballots in first place

5. **Batch Processing**
   - Process scanned ballot images
   - Export validation results to CSV
   - Statistical analysis of rejection reasons

### Non-Goals

**Intentionally NOT Supported:**
- Checkmarks (✓) - Not valid Thai ballot marks
- Text/numbers - Always invalid
- Multiple choice selections - Different ballot type
- Partial erasures - Physical ballots don't support this
- Color-based validation - Ballots use black ink only

---

## Conclusion

This ballot validation system implements a comprehensive, robust algorithm for determining Thai ballot validity. Key strengths:

1. **Robust**: Handles natural drawing variation and edge cases
2. **Adaptive**: Scale-relative thresholds work for all cross sizes
3. **Explainable**: Clear validation path and rejection reasons
4. **Accurate**: Multi-layer defense catches intentional invalidation
5. **Fast**: Sub-10ms validation time
6. **Maintainable**: Well-structured code with clear algorithm separation

The recent improvements (stroke counting at cluster, adaptive thresholds, two-tier branch validation) significantly enhanced accuracy while maintaining simplicity and performance.

---

## Version History

**v1.0** - Initial release
- Basic intersection detection and 4-arm analysis
- Fixed-threshold validation

**v2.0** - Scale-adaptive improvements
- Relative thresholds for multi-mark detection
- Median-based scale reference
- Intentional invalidation detection

**v2.1** - Star rejection enhancements
- MAX_BRANCHES: 3 → 2
- Minimum branch count check (branchCount < 2)

**v2.2** - Single-stroke cross support
- Stroke-count adaptive explained ink thresholds
- 55% threshold for 1-stroke crosses
- 62% threshold for 2-stroke crosses
- 70% threshold for 3+ stroke crosses

**v2.3** - Natural loop handling
- Two-tier validation for branchCount = 3
- Tier 1: Stroke count (1-2 strokes → allow)
- Tier 2: Arm balance (3+ strokes → check balance)

**v2.4** - Multi-line star detection (Current)
- Cluster-based stroke counting
- Detects 3+ strokes meeting at center
- Independent of angular distribution
- Catches all star patterns regardless of branch count

---

## Contact & Support

For questions, bug reports, or feature requests:
- Review the code at: `/Users/keng/Workspaces/vote62-ballot-mark/index.html`
- Check debug output for validation path analysis
- Test with various mark patterns to understand behavior

**Developed with Claude Code** 🤖
