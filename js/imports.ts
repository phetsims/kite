// Copyright 2022-2025, University of Colorado Boulder

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
export { default as intersectConicMatrices } from './util/intersectConicMatrices.js';
export { default as svgPath } from './parser/svgPath.js';

export { default as Segment, Line, Quadratic, Cubic, Arc, EllipticalArc } from './segments/Segment.js';
export type { ClosestToPointResult, PiecewiseLinearOptions, DashValues, SerializedSegment, SerializedLine, SerializedQuadratic, SerializedCubic, SerializedArc, SerializedEllipticalArc } from './segments/Segment.js';

export { default as Subpath } from './util/Subpath.js';
export { default as Shape, Graph } from './Shape.js';
export type { CornerRadiiOptions, SerializedShape, NonlinearTransformedOptions } from './Shape.js';

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