// Copyright 2013-2022, University of Colorado Boulder

/**
 * An elliptical arc (a continuous sub-part of an ellipse).
 *
 * Additional helpful notes:
 * - http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
 * - http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-ellipse
 *   (note: context.ellipse was removed from the Canvas spec)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import Ray2 from '../../../dot/js/Ray2.js';
import Transform3 from '../../../dot/js/Transform3.js';
import Utils from '../../../dot/js/Utils.js';
import Vector2 from '../../../dot/js/Vector2.js';
import Enumeration from '../../../phet-core/js/Enumeration.js';
import EnumerationValue from '../../../phet-core/js/EnumerationValue.js';
import { Arc, BoundsIntersection, kite, Line, Overlap, RayIntersection, Segment, SegmentIntersection, svgNumber } from '../imports.js';

// constants
const toDegrees = Utils.toDegrees;

type SerializedEllipticalArc = {
  type: 'EllipticalArc';
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
};

export default class EllipticalArc extends Segment {

  private _center: Vector2;
  private _radiusX: number;
  private _radiusY: number;
  private _rotation: number;
  private _startAngle: number;
  private _endAngle: number;
  private _anticlockwise: boolean;

  // Lazily-computed derived information
  private _unitTransform!: Transform3 | null; // Mapping between our ellipse and a unit circle
  private _start!: Vector2 | null;
  private _end!: Vector2 | null;
  private _startTangent!: Vector2 | null;
  private _endTangent!: Vector2 | null;
  private _actualEndAngle!: number | null; // End angle in relation to our start angle (can get remapped)
  private _isFullPerimeter!: boolean | null; // Whether it's a full ellipse (and not just an arc)
  private _angleDifference!: number | null;
  private _unitArcSegment!: Arc | null; // Corresponding circular arc for our unit transform.
  private _bounds!: Bounds2 | null;
  private _svgPathFragment!: string | null;

  private possibleExtremaAngles?: number[];

  /**
   * If the startAngle/endAngle difference is ~2pi, this will be a full ellipse
   *
   * @param center - Center of the ellipse
   * @param radiusX - Semi-major radius
   * @param radiusY - Semi-minor radius
   * @param rotation - Rotation of the semi-major axis
   * @param startAngle - Angle (radians) of the start of the arc
   * @param endAngle - Angle (radians) of the end of the arc
   * @param anticlockwise - Decides which direction the arc takes around the center
   */
  public constructor( center: Vector2, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise: boolean ) {
    super();

    this._center = center;
    this._radiusX = radiusX;
    this._radiusY = radiusY;
    this._rotation = rotation;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;

    this.invalidate();
  }

  /**
   * Sets the center of the EllipticalArc.
   */
  public setCenter( center: Vector2 ): this {
    assert && assert( center.isFinite(), `EllipticalArc center should be finite: ${center.toString()}` );

    if ( !this._center.equals( center ) ) {
      this._center = center;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set center( value: Vector2 ) { this.setCenter( value ); }

  public get center(): Vector2 { return this.getCenter(); }


  /**
   * Returns the center of this EllipticalArc.
   */
  public getCenter(): Vector2 {
    return this._center;
  }


  /**
   * Sets the semi-major radius of the EllipticalArc.
   */
  public setRadiusX( radiusX: number ): this {
    assert && assert( isFinite( radiusX ), `EllipticalArc radiusX should be a finite number: ${radiusX}` );

    if ( this._radiusX !== radiusX ) {
      this._radiusX = radiusX;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set radiusX( value: number ) { this.setRadiusX( value ); }

  public get radiusX(): number { return this.getRadiusX(); }


  /**
   * Returns the semi-major radius of this EllipticalArc.
   */
  public getRadiusX(): number {
    return this._radiusX;
  }


  /**
   * Sets the semi-minor radius of the EllipticalArc.
   */
  public setRadiusY( radiusY: number ): this {
    assert && assert( isFinite( radiusY ), `EllipticalArc radiusY should be a finite number: ${radiusY}` );

    if ( this._radiusY !== radiusY ) {
      this._radiusY = radiusY;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set radiusY( value: number ) { this.setRadiusY( value ); }

  public get radiusY(): number { return this.getRadiusY(); }

  /**
   * Returns the semi-minor radius of this EllipticalArc.
   */
  public getRadiusY(): number {
    return this._radiusY;
  }


  /**
   * Sets the rotation of the EllipticalArc.
   */
  public setRotation( rotation: number ): this {
    assert && assert( isFinite( rotation ), `EllipticalArc rotation should be a finite number: ${rotation}` );

    if ( this._rotation !== rotation ) {
      this._rotation = rotation;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set rotation( value: number ) { this.setRotation( value ); }

  public get rotation(): number { return this.getRotation(); }

  /**
   * Returns the rotation of this EllipticalArc.
   */
  public getRotation(): number {
    return this._rotation;
  }


  /**
   * Sets the startAngle of the EllipticalArc.
   */
  public setStartAngle( startAngle: number ): this {
    assert && assert( isFinite( startAngle ), `EllipticalArc startAngle should be a finite number: ${startAngle}` );

    if ( this._startAngle !== startAngle ) {
      this._startAngle = startAngle;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set startAngle( value: number ) { this.setStartAngle( value ); }

  public get startAngle(): number { return this.getStartAngle(); }

  /**
   * Returns the startAngle of this EllipticalArc.
   */
  public getStartAngle(): number {
    return this._startAngle;
  }


  /**
   * Sets the endAngle of the EllipticalArc.
   */
  public setEndAngle( endAngle: number ): this {
    assert && assert( isFinite( endAngle ), `EllipticalArc endAngle should be a finite number: ${endAngle}` );

    if ( this._endAngle !== endAngle ) {
      this._endAngle = endAngle;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set endAngle( value: number ) { this.setEndAngle( value ); }

  public get endAngle(): number { return this.getEndAngle(); }

  /**
   * Returns the endAngle of this EllipticalArc.
   */
  public getEndAngle(): number {
    return this._endAngle;
  }


  /**
   * Sets the anticlockwise of the EllipticalArc.
   */
  public setAnticlockwise( anticlockwise: boolean ): this {
    if ( this._anticlockwise !== anticlockwise ) {
      this._anticlockwise = anticlockwise;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set anticlockwise( value: boolean ) { this.setAnticlockwise( value ); }

  public get anticlockwise(): boolean { return this.getAnticlockwise(); }

  /**
   * Returns the anticlockwise of this EllipticalArc.
   */
  public getAnticlockwise(): boolean {
    return this._anticlockwise;
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

    return this.positionAtAngle( this.angleAt( t ) );
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

    return this.tangentAtAngle( this.angleAt( t ) );
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

    // see http://mathworld.wolfram.com/Ellipse.html (59)
    const angle = this.angleAt( t );
    const aq = this._radiusX * Math.sin( angle );
    const bq = this._radiusY * Math.cos( angle );
    const denominator = Math.pow( bq * bq + aq * aq, 3 / 2 );
    return ( this._anticlockwise ? -1 : 1 ) * this._radiusX * this._radiusY / denominator;
  }

  /**
   * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
   * up the same shape as the current segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public subdivided( t: number ): EllipticalArc[] {
    assert && assert( t >= 0, 'subdivided t should be non-negative' );
    assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

    // If t is 0 or 1, we only need to return 1 segment
    if ( t === 0 || t === 1 ) {
      return [ this ];
    }

    // TODO: verify that we don't need to switch anticlockwise here, or subtract 2pi off any angles
    const angle0 = this.angleAt( 0 );
    const angleT = this.angleAt( t );
    const angle1 = this.angleAt( 1 );
    return [
      new EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angle0, angleT, this._anticlockwise ),
      new EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angleT, angle1, this._anticlockwise )
    ];
  }

  /**
   * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   */
  public invalidate(): void {

    assert && assert( this._center instanceof Vector2, 'Arc center should be a Vector2' );
    assert && assert( this._center.isFinite(), 'Arc center should be finite (not NaN or infinite)' );
    assert && assert( typeof this._radiusX === 'number', `Arc radiusX should be a number: ${this._radiusX}` );
    assert && assert( isFinite( this._radiusX ), `Arc radiusX should be a finite number: ${this._radiusX}` );
    assert && assert( typeof this._radiusY === 'number', `Arc radiusY should be a number: ${this._radiusY}` );
    assert && assert( isFinite( this._radiusY ), `Arc radiusY should be a finite number: ${this._radiusY}` );
    assert && assert( typeof this._rotation === 'number', `Arc rotation should be a number: ${this._rotation}` );
    assert && assert( isFinite( this._rotation ), `Arc rotation should be a finite number: ${this._rotation}` );
    assert && assert( typeof this._startAngle === 'number', `Arc startAngle should be a number: ${this._startAngle}` );
    assert && assert( isFinite( this._startAngle ), `Arc startAngle should be a finite number: ${this._startAngle}` );
    assert && assert( typeof this._endAngle === 'number', `Arc endAngle should be a number: ${this._endAngle}` );
    assert && assert( isFinite( this._endAngle ), `Arc endAngle should be a finite number: ${this._endAngle}` );
    assert && assert( typeof this._anticlockwise === 'boolean', `Arc anticlockwise should be a boolean: ${this._anticlockwise}` );

    this._unitTransform = null;
    this._start = null;
    this._end = null;
    this._startTangent = null;
    this._endTangent = null;
    this._actualEndAngle = null;
    this._isFullPerimeter = null;
    this._angleDifference = null;
    this._unitArcSegment = null;
    this._bounds = null;
    this._svgPathFragment = null;

    // remapping of negative radii
    if ( this._radiusX < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      this._radiusX = -this._radiusX;
      this._startAngle = Math.PI - this._startAngle;
      this._endAngle = Math.PI - this._endAngle;
      this._anticlockwise = !this._anticlockwise;
    }
    if ( this._radiusY < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      this._radiusY = -this._radiusY;
      this._startAngle = -this._startAngle;
      this._endAngle = -this._endAngle;
      this._anticlockwise = !this._anticlockwise;
    }
    if ( this._radiusX < this._radiusY ) {
      // swap radiusX and radiusY internally for consistent Canvas / SVG output
      this._rotation += Math.PI / 2;
      this._startAngle -= Math.PI / 2;
      this._endAngle -= Math.PI / 2;

      // swap radiusX and radiusY
      const tmpR = this._radiusX;
      this._radiusX = this._radiusY;
      this._radiusY = tmpR;
    }

    if ( this._radiusX < this._radiusY ) {
      // TODO: check this
      throw new Error( 'Not verified to work if radiusX < radiusY' );
    }

    // constraints shared with Arc
    assert && assert( !( ( !this._anticlockwise && this._endAngle - this._startAngle <= -Math.PI * 2 ) ||
                         ( this._anticlockwise && this._startAngle - this._endAngle <= -Math.PI * 2 ) ),
      'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
    assert && assert( !( ( !this._anticlockwise && this._endAngle - this._startAngle > Math.PI * 2 ) ||
                         ( this._anticlockwise && this._startAngle - this._endAngle > Math.PI * 2 ) ),
      'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );

    this.invalidationEmitter.emit();
  }

  /**
   * Computes a transform that maps a unit circle into this ellipse's location.
   *
   * Helpful, since we can get the parametric position of our unit circle (at t), and then transform it with this
   * transform to get the ellipse's parametric position (at t).
   */
  public getUnitTransform(): Transform3 {
    if ( this._unitTransform === null ) {
      this._unitTransform = EllipticalArc.computeUnitTransform( this._center, this._radiusX, this._radiusY, this._rotation );
    }
    return this._unitTransform;
  }

  public get unitTransform(): Transform3 { return this.getUnitTransform(); }

  /**
   * Gets the start point of this ellipticalArc
   */
  public getStart(): Vector2 {
    if ( this._start === null ) {
      this._start = this.positionAtAngle( this._startAngle );
    }
    return this._start;
  }

  public get start(): Vector2 { return this.getStart(); }

  /**
   * Gets the end point of this ellipticalArc
   */
  public getEnd(): Vector2 {
    if ( this._end === null ) {
      this._end = this.positionAtAngle( this._endAngle );
    }
    return this._end;
  }

  public get end(): Vector2 { return this.getEnd(); }

  /**
   * Gets the tangent vector (normalized) to this ellipticalArc at the start, pointing in the direction of motion (from start to end)
   */
  public getStartTangent(): Vector2 {
    if ( this._startTangent === null ) {
      this._startTangent = this.tangentAtAngle( this._startAngle );
    }
    return this._startTangent;
  }

  public get startTangent(): Vector2 { return this.getStartTangent(); }

  /**
   * Gets the tangent vector (normalized) to this ellipticalArc at the end point, pointing in the direction of motion (from start to end)
   */
  public getEndTangent(): Vector2 {
    if ( this._endTangent === null ) {
      this._endTangent = this.tangentAtAngle( this._endAngle );
    }
    return this._endTangent;
  }

  public get endTangent(): Vector2 { return this.getEndTangent(); }

  /**
   * Gets the end angle in radians
   */
  public getActualEndAngle(): number {
    if ( this._actualEndAngle === null ) {
      this._actualEndAngle = Arc.computeActualEndAngle( this._startAngle, this._endAngle, this._anticlockwise );
    }
    return this._actualEndAngle;
  }

  public get actualEndAngle(): number { return this.getActualEndAngle(); }

  /**
   * Returns a boolean value that indicates if the arc wraps up by more than two Pi
   */
  public getIsFullPerimeter(): boolean {
    if ( this._isFullPerimeter === null ) {
      this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
    }
    return this._isFullPerimeter;
  }

  public get isFullPerimeter(): boolean { return this.getIsFullPerimeter(); }

  /**
   * Returns an angle difference that represents how "much" of the circle our arc covers
   *
   * The answer is always greater or equal to zero
   * The answer can exceed two Pi
   */
  public getAngleDifference(): number {
    if ( this._angleDifference === null ) {
      // compute an angle difference that represents how "much" of the circle our arc covers
      this._angleDifference = this._anticlockwise ? this._startAngle - this._endAngle : this._endAngle - this._startAngle;
      if ( this._angleDifference < 0 ) {
        this._angleDifference += Math.PI * 2;
      }
      assert && assert( this._angleDifference >= 0 ); // now it should always be zero or positive
    }
    return this._angleDifference;
  }

  public get angleDifference(): number { return this.getAngleDifference(); }

  /**
   * A unit arg segment that we can map to our ellipse. useful for hit testing and such.
   */
  public getUnitArcSegment(): Arc {
    if ( this._unitArcSegment === null ) {
      this._unitArcSegment = new Arc( Vector2.ZERO, 1, this._startAngle, this._endAngle, this._anticlockwise );
    }
    return this._unitArcSegment;
  }

  public get unitArcSegment(): Arc { return this.getUnitArcSegment(); }

  /**
   * Returns the bounds of this segment.
   */
  public getBounds(): Bounds2 {
    if ( this._bounds === null ) {
      this._bounds = Bounds2.NOTHING.withPoint( this.getStart() )
        .withPoint( this.getEnd() );

      // if the angles are different, check extrema points
      if ( this._startAngle !== this._endAngle ) {
        // solve the mapping from the unit circle, find locations where a coordinate of the gradient is zero.
        // we find one extrema point for both x and y, since the other two are just rotated by pi from them.
        const xAngle = Math.atan( -( this._radiusY / this._radiusX ) * Math.tan( this._rotation ) );
        const yAngle = Math.atan( ( this._radiusY / this._radiusX ) / Math.tan( this._rotation ) );

        // check all of the extrema points
        this.possibleExtremaAngles = [
          xAngle,
          xAngle + Math.PI,
          yAngle,
          yAngle + Math.PI
        ];

        _.each( this.possibleExtremaAngles, this.includeBoundsAtAngle.bind( this ) );
      }
    }
    return this._bounds;
  }

  public get bounds(): Bounds2 { return this.getBounds(); }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   */
  public getNondegenerateSegments(): Segment[] {
    if ( this._radiusX <= 0 || this._radiusY <= 0 || this._startAngle === this._endAngle ) {
      return [];
    }
    else if ( this._radiusX === this._radiusY ) {
      // reduce to an Arc
      const startAngle = this._startAngle + this._rotation;
      let endAngle = this._endAngle + this._rotation;

      // preserve full circles
      if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
        endAngle = this._anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
      }
      return [ new Arc( this._center, this._radiusX, startAngle, endAngle, this._anticlockwise ) ];
    }
    else {
      return [ this ];
    }
  }

  /**
   * Attempts to expand the private _bounds bounding box to include a point at a specific angle, making sure that
   * angle is actually included in the arc. This will presumably be called at angles that are at critical points,
   * where the arc should have maximum/minimum x/y values.
   */
  private includeBoundsAtAngle( angle: number ): void {
    if ( this.unitArcSegment.containsAngle( angle ) ) {
      // the boundary point is in the arc
      this._bounds = this._bounds!.withPoint( this.positionAtAngle( angle ) );
    }
  }

  /**
   * Maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
   *
   * TODO: remove duplication with Arc
   */
  public mapAngle( angle: number ): number {
    if ( Math.abs( Utils.moduloBetweenDown( angle - this._startAngle, -Math.PI, Math.PI ) ) < 1e-8 ) {
      return this._startAngle;
    }
    if ( Math.abs( Utils.moduloBetweenDown( angle - this.getActualEndAngle(), -Math.PI, Math.PI ) ) < 1e-8 ) {
      return this.getActualEndAngle();
    }
    // consider an assert that we contain that angle?
    return ( this._startAngle > this.getActualEndAngle() ) ?
           Utils.moduloBetweenUp( angle, this._startAngle - 2 * Math.PI, this._startAngle ) :
           Utils.moduloBetweenDown( angle, this._startAngle, this._startAngle + 2 * Math.PI );
  }

  /**
   * Returns the parametrized value t for a given angle. The value t should range from 0 to 1 (inclusive).
   *
   * TODO: remove duplication with Arc
   */
  public tAtAngle( angle: number ): number {
    return ( this.mapAngle( angle ) - this._startAngle ) / ( this.getActualEndAngle() - this._startAngle );
  }

  /**
   * Returns the angle for the parametrized t value. The t value should range from 0 to 1 (inclusive).
   */
  public angleAt( t: number ): number {
    return this._startAngle + ( this.getActualEndAngle() - this._startAngle ) * t;
  }

  /**
   * Returns the position of this arc at angle.
   */
  public positionAtAngle( angle: number ): Vector2 {
    return this.getUnitTransform().transformPosition2( Vector2.createPolar( 1, angle ) );
  }

  /**
   * Returns the normalized tangent of this arc.
   * The tangent points outward (inward) of this arc for clockwise (anticlockwise) direction.
   */
  public tangentAtAngle( angle: number ): Vector2 {
    const normal = this.getUnitTransform().transformNormal2( Vector2.createPolar( 1, angle ) );

    return this._anticlockwise ? normal.perpendicular : normal.perpendicular.negated();
  }

  /**
   * Returns an array of straight lines that will draw an offset on the logical left (right) side for reverse false (true)
   * It discretizes the elliptical arc in 32 segments and returns an offset curve as a list of lineTos/
   *
   * @param r - distance
   * @param reverse
   */
  public offsetTo( r: number, reverse: boolean ): Line[] {
    // how many segments to create (possibly make this more adaptive?)
    const quantity = 32;

    const points = [];
    const result = [];
    for ( let i = 0; i < quantity; i++ ) {
      let ratio = i / ( quantity - 1 );
      if ( reverse ) {
        ratio = 1 - ratio;
      }
      const angle = this.angleAt( ratio );

      points.push( this.positionAtAngle( angle ).plus( this.tangentAtAngle( angle ).perpendicular.normalized().times( r ) ) );
      if ( i > 0 ) {
        result.push( new Line( points[ i - 1 ], points[ i ] ) );
      }
    }

    return result;
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided,
   * so anything that calls this needs to put the M calls first.
   */
  public getSVGPathFragment(): string {
    let oldPathFragment;
    if ( assert ) {
      oldPathFragment = this._svgPathFragment;
      this._svgPathFragment = null;
    }
    if ( !this._svgPathFragment ) {
      // see http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands for more info
      // rx ry x-axis-rotation large-arc-flag sweep-flag x y
      const epsilon = 0.01; // allow some leeway to render things as 'almost circles'
      const sweepFlag = this._anticlockwise ? '0' : '1';
      let largeArcFlag;
      const degreesRotation = toDegrees( this._rotation ); // bleh, degrees?
      if ( this.getAngleDifference() < Math.PI * 2 - epsilon ) {
        largeArcFlag = this.getAngleDifference() < Math.PI ? '0' : '1';
        this._svgPathFragment = `A ${svgNumber( this._radiusX )} ${svgNumber( this._radiusY )} ${degreesRotation
        } ${largeArcFlag} ${sweepFlag} ${svgNumber( this.getEnd().x )} ${svgNumber( this.getEnd().y )}`;
      }
      else {
        // ellipse (or almost-ellipse) case needs to be handled differently
        // since SVG will not be able to draw (or know how to draw) the correct circle if we just have a start and end, we need to split it into two circular arcs

        // get the angle that is between and opposite of both of the points
        const splitOppositeAngle = ( this._startAngle + this._endAngle ) / 2; // this _should_ work for the modular case?
        const splitPoint = this.positionAtAngle( splitOppositeAngle );

        largeArcFlag = '0'; // since we split it in 2, it's always the small arc

        const firstArc = `A ${svgNumber( this._radiusX )} ${svgNumber( this._radiusY )} ${
          degreesRotation} ${largeArcFlag} ${sweepFlag} ${
          svgNumber( splitPoint.x )} ${svgNumber( splitPoint.y )}`;
        const secondArc = `A ${svgNumber( this._radiusX )} ${svgNumber( this._radiusY )} ${
          degreesRotation} ${largeArcFlag} ${sweepFlag} ${
          svgNumber( this.getEnd().x )} ${svgNumber( this.getEnd().y )}`;

        this._svgPathFragment = `${firstArc} ${secondArc}`;
      }
    }
    if ( assert ) {
      if ( oldPathFragment ) {
        assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
      }
    }
    return this._svgPathFragment;
  }

  /**
   * Returns an array of straight lines  that will draw an offset on the logical left side.
   */
  public strokeLeft( lineWidth: number ): Line[] {
    return this.offsetTo( -lineWidth / 2, false );
  }

  /**
   * Returns an array of straight lines that will draw an offset curve on the logical right side.
   */
  public strokeRight( lineWidth: number ): Line[] {
    return this.offsetTo( lineWidth / 2, true );
  }

  /**
   * Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   * Does not include t=0 and t=1.
   */
  public getInteriorExtremaTs(): number[] {
    const result: number[] = [];
    _.each( this.possibleExtremaAngles, ( angle: number ) => {
      if ( this.unitArcSegment.containsAngle( angle ) ) {
        const t = this.tAtAngle( angle );
        const epsilon = 0.0000000001; // TODO: general kite epsilon?
        if ( t > epsilon && t < 1 - epsilon ) {
          result.push( t );
        }
      }
    } );
    return result.sort(); // modifies original, which is OK
  }

  /**
   * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
   * For details, see the documentation in Segment.js
   */
  public intersection( ray: Ray2 ): RayIntersection[] {
    // be lazy. transform it into the space of a non-elliptical arc.
    const unitTransform = this.getUnitTransform();
    const rayInUnitCircleSpace = unitTransform.inverseRay2( ray );
    const hits = this.getUnitArcSegment().intersection( rayInUnitCircleSpace );

    return _.map( hits, hit => {
      const transformedPoint = unitTransform.transformPosition2( hit.point );
      const distance = ray.position.distance( transformedPoint );
      const normal = unitTransform.inverseNormal2( hit.normal );
      return new RayIntersection( distance, transformedPoint, normal, hit.wind, hit.t );
    } );
  }

  /**
   * Returns the resultant winding number of this ray intersecting this arc.
   */
  public windingIntersection( ray: Ray2 ): number {
    // be lazy. transform it into the space of a non-elliptical arc.
    const rayInUnitCircleSpace = this.getUnitTransform().inverseRay2( ray );
    return this.getUnitArcSegment().windingIntersection( rayInUnitCircleSpace );
  }

  /**
   * Draws this arc to the 2D Canvas context, assuming the context's current location is already at the start point
   */
  public writeToContext( context: CanvasRenderingContext2D ): void {
    if ( context.ellipse ) {
      context.ellipse( this._center.x, this._center.y, this._radiusX, this._radiusY, this._rotation, this._startAngle, this._endAngle, this._anticlockwise );
    }
    else {
      // fake the ellipse call by using transforms
      this.getUnitTransform().getMatrix().canvasAppendTransform( context );
      context.arc( 0, 0, 1, this._startAngle, this._endAngle, this._anticlockwise );
      this.getUnitTransform().getInverse().canvasAppendTransform( context );
    }
  }

  /**
   * Returns this elliptical arc transformed by a matrix
   */
  public transformed( matrix: Matrix3 ): EllipticalArc {
    const transformedSemiMajorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusX, this._rotation ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
    const transformedSemiMinorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusY, this._rotation + Math.PI / 2 ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
    const rotation = transformedSemiMajorAxis.angle;
    const radiusX = transformedSemiMajorAxis.magnitude;
    const radiusY = transformedSemiMinorAxis.magnitude;

    const reflected = matrix.getDeterminant() < 0;

    // reverse the 'clockwiseness' if our transform includes a reflection
    // TODO: check reflections. swapping angle signs should fix clockwiseness
    const anticlockwise = reflected ? !this._anticlockwise : this._anticlockwise;
    const startAngle = reflected ? -this._startAngle : this._startAngle;
    let endAngle = reflected ? -this._endAngle : this._endAngle;

    if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
      endAngle = anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
    }

    return new EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );
  }

  /**
   * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
   *
   * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
   */
  public getSignedAreaFragment(): number {
    const t0 = this._startAngle;
    const t1 = this.getActualEndAngle();

    const sin0 = Math.sin( t0 );
    const sin1 = Math.sin( t1 );
    const cos0 = Math.cos( t0 );
    const cos1 = Math.cos( t1 );

    // Derived via Mathematica (curve-area.nb)
    return 0.5 * ( this._radiusX * this._radiusY * ( t1 - t0 ) +
                   Math.cos( this._rotation ) * ( this._radiusX * this._center.y * ( cos0 - cos1 ) +
                   this._radiusY * this._center.x * ( sin1 - sin0 ) ) +
                   Math.sin( this._rotation ) * ( this._radiusX * this._center.x * ( cos1 - cos0 ) +
                   this._radiusY * this._center.y * ( sin1 - sin0 ) ) );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   */
  public reversed(): EllipticalArc {
    return new EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, this._endAngle, this._startAngle, !this._anticlockwise );
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedEllipticalArc {
    return {
      type: 'EllipticalArc',
      centerX: this._center.x,
      centerY: this._center.y,
      radiusX: this._radiusX,
      radiusY: this._radiusY,
      rotation: this._rotation,
      startAngle: this._startAngle,
      endAngle: this._endAngle,
      anticlockwise: this._anticlockwise
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
    if ( segment instanceof EllipticalArc ) {
      return EllipticalArc.getOverlaps( this, segment );
    }

    return null;
  }

  /**
   * Returns an EllipticalArc from the serialized representation.
   */
  public static override deserialize( obj: SerializedEllipticalArc ): EllipticalArc {
    assert && assert( obj.type === 'EllipticalArc' );

    return new EllipticalArc( new Vector2( obj.centerX, obj.centerY ), obj.radiusX, obj.radiusY, obj.rotation, obj.startAngle, obj.endAngle, obj.anticlockwise );
  }

  /**
   * Returns what type of overlap is possible based on the center/radii/rotation. We ignore the start/end angles and
   * anticlockwise information, and determine if the FULL ellipses overlap.
   */
  public static getOverlapType( a: EllipticalArc, b: EllipticalArc, epsilon = 1e-10 ): EllipticalArcOverlapType {

    // Different centers can't overlap continuously
    if ( a._center.distance( b._center ) < epsilon ) {

      const matchingRadii = Math.abs( a._radiusX - b._radiusX ) < epsilon && Math.abs( a._radiusY - b._radiusY ) < epsilon;
      const oppositeRadii = Math.abs( a._radiusX - b._radiusY ) < epsilon && Math.abs( a._radiusY - b._radiusX ) < epsilon;

      if ( matchingRadii ) {
        // Difference between rotations should be an approximate multiple of pi. We add pi/2 before modulo, so the
        // result of that should be ~pi/2 (don't need to check both endpoints)
        if ( Math.abs( Utils.moduloBetweenDown( a._rotation - b._rotation + Math.PI / 2, 0, Math.PI ) - Math.PI / 2 ) < epsilon ) {
          return EllipticalArcOverlapType.MATCHING_OVERLAP;
        }
      }
      if ( oppositeRadii ) {
        // Difference between rotations should be an approximate multiple of pi (with pi/2 added).
        if ( Math.abs( Utils.moduloBetweenDown( a._rotation - b._rotation, 0, Math.PI ) - Math.PI / 2 ) < epsilon ) {
          return EllipticalArcOverlapType.OPPOSITE_OVERLAP;
        }
      }
    }

    return EllipticalArcOverlapType.NONE;
  }

  /**
   * Determine whether two elliptical arcs overlap over continuous sections, and if so finds the a,b pairs such that
   * p( t ) === q( a * t + b ).
   *
   * @returns - Any overlaps (from 0 to 2)
   */
  public static getOverlaps( a: EllipticalArc, b: EllipticalArc ): Overlap[] {

    const overlapType = EllipticalArc.getOverlapType( a, b );

    if ( overlapType === EllipticalArcOverlapType.NONE ) {
      return [];
    }
    else {
      return Arc.getAngularOverlaps( a._startAngle + a._rotation, a.getActualEndAngle() + a._rotation,
        b._startAngle + b._rotation, b.getActualEndAngle() + b._rotation );
    }
  }

  /**
   * Returns any (finite) intersection between the two elliptical arc segments.
   */
  public static override intersect( a: EllipticalArc, b: EllipticalArc, epsilon = 1e-10 ): SegmentIntersection[] {

    const overlapType = EllipticalArc.getOverlapType( a, b, epsilon );

    if ( overlapType === EllipticalArcOverlapType.NONE ) {
      return BoundsIntersection.intersect( a, b );
    }
    else {
      // If we effectively have the same ellipse, just different sections of it. The only finite intersections could be
      // at the endpoints, so we'll inspect those.

      const results = [];
      const aStart = a.positionAt( 0 );
      const aEnd = a.positionAt( 1 );
      const bStart = b.positionAt( 0 );
      const bEnd = b.positionAt( 1 );

      if ( aStart.equalsEpsilon( bStart, epsilon ) ) {
        results.push( new SegmentIntersection( aStart.average( bStart ), 0, 0 ) );
      }
      if ( aStart.equalsEpsilon( bEnd, epsilon ) ) {
        results.push( new SegmentIntersection( aStart.average( bEnd ), 0, 1 ) );
      }
      if ( aEnd.equalsEpsilon( bStart, epsilon ) ) {
        results.push( new SegmentIntersection( aEnd.average( bStart ), 1, 0 ) );
      }
      if ( aEnd.equalsEpsilon( bEnd, epsilon ) ) {
        results.push( new SegmentIntersection( aEnd.average( bEnd ), 1, 1 ) );
      }

      return results;
    }
  }

  /**
   * Transforms the unit circle into our ellipse.
   *
   * adapted from http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
   */
  public static computeUnitTransform( center: Vector2, radiusX: number, radiusY: number, rotation: number ): Transform3 {
    return new Transform3( Matrix3.translation( center.x, center.y ) // TODO: convert to Matrix3.translation( this._center) when available
      .timesMatrix( Matrix3.rotation2( rotation ) )
      .timesMatrix( Matrix3.scaling( radiusX, radiusY ) ) );
  }
}

export class EllipticalArcOverlapType extends EnumerationValue {
  // radiusX of one equals radiusX of the other, with equivalent centers and rotations to work
  public static readonly MATCHING_OVERLAP = new EllipticalArcOverlapType();

  // radiusX of one equals radiusY of the other, with equivalent centers and rotations to work
  public static readonly OPPOSITE_OVERLAP = new EllipticalArcOverlapType();

  // no overlap
  public static readonly NONE = new EllipticalArcOverlapType();

  public static readonly enumeration = new Enumeration( EllipticalArcOverlapType );
}

kite.register( 'EllipticalArc', EllipticalArc );
