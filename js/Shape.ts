// Copyright 2013-2025, University of Colorado Boulder

/**
 * Shape handling
 *
 * Shapes are internally made up of Subpaths, which contain a series of segments, and are optionally closed.
 * Familiarity with how Canvas handles subpaths is helpful for understanding this code.
 *
 * Canvas spec: http://www.w3.org/TR/2dcontext/
 * SVG spec: http://www.w3.org/TR/SVG/expanded-toc.html
 *           http://www.w3.org/TR/SVG/paths.html#PathData (for paths)
 * Notes for elliptical arcs: http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
 * Notes for painting strokes: https://svgwg.org/svg2-draft/painting.html
 *
 * TODO: add nonzero / evenodd support when browsers support it https://github.com/phetsims/kite/issues/76
 * TODO: docs
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import TinyEmitter from '../../axon/js/TinyEmitter.js';
import Bounds2 from '../../dot/js/Bounds2.js';
import dotRandom from '../../dot/js/dotRandom.js';
import Matrix3 from '../../dot/js/Matrix3.js';
import Ray2 from '../../dot/js/Ray2.js';
import Vector2 from '../../dot/js/Vector2.js';
import optionize, { combineOptions } from '../../phet-core/js/optionize.js';
import Subpath, { SerializedSubpath } from './util/Subpath.js';
import Segment, { Line, Quadratic, Cubic, Arc, EllipticalArc, ClosestToPointResult, PiecewiseLinearOptions } from './segments/Segment.js';
import svgPath from './parser/svgPath.js';
import svgNumber from './util/svgNumber.js';
import RayIntersection from './util/RayIntersection.js';
import LineStyles from './util/LineStyles.js';
import kite from './kite.js';
import Transform3 from '../../dot/js/Transform3.js';
import arrayRemove from '../../phet-core/js/arrayRemove.js';
import cleanArray from '../../phet-core/js/cleanArray.js';
import Boundary, { SerializedBoundary } from './ops/Boundary.js';
import Edge, { SerializedEdge } from './ops/Edge.js';
import EdgeSegmentTree from './ops/EdgeSegmentTree.js';
import Face, { SerializedFace } from './ops/Face.js';
import Loop, { SerializedLoop } from './ops/Loop.js';
import Vertex, { SerializedVertex } from './ops/Vertex.js';
import VertexSegmentTree from './ops/VertexSegmentTree.js';
import type Overlap from './util/Overlap.js';
import type HalfEdge from './ops/HalfEdge.js';
import IntentionalAny from '../../phet-core/js/types/IntentionalAny.js';
import { linear } from '../../dot/js/util/linear.js';


// (We can't get joist's random reference here)
const randomSource = Math.random;

// Convenience function that returns a Vector2, used throughout this file as an abbreviation for a displacement, a
// position or a point.
const v = ( x: number, y: number ) => new Vector2( x, y );

/**
 * The tension parameter controls how smoothly the curve turns through its control points. For a Catmull-Rom curve,
 * the tension is zero. The tension should range from -1 to 1.
 * @param beforeVector
 * @param currentVector
 * @param afterVector
 * @param tension - the tension should range from -1 to 1.
 */
const weightedSplineVector = ( beforeVector: Vector2, currentVector: Vector2, afterVector: Vector2, tension: number ) => {
  return afterVector.copy()
    .subtract( beforeVector )
    .multiplyScalar( ( 1 - tension ) / 6 )
    .add( currentVector );
};

// a normalized vector for non-zero winding checks
// var weirdDir = v( Math.PI, 22 / 7 );

export type SerializedShape = {
  type: 'Shape';
  subpaths: SerializedSubpath[];
};

type CardinalSplineOptions = {
  // the tension parameter controls how smoothly the curve turns through its
  // control points. For a Catmull-Rom curve the tension is zero.
  // the tension should range from  -1 to 1
  tension?: number;

  // is the resulting shape forming a closed line?
  isClosedLineSegments?: boolean;
};

export type NonlinearTransformedOptions = {
  // whether to include a default curveEpsilon (usually off by default)
  includeCurvature?: boolean;
} & PiecewiseLinearOptions;

type GetDashedShapeOptions = {
  // controls level of subdivision by attempting to ensure a maximum (squared) deviation from the curve
  distanceEpsilon?: number;

  // controls level of subdivision by attempting to ensure a maximum curvature change between segments
  curveEpsilon?: number;
};

export type CornerRadiiOptions = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

type OffsetsOptions = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// STATIC API that is used when turning parsed SVG into a Shape. Methods with these types will be called during the
// "apply parsed SVG" step. IF these need to be changed, it will need to be accompanied by changes to svgPath.pegjs
// and the SVG parser. If we change this WITHOUT doing that, things will break (so basically, don't change this).
type CanApplyParsedSVG = {
  moveTo( x: number, y: number ): Shape;
  moveToRelative( x: number, y: number ): Shape;
  lineTo( x: number, y: number ): Shape;
  lineToRelative( x: number, y: number ): Shape;
  close(): Shape;
  horizontalLineTo( x: number ): Shape;
  horizontalLineToRelative( x: number ): Shape;
  verticalLineTo( y: number ): Shape;
  verticalLineToRelative( y: number ): Shape;
  cubicCurveTo( x1: number, y1: number, x2: number, y2: number, x: number, y: number ): Shape;
  cubicCurveToRelative( x1: number, y1: number, x2: number, y2: number, x: number, y: number ): Shape;
  smoothCubicCurveTo( x2: number, y2: number, x: number, y: number ): Shape;
  smoothCubicCurveToRelative( x2: number, y2: number, x: number, y: number ): Shape;
  quadraticCurveTo( x1: number, y1: number, x: number, y: number ): Shape;
  quadraticCurveToRelative( x1: number, y1: number, x: number, y: number ): Shape;
  smoothQuadraticCurveTo( x: number, y: number ): Shape;
  smoothQuadraticCurveToRelative( x: number, y: number ): Shape;
  ellipticalArcTo( rx: number, ry: number, rotation: number, largeArc: boolean, sweep: boolean, x: number, y: number ): Shape;
  ellipticalArcToRelative( rx: number, ry: number, rotation: number, largeArc: boolean, sweep: boolean, x: number, y: number ): Shape;
};

// Type of the parsed SVG item that is returned by the parser (from svgPath.js)
type ParsedSVGItem = {
  // Turn each method into { cmd: 'methodName', args: [ ... ] }
  [K in keyof CanApplyParsedSVG]: CanApplyParsedSVG[ K ] extends ( ...args: infer Args ) => Shape ? { cmd: K; args: Args } : never;
}[ keyof CanApplyParsedSVG ];

class Shape implements CanApplyParsedSVG {

  // Lower-level piecewise mathematical description using segments, also individually immutable
  public readonly subpaths: Subpath[] = [];

  // If non-null, computed bounds for all pieces added so far. Lazily computed with getBounds/bounds ES5 getter
  private _bounds: Bounds2 | null;

  // So we can invalidate all of the points without firing invalidation tons of times
  private _invalidatingPoints = false;

  // When set by makeImmutable(), it indicates this Shape won't be changed from now on, and attempts to change it may
  // result in errors.
  private _immutable = false;

  public readonly invalidatedEmitter: TinyEmitter = new TinyEmitter();

  private readonly _invalidateListener: () => void;

  // For tracking the last quadratic/cubic control point for smooth* functions,
  // see https://github.com/phetsims/kite/issues/38
  private lastQuadraticControlPoint: Vector2 | null = null;
  private lastCubicControlPoint: Vector2 | null = null;

  /**
   * All arguments optional, they are for the copy() method. if used, ensure that 'bounds' is consistent with 'subpaths'
   */
  public constructor( subpaths?: Subpath[] | string, bounds?: Bounds2 ) {

    this._bounds = bounds ? bounds.copy() : null;

    this.resetControlPoints();

    this._invalidateListener = this.invalidate.bind( this );

    // Add in subpaths from the constructor (if applicable)
    if ( typeof subpaths === 'object' ) {
      // assume it's an array
      for ( let i = 0; i < subpaths.length; i++ ) {
        this.addSubpath( subpaths[ i ] );
      }
    }

    if ( subpaths && typeof subpaths !== 'object' ) {
      // parse the SVG path
      _.each( svgPath.parse( subpaths ), ( item: ParsedSVGItem ) => {
        assert && assert( Shape.prototype[ item.cmd ] !== undefined, `method ${item.cmd} from parsed SVG does not exist` );

        // @ts-expect-error - This is a valid call, but TypeScript isn't figuring it out based on the union type right now
        this[ item.cmd ].apply( this, item.args ); // eslint-disable-line prefer-spread
      } );
    }

    // defines _bounds if not already defined (among other things)
    this.invalidate();
  }


  /**
   * Resets the control points
   *
   * for tracking the last quadratic/cubic control point for smooth* functions
   * see https://github.com/phetsims/kite/issues/38
   */
  private resetControlPoints(): void {
    this.lastQuadraticControlPoint = null;
    this.lastCubicControlPoint = null;
  }

  /**
   * Sets the quadratic control point
   */
  private setQuadraticControlPoint( point: Vector2 ): void {
    this.lastQuadraticControlPoint = point;
    this.lastCubicControlPoint = null;
  }

  /**
   * Sets the cubic control point
   */
  private setCubicControlPoint( point: Vector2 ): void {
    this.lastQuadraticControlPoint = null;
    this.lastCubicControlPoint = point;
  }

  /**
   * Moves to a point given by the coordinates x and y
   */
  public moveTo( x: number, y: number ): this {
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.moveToPoint( v( x, y ) );
  }

  /**
   * Moves a relative displacement (x,y) from last point
   */
  public moveToRelative( x: number, y: number ): this {
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.moveToPointRelative( v( x, y ) );
  }

  /**
   * Moves a relative displacement (point) from last point
   */
  public moveToPointRelative( displacement: Vector2 ): this {
    return this.moveToPoint( this.getRelativePoint().plus( displacement ) );
  }

  /**
   * Adds to this shape a subpath that moves (no joint) it to a point
   */
  public moveToPoint( point: Vector2 ): this {
    this.addSubpath( new Subpath().addPoint( point ) );
    this.resetControlPoints();

    return this; // for chaining
  }

  /**
   * Adds to this shape a straight line from last point to the coordinate (x,y)
   */
  public lineTo( x: number, y: number ): this {
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.lineToPoint( v( x, y ) );
  }

  /**
   * Adds to this shape a straight line displaced by a relative amount x, and y from last point
   *
   * @param x - horizontal displacement
   * @param y - vertical displacement
   */
  public lineToRelative( x: number, y: number ): this {
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.lineToPointRelative( v( x, y ) );
  }

  /**
   * Adds to this shape a straight line displaced by a relative displacement (point)
   */
  public lineToPointRelative( displacement: Vector2 ): this {
    return this.lineToPoint( this.getRelativePoint().plus( displacement ) );
  }

  /**
   * Adds to this shape a straight line from this lastPoint to point
   */
  public lineToPoint( point: Vector2 ): this {
    // see http://www.w3.org/TR/2dcontext/#dom-context-2d-lineto
    if ( this.hasSubpaths() ) {
      const start = this.getLastSubpath().getLastPoint();
      const end = point;
      const line = new Line( start, end );
      this.getLastSubpath().addPoint( end );
      this.addSegmentAndBounds( line );
    }
    else {
      this.ensure( point );
    }
    this.resetControlPoints();

    return this;  // for chaining
  }

  /**
   * Adds a horizontal line (x represents the x-coordinate of the end point)
   */
  public horizontalLineTo( x: number ): this {
    return this.lineTo( x, this.getRelativePoint().y );
  }

  /**
   * Adds a horizontal line (x represent a horizontal displacement)
   */
  public horizontalLineToRelative( x: number ): this {
    return this.lineToRelative( x, 0 );
  }

  /**
   * Adds a vertical line (y represents the y-coordinate of the end point)
   */
  public verticalLineTo( y: number ): this {
    return this.lineTo( this.getRelativePoint().x, y );
  }

  /**
   * Adds a vertical line (y represents a vertical displacement)
   */
  public verticalLineToRelative( y: number ): this {
    return this.lineToRelative( 0, y );
  }

  /**
   * Zig-zags between the current point and the specified point
   *
   * @param endX - the end of the shape
   * @param endY - the end of the shape
   * @param amplitude - the vertical amplitude of the zig zag wave
   * @param numberZigZags - the number of oscillations
   * @param symmetrical - flag for drawing a symmetrical zig zag
   */
  public zigZagTo( endX: number, endY: number, amplitude: number, numberZigZags: number, symmetrical: boolean ): this {
    return this.zigZagToPoint( new Vector2( endX, endY ), amplitude, numberZigZags, symmetrical );
  }

  /**
   * Zig-zags between the current point and the specified point.
   * Implementation moved from circuit-construction-kit-common on April 22, 2019.
   *
   * @param endPoint - the end of the shape
   * @param amplitude - the vertical amplitude of the zig zag wave, signed to choose initial direction
   * @param numberZigZags - the number of complete oscillations
   * @param symmetrical - flag for drawing a symmetrical zig zag
   */
  public zigZagToPoint( endPoint: Vector2, amplitude: number, numberZigZags: number, symmetrical: boolean ): this {

    assert && assert( Number.isInteger( numberZigZags ), `numberZigZags must be an integer: ${numberZigZags}` );

    this.ensure( endPoint );
    const startPoint = this.getLastPoint();
    const delta = endPoint.minus( startPoint );
    const directionUnitVector = delta.normalized();
    const amplitudeNormalVector = directionUnitVector.perpendicular.times( amplitude );

    let wavelength;
    if ( symmetrical ) {
      // the wavelength is shorter to add half a wave.
      wavelength = delta.magnitude / ( numberZigZags + 0.5 );
    }
    else {
      wavelength = delta.magnitude / numberZigZags;
    }

    for ( let i = 0; i < numberZigZags; i++ ) {
      const waveOrigin = directionUnitVector.times( i * wavelength ).plus( startPoint );
      const topPoint = waveOrigin.plus( directionUnitVector.times( wavelength / 4 ) ).plus( amplitudeNormalVector );
      const bottomPoint = waveOrigin.plus( directionUnitVector.times( 3 * wavelength / 4 ) ).minus( amplitudeNormalVector );
      this.lineToPoint( topPoint );
      this.lineToPoint( bottomPoint );
    }

    // add last half of the wavelength
    if ( symmetrical ) {
      const waveOrigin = directionUnitVector.times( numberZigZags * wavelength ).plus( startPoint );
      const topPoint = waveOrigin.plus( directionUnitVector.times( wavelength / 4 ) ).plus( amplitudeNormalVector );
      this.lineToPoint( topPoint );
    }

    return this.lineToPoint( endPoint );
  }

  /**
   * Adds a quadratic curve to this shape
   *
   * The curve is guaranteed to pass through the coordinate (x,y) but does not pass through the control point
   *
   * @param cpx - control point horizontal coordinate
   * @param cpy - control point vertical coordinate
   * @param x
   * @param y
   */
  public quadraticCurveTo( cpx: number, cpy: number, x: number, y: number ): this {
    assert && assert( isFinite( cpx ), `cpx must be a finite number: ${cpx}` );
    assert && assert( isFinite( cpy ), `cpy must be a finite number: ${cpy}` );
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.quadraticCurveToPoint( v( cpx, cpy ), v( x, y ) );
  }

  /**
   * Adds a quadratic curve to this shape. The control and final points are specified as displacment from the last
   * point in this shape
   *
   * @param cpx - control point horizontal coordinate
   * @param cpy - control point vertical coordinate
   * @param x - final x position of the quadratic curve
   * @param y - final y position of the quadratic curve
   */
  public quadraticCurveToRelative( cpx: number, cpy: number, x: number, y: number ): this {
    assert && assert( isFinite( cpx ), `cpx must be a finite number: ${cpx}` );
    assert && assert( isFinite( cpy ), `cpy must be a finite number: ${cpy}` );
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.quadraticCurveToPointRelative( v( cpx, cpy ), v( x, y ) );
  }

  /**
   * Adds a quadratic curve to this shape. The control and final points are specified as displacement from the
   * last point in this shape
   *
   * @param controlPoint
   * @param point - the quadratic curve passes through this point
   */
  public quadraticCurveToPointRelative( controlPoint: Vector2, point: Vector2 ): this {
    const relativePoint = this.getRelativePoint();
    return this.quadraticCurveToPoint( relativePoint.plus( controlPoint ), relativePoint.plus( point ) );
  }

  /**
   * Adds a quadratic curve to this shape. The quadratic curves passes through the x and y coordinate.
   * The shape should join smoothly with the previous subpaths
   *
   * TODO: consider a rename to put 'smooth' farther back? https://github.com/phetsims/kite/issues/76
   *
   * @param x - final x position of the quadratic curve
   * @param y - final y position of the quadratic curve
   */
  public smoothQuadraticCurveTo( x: number, y: number ): this {
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.quadraticCurveToPoint( this.getSmoothQuadraticControlPoint(), v( x, y ) );
  }

  /**
   * Adds a quadratic curve to this shape. The quadratic curves passes through the x and y coordinate.
   * The shape should join smoothly with the previous subpaths
   *
   * @param x - final x position of the quadratic curve
   * @param y - final y position of the quadratic curve
   */
  public smoothQuadraticCurveToRelative( x: number, y: number ): this {
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.quadraticCurveToPoint( this.getSmoothQuadraticControlPoint(), v( x, y ).plus( this.getRelativePoint() ) );
  }

  /**
   * Adds a quadratic bezier curve to this shape.
   *
   * @param controlPoint
   * @param point - the quadratic curve passes through this point
   */
  public quadraticCurveToPoint( controlPoint: Vector2, point: Vector2 ): this {
    // see http://www.w3.org/TR/2dcontext/#dom-context-2d-quadraticcurveto
    this.ensure( controlPoint );
    const start = this.getLastSubpath().getLastPoint();
    const quadratic = new Quadratic( start, controlPoint, point );
    this.getLastSubpath().addPoint( point );
    const nondegenerateSegments = quadratic.getNondegenerateSegments();
    _.each( nondegenerateSegments, segment => {
      // TODO: optimization https://github.com/phetsims/kite/issues/76
      this.addSegmentAndBounds( segment );
    } );
    this.setQuadraticControlPoint( controlPoint );

    return this;  // for chaining
  }

  /**
   * Adds a cubic bezier curve to this shape.
   *
   * @param cp1x - control point 1,  horizontal coordinate
   * @param cp1y - control point 1,  vertical coordinate
   * @param cp2x - control point 2,  horizontal coordinate
   * @param cp2y - control point 2,  vertical coordinate
   * @param x - final x position of the cubic curve
   * @param y - final y position of the cubic curve
   */
  public cubicCurveTo( cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number ): this {
    assert && assert( isFinite( cp1x ), `cp1x must be a finite number: ${cp1x}` );
    assert && assert( isFinite( cp1y ), `cp1y must be a finite number: ${cp1y}` );
    assert && assert( isFinite( cp2x ), `cp2x must be a finite number: ${cp2x}` );
    assert && assert( isFinite( cp2y ), `cp2y must be a finite number: ${cp2y}` );
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.cubicCurveToPoint( v( cp1x, cp1y ), v( cp2x, cp2y ), v( x, y ) );
  }

  /**
   * @param cp1x - control point 1,  horizontal displacement
   * @param cp1y - control point 1,  vertical displacement
   * @param cp2x - control point 2,  horizontal displacement
   * @param cp2y - control point 2,  vertical displacement
   * @param x - final horizontal displacement
   * @param y - final vertical displacment
   */
  public cubicCurveToRelative( cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number ): this {
    assert && assert( isFinite( cp1x ), `cp1x must be a finite number: ${cp1x}` );
    assert && assert( isFinite( cp1y ), `cp1y must be a finite number: ${cp1y}` );
    assert && assert( isFinite( cp2x ), `cp2x must be a finite number: ${cp2x}` );
    assert && assert( isFinite( cp2y ), `cp2y must be a finite number: ${cp2y}` );
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.cubicCurveToPointRelative( v( cp1x, cp1y ), v( cp2x, cp2y ), v( x, y ) );
  }

  /**
   * @param control1 - control displacement  1
   * @param control2 - control displacement 2
   * @param point - final displacement
   */
  public cubicCurveToPointRelative( control1: Vector2, control2: Vector2, point: Vector2 ): this {
    const relativePoint = this.getRelativePoint();
    return this.cubicCurveToPoint( relativePoint.plus( control1 ), relativePoint.plus( control2 ), relativePoint.plus( point ) );
  }

  /**
   * @param cp2x - control point 2,  horizontal coordinate
   * @param cp2y - control point 2,  vertical coordinate
   * @param x
   * @param y
   */
  public smoothCubicCurveTo( cp2x: number, cp2y: number, x: number, y: number ): this {
    assert && assert( isFinite( cp2x ), `cp2x must be a finite number: ${cp2x}` );
    assert && assert( isFinite( cp2y ), `cp2y must be a finite number: ${cp2y}` );
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.cubicCurveToPoint( this.getSmoothCubicControlPoint(), v( cp2x, cp2y ), v( x, y ) );
  }

  /**
   * @param cp2x - control point 2,  horizontal coordinate
   * @param cp2y - control point 2,  vertical coordinate
   * @param x
   * @param y
   */
  public smoothCubicCurveToRelative( cp2x: number, cp2y: number, x: number, y: number ): this {
    assert && assert( isFinite( cp2x ), `cp2x must be a finite number: ${cp2x}` );
    assert && assert( isFinite( cp2y ), `cp2y must be a finite number: ${cp2y}` );
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    return this.cubicCurveToPoint( this.getSmoothCubicControlPoint(), v( cp2x, cp2y ).plus( this.getRelativePoint() ), v( x, y ).plus( this.getRelativePoint() ) );
  }

  public cubicCurveToPoint( control1: Vector2, control2: Vector2, point: Vector2 ): this {
    // see http://www.w3.org/TR/2dcontext/#dom-context-2d-quadraticcurveto
    this.ensure( control1 );
    const start = this.getLastSubpath().getLastPoint();
    const cubic = new Cubic( start, control1, control2, point );

    const nondegenerateSegments = cubic.getNondegenerateSegments();
    _.each( nondegenerateSegments, segment => {
      this.addSegmentAndBounds( segment );
    } );
    this.getLastSubpath().addPoint( point );

    this.setCubicControlPoint( control2 );

    return this;  // for chaining
  }

  /**
   * @param centerX - horizontal coordinate of the center of the arc
   * @param centerY - Center of the arc
   * @param radius - How far from the center the arc will be
   * @param startAngle - Angle (radians) of the start of the arc
   * @param endAngle - Angle (radians) of the end of the arc
   * @param [anticlockwise] - Decides which direction the arc takes around the center
   */
  public arc( centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean ): this {
    assert && assert( isFinite( centerX ), `centerX must be a finite number: ${centerX}` );
    assert && assert( isFinite( centerY ), `centerY must be a finite number: ${centerY}` );
    return this.arcPoint( v( centerX, centerY ), radius, startAngle, endAngle, anticlockwise );
  }

  /**
   * @param center - Center of the arc (every point on the arc is equally far from the center)
   * @param radius - How far from the center the arc will be
   * @param startAngle - Angle (radians) of the start of the arc
   * @param endAngle - Angle (radians) of the end of the arc
   * @param [anticlockwise] - Decides which direction the arc takes around the center
   */
  public arcPoint( center: Vector2, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean ): this {
    // see http://www.w3.org/TR/2dcontext/#dom-context-2d-arc
    if ( anticlockwise === undefined ) {
      anticlockwise = false;
    }

    const arc = new Arc( center, radius, startAngle, endAngle, anticlockwise );

    // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
    const startPoint = arc.getStart();
    const endPoint = arc.getEnd();

    // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
    if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint() ) ) {
      this.addSegmentAndBounds( new Line( this.getLastSubpath().getLastPoint(), startPoint ) );
    }

    if ( !this.hasSubpaths() ) {
      this.addSubpath( new Subpath() );
    }

    // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
    this.getLastSubpath().addPoint( startPoint );
    this.getLastSubpath().addPoint( endPoint );

    this.addSegmentAndBounds( arc );
    this.resetControlPoints();

    return this;  // for chaining
  }

  /**
   * Creates an elliptical arc
   *
   * @param centerX - horizontal coordinate of the center of the arc
   * @param centerY -  vertical coordinate of the center of the arc
   * @param radiusX - semi axis
   * @param radiusY - semi axis
   * @param rotation - rotation of the elliptical arc with respect to the positive x axis.
   * @param startAngle
   * @param endAngle
   * @param [anticlockwise]
   */
  public ellipticalArc( centerX: number, centerY: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise?: boolean ): this {
    assert && assert( isFinite( centerX ), `centerX must be a finite number: ${centerX}` );
    assert && assert( isFinite( centerY ), `centerY must be a finite number: ${centerY}` );
    return this.ellipticalArcPoint( v( centerX, centerY ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );
  }

  /**
   * Creates an elliptic arc
   *
   * @param center
   * @param radiusX
   * @param radiusY
   * @param rotation - rotation of the arc with respect to the positive x axis.
   * @param startAngle -
   * @param endAngle
   * @param [anticlockwise]
   */
  public ellipticalArcPoint( center: Vector2, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise?: boolean ): this {
    // see http://www.w3.org/TR/2dcontext/#dom-context-2d-arc
    if ( anticlockwise === undefined ) {
      anticlockwise = false;
    }

    const ellipticalArc = new EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );

    // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
    const startPoint = ellipticalArc.start;
    const endPoint = ellipticalArc.end;

    // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
    if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint() ) ) {
      this.addSegmentAndBounds( new Line( this.getLastSubpath().getLastPoint(), startPoint ) );
    }

    if ( !this.hasSubpaths() ) {
      this.addSubpath( new Subpath() );
    }

    // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
    this.getLastSubpath().addPoint( startPoint );
    this.getLastSubpath().addPoint( endPoint );

    this.addSegmentAndBounds( ellipticalArc );
    this.resetControlPoints();

    return this;  // for chaining
  }

  /**
   * Adds a subpath that joins the last point of this shape to the first point to form a closed shape
   *
   */
  public close(): this {
    if ( this.hasSubpaths() ) {
      const previousPath = this.getLastSubpath();
      const nextPath = new Subpath();

      previousPath.close();
      this.addSubpath( nextPath );
      nextPath.addPoint( previousPath.getFirstPoint() );
    }
    this.resetControlPoints();
    return this;  // for chaining
  }

  /**
   * Moves to the next subpath, but without adding any points to it (like a moveTo would do).
   *
   * This is particularly helpful for cases where you don't want to have to compute the explicit starting point of
   * the next subpath. For instance, if you want three disconnected circles:
   * - shape.circle( 50, 50, 20 ).newSubpath().circle( 100, 100, 20 ).newSubpath().circle( 150, 50, 20 )
   *
   * See https://github.com/phetsims/kite/issues/72 for more info.
   */
  public newSubpath(): this {
    this.addSubpath( new Subpath() );
    this.resetControlPoints();

    return this; // for chaining
  }

  /**
   * Makes this Shape immutable, so that attempts to further change the Shape will fail. This allows clients to avoid
   * adding change listeners to this Shape.
   */
  public makeImmutable(): this {
    this._immutable = true;

    this.notifyInvalidationListeners();

    return this; // for chaining
  }

  /**
   * Returns whether this Shape is immutable (see makeImmutable for details).
   */
  public isImmutable(): boolean {
    return this._immutable;
  }

  /**
   * Matches SVG's elliptical arc from http://www.w3.org/TR/SVG/paths.html
   *
   * WARNING: rotation (for now) is in DEGREES. This will probably change in the future.
   *
   * @param radiusX - Semi-major axis size
   * @param radiusY - Semi-minor axis size
   * @param rotation - Rotation of the ellipse (its semi-major axis)
   * @param largeArc - Whether the arc will go the longest route around the ellipse.
   * @param sweep - Whether the arc made goes from start to end "clockwise" (opposite of anticlockwise flag)
   * @param x - End point X position
   * @param y - End point Y position
   */
  public ellipticalArcToRelative( radiusX: number, radiusY: number, rotation: number, largeArc: boolean, sweep: boolean, x: number, y: number ): this {
    const relativePoint = this.getRelativePoint();
    return this.ellipticalArcTo( radiusX, radiusY, rotation, largeArc, sweep, x + relativePoint.x, y + relativePoint.y );
  }

  /**
   * Matches SVG's elliptical arc from http://www.w3.org/TR/SVG/paths.html
   *
   * WARNING: rotation (for now) is in DEGREES. This will probably change in the future.
   *
   * @param radiusX - Semi-major axis size
   * @param radiusY - Semi-minor axis size
   * @param rotation - Rotation of the ellipse (its semi-major axis)
   * @param largeArc - Whether the arc will go the longest route around the ellipse.
   * @param sweep - Whether the arc made goes from start to end "clockwise" (opposite of anticlockwise flag)
   * @param x - End point X position
   * @param y - End point Y position
   */
  public ellipticalArcTo( radiusX: number, radiusY: number, rotation: number, largeArc: boolean, sweep: boolean, x: number, y: number ): this {
    // See "F.6.5 Conversion from endpoint to center parameterization"
    // in https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes

    const endPoint = new Vector2( x, y );
    this.ensure( endPoint );

    const startPoint = this.getLastSubpath().getLastPoint();
    this.getLastSubpath().addPoint( endPoint );

    // Absolute value applied to radii (per SVG spec)
    if ( radiusX < 0 ) { radiusX *= -1.0; }
    if ( radiusY < 0 ) { radiusY *= -1.0; }

    let rxs = radiusX * radiusX;
    let rys = radiusY * radiusY;
    const prime = startPoint.minus( endPoint ).dividedScalar( 2 ).rotated( -rotation );
    const pxs = prime.x * prime.x;
    const pys = prime.y * prime.y;
    let centerPrime = new Vector2( radiusX * prime.y / radiusY, -radiusY * prime.x / radiusX );

    // If the radii are not large enough to accomodate the start/end point, apply F.6.6 correction
    const size = pxs / rxs + pys / rys;
    if ( size > 1 ) {
      radiusX *= Math.sqrt( size );
      radiusY *= Math.sqrt( size );

      // redo some computations from above
      rxs = radiusX * radiusX;
      rys = radiusY * radiusY;
      centerPrime = new Vector2( radiusX * prime.y / radiusY, -radiusY * prime.x / radiusX );
    }

    // Naming matches https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes for
    // F.6.5 Conversion from endpoint to center parameterization

    centerPrime.multiplyScalar( Math.sqrt( Math.max( 0, ( rxs * rys - rxs * pys - rys * pxs ) / ( rxs * pys + rys * pxs ) ) ) );
    if ( largeArc === sweep ) {
      // From spec: where the + sign is chosen if fA ≠ fS, and the − sign is chosen if fA = fS.
      centerPrime.multiplyScalar( -1 );
    }
    const center = startPoint.blend( endPoint, 0.5 ).plus( centerPrime.rotated( rotation ) );

    const signedAngle = ( u: Vector2, v: Vector2 ) => {
      // From spec: where the ± sign appearing here is the sign of ux vy − uy vx.
      return ( ( u.x * v.y - u.y * v.x ) > 0 ? 1 : -1 ) * u.angleBetween( v );
    };

    const victor = new Vector2( ( prime.x - centerPrime.x ) / radiusX, ( prime.y - centerPrime.y ) / radiusY );
    const ross = new Vector2( ( -prime.x - centerPrime.x ) / radiusX, ( -prime.y - centerPrime.y ) / radiusY );
    const startAngle = signedAngle( Vector2.X_UNIT, victor );
    let deltaAngle = signedAngle( victor, ross ) % ( Math.PI * 2 );

    // From spec:
    // > In other words, if fS = 0 and the right side of (F.6.5.6) is greater than 0, then subtract 360°, whereas if
    // > fS = 1 and the right side of (F.6.5.6) is less than 0, then add 360°. In all other cases leave it as is.
    if ( !sweep && deltaAngle > 0 ) {
      deltaAngle -= Math.PI * 2;
    }
    if ( sweep && deltaAngle < 0 ) {
      deltaAngle += Math.PI * 2;
    }

    // Standard handling of degenerate segments (particularly, converting elliptical arcs to circular arcs)
    const ellipticalArc = new EllipticalArc( center, radiusX, radiusY, rotation, startAngle, startAngle + deltaAngle, !sweep );
    const nondegenerateSegments = ellipticalArc.getNondegenerateSegments();
    _.each( nondegenerateSegments, segment => {
      this.addSegmentAndBounds( segment );
    } );

    return this;
  }

  /**
   * Draws a circle using the arc() call
   */
  public circle( center: Vector2, radius: number ): this;
  public circle( centerX: number, centerY: number, radius: number ): this;
  public circle( centerX: Vector2 | number, centerY: number, radius?: number ): this {
    if ( typeof centerX === 'object' ) {
      // circle( center, radius )
      const center = centerX;
      radius = centerY;
      return this.arcPoint( center, radius, 0, Math.PI * 2, false ).close();
    }
    else {
      assert && assert( isFinite( centerX ), `centerX must be a finite number: ${centerX}` );
      assert && assert( isFinite( centerY ), `centerY must be a finite number: ${centerY}` );

      // circle( centerX, centerY, radius )
      return this.arcPoint( v( centerX, centerY ), radius!, 0, Math.PI * 2, false ).close();
    }
  }

  /**
   * Draws an ellipse using the ellipticalArc() call
   *
   * The rotation is about the centerX, centerY.
   */
  public ellipse( center: Vector2, radiusX: number, radiusY: number, rotation: number ): this;
  public ellipse( centerX: number, centerY: number, radiusX: number, radiusY: number, rotation: number ): this;
  public ellipse( centerX: Vector2 | number, centerY: number, radiusX: number, radiusY: number, rotation?: number ): this {
    // TODO: separate into ellipse() and ellipsePoint()? https://github.com/phetsims/kite/issues/76
    // TODO: Ellipse/EllipticalArc has a mess of parameters. Consider parameter object, or double-check parameter handling https://github.com/phetsims/kite/issues/76
    if ( typeof centerX === 'object' ) {
      // ellipse( center, radiusX, radiusY, rotation )
      const center = centerX;
      rotation = radiusY;
      radiusY = radiusX;
      radiusX = centerY;
      return this.ellipticalArcPoint( center, radiusX, radiusY, rotation || 0, 0, Math.PI * 2, false ).close();
    }
    else {
      assert && assert( isFinite( centerX ), `centerX must be a finite number: ${centerX}` );
      assert && assert( isFinite( centerY ), `centerY must be a finite number: ${centerY}` );

      // ellipse( centerX, centerY, radiusX, radiusY, rotation )
      return this.ellipticalArcPoint( v( centerX, centerY ), radiusX, radiusY, rotation || 0, 0, Math.PI * 2, false ).close();
    }
  }

  /**
   * Creates a rectangle shape
   *
   * @param x - left position
   * @param y - bottom position (in non inverted cartesian system)
   * @param width
   * @param height
   */
  public rect( x: number, y: number, width: number, height: number ): this {
    assert && assert( isFinite( x ), `x must be a finite number: ${x}` );
    assert && assert( isFinite( y ), `y must be a finite number: ${y}` );
    assert && assert( isFinite( width ), `width must be a finite number: ${width}` );
    assert && assert( isFinite( height ), `height must be a finite number: ${height}` );

    const subpath = new Subpath();
    this.addSubpath( subpath );
    subpath.addPoint( v( x, y ) );
    subpath.addPoint( v( x + width, y ) );
    subpath.addPoint( v( x + width, y + height ) );
    subpath.addPoint( v( x, y + height ) );
    this.addSegmentAndBounds( new Line( subpath.points[ 0 ], subpath.points[ 1 ] ) );
    this.addSegmentAndBounds( new Line( subpath.points[ 1 ], subpath.points[ 2 ] ) );
    this.addSegmentAndBounds( new Line( subpath.points[ 2 ], subpath.points[ 3 ] ) );
    subpath.close();
    this.addSubpath( new Subpath() );
    this.getLastSubpath().addPoint( v( x, y ) );
    assert && assert( !isNaN( this.bounds.getX() ) );
    this.resetControlPoints();

    return this;
  }

  /**
   * Creates a round rectangle. All arguments are number.
   *
   * @param x
   * @param y
   * @param width - width of the rectangle
   * @param height - height of the rectangle
   * @param arcw - arc width
   * @param arch - arc height
   */
  public roundRect( x: number, y: number, width: number, height: number, arcw: number, arch: number ): this {
    const lowX = x + arcw;
    const highX = x + width - arcw;
    const lowY = y + arch;
    const highY = y + height - arch;
    // if ( true ) {
    if ( arcw === arch ) {
      // we can use circular arcs, which have well defined stroked offsets
      this
        .arc( highX, lowY, arcw, -Math.PI / 2, 0, false )
        .arc( highX, highY, arcw, 0, Math.PI / 2, false )
        .arc( lowX, highY, arcw, Math.PI / 2, Math.PI, false )
        .arc( lowX, lowY, arcw, Math.PI, Math.PI * 3 / 2, false )
        .close();
    }
    else {
      // we have to resort to elliptical arcs
      this
        .ellipticalArc( highX, lowY, arcw, arch, 0, -Math.PI / 2, 0, false )
        .ellipticalArc( highX, highY, arcw, arch, 0, 0, Math.PI / 2, false )
        .ellipticalArc( lowX, highY, arcw, arch, 0, Math.PI / 2, Math.PI, false )
        .ellipticalArc( lowX, lowY, arcw, arch, 0, Math.PI, Math.PI * 3 / 2, false )
        .close();
    }
    return this;
  }

  /**
   * Creates a polygon from an array of vertices.
   */
  public polygon( vertices: Vector2[] ): this {
    const length = vertices.length;
    if ( length > 0 ) {
      this.moveToPoint( vertices[ 0 ] );
      for ( let i = 1; i < length; i++ ) {
        this.lineToPoint( vertices[ i ] );
      }
    }
    return this.close();
  }

  /**
   * This is a convenience function that allows to generate Cardinal splines
   * from a position array. Cardinal spline differs from Bezier curves in that all
   * defined points on a Cardinal spline are on the path itself.
   *
   * It includes a tension parameter to allow the client to specify how tightly
   * the path interpolates between points. One can think of the tension as the tension in
   * a rubber band around pegs. however unlike a rubber band the tension can be negative.
   * the tension ranges from -1 to 1
   */
  public cardinalSpline( positions: Vector2[], providedOptions?: CardinalSplineOptions ): this {

    const options = optionize<CardinalSplineOptions>()( {
      tension: 0,
      isClosedLineSegments: false
    }, providedOptions );

    assert && assert( options.tension < 1 && options.tension > -1, ' the tension goes from -1 to 1 ' );

    const pointNumber = positions.length; // number of points in the array

    // if the line is open, there is one less segments than point vectors
    const segmentNumber = ( options.isClosedLineSegments ) ? pointNumber : pointNumber - 1;

    for ( let i = 0; i < segmentNumber; i++ ) {
      let cardinalPoints; // {Array.<Vector2>} cardinal points Array
      if ( i === 0 && !options.isClosedLineSegments ) {
        cardinalPoints = [
          positions[ 0 ],
          positions[ 0 ],
          positions[ 1 ],
          positions[ 2 ] ];
      }
      else if ( ( i === segmentNumber - 1 ) && !options.isClosedLineSegments ) {
        cardinalPoints = [
          positions[ i - 1 ],
          positions[ i ],
          positions[ i + 1 ],
          positions[ i + 1 ] ];
      }
      else {
        cardinalPoints = [
          positions[ ( i - 1 + pointNumber ) % pointNumber ],
          positions[ i % pointNumber ],
          positions[ ( i + 1 ) % pointNumber ],
          positions[ ( i + 2 ) % pointNumber ] ];
      }

      // Cardinal Spline to Cubic Bezier conversion matrix
      //    0                 1             0            0
      //  (-1+tension)/6      1      (1-tension)/6       0
      //    0            (1-tension)/6      1       (-1+tension)/6
      //    0                 0             1           0

      // {Array.<Vector2>} bezier points Array
      const bezierPoints = [
        cardinalPoints[ 1 ],
        weightedSplineVector( cardinalPoints[ 0 ], cardinalPoints[ 1 ], cardinalPoints[ 2 ], options.tension ),
        weightedSplineVector( cardinalPoints[ 3 ], cardinalPoints[ 2 ], cardinalPoints[ 1 ], options.tension ),
        cardinalPoints[ 2 ]
      ];

      // special operations on the first point
      if ( i === 0 ) {
        this.ensure( bezierPoints[ 0 ] );
        this.getLastSubpath().addPoint( bezierPoints[ 0 ] );
      }

      this.cubicCurveToPoint( bezierPoints[ 1 ], bezierPoints[ 2 ], bezierPoints[ 3 ] );
    }

    return this;
  }

  /**
   * Returns a copy of this shape
   */
  public copy(): Shape {
    // copy each individual subpath, so future modifications to either Shape doesn't affect the other one
    return new Shape( _.map( this.subpaths, subpath => subpath.copy() ), this.bounds );
  }

  /**
   * Writes out this shape's path to a canvas 2d context. does NOT include the beginPath()!
   */
  public writeToContext( context: CanvasRenderingContext2D ): void {
    const len = this.subpaths.length;
    for ( let i = 0; i < len; i++ ) {
      this.subpaths[ i ].writeToContext( context );
    }
  }

  /**
   * Returns something like "M150 0 L75 200 L225 200 Z" for a triangle (to be used with a SVG path element's 'd'
   * attribute)
   */
  public getSVGPath(): string {
    let string = '';
    const len = this.subpaths.length;
    for ( let i = 0; i < len; i++ ) {
      const subpath = this.subpaths[ i ];
      if ( subpath.isDrawable() ) {
        // since the commands after this are relative to the previous 'point', we need to specify a move to the initial point
        const startPoint = subpath.segments[ 0 ].start;

        string += `M ${svgNumber( startPoint.x )} ${svgNumber( startPoint.y )} `;

        for ( let k = 0; k < subpath.segments.length; k++ ) {
          string += `${subpath.segments[ k ].getSVGPathFragment()} `;
        }

        if ( subpath.isClosed() ) {
          string += 'Z ';
        }
      }
    }
    return string;
  }

  /**
   * Returns a new Shape that is transformed by the associated matrix
   */
  public transformed( matrix: Matrix3 ): Shape {
    // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
    const subpaths = _.map( this.subpaths, subpath => subpath.transformed( matrix ) );
    const bounds = _.reduce( subpaths, ( bounds, subpath ) => bounds.union( subpath.bounds ), Bounds2.NOTHING );
    return new Shape( subpaths, bounds );
  }

  /**
   * Converts this subpath to a new shape made of many line segments (approximating the current shape) with the
   * transformation applied.
   */
  public nonlinearTransformed( providedOptions?: NonlinearTransformedOptions ): Shape {
    const options = combineOptions<NonlinearTransformedOptions>( {
      minLevels: 0,
      maxLevels: 7,
      distanceEpsilon: 0.16, // NOTE: this will change when the Shape is scaled, since this is a threshold for the square of a distance value
      curveEpsilon: ( providedOptions && providedOptions.includeCurvature ) ? 0.002 : null
    }, providedOptions );

    // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
    const subpaths = _.map( this.subpaths, subpath => subpath.nonlinearTransformed( options ) );
    const bounds = _.reduce( subpaths, ( bounds, subpath ) => bounds.union( subpath.bounds ), Bounds2.NOTHING );
    return new Shape( subpaths, bounds );
  }

  /**
   * Maps points by treating their x coordinate as polar angle, and y coordinate as polar magnitude.
   * See http://en.wikipedia.org/wiki/Polar_coordinate_system
   *
   * Please see Shape.nonlinearTransformed for more documentation on adaptive discretization options (minLevels, maxLevels, distanceEpsilon, curveEpsilon)
   *
   * Example: A line from (0,10) to (pi,10) will be transformed to a circular arc from (10,0) to (-10,0) passing through (0,10).
   */
  public polarToCartesian( options?: NonlinearTransformedOptions ): Shape {
    return this.nonlinearTransformed( combineOptions<NonlinearTransformedOptions>( {
      pointMap: p => Vector2.createPolar( p.y, p.x ),
      methodName: 'polarToCartesian' // this will be called on Segments if it exists to do more optimized conversion (see Line)
    }, options ) );
  }

  /**
   * Converts each segment into lines, using an adaptive (midpoint distance subdivision) method.
   *
   * NOTE: uses nonlinearTransformed method internally, but since we don't provide a pointMap or methodName, it won't create anything but line segments.
   * See nonlinearTransformed for documentation of options
   */
  public toPiecewiseLinear( options?: NonlinearTransformedOptions ): Shape {
    assert && assert( !options || !options.pointMap, 'No pointMap for toPiecewiseLinear allowed, since it could create non-linear segments' );
    assert && assert( !options || !options.methodName, 'No methodName for toPiecewiseLinear allowed, since it could create non-linear segments' );
    return this.nonlinearTransformed( options );
  }

  /**
   * Is this point contained in this shape
   */
  public containsPoint( point: Vector2 ): boolean {

    // We pick a ray, and determine the winding number over that ray. if the number of segments crossing it
    // CCW == number of segments crossing it CW, then the point is contained in the shape

    const rayDirection = Vector2.X_UNIT.copy(); // we may mutate it

    // Try to find a ray that doesn't intersect with any of the vertices of the shape segments,
    // see https://github.com/phetsims/kite/issues/94.
    // Put a limit on attempts, so we don't try forever
    let count = 0;
    while ( count < 5 ) {
      count++;

      // Look for cases where the proposed ray will intersect with one of the vertices of a shape segment - in this case
      // the intersection in windingIntersection may not be well-defined and won't be counted, so we need to use a ray
      // with a different direction
      const rayIntersectsSegmentVertex = _.some( this.subpaths, subpath => {
        return _.some( subpath.segments, segment => {
          const delta = segment.start.minus( point );
          const magnitude = delta.magnitude;
          if ( magnitude !== 0 ) {
            delta.divideScalar( magnitude ); // normalize it
            delta.subtract( rayDirection ); // check against the proposed ray direction
            return delta.magnitudeSquared < 1e-9;
          }
          else {
            // If our point is on a segment start, there probably won't be a great ray to use
            return false;
          }
        } );
      } );

      if ( rayIntersectsSegmentVertex ) {
        // the proposed ray may not work because it intersects with a segment vertex - try another one
        rayDirection.rotate( dotRandom.nextDouble() );
      }
      else {
        // Should be safe to use this rayDirection for windingIntersection
        break;
      }
    }

    return this.windingIntersection( new Ray2( point, rayDirection ) ) !== 0;
  }

  /**
   * Hit-tests this shape with the ray. An array of all intersections of the ray with this shape will be returned.
   * For this function, intersections will be returned sorted by the distance from the ray's position.
   */
  public intersection( ray: Ray2 ): RayIntersection[] {
    let hits: RayIntersection[] = [];
    const numSubpaths = this.subpaths.length;
    for ( let i = 0; i < numSubpaths; i++ ) {
      const subpath = this.subpaths[ i ];

      if ( subpath.isDrawable() ) {
        const numSegments = subpath.segments.length;
        for ( let k = 0; k < numSegments; k++ ) {
          const segment = subpath.segments[ k ];
          hits = hits.concat( segment.intersection( ray ) );
        }

        if ( subpath.hasClosingSegment() ) {
          hits = hits.concat( subpath.getClosingSegment().intersection( ray ) );
        }
      }
    }
    return _.sortBy( hits, hit => hit.distance );
  }

  /**
   * Returns whether the provided line segment would have some part on top or touching the interior (filled area) of
   * this shape.
   *
   * This differs somewhat from an intersection of the line segment with the Shape's path, as we will return true
   * ("intersection") if the line segment is entirely contained in the interior of the Shape's path.
   *
   * @param startPoint - One end of the line segment
   * @param endPoint - The other end of the line segment
   */
  public interiorIntersectsLineSegment( startPoint: Vector2, endPoint: Vector2 ): boolean {
    // First check if our midpoint is in the Shape (as either our midpoint is in the Shape, OR the line segment will
    // intersect the Shape's boundary path).
    const midpoint = startPoint.blend( endPoint, 0.5 );
    if ( this.containsPoint( midpoint ) ) {
      return true;
    }

    // TODO: if an issue, we can reduce this allocation to a scratch variable local in the Shape.js scope. https://github.com/phetsims/kite/issues/76
    const delta = endPoint.minus( startPoint );
    const length = delta.magnitude;

    if ( length === 0 ) {
      return false;
    }

    delta.normalize(); // so we can use it as a unit vector, expected by the Ray

    // Grab all intersections (that are from startPoint towards the direction of endPoint)
    const hits = this.intersection( new Ray2( startPoint, delta ) );

    // See if we have any intersections along our infinite ray whose distance from the startPoint is less than or
    // equal to our line segment's length.
    for ( let i = 0; i < hits.length; i++ ) {
      if ( hits[ i ].distance <= length ) {
        return true;
      }
    }

    // Did not hit the boundary, and wasn't fully contained.
    return false;
  }

  /**
   * Returns the winding number for intersection with a ray
   */
  public windingIntersection( ray: Ray2 ): number {
    let wind = 0;

    const numSubpaths = this.subpaths.length;
    for ( let i = 0; i < numSubpaths; i++ ) {
      const subpath = this.subpaths[ i ];

      if ( subpath.isDrawable() ) {
        const numSegments = subpath.segments.length;
        for ( let k = 0; k < numSegments; k++ ) {
          wind += subpath.segments[ k ].windingIntersection( ray );
        }

        // handle the implicit closing line segment
        if ( subpath.hasClosingSegment() ) {
          wind += subpath.getClosingSegment().windingIntersection( ray );
        }
      }
    }

    return wind;
  }

  /**
   * Whether the path of the Shape intersects (or is contained in) the provided bounding box.
   * Computed by checking intersections with all four edges of the bounding box, or whether the Shape is totally
   * contained within the bounding box.
   */
  public intersectsBounds( bounds: Bounds2 ): boolean {
    // If the bounding box completely surrounds our shape, it intersects the bounds
    if ( this.bounds.intersection( bounds ).equals( this.bounds ) ) {
      return true;
    }

    // rays for hit testing along the bounding box edges
    const minHorizontalRay = new Ray2( new Vector2( bounds.minX, bounds.minY ), new Vector2( 1, 0 ) );
    const minVerticalRay = new Ray2( new Vector2( bounds.minX, bounds.minY ), new Vector2( 0, 1 ) );
    const maxHorizontalRay = new Ray2( new Vector2( bounds.maxX, bounds.maxY ), new Vector2( -1, 0 ) );
    const maxVerticalRay = new Ray2( new Vector2( bounds.maxX, bounds.maxY ), new Vector2( 0, -1 ) );

    let hitPoint;
    let i;
    // TODO: could optimize to intersect differently so we bail sooner https://github.com/phetsims/kite/issues/76
    const horizontalRayIntersections = this.intersection( minHorizontalRay ).concat( this.intersection( maxHorizontalRay ) );
    for ( i = 0; i < horizontalRayIntersections.length; i++ ) {
      hitPoint = horizontalRayIntersections[ i ].point;
      if ( hitPoint.x >= bounds.minX && hitPoint.x <= bounds.maxX ) {
        return true;
      }
    }

    const verticalRayIntersections = this.intersection( minVerticalRay ).concat( this.intersection( maxVerticalRay ) );
    for ( i = 0; i < verticalRayIntersections.length; i++ ) {
      hitPoint = verticalRayIntersections[ i ].point;
      if ( hitPoint.y >= bounds.minY && hitPoint.y <= bounds.maxY ) {
        return true;
      }
    }

    // not contained, and no intersections with the sides of the bounding box
    return false;
  }

  /**
   * Returns a new Shape that is an outline of the stroked path of this current Shape. currently not intended to be
   * nested (doesn't do intersection computations yet)
   *
   * TODO: rename stroked( lineStyles )? https://github.com/phetsims/kite/issues/76
   */
  public getStrokedShape( lineStyles: LineStyles ): Shape {
    let subpaths: Subpath[] = [];
    const bounds = Bounds2.NOTHING.copy();
    let subLen = this.subpaths.length;
    for ( let i = 0; i < subLen; i++ ) {
      const subpath = this.subpaths[ i ];
      const strokedSubpath = subpath.stroked( lineStyles );
      subpaths = subpaths.concat( strokedSubpath );
    }
    subLen = subpaths.length;
    for ( let i = 0; i < subLen; i++ ) {
      bounds.includeBounds( subpaths[ i ].bounds );
    }
    return new Shape( subpaths, bounds );
  }

  /**
   * Gets a shape offset by a certain amount.
   */
  public getOffsetShape( distance: number ): Shape {
    // TODO: abstract away this type of behavior https://github.com/phetsims/kite/issues/76
    const subpaths = [];
    const bounds = Bounds2.NOTHING.copy();
    let subLen = this.subpaths.length;
    for ( let i = 0; i < subLen; i++ ) {
      subpaths.push( this.subpaths[ i ].offset( distance ) );
    }
    subLen = subpaths.length;
    for ( let i = 0; i < subLen; i++ ) {
      bounds.includeBounds( subpaths[ i ].bounds );
    }
    return new Shape( subpaths, bounds );
  }

  /**
   * Returns a copy of this subpath with the dash "holes" removed (has many subpaths usually).
   */
  public getDashedShape( lineDash: number[], lineDashOffset: number, providedOptions?: GetDashedShapeOptions ): Shape {
    const options = optionize<GetDashedShapeOptions>()( {
      distanceEpsilon: 1e-10,
      curveEpsilon: 1e-8
    }, providedOptions );

    return new Shape( _.flatten( this.subpaths.map( subpath => subpath.dashed( lineDash, lineDashOffset, options.distanceEpsilon, options.curveEpsilon ) ) ) );
  }

  /**
   * Returns the bounds of this shape. It is the bounding-box union of the bounds of each subpath contained.
   */
  public getBounds(): Bounds2 {
    if ( this._bounds === null ) {
      const bounds = Bounds2.NOTHING.copy();
      _.each( this.subpaths, subpath => {
        bounds.includeBounds( subpath.getBounds() );
      } );
      this._bounds = bounds;
    }
    return this._bounds;
  }

  public get bounds(): Bounds2 { return this.getBounds(); }

  /**
   * Returns the bounds for a stroked version of this shape. The input lineStyles are used to determine the size and
   * style of the stroke, and then the bounds of the stroked shape are returned.
   */
  public getStrokedBounds( lineStyles: LineStyles ): Bounds2 {

    // Check if all of our segments end vertically or horizontally AND our drawable subpaths are all closed. If so,
    // we can apply a bounds dilation.
    let areStrokedBoundsDilated = true;
    for ( let i = 0; i < this.subpaths.length; i++ ) {
      const subpath = this.subpaths[ i ];

      // If a subpath with any segments is NOT closed, line-caps will apply. We can't make the simplification in this
      // case.
      if ( subpath.isDrawable() && !subpath.isClosed() ) {
        areStrokedBoundsDilated = false;
        break;
      }
      for ( let j = 0; j < subpath.segments.length; j++ ) {
        const segment = subpath.segments[ j ];
        if ( !segment.areStrokedBoundsDilated() ) {
          areStrokedBoundsDilated = false;
          break;
        }
      }
    }

    if ( areStrokedBoundsDilated ) {
      return this.bounds.dilated( lineStyles.lineWidth / 2 );
    }
    else {
      const bounds = this.bounds.copy();
      for ( let i = 0; i < this.subpaths.length; i++ ) {
        const subpaths = this.subpaths[ i ].stroked( lineStyles );
        for ( let j = 0; j < subpaths.length; j++ ) {
          bounds.includeBounds( subpaths[ j ].bounds );
        }
      }
      return bounds;
    }
  }

  /**
   * Returns a simplified form of this shape.
   *
   * Runs it through the normal CAG process, which should combine areas where possible, handles self-intersection,
   * etc.
   *
   * NOTE: Currently (2017-10-04) adjacent segments may get simplified only if they are lines. Not yet complete.
   */
  public getSimplifiedAreaShape(): Shape {
    return Graph.simplifyNonZero( this );
  }

  public getBoundsWithTransform( matrix: Matrix3, lineStyles?: LineStyles ): Bounds2 {
    const bounds = Bounds2.NOTHING.copy();

    const numSubpaths = this.subpaths.length;
    for ( let i = 0; i < numSubpaths; i++ ) {
      const subpath = this.subpaths[ i ];
      bounds.includeBounds( subpath.getBoundsWithTransform( matrix ) );
    }

    if ( lineStyles ) {
      bounds.includeBounds( this.getStrokedShape( lineStyles ).getBoundsWithTransform( matrix ) );
    }

    return bounds;
  }

  /**
   * Return an approximate value of the area inside of this Shape (where containsPoint is true) using Monte-Carlo.
   *
   * NOTE: Generally, use getArea(). This can be used for verification, but takes a large number of samples.
   *
   * @param numSamples - How many times to randomly check for inclusion of points.
   */
  public getApproximateArea( numSamples: number ): number {
    const x = this.bounds.minX;
    const y = this.bounds.minY;
    const width = this.bounds.width;
    const height = this.bounds.height;

    const rectangleArea = width * height;
    let count = 0;
    const point = new Vector2( 0, 0 );
    for ( let i = 0; i < numSamples; i++ ) {
      point.x = x + randomSource() * width;
      point.y = y + randomSource() * height;
      if ( this.containsPoint( point ) ) {
        count++;
      }
    }
    return rectangleArea * count / numSamples;
  }

  /**
   * Return the area inside the Shape (where containsPoint is true), assuming there is no self-intersection or
   * overlap, and the same orientation (winding order) is used. Should also support holes (with opposite orientation),
   * assuming they don't intersect the containing subpath.
   */
  public getNonoverlappingArea(): number {
    // Only absolute-value the final value.
    return Math.abs( _.sum( this.subpaths.map( subpath => _.sum( subpath.getFillSegments().map( segment => segment.getSignedAreaFragment() ) ) ) ) );
  }

  /**
   * Returns the area inside the shape.
   *
   * NOTE: This requires running it through a lot of computation to determine a non-overlapping non-self-intersecting
   *       form first. If the Shape is "simple" enough, getNonoverlappingArea would be preferred.
   */
  public getArea(): number {
    return this.getSimplifiedAreaShape().getNonoverlappingArea();
  }

  /**
   * Return the approximate location of the centroid of the Shape (the average of all points where containsPoint is true)
   * using Monte-Carlo methods.
   *
   * @param numSamples - How many times to randomly check for inclusion of points.
   */
  public getApproximateCentroid( numSamples: number ): Vector2 {
    const x = this.bounds.minX;
    const y = this.bounds.minY;
    const width = this.bounds.width;
    const height = this.bounds.height;

    let count = 0;
    const sum = new Vector2( 0, 0 );
    const point = new Vector2( 0, 0 );
    for ( let i = 0; i < numSamples; i++ ) {
      point.x = x + randomSource() * width;
      point.y = y + randomSource() * height;
      if ( this.containsPoint( point ) ) {
        sum.add( point );
        count++;
      }
    }
    return sum.dividedScalar( count );
  }

  /**
   * Returns an array of potential closest point results on the Shape to the given point.
   */
  public getClosestPoints( point: Vector2 ): ClosestToPointResult[] {
    return Segment.filterClosestToPointResult( _.flatten( this.subpaths.map( subpath => subpath.getClosestPoints( point ) ) ) );
  }

  /**
   * Returns a single point ON the Shape boundary that is closest to the given point (picks an arbitrary one if there
   * are multiple).
   */
  public getClosestPoint( point: Vector2 ): Vector2 {
    return this.getClosestPoints( point )[ 0 ].closestPoint;
  }

  /**
   * Should be called after mutating the x/y of Vector2 points that were passed in to various Shape calls, so that
   * derived information computed (bounds, etc.) will be correct, and any clients (e.g. Scenery Paths) will be
   * notified of the updates.
   */
  public invalidatePoints(): void {
    this._invalidatingPoints = true;

    const numSubpaths = this.subpaths.length;
    for ( let i = 0; i < numSubpaths; i++ ) {
      this.subpaths[ i ].invalidatePoints();
    }

    this._invalidatingPoints = false;
    this.invalidate();
  }

  public toString(): string {
    // TODO: consider a more verbose but safer way? https://github.com/phetsims/kite/issues/76
    return `new phet.kite.Shape( '${this.getSVGPath().trim()}' )`;
  }

  /*---------------------------------------------------------------------------*
   * Internal subpath computations
   *----------------------------------------------------------------------------*/

  private invalidate(): void {
    assert && assert( !this._immutable, 'Attempt to modify an immutable Shape' );

    if ( !this._invalidatingPoints ) {
      this._bounds = null;

      this.notifyInvalidationListeners();
    }
  }

  /**
   * Called when a part of the Shape has changed, or if metadata on the Shape has changed (e.g. it became immutable).
   */
  private notifyInvalidationListeners(): void {
    this.invalidatedEmitter.emit();
  }

  private addSegmentAndBounds( segment: Segment ): void {
    this.getLastSubpath().addSegment( segment );
    this.invalidate();
  }

  /**
   * Makes sure that we have a subpath (and if there is no subpath, start it at this point)
   */
  private ensure( point: Vector2 ): void {
    if ( !this.hasSubpaths() ) {
      this.addSubpath( new Subpath() );
      this.getLastSubpath().addPoint( point );
    }
  }

  /**
   * Adds a subpath
   */
  private addSubpath( subpath: Subpath ): this {
    this.subpaths.push( subpath );

    // listen to when the subpath is invalidated (will cause bounds recomputation here)
    subpath.invalidatedEmitter.addListener( this._invalidateListener );

    this.invalidate();

    return this; // allow chaining
  }

  /**
   * Determines if there are any subpaths
   */
  private hasSubpaths(): boolean {
    return this.subpaths.length > 0;
  }

  /**
   * Gets the last subpath
   */
  private getLastSubpath(): Subpath {
    assert && assert( this.hasSubpaths(), 'We should have a subpath if this is called' );

    return _.last( this.subpaths )!;
  }

  /**
   * Gets the last point in the last subpath, or null if it doesn't exist
   */
  public getLastPoint(): Vector2 {
    assert && assert( this.hasSubpaths(), 'We should have a subpath if this is called' );
    assert && assert( this.getLastSubpath().getLastPoint(), 'We should have a last point' );
    return this.getLastSubpath().getLastPoint();
  }

  /**
   * Gets the last drawable segment in the last subpath, or null if it doesn't exist
   */
  private getLastSegment(): Segment | null {
    if ( !this.hasSubpaths() ) { return null; }

    const subpath = this.getLastSubpath();
    if ( !subpath.isDrawable() ) { return null; }

    return subpath.getLastSegment();
  }

  /**
   * Returns the control point to be used to create a smooth quadratic segments
   */
  private getSmoothQuadraticControlPoint(): Vector2 {
    const lastPoint = this.getLastPoint();

    if ( this.lastQuadraticControlPoint ) {
      return lastPoint.plus( lastPoint.minus( this.lastQuadraticControlPoint ) );
    }
    else {
      return lastPoint;
    }
  }

  /**
   * Returns the control point to be used to create a smooth cubic segment
   */
  private getSmoothCubicControlPoint(): Vector2 {
    const lastPoint = this.getLastPoint();

    if ( this.lastCubicControlPoint ) {
      return lastPoint.plus( lastPoint.minus( this.lastCubicControlPoint ) );
    }
    else {
      return lastPoint;
    }
  }

  /**
   * Returns the last point in the last subpath, or the Vector ZERO if it doesn't exist
   */
  private getRelativePoint(): Vector2 {
    let result = Vector2.ZERO;

    if ( this.hasSubpaths() ) {
      const subpath = this.getLastSubpath();
      if ( subpath.points.length ) {
        result = subpath.getLastPoint();
      }
    }

    return result;
  }

  /**
   * Returns a new shape that contains a union of the two shapes (a point in either shape is in the resulting shape).
   */
  public shapeUnion( shape: Shape ): Shape {
    return Graph.binaryResult( this, shape, Graph.BINARY_NONZERO_UNION );
  }

  /**
   * Returns a new shape that contains the intersection of the two shapes (a point in both shapes is in the
   * resulting shape).
   */
  public shapeIntersection( shape: Shape ): Shape {
    return Graph.binaryResult( this, shape, Graph.BINARY_NONZERO_INTERSECTION );
  }

  /**
   * Returns a new shape that contains the difference of the two shapes (a point in the first shape and NOT in the
   * second shape is in the resulting shape).
   */
  public shapeDifference( shape: Shape ): Shape {
    return Graph.binaryResult( this, shape, Graph.BINARY_NONZERO_DIFFERENCE );
  }

  /**
   * Returns a new shape that contains the xor of the two shapes (a point in only one shape is in the resulting
   * shape).
   */
  public shapeXor( shape: Shape ): Shape {
    return Graph.binaryResult( this, shape, Graph.BINARY_NONZERO_XOR );
  }

  /**
   * Returns a new shape that only contains portions of segments that are within the passed-in shape's area.
   *
   * // TODO: convert Graph to TS and get the types from there https://github.com/phetsims/kite/issues/76
   */
  public shapeClip( shape: Shape, options?: { includeExterior?: boolean; includeBoundary: boolean; includeInterior: boolean } ): Shape {
    return Graph.clipShape( shape, this, options );
  }

  /**
   * Returns the (sometimes approximate) arc length of all the shape's subpaths combined.
   */
  public getArcLength( distanceEpsilon?: number, curveEpsilon?: number, maxLevels?: number ): number {
    let length = 0;
    for ( let i = 0; i < this.subpaths.length; i++ ) {
      length += this.subpaths[ i ].getArcLength( distanceEpsilon, curveEpsilon, maxLevels );
    }
    return length;
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedShape {
    return {
      type: 'Shape',
      subpaths: this.subpaths.map( subpath => subpath.serialize() )
    };
  }

  /**
   * Returns a Shape from the serialized representation.
   */
  public static deserialize( obj: SerializedShape ): Shape {
    assert && assert( obj.type === 'Shape' );

    return new Shape( obj.subpaths.map( Subpath.deserialize ) );
  }

  /**
   * Creates a rectangle
   */
  public static rectangle( x: number, y: number, width: number, height: number ): Shape {
    return new Shape().rect( x, y, width, height );
  }

  public static rect = Shape.rectangle;

  /**
   * Creates a round rectangle {Shape}, with {number} arguments. Uses circular or elliptical arcs if given.
   */
  public static roundRect( x: number, y: number, width: number, height: number, arcw: number, arch: number ): Shape {
    return new Shape().roundRect( x, y, width, height, arcw, arch );
  }

  public static roundRectangle = Shape.roundRect;

  /**
   * Creates a rounded rectangle, where each corner can have a different radius. The radii default to 0, and may be set
   * using topLeft, topRight, bottomLeft and bottomRight in the options. If the specified radii are larger than the dimension
   * on that side, they radii are reduced proportionally, see https://github.com/phetsims/under-pressure/issues/151
   *
   * E.g.:
   *
   * var cornerRadius = 20;
   * var rect = Shape.roundedRectangleWithRadii( 0, 0, 200, 100, {
   *   topLeft: cornerRadius,
   *   topRight: cornerRadius
   * } );
   *
   * @param x - Left edge position
   * @param y - Top edge position
   * @param width - Width of rectangle
   * @param height - Height of rectangle
   * @param [cornerRadii] - Optional object with potential radii for each corner.
   */
  public static roundedRectangleWithRadii( x: number, y: number, width: number, height: number, cornerRadii?: Partial<CornerRadiiOptions> ): Shape {

    // defaults to 0 (not using merge, since we reference each multiple times)
    let topLeftRadius = cornerRadii && cornerRadii.topLeft || 0;
    let topRightRadius = cornerRadii && cornerRadii.topRight || 0;
    let bottomLeftRadius = cornerRadii && cornerRadii.bottomLeft || 0;
    let bottomRightRadius = cornerRadii && cornerRadii.bottomRight || 0;

    // type and constraint assertions
    assert && assert( isFinite( x ), 'Non-finite x' );
    assert && assert( isFinite( y ), 'Non-finite y' );
    assert && assert( width >= 0 && isFinite( width ), 'Negative or non-finite width' );
    assert && assert( height >= 0 && isFinite( height ), 'Negative or non-finite height' );
    assert && assert( topLeftRadius >= 0 && isFinite( topLeftRadius ),
      'Invalid topLeft' );
    assert && assert( topRightRadius >= 0 && isFinite( topRightRadius ),
      'Invalid topRight' );
    assert && assert( bottomLeftRadius >= 0 && isFinite( bottomLeftRadius ),
      'Invalid bottomLeft' );
    assert && assert( bottomRightRadius >= 0 && isFinite( bottomRightRadius ),
      'Invalid bottomRight' );

    // The width and height take precedence over the corner radii. If the sum of the corner radii exceed
    // that dimension, then the corner radii are reduced proportionately
    const topSum = topLeftRadius + topRightRadius;
    if ( topSum > width && topSum > 0 ) {

      topLeftRadius = topLeftRadius / topSum * width;
      topRightRadius = topRightRadius / topSum * width;
    }
    const bottomSum = bottomLeftRadius + bottomRightRadius;
    if ( bottomSum > width && bottomSum > 0 ) {

      bottomLeftRadius = bottomLeftRadius / bottomSum * width;
      bottomRightRadius = bottomRightRadius / bottomSum * width;
    }
    const leftSum = topLeftRadius + bottomLeftRadius;
    if ( leftSum > height && leftSum > 0 ) {

      topLeftRadius = topLeftRadius / leftSum * height;
      bottomLeftRadius = bottomLeftRadius / leftSum * height;
    }
    const rightSum = topRightRadius + bottomRightRadius;
    if ( rightSum > height && rightSum > 0 ) {
      topRightRadius = topRightRadius / rightSum * height;
      bottomRightRadius = bottomRightRadius / rightSum * height;
    }

    // verify there is no overlap between corners
    assert && assert( topLeftRadius + topRightRadius <= width, 'Corner overlap on top edge' );
    assert && assert( bottomLeftRadius + bottomRightRadius <= width, 'Corner overlap on bottom edge' );
    assert && assert( topLeftRadius + bottomLeftRadius <= height, 'Corner overlap on left edge' );
    assert && assert( topRightRadius + bottomRightRadius <= height, 'Corner overlap on right edge' );

    const shape = new Shape();
    const right = x + width;
    const bottom = y + height;

    // To draw the rounded rectangle, we use the implicit "line from last segment to next segment" and the close() for
    // all the straight line edges between arcs, or lineTo the corner.

    if ( bottomRightRadius > 0 ) {
      shape.arc( right - bottomRightRadius, bottom - bottomRightRadius, bottomRightRadius, 0, Math.PI / 2, false );
    }
    else {
      shape.moveTo( right, bottom );
    }

    if ( bottomLeftRadius > 0 ) {
      shape.arc( x + bottomLeftRadius, bottom - bottomLeftRadius, bottomLeftRadius, Math.PI / 2, Math.PI, false );
    }
    else {
      shape.lineTo( x, bottom );
    }

    if ( topLeftRadius > 0 ) {
      shape.arc( x + topLeftRadius, y + topLeftRadius, topLeftRadius, Math.PI, 3 * Math.PI / 2, false );
    }
    else {
      shape.lineTo( x, y );
    }

    if ( topRightRadius > 0 ) {
      shape.arc( right - topRightRadius, y + topRightRadius, topRightRadius, 3 * Math.PI / 2, 2 * Math.PI, false );
    }
    else {
      shape.lineTo( right, y );
    }

    shape.close();

    return shape;
  }

  /**
   * Returns a Shape from a bounds, offset (expanded) by certain amounts, and with certain corner radii.
   */
  public static boundsOffsetWithRadii( bounds: Bounds2, offsets: OffsetsOptions, radii?: CornerRadiiOptions ): Shape {
    const offsetBounds = bounds.withOffsets( offsets.left, offsets.top, offsets.right, offsets.bottom );
    return Shape.roundedRectangleWithRadii( offsetBounds.minX, offsetBounds.minY, offsetBounds.width, offsetBounds.height, radii );
  }

  /**
   * Creates a closed polygon from an array of vertices by connecting them by a series of lines.
   * The lines are joining the adjacent vertices in the array.
   */
  public static polygon( vertices: Vector2[] ): Shape {
    return new Shape().polygon( vertices );
  }

  /**
   * Creates a rectangular shape from bounds
   */
  public static bounds( bounds: Bounds2 ): Shape {
    return new Shape().rect( bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY );
  }

  /**
   * Creates a line segment, using either (x1,y1,x2,y2) or ({x1,y1},{x2,y2}) arguments
   */
  public static lineSegment( x1: number, y1: number, x2: number, y2: number ): Shape;
  public static lineSegment( p1: Vector2, p2: Vector2 ): Shape;
  public static lineSegment( a: Vector2 | number, b: Vector2 | number, c?: number, d?: number ): Shape {
    if ( typeof a === 'number' ) {
      return new Shape().moveTo( a, b as number ).lineTo( c!, d! );
    }
    else {
      // then a and b must be {Vector2}
      return new Shape().moveToPoint( a ).lineToPoint( b as Vector2 );
    }
  }

  /**
   * Returns a regular polygon of radius and number of sides
   * The regular polygon is oriented such that the first vertex lies on the positive x-axis.
   *
   * @param sides - an integer
   * @param radius
   */
  public static regularPolygon( sides: number, radius: number ): Shape {
    const shape = new Shape();
    _.each( _.range( sides ), k => {
      const point = Vector2.createPolar( radius, 2 * Math.PI * k / sides );
      ( k === 0 ) ? shape.moveToPoint( point ) : shape.lineToPoint( point );
    } );
    return shape.close();
  }

  /**
   * Creates a circle
   * supports both circle( centerX, centerY, radius ), circle( center, radius ), and circle( radius ) with the center default to 0,0
   */
  public static circle( centerX: number, centerY: number, radius: number ): Shape;
  public static circle( center: Vector2, radius: number ): Shape;
  public static circle( radius: number ): Shape;
  public static circle( a: Vector2 | number, b?: number, c?: number ): Shape {
    if ( b === undefined ) {
      // circle( radius ), center = 0,0
      return new Shape().circle( 0, 0, a as number );
    }
    // @ts-expect-error - The signatures are compatible, it's just multiple different types at the same time
    return new Shape().circle( a, b, c );
  }

  /**
   * Supports ellipse( centerX, centerY, radiusX, radiusY, rotation ), ellipse( center, radiusX, radiusY, rotation ), and ellipse( radiusX, radiusY, rotation )
   * with the center default to 0,0 and rotation of 0.  The rotation is about the centerX, centerY.
   */
  public static ellipse( centerX: number, centerY: number, radiusX: number, radiusY: number, rotation: number ): Shape;
  public static ellipse( center: Vector2, radiusX: number, radiusY: number, rotation: number ): Shape;
  public static ellipse( radiusX: number, radiusY: number, rotation: number ): Shape;
  public static ellipse( a: Vector2 | number, b: number, c: number, d?: number, e?: number ): Shape {
    // TODO: Ellipse/EllipticalArc has a mess of parameters. Consider parameter object, or double-check parameter handling https://github.com/phetsims/kite/issues/76
    if ( d === undefined ) {
      // ellipse( radiusX, radiusY ), center = 0,0
      return new Shape().ellipse( 0, 0, a as number, b, c );
    }
    // @ts-expect-error - The signatures are compatible, it's just multiple different types at the same time
    return new Shape().ellipse( a, b, c, d, e );
  }

  /**
   * Supports both arc( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) and arc( center, radius, startAngle, endAngle, anticlockwise )
   *
   * @param radius - How far from the center the arc will be
   * @param startAngle - Angle (radians) of the start of the arc
   * @param endAngle - Angle (radians) of the end of the arc
   * @param [anticlockwise] - Decides which direction the arc takes around the center
   */
  public static arc( centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean ): Shape;
  public static arc( center: Vector2, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean ): Shape;
  public static arc( a: Vector2 | number, b: number, c: number, d: number, e?: number | boolean, f?: boolean ): Shape {
    // @ts-expect-error - The signatures are compatible, it's just multiple different types at the same time
    return new Shape().arc( a, b, c, d, e, f );
  }

  /**
   * Returns the union of an array of shapes.
   */
  public static union( shapes: Shape[] ): Shape {
    return Graph.unionNonZero( shapes );
  }

  /**
   * Returns the intersection of an array of shapes.
   */
  public static intersection( shapes: Shape[] ): Shape {
    return Graph.intersectionNonZero( shapes );
  }

  /**
   * Returns the xor of an array of shapes.
   */
  public static xor( shapes: Shape[] ): Shape {
    return Graph.xorNonZero( shapes );
  }

  /**
   * Returns a new Shape constructed by appending a list of segments together.
   */
  public static segments( segments: Segment[], closed?: boolean ): Shape {
    if ( assert ) {
      for ( let i = 1; i < segments.length; i++ ) {
        assert( segments[ i - 1 ].end.equalsEpsilon( segments[ i ].start, 1e-6 ), 'Mismatched start/end' );
      }
    }

    return new Shape( [ new Subpath( segments, undefined, !!closed ) ] );
  }

  /**
   * Returns a Shape that creates a subpath for each filled face (with the desired holes).
   *
   * Generally should be called on a graph created with createFilledSubGraph().
   */
  public static fromGraph( graph: Graph ): Shape {
    const subpaths = [];
    for ( let i = 0; i < graph.faces.length; i++ ) {
      const face = graph.faces[ i ];
      if ( face.filled ) {
        subpaths.push( Subpath.fromBoundary( face.boundary! ) );
        for ( let j = 0; j < face.holes.length; j++ ) {
          subpaths.push( Subpath.fromBoundary( face.holes[ j ] ) );
        }
      }
    }
    return new Shape( subpaths );
  }

  public static fromSegment( segment: Segment ): Shape {
    return new Shape( [ new Subpath( [ segment ] ) ] );
  }
}

kite.register( 'Shape', Shape );

export default Shape;


let bridgeId = 0;
let globalId = 0;

const VERTEX_COLLAPSE_THRESHOLD_DISTANCE = 1e-5;
const INTERSECTION_ENDPOINT_THRESHOLD_DISTANCE = 0.1 * VERTEX_COLLAPSE_THRESHOLD_DISTANCE;
const SPLIT_ENDPOINT_THRESHOLD_DISTANCE = 0.01 * VERTEX_COLLAPSE_THRESHOLD_DISTANCE;
const T_THRESHOLD = 1e-6;

export type SerializedGraph = {
  type: 'Graph';
  vertices: SerializedVertex[];
  edges: SerializedEdge[];
  boundaries: SerializedBoundary[];
  innerBoundaries: number[];
  outerBoundaries: number[];
  shapeIds: number[];
  loops: SerializedLoop[];
  unboundedFace: number;
  faces: SerializedFace[];
};

export type GraphAddOptions = {
  ensureClosed?: boolean;
};

export type GraphClipOptions = {
  // Respectively whether segments should be in the returned shape if they are in the exterior of the
  // clipAreaShape (outside), on the boundary, or in the interior.
  includeExterior?: boolean;
  includeBoundary?: boolean;
  includeInterior?: boolean;
};

/**
 * A multigraph whose edges are segments.
 *
 * Supports general shape simplification, overlap/intersection removal and computation. General output would include
 * Shapes (from CAG - Constructive Area Geometry) and triangulations.
 *
 * See Graph.binaryResult for the general procedure for CAG.
 *
 * TODO: Use https://github.com/mauriciosantos/Buckets-JS for priority queue, implement simple sweep line https://github.com/phetsims/kite/issues/76
 *       with "enters" and "leaves" entries in the queue. When edge removed, remove "leave" from queue.
 *       and add any replacement edges. Applies to overlap and intersection handling.
 *       NOTE: This should impact performance a lot, as we are currently over-scanning and re-scanning a lot.
 *       Intersection is currently (by far?) the performance bottleneck.
 * TODO: Collapse non-Line adjacent edges together. Similar logic to overlap for each segment time, hopefully can
 *       factor this out.
 * TODO: Properly handle sorting edges around a vertex when two edges have the same tangent out. We'll need to use
 *       curvature, or do tricks to follow both curves by an 'epsilon' and sort based on that.
 * TODO: Consider separating out epsilon values (may be a general Kite thing rather than just ops)
 * TODO: Loop-Blinn output and constrained Delaunay triangulation
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
export class Graph {

  public vertices: Vertex[] = [];
  public edges: Edge[] = [];

  public innerBoundaries: Boundary[] = [];
  public outerBoundaries: Boundary[] = [];
  public boundaries: Boundary[] = [];

  public shapeIds: number[] = [];
  public loops: Loop[] = [];

  public unboundedFace: Face = Face.pool.create( null );

  public faces: Face[];

  public constructor() {
    this.faces = [ this.unboundedFace ];
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedGraph {
    return {
      type: 'Graph',
      vertices: this.vertices.map( vertex => vertex.serialize() ),
      edges: this.edges.map( edge => edge.serialize() ),
      boundaries: this.boundaries.map( boundary => boundary.serialize() ),
      innerBoundaries: this.innerBoundaries.map( boundary => boundary.id ),
      outerBoundaries: this.outerBoundaries.map( boundary => boundary.id ),
      shapeIds: this.shapeIds,
      loops: this.loops.map( loop => loop.serialize() ),
      unboundedFace: this.unboundedFace.id,
      faces: this.faces.map( face => face.serialize() )
    };
  }

  /**
   * Recreate a Graph based on serialized state from serialize()
   */
  public static deserialize( obj: SerializedGraph ): Graph {
    const graph = new Graph();

    const vertexMap: Record<number, Vertex> = {};
    const edgeMap: Record<number, Edge> = {};
    const halfEdgeMap: Record<number, HalfEdge> = {};
    const boundaryMap: Record<number, Boundary> = {};
    const loopMap: Record<number, Loop> = {};
    const faceMap: Record<number, Face> = {};

    graph.vertices = obj.vertices.map( data => {
      const vertex = new Vertex( Vector2.Vector2IO.fromStateObject( data.point ) );
      vertexMap[ data.id ] = vertex;
      // incidentHalfEdges connected below
      vertex.visited = data.visited;
      vertex.visitIndex = data.visitIndex;
      vertex.lowIndex = data.lowIndex;
      return vertex;
    } );

    graph.edges = obj.edges.map( data => {
      const edge = new Edge( Segment.deserialize( data.segment ), vertexMap[ data.startVertex! ], vertexMap[ data.endVertex! ] );
      edgeMap[ data.id ] = edge;
      edge.signedAreaFragment = data.signedAreaFragment;

      const deserializeHalfEdge = ( halfEdge: HalfEdge, halfEdgeData: IntentionalAny ) => {
        halfEdgeMap[ halfEdgeData.id ] = halfEdge;
        // face connected later
        halfEdge.isReversed = halfEdgeData.isReversed;
        halfEdge.signedAreaFragment = halfEdgeData.signedAreaFragment;
        halfEdge.startVertex = vertexMap[ halfEdgeData.startVertex.id ];
        halfEdge.endVertex = vertexMap[ halfEdgeData.endVertex.id ];
        halfEdge.sortVector = Vector2.Vector2IO.fromStateObject( halfEdgeData.sortVector );
        halfEdge.data = halfEdgeData.data;
      };
      deserializeHalfEdge( edge.forwardHalf, data.forwardHalf );
      deserializeHalfEdge( edge.reversedHalf, data.reversedHalf );

      edge.visited = data.visited;
      edge.data = data.data;
      return edge;
    } );

    // Connect Vertex incidentHalfEdges
    obj.vertices.forEach( ( data, i ) => {
      const vertex = graph.vertices[ i ];
      vertex.incidentHalfEdges = data.incidentHalfEdges.map( id => halfEdgeMap[ id ] );
    } );

    graph.boundaries = obj.boundaries.map( data => {
      const boundary = Boundary.pool.create( data.halfEdges.map( id => halfEdgeMap[ id ] ) );
      boundaryMap[ data.id ] = boundary;
      boundary.signedArea = data.signedArea;
      boundary.bounds = Bounds2.Bounds2IO.fromStateObject( data.bounds );

      // childBoundaries handled below
      return boundary;
    } );
    obj.boundaries.forEach( ( data, i ) => {
      const boundary = graph.boundaries[ i ];
      boundary.childBoundaries = data.childBoundaries.map( id => boundaryMap[ id ] );
    } );
    graph.innerBoundaries = obj.innerBoundaries.map( id => boundaryMap[ id ] );
    graph.outerBoundaries = obj.outerBoundaries.map( id => boundaryMap[ id ] );

    graph.shapeIds = obj.shapeIds;

    graph.loops = obj.loops.map( data => {
      const loop = new Loop( data.shapeId, data.closed );
      loopMap[ data.id ] = loop;
      loop.halfEdges = data.halfEdges.map( id => halfEdgeMap[ id ] );
      return loop;
    } );

    graph.faces = obj.faces.map( ( data, i ) => {
      const face = i === 0 ? graph.unboundedFace : new Face( boundaryMap[ data.boundary! ] );
      faceMap[ data.id ] = face;
      face.holes = data.holes.map( id => boundaryMap[ id ] );
      face.windingMap = data.windingMap;
      face.filled = data.filled;
      return face;
    } );

    // Connected faces to halfEdges
    obj.edges.forEach( ( data, i ) => {
      const edge = graph.edges[ i ];
      edge.forwardHalf.face = data.forwardHalf.face === null ? null : faceMap[ data.forwardHalf.face ];
      edge.reversedHalf.face = data.reversedHalf.face === null ? null : faceMap[ data.reversedHalf.face ];
    } );

    return graph;
  }

  /**
   * Adds a Shape (with a given ID for CAG purposes) to the graph.
   *
   * @param shapeId - The ID which should be shared for all paths/shapes that should be combined with
   *                  respect to the winding number of faces. For CAG, independent shapes should be given
   *                  different IDs (so they have separate winding numbers recorded).
   */
  public addShape( shapeId: number, shape: Shape, options?: GraphAddOptions ): void {
    for ( let i = 0; i < shape.subpaths.length; i++ ) {
      this.addSubpath( shapeId, shape.subpaths[ i ], options );
    }
  }

  /**
   * Adds a subpath of a Shape (with a given ID for CAG purposes) to the graph.
   *
   * @param shapeId - See addShape() documentation
   */
  public addSubpath( shapeId: number, subpath: Subpath, providedOptions?: GraphAddOptions ): void {
    const options = optionize<GraphAddOptions>()( {
      ensureClosed: true
    }, providedOptions );

    // Ensure the shapeId is recorded
    if ( !this.shapeIds.includes( shapeId ) ) {
      this.shapeIds.push( shapeId );
    }

    if ( subpath.segments.length === 0 ) {
      return;
    }

    const closed = subpath.closed || options.ensureClosed;
    const segments = options.ensureClosed ? subpath.getFillSegments() : subpath.segments;
    let index;

    // Collects all of the vertices
    const vertices = [];
    for ( index = 0; index < segments.length; index++ ) {
      let previousIndex = index - 1;
      if ( previousIndex < 0 ) {
        previousIndex = segments.length - 1;
      }

      // Get the end of the previous segment and start of the next. Generally they should be equal or almost equal,
      // as it's the point at the joint of two segments.
      let end = segments[ previousIndex ].end;
      const start = segments[ index ].start;

      // If we are creating an open "loop", don't interpolate the start/end of the entire subpath together.
      if ( !closed && index === 0 ) {
        end = start;
      }

      // If they are exactly equal, don't take a chance on floating-point arithmetic
      if ( start.equals( end ) ) {
        vertices.push( Vertex.pool.create( start ) );
      }
      else {
        assert && assert( start.distance( end ) < 1e-5, 'Inaccurate start/end points' );
        vertices.push( Vertex.pool.create( start.average( end ) ) );
      }
    }
    if ( !closed ) {
      // If we aren't closed, create an "end" vertex since it may be different from the "start"
      vertices.push( Vertex.pool.create( segments[ segments.length - 1 ].end ) );
    }

    // Create the loop object from the vertices, filling in edges
    const loop = Loop.pool.create( shapeId, closed );
    for ( index = 0; index < segments.length; index++ ) {
      let nextIndex = index + 1;
      if ( closed && nextIndex === segments.length ) {
        nextIndex = 0;
      }

      const edge = Edge.pool.create( segments[ index ], vertices[ index ], vertices[ nextIndex ] );
      loop.halfEdges.push( edge.forwardHalf );
      this.addEdge( edge );
    }

    this.loops.push( loop );
    this.vertices.push( ...vertices );
  }

  /**
   * Simplifies edges/vertices, computes boundaries and faces (with the winding map).
   */
  public computeSimplifiedFaces(): void {
    // Before we find any intersections (self-intersection or between edges), we'll want to identify and fix up
    // any cases where there are an infinite number of intersections between edges (they are continuously
    // overlapping). For any overlap, we'll split it into one "overlap" edge and any remaining edges. After this
    // process, there should be no continuous overlaps.
    this.eliminateOverlap();

    // Detects any edge self-intersection, and splits it into multiple edges. This currently happens with cubics only,
    // but needs to be done before we intersect those cubics with any other edges.
    this.eliminateSelfIntersection();

    // Find inter-edge intersections (that aren't at endpoints). Splits edges involved into the intersection. After
    // this pass, we should have a well-defined graph where in the planar embedding edges don't intersect or overlap.
    this.eliminateIntersection();

    // From the above process (and input), we may have multiple vertices that occupy essentially the same location.
    // These vertices get combined into one vertex in the location. If there was a mostly-degenerate edge that was
    // very small between edges, it will be removed.
    this.collapseVertices();

    // Our graph can end up with edges that would have the same face on both sides (are considered a "bridge" edge).
    // These need to be removed, so that our face handling logic doesn't have to handle another class of cases.
    this.removeBridges();

    // Vertices can be left over where they have less than 2 incident edges, and they can be safely removed (since
    // they won't contribute to the area output).
    this.removeLowOrderVertices();

    // // TODO: Why does this resolve some things? It seems like it should be unnecessary. https://github.com/phetsims/kite/issues/98
    // this.eliminateIntersection();
    // this.collapseVertices();
    // this.removeBridges();
    // this.removeLowOrderVertices();

    // Now that the graph has well-defined vertices and edges (2-edge-connected, nonoverlapping), we'll want to know
    // the order of edges around a vertex (if you rotate around a vertex, what edges are in what order?).
    this.orderVertexEdges();

    // Extracts boundaries and faces, by following each half-edge counter-clockwise, and faces are created for
    // boundaries that have positive signed area.
    this.extractFaces();

    // We need to determine which boundaries are holes for each face. This creates a "boundary tree" where the nodes
    // are boundaries. All connected components should be one face and its holes. The holes get stored on the
    // respective face.
    this.computeBoundaryTree();

    // Compute the winding numbers of each face for each shapeId, to determine whether the input would have that
    // face "filled". It should then be ready for future processing.
    this.computeWindingMap();
  }

  /**
   * Sets whether each face should be filled or unfilled based on a filter function.
   *
   * The windingMapFilter will be called on each face's winding map, and will use the return value as whether the face
   * is filled or not.
   *
   * The winding map is an {Object} associated with each face that has a key for every shapeId that was used in
   * addShape/addSubpath, and the value for those keys is the winding number of the face given all paths with the
   * shapeId.
   *
   * For example, imagine you added two shapeIds (0 and 1), and the iteration is on a face that is included in
   * one loop specified with shapeId:0 (inside a counter-clockwise curve), and is outside of any segments specified
   * by the second loop (shapeId:1). Then the winding map will be:
   * {
   *   0: 1 // shapeId:0 has a winding number of 1 for this face (generally filled)
   *   1: 0 // shapeId:1 has a winding number of 0 for this face (generally not filled)
   * }
   *
   * Generally, winding map filters can be broken down into two steps:
   * 1. Given the winding number for each shapeId, compute whether that loop was originally filled. Normally, this is
   *    done with a non-zero rule (any winding number is filled, except zero). SVG also provides an even-odd rule
   *    (odd numbers are filled, even numbers are unfilled).
   * 2. Given booleans for each shapeId from step 1, compute CAG operations based on boolean formulas. Say you wanted
   *    to take the union of shapeIds 0 and 1, then remove anything in shapeId 2. Given the booleans above, this can
   *    be directly computed as (filled0 || filled1) && !filled2.
   */
  public computeFaceInclusion( windingMapFilter: ( windingMap: Record<number, number> ) => boolean ): void {
    for ( let i = 0; i < this.faces.length; i++ ) {
      const face = this.faces[ i ];
      face.filled = windingMapFilter( face.windingMap! );
    }
  }

  /**
   * Create a new Graph object based only on edges in this graph that separate a "filled" face from an "unfilled"
   * face.
   *
   * This is a convenient way to "collapse" adjacent filled and unfilled faces together, and compute the curves and
   * holes properly, given a filled "normal" graph.
   */
  public createFilledSubGraph(): Graph {
    const graph = new Graph();

    const vertexMap: Record<number, Vertex> = {}; // old id => newVertex

    for ( let i = 0; i < this.edges.length; i++ ) {
      const edge = this.edges[ i ];
      if ( edge.forwardHalf.face!.filled !== edge.reversedHalf.face!.filled ) {
        if ( !vertexMap[ edge.startVertex.id ] ) {
          const newStartVertex = Vertex.pool.create( edge.startVertex.point );
          graph.vertices.push( newStartVertex );
          vertexMap[ edge.startVertex.id ] = newStartVertex;
        }
        if ( !vertexMap[ edge.endVertex.id ] ) {
          const newEndVertex = Vertex.pool.create( edge.endVertex.point );
          graph.vertices.push( newEndVertex );
          vertexMap[ edge.endVertex.id ] = newEndVertex;
        }

        const startVertex = vertexMap[ edge.startVertex.id ];
        const endVertex = vertexMap[ edge.endVertex.id ];
        graph.addEdge( Edge.pool.create( edge.segment, startVertex, endVertex ) );
      }
    }

    // Run some more "simplified" processing on this graph to determine which faces are filled (after simplification).
    // We don't need the intersection or other processing steps, since this was accomplished (presumably) already
    // for the given graph.
    graph.collapseAdjacentEdges();
    graph.orderVertexEdges();
    graph.extractFaces();
    graph.computeBoundaryTree();
    graph.fillAlternatingFaces();

    return graph;
  }

  /**
   * Returns a Shape that creates a subpath for each filled face (with the desired holes).
   *
   * Generally should be called on a graph created with createFilledSubGraph().
   */
  public facesToShape(): Shape {
    const subpaths = [];
    for ( let i = 0; i < this.faces.length; i++ ) {
      const face = this.faces[ i ];
      if ( face.filled ) {
        subpaths.push( Subpath.fromBoundary( face.boundary! ) );
        for ( let j = 0; j < face.holes.length; j++ ) {
          subpaths.push( Subpath.fromBoundary( face.holes[ j ] ) );
        }
      }
    }
    return new Shape( subpaths );
  }

  /**
   * Releases owned objects to their pools, and clears references that may have been picked up from external sources.
   */
  public dispose(): void {

    // this.boundaries should contain all elements of innerBoundaries and outerBoundaries
    while ( this.boundaries.length ) {
      this.boundaries.pop()!.dispose();
    }
    cleanArray( this.innerBoundaries );
    cleanArray( this.outerBoundaries );

    while ( this.loops.length ) {
      this.loops.pop()!.dispose();
    }
    while ( this.faces.length ) {
      this.faces.pop()!.dispose();
    }
    while ( this.vertices.length ) {
      this.vertices.pop()!.dispose();
    }
    while ( this.edges.length ) {
      this.edges.pop()!.dispose();
    }
  }

  /**
   * Adds an edge to the graph (and sets up connection information).
   */
  private addEdge( edge: Edge ): void {
    assert && assert( !_.includes( edge.endVertex.incidentHalfEdges, edge.forwardHalf ), 'Should not already be connected' );

    this.edges.push( edge );
    edge.startVertex.incidentHalfEdges.push( edge.reversedHalf );
    edge.endVertex.incidentHalfEdges.push( edge.forwardHalf );
  }

  /**
   * Removes an edge from the graph (and disconnects incident information).
   */
  private removeEdge( edge: Edge ): void {
    arrayRemove( this.edges, edge );
    arrayRemove( edge.startVertex.incidentHalfEdges, edge.reversedHalf );
    arrayRemove( edge.endVertex.incidentHalfEdges, edge.forwardHalf );
  }

  /**
   * Replaces a single edge (in loops) with a series of edges (possibly empty).
   */
  private replaceEdgeInLoops( edge: Edge, forwardHalfEdges: HalfEdge[] ): void {
    // Compute reversed half-edges
    const reversedHalfEdges = [];
    for ( let i = 0; i < forwardHalfEdges.length; i++ ) {
      reversedHalfEdges.push( forwardHalfEdges[ forwardHalfEdges.length - 1 - i ].getReversed() );
    }

    for ( let i = 0; i < this.loops.length; i++ ) {
      const loop = this.loops[ i ];

      for ( let j = loop.halfEdges.length - 1; j >= 0; j-- ) {
        const halfEdge = loop.halfEdges[ j ];

        if ( halfEdge.edge === edge ) {
          const replacementHalfEdges = halfEdge === edge.forwardHalf ? forwardHalfEdges : reversedHalfEdges;
          loop.halfEdges.splice( j, 1, ...replacementHalfEdges );
        }
      }
    }
  }

  /**
   * Tries to combine adjacent edges (with a 2-order vertex) into one edge where possible.
   *
   * This helps to combine things like collinear lines, where there's a vertex that can basically be removed.
   */
  private collapseAdjacentEdges(): void {
    let needsLoop = true;
    while ( needsLoop ) {
      needsLoop = false;

      for ( let i = 0; i < this.vertices.length; i++ ) {
        const vertex = this.vertices[ i ];
        if ( vertex.incidentHalfEdges.length === 2 ) {
          const aEdge = vertex.incidentHalfEdges[ 0 ].edge;
          const bEdge = vertex.incidentHalfEdges[ 1 ].edge;
          let aSegment = aEdge.segment;
          let bSegment = bEdge.segment;
          const aVertex = aEdge.getOtherVertex( vertex );
          const bVertex = bEdge.getOtherVertex( vertex );

          assert && assert( this.loops.length === 0 );

          // TODO: Can we avoid this in the inner loop? https://github.com/phetsims/kite/issues/76
          if ( aEdge.startVertex === vertex ) {
            aSegment = aSegment.reversed();
          }
          if ( bEdge.endVertex === vertex ) {
            bSegment = bSegment.reversed();
          }

          if ( aSegment instanceof Line && bSegment instanceof Line ) {
            // See if the lines are collinear, so that we can combine them into one edge
            if ( aSegment.tangentAt( 0 ).normalized().distance( bSegment.tangentAt( 0 ).normalized() ) < 1e-6 ) {
              this.removeEdge( aEdge );
              this.removeEdge( bEdge );
              aEdge.dispose();
              bEdge.dispose();
              arrayRemove( this.vertices, vertex );
              vertex.dispose();

              const newSegment = new Line( aVertex.point, bVertex.point );
              this.addEdge( new Edge( newSegment, aVertex, bVertex ) );

              needsLoop = true;
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Gets rid of overlapping segments by combining overlaps into a shared edge.
   */
  private eliminateOverlap(): void {

    // We'll expand bounds by this amount, so that "adjacent" bounds (with a potentially overlapping vertical or
    // horizontal line) will have a non-zero amount of area overlapping.
    const epsilon = 1e-4;

    // Our queue will store entries of { start: boolean, edge: Edge }, representing a sweep line similar to the
    // Bentley-Ottmann approach. We'll track which edges are passing through the sweep line.
    // @ts-expect-error because FlatQueue is not declared as a global
    const queue: FlatQueue<{ start: boolean; edge: Edge }> = new window.FlatQueue(); // eslint-disable-line no-undef

    // Tracks which edges are through the sweep line, but in a graph structure like a segment/interval tree, so that we
    // can have fast lookup (what edges are in a certain range) and also fast inserts/removals.
    const segmentTree = new EdgeSegmentTree( epsilon );

    // Assorted operations use a shortcut to "tag" edges with a unique ID, to indicate it has already been processed
    // for this call of eliminateOverlap(). This is a higher-performance option to storing an array of "already
    // processed" edges.
    const nextId = globalId++;

    // Adds an edge to the queue
    const addToQueue = ( edge: Edge ) => {
      const bounds = edge.segment.bounds;

      // TODO: see if object allocations are slow here https://github.com/phetsims/kite/issues/76
      queue.push( { start: true, edge: edge }, bounds.minY - epsilon );
      queue.push( { start: false, edge: edge }, bounds.maxY + epsilon );
    };

    // Removes an edge from the queue (effectively... when we pop from the queue, we'll check its ID data, and if it was
    // "removed" we will ignore it. Higher-performance than using an array.
    const removeFromQueue = ( edge: Edge ) => {
      // Store the ID so we can have a high-performance removal
      edge.internalData.removedId = nextId;
    };

    for ( let i = 0; i < this.edges.length; i++ ) {
      addToQueue( this.edges[ i ] );
    }

    // We track edges to dispose separately, instead of synchronously disposing them. This is mainly due to the trick of
    // removal IDs, since if we re-used pooled Edges when creating, they would still have the ID OR they would lose the
    // "removed" information.
    const edgesToDispose = [];

    while ( queue.length ) {
      const entry = queue.pop()!;
      const edge = entry.edge;

      // Skip edges we already removed
      if ( edge.internalData.removedId === nextId ) {
        continue;
      }

      if ( entry.start ) {
        // We'll bail out of the loop if we find overlaps, and we'll store the relevant information in these
        let found = false;
        let overlappedEdge!: Edge;
        let addedEdges!: Edge[];

        // TODO: Is this closure killing performance? https://github.com/phetsims/kite/issues/76
        segmentTree.query( edge, otherEdge => {
          const overlaps = edge.segment.getOverlaps( otherEdge.segment );

          if ( overlaps !== null && overlaps.length ) {
            for ( let k = 0; k < overlaps.length; k++ ) {
              const overlap = overlaps[ k ];
              if ( Math.abs( overlap.t1 - overlap.t0 ) > 1e-5 &&
                   Math.abs( overlap.qt1 - overlap.qt0 ) > 1e-5 ) {

                addedEdges = this.splitOverlap( edge, otherEdge, overlap );
                found = true;
                overlappedEdge = otherEdge;
                return true;
              }
            }
          }

          return false;
        } );

        if ( found ) {
          // We haven't added our edge yet, so no need to remove it.
          segmentTree.removeItem( overlappedEdge );

          // Adjust the queue
          removeFromQueue( overlappedEdge );
          removeFromQueue( edge );
          for ( let i = 0; i < addedEdges.length; i++ ) {
            addToQueue( addedEdges[ i ] );
          }

          edgesToDispose.push( edge );
          edgesToDispose.push( overlappedEdge );
        }
        else {
          // No overlaps found, add it and continue
          segmentTree.addItem( edge );
        }
      }
      else {
        // Removal can't trigger an intersection, so we can safely remove it
        segmentTree.removeItem( edge );
      }
    }

    for ( let i = 0; i < edgesToDispose.length; i++ ) {
      edgesToDispose[ i ].dispose();
    }
  }

  /**
   * Splits/combines edges when there is an overlap of two edges (two edges who have an infinite number of
   * intersection points).
   *
   * NOTE: This does NOT dispose aEdge/bEdge, due to eliminateOverlap's needs.
   *
   * Generally this creates an edge for the "shared" part of both segments, and then creates edges for the parts
   * outside of the shared region, connecting them together.
   */
  private splitOverlap( aEdge: Edge, bEdge: Edge, overlap: Overlap ): Edge[] {
    const newEdges = [];

    const aSegment = aEdge.segment;
    const bSegment = bEdge.segment;

    // Remove the edges from before
    this.removeEdge( aEdge );
    this.removeEdge( bEdge );

    let t0 = overlap.t0;
    let t1 = overlap.t1;
    let qt0 = overlap.qt0;
    let qt1 = overlap.qt1;

    // Apply rounding so we don't generate really small segments on the ends
    if ( t0 < 1e-5 ) { t0 = 0; }
    if ( t1 > 1 - 1e-5 ) { t1 = 1; }
    if ( qt0 < 1e-5 ) { qt0 = 0; }
    if ( qt1 > 1 - 1e-5 ) { qt1 = 1; }

    // Whether there will be remaining edges on each side.
    const aBefore = t0 > 0 ? aSegment.subdivided( t0 )[ 0 ] : null;
    const bBefore = qt0 > 0 ? bSegment.subdivided( qt0 )[ 0 ] : null;
    const aAfter = t1 < 1 ? aSegment.subdivided( t1 )[ 1 ] : null;
    const bAfter = qt1 < 1 ? bSegment.subdivided( qt1 )[ 1 ] : null;

    let middle = aSegment;
    if ( t0 > 0 ) {
      middle = middle.subdivided( t0 )[ 1 ];
    }
    if ( t1 < 1 ) {
      middle = middle.subdivided( linear( t0, 1, 0, 1, t1 ) )[ 0 ];
    }

    let beforeVertex;
    if ( aBefore && bBefore ) {
      beforeVertex = Vertex.pool.create( middle.start );
      this.vertices.push( beforeVertex );
    }
    else if ( aBefore ) {
      beforeVertex = overlap.a > 0 ? bEdge.startVertex : bEdge.endVertex;
    }
    else {
      beforeVertex = aEdge.startVertex;
    }

    let afterVertex;
    if ( aAfter && bAfter ) {
      afterVertex = Vertex.pool.create( middle.end );
      this.vertices.push( afterVertex );
    }
    else if ( aAfter ) {
      afterVertex = overlap.a > 0 ? bEdge.endVertex : bEdge.startVertex;
    }
    else {
      afterVertex = aEdge.endVertex;
    }

    const middleEdge = Edge.pool.create( middle, beforeVertex, afterVertex );
    newEdges.push( middleEdge );

    let aBeforeEdge!: Edge;
    let aAfterEdge!: Edge;
    let bBeforeEdge!: Edge;
    let bAfterEdge!: Edge;

    // Add "leftover" edges
    if ( aBefore ) {
      aBeforeEdge = Edge.pool.create( aBefore, aEdge.startVertex, beforeVertex );
      newEdges.push( aBeforeEdge );
    }
    if ( aAfter ) {
      aAfterEdge = Edge.pool.create( aAfter, afterVertex, aEdge.endVertex );
      newEdges.push( aAfterEdge );
    }
    if ( bBefore ) {
      bBeforeEdge = Edge.pool.create( bBefore, bEdge.startVertex, overlap.a > 0 ? beforeVertex : afterVertex );
      newEdges.push( bBeforeEdge );
    }
    if ( bAfter ) {
      bAfterEdge = Edge.pool.create( bAfter, overlap.a > 0 ? afterVertex : beforeVertex, bEdge.endVertex );
      newEdges.push( bAfterEdge );
    }

    for ( let i = 0; i < newEdges.length; i++ ) {
      this.addEdge( newEdges[ i ] );
    }

    // Collect "replacement" edges
    const aEdges: Edge[] = ( aBefore ? [ aBeforeEdge ] : [] ).concat( [ middleEdge ] ).concat( aAfter ? [ aAfterEdge ] : [] );
    const bEdges: Edge[] = ( bBefore ? [ bBeforeEdge ] : [] ).concat( [ middleEdge ] ).concat( bAfter ? [ bAfterEdge ] : [] );

    const aForwardHalfEdges = [];
    const bForwardHalfEdges = [];

    for ( let i = 0; i < aEdges.length; i++ ) {
      aForwardHalfEdges.push( aEdges[ i ].forwardHalf );
    }
    for ( let i = 0; i < bEdges.length; i++ ) {
      // Handle reversing the "middle" edge
      const isForward = bEdges[ i ] !== middleEdge || overlap.a > 0;
      bForwardHalfEdges.push( isForward ? bEdges[ i ].forwardHalf : bEdges[ i ].reversedHalf );
    }

    // Replace edges in the loops
    this.replaceEdgeInLoops( aEdge, aForwardHalfEdges );
    this.replaceEdgeInLoops( bEdge, bForwardHalfEdges );

    return newEdges;
  }

  /**
   * Handles splitting of self-intersection of segments (happens with Cubics).
   */
  private eliminateSelfIntersection(): void {
    assert && assert( this.boundaries.length === 0, 'Only handles simpler level primitive splitting right now' );

    for ( let i = this.edges.length - 1; i >= 0; i-- ) {
      const edge = this.edges[ i ];
      const segment = edge.segment;

      if ( segment instanceof Cubic ) {
        // TODO: This might not properly handle when it only one endpoint is on the curve https://github.com/phetsims/kite/issues/76
        const selfIntersection = segment.getSelfIntersection();

        if ( selfIntersection ) {
          assert && assert( selfIntersection.aT < selfIntersection.bT );

          const segments = segment.subdivisions( [ selfIntersection.aT, selfIntersection.bT ] );

          const vertex = Vertex.pool.create( selfIntersection.point );
          this.vertices.push( vertex );

          const startEdge = Edge.pool.create( segments[ 0 ], edge.startVertex, vertex );
          const middleEdge = Edge.pool.create( segments[ 1 ], vertex, vertex );
          const endEdge = Edge.pool.create( segments[ 2 ], vertex, edge.endVertex );

          this.removeEdge( edge );

          this.addEdge( startEdge );
          this.addEdge( middleEdge );
          this.addEdge( endEdge );

          this.replaceEdgeInLoops( edge, [ startEdge.forwardHalf, middleEdge.forwardHalf, endEdge.forwardHalf ] );

          edge.dispose();
        }
      }
    }
  }

  /**
   * Replace intersections between different segments by splitting them and creating a vertex.
   */
  private eliminateIntersection(): void {

    // We'll expand bounds by this amount, so that "adjacent" bounds (with a potentially overlapping vertical or
    // horizontal line) will have a non-zero amount of area overlapping.
    const epsilon = 1e-4;

    // Our queue will store entries of { start: boolean, edge: Edge }, representing a sweep line similar to the
    // Bentley-Ottmann approach. We'll track which edges are passing through the sweep line.
    // @ts-expect-error because FlatQueue is not declared as a global
    const queue: FlatQueue<{ start: boolean; edge: Edge }> = new window.FlatQueue(); // eslint-disable-line no-undef

    // Tracks which edges are through the sweep line, but in a graph structure like a segment/interval tree, so that we
    // can have fast lookup (what edges are in a certain range) and also fast inserts/removals.
    const segmentTree = new EdgeSegmentTree( epsilon );

    // Assorted operations use a shortcut to "tag" edges with a unique ID, to indicate it has already been processed
    // for this call of eliminateOverlap(). This is a higher-performance option to storing an array of "already
    // processed" edges.
    const nextId = globalId++;

    // Adds an edge to the queue
    const addToQueue = ( edge: Edge ) => {
      const bounds = edge.segment.bounds;

      // TODO: see if object allocations are slow here https://github.com/phetsims/kite/issues/76
      queue.push( { start: true, edge: edge }, bounds.minY - epsilon );
      queue.push( { start: false, edge: edge }, bounds.maxY + epsilon );
    };

    // Removes an edge from the queue (effectively... when we pop from the queue, we'll check its ID data, and if it was
    // "removed" we will ignore it. Higher-performance than using an array.
    const removeFromQueue = ( edge: Edge ) => {
      // Store the ID so we can have a high-performance removal
      edge.internalData.removedId = nextId;
    };

    for ( let i = 0; i < this.edges.length; i++ ) {
      addToQueue( this.edges[ i ] );
    }

    // We track edges to dispose separately, instead of synchronously disposing them. This is mainly due to the trick of
    // removal IDs, since if we re-used pooled Edges when creating, they would still have the ID OR they would lose the
    // "removed" information.
    const edgesToDispose: Edge[] = [];

    while ( queue.length ) {
      const entry = queue.pop()!;
      const edge = entry.edge;

      // Skip edges we already removed
      if ( edge.internalData.removedId === nextId ) {
        continue;
      }

      if ( entry.start ) {
        // We'll bail out of the loop if we find overlaps, and we'll store the relevant information in these
        let found = false;
        let overlappedEdge!: Edge;
        let addedEdges!: Edge[];
        let removedEdges!: Edge[];

        // TODO: Is this closure killing performance? https://github.com/phetsims/kite/issues/76
        segmentTree.query( edge, otherEdge => {

          const aSegment = edge.segment;
          const bSegment = otherEdge.segment;
          let intersections = Segment.intersect( aSegment, bSegment );
          intersections = intersections.filter( intersection => {
            const point = intersection.point;

            // Filter out endpoint-to-endpoint intersections, and at a radius where they would get collapsed into an
            // endpoint anyway. If it's "internal" to one segment, we'll keep it.
            return Graph.isInternal( point, intersection.aT, aSegment, INTERSECTION_ENDPOINT_THRESHOLD_DISTANCE, T_THRESHOLD ) ||
                   Graph.isInternal( point, intersection.bT, bSegment, INTERSECTION_ENDPOINT_THRESHOLD_DISTANCE, T_THRESHOLD );
          } );
          if ( intersections.length ) {

            // TODO: In the future, handle multiple intersections (instead of re-running) https://github.com/phetsims/kite/issues/76
            const intersection = intersections[ 0 ];

            const result = this.simpleSplit( edge, otherEdge, intersection.aT, intersection.bT, intersection.point );

            if ( result ) {
              found = true;
              overlappedEdge = otherEdge;
              addedEdges = result.addedEdges;
              removedEdges = result.removedEdges;
              return true;
            }
          }

          return false;
        } );

        if ( found ) {
          // If we didn't "remove" that edge, we'll still need to add it in.
          if ( removedEdges.includes( edge ) ) {
            removeFromQueue( edge );
            edgesToDispose.push( edge );
          }
          else {
            segmentTree.addItem( edge );
          }
          if ( removedEdges.includes( overlappedEdge ) ) {
            segmentTree.removeItem( overlappedEdge );
            removeFromQueue( overlappedEdge );
            edgesToDispose.push( overlappedEdge );
          }

          // Adjust the queue
          for ( let i = 0; i < addedEdges.length; i++ ) {
            addToQueue( addedEdges[ i ] );
          }
        }
        else {
          // No overlaps found, add it and continue
          segmentTree.addItem( edge );
        }
      }
      else {
        // Removal can't trigger an intersection, so we can safely remove it
        segmentTree.removeItem( edge );
      }
    }

    for ( let i = 0; i < edgesToDispose.length; i++ ) {
      edgesToDispose[ i ].dispose();
    }
  }

  /**
   * Handles splitting two intersecting edges.
   *
   * @param aT - Parametric t value of the intersection for aEdge
   * @param bT - Parametric t value of the intersection for bEdge
   * @param point - Location of the intersection
   */
  private simpleSplit(
    aEdge: Edge,
    bEdge: Edge,
    aT: number,
    bT: number,
    point: Vector2
  ): { addedEdges: Edge[]; removedEdges: Edge[] } | null {
    const aInternal = Graph.isInternal( point, aT, aEdge.segment, SPLIT_ENDPOINT_THRESHOLD_DISTANCE, T_THRESHOLD );
    const bInternal = Graph.isInternal( point, bT, bEdge.segment, SPLIT_ENDPOINT_THRESHOLD_DISTANCE, T_THRESHOLD );

    let vertex = null;
    if ( !aInternal ) {
      vertex = aT < 0.5 ? aEdge.startVertex : aEdge.endVertex;
    }
    else if ( !bInternal ) {
      vertex = bT < 0.5 ? bEdge.startVertex : bEdge.endVertex;
    }
    else {
      vertex = Vertex.pool.create( point );
      this.vertices.push( vertex );
    }

    let changed = false;
    const addedEdges = [];
    const removedEdges = [];

    if ( aInternal && vertex !== aEdge.startVertex && vertex !== aEdge.endVertex ) {
      addedEdges.push( ...this.splitEdge( aEdge, aT, vertex ) );
      removedEdges.push( aEdge );
      changed = true;
    }
    if ( bInternal && vertex !== bEdge.startVertex && vertex !== bEdge.endVertex ) {
      addedEdges.push( ...this.splitEdge( bEdge, bT, vertex ) );
      removedEdges.push( bEdge );
      changed = true;
    }

    return changed ? {
      addedEdges: addedEdges,
      removedEdges: removedEdges
    } : null;
  }

  /**
   * Splits an edge into two edges at a specific parametric t value.
   *
   * @param vertex - The vertex that is placed at the split location
   */
  private splitEdge( edge: Edge, t: number, vertex: Vertex ): Edge[] {
    assert && assert( this.boundaries.length === 0, 'Only handles simpler level primitive splitting right now' );
    assert && assert( edge.startVertex !== vertex );
    assert && assert( edge.endVertex !== vertex );

    const segments = edge.segment.subdivided( t );
    assert && assert( segments.length === 2 );

    const firstEdge = Edge.pool.create( segments[ 0 ], edge.startVertex, vertex );
    const secondEdge = Edge.pool.create( segments[ 1 ], vertex, edge.endVertex );

    // Remove old connections
    this.removeEdge( edge );

    // Add new connections
    this.addEdge( firstEdge );
    this.addEdge( secondEdge );

    this.replaceEdgeInLoops( edge, [ firstEdge.forwardHalf, secondEdge.forwardHalf ] );

    return [ firstEdge, secondEdge ];
  }

  /**
   * Combine vertices that are almost exactly in the same place (removing edges and vertices where necessary).
   */
  private collapseVertices(): void {
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.startVertex ) ) );
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.endVertex ) ) );

    // We'll expand bounds by this amount, so that "adjacent" bounds (with a potentially overlapping vertical or
    // horizontal line) will have a non-zero amount of area overlapping.
    const epsilon = 10 * VERTEX_COLLAPSE_THRESHOLD_DISTANCE; // TODO: could we reduce this factor to closer to the distance? https://github.com/phetsims/kite/issues/98

    // Our queue will store entries of { start: boolean, vertex: Vertex }, representing a sweep line similar to the
    // Bentley-Ottmann approach. We'll track which edges are passing through the sweep line.
    // @ts-expect-error because FlatQueue is not declared as a global
    const queue: FlatQueue<{ start: boolean; vertex: Vertex }> = new window.FlatQueue(); // eslint-disable-line no-undef

    // Tracks which vertices are through the sweep line, but in a graph structure like a segment/interval tree, so that
    // we can have fast lookup (what vertices are in a certain range) and also fast inserts/removals.
    const segmentTree = new VertexSegmentTree( epsilon );

    // Assorted operations use a shortcut to "tag" vertices with a unique ID, to indicate it has already been processed
    // for this call of eliminateOverlap(). This is a higher-performance option to storing an array of "already
    // processed" edges.
    const nextId = globalId++;

    // Adds an vertex to the queue
    const addToQueue = ( vertex: Vertex ) => {
      // TODO: see if object allocations are slow here https://github.com/phetsims/kite/issues/76
      queue.push( { start: true, vertex: vertex }, vertex.point.y - epsilon );
      queue.push( { start: false, vertex: vertex }, vertex.point.y + epsilon );
    };

    // Removes a vertex from the queue (effectively... when we pop from the queue, we'll check its ID data, and if it
    // was "removed" we will ignore it. Higher-performance than using an array.
    const removeFromQueue = ( vertex: Vertex ) => {
      // Store the ID so we can have a high-performance removal
      vertex.internalData.removedId = nextId;
    };

    for ( let i = 0; i < this.vertices.length; i++ ) {
      addToQueue( this.vertices[ i ] );
    }

    // We track vertices to dispose separately, instead of synchronously disposing them. This is mainly due to the trick
    // of removal IDs, since if we re-used pooled Vertices when creating, they would still have the ID OR they would
    // lose the "removed" information.
    const verticesToDispose = [];

    while ( queue.length ) {
      const entry = queue.pop()!;
      const vertex = entry.vertex;

      // Skip vertices we already removed
      if ( vertex.internalData.removedId === nextId ) {
        continue;
      }

      if ( entry.start ) {
        // We'll bail out of the loop if we find overlaps, and we'll store the relevant information in these
        let found = false;
        let overlappedVertex!: Vertex;
        let addedVertices!: Vertex[];

        // TODO: Is this closure killing performance? https://github.com/phetsims/kite/issues/76
        segmentTree.query( vertex, otherVertex => {
          const distance = vertex.point.distance( otherVertex.point );
          if ( distance < VERTEX_COLLAPSE_THRESHOLD_DISTANCE ) {

              const newVertex = Vertex.pool.create( distance === 0 ? vertex.point : vertex.point.average( otherVertex.point ) );
              this.vertices.push( newVertex );

              arrayRemove( this.vertices, vertex );
              arrayRemove( this.vertices, otherVertex );
              for ( let k = this.edges.length - 1; k >= 0; k-- ) {
                const edge = this.edges[ k ];
                const startMatches = edge.startVertex === vertex || edge.startVertex === otherVertex;
                const endMatches = edge.endVertex === vertex || edge.endVertex === otherVertex;

                // Outright remove edges that were between A and B that aren't loops
                if ( startMatches && endMatches ) {
                  if ( ( edge.segment.bounds.width > 1e-5 || edge.segment.bounds.height > 1e-5 ) &&
                       ( edge.segment instanceof Cubic || edge.segment instanceof Arc || edge.segment instanceof EllipticalArc ) ) {
                    // Replace it with a new edge that is from the vertex to itself
                    const replacementEdge = Edge.pool.create( edge.segment, newVertex, newVertex );
                    this.addEdge( replacementEdge );
                    this.replaceEdgeInLoops( edge, [ replacementEdge.forwardHalf ] );
                  }
                  else {
                    this.replaceEdgeInLoops( edge, [] ); // remove the edge from loops with no replacement
                  }
                  this.removeEdge( edge );
                  edge.dispose();
                }
                else if ( startMatches ) {
                  edge.startVertex = newVertex;
                  newVertex.incidentHalfEdges.push( edge.reversedHalf );
                  edge.updateReferences();
                }
                else if ( endMatches ) {
                  edge.endVertex = newVertex;
                  newVertex.incidentHalfEdges.push( edge.forwardHalf );
                  edge.updateReferences();
                }
              }

            addedVertices = [ newVertex ];
            found = true;
            overlappedVertex = otherVertex;
            return true;
          }

          return false;
        } );

        if ( found ) {
          // We haven't added our edge yet, so no need to remove it.
          segmentTree.removeItem( overlappedVertex );

          // Adjust the queue
          removeFromQueue( overlappedVertex );
          removeFromQueue( vertex );
          for ( let i = 0; i < addedVertices.length; i++ ) {
            addToQueue( addedVertices[ i ] );
          }

          verticesToDispose.push( vertex );
          verticesToDispose.push( overlappedVertex );
        }
        else {
          // No overlaps found, add it and continue
          segmentTree.addItem( vertex );
        }
      }
      else {
        // Removal can't trigger an intersection, so we can safely remove it
        segmentTree.removeItem( vertex );
      }
    }

    for ( let i = 0; i < verticesToDispose.length; i++ ) {
      verticesToDispose[ i ].dispose();
    }

    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.startVertex ) ) );
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.endVertex ) ) );
  }

  /**
   * Scan a given vertex for bridges recursively with a depth-first search.
   *
   * Records visit times to each vertex, and back-propagates so that we can efficiently determine if there was another
   * path around to the vertex.
   *
   * Assumes this is only called one time once all edges/vertices are set up. Repeated calls will fail because we
   * don't mark visited/etc. references again on startup
   *
   * See Tarjan's algorithm for more information. Some modifications were needed, since this is technically a
   * multigraph/pseudograph (can have edges that have the same start/end vertex, and can have multiple edges
   * going from the same two vertices).
   *
   * @param bridges - Appends bridge edges to here.
   */
  private markBridges( bridges: Edge[], vertex: Vertex ): void {
    vertex.visited = true;
    vertex.visitIndex = vertex.lowIndex = bridgeId++;

    for ( let i = 0; i < vertex.incidentHalfEdges.length; i++ ) {
      const edge = vertex.incidentHalfEdges[ i ].edge;
      const childVertex = vertex.incidentHalfEdges[ i ].startVertex!; // by definition, our vertex should be the endVertex
      if ( !childVertex.visited ) {
        edge.visited = true;
        this.markBridges( bridges, childVertex );

        // Check if there's another route that reaches back to our vertex from an ancestor
        vertex.lowIndex = Math.min( vertex.lowIndex, childVertex.lowIndex );

        // If there was no route, then we reached a bridge
        if ( childVertex.lowIndex > vertex.visitIndex ) {
          bridges.push( edge );
        }
      }
      else if ( !edge.visited ) {
        vertex.lowIndex = Math.min( vertex.lowIndex, childVertex.visitIndex );
      }
    }
  }

  /**
   * Removes edges that are the only edge holding two connected components together. Based on our problem, the
   * face on either side of the "bridge" edges would always be the same, so we can safely remove them.
   */
  private removeBridges(): void {
    const bridges: Edge[] = [];

    for ( let i = 0; i < this.vertices.length; i++ ) {
      const vertex = this.vertices[ i ];
      if ( !vertex.visited ) {
        this.markBridges( bridges, vertex );
      }
    }

    for ( let i = 0; i < bridges.length; i++ ) {
      const bridgeEdge = bridges[ i ];

      this.removeEdge( bridgeEdge );
      this.replaceEdgeInLoops( bridgeEdge, [] );
      bridgeEdge.dispose();
    }
  }

  /**
   * Removes vertices that have order less than 2 (so either a vertex with one or zero edges adjacent).
   */
  private removeLowOrderVertices(): void {
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.startVertex ) ) );
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.endVertex ) ) );

    let needsLoop = true;
    while ( needsLoop ) {
      needsLoop = false;

      for ( let i = this.vertices.length - 1; i >= 0; i-- ) {
        const vertex = this.vertices[ i ];

        if ( vertex.incidentHalfEdges.length < 2 ) {
          // Disconnect any existing edges
          for ( let j = 0; j < vertex.incidentHalfEdges.length; j++ ) {
            const edge = vertex.incidentHalfEdges[ j ].edge;
            this.removeEdge( edge );
            this.replaceEdgeInLoops( edge, [] ); // remove the edge from the loops
            edge.dispose();
          }

          // Remove the vertex
          this.vertices.splice( i, 1 );
          vertex.dispose();

          needsLoop = true;
          break;
        }
      }
    }
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.startVertex ) ) );
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.endVertex ) ) );
  }

  /**
   * Sorts incident half-edges for each vertex.
   */
  private orderVertexEdges(): void {
    for ( let i = 0; i < this.vertices.length; i++ ) {
      this.vertices[ i ].sortEdges();
    }
  }

  /**
   * Creates boundaries and faces by following each half-edge counter-clockwise
   */
  private extractFaces(): void {
    const halfEdges = [];
    for ( let i = 0; i < this.edges.length; i++ ) {
      halfEdges.push( this.edges[ i ].forwardHalf );
      halfEdges.push( this.edges[ i ].reversedHalf );
    }

    while ( halfEdges.length ) {
      const boundaryHalfEdges = [];
      let halfEdge = halfEdges[ 0 ];
      const startingHalfEdge = halfEdge;
      while ( halfEdge ) {
        arrayRemove( halfEdges, halfEdge );
        boundaryHalfEdges.push( halfEdge );
        halfEdge = halfEdge.getNext();
        if ( halfEdge === startingHalfEdge ) {
          break;
        }
      }
      const boundary = Boundary.pool.create( boundaryHalfEdges );
      ( boundary.signedArea > 0 ? this.innerBoundaries : this.outerBoundaries ).push( boundary );
      this.boundaries.push( boundary );
    }

    for ( let i = 0; i < this.innerBoundaries.length; i++ ) {
      this.faces.push( Face.pool.create( this.innerBoundaries[ i ] ) );
    }
  }

  /**
   * Given the inner and outer boundaries, it computes a tree representation to determine what boundaries are
   * holes of what other boundaries, then sets up face holes with the result.
   *
   * This information is stored in the childBoundaries array of Boundary, and is then read out to set up faces.
   */
  public computeBoundaryTree(): void {
    // TODO: detect "indeterminate" for robustness (and try new angles?) https://github.com/phetsims/kite/issues/76
    const unboundedHoles = []; // {Array.<Boundary>}

    // We'll want to compute a ray for each outer boundary that starts at an extreme point for that direction and
    // continues outwards. The next boundary it intersects will be linked together in the tree.
    // We have a mostly-arbitrary angle here that hopefully won't be used.
    const transform = new Transform3( Matrix3.rotation2( 1.5729657 ) );

    for ( let i = 0; i < this.outerBoundaries.length; i++ ) {
      const outerBoundary = this.outerBoundaries[ i ];

      const ray = outerBoundary.computeExtremeRay( transform );

      let closestEdge: Edge | null = null;
      let closestDistance: number = Number.POSITIVE_INFINITY;
      let closestWind!: number;

      for ( let j = 0; j < this.edges.length; j++ ) {
        const edge = this.edges[ j ];

        const intersections = edge.segment.intersection( ray );
        for ( let k = 0; k < intersections.length; k++ ) {
          const intersection = intersections[ k ];

          if ( intersection.distance < closestDistance ) {
            closestEdge = edge;
            closestDistance = intersection.distance;
            closestWind = intersection.wind;
          }
        }
      }

      if ( closestEdge === null ) {
        unboundedHoles.push( outerBoundary );
      }
      else {
        const reversed = closestWind < 0;
        const closestHalfEdge = reversed ? closestEdge.reversedHalf : closestEdge.forwardHalf;
        const closestBoundary = this.getBoundaryOfHalfEdge( closestHalfEdge );
        closestBoundary.childBoundaries.push( outerBoundary );
      }
    }

    unboundedHoles.forEach( this.unboundedFace.recursivelyAddHoles.bind( this.unboundedFace ) );
    for ( let i = 0; i < this.faces.length; i++ ) {
      const face = this.faces[ i ];
      if ( face.boundary !== null ) {
        face.boundary.childBoundaries.forEach( face.recursivelyAddHoles.bind( face ) );
      }
    }
  }

  /**
   * Computes the winding map for each face, starting with 0 on the unbounded face (for each shapeId).
   */
  private computeWindingMap(): void {
    const edges = this.edges.slice();

    // Winding numbers for "outside" are 0.
    const outsideMap: Record<number, number> = {};
    for ( let i = 0; i < this.shapeIds.length; i++ ) {
      outsideMap[ this.shapeIds[ i ] ] = 0;
    }
    this.unboundedFace.windingMap = outsideMap;

    // We have "solved" the unbounded face, and then iteratively go over the edges looking for a case where we have
    // solved one of the faces that is adjacent to that edge. We can then compute the difference between winding
    // numbers between the two faces, and thus determine the (absolute) winding numbers for the unsolved face.
    while ( edges.length ) {
      for ( let j = edges.length - 1; j >= 0; j-- ) {
        const edge = edges[ j ];

        const forwardHalf = edge.forwardHalf;
        const reversedHalf = edge.reversedHalf;

        const forwardFace = forwardHalf.face!;
        const reversedFace = reversedHalf.face!;
        assert && assert( forwardFace !== reversedFace );

        const solvedForward = forwardFace.windingMap !== null;
        const solvedReversed = reversedFace.windingMap !== null;

        if ( solvedForward && solvedReversed ) {
          edges.splice( j, 1 );

          if ( assert ) {
            for ( let m = 0; m < this.shapeIds.length; m++ ) {
              const id = this.shapeIds[ m ];
              assert( forwardFace.windingMap![ id ] - reversedFace.windingMap![ id ] === this.computeDifferential( edge, id ) );
            }
          }
        }
        else if ( !solvedForward && !solvedReversed ) {
          continue;
        }
        else {
          const solvedFace = solvedForward ? forwardFace : reversedFace;
          const unsolvedFace = solvedForward ? reversedFace : forwardFace;

          const windingMap: Record<number, number> = {};
          for ( let k = 0; k < this.shapeIds.length; k++ ) {
            const shapeId = this.shapeIds[ k ];
            const differential = this.computeDifferential( edge, shapeId );
            windingMap[ shapeId ] = solvedFace.windingMap![ shapeId ] + differential * ( solvedForward ? -1 : 1 );
          }
          unsolvedFace.windingMap = windingMap;
        }
      }
    }
  }

  /**
   * Computes the differential in winding numbers (forward face winding number minus the reversed face winding number)
   * ("forward face" is the face on the forward half-edge side, etc.)
   *
   * @returns - The difference between forward face and reversed face winding numbers.
   */
  private computeDifferential( edge: Edge, shapeId: number ): number {
    let differential = 0; // forward face - reversed face
    for ( let m = 0; m < this.loops.length; m++ ) {
      const loop = this.loops[ m ];
      assert && assert( loop.closed, 'This is only defined to work for closed loops' );
      if ( loop.shapeId !== shapeId ) {
        continue;
      }

      for ( let n = 0; n < loop.halfEdges.length; n++ ) {
        const loopHalfEdge = loop.halfEdges[ n ];
        if ( loopHalfEdge === edge.forwardHalf ) {
          differential++;
        }
        else if ( loopHalfEdge === edge.reversedHalf ) {
          differential--;
        }
      }
    }
    return differential;
  }

  /**
   * Sets the unbounded face as unfilled, and then sets each face's fill so that edges separate one filled face with
   * one unfilled face.
   *
   * NOTE: Best to call this on the result from createFilledSubGraph(), since it should have guaranteed properties
   *       to make this consistent. Notably, all vertices need to have an even order (number of edges)
   */
  private fillAlternatingFaces(): void {
    let nullFaceFilledCount = 0;
    for ( let i = 0; i < this.faces.length; i++ ) {
      this.faces[ i ].filled = null;
      nullFaceFilledCount++;
    }

    this.unboundedFace.filled = false;
    nullFaceFilledCount--;

    while ( nullFaceFilledCount ) {
      for ( let i = 0; i < this.edges.length; i++ ) {
        const edge = this.edges[ i ];
        const forwardFace = edge.forwardHalf.face!;
        const reversedFace = edge.reversedHalf.face!;

        const forwardNull = forwardFace.filled === null;
        const reversedNull = reversedFace.filled === null;

        if ( forwardNull && !reversedNull ) {
          forwardFace.filled = !reversedFace.filled;
          nullFaceFilledCount--;
        }
        else if ( !forwardNull && reversedNull ) {
          reversedFace.filled = !forwardFace.filled;
          nullFaceFilledCount--;
        }
      }
    }
  }

  /**
   * Returns the boundary that contains the specified half-edge.
   *
   * TODO: find a better way, this is crazy inefficient https://github.com/phetsims/kite/issues/76
   */
  private getBoundaryOfHalfEdge( halfEdge: HalfEdge ): Boundary {
    for ( let i = 0; i < this.boundaries.length; i++ ) {
      const boundary = this.boundaries[ i ];

      if ( boundary.hasHalfEdge( halfEdge ) ) {
        return boundary;
      }
    }

    throw new Error( 'Could not find boundary' );
  }

  public static isInternal( point: Vector2, t: number, segment: Segment, distanceThreshold: number, tThreshold: number ): boolean {
    return t > tThreshold &&
           t < ( 1 - tThreshold ) &&
           point.distance( segment.start ) > distanceThreshold &&
           point.distance( segment.end ) > distanceThreshold;
  }

  /**
   * "Union" binary winding map filter for use with Graph.binaryResult.
   *
   * This combines both shapes together so that a point is in the resulting shape if it was in either of the input
   * shapes.
   *
   * @param windingMap - See computeFaceInclusion for more details
   */
  public static BINARY_NONZERO_UNION( windingMap: Record<number, number> ): boolean {
    return windingMap[ '0' ] !== 0 || windingMap[ '1' ] !== 0;
  }

  /**
   * "Intersection" binary winding map filter for use with Graph.binaryResult.
   *
   * This combines both shapes together so that a point is in the resulting shape if it was in both of the input
   * shapes.
   *
   * @param windingMap - See computeFaceInclusion for more details
   */
  public static BINARY_NONZERO_INTERSECTION( windingMap: Record<number, number> ): boolean {
    return windingMap[ '0' ] !== 0 && windingMap[ '1' ] !== 0;
  }

  /**
   * "Difference" binary winding map filter for use with Graph.binaryResult.
   *
   * This combines both shapes together so that a point is in the resulting shape if it was in the first shape AND
   * was NOT in the second shape.
   *
   * @param windingMap - See computeFaceInclusion for more details
   */
  public static BINARY_NONZERO_DIFFERENCE( windingMap: Record<number, number> ): boolean {
    return windingMap[ '0' ] !== 0 && windingMap[ '1' ] === 0;
  }

  /**
   * "XOR" binary winding map filter for use with Graph.binaryResult.
   *
   * This combines both shapes together so that a point is in the resulting shape if it is only in exactly one of the
   * input shapes. It's like the union minus intersection.
   *
   * @param windingMap - See computeFaceInclusion for more details
   */
  public static BINARY_NONZERO_XOR( windingMap: Record<number, number> ): boolean {
    return ( windingMap[ '0' ] !== 0 ) !== ( windingMap[ '1' ] !== 0 );
  }

  /**
   * Returns the resulting Shape obtained by combining the two shapes given with the filter.
   */
  public static binaryResult( shapeA: Shape, shapeB: Shape, windingMapFilter: ( windingMap: Record<number, number> ) => boolean ): Shape {
    const graph = new Graph();
    graph.addShape( 0, shapeA );
    graph.addShape( 1, shapeB );

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( windingMapFilter );
    const subgraph = graph.createFilledSubGraph();
    const shape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return shape;
  }

  /**
   * Returns the union of an array of shapes.
   */
  public static unionNonZero( shapes: Shape[] ): Shape {
    const graph = new Graph();
    for ( let i = 0; i < shapes.length; i++ ) {
      graph.addShape( i, shapes[ i ] );
    }

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( windingMap => {
      for ( let j = 0; j < shapes.length; j++ ) {
        if ( windingMap[ j ] !== 0 ) {
          return true;
        }
      }
      return false;
    } );
    const subgraph = graph.createFilledSubGraph();
    const shape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return shape;
  }

  /**
   * Returns the intersection of an array of shapes.
   */
  public static intersectionNonZero( shapes: Shape[] ): Shape {
    const graph = new Graph();
    for ( let i = 0; i < shapes.length; i++ ) {
      graph.addShape( i, shapes[ i ] );
    }

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( windingMap => {
      for ( let j = 0; j < shapes.length; j++ ) {
        if ( windingMap[ j ] === 0 ) {
          return false;
        }
      }
      return true;
    } );
    const subgraph = graph.createFilledSubGraph();
    const shape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return shape;
  }

  /**
   * Returns the xor of an array of shapes.
   *
   * TODO: reduce code duplication? https://github.com/phetsims/kite/issues/76
   */
  public static xorNonZero( shapes: Shape[] ): Shape {
    const graph = new Graph();
    for ( let i = 0; i < shapes.length; i++ ) {
      graph.addShape( i, shapes[ i ] );
    }

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( windingMap => {
      let included = false;
      for ( let j = 0; j < shapes.length; j++ ) {
        if ( windingMap[ j ] !== 0 ) {
          included = !included;
        }
      }
      return included;
    } );
    const subgraph = graph.createFilledSubGraph();
    const shape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return shape;
  }

  /**
   * Returns a simplified Shape obtained from running it through the simplification steps with non-zero output.
   */
  public static simplifyNonZero( shape: Shape ): Shape {
    const graph = new Graph();
    graph.addShape( 0, shape );

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( map => map[ '0' ] !== 0 );
    const subgraph = graph.createFilledSubGraph();
    const resultShape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return resultShape;
  }

  /**
   * Returns a clipped version of `shape` that contains only the parts that are within the area defined by
   * `clipAreaShape`
   */
  public static clipShape( clipAreaShape: Shape, shape: Shape, providedOptions?: GraphClipOptions ): Shape {
    let i;
    let j;
    let loop;

    const SHAPE_ID = 0;
    const CLIP_SHAPE_ID = 1;

    const options = optionize<GraphClipOptions>()( {
      includeExterior: false,
      includeBoundary: true,
      includeInterior: true
    }, providedOptions );

    const simplifiedClipAreaShape = Graph.simplifyNonZero( clipAreaShape );

    const graph = new Graph();
    graph.addShape( SHAPE_ID, shape, {
      ensureClosed: false // don't add closing segments, since we'll be recreating subpaths/etc.
    } );
    graph.addShape( CLIP_SHAPE_ID, simplifiedClipAreaShape );

    // A subset of simplifications (we want to keep low-order vertices, etc.)
    graph.eliminateOverlap();
    graph.eliminateSelfIntersection();
    graph.eliminateIntersection();
    graph.collapseVertices();

    // Mark clip edges with data=true
    for ( i = 0; i < graph.loops.length; i++ ) {
      loop = graph.loops[ i ];
      if ( loop.shapeId === CLIP_SHAPE_ID ) {
        for ( j = 0; j < loop.halfEdges.length; j++ ) {
          loop.halfEdges[ j ].edge.data = true;
        }
      }
    }

    const subpaths = [];
    for ( i = 0; i < graph.loops.length; i++ ) {
      loop = graph.loops[ i ];
      if ( loop.shapeId === SHAPE_ID ) {
        let segments = [];
        for ( j = 0; j < loop.halfEdges.length; j++ ) {
          const halfEdge = loop.halfEdges[ j ];

          const included = halfEdge.edge.data ? options.includeBoundary : (
            simplifiedClipAreaShape.containsPoint( halfEdge.edge.segment.positionAt( 0.5 ) ) ? options.includeInterior : options.includeExterior
          );
          if ( included ) {
            segments.push( halfEdge.getDirectionalSegment() );
          }
            // If we have an excluded segment in-between included segments, we'll need to split into more subpaths to handle
          // the gap.
          else if ( segments.length ) {
            subpaths.push( new Subpath( segments, undefined, loop.closed ) );
            segments = [];
          }
        }
        if ( segments.length ) {
          subpaths.push( new Subpath( segments, undefined, loop.closed ) );
        }
      }
    }

    graph.dispose();

    return new Shape( subpaths );
  }
}

kite.register( 'Graph', Graph );