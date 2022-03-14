// Copyright 2022, University of Colorado Boulder

/**
 * Ordered imports that should be loaded IN THIS ORDER, so we can get around circular dependencies for type checking.
 * Recommended as an approach in
 * https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
 *
 * Internally in Scenery, we'll import from this file instead of directly importing, so we'll be able to control the
 * module load order to prevent errors.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

export { default as kite } from './kite.js';

export { default as LineStyles, LINE_STYLE_DEFAULT_OPTIONS } from './util/LineStyles.js';
export type { LineStylesOptions, LineCap, LineJoin } from './util/LineStyles.js';
export { default as Overlap } from './util/Overlap.js';
export { default as RayIntersection } from './util/RayIntersection.js';
export { default as SegmentIntersection } from './util/SegmentIntersection.js';
export { default as svgNumber } from './util/svgNumber.js';
export { default as svgPath } from './parser/svgPath.js';

export { default as Segment } from './segments/Segment.js';
export type { ClosestToPointResult, PiecewiseLinearOptions } from './segments/Segment.js';
export { default as Line } from './segments/Line.js';
export { default as Quadratic } from './segments/Quadratic.js';
export { default as Cubic } from './segments/Cubic.js';
export { default as Arc } from './segments/Arc.js';
export { default as EllipticalArc } from './segments/EllipticalArc.js';

export { default as Subpath } from './util/Subpath.js';
export { default as Shape } from './Shape.js';

export { default as HalfEdge } from './ops/HalfEdge.js';
export { default as Vertex } from './ops/Vertex.js';
export { default as Edge } from './ops/Edge.js';
export { default as Face } from './ops/Face.js';
export { default as Loop } from './ops/Loop.js';
export { default as Boundary } from './ops/Boundary.js';
export { default as BoundsIntersection } from './ops/BoundsIntersection.js';
export { default as SegmentTree } from './ops/SegmentTree.js';
export { default as EdgeSegmentTree } from './ops/EdgeSegmentTree.js';
export { default as VertexSegmentTree } from './ops/VertexSegmentTree.js';
export { default as Graph } from './ops/Graph.js';
