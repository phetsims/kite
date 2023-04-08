// Copyright 2013-2023, University of Colorado Boulder

/**
 * A line segment (all points directly between the start and end point)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import Ray2 from '../../../dot/js/Ray2.js';
import Utils from '../../../dot/js/Utils.js';
import Vector2 from '../../../dot/js/Vector2.js';
import { Arc, ClosestToPointResult, kite, Overlap, PiecewiseLinearOptions, RayIntersection, Segment, SegmentIntersection, svgNumber } from '../imports.js';

const scratchVector2 = new Vector2( 0, 0 );

type SerializedLine = {
  type: 'Line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export default class Line extends Segment {

  private _start: Vector2;
  private _end: Vector2;

  private _tangent!: Vector2 | null;
  private _bounds!: Bounds2 | null;
  private _svgPathFragment!: string | null;

  /**
   * @param start - Start point
   * @param end - End point
   */
  public constructor( start: Vector2, end: Vector2 ) {
    super();

    this._start = start;
    this._end = end;

    this.invalidate();
  }

  /**
   * Sets the start point of the Line.
   */
  public setStart( start: Vector2 ): this {
    assert && assert( start.isFinite(), `Line start should be finite: ${start.toString()}` );

    if ( !this._start.equals( start ) ) {
      this._start = start;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set start( value: Vector2 ) { this.setStart( value ); }

  public get start(): Vector2 { return this.getStart(); }

  /**
   * Returns the start of this Line.
   */
  public getStart(): Vector2 {
    return this._start;
  }


  /**
   * Sets the end point of the Line.
   */
  public setEnd( end: Vector2 ): this {
    assert && assert( end.isFinite(), `Line end should be finite: ${end.toString()}` );

    if ( !this._end.equals( end ) ) {
      this._end = end;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set end( value: Vector2 ) { this.setEnd( value ); }

  public get end(): Vector2 { return this.getEnd(); }

  /**
   * Returns the end of this Line.
   */
  public getEnd(): Vector2 {
    return this._end;
  }


  /**
   * Returns the position parametrically, with 0 <= t <= 1.
   *
   * NOTE: positionAt( 0 ) will return the start of the segment, and positionAt( 1 ) will return the end of the
   * segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public positionAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'positionAt t should be non-negative' );
    assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

    return this._start.plus( this._end.minus( this._start ).times( t ) );
  }

  /**
   * Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
   *
   * NOTE: tangentAt( 0 ) will return the tangent at the start of the segment, and tangentAt( 1 ) will return the
   * tangent at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public tangentAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'tangentAt t should be non-negative' );
    assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

    // tangent always the same, just use the start tangent
    return this.getStartTangent();
  }

  /**
   * Returns the signed curvature of the segment at the parametric value t, where 0 <= t <= 1.
   *
   * The curvature will be positive for visual clockwise / mathematical counterclockwise curves, negative for opposite
   * curvature, and 0 for no curvature.
   *
   * NOTE: curvatureAt( 0 ) will return the curvature at the start of the segment, and curvatureAt( 1 ) will return
   * the curvature at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public curvatureAt( t: number ): number {
    assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
    assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

    return 0; // no curvature on a straight line segment
  }

  /**
   * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
   * up the same shape as the current segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public subdivided( t: number ): Segment[] {
    assert && assert( t >= 0, 'subdivided t should be non-negative' );
    assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

    // If t is 0 or 1, we only need to return 1 segment
    if ( t === 0 || t === 1 ) {
      return [ this ];
    }

    const pt = this.positionAt( t );
    return [
      new Line( this._start, pt ),
      new Line( pt, this._end )
    ];
  }

  /**
   * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   */
  public invalidate(): void {
    assert && assert( this._start instanceof Vector2, `Line start should be a Vector2: ${this._start}` );
    assert && assert( this._start.isFinite(), `Line start should be finite: ${this._start.toString()}` );
    assert && assert( this._end instanceof Vector2, `Line end should be a Vector2: ${this._end}` );
    assert && assert( this._end.isFinite(), `Line end should be finite: ${this._end.toString()}` );

    // Lazily-computed derived information
    this._tangent = null;
    this._bounds = null;
    this._svgPathFragment = null;

    this.invalidationEmitter.emit();
  }

  /**
   * Returns a normalized unit vector that is tangent to this line (at the starting point)
   * the unit vectors points toward the end points.
   */
  public getStartTangent(): Vector2 {
    if ( this._tangent === null ) {
      // TODO: allocation reduction
      this._tangent = this._end.minus( this._start ).normalized();
    }
    return this._tangent;
  }

  public get startTangent(): Vector2 { return this.getStartTangent(); }

  /**
   * Returns the normalized unit vector that is tangent to this line
   * same as getStartTangent, since this is a straight line
   */
  public getEndTangent(): Vector2 {
    return this.getStartTangent();
  }

  public get endTangent(): Vector2 { return this.getEndTangent(); }

  /**
   * Returns the bounds of this segment.
   */
  public getBounds(): Bounds2 {
    // TODO: allocation reduction
    if ( this._bounds === null ) {
      this._bounds = Bounds2.NOTHING.copy().addPoint( this._start ).addPoint( this._end );
    }
    return this._bounds;
  }

  public get bounds(): Bounds2 { return this.getBounds(); }

  /**
   * Returns the bounding box for this transformed Line
   */
  public override getBoundsWithTransform( matrix: Matrix3 ): Bounds2 {
    // uses mutable calls
    const bounds = Bounds2.NOTHING.copy();
    bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._start ) ) );
    bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._end ) ) );
    return bounds;
  }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   */
  public getNondegenerateSegments(): Segment[] {
    // if it is degenerate (0-length), just ignore it
    if ( this._start.equals( this._end ) ) {
      return [];
    }
    else {
      return [ this ];
    }
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided,
   * so anything that calls this needs to put the M calls first
   */
  public getSVGPathFragment(): string {
    let oldPathFragment;
    if ( assert ) {
      oldPathFragment = this._svgPathFragment;
      this._svgPathFragment = null;
    }
    if ( !this._svgPathFragment ) {
      this._svgPathFragment = `L ${svgNumber( this._end.x )} ${svgNumber( this._end.y )}`;
    }
    if ( assert ) {
      if ( oldPathFragment ) {
        assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
      }
    }
    return this._svgPathFragment;
  }

  /**
   * Returns an array of Line that will draw an offset curve on the logical left side
   */
  public strokeLeft( lineWidth: number ): Line[] {
    const offset = this.getEndTangent().perpendicular.negated().times( lineWidth / 2 );
    return [ new Line( this._start.plus( offset ), this._end.plus( offset ) ) ];
  }

  /**
   * Returns an array of Line that will draw an offset curve on the logical right side
   */
  public strokeRight( lineWidth: number ): Line[] {
    const offset = this.getStartTangent().perpendicular.times( lineWidth / 2 );
    return [ new Line( this._end.plus( offset ), this._start.plus( offset ) ) ];
  }

  /**
   * In general, this method returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   * Since lines are already monotone, it returns an empty array.
   */
  public getInteriorExtremaTs(): number[] { return []; }

  /**
   * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
   * For details, see the documentation in Segment.js
   */
  public intersection( ray: Ray2 ): RayIntersection[] {
    // We solve for the parametric line-line intersection, and then ensure the parameters are within both
    // the line segment and forwards from the ray.

    const result: RayIntersection[] = [];

    const start = this._start;
    const end = this._end;

    const diff = end.minus( start );

    if ( diff.magnitudeSquared === 0 ) {
      return result;
    }

    const denom = ray.direction.y * diff.x - ray.direction.x * diff.y;

    // If denominator is 0, the lines are parallel or coincident
    if ( denom === 0 ) {
      return result;
    }

    // linear parameter where start (0) to end (1)
    const t = ( ray.direction.x * ( start.y - ray.position.y ) - ray.direction.y * ( start.x - ray.position.x ) ) / denom;

    // check that the intersection point is between the line segment's endpoints
    if ( t < 0 || t >= 1 ) {
      return result;
    }

    // linear parameter where ray.position (0) to ray.position+ray.direction (1)
    const s = ( diff.x * ( start.y - ray.position.y ) - diff.y * ( start.x - ray.position.x ) ) / denom;

    // bail if it is behind our ray
    if ( s < 0.00000001 ) {
      return result;
    }

    // return the proper winding direction depending on what way our line intersection is "pointed"
    const perp = diff.perpendicular;

    const intersectionPoint = start.plus( diff.times( t ) );
    const normal = ( perp.dot( ray.direction ) > 0 ? perp.negated() : perp ).normalized();
    const wind = ray.direction.perpendicular.dot( diff ) < 0 ? 1 : -1;
    result.push( new RayIntersection( s, intersectionPoint, normal, wind, t ) );
    return result;
  }

  /**
   * Returns the resultant winding number of a ray intersecting this line.
   */
  public windingIntersection( ray: Ray2 ): number {
    const hits = this.intersection( ray );
    if ( hits.length ) {
      return hits[ 0 ].wind;
    }
    else {
      return 0;
    }
  }

  /**
   * Draws this line to the 2D Canvas context, assuming the context's current location is already at the start point
   */
  public writeToContext( context: CanvasRenderingContext2D ): void {
    context.lineTo( this._end.x, this._end.y );
  }

  /**
   * Returns a new Line that represents this line after transformation by the matrix
   */
  public transformed( matrix: Matrix3 ): Line {
    return new Line( matrix.timesVector2( this._start ), matrix.timesVector2( this._end ) );
  }

  /**
   * Returns an object that gives information about the closest point (on a line segment) to the point argument
   */
  public explicitClosestToPoint( point: Vector2 ): ClosestToPointResult[] {
    const diff = this._end.minus( this._start );
    let t = point.minus( this._start ).dot( diff ) / diff.magnitudeSquared;
    t = Utils.clamp( t, 0, 1 );
    const closestPoint = this.positionAt( t );
    return [
      {
        segment: this,
        t: t,
        closestPoint: closestPoint,
        distanceSquared: point.distanceSquared( closestPoint )
      }
    ];
  }

  /**
   * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
   *
   * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
   */
  public getSignedAreaFragment(): number {
    return 1 / 2 * ( this._start.x * this._end.y - this._start.y * this._end.x );
  }

  /**
   * Given the current curve parameterized by t, will return a curve parameterized by x where t = a * x + b
   */
  public reparameterized( a: number, b: number ): Line {
    return new Line( this.positionAt( b ), this.positionAt( a + b ) );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   */
  public reversed(): Line {
    return new Line( this._end, this._start );
  }

  /**
   * Convert a line in the $(theta,r)$ plane of the form $(\theta_1,r_1)$ to $(\theta_2,r_2)$ and
   * converts to the cartesian coordinate system
   *
   * E.g. a polar line (0,1) to (2 Pi,1) would be mapped to a circle of radius 1
   */
  public polarToCartesian( options: PiecewiseLinearOptions ): Segment[] {
    // x represent an angle whereas y represent a radius
    if ( this._start.x === this._end.x ) {
      // angle is the same, we are still a line segment!
      return [ new Line( Vector2.createPolar( this._start.y, this._start.x ), Vector2.createPolar( this._end.y, this._end.x ) ) ];
    }
    else if ( this._start.y === this._end.y ) {
      // we have a constant radius, so we are a circular arc
      return [ new Arc( Vector2.ZERO, this._start.y, this._start.x, this._end.x, this._start.x > this._end.x ) ];
    }
    else {
      return this.toPiecewiseLinearSegments( options );
    }
  }

  /**
   * Returns the arc length of the segment.
   */
  public override getArcLength(): number {
    return this.start.distance( this.end );
  }

  /**
   * We can handle this simply by returning ourselves.
   */
  public override toPiecewiseLinearOrArcSegments(): Segment[] {
    return [ this ];
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedLine {
    return {
      type: 'Line',
      startX: this._start.x,
      startY: this._start.y,
      endX: this._end.x,
      endY: this._end.y
    };
  }

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * @param segment
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public getOverlaps( segment: Segment, epsilon = 1e-6 ): Overlap[] | null {
    if ( segment instanceof Line ) {
      return Line.getOverlaps( this, segment );
    }

    return null;
  }

  public override getClosestPoints( point: Vector2 ): ClosestToPointResult[] {
    const delta = this._end.minus( this._start );

    // Normalized start => end
    const normalizedDirection = delta.normalized();

    // Normalized distance along the line from the start to the point
    const intersectionNormalized = point.minus( this._start ).dot( normalizedDirection );

    const intersectionT = Utils.clamp( intersectionNormalized / delta.magnitude, 0, 1 );

    const intersectionPoint = this.positionAt( intersectionT );

    return [ {
      segment: this,
      t: intersectionT,
      closestPoint: intersectionPoint,
      distanceSquared: intersectionPoint.distanceSquared( point )
    } ];
  }

  /**
   * Returns a Line from the serialized representation.
   */
  public static override deserialize( obj: SerializedLine ): Line {
    assert && assert( obj.type === 'Line' );

    return new Line( new Vector2( obj.startX, obj.startY ), new Vector2( obj.endX, obj.endY ) );
  }

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * @param line1
   * @param line2
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public static getOverlaps( line1: Line, line2: Line, epsilon = 1e-6 ): Overlap[] {

    /*
     * NOTE: For implementation details in this function, please see Cubic.getOverlaps. It goes over all of the
     * same implementation details, but instead our bezier matrix is a 2x2:
     *
     * [  1  0 ]
     * [ -1  1 ]
     *
     * And we use the upper-left section of (at+b) adjustment matrix relevant for the line.
     */

    const noOverlap: Overlap[] = [];

    // Efficiently compute the multiplication of the bezier matrix:
    const p0x = line1._start.x;
    const p1x = -1 * line1._start.x + line1._end.x;
    const p0y = line1._start.y;
    const p1y = -1 * line1._start.y + line1._end.y;
    const q0x = line2._start.x;
    const q1x = -1 * line2._start.x + line2._end.x;
    const q0y = line2._start.y;
    const q1y = -1 * line2._start.y + line2._end.y;

    // Determine the candidate overlap (preferring the dimension with the largest variation)
    const xSpread = Math.abs( Math.max( line1._start.x, line1._end.x, line2._start.x, line2._end.x ) -
                              Math.min( line1._start.x, line1._end.x, line2._start.x, line2._end.x ) );
    const ySpread = Math.abs( Math.max( line1._start.y, line1._end.y, line2._start.y, line2._end.y ) -
                              Math.min( line1._start.y, line1._end.y, line2._start.y, line2._end.y ) );
    const xOverlap = Segment.polynomialGetOverlapLinear( p0x, p1x, q0x, q1x );
    const yOverlap = Segment.polynomialGetOverlapLinear( p0y, p1y, q0y, q1y );
    let overlap;
    if ( xSpread > ySpread ) {
      overlap = ( xOverlap === null || xOverlap === true ) ? yOverlap : xOverlap;
    }
    else {
      overlap = ( yOverlap === null || yOverlap === true ) ? xOverlap : yOverlap;
    }
    if ( overlap === null || overlap === true ) {
      return noOverlap; // No way to pin down an overlap
    }

    const a = overlap.a;
    const b = overlap.b;

    // Compute linear coefficients for the difference between p(t) and q(a*t+b)
    const d0x = q0x + b * q1x - p0x;
    const d1x = a * q1x - p1x;
    const d0y = q0y + b * q1y - p0y;
    const d1y = a * q1y - p1y;

    // Examine the single-coordinate distances between the "overlaps" at each extreme T value. If the distance is larger
    // than our epsilon, then the "overlap" would not be valid.
    if ( Math.abs( d0x ) > epsilon ||
         Math.abs( d1x + d0x ) > epsilon ||
         Math.abs( d0y ) > epsilon ||
         Math.abs( d1y + d0y ) > epsilon ) {
      // We're able to efficiently hardcode these for the line-line case, since there are no extreme t values that are
      // not t=0 or t=1.
      return noOverlap;
    }

    const qt0 = b;
    const qt1 = a + b;

    // TODO: do we want an epsilon in here to be permissive?
    if ( ( qt0 > 1 && qt1 > 1 ) || ( qt0 < 0 && qt1 < 0 ) ) {
      return noOverlap;
    }

    return [ new Overlap( a, b ) ];
  }

  /**
   * Returns any (finite) intersection between the two line segments.
   */
  public static override intersect( a: Line, b: Line ): SegmentIntersection[] {

    const lineSegmentIntersection = Utils.lineSegmentIntersection(
      a.start.x, a.start.y, a.end.x, a.end.y,
      b.start.x, b.start.y, b.end.x, b.end.y
    );

    if ( lineSegmentIntersection !== null ) {
      const aT = a.explicitClosestToPoint( lineSegmentIntersection )[ 0 ].t;
      const bT = b.explicitClosestToPoint( lineSegmentIntersection )[ 0 ].t;
      return [ new SegmentIntersection( lineSegmentIntersection, aT, bT ) ];
    }
    else {
      return [];
    }
  }

  /**
   * Returns any intersections between a line segment and another type of segment.
   *
   * This should be more optimized than the general intersection routine of arbitrary segments.
   */
  public static intersectOther( line: Line, other: Segment ): SegmentIntersection[] {

    // Set up a ray
    const delta = line.end.minus( line.start );
    const length = delta.magnitude;
    const ray = new Ray2( line.start, delta.normalize() );

    // Find the other segment's intersections with the ray
    const rayIntersections = other.intersection( ray );

    const results = [];
    for ( let i = 0; i < rayIntersections.length; i++ ) {
      const rayIntersection = rayIntersections[ i ];
      const lineT = rayIntersection.distance / length;

      // Exclude intersections that are outside our line segment (or right on the boundary)
      if ( lineT > 1e-8 && lineT < 1 - 1e-8 ) {
        results.push( new SegmentIntersection( rayIntersection.point, lineT, rayIntersection.t ) );
      }
    }
    return results;
  }
}

kite.register( 'Line', Line );
