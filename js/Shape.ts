// Copyright 2013-2024, University of Colorado Boulder

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
import { Arc, ClosestToPointResult, Cubic, EllipticalArc, Graph, kite, Line, LineStyles, PiecewiseLinearOptions, Quadratic, RayIntersection, Segment, Subpath, svgNumber, svgPath } from './imports.js';
import { SerializedSubpath } from './util/Subpath.js';

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
  [ K in keyof CanApplyParsedSVG ]: CanApplyParsedSVG[ K ] extends ( ...args: infer Args ) => Shape ? { cmd: K; args: Args } : never;
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
    return `new phet.kite.Shape( '${this.getSVGPath()}' )`;
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
}

kite.register( 'Shape', Shape );

export default Shape;