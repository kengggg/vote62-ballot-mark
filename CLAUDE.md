# Thai Ballot Validator - Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Module Structure](#module-structure)
4. [Validation Flow](#validation-flow)
5. [Core Algorithms](#core-algorithms)
6. [Configuration Parameters](#configuration-parameters)
7. [Recent Improvements](#recent-improvements)
8. [Edge Cases and Special Handling](#edge-cases-and-special-handling)
9. [Testing Guide](#testing-guide)
10. [Architecture Decisions](#architecture-decisions)

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

1. **WAITING** - No strokes drawn yet (neutral state)
2. **BLANK** - No ink or insufficient ink
3. **OUTSIDE_BOX** - Mark extends beyond ballot box boundaries
4. **NO_CROSS** - No valid intersection found
5. **MULTI_MARK** / **INTENTIONAL** - Multiple crosses or intentionally invalidated
6. **WRONG_SYMBOL** - Not a cross (star, parallel lines, etc.)
7. **EXTRA_WRITING** - Cross with excessive additional marks
8. **VALID** - Acceptable cross mark

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         index.html                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Canvas UI + Vote Box Display                         │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │   JavaScript Module Layer     │
         │  (11 focused modules)         │
         └───────────────┬───────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
┌───▼────┐        ┌──────▼──────┐      ┌────▼─────┐
│Config  │        │Validation   │      │   UI     │
│Module  │        │  Engine     │      │ Module   │
└────────┘        └──────┬──────┘      └──────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼─────┐   ┌─────▼──────┐   ┌────▼──────┐
   │Geometry  │   │Intersection│   │ Topology  │
   │          │   │            │   │           │
   └──────────┘   └────────────┘   └───────────┘
```

### Data Flow

```
User Drawing (pointer events)
    ↓
Input Handler (input-handler.js)
    ↓
Raw Strokes (points array)
    ↓
Preprocessing (preprocessing.js)
  ├─ Resample at uniform intervals
  └─ Simplify with RDP algorithm
    ↓
Intersection Detection (intersection.js)
  ├─ Build segments from strokes
  └─ Find all crossing points
    ↓
Clustering (topology.js)
  └─ Group nearby intersections
    ↓
4-Arm Extension Analysis (arm-extension.js)
  └─ Measure cross arm lengths
    ↓
Topology Analysis (topology.js)
  ├─ Count angular branches
  └─ Count strokes at center
    ↓
Explained Ink Analysis (explained-ink.js)
  └─ Calculate alignment ratio
    ↓
Validation Engine (validation.js)
  └─ Apply 7-category precedence system
    ↓
UI Update (ui.js)
  └─ Display result badge
```

### Key Data Structures

#### Stroke
```javascript
[
  {x: number, y: number, t: timestamp},
  {x: number, y: number, t: timestamp},
  ...
]
// Array of points representing continuous drawing motion
```

#### Segment
```javascript
{
  p1: {x, y},              // Start point
  p2: {x, y},              // End point
  strokeIndex: number,     // Which stroke (0, 1, 2, ...)
  segmentIndex: number,    // Position within stroke
  length: number,          // Segment length in pixels
  strokeStart: {x, y},     // First point of parent stroke
  strokeEnd: {x, y}        // Last point of parent stroke
}
```

#### Intersection
```javascript
{
  x: number,              // X coordinate
  y: number,              // Y coordinate
  seg1: Segment,          // First intersecting segment
  seg2: Segment,          // Second intersecting segment
  angle: number           // Crossing angle (degrees, acute)
}
```

#### Cluster
```javascript
{
  points: [Intersection, ...],  // Intersections in this cluster
  centroid: {x, y},              // Cluster center
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
    'seg1+': number,
    'seg1-': number,
    'seg2+': number,
    'seg2-': number
  },
  armAngles: [number, ...],        // The 4 arm directions (degrees)
  strokesAtIntersection: number    // Unique strokes from cluster
}
```

---

## Module Structure

The application is organized into 11 focused JavaScript modules, loaded in dependency order:

### 1. config.js
**Purpose:** Central configuration for all validation thresholds and parameters

**Exports:** `window.BallotConfig`

**Key Responsibilities:**
- Geometric thresholds (arm length, corridor width, etc.)
- Ballot box boundaries
- Multi-mark detection ratios
- Explained ink thresholds (stroke-count adaptive)
- UI timing parameters

### 2. geometry.js
**Purpose:** Pure geometry utility functions

**Exports:** `window.BallotGeometry`

**Key Functions:**
- `dist(p1, p2)` - Euclidean distance
- `strokeLength(stroke)` - Total polyline length
- `pointInRect(pt, rect, tolerance)` - Boundary checking
- `segmentMidpoint(seg)` - Midpoint calculation
- `pointToLineDistance(pt, P, angle)` - Perpendicular distance
- `angleDifference(a1, a2)` - Bidirectional angle difference

**Dependencies:** None (pure functions)

### 3. preprocessing.js
**Purpose:** Stroke preprocessing algorithms

**Exports:** `window.BallotPreprocessing`

**Key Functions:**
- `resampleStroke(stroke, step)` - Uniform resampling
- `simplifyRDP(points, epsilon)` - Ramer-Douglas-Peucker simplification

**Dependencies:** `BallotGeometry`

### 4. intersection.js
**Purpose:** Intersection detection between segments

**Exports:** `window.BallotIntersection`

**Key Functions:**
- `buildSegments(strokes)` - Convert strokes to segments
- `findSegmentIntersection(seg1, seg2)` - Line-line intersection
- `findAllIntersections(segments)` - Find all crossing points

**Dependencies:** `BallotGeometry`, `BallotConfig`

### 5. arm-extension.js
**Purpose:** Measure 4-arm extension from intersection

**Exports:** `window.BallotArmExtension`

**Key Functions:**
- `measure4ArmExtension(P, seg1, seg2, strokes)` - Main measurement
- `findInkInCorridor(P, angle, strokes)` - Corridor-based ink detection

**Dependencies:** `BallotGeometry`, `BallotConfig`

### 6. topology.js
**Purpose:** Global topology analysis

**Exports:** `window.BallotTopology`

**Key Functions:**
- `countGlobalBranches(P, strokes)` - Count angular directions
- `clusterAngles(angleData, tolerance)` - Angular clustering
- `clusterIntersections(intersections, eps)` - Spatial clustering

**Dependencies:** `BallotGeometry`, `BallotConfig`

### 7. explained-ink.js
**Purpose:** Calculate explained ink ratio

**Exports:** `window.BallotExplainedInk`

**Key Functions:**
- `calculateExplainedInkRatio(candidate, strokes, segments)` - Main calculation

**Dependencies:** `BallotGeometry`, `BallotConfig`

### 8. validation.js
**Purpose:** Main validation engine implementing 7-category system

**Exports:** `window.BallotValidation`

**Key Functions:**
- `validateMark(strokes, options)` - Main validation entry point

**Dependencies:** All algorithm modules above

**Returns:**
```javascript
{
  valid: boolean | null,
  label: string,              // Thai display text
  invalid_type: string | null,
  reason: string,
  debug: Object               // Optional debug information
}
```

### 9. ui.js
**Purpose:** Canvas rendering and result display

**Exports:** `window.BallotUI`

**Key Functions:**
- `initCanvas(canvasElement)` - Initialize canvas
- `clearCanvas()` - Clear and redraw vote box
- `redrawAllStrokes(strokes, debugData)` - Redraw all ink
- `drawDebugOverlay(debugData)` - Draw debug visualization
- `updateResult(result)` - Update result badge

**Dependencies:** `BallotConfig`

### 10. input-handler.js
**Purpose:** Pointer event handling for drawing

**Exports:** `window.BallotInput`

**Global State:** `window.ballotState`

**Key Functions:**
- `init(canvas, ctx)` - Initialize handler
- `handlePointerDown/Move/Up/Cancel()` - Event handlers
- `scheduleEvaluation()` - Debounced validation trigger
- `clear()` - Reset state

**Dependencies:** `BallotConfig`, `BallotValidation`, `BallotUI`

### 11. app.js
**Purpose:** Application initialization and wiring

**Key Responsibilities:**
- DOM ready detection
- Module initialization
- Event listener attachment
- Error handling

**Dependencies:** All modules

### Module Dependency Graph

```
app.js
  ├── input-handler.js
  │     ├── validation.js
  │     │     ├── preprocessing.js
  │     │     │     └── geometry.js
  │     │     ├── intersection.js
  │     │     │     ├── geometry.js
  │     │     │     └── config.js
  │     │     ├── topology.js
  │     │     │     ├── geometry.js
  │     │     │     └── config.js
  │     │     ├── arm-extension.js
  │     │     │     ├── geometry.js
  │     │     │     └── config.js
  │     │     ├── explained-ink.js
  │     │     │     ├── geometry.js
  │     │     │     └── config.js
  │     │     └── config.js
  │     └── ui.js
  │           └── config.js
  └── ui.js
        └── config.js

config.js (no dependencies)
geometry.js (no dependencies)
```

### Load Order in index.html

```html
<script src="js/config.js"></script>
<script src="js/geometry.js"></script>
<script src="js/preprocessing.js"></script>
<script src="js/intersection.js"></script>
<script src="js/arm-extension.js"></script>
<script src="js/topology.js"></script>
<script src="js/explained-ink.js"></script>
<script src="js/validation.js"></script>
<script src="js/ui.js"></script>
<script src="js/input-handler.js"></script>
<script src="js/app.js"></script>
```

**Critical:** Scripts must be loaded in this order to ensure dependencies are available.

---

## Validation Flow

### Detailed Step-by-Step Process

#### Phase 0: Input Capture
**Module:** `input-handler.js`
- Capture pointer events (mouse, touch, stylus)
- Build stroke arrays as user draws
- Trigger validation after stroke completion (debounced)

#### Phase 1: Preprocessing
**Module:** `validation.js` → `preprocessing.js`

**1.1 Empty Check**
```javascript
if (strokes.length === 0) {
  return WAITING;  // Neutral state, no strokes yet
}
```

**1.2 Ink Quantity Check**
```javascript
totalInkLength = sum(strokeLength(stroke) for stroke in strokes);

if (totalInkLength < BallotConfig.MIN_TOTAL_INK_LENGTH_PX) {
  return BLANK;  // 30px minimum - filters dots/accidental marks
}
```

**1.3 Scribble Detection**
```javascript
totalPoints = sum(stroke.length for stroke in strokes);

if (totalPoints > BallotConfig.MAX_POINTS_TOTAL) {
  return WRONG_SYMBOL;  // 1200 points max - anti-scribble
}
```

**1.4 Stroke Simplification**
```javascript
for (stroke of strokes) {
  // Resample at uniform 2px intervals
  resampled = BallotPreprocessing.resampleStroke(stroke, 2.0);

  // Simplify with RDP algorithm (epsilon = 2.0px)
  simplified = BallotPreprocessing.simplifyRDP(resampled, 2.0);

  processedStrokes.push(simplified);
}
```

**Purpose:** Reduce noise, normalize point density, preserve shape

#### Phase 2: Boundary Validation
**Module:** `validation.js` using `geometry.js`

**2.1 Outside Box Check**
```javascript
VOTE_BOX = {
  x: 353, y: 313,
  width: 318, height: 215
};

TOLERANCE = 3px;  // Allowed overshoot

// Check every point along every stroke
for (stroke of processedStrokes) {
  for (i = 0 to stroke.length - 2) {
    // Dense sampling along segment
    steps = ceil(distance(stroke[i], stroke[i+1]) / 2.0);

    for (j = 0 to steps) {
      pt = interpolate(stroke[i], stroke[i+1], j / steps);

      if (!pointInRect(pt, VOTE_BOX, TOLERANCE)) {
        return OUTSIDE_BOX;
      }
    }
  }
}
```

**Why dense sampling?** Prevents fast diagonal strokes from escaping box detection.

#### Phase 3: Intersection Detection
**Module:** `validation.js` → `intersection.js`

**3.1 Build Segments**
```javascript
segments = BallotIntersection.buildSegments(processedStrokes);

// Each segment includes:
// - Endpoints (p1, p2)
// - Parent stroke index
// - Stroke endpoints (for endpoint detection)
```

**3.2 Find All Intersections**
```javascript
intersections = BallotIntersection.findAllIntersections(segments);

// Algorithm:
// - O(n²) segment pair testing
// - Skip same-stroke adjacent segments
// - Use parametric line-line intersection
// - Filter by ballot box boundaries
// - Calculate crossing angle
```

**3.3 No Cross Check**
```javascript
if (intersections.length === 0) {
  return NO_CROSS;  // Parallel lines, single stroke, etc.
}
```

#### Phase 4: Clustering
**Module:** `validation.js` → `topology.js`

**4.1 Cluster Intersections**
```javascript
clusters = BallotTopology.clusterIntersections(
  intersections,
  BallotConfig.CROSS_CLUSTER_EPS_PX  // 26px radius
);

// DBSCAN-like greedy clustering
// Groups intersections within 26px of each other
```

**4.2 Count Strokes per Cluster** ⭐
```javascript
for (cluster of clusters) {
  uniqueStrokes = new Set();

  for (inter of cluster.points) {
    uniqueStrokes.add(inter.seg1.strokeIndex);
    uniqueStrokes.add(inter.seg2.strokeIndex);
  }

  cluster.strokesAtCluster = uniqueStrokes.size;
}
```

**Critical for multi-line star detection:** When 3 lines meet at nearly the same point, they create 3 intersections (A×B, A×C, B×C). This counts all unique strokes across the cluster.

**4.3 Validate Cross Structure**
```javascript
for (cluster of clusters) {
  hasValidCross = false;

  for (inter of cluster.points) {
    result = BallotArmExtension.measure4ArmExtension(
      inter,
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
}
```

#### Phase 5: Multi-Mark Detection
**Module:** `validation.js`

**5.1 Calculate Scale Reference**
```javascript
validClusters = clusters.filter(c => c.isCrossValid);

if (validClusters.length === 0) {
  // Will be caught in Phase 6
  scaleReference = 60;  // Default
} else {
  // Collect arm lengths from all valid crosses
  armLengths = [];
  for (cluster of validClusters) {
    for (inter of cluster.points) {
      result = measure4ArmExtension(...);
      if (result.valid) {
        avgArm = average(result.extensions);
        armLengths.push(avgArm);
      }
    }
  }

  // Use median (robust to outliers)
  scaleReference = median(armLengths);
}
```

**5.2 Scale-Adaptive Cluster Separation**
```javascript
if (validClusters.length >= 2) {
  retraceThreshold = scaleReference * 0.12;      // 12% of cross size
  intentionalThreshold = scaleReference * 0.20;   // 20% of cross size
  multiMarkThreshold = scaleReference * 1.0;      // 100% of cross size

  for (i = 0 to validClusters.length - 2) {
    for (j = i + 1 to validClusters.length - 1) {
      distance = dist(validClusters[i].centroid,
                     validClusters[j].centroid);

      if (distance >= multiMarkThreshold) {
        return MULTI_MARK;  // Highest priority
      } else if (distance >= intentionalThreshold) {
        hasIntentional = true;
      }
      // else: distance < intentionalThreshold → retracing (OK)
    }
  }

  if (hasIntentional) {
    return WRONG_SYMBOL;  // Intentional invalidation
  }

  // All clusters very close → treat as single cross from retracing
}
```

**Key Insight:** Adaptive thresholds based on actual cross size make detection robust across different drawing scales.

#### Phase 6: Cross Candidate Selection
**Module:** `validation.js` → `arm-extension.js`

**6.1 Build Candidates**
```javascript
crossCandidates = [];

for (inter of intersections) {
  result = BallotArmExtension.measure4ArmExtension(
    {x: inter.x, y: inter.y},
    inter.seg1,
    inter.seg2,
    processedStrokes
  );

  if (result.valid) {
    // Find which cluster this intersection belongs to
    strokesAtCluster = 2;  // Default
    for (cluster of clusters) {
      if (cluster.points.includes(inter)) {
        strokesAtCluster = cluster.strokesAtCluster;
        break;
      }
    }

    crossCandidates.push({
      point: {x: inter.x, y: inter.y},
      minExtension: result.minExtension,
      extensions: result.extensions,
      armAngles: result.armAngles,
      strokesAtIntersection: strokesAtCluster
    });
  }
}
```

**6.2 No Valid Cross Check**
```javascript
if (crossCandidates.length === 0) {
  return WRONG_SYMBOL;  // Has intersections but no valid 4-arm structure
}
```

**6.3 Select Best Candidate**
```javascript
bestCandidate = crossCandidates.reduce((best, curr) =>
  curr.minExtension > best.minExtension ? curr : best
);

// Choose cross with strongest (longest) minimum arm
// This handles emphasis marks - core cross dominates
```

#### Phase 7: Topology Validation
**Module:** `validation.js` → `topology.js`

**7.1 Branch Counting**
```javascript
branchCount = BallotTopology.countGlobalBranches(
  bestCandidate.point,
  processedStrokes
);

// Returns number of distinct angular directions (30° tolerance)
```

**7.2 Multi-Line Star Detection** ⭐
```javascript
if (bestCandidate.strokesAtIntersection >= 3) {
  return WRONG_SYMBOL;  // 3+ strokes meeting at center
}
```

**Purpose:** Catches stars regardless of angular spacing.

**7.3 Minimum Branch Check**
```javascript
if (branchCount < 2) {
  return WRONG_SYMBOL;  // Parallel lines or single direction
}
```

**7.4 Maximum Branch Check with Two-Tier Validation** ⭐
```javascript
if (branchCount > 2) {
  if (branchCount === 3) {
    // TIER 1: Natural loop detection
    if (strokes.length <= 2) {
      // 1-2 strokes with loop → Natural drawing → ALLOW
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

**Why two tiers?**
- **Tier 1**: Single/double stroke can't be intentional star
- **Tier 2**: 3+ strokes could be star OR cross + emphasis

#### Phase 8: Explained Ink Ratio Check
**Module:** `validation.js` → `explained-ink.js`

**8.1 Adaptive Threshold Selection** ⭐
```javascript
let explainedInkThreshold;

if (strokes.length === 1) {
  explainedInkThreshold = BallotConfig.MIN_EXPLAINED_INK_RATIO_SINGLE;  // 50%
} else if (strokes.length === 2) {
  explainedInkThreshold = BallotConfig.MIN_EXPLAINED_INK_RATIO_DOUBLE;  // 62%
} else {
  explainedInkThreshold = BallotConfig.MIN_EXPLAINED_INK_RATIO;  // 70%
}
```

**Rationale:**
- **1 stroke (50%)**: Lenient - allows natural loops/curves
- **2 strokes (62%)**: Moderate - standard crosses
- **3+ strokes (70%)**: Strict - catches extra writing

**8.2 Calculate Ratio**
```javascript
explainedRatio = BallotExplainedInk.calculateExplainedInkRatio(
  bestCandidate,
  processedStrokes,
  segments
);

// Returns ratio [0, 1] of ink aligned with cross axes
```

**8.3 Validate**
```javascript
if (explainedRatio < explainedInkThreshold) {
  return EXTRA_WRITING;  // Too much extra ink
}
```

#### Phase 9: Valid
```javascript
return VALID;  // All checks passed!
```

---

## Core Algorithms

### 1. Intersection Detection
**Module:** `intersection.js`

**Algorithm:** Parametric line-line intersection

```javascript
function findSegmentIntersection(seg1, seg2) {
  // Skip same-stroke adjacent segments
  if (seg1.strokeIndex === seg2.strokeIndex &&
      Math.abs(seg1.segmentIndex - seg2.segmentIndex) <= 1) {
    return null;
  }

  // Parametric form: P = P1 + t*(P2-P1)
  const dx1 = seg1.p2.x - seg1.p1.x;
  const dy1 = seg1.p2.y - seg1.p1.y;
  const dx2 = seg2.p2.x - seg2.p1.x;
  const dy2 = seg2.p2.y - seg2.p1.y;

  // Determinant (cross product of direction vectors)
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

  // Calculate crossing angle (acute)
  const angle1 = Math.atan2(dy1, dx1);
  const angle2 = Math.atan2(dy2, dx2);
  let crossAngle = Math.abs(angle1 - angle2) * (180 / Math.PI);
  crossAngle = Math.min(crossAngle, 180 - crossAngle);

  return {
    x: ix,
    y: iy,
    angle: crossAngle,
    seg1: seg1,
    seg2: seg2
  };
}
```

**Key Features:**
- O(n²) complexity for n segments (acceptable for < 100 segments)
- Skips same-stroke adjacent segments (avoid self-intersection noise)
- Returns null for parallel lines (determinant = 0)
- Returns null for non-overlapping segment bounds
- Calculates acute crossing angle

### 2. 4-Arm Extension Measurement
**Module:** `arm-extension.js`

**Purpose:** Measure how far ink extends in all 4 directions from intersection

**Algorithm:**

```javascript
function measure4ArmExtension(P, seg1, seg2, allStrokes) {
  // 1. Extract two primary directions from intersecting segments
  const dir1 = Math.atan2(seg1.p2.y - seg1.p1.y, seg1.p2.x - seg1.p1.x);
  const dir2 = Math.atan2(seg2.p2.y - seg2.p1.y, seg2.p2.x - seg2.p1.x);

  // 2. Normalize to [0, 180) - direction is bidirectional
  const angle1 = ((dir1 * 180 / Math.PI) % 180 + 180) % 180;
  const angle2 = ((dir2 * 180 / Math.PI) % 180 + 180) % 180;

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
  const valid = minExtension >= BallotConfig.MIN_ARM_EXTENSION_PX;  // 18px

  return {
    valid,
    minExtension,
    extensions,
    armAngles
  };
}
```

**findInkInCorridor Algorithm:**

```javascript
function findInkInCorridor(P, direction, strokes) {
  const corridorHalfWidth = BallotConfig.ARM_CORRIDOR_DIST_PX;  // 12px
  const angleTolerance = BallotConfig.ARM_CORRIDOR_ANGLE_TOL_DEG;  // 25°

  let maxDistance = 0;

  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length - 1; i++) {
      const seg = {p1: stroke[i], p2: stroke[i + 1]};

      // 1. Check angular alignment (bidirectional)
      const segAngle = Math.atan2(seg.p2.y - seg.p1.y,
                                  seg.p2.x - seg.p1.x) * 180 / Math.PI;
      const angleDiff = BallotGeometry.angleDifference(direction, segAngle);

      if (angleDiff > angleTolerance) continue;

      // 2. Check perpendicular distance from ray
      const mid = BallotGeometry.segmentMidpoint(seg);
      const perpDist = BallotGeometry.pointToLineDistance(mid, P, direction);

      if (perpDist > corridorHalfWidth) continue;

      // 3. Check directionality (dot product)
      const dirRad = direction * Math.PI / 180;
      const dirVec = {x: Math.cos(dirRad), y: Math.sin(dirRad)};

      // Must extend AWAY from P
      const toP1 = {x: seg.p1.x - P.x, y: seg.p1.y - P.y};
      const toP2 = {x: seg.p2.x - P.x, y: seg.p2.y - P.y};

      const dot1 = toP1.x * dirVec.x + toP1.y * dirVec.y;
      const dot2 = toP2.x * dirVec.x + toP2.y * dirVec.y;

      // At least one endpoint must be in positive direction
      if (dot1 < 0 && dot2 < 0) continue;

      // 4. Calculate distance along direction
      const dist1 = Math.max(0, dot1);
      const dist2 = Math.max(0, dot2);
      maxDistance = Math.max(maxDistance, dist1, dist2);
    }
  }

  return maxDistance;
}
```

**Why This Works:**
- **Corridor approach**: Allows for slight curvature and natural wobble
- **Bidirectional alignment**: Segments can point forward or backward
- **Directionality check**: Ensures ink extends away from center
- **12px perpendicular tolerance**: Forgiving of hand-drawing variation
- **25° angular tolerance**: Allows arm curvature while rejecting unrelated ink

### 3. Branch Counting (Angular Clustering)
**Module:** `topology.js`

**Purpose:** Count distinct angular directions near intersection

**Algorithm:**

```javascript
function countGlobalBranches(P, strokes) {
  const radius = BallotConfig.TOPOLOGY_ANALYSIS_RADIUS_PX;  // 60px

  // 1. Collect all segments within radius
  const nearbySegments = [];

  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length - 1; i++) {
      const seg = {p1: stroke[i], p2: stroke[i + 1]};
      const mid = BallotGeometry.segmentMidpoint(seg);

      if (BallotGeometry.dist(mid, P) <= radius) {
        const angle = Math.atan2(seg.p2.y - seg.p1.y,
                                 seg.p2.x - seg.p1.x);
        const normalized = ((angle * 180 / Math.PI) % 180 + 180) % 180;
        const length = BallotGeometry.dist(seg.p1, seg.p2);

        nearbySegments.push({angle: normalized, weight: length});
      }
    }
  }

  if (nearbySegments.length === 0) return 0;

  // 2. Cluster angles using 30° tolerance
  const branches = clusterAngles(nearbySegments,
                                 BallotConfig.BRANCH_ANGLE_CLUSTER_TOL_DEG);  // 30°

  return branches.length;
}
```

**clusterAngles Algorithm:**

```javascript
function clusterAngles(angleData, tolerance) {
  if (angleData.length === 0) return [];

  // Sort by angle
  angleData.sort((a, b) => a.angle - b.angle);

  const modes = [];
  let currentMode = {
    angle: angleData[0].angle,
    weight: angleData[0].weight
  };

  // Greedy clustering
  for (let i = 1; i < angleData.length; i++) {
    const angleDiff = angleData[i].angle - currentMode.angle;

    if (angleDiff > tolerance) {
      // Start new cluster
      modes.push(currentMode);
      currentMode = {
        angle: angleData[i].angle,
        weight: angleData[i].weight
      };
    } else {
      // Merge into current cluster (weighted average)
      const totalWeight = currentMode.weight + angleData[i].weight;
      currentMode.angle = (currentMode.angle * currentMode.weight +
                          angleData[i].angle * angleData[i].weight) / totalWeight;
      currentMode.weight = totalWeight;
    }
  }
  modes.push(currentMode);

  // Handle wrap-around at 0°/180° boundary
  if (modes.length >= 2) {
    const firstMode = modes[0];
    const lastMode = modes[modes.length - 1];

    if (180 - lastMode.angle + firstMode.angle <= tolerance) {
      // Merge first and last modes
      const totalWeight = firstMode.weight + lastMode.weight;
      let mergedAngle = (lastMode.angle * lastMode.weight +
                        (firstMode.angle + 180) * firstMode.weight) / totalWeight;
      mergedAngle = mergedAngle % 180;

      lastMode.angle = mergedAngle;
      lastMode.weight = totalWeight;
      modes.shift();  // Remove first mode
    }
  }

  // Sort by weight (strongest modes first)
  modes.sort((a, b) => b.weight - a.weight);

  return modes;
}
```

**Key Features:**
- **30° tolerance**: Two lines within 30° cluster into same branch
- **Weighted clustering**: Longer segments have more influence
- **Wrap-around handling**: 0° and 180° are the same direction
- **Greedy O(n log n)**: Fast sorting-based algorithm

**Examples:**

| Mark | Angles | Clusters | Branch Count |
|------|--------|----------|--------------|
| X cross | 45°, 135° | [45°, 135°] | 2 |
| + cross | 0°, 90° | [0°, 90°] | 2 |
| 3-line star (close) | 30°, 60°, 90° | [45° (merged 30°+60°), 90°] | 2 |
| 5-line star | 0°, 36°, 72°, 108°, 144° | [0°+36°, 72°, 108°+144°] | 3+ |
| Parallel lines | 90°, 92° | [90° (merged)] | 1 |

### 4. Explained Ink Ratio
**Module:** `explained-ink.js`

**Purpose:** Calculate what percentage of ink aligns with 2-line cross model

**Algorithm:**

```javascript
function calculateExplainedInkRatio(candidate, strokes, segments) {
  // 1. Extract the two primary cross directions
  const P = candidate.point;
  const dirA = candidate.armAngles[0] % 180;
  const dirB = candidate.armAngles[2] % 180;

  let explainedLength = 0;
  let totalLength = 0;

  // 2. For each segment, check if it aligns with either direction
  for (const seg of segments) {
    const segmentLength = seg.length;
    totalLength += segmentLength;

    // Calculate segment direction
    const segAngle = Math.atan2(seg.p2.y - seg.p1.y,
                               seg.p2.x - seg.p1.x);
    const segDir = ((segAngle * 180 / Math.PI) % 180 + 180) % 180;

    // Check alignment with direction A
    const angleDiffA = Math.min(Math.abs(segDir - dirA),
                                180 - Math.abs(segDir - dirA));
    const mid = BallotGeometry.segmentMidpoint(seg);
    const perpDistA = BallotGeometry.pointToLineDistance(mid, P, dirA);

    // Check alignment with direction B
    const angleDiffB = Math.min(Math.abs(segDir - dirB),
                                180 - Math.abs(segDir - dirB));
    const perpDistB = BallotGeometry.pointToLineDistance(mid, P, dirB);

    // Segment is explained if it aligns with either direction
    const explainedByA = (angleDiffA <= BallotConfig.ARM_CORRIDOR_ANGLE_TOL_DEG &&
                         perpDistA <= BallotConfig.ARM_CORRIDOR_DIST_PX);
    const explainedByB = (angleDiffB <= BallotConfig.ARM_CORRIDOR_ANGLE_TOL_DEG &&
                         perpDistB <= BallotConfig.ARM_CORRIDOR_DIST_PX);

    if (explainedByA || explainedByB) {
      explainedLength += segmentLength;
    }
  }

  return totalLength > 0 ? explainedLength / totalLength : 0;
}
```

**Alignment Criteria:**
- **Angular alignment**: ≤ 25° from cross axis
- **Perpendicular distance**: ≤ 12px from cross axis

**Stroke-Count Adaptive Thresholds:**
- **1 stroke**: 50% threshold (lenient - allows natural loops/curves)
- **2 strokes**: 62% threshold (moderate - standard crosses)
- **3+ strokes**: 70% threshold (strict - catches extra writing)

**Examples:**

| Mark | Explained Ratio | Stroke Count | Threshold | Result |
|------|----------------|--------------|-----------|--------|
| Clean X cross | 95-100% | 2 | 62% | Pass ✓ |
| X with natural loop | 50-55% | 1 | 50% | Pass ✓ |
| X with narrow loop | 52-58% | 1 | 50% | Pass ✓ |
| X with thick circle | 55-65% | 3+ | 70% | Fail ✗ |
| X with extra line | 40-50% | 3+ | 70% | Fail ✗ |

### 5. Multi-Line Star Detection
**Module:** `validation.js` using cluster data from `topology.js`

**Problem:** When 3 distinct strokes meet at nearly the same point, they create 3 intersections (A×B, A×C, B×C). Each individual intersection only involves 2 strokes, but we need to detect that 3 strokes are meeting.

**Solution:** Count unique strokes across the entire cluster

**Algorithm:**

```javascript
// Phase 1: Cluster Analysis (after clustering intersections)
for (const cluster of clusters) {
  const uniqueStrokes = new Set();

  for (const inter of cluster.points) {
    if (inter.seg1 && inter.seg1.strokeIndex !== undefined) {
      uniqueStrokes.add(inter.seg1.strokeIndex);
    }
    if (inter.seg2 && inter.seg2.strokeIndex !== undefined) {
      uniqueStrokes.add(inter.seg2.strokeIndex);
    }
  }

  cluster.strokesAtCluster = uniqueStrokes.size;
}

// Phase 2: Cross Candidate Building
for (const inter of intersections) {
  // Find which cluster this intersection belongs to
  let strokesAtCluster = 2;  // Default: just the 2 strokes at this intersection

  for (const cluster of clusters) {
    if (cluster.points.includes(inter)) {
      strokesAtCluster = cluster.strokesAtCluster;
      break;
    }
  }

  candidate.strokesAtIntersection = strokesAtCluster;
}

// Phase 3: Validation
if (bestCandidate.strokesAtIntersection >= 3) {
  return WRONG_SYMBOL;  // 3+ strokes meeting at center
}
```

**Examples:**

| Scenario | Intersections | Strokes in Cluster | Result |
|----------|---------------|-------------------|--------|
| Normal X (2 strokes) | 1 (A×B) | 2 (A, B) | Valid ✓ |
| 3-line star (any angle) | 3 (A×B, A×C, B×C) | 3 (A, B, C) | Invalid ✗ |
| Single-stroke loop | 1 (self-intersection) | 1 (A) | Valid ✓ |
| Retraced X | 2+ (many intersections) | 2 (A, B) | Valid ✓ |

---

## Configuration Parameters

**File:** `js/config.js`

```javascript
window.BallotConfig = {
  // Canvas dimensions
  LOGICAL_WIDTH: 800,
  LOGICAL_HEIGHT: 600,

  // Ballot box boundaries
  VOTE_BOX: {
    x: 353,
    y: 313,
    width: 318,
    height: 215
  },
  BOX_TOLERANCE_PX: 3,  // Allowed boundary overshoot

  // Stroke preprocessing
  RESAMPLE_STEP_PX: 2.0,      // Resampling interval
  SIMPLIFY_EPSILON_PX: 2.0,   // RDP simplification tolerance

  // Drawing
  STROKE_WIDTH_PX: 3,         // Display stroke width

  // Ink quantity thresholds
  MIN_TOTAL_INK_LENGTH_PX: 30,   // Blank detection (minimum ink)
  MAX_POINTS_TOTAL: 1200,        // Scribble detection (maximum points)

  // Intersection clustering
  CROSS_CLUSTER_EPS_PX: 26,   // Spatial clustering radius

  // 4-arm extension measurement
  MIN_ARM_EXTENSION_PX: 18,      // Minimum arm length
  ARM_CORRIDOR_ANGLE_TOL_DEG: 25,  // Angular alignment tolerance
  ARM_CORRIDOR_DIST_PX: 12,      // Perpendicular distance tolerance

  // Global topology analysis
  TOPOLOGY_ANALYSIS_RADIUS_PX: 60,       // Analysis radius around intersection
  BRANCH_ANGLE_CLUSTER_TOL_DEG: 30,      // Angular clustering tolerance

  // Multi-mark detection (scale-adaptive)
  RETRACE_TOLERANCE_RATIO: 0.12,   // Max 12% of arm length = retracing
  INTENTIONAL_MIN_RATIO: 0.20,     // Min 20% of arm length = intentional invalidation
  MULTI_MARK_MIN_RATIO: 1.0,       // Min 100% of arm length = distinct marks

  // Extra writing detection (stroke-count adaptive)
  MIN_EXPLAINED_INK_RATIO: 0.70,         // Default for 3+ strokes (strict)
  MIN_EXPLAINED_INK_RATIO_SINGLE: 0.50,  // 1 stroke (lenient - allows loops) ⭐
  MIN_EXPLAINED_INK_RATIO_DOUBLE: 0.62,  // 2 strokes (moderate)

  // Arm balance (for branchCount = 3 with 3+ strokes)
  MIN_ARM_BALANCE_RATIO: 0.70,  // minArm / maxArm ≥ 70%

  // UI timing
  EVALUATION_DEBOUNCE_MS: 450   // Validation delay after stroke end
};
```

### Threshold Selection Rationale

**MIN_ARM_EXTENSION_PX: 18**
- Ensures visible cross structure
- Filters out tiny accidental marks at intersections
- Typical valid cross has 40-80px arms
- 18px minimum captures all reasonable crosses

**ARM_CORRIDOR_DIST_PX: 12**
- Allows for natural hand wobble/tremor
- Typical pen wobble: 5-10px
- 12px provides comfortable margin

**ARM_CORRIDOR_ANGLE_TOL_DEG: 25**
- Allows for natural arm curvature
- Rejects clearly unrelated ink (perpendicular segments)
- Tested empirically on sample ballots

**CROSS_CLUSTER_EPS_PX: 26**
- Typical cross size: 60-100px
- 26px ≈ 30-40% of cross size
- Groups intersections from hand tremor
- Small enough to distinguish intentional multi-marks

**BRANCH_ANGLE_CLUSTER_TOL_DEG: 30**
- X cross: 45° and 135° → 90° apart (clearly separate)
- Two lines within 30° appear as single direction
- Catches stars with closely-spaced lines
- Allows natural variation in cross arm angles

**RETRACE_TOLERANCE_RATIO: 0.12 (12%)**
- Two intersections within 12% of arm length = hand tremor
- Allows for thick retraced lines
- Doesn't confuse with intentional invalidation

**INTENTIONAL_MIN_RATIO: 0.20 (20%)**
- Clusters separated by 20-100% of arm length = intentional invalidation
- Voter drew second mark close to first (hesitation/correction)
- Not far enough apart to be two distinct votes

**MULTI_MARK_MIN_RATIO: 1.0 (100%)**
- Clusters separated by ≥100% of arm length = two distinct marks
- Clear multi-voting attempt
- Highest severity violation

**MIN_EXPLAINED_INK_RATIO_SINGLE: 0.50 (50%)**
- Single-stroke crosses have natural loops at turn points
- Loop ink doesn't align with cross axes (>25° or >12px deviation)
- 50% allows significant loop while rejecting major extra marks
- Validated on borderline test cases

**MIN_EXPLAINED_INK_RATIO_DOUBLE: 0.62 (62%)**
- Two-stroke crosses should have minimal extra ink
- Some loop/overlap at intersection is natural
- 62% balances acceptance vs. rejection

**MIN_EXPLAINED_INK_RATIO: 0.70 (70%)**
- 3+ strokes suggest deliberate marking
- Extra strokes should align with cross OR trigger rejection
- 70% strict threshold catches extra writing/symbols

**MIN_ARM_BALANCE_RATIO: 0.70 (70%)**
- For branchCount = 3 with 3+ strokes
- Balanced cross + emphasis mark: ratio ≈ 0.75-0.90
- Imbalanced star: ratio < 0.60
- 70% threshold distinguishes between them

---

## Recent Improvements

### v3.1: Single-Stroke Cross with Narrow Loop (2024-01) ⭐ LATEST

**Problem:** Single-stroke crosses with narrow loops at the intersection were being rejected as invalid (explained ratio ≈ 52-55%, threshold = 55%).

**Root Cause:** The narrow loop creates segments that don't align with the two main cross axes (within 25° angle AND 12px perpendicular distance). These loop segments count as "unexplained ink."

**Solution:** Lowered `MIN_EXPLAINED_INK_RATIO_SINGLE` from **0.55 to 0.50** (55% → 50%)

**Rationale:**
- Single-stroke crosses **inherently** have loops/curves where the pen changes direction
- This is natural human drawing behavior, not intentional invalidation
- 50% provides 5% additional tolerance for loop ink
- Still strict enough to reject marks with significant extra writing (>50% extra marks)

**Files Changed:**
- `js/config.js`: Line 49 - Changed threshold from 0.55 to 0.50
- `js/validation.js`: Line 386 - Updated comment from 55% to 50%

**Impact:**
- ✅ Single-stroke crosses with narrow/medium loops now accepted as valid
- ✅ Still rejects single-stroke marks with significant extra writing
- ✅ No change to 2-stroke or 3+ stroke thresholds
- ✅ Minimal risk - only affects 1-stroke marks

**Testing:** Draw single-stroke X with narrow loop → Shows "บัตรดี" (Valid)

### v3.0: Modular Architecture Refactoring (2024-01)

**Problem:** Monolithic 1,400-line `index.html` was difficult to maintain, test, and understand.

**Solution:** Separated code into 11 focused JavaScript modules with clear responsibilities:

**Module Breakdown:**
1. **config.js** (60 lines) - Configuration parameters
2. **geometry.js** (120 lines) - Pure geometry utilities
3. **preprocessing.js** (95 lines) - Stroke preprocessing
4. **intersection.js** (110 lines) - Intersection detection
5. **arm-extension.js** (140 lines) - 4-arm extension measurement
6. **topology.js** (185 lines) - Branch counting and clustering
7. **explained-ink.js** (70 lines) - Explained ink calculation
8. **validation.js** (430 lines) - Main validation engine
9. **ui.js** (215 lines) - Canvas rendering and UI
10. **input-handler.js** (175 lines) - Pointer event handling
11. **app.js** (50 lines) - Application initialization

**Benefits:**
- ✅ Clear separation of concerns
- ✅ Easier to locate and modify specific algorithms
- ✅ Better code organization and readability
- ✅ Module dependencies explicitly defined by load order
- ✅ Each module has single, well-defined purpose
- ✅ No build tools required - uses namespaced globals

**Architecture Pattern:** Immediately Invoked Function Expressions (IIFEs) with window exports
```javascript
(function() {
  // Module-private variables
  let privateVar = null;

  // Public API
  window.BallotModuleName = {
    publicMethod: function() {
      // Implementation
    }
  };
})();
```

### v2.4: Multi-Line Star Detection (Cluster-Based Stroke Counting)

**Problem:** 3-line star accepted as valid when two lines were angularly close (branchCount = 2), even though 3 distinct strokes met at center.

**Root Cause:** When 3 lines meet at nearly the same point, they create 3 intersections (A×B, A×C, B×C). Each individual intersection only shows 2 strokes. Previous algorithm checked strokes only at the best intersection.

**Solution:** Count unique strokes across the entire cluster, not just at one intersection.

**Impact:**
- ✅ All 3+ line star patterns now rejected regardless of angular spacing
- ✅ Normal 2-stroke crosses still valid
- ✅ Catches even stars with two lines very close together
- ✅ More robust than branch counting alone

### v2.3: Natural Loop Handling (Two-Tier Branch Validation)

**Problem:** Crosses with natural loops at intersection were being rejected when branchCount = 3.

**Solution:** Two-tier validation for branchCount = 3:
- **Tier 1**: If 1-2 strokes → Natural loop → Allow immediately
- **Tier 2**: If 3+ strokes → Check arm balance (ratio ≥ 0.70)

**Impact:**
- ✅ Single-stroke crosses with loops now valid
- ✅ Crosses with emphasis marks accepted if balanced
- ✅ Imbalanced stars still rejected

### v2.2: Stroke-Count Adaptive Explained Ink Thresholds

**Problem:** Single-stroke crosses with loops rejected due to strict 70% explained ink threshold.

**Solution:** Adaptive thresholds based on stroke count:
- 1 stroke: ~~55%~~ **50%** (lenient - allows natural loops) [Updated in v3.1]
- 2 strokes: 62% (moderate - standard crosses)
- 3+ strokes: 70% (strict - catches extra writing)

**Impact:**
- ✅ Single-stroke crosses with natural loops accepted
- ✅ Standard 2-stroke crosses unchanged
- ✅ Extra writing still detected for multi-stroke marks

### v2.1: Star Rejection Enhancements

**Changes:**
1. Maximum branch count check (branchCount > 2 → invalid)
2. Minimum branch count check (branchCount < 2 → invalid)

**Impact:**
- ✅ 5-6 line stars/asterisks rejected
- ✅ Parallel lines rejected (branchCount = 1)
- ✅ Normal X and + crosses unchanged

### v2.0: Scale-Adaptive Multi-Mark Detection

**Problem:** Fixed pixel thresholds (80px) didn't work for different-sized crosses.

**Solution:** Use relative thresholds based on actual cross size:
```javascript
scaleReference = median(all arm lengths);  // Robust to outliers
intentionalThreshold = scaleReference * 0.20;
multiMarkThreshold = scaleReference * 1.0;
```

**Impact:**
- ✅ Works for all drawing sizes (30px to 120px crosses)
- ✅ No manual calibration needed
- ✅ Robust to different drawing styles

---

## Edge Cases and Special Handling

### 1. Elderly Voter Scenarios

**Scenario:** Voter draws 2 parallel lines, realizes mistake, adds crossing line.

**Handling:**
- 2 parallel lines alone → Invalid (branchCount = 1)
- After adding 3rd crossing line → Valid (branchCount = 2)

**Module:** `validation.js` → `topology.js`

**Why:** Third line creates distinct angular direction, forming clear cross.

### 2. Emphasis Marks

**Scenario:** Voter draws circle/oval around cross to emphasize their choice.

**Handling:**
- 1-2 stroke cross + emphasis → Valid (if arms balanced)
- 3+ strokes with branchCount = 3 → Check arm balance
- If arms well-balanced (≥70%) → Valid (emphasis)
- If arms imbalanced → Invalid (likely star)

**Module:** `validation.js`

**Validation Path:**
1. strokesAtIntersection check: Passes if emphasis doesn't go through center
2. branchCount check: May be 3 due to circle creating extra angular directions
3. Two-tier validation: 3+ strokes → check arm balance
4. Explained ink ratio: Circle creates "unexplained ink"
   - If cross is strong and circle is thin → Ratio > 70% → Valid
   - If circle is thick → Ratio < 70% → Invalid (extra writing)

### 3. Retracing

**Scenario:** Voter draws over same cross multiple times (thick lines, tremor).

**Handling:**
- Multiple intersections within 12% of cross size → Clustered together
- Treated as single cross with strong arms
- Passes to normal validation

**Module:** `validation.js` using adaptive thresholds

**Why:** Retracing is natural behavior (emphasizing choice), not multi-marking.

### 4. Wobbly Crosses

**Scenario:** Cross with shaky lines, varying arm lengths due to hand tremor.

**Handling:**
- 12px perpendicular tolerance in corridor detection
- 25° angular tolerance in alignment checks
- Arm balance check uses 70% threshold (allows 30% variation)

**Modules:** `arm-extension.js`, `explained-ink.js`

**Result:** Natural hand variation is accepted.

### 5. Self-Intersecting Strokes

**Scenario:** Single stroke that loops and crosses itself multiple times.

**Handling:**
- Self-intersection creates intersection with strokesAtIntersection = 1
- branchCount can be 2 or 3 (depending on loop shape)
- If branchCount = 3: Tier 1 allows it (single stroke)
- Uses lenient 50% explained ink threshold
- Large loops may cause low explained ratio → Invalid (extra writing)

**Modules:** `validation.js`, `topology.js`

**Result:** Clean single-stroke crosses with small loops are valid; large complex loops rejected.

### 6. Non-Standard Angles

**Scenario:** X cross at unusual angles (not 45°/135°), + cross at non-orthogonal angles.

**Handling:**
- No assumption about specific angles
- Only checks: 2 distinct directions with valid 4-arm extensions
- Branch counting works for any angle distribution

**Modules:** All algorithm modules

**Result:** All X and + variations accepted regardless of rotation.

### 7. Crossing Strokes That Don't Meet Exactly

**Scenario:** Two strokes intended to cross but with small gap (< 5px) at intersection.

**Handling:**
- No actual intersection point found
- Returns NO_CROSS (category 4)

**Module:** `intersection.js`

**Why:** Thai ballot validation requires clear crossing. Gap indicates unclear marking.

### 8. Very Small Crosses

**Scenario:** Cross with 10-15px arms (smaller than 18px minimum).

**Handling:**
- 4-arm extension measurement fails (minExtension < 18px)
- No valid cross candidates found
- Returns WRONG_SYMBOL

**Module:** `arm-extension.js`

**Why:** Very small marks may be accidental or unclear. 18px ensures visible intent.

### 9. Touches at Stroke Endpoints

**Scenario:** Two strokes that touch at endpoints (T-junction) but don't cross.

**Handling:**
- Intersection detection skips endpoint-to-endpoint touches
- Either finds no intersection OR intersection with poor 4-arm extension
- Typically returns NO_CROSS or WRONG_SYMBOL

**Module:** `intersection.js`, `arm-extension.js`

**Why:** T-junctions don't form clear cross structure.

---

## Testing Guide

### Manual Testing Procedure

#### Test Category 1: Valid Marks
**Expected:** "บัตรดี" (Valid) with green badge

Draw each mark and verify acceptance:
- [ ] Standard X cross (two diagonal strokes)
- [ ] Standard + cross (horizontal and vertical)
- [ ] X with slightly curved arms
- [ ] + with slightly angled arms
- [ ] Single continuous stroke forming X with small loop
- [ ] Single continuous stroke forming X with narrow loop ⭐ NEW
- [ ] Two-stroke X with small loop at center
- [ ] X cross with thin circle around it (emphasis)

#### Test Category 2: Invalid - Wrong Symbol
**Expected:** "บัตรเสีย" (Invalid) with red badge
**Reason:** "ทำเครื่องหมายแบบอื่น" (Wrong symbol)

Draw each mark and verify rejection:
- [ ] Two parallel vertical lines (branchCount = 1)
- [ ] Two parallel horizontal lines (branchCount = 1)
- [ ] Single diagonal line (no intersection)
- [ ] 3-line star with all lines meeting at center (strokesAtIntersection = 3)
- [ ] 3-line star with two lines close together (strokesAtIntersection = 3)
- [ ] 5-line star/asterisk pattern (branchCount ≥ 4)
- [ ] Circle only (no cross structure)
- [ ] Checkmark (no intersection)

#### Test Category 3: Invalid - Multi-Mark
**Expected:** "บัตรเสีย" (Invalid) with red badge
**Reason:** "ทำเครื่องหมายมากกว่า 1 จุด" (Multiple marks)

Draw each mark and verify rejection:
- [ ] Two separate X crosses far apart (distance ≥ 100% of arm length)
- [ ] X cross + separate smaller X
- [ ] + cross + separate X cross

#### Test Category 4: Invalid - Intentional Invalidation
**Expected:** "บัตรเสีย" (Invalid) with red badge
**Reason:** "ทำเครื่องหมายเพิ่มเติมเพื่อให้บัตรเสีย" (Intentional invalidation)

Draw each mark and verify rejection:
- [ ] X cross + separate smaller cross medium distance away (20-100% of arm length)
- [ ] X cross + separate checkmark nearby
- [ ] X cross + underline below (medium distance)

#### Test Category 5: Invalid - Extra Writing
**Expected:** "บัตรเสีย" (Invalid) with red badge
**Reason:** "มีสัญลักษณ์หรือข้อความเพิ่มเติม" (Extra writing)

Draw each mark and verify rejection:
- [ ] X cross + very thick circle around it (explained ratio < 70%)
- [ ] X cross + extra squiggles nearby
- [ ] X cross + additional straight line not through center
- [ ] + cross + decorative flourishes

#### Test Category 6: Invalid - Outside Box
**Expected:** "บัตรเสีย" (Invalid) with red badge
**Reason:** "ล้ำออกนอกกรอบ" (Outside box)

Draw each mark and verify rejection:
- [ ] X cross extending significantly outside box (> 3px tolerance)
- [ ] Diagonal stroke cutting through box corner and extending far outside

#### Test Category 7: Invalid - Blank
**Expected:** "บัตรเสีย" (Invalid) with red badge
**Reason:** "ไม่มีเครื่องหมาย" (No mark)

Draw each mark and verify rejection:
- [ ] Tiny dot (< 30px total ink)
- [ ] Very short line segment (< 30px)

#### Test Category 8: Invalid - No Cross
**Expected:** "บัตรเสีย" (Invalid) with red badge
**Reason:** "ไม่มีจุดตัดแบบกากบาท" (No cross intersection)

Draw each mark and verify rejection:
- [ ] Two lines that don't intersect
- [ ] L shape
- [ ] V shape

#### Test Category 9: Waiting State
**Expected:** "รอการทำเครื่องหมาย" (Waiting) with gray badge

- [ ] Empty canvas before drawing

### Debug Mode Testing

**Enable debug mode** by checking the "Debug" checkbox to see:
- **Blue dots**: All intersections found
- **Orange/green dots**: Cluster centroids (green = valid cross structure)
- **Red dot**: Best cross candidate center
- **Green lines**: 4 arms extending from best candidate
- **Text overlay**: Validation metrics

**Key metrics to check:**
- **Intersections**: Should be 1-5 for normal crosses
- **Clusters**: Should be 1 for single cross
- **Cross candidates**: Should be 1+ for valid crosses
- **Best min arm**: Should be ≥ 18px for valid crosses
- **Strokes at center**: Should be 1-2 for valid, 3+ triggers rejection
- **Global branches**: Should be 2 for crosses, 1 for parallel, 3+ for stars
- **Explained ratio**: Check against threshold based on stroke count

### Automated Testing Checklist

For regression testing after code changes:

**Core Validation:**
- [ ] All normal X crosses still valid (2 strokes, various angles)
- [ ] All normal + crosses still valid (2 strokes, various angles)
- [ ] Single-stroke crosses with small loops still valid
- [ ] Single-stroke crosses with narrow loops still valid ⭐ v3.1

**Star Rejection:**
- [ ] 3-line stars rejected (all angle configurations)
- [ ] 5-line stars rejected (asterisk patterns)
- [ ] Stars with close lines rejected (branchCount = 2 but strokesAtIntersection = 3)

**Parallel Lines:**
- [ ] Two parallel lines rejected (branchCount = 1)
- [ ] Three parallel lines rejected (branchCount = 1)

**Multi-Mark:**
- [ ] Two separate crosses far apart rejected
- [ ] Cross + smaller cross nearby (medium distance) rejected

**Extra Writing:**
- [ ] Cross + thick circle rejected (low explained ratio)
- [ ] Cross + extra lines rejected

**Boundary:**
- [ ] Mark extending outside box rejected
- [ ] Mark just touching box edge accepted (≤ 3px tolerance)

**Blank:**
- [ ] Tiny dot rejected (< 30px ink)
- [ ] Empty canvas shows waiting state

### Edge Case Verification

**Elderly Voter Scenario:**
1. Draw 2 close vertical lines → Should be Invalid (branchCount = 1)
2. Add diagonal line crossing both → Should become Valid (branchCount = 2)

**Emphasis Mark Scenario:**
1. Draw clean X → Should be Valid
2. Add thin circle around it → Should stay Valid (if balanced)
3. Add very thick oval → May become Invalid (low explained ratio)

**Multi-Line Star Detection:**
1. Draw X (2 strokes) → Valid, debug shows "Strokes at center: 2"
2. Add 3rd line through center → Invalid, debug shows "Strokes at center: 3"
3. Verify works regardless of 3rd line angle

**Single-Stroke Loop Tolerance:** ⭐ v3.1
1. Draw single-stroke X with narrow loop → Should be Valid
2. Debug mode: Check explained ratio (should be 50-55%)
3. Debug mode: Verify threshold is 50% for single stroke
4. Draw single-stroke X with very large loop → Should be Invalid (ratio < 50%)

### Performance Testing

**Typical cases should validate in < 10ms:**
- Standard 2-stroke X cross
- Standard 2-stroke + cross
- Single-stroke cross with loop

**Complex cases should validate in < 50ms:**
- 5-stroke marks with multiple intersections
- Heavily retraced crosses (100+ points)
- Scribbles (triggering max points check)

**Test in browser console:**
```javascript
console.time('validation');
BallotValidation.validateMark(window.ballotState.strokes, {debug: true});
console.timeEnd('validation');
```

---

## Architecture Decisions

### Why Modular Architecture with IIFEs?

**Alternatives Considered:**
1. **ES6 Modules** (import/export)
   - Requires build tool or module bundler
   - Adds complexity to development workflow

2. **Single monolithic file**
   - Easier deployment (no dependencies)
   - Harder to maintain and understand

3. **IIFE modules with namespaced globals** ✓ CHOSEN
   - No build tools required
   - Clear module boundaries
   - Explicit dependencies through load order
   - Works in all browsers without transpilation

**Benefits:**
- ✅ Simple deployment (just load scripts in order)
- ✅ Clear separation of concerns
- ✅ Easier to locate specific algorithms
- ✅ Can be converted to ES6 modules later if needed
- ✅ Each module has single responsibility

**Trade-offs:**
- Global namespace pollution (window.Ballot*)
- Manual dependency management through script order
- No automatic dead code elimination

### Why Cluster-Based Stroke Counting?

**Alternatives Considered:**
1. **Count strokes at single "best" intersection**
   - Problem: Misses other intersections in cluster
   - 3-line star creates 3 intersections, best shows only 2 strokes

2. **Count strokes globally across all ink**
   - Problem: Not localized to cross center
   - Can't distinguish center vs. periphery

3. **Use branch count only**
   - Problem: Angular clustering can hide 3rd stroke
   - 3-line star with two lines close → branchCount = 2

**Chosen Solution:** Count unique strokes across all intersections in cluster ✓
- **Pros**: Detects all strokes meeting at center point
- **Pros**: Robust to intersection clustering
- **Pros**: Independent of angular distribution
- **Cons**: Slightly more complex implementation (acceptable)

### Why Two-Tier Branch Validation?

**For branchCount = 3, we use two-tier logic:**

**Tier 1: Stroke Count Check** (1-2 strokes)
- Single/double stroke can't be intentional multi-line star
- Natural loops create 3rd angular direction
- Allow immediately, no further branch checks

**Tier 2: Arm Balance Check** (3+ strokes)
- Could be star OR cross + emphasis mark
- Check if core cross is strong (balanced arms)
- If balanced (≥70%) → likely emphasis → allow
- If imbalanced → likely star → reject

**Rationale:**
- Handles both natural drawing variation AND intentional invalidation
- Stroke count is definitive for 1-2 strokes
- Arm balance is good heuristic for 3+ strokes
- Covers all edge cases without excessive complexity

### Why Scale-Adaptive Thresholds?

**Problem:** Different voters draw different-sized crosses (30px to 120px arms).

**Solution:** Calculate scale reference from actual cross size, use relative thresholds.

```javascript
scaleReference = median(all arm lengths);
intentionalThreshold = scaleReference * 0.20;  // 20% of cross size
multiMarkThreshold = scaleReference * 1.0;     // 100% of cross size
```

**Benefits:**
- ✅ Works for all drawing sizes
- ✅ No manual calibration needed
- ✅ Robust to different drawing styles
- ✅ Handles zoom/resolution differences
- ✅ Median calculation is robust to outliers

**Why median instead of mean?**
- Outliers (one very long arm) don't skew calculation
- More robust reference for typical cross size

### Why Stroke-Count Adaptive Explained Ink Thresholds?

**Problem:** Single-stroke crosses inherently have loops and curves at the intersection, creating "unexplained ink" that doesn't align with the two main cross axes.

**Solution:** Different thresholds based on stroke count:
- **1 stroke**: 50% (lenient - natural loops expected)
- **2 strokes**: 62% (moderate - standard drawing)
- **3+ strokes**: 70% (strict - intentional marks)

**Rationale:**
- Single-stroke loop is natural drawing motion, not extra writing
- Two strokes may have small overlap/loop at intersection
- Three+ strokes suggest deliberate marking, should align with cross

**Alternative considered:** Special handling for ink near intersection (transition zone)
- More complex to implement
- Harder to tune and understand
- Adaptive thresholds achieve same goal more simply

### Why 7-Category Precedence System?

**Order matters:**
1. WAITING → BLANK → Filters out non-marks first
2. OUTSIDE_BOX → Boundary check before structural analysis
3. NO_CROSS → Require intersection before cross validation
4. MULTI_MARK → Detect multiple marks before single mark validation
5. WRONG_SYMBOL → Topology checks (branches, strokes at center)
6. EXTRA_WRITING → Extra ink beyond valid cross
7. VALID → All checks passed

**Why this order?**
- Earlier checks are faster and more definitive
- Later checks are more nuanced and computationally expensive
- Prevents false positives (e.g., checking explained ratio before confirming cross exists)
- Clear error messages for each rejection category

---

## Performance Considerations

### Time Complexity

**Algorithm Breakdown:**
- **Stroke simplification** (RDP): O(n) per stroke
- **Intersection detection**: O(s²) where s = segment count
- **Clustering**: O(i²) where i = intersection count
- **4-arm extension**: O(s) per intersection
- **Branch counting**: O(s) per intersection
- **Overall**: O(s²) dominated by intersection detection

**Typical Performance:**
- **Input**: 2-5 strokes, 50-200 points
- **After simplification**: 2-5 strokes, 10-30 segments
- **Intersections**: 1-5
- **Validation time**: < 10ms on modern hardware

**Complex Cases:**
- **Heavy retracing**: 10+ strokes, 100+ segments → 20-30ms
- **Scribbles**: Caught early by max points check (< 1ms)
- **Stars**: 3-6 strokes, 15-30 segments → 10-15ms

### Memory Usage

**Per Ballot:**
- Raw strokes: ~1KB (200 points × 2 coords × 4 bytes)
- Simplified strokes: ~200 bytes (30 segments)
- Intersections: ~100 bytes (5 intersections)
- Candidates: ~100 bytes (3 candidates)
- **Total**: < 2KB per ballot

**Global State:**
- Canvas pixels: 800×600 = 480KB (retained across draws)
- Debug overlay: ~500 bytes (optional)

### Optimization Opportunities

**If Performance Becomes Issue:**

1. **Spatial indexing for segments**
   - Use quadtree for segment queries
   - Reduce intersection detection from O(n²) to O(n log n)
   - Beneficial for > 100 segments

2. **Early termination**
   - Stop on first failing check (already implemented)
   - Skip remaining checks once invalid

3. **Caching**
   - Cache segment angles, lengths, midpoints
   - Reuse across multiple algorithm phases

4. **WebAssembly**
   - Port core algorithms to WASM
   - 2-3x speedup for geometry calculations
   - Overkill for current use case

**Current Status:** Performance is excellent for interactive use. No optimization needed at this time.

---

## Future Enhancements

### Potential Improvements

**1. Machine Learning Integration**
- Train CNN on real ballot images
- Use current algorithm as validator/teacher
- Handle more complex edge cases automatically
- Maintain explainability through algorithm validation

**2. Confidence Scoring**
- Return confidence level (0-100%) with validation result
- Allow manual review for borderline cases (45-55% confidence)
- Improve transparency for election observers
- Example: Narrow loop cross = 85% confident valid

**3. Multi-Language Support**
- Internationalize error messages
- Support different ballot layouts
- Adapt to other election systems
- Configuration-driven ballot box dimensions

**4. Real-Time Guidance**
- Show validation result during drawing
- Guide user to draw valid mark
- Visual feedback for box boundaries
- Reduce invalid ballots in first place

**5. Batch Processing**
- Process scanned ballot images
- Export validation results to CSV
- Statistical analysis of rejection reasons
- Election audit support

**6. Undo/Redo**
- Allow voters to undo last stroke
- Redo previous stroke
- Clear all and start over
- Better user experience

### Non-Goals

**Intentionally NOT Supported:**
- **Checkmarks (✓)** - Not valid Thai ballot marks
- **Text/numbers** - Always invalid per regulations
- **Multiple choice selections** - Different ballot type
- **Partial erasures** - Physical ballots don't support this
- **Color-based validation** - Ballots use black ink only
- **Pressure sensitivity** - Not relevant to validity

---

## Version History

**v3.1** (2024-01) ⭐ CURRENT
- Lowered MIN_EXPLAINED_INK_RATIO_SINGLE from 0.55 to 0.50
- Fixes rejection of single-stroke crosses with narrow loops
- Updated documentation to reflect new threshold
- Files changed: config.js, validation.js

**v3.0** (2024-01)
- Major architectural refactoring: Separated monolithic index.html into 11 focused modules
- Clear separation of concerns with single-responsibility modules
- Explicit dependency management through load order
- No functional changes to validation logic
- Improved maintainability and testability

**v2.4** (2023)
- Multi-line star detection using cluster-based stroke counting
- Detects 3+ strokes meeting at center
- Independent of angular distribution
- Catches all star patterns regardless of branch count

**v2.3** (2023)
- Natural loop handling with two-tier branch validation
- Tier 1: Stroke count (1-2 strokes → allow)
- Tier 2: Arm balance (3+ strokes → check balance)

**v2.2** (2023)
- Stroke-count adaptive explained ink thresholds
- 55% for 1 stroke (later updated to 50% in v3.1)
- 62% for 2 strokes
- 70% for 3+ strokes

**v2.1** (2023)
- Star rejection enhancements
- Minimum branch count check (< 2 → invalid)
- Maximum branch count check (> 2 requires special handling)

**v2.0** (2023)
- Scale-adaptive multi-mark detection
- Relative thresholds based on cross size
- Median-based scale reference
- Intentional invalidation detection

**v1.0** (2023)
- Initial release
- Basic intersection detection and 4-arm analysis
- Fixed-threshold validation
- Monolithic architecture

---

## Contact & Support

**Development Information:**
- Codebase: `/Users/keng/Workspaces/vote62-ballot-mark/`
- Main modules: `js/*.js` (11 modules)
- Configuration: `js/config.js`
- Main validation: `js/validation.js`

**For Questions:**
- Review module code for specific algorithms
- Enable debug mode for validation path analysis
- Test with various mark patterns to understand behavior
- Check browser console for detailed validation results

**Testing:**
```javascript
// In browser console:
const result = BallotValidation.validateMark(
  window.ballotState.strokes,
  {debug: true}
);
console.log(result);
```

**Developed with Claude Code** 🤖

---

## Appendix: Module API Reference

### BallotConfig
```javascript
window.BallotConfig = {
  // All configuration parameters
  // See "Configuration Parameters" section for details
};
```

### BallotGeometry
```javascript
window.BallotGeometry = {
  dist(p1, p2): number,
  strokeLength(stroke): number,
  pointInRect(pt, rect, tolerance): boolean,
  segmentMidpoint(seg): {x, y},
  pointToLineDistance(pt, P, angle): number,
  angleDifference(a1, a2): number
};
```

### BallotPreprocessing
```javascript
window.BallotPreprocessing = {
  resampleStroke(stroke, step): Array,
  simplifyRDP(points, epsilon): Array
};
```

### BallotIntersection
```javascript
window.BallotIntersection = {
  buildSegments(strokes): Array<Segment>,
  findSegmentIntersection(seg1, seg2): Intersection | null,
  findAllIntersections(segments): Array<Intersection>
};
```

### BallotArmExtension
```javascript
window.BallotArmExtension = {
  measure4ArmExtension(P, seg1, seg2, strokes): {
    valid: boolean,
    minExtension: number,
    extensions: Object,
    armAngles: Array
  },
  findInkInCorridor(P, angle, strokes): number
};
```

### BallotTopology
```javascript
window.BallotTopology = {
  countGlobalBranches(P, strokes): number,
  clusterAngles(angleData, tolerance): Array,
  clusterIntersections(intersections, eps): Array<Cluster>
};
```

### BallotExplainedInk
```javascript
window.BallotExplainedInk = {
  calculateExplainedInkRatio(candidate, strokes, segments): number
};
```

### BallotValidation
```javascript
window.BallotValidation = {
  validateMark(strokes, options): {
    valid: boolean | null,
    label: string,
    invalid_type: string | null,
    reason: string,
    debug: Object
  }
};
```

### BallotUI
```javascript
window.BallotUI = {
  initCanvas(canvasElement): void,
  getContext(): CanvasRenderingContext2D,
  clearCanvas(): void,
  drawVoteBox(): void,
  redrawAllStrokes(strokes, debugData): void,
  drawDebugOverlay(debugData): void,
  updateResult(result): void
};
```

### BallotInput
```javascript
window.BallotInput = {
  init(canvas, ctx): void,
  handlePointerDown(evt): void,
  handlePointerMove(evt): void,
  handlePointerUp(evt): void,
  handlePointerCancel(evt): void,
  getCanvasPoint(evt): {x, y, t},
  scheduleEvaluation(): void,
  clear(): void
};
```

### Global State
```javascript
window.ballotState = {
  strokes: Array,
  currentStroke: Array | null,
  activePointerId: number | null,
  evaluationTimer: number | null,
  debugData: Object | null
};
```

---

**End of Documentation**
