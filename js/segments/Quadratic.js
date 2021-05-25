// Copyright 2013-2021, University of Colorado Boulder

/**
 * Quadratic Bezier segment
 *
 * Good reference: http://cagd.cs.byu.edu/~557/text/ch2.pdf
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import Utils from '../../../dot/js/Utils.js';
import Vector2 from '../../../dot/js/Vector2.js';
import kite from '../kite.js';
import Overlap from '../util/Overlap.js';
import RayIntersection from '../util/RayIntersection.js';
import Segment from './Segment.js';

// constants
const solveQuadraticRootsReal = Utils.solveQuadraticRootsReal;
const arePointsCollinear = Utils.arePointsCollinear;

// Used in multiple filters
function isBetween0And1( t ) {
  return t >= 0 && t <= 1;
}

class Quadratic extends Segment {
  /**
   * @param {Vector2} start - Start point of the quadratic bezier
   * @param {Vector2} control - Control point (curve usually doesn't go through here)
   * @param {Vector2} end - End point of the quadratic bezier
   */
  constructor( start, control, end ) {
    super();

    // @private {Vector2}
    this._start = start;
    this._control = control;
    this._end = end;

    this.invalidate();
  }

  /**
   * Sets the start point of the Quadratic.
   * @public
   *
   * @param {Vector2} start
   * @returns {Quadratic}
   */
  setStart( start ) {
    assert && assert( start instanceof Vector2, `Quadratic start should be a Vector2: ${start}` );
    assert && assert( start.isFinite(), `Quadratic start should be finite: ${start.toString()}` );

    if ( !this._start.equals( start ) ) {
      this._start = start;
      this.invalidate();
    }
    return this; // allow chaining
  }

  set start( value ) { this.setStart( value ); }

  /**
   * Returns the start of this Quadratic.
   * @public
   *
   * @returns {Vector2}
   */
  getStart() {
    return this._start;
  }

  get start() { return this.getStart(); }

  /**
   * Sets the control point of the Quadratic.
   * @public
   *
   * @param {Vector2} control
   * @returns {Quadratic}
   */
  setControl( control ) {
    assert && assert( control instanceof Vector2, `Quadratic control should be a Vector2: ${control}` );
    assert && assert( control.isFinite(), `Quadratic control should be finite: ${control.toString()}` );

    if ( !this._control.equals( control ) ) {
      this._control = control;
      this.invalidate();
    }
    return this; // allow chaining
  }

  set control( value ) { this.setControl( value ); }

  /**
   * Returns the control point of this Quadratic.
   * @public
   *
   * @returns {Vector2}
   */
  getControl() {
    return this._control;
  }

  get control() { return this.getControl(); }

  /**
   * Sets the end point of the Quadratic.
   * @public
   *
   * @param {Vector2} end
   * @returns {Quadratic}
   */
  setEnd( end ) {
    assert && assert( end instanceof Vector2, `Quadratic end should be a Vector2: ${end}` );
    assert && assert( end.isFinite(), `Quadratic end should be finite: ${end.toString()}` );

    if ( !this._end.equals( end ) ) {
      this._end = end;
      this.invalidate();
    }
    return this; // allow chaining
  }

  set end( value ) { this.setEnd( value ); }

  /**
   * Returns the end of this Quadratic.
   * @public
   *
   * @returns {Vector2}
   */
  getEnd() {
    return this._end;
  }

  get end() { return this.getEnd(); }

  /**
   * Returns the position parametrically, with 0 <= t <= 1.
   * @public
   *
   * NOTE: positionAt( 0 ) will return the start of the segment, and positionAt( 1 ) will return the end of the
   * segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   *
   * @param {number} t
   * @returns {Vector2}
   */
  positionAt( t ) {
    assert && assert( t >= 0, 'positionAt t should be non-negative' );
    assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

    const mt = 1 - t;
    // described from t=[0,1] as: (1-t)^2 start + 2(1-t)t control + t^2 end
    // TODO: allocation reduction
    return this._start.times( mt * mt ).plus( this._control.times( 2 * mt * t ) ).plus( this._end.times( t * t ) );
  }

  /**
   * Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
   * @public
   *
   * NOTE: tangentAt( 0 ) will return the tangent at the start of the segment, and tangentAt( 1 ) will return the
   * tangent at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   *
   * @param {number} t
   * @returns {Vector2}
   */
  tangentAt( t ) {
    assert && assert( t >= 0, 'tangentAt t should be non-negative' );
    assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

    // For a quadratic curve, the derivavtive is given by : 2(1-t)( control - start ) + 2t( end - control )
    // TODO: allocation reduction
    return this._control.minus( this._start ).times( 2 * ( 1 - t ) ).plus( this._end.minus( this._control ).times( 2 * t ) );
  }

  /**
   * Returns the signed curvature of the segment at the parametric value t, where 0 <= t <= 1.
   * @public
   *
   * The curvature will be positive for visual clockwise / mathematical counterclockwise curves, negative for opposite
   * curvature, and 0 for no curvature.
   *
   * NOTE: curvatureAt( 0 ) will return the curvature at the start of the segment, and curvatureAt( 1 ) will return
   * the curvature at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   *
   * @param {number} t
   * @returns {number}
   */
  curvatureAt( t ) {
    assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
    assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

    // see http://cagd.cs.byu.edu/~557/text/ch2.pdf p31
    // TODO: remove code duplication with Cubic
    const epsilon = 0.0000001;
    if ( Math.abs( t - 0.5 ) > 0.5 - epsilon ) {
      const isZero = t < 0.5;
      const p0 = isZero ? this._start : this._end;
      const p1 = this._control;
      const p2 = isZero ? this._end : this._start;
      const d10 = p1.minus( p0 );
      const a = d10.magnitude;
      const h = ( isZero ? -1 : 1 ) * d10.perpendicular.normalized().dot( p2.minus( p1 ) );
      return ( h * ( this.degree - 1 ) ) / ( this.degree * a * a );
    }
    else {
      return this.subdivided( t, true )[ 0 ].curvatureAt( 1 );
    }
  }

  /**
   * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
   * up the same shape as the current segment.
   * @public
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   *
   * @param {number} t
   * @returns {Array.<Segment>}
   */
  subdivided( t ) {
    assert && assert( t >= 0, 'subdivided t should be non-negative' );
    assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

    // If t is 0 or 1, we only need to return 1 segment
    if ( t === 0 || t === 1 ) {
      return [ this ];
    }

    // de Casteljau method
    const leftMid = this._start.blend( this._control, t );
    const rightMid = this._control.blend( this._end, t );
    const mid = leftMid.blend( rightMid, t );
    return [
      new kite.Quadratic( this._start, leftMid, mid ),
      new kite.Quadratic( mid, rightMid, this._end )
    ];
  }

  /**
   * @public - Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   */
  invalidate() {
    assert && assert( this._start instanceof Vector2, `Quadratic start should be a Vector2: ${this._start}` );
    assert && assert( this._start.isFinite(), `Quadratic start should be finite: ${this._start.toString()}` );
    assert && assert( this._control instanceof Vector2, `Quadratic control should be a Vector2: ${this._control}` );
    assert && assert( this._control.isFinite(), `Quadratic control should be finite: ${this._control.toString()}` );
    assert && assert( this._end instanceof Vector2, `Quadratic end should be a Vector2: ${this._end}` );
    assert && assert( this._end.isFinite(), `Quadratic end should be finite: ${this._end.toString()}` );

    // Lazily-computed derived information
    this._startTangent = null; // {Vector2|null}
    this._endTangent = null; // {Vector2|null}
    this._tCriticalX = null; // {number|null} T where x-derivative is 0 (replaced with NaN if not in range)
    this._tCriticalY = null; // {number|null} T where y-derivative is 0 (replaced with NaN if not in range)

    this._bounds = null; // {Bounds2|null}
    this._svgPathFragment = null; // {string|null}

    this.invalidationEmitter.emit();
  }

  /**
   * Returns the tangent vector (normalized) to the segment at the start, pointing in the direction of motion (from start to end)
   * @public
   *
   * @returns {Vector2}
   */
  getStartTangent() {
    if ( this._startTangent === null ) {
      const controlIsStart = this._start.equals( this._control );
      // TODO: allocation reduction
      this._startTangent = controlIsStart ?
                           this._end.minus( this._start ).normalized() :
                           this._control.minus( this._start ).normalized();
    }
    return this._startTangent;
  }

  get startTangent() { return this.getStartTangent(); }

  /**
   * Returns the tangent vector (normalized) to the segment at the end, pointing in the direction of motion (from start to end)
   * @public
   *
   * @returns {Vector2}
   */
  getEndTangent() {
    if ( this._endTangent === null ) {
      const controlIsEnd = this._end.equals( this._control );
      // TODO: allocation reduction
      this._endTangent = controlIsEnd ?
                         this._end.minus( this._start ).normalized() :
                         this._end.minus( this._control ).normalized();
    }
    return this._endTangent;
  }

  get endTangent() { return this.getEndTangent(); }

  /**
   * @public
   *
   * @returns {number}
   */
  getTCriticalX() {
    // compute x where the derivative is 0 (used for bounds and other things)
    if ( this._tCriticalX === null ) {
      this._tCriticalX = Quadratic.extremaT( this._start.x, this._control.x, this._end.x );
    }
    return this._tCriticalX;
  }

  get tCriticalX() { return this.getTCriticalX(); }


  /**
   * @public
   *
   * @returns {number}
   */
  getTCriticalY() {
    // compute y where the derivative is 0 (used for bounds and other things)
    if ( this._tCriticalY === null ) {
      this._tCriticalY = Quadratic.extremaT( this._start.y, this._control.y, this._end.y );
    }
    return this._tCriticalY;
  }

  get tCriticalY() { return this.getTCriticalY(); }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   * @public
   *
   * @returns {Array.<Segment>}
   */
  getNondegenerateSegments() {
    const start = this._start;
    const control = this._control;
    const end = this._end;

    const startIsEnd = start.equals( end );
    const startIsControl = start.equals( control );
    const endIsControl = start.equals( control );

    if ( startIsEnd && startIsControl ) {
      // all same points
      return [];
    }
    else if ( startIsEnd ) {
      // this is a special collinear case, we basically line out to the farthest point and back
      const halfPoint = this.positionAt( 0.5 );
      return [
        new kite.Line( start, halfPoint ),
        new kite.Line( halfPoint, end )
      ];
    }
    else if ( arePointsCollinear( start, control, end ) ) {
      // if they are collinear, we can reduce to start->control and control->end, or if control is between, just one line segment
      // also, start !== end (handled earlier)
      if ( startIsControl || endIsControl ) {
        // just a line segment!
        return [ new kite.Line( start, end ) ]; // no extra nondegenerate check since start !== end
      }
      // now control point must be unique. we check to see if our rendered path will be outside of the start->end line segment
      const delta = end.minus( start );
      const p1d = control.minus( start ).dot( delta.normalized ) / delta.magnitude;
      const t = Quadratic.extremaT( 0, p1d, 1 );
      if ( !isNaN( t ) && t > 0 && t < 1 ) {
        // we have a local max inside the range, indicating that our extrema point is outside of start->end
        // we'll line to and from it
        const pt = this.positionAt( t );
        return _.flatten( [
          new kite.Line( start, pt ).getNondegenerateSegments(),
          new kite.Line( pt, end ).getNondegenerateSegments()
        ] );
      }
      else {
        // just provide a line segment, our rendered path doesn't go outside of this
        return [ new kite.Line( start, end ) ]; // no extra nondegenerate check since start !== end
      }
    }
    else {
      return [ this ];
    }
  }

  /**
   * Returns the bounds of this segment.
   * @public
   *
   * @returns {Bounds2}
   */
  getBounds() {
    // calculate our temporary guaranteed lower bounds based on the end points
    if ( this._bounds === null ) {
      this._bounds = new Bounds2( Math.min( this._start.x, this._end.x ), Math.min( this._start.y, this._end.y ), Math.max( this._start.x, this._end.x ), Math.max( this._start.y, this._end.y ) );

      // compute x and y where the derivative is 0, so we can include this in the bounds
      const tCriticalX = this.getTCriticalX();
      const tCriticalY = this.getTCriticalY();

      if ( !isNaN( tCriticalX ) && tCriticalX > 0 && tCriticalX < 1 ) {
        this._bounds = this._bounds.withPoint( this.positionAt( tCriticalX ) );
      }
      if ( !isNaN( tCriticalY ) && tCriticalY > 0 && tCriticalY < 1 ) {
        this._bounds = this._bounds.withPoint( this.positionAt( tCriticalY ) );
      }
    }
    return this._bounds;
  }

  get bounds() { return this.getBounds(); }

  // see http://www.visgraf.impa.br/sibgrapi96/trabs/pdf/a14.pdf
  // and http://math.stackexchange.com/questions/12186/arc-length-of-bezier-curves for curvature / arc length

  /**
   * Returns an array of quadratic that are offset to this quadratic by a distance r
   * @public
   *
   * @param {number} r - distance
   * @param {boolean} reverse
   * @returns {Array.<Quadratic>}
   */
  offsetTo( r, reverse ) {
    // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html
    // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
    let curves = [ this ];

    // subdivide this curve
    const depth = 5; // generates 2^depth curves
    for ( let i = 0; i < depth; i++ ) {
      curves = _.flatten( _.map( curves, curve => curve.subdivided( 0.5, true ) ) );
    }

    let offsetCurves = _.map( curves, curve => curve.approximateOffset( r ) );

    if ( reverse ) {
      offsetCurves.reverse();
      offsetCurves = _.map( offsetCurves, curve => curve.reversed( true ) );
    }

    return offsetCurves;
  }

  /**
   * Elevation of this quadratic Bezier curve to a cubic Bezier curve
   * @public
   *
   * @returns {Cubic}
   */
  degreeElevated() {
    // TODO: allocation reduction
    return new kite.Cubic(
      this._start,
      this._start.plus( this._control.timesScalar( 2 ) ).dividedScalar( 3 ),
      this._end.plus( this._control.timesScalar( 2 ) ).dividedScalar( 3 ),
      this._end
    );
  }

  /**
   * @public
   *
   * @param {number} r - distance
   * @returns {Quadratic}
   */
  approximateOffset( r ) {
    return new kite.Quadratic(
      this._start.plus( ( this._start.equals( this._control ) ? this._end.minus( this._start ) : this._control.minus( this._start ) ).perpendicular.normalized().times( r ) ),
      this._control.plus( this._end.minus( this._start ).perpendicular.normalized().times( r ) ),
      this._end.plus( ( this._end.equals( this._control ) ? this._end.minus( this._start ) : this._end.minus( this._control ) ).perpendicular.normalized().times( r ) )
    );
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls this needs to put the M calls first
   * @public
   *
   * @returns {string}
   */
  getSVGPathFragment() {
    let oldPathFragment;
    if ( assert ) {
      oldPathFragment = this._svgPathFragment;
      this._svgPathFragment = null;
    }
    if ( !this._svgPathFragment ) {
      this._svgPathFragment = `Q ${kite.svgNumber( this._control.x )} ${kite.svgNumber( this._control.y )} ${
        kite.svgNumber( this._end.x )} ${kite.svgNumber( this._end.y )}`;
    }
    if ( assert ) {
      if ( oldPathFragment ) {
        assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
      }
    }
    return this._svgPathFragment;
  }

  /**
   * Returns an array of lines that will draw an offset curve on the logical left side
   * @public
   *
   * @param {number} lineWidth
   * @returns {Array.<Quadratic>}
   */
  strokeLeft( lineWidth ) {
    return this.offsetTo( -lineWidth / 2, false );
  }

  /**
   * Returns an array of lines that will draw an offset curve on the logical right side
   * @public
   *
   * @param {number} lineWidth
   * @returns {Array.<Quadratic>}
   */
  strokeRight( lineWidth ) {
    return this.offsetTo( lineWidth / 2, true );
  }

  /**
   * @public
   *
   * @returns {Array.<number>}
   */
  getInteriorExtremaTs() {
    // TODO: we assume here we are reduce, so that a criticalX doesn't equal a criticalY?
    const result = [];
    const epsilon = 0.0000000001; // TODO: general kite epsilon?

    const criticalX = this.getTCriticalX();
    const criticalY = this.getTCriticalY();

    if ( !isNaN( criticalX ) && criticalX > epsilon && criticalX < 1 - epsilon ) {
      result.push( this.tCriticalX );
    }
    if ( !isNaN( criticalY ) && criticalY > epsilon && criticalY < 1 - epsilon ) {
      result.push( this.tCriticalY );
    }
    return result.sort();
  }

  /**
   * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
   * For details, see the documentation in Segment.js
   * @public
   *
   * @param {Ray2} ray
   * @returns {Array.<RayIntersection>}
   */
  intersection( ray ) {
    const result = [];

    // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
    const inverseMatrix = Matrix3.rotation2( -ray.direction.angle ).timesMatrix( Matrix3.translation( -ray.position.x, -ray.position.y ) );

    const p0 = inverseMatrix.timesVector2( this._start );
    const p1 = inverseMatrix.timesVector2( this._control );
    const p2 = inverseMatrix.timesVector2( this._end );

    //(1-t)^2 start + 2(1-t)t control + t^2 end
    const a = p0.y - 2 * p1.y + p2.y;
    const b = -2 * p0.y + 2 * p1.y;
    const c = p0.y;

    const ts = solveQuadraticRootsReal( a, b, c );

    _.each( ts, t => {
      if ( t >= 0 && t <= 1 ) {
        const hitPoint = this.positionAt( t );
        const unitTangent = this.tangentAt( t ).normalized();
        const perp = unitTangent.perpendicular;
        const toHit = hitPoint.minus( ray.position );

        // make sure it's not behind the ray
        if ( toHit.dot( ray.direction ) > 0 ) {
          const normal = perp.dot( ray.direction ) > 0 ? perp.negated() : perp;
          const wind = ray.direction.perpendicular.dot( unitTangent ) < 0 ? 1 : -1;
          result.push( new RayIntersection( toHit.magnitude, hitPoint, normal, wind, t ) );
        }
      }
    } );
    return result;
  }

  /**
   * Returns the winding number for intersection with a ray
   * @public
   *
   * @param {Ray2} ray
   * @returns {number}
   */
  windingIntersection( ray ) {
    let wind = 0;
    const hits = this.intersection( ray );
    _.each( hits, hit => {
      wind += hit.wind;
    } );
    return wind;
  }

  /**
   * Draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   * @public
   *
   * @param {CanvasRenderingContext2D} context
   */
  writeToContext( context ) {
    context.quadraticCurveTo( this._control.x, this._control.y, this._end.x, this._end.y );
  }

  /**
   * Returns a new quadratic that represents this quadratic after transformation by the matrix
   * @public
   *
   * @param {Matrix3} matrix
   * @returns {Quadratic}
   */
  transformed( matrix ) {
    return new kite.Quadratic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control ), matrix.timesVector2( this._end ) );
  }

  /**
   * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
   * @public
   *
   * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
   *
   * @returns {number}
   */
  getSignedAreaFragment() {
    return 1 / 6 * (
      this._start.x * ( 2 * this._control.y + this._end.y ) +
      this._control.x * ( -2 * this._start.y + 2 * this._end.y ) +
      this._end.x * ( -this._start.y - 2 * this._control.y )
    );
  }

  /**
   * Given the current curve parameterized by t, will return a curve parameterized by x where t = a * x + b
   * @public
   *
   * @param {number} a
   * @param {number} b
   * @returns {Quadratic}
   */
  reparameterized( a, b ) {
    // to the polynomial pt^2 + qt + r:
    const p = this._start.plus( this._end.plus( this._control.timesScalar( -2 ) ) );
    const q = this._control.minus( this._start ).timesScalar( 2 );
    const r = this._start;

    // to the polynomial alpha*x^2 + beta*x + gamma:
    const alpha = p.timesScalar( a * a );
    const beta = p.timesScalar( a * b ).timesScalar( 2 ).plus( q.timesScalar( a ) );
    const gamma = p.timesScalar( b * b ).plus( q.timesScalar( b ) ).plus( r );

    // back to the form start,control,end
    return new kite.Quadratic( gamma, beta.timesScalar( 0.5 ).plus( gamma ), alpha.plus( beta ).plus( gamma ) );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   * @public
   *
   * @returns {Quadratic}
   */
  reversed() {
    return new kite.Quadratic( this._end, this._control, this._start );
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   * @public
   *
   * @returns {Object}
   */
  serialize() {
    return {
      type: 'Quadratic',
      startX: this._start.x,
      startY: this._start.y,
      controlX: this._control.x,
      controlY: this._control.y,
      endX: this._end.x,
      endY: this._end.y
    };
  }

  /**
   * Returns a Quadratic from the serialized representation.
   * @public
   *
   * @param {Object} obj
   * @returns {Quadratic}
   */
  static deserialize( obj ) {
    assert && assert( obj.type === 'Quadratic' );

    return new Quadratic( new Vector2( obj.startX, obj.startY ), new Vector2( obj.controlX, obj.controlY ), new Vector2( obj.endX, obj.endY ) );
  }

  /**
   * One-dimensional solution to extrema
   * @public
   *
   * @param {number} start
   * @param {number} control
   * @param {number} end
   * @returns {number}
   */
  static extremaT( start, control, end ) {
    // compute t where the derivative is 0 (used for bounds and other things)
    const divisorX = 2 * ( end - 2 * control + start );
    if ( divisorX !== 0 ) {
      return -2 * ( control - start ) / divisorX;
    }
    else {
      return NaN;
    }
  }

  /**
   * Determine whether two Quadratics overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   * @public
   *
   * NOTE: for this particular function, we assume we're not degenerate. Things may work if we can be degree-reduced
   * to a quadratic, but generally that shouldn't be done.
   *
   * @param {Quadratic} quadratic1
   * @param {Quadratic} quadratic2
   * @param {number} [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns {Array.<Overlap>} - The solution, if there is one (and only one)
   */
  static getOverlaps( quadratic1, quadratic2, epsilon = 1e-6 ) {
    assert && assert( quadratic1 instanceof Quadratic, 'first Quadratic is not an instance of Quadratic' );
    assert && assert( quadratic2 instanceof Quadratic, 'second Quadratic is not an instance of Quadratic' );

    /*
     * NOTE: For implementation details in this function, please see Cubic.getOverlaps. It goes over all of the
     * same implementation details, but instead our bezier matrix is a 3x3:
     *
     * [  1  0  0 ]
     * [ -2  2  0 ]
     * [  1 -2  1 ]
     *
     * And we use the upper-left section of (at+b) adjustment matrix relevant for the quadratic.
     */

    const noOverlap = [];

    // Efficiently compute the multiplication of the bezier matrix:
    const p0x = quadratic1._start.x;
    const p1x = -2 * quadratic1._start.x + 2 * quadratic1._control.x;
    const p2x = quadratic1._start.x - 2 * quadratic1._control.x + quadratic1._end.x;
    const p0y = quadratic1._start.y;
    const p1y = -2 * quadratic1._start.y + 2 * quadratic1._control.y;
    const p2y = quadratic1._start.y - 2 * quadratic1._control.y + quadratic1._end.y;
    const q0x = quadratic2._start.x;
    const q1x = -2 * quadratic2._start.x + 2 * quadratic2._control.x;
    const q2x = quadratic2._start.x - 2 * quadratic2._control.x + quadratic2._end.x;
    const q0y = quadratic2._start.y;
    const q1y = -2 * quadratic2._start.y + 2 * quadratic2._control.y;
    const q2y = quadratic2._start.y - 2 * quadratic2._control.y + quadratic2._end.y;

    // Determine the candidate overlap (preferring the dimension with the largest variation)
    const xSpread = Math.abs( Math.max( quadratic1._start.x, quadratic1._control.x, quadratic1._end.x,
      quadratic2._start.x, quadratic2._control.x, quadratic2._end.x ) -
                              Math.min( quadratic1._start.x, quadratic1._control.x, quadratic1._end.x,
                                quadratic2._start.x, quadratic2._control.x, quadratic2._end.x ) );
    const ySpread = Math.abs( Math.max( quadratic1._start.y, quadratic1._control.y, quadratic1._end.y,
      quadratic2._start.y, quadratic2._control.y, quadratic2._end.y ) -
                              Math.min( quadratic1._start.y, quadratic1._control.y, quadratic1._end.y,
                                quadratic2._start.y, quadratic2._control.y, quadratic2._end.y ) );
    const xOverlap = Segment.polynomialGetOverlapQuadratic( p0x, p1x, p2x, q0x, q1x, q2x );
    const yOverlap = Segment.polynomialGetOverlapQuadratic( p0y, p1y, p2y, q0y, q1y, q2y );
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

    const aa = a * a;
    const bb = b * b;
    const ab2 = 2 * a * b;

    // Compute quadratic coefficients for the difference between p(t) and q(a*t+b)
    const d0x = q0x + b * q1x + bb * q2x - p0x;
    const d1x = a * q1x + ab2 * q2x - p1x;
    const d2x = aa * q2x - p2x;
    const d0y = q0y + b * q1y + bb * q2y - p0y;
    const d1y = a * q1y + ab2 * q2y - p1y;
    const d2y = aa * q2y - p2y;

    // Find the t values where extremes lie in the [0,1] range for each 1-dimensional quadratic. We do this by
    // differentiating the quadratic and finding the roots of the resulting line.
    const xRoots = Utils.solveLinearRootsReal( 2 * d2x, d1x );
    const yRoots = Utils.solveLinearRootsReal( 2 * d2y, d1y );
    const xExtremeTs = _.uniq( [ 0, 1 ].concat( xRoots ? xRoots.filter( isBetween0And1 ) : [] ) );
    const yExtremeTs = _.uniq( [ 0, 1 ].concat( yRoots ? yRoots.filter( isBetween0And1 ) : [] ) );

    // Examine the single-coordinate distances between the "overlaps" at each extreme T value. If the distance is larger
    // than our epsilon, then the "overlap" would not be valid.
    for ( let i = 0; i < xExtremeTs.length; i++ ) {
      const t = xExtremeTs[ i ];
      if ( Math.abs( ( d2x * t + d1x ) * t + d0x ) > epsilon ) {
        return noOverlap;
      }
    }
    for ( let i = 0; i < yExtremeTs.length; i++ ) {
      const t = yExtremeTs[ i ];
      if ( Math.abs( ( d2y * t + d1y ) * t + d0y ) > epsilon ) {
        return noOverlap;
      }
    }

    const qt0 = b;
    const qt1 = a + b;

    // TODO: do we want an epsilon in here to be permissive?
    if ( ( qt0 > 1 && qt1 > 1 ) || ( qt0 < 0 && qt1 < 0 ) ) {
      return noOverlap;
    }

    return [ new Overlap( a, b ) ];
  }
}

// @public {number} - degree of the polynomial (quadratic)
Quadratic.prototype.degree = 2;

kite.register( 'Quadratic', Quadratic );

export default Quadratic;