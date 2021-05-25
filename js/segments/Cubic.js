// Copyright 2013-2021, University of Colorado Boulder

/**
 * Cubic Bezier segment.
 *
 * See http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf for info
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
import BoundsIntersection from '../ops/BoundsIntersection.js';
import Overlap from '../util/Overlap.js';
import RayIntersection from '../util/RayIntersection.js';
import SegmentIntersection from '../util/SegmentIntersection.js';
import Quadratic from './Quadratic.js';
import Segment from './Segment.js';

const solveQuadraticRootsReal = Utils.solveQuadraticRootsReal; // function that returns an array of number
const solveCubicRootsReal = Utils.solveCubicRootsReal; // function that returns an array of number
const arePointsCollinear = Utils.arePointsCollinear; // function that returns a boolean

// convenience variables use to reduce the number of vector allocations
const scratchVector1 = new Vector2( 0, 0 );
const scratchVector2 = new Vector2( 0, 0 );
const scratchVector3 = new Vector2( 0, 0 );

// Used in multiple filters
function isBetween0And1( t ) {
  return t >= 0 && t <= 1;
}

class Cubic extends Segment {
  /**
   * @param {Vector2} start - Start point of the cubic bezier
   * @param {Vector2} control1 - First control point (curve usually doesn't go through here)
   * @param {Vector2} control2 - Second control point (curve usually doesn't go through here)
   * @param {Vector2} end - End point of the cubic bezier
   */
  constructor( start, control1, control2, end ) {
    super();

    // @private {Vector2}
    this._start = start;
    this._control1 = control1;
    this._control2 = control2;
    this._end = end;

    this.invalidate();
  }

  /**
   * Sets the start point of the Cubic.
   * @public
   *
   * @param {Vector2} start
   * @returns {Cubic}
   */
  setStart( start ) {
    assert && assert( start instanceof Vector2, `Cubic start should be a Vector2: ${start}` );
    assert && assert( start.isFinite(), `Cubic start should be finite: ${start.toString()}` );

    if ( !this._start.equals( start ) ) {
      this._start = start;
      this.invalidate();
    }
    return this; // allow chaining
  }

  set start( value ) { this.setStart( value ); }

  /**
   * Returns the start of this Cubic.
   * @public
   *
   * @returns {Vector2}
   */
  getStart() {
    return this._start;
  }

  get start() { return this.getStart(); }

  /**
   * Sets the first control point of the Cubic.
   * @public
   *
   * @param {Vector2} control1
   * @returns {Cubic}
   */
  setControl1( control1 ) {
    assert && assert( control1 instanceof Vector2, `Cubic control1 should be a Vector2: ${control1}` );
    assert && assert( control1.isFinite(), `Cubic control1 should be finite: ${control1.toString()}` );

    if ( !this._control1.equals( control1 ) ) {
      this._control1 = control1;
      this.invalidate();
    }
    return this; // allow chaining
  }

  set control1( value ) { this.setControl1( value ); }

  /**
   * Returns the first control point of this Cubic.
   * @public
   *
   * @returns {Vector2}
   */
  getControl1() {
    return this._control1;
  }

  get control1() { return this.getControl1(); }

  /**
   * Sets the second control point of the Cubic.
   * @public
   *
   * @param {Vector2} control2
   * @returns {Cubic}
   */
  setControl2( control2 ) {
    assert && assert( control2 instanceof Vector2, `Cubic control2 should be a Vector2: ${control2}` );
    assert && assert( control2.isFinite(), `Cubic control2 should be finite: ${control2.toString()}` );

    if ( !this._control2.equals( control2 ) ) {
      this._control2 = control2;
      this.invalidate();
    }
    return this; // allow chaining
  }

  set control2( value ) { this.setControl2( value ); }

  /**
   * Returns the second control point of this Cubic.
   * @public
   *
   * @returns {Vector2}
   */
  getControl2() {
    return this._control2;
  }

  get control2() { return this.getControl2(); }

  /**
   * Sets the end point of the Cubic.
   * @public
   *
   * @param {Vector2} end
   * @returns {Cubic}
   */
  setEnd( end ) {
    assert && assert( end instanceof Vector2, `Cubic end should be a Vector2: ${end}` );
    assert && assert( end.isFinite(), `Cubic end should be finite: ${end.toString()}` );

    if ( !this._end.equals( end ) ) {
      this._end = end;
      this.invalidate();
    }
    return this; // allow chaining
  }

  set end( value ) { this.setEnd( value ); }

  /**
   * Returns the end of this Cubic.
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

    // Equivalent position: (1 - t)^3*start + 3*(1 - t)^2*t*control1 + 3*(1 - t) t^2*control2 + t^3*end
    const mt = 1 - t;
    const mmm = mt * mt * mt;
    const mmt = 3 * mt * mt * t;
    const mtt = 3 * mt * t * t;
    const ttt = t * t * t;

    return new Vector2(
      this._start.x * mmm + this._control1.x * mmt + this._control2.x * mtt + this._end.x * ttt,
      this._start.y * mmm + this._control1.y * mmt + this._control2.y * mtt + this._end.y * ttt
    );
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

    // derivative: -3 p0 (1 - t)^2 + 3 p1 (1 - t)^2 - 6 p1 (1 - t) t + 6 p2 (1 - t) t - 3 p2 t^2 + 3 p3 t^2
    const mt = 1 - t;
    const result = new Vector2( 0, 0 );
    return result.set( this._start ).multiplyScalar( -3 * mt * mt )
      .add( scratchVector1.set( this._control1 ).multiplyScalar( 3 * mt * mt - 6 * mt * t ) )
      .add( scratchVector1.set( this._control2 ).multiplyScalar( 6 * mt * t - 3 * t * t ) )
      .add( scratchVector1.set( this._end ).multiplyScalar( 3 * t * t ) );
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
    // TODO: remove code duplication with Quadratic
    const epsilon = 0.0000001;
    if ( Math.abs( t - 0.5 ) > 0.5 - epsilon ) {
      const isZero = t < 0.5;
      const p0 = isZero ? this._start : this._end;
      const p1 = isZero ? this._control1 : this._control2;
      const p2 = isZero ? this._control2 : this._control1;
      const d10 = p1.minus( p0 );
      const a = d10.magnitude;
      const h = ( isZero ? -1 : 1 ) * d10.perpendicular.normalized().dot( p2.minus( p1 ) );
      return ( h * ( this.degree - 1 ) ) / ( this.degree * a * a );
    }
    else {
      return this.subdivided( t )[ 0 ].curvatureAt( 1 );
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
    // TODO: add a 'bisect' or 'between' method for vectors?
    const left = this._start.blend( this._control1, t );
    const right = this._control2.blend( this._end, t );
    const middle = this._control1.blend( this._control2, t );
    const leftMid = left.blend( middle, t );
    const rightMid = middle.blend( right, t );
    const mid = leftMid.blend( rightMid, t );
    return [
      new kite.Cubic( this._start, left, leftMid, mid ),
      new kite.Cubic( mid, rightMid, right, this._end )
    ];
  }

  /**
   * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   * @public
   */
  invalidate() {
    assert && assert( this._start instanceof Vector2, `Cubic start should be a Vector2: ${this._start}` );
    assert && assert( this._start.isFinite(), `Cubic start should be finite: ${this._start.toString()}` );
    assert && assert( this._control1 instanceof Vector2, `Cubic control1 should be a Vector2: ${this._control1}` );
    assert && assert( this._control1.isFinite(), `Cubic control1 should be finite: ${this._control1.toString()}` );
    assert && assert( this._control2 instanceof Vector2, `Cubic control2 should be a Vector2: ${this._control2}` );
    assert && assert( this._control2.isFinite(), `Cubic control2 should be finite: ${this._control2.toString()}` );
    assert && assert( this._end instanceof Vector2, `Cubic end should be a Vector2: ${this._end}` );
    assert && assert( this._end.isFinite(), `Cubic end should be finite: ${this._end.toString()}` );

    // Lazily-computed derived information
    this._startTangent = null; // {Vector2|null}
    this._endTangent = null; // {Vector2|null}
    this._r = null; // {number|null}
    this._s = null; // {number|null}

    // Cusp-specific information
    this._tCusp = null; // {number|null} - T value for a potential cusp
    this._tDeterminant = null; // {number|null}
    this._tInflection1 = null; // {number|null} - NaN if not applicable
    this._tInflection2 = null; // {number|null} - NaN if not applicable
    this._quadratics = null; // {Array.<Quadratic>|null}

    // T-values where X and Y (respectively) reach an extrema (not necessarily including 0 and 1)
    this._xExtremaT = null; // {Array.<number>|null}
    this._yExtremaT = null; // {Array.<number>|null}

    this._bounds = null; // {Bounds2|null}
    this._svgPathFragment = null; // {string|null}

    this.invalidationEmitter.emit();
  }

  /**
   * Gets the start position of this cubic polynomial.
   * @public
   *
   * @returns {Vector2}
   */
  getStartTangent() {
    if ( this._startTangent === null ) {
      this._startTangent = this.tangentAt( 0 ).normalized();
    }
    return this._startTangent;
  }

  get startTangent() { return this.getStartTangent(); }

  /**
   * Gets the end position of this cubic polynomial.
   * @public
   *
   * @returns {Vector2}
   */
  getEndTangent() {
    if ( this._endTangent === null ) {
      this._endTangent = this.tangentAt( 1 ).normalized();
    }
    return this._endTangent;
  }

  get endTangent() { return this.getEndTangent(); }

  /**
   * TODO: documentation
   * @public
   *
   * @returns {Vector2}
   */
  getR() {
    // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
    if ( this._r === null ) {
      this._r = this._control1.minus( this._start ).normalized();
    }
    return this._r;
  }

  get r() { return this.getR(); }

  /**
   * TODO: documentation
   * @public
   *
   * @returns {Vector2}
   */
  getS() {
    // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
    if ( this._s === null ) {
      this._s = this.getR().perpendicular;
    }
    return this._s;
  }

  get s() { return this.getS(); }

  /**
   * Returns the parametric t value for the possible cusp location. A cusp may or may not exist at that point.
   * @public
   *
   * @returns {number}
   */
  getTCusp() {
    if ( this._tCusp === null ) {
      this.computeCuspInfo();
    }
    assert && assert( this._tCusp !== null );
    return this._tCusp;
  }

  get tCusp() { return this.getTCusp(); }

  /**
   * Returns the determinant value for the cusp, which indicates the presence (or lack of presence) of a cusp.
   * @public
   *
   * @returns {number}
   */
  getTDeterminant() {
    if ( this._tDeterminant === null ) {
      this.computeCuspInfo();
    }
    assert && assert( this._tDeterminant !== null );
    return this._tDeterminant;
  }

  get tDeterminant() { return this.getTDeterminant(); }

  /**
   * Returns the parametric t value for the potential location of the first possible inflection point.
   * @public
   *
   * @returns {number}
   */
  getTInflection1() {
    if ( this._tInflection1 === null ) {
      this.computeCuspInfo();
    }
    assert && assert( this._tInflection1 !== null );
    return this._tInflection1;
  }

  get tInflection1() { return this.getTInflection1(); }

  /**
   * Returns the parametric t value for the potential location of the second possible inflection point.
   * @public
   *
   * @returns {number}
   */
  getTInflection2() {
    if ( this._tInflection2 === null ) {
      this.computeCuspInfo();
    }
    assert && assert( this._tInflection2 !== null );
    return this._tInflection2;
  }

  get tInflection2() { return this.getTInflection2(); }

  /**
   * If there is a cusp, this cubic will consist of one or two quadratic segments, typically "start => cusp" and
   * "cusp => end".
   * @public
   *
   * @returns {Array.<Quadratic>|null}
   */
  getQuadratics() {
    if ( this._quadratics === null ) {
      this.computeCuspSegments();
    }
    assert && assert( this._quadratics !== null );
    return this._quadratics;
  }

  /**
   * Returns a list of parametric t values where x-extrema exist, i.e. where dx/dt==0. These are candidate locations
   * on the cubic for "maximum X" and "minimum X", and are needed for bounds computations.
   * @public
   *
   * @returns {Array.<number>}
   */
  getXExtremaT() {
    if ( this._xExtremaT === null ) {
      this._xExtremaT = Cubic.extremaT( this._start.x, this._control1.x, this._control2.x, this._end.x );
    }
    return this._xExtremaT;
  }

  get xExtremaT() { return this.getXExtremaT(); }

  /**
   * Returns a list of parametric t values where y-extrema exist, i.e. where dy/dt==0. These are candidate locations
   * on the cubic for "maximum Y" and "minimum Y", and are needed for bounds computations.
   * @public
   *
   * @returns {Array.<number>}
   */
  getYExtremaT() {
    if ( this._yExtremaT === null ) {
      this._yExtremaT = Cubic.extremaT( this._start.y, this._control1.y, this._control2.y, this._end.y );
    }
    return this._yExtremaT;
  }

  get yExtremaT() { return this.getYExtremaT(); }

  /**
   * Returns the bounds of this segment.
   * @public
   *
   * @returns {Bounds2}
   */
  getBounds() {
    if ( this._bounds === null ) {
      this._bounds = Bounds2.NOTHING;
      this._bounds = this._bounds.withPoint( this._start );
      this._bounds = this._bounds.withPoint( this._end );

      _.each( this.getXExtremaT(), t => {
        if ( t >= 0 && t <= 1 ) {
          this._bounds = this._bounds.withPoint( this.positionAt( t ) );
        }
      } );
      _.each( this.getYExtremaT(), t => {
        if ( t >= 0 && t <= 1 ) {
          this._bounds = this._bounds.withPoint( this.positionAt( t ) );
        }
      } );

      if ( this.hasCusp() ) {
        this._bounds = this._bounds.withPoint( this.positionAt( this.getTCusp() ) );
      }
    }
    return this._bounds;
  }

  get bounds() { return this.getBounds(); }

  /**
   * Computes all cusp-related information, including whether there is a cusp, any inflection points, etc.
   * @private
   */
  computeCuspInfo() {
    // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
    // TODO: allocation reduction
    const a = this._start.times( -1 ).plus( this._control1.times( 3 ) ).plus( this._control2.times( -3 ) ).plus( this._end );
    const b = this._start.times( 3 ).plus( this._control1.times( -6 ) ).plus( this._control2.times( 3 ) );
    const c = this._start.times( -3 ).plus( this._control1.times( 3 ) );

    const aPerp = a.perpendicular; // {Vector2}
    const bPerp = b.perpendicular; // {Vector2}
    const aPerpDotB = aPerp.dot( b ); // {number}

    this._tCusp = -0.5 * ( aPerp.dot( c ) / aPerpDotB ); // {number}
    this._tDeterminant = this._tCusp * this._tCusp - ( 1 / 3 ) * ( bPerp.dot( c ) / aPerpDotB ); // {number}
    if ( this._tDeterminant >= 0 ) {
      const sqrtDet = Math.sqrt( this._tDeterminant );
      this._tInflection1 = this._tCusp - sqrtDet;
      this._tInflection2 = this._tCusp + sqrtDet;
    }
    else {
      // there are no real roots to the quadratic polynomial.
      this._tInflection1 = NaN;
      this._tInflection2 = NaN;
    }
  }

  /**
   * If there is a cusp, this computes the 2 quadratic Bezier curves that this Cubic can be converted into.
   * @private
   */
  computeCuspSegments() {
    if ( this.hasCusp() ) {
      // if there is a cusp, we'll split at the cusp into two quadratic bezier curves.
      // see http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.94.8088&rep=rep1&type=pdf (Singularities of rational Bezier curves - J Monterde, 2001)
      this._quadratics = [];
      const tCusp = this.getTCusp();
      if ( tCusp === 0 ) {
        this._quadratics.push( new Quadratic( this.start, this.control2, this.end ) );
      }
      else if ( tCusp === 1 ) {
        this._quadratics.push( new Quadratic( this.start, this.control1, this.end ) );
      }
      else {
        const subdividedAtCusp = this.subdivided( tCusp );
        this._quadratics.push( new Quadratic( subdividedAtCusp[ 0 ].start, subdividedAtCusp[ 0 ].control1, subdividedAtCusp[ 0 ].end ) );
        this._quadratics.push( new Quadratic( subdividedAtCusp[ 1 ].start, subdividedAtCusp[ 1 ].control2, subdividedAtCusp[ 1 ].end ) );
      }
    }
    else {
      this._quadratics = null;
    }
  }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   * @public
   *
   * @returns {Array.<Segment>}
   */
  getNondegenerateSegments() {
    const start = this._start;
    const control1 = this._control1;
    const control2 = this._control2;
    const end = this._end;

    const reduced = this.degreeReduced( 1e-9 );

    if ( start.equals( end ) && start.equals( control1 ) && start.equals( control2 ) ) {
      // degenerate point
      return [];
    }
    else if ( this.hasCusp() ) {
      return _.flatten( this.getQuadratics().map( quadratic => quadratic.getNondegenerateSegments() ) );
    }
    else if ( reduced ) {
      // if we can reduce to a quadratic Bezier, always do this (and make sure it is non-degenerate)
      return reduced.getNondegenerateSegments();
    }
    else if ( arePointsCollinear( start, control1, end ) && arePointsCollinear( start, control2, end ) && !start.equalsEpsilon( end, 1e-7 ) ) {
      const extremaPoints = this.getXExtremaT().concat( this.getYExtremaT() ).sort().map( t => this.positionAt( t ) );

      const segments = [];
      let lastPoint = start;
      if ( extremaPoints.length ) {
        segments.push( new kite.Line( start, extremaPoints[ 0 ] ) );
        lastPoint = extremaPoints[ 0 ];
      }
      for ( let i = 1; i < extremaPoints.length; i++ ) {
        segments.push( new kite.Line( extremaPoints[ i - 1 ], extremaPoints[ i ] ) );
        lastPoint = extremaPoints[ i ];
      }
      segments.push( new kite.Line( lastPoint, end ) );

      return _.flatten( segments.map( segment => segment.getNondegenerateSegments() ), true );
    }
    else {
      return [ this ];
    }
  }

  /**
   * Returns whether this cubic has a cusp.
   * @public
   *
   * @returns {boolean}
   */
  hasCusp() {
    const tCusp = this.getTCusp();

    const epsilon = 1e-7; // TODO: make this available to change?
    return tCusp >= 0 && tCusp <= 1 && this.tangentAt( tCusp ).magnitude < epsilon;
  }

  /**
   * @public
   *
   * @param {Vector2} point
   * @returns {Vector2}
   */
  toRS( point ) {
    const firstVector = point.minus( this._start );
    return new Vector2( firstVector.dot( this.getR() ), firstVector.dot( this.getS() ) );
  }

  /**
   * @public
   *
   * @param {number} r
   * @param {boolean} reverse
   * @returns {Array.<Line>}
   */
  offsetTo( r, reverse ) {
    // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html
    // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf

    // how many segments to create (possibly make this more adaptive?)
    const quantity = 32;

    const points = [];
    const result = [];
    for ( let i = 0; i < quantity; i++ ) {
      let t = i / ( quantity - 1 );
      if ( reverse ) {
        t = 1 - t;
      }

      points.push( this.positionAt( t ).plus( this.tangentAt( t ).perpendicular.normalized().times( r ) ) );
      if ( i > 0 ) {
        result.push( new kite.Line( points[ i - 1 ], points[ i ] ) );
      }
    }

    return result;
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls this needs to put
   * the M calls first
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
      this._svgPathFragment = `C ${kite.svgNumber( this._control1.x )} ${kite.svgNumber( this._control1.y )} ${
        kite.svgNumber( this._control2.x )} ${kite.svgNumber( this._control2.y )} ${
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
   * @returns {Array.<Line>}
   */
  strokeLeft( lineWidth ) {
    return this.offsetTo( -lineWidth / 2, false );
  }

  /**
   * Returns an array of lines that will draw an offset curve on the logical right side
   * @public
   *
   * @param {number} lineWidth
   * @returns {Array.<Line>}
   */
  strokeRight( lineWidth ) {
    return this.offsetTo( lineWidth / 2, true );
  }

  /**
   * Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   * The list does not include t=0 and t=1
   * @public
   *
   * @returns {Array.<number>}
   */
  getInteriorExtremaTs() {
    const ts = this.getXExtremaT().concat( this.getYExtremaT() );
    const result = [];
    _.each( ts, t => {
      const epsilon = 0.0000000001; // TODO: general kite epsilon?
      if ( t > epsilon && t < 1 - epsilon ) {
        // don't add duplicate t values
        if ( _.every( result, otherT => Math.abs( t - otherT ) > epsilon ) ) {
          result.push( t );
        }
      }
    } );
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
    const p1 = inverseMatrix.timesVector2( this._control1 );
    const p2 = inverseMatrix.timesVector2( this._control2 );
    const p3 = inverseMatrix.timesVector2( this._end );

    // polynomial form of cubic: start + (3 control1 - 3 start) t + (-6 control1 + 3 control2 + 3 start) t^2 + (3 control1 - 3 control2 + end - start) t^3
    const a = -p0.y + 3 * p1.y - 3 * p2.y + p3.y;
    const b = 3 * p0.y - 6 * p1.y + 3 * p2.y;
    const c = -3 * p0.y + 3 * p1.y;
    const d = p0.y;

    const ts = solveCubicRootsReal( a, b, c, d );

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
    context.bezierCurveTo( this._control1.x, this._control1.y, this._control2.x, this._control2.y, this._end.x, this._end.y );
  }

  /**
   * Returns a new cubic that represents this cubic after transformation by the matrix
   * @public
   *
   * @param {Matrix3} matrix
   * @returns {Cubic}
   */
  transformed( matrix ) {
    return new kite.Cubic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control1 ), matrix.timesVector2( this._control2 ), matrix.timesVector2( this._end ) );
  }


  /**
   * Returns a degree-reduced quadratic Bezier if possible, otherwise it returns null
   * @public
   *
   * @param {number} epsilon
   * @returns {Quadratic|null}
   */
  degreeReduced( epsilon ) {
    epsilon = epsilon || 0; // if not provided, use an exact version
    const controlA = scratchVector1.set( this._control1 ).multiplyScalar( 3 ).subtract( this._start ).divideScalar( 2 );
    const controlB = scratchVector2.set( this._control2 ).multiplyScalar( 3 ).subtract( this._end ).divideScalar( 2 );
    const difference = scratchVector3.set( controlA ).subtract( controlB );
    if ( difference.magnitude <= epsilon ) {
      return new Quadratic(
        this._start,
        controlA.average( controlB ), // average the control points for stability. they should be almost identical
        this._end
      );
    }
    else {
      // the two options for control points are too far away, this curve isn't easily reducible.
      return null;
    }
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
    return 1 / 20 * (
      this._start.x * ( 6 * this._control1.y + 3 * this._control2.y + this._end.y ) +
      this._control1.x * ( -6 * this._start.y + 3 * this._control2.y + 3 * this._end.y ) +
      this._control2.x * ( -3 * this._start.y - 3 * this._control1.y + 6 * this._end.y ) +
      this._end.x * ( -this._start.y - 3 * this._control1.y - 6 * this._control2.y )
    );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   * @public
   *
   * @returns {Cubic}
   */
  reversed() {
    return new kite.Cubic( this._end, this._control2, this._control1, this._start );
  }

  /**
   * If it exists, returns the point where the cubic curve self-intersects.
   * @public
   *
   * @returns {SegmentIntersection|null} - Null if there is no intersection
   */
  getSelfIntersection() {
    // We split the cubic into monotone sections (which can't self-intersect), then check these for intersections
    const tExtremes = this.getInteriorExtremaTs();
    const fullExtremes = [ 0 ].concat( tExtremes ).concat( [ 1 ] );
    const segments = this.subdivisions( tExtremes );
    if ( segments.length < 3 ) {
      return null;
    }

    for ( let i = 0; i < segments.length; i++ ) {
      const aSegment = segments[ i ];
      for ( let j = i + 1; j < segments.length; j++ ) {
        const bSegment = segments[ j ];

        const intersections = BoundsIntersection.intersect( aSegment, bSegment );
        assert && assert( intersections.length < 2 );

        if ( intersections.length ) {
          const intersection = intersections[ 0 ];
          // Exclude endpoints overlapping
          if ( intersection.aT > 1e-7 && intersection.aT < ( 1 - 1e-7 ) &&
               intersection.bT > 1e-7 && intersection.bT < ( 1 - 1e-7 ) ) {
            // Remap parametric values from the subdivided segments to the main segment
            const aT = fullExtremes[ i ] + intersection.aT * ( fullExtremes[ i + 1 ] - fullExtremes[ i ] );
            const bT = fullExtremes[ j ] + intersection.bT * ( fullExtremes[ j + 1 ] - fullExtremes[ j ] );
            return new SegmentIntersection( intersection.point, aT, bT );
          }
        }

      }
    }

    return null;
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   * @public
   *
   * @returns {Object}
   */
  serialize() {
    return {
      type: 'Cubic',
      startX: this._start.x,
      startY: this._start.y,
      control1X: this._control1.x,
      control1Y: this._control1.y,
      control2X: this._control2.x,
      control2Y: this._control2.y,
      endX: this._end.x,
      endY: this._end.y
    };
  }

  /**
   * Returns a Cubic from the serialized representation.
   * @public
   *
   * @param {Object} obj
   * @returns {Cubic}
   */
  static deserialize( obj ) {
    assert && assert( obj.type === 'Cubic' );

    return new Cubic( new Vector2( obj.startX, obj.startY ), new Vector2( obj.control1X, obj.control1Y ), new Vector2( obj.control2X, obj.control2Y ), new Vector2( obj.endX, obj.endY ) );
  }

  /**
   * Finds what t values the cubic extrema are at (if any). This is just the 1-dimensional case, used for multiple purposes
   * @public
   *
   * @param {number} v0
   * @param {number} v1
   * @param {number} v2
   * @param {number} v3
   * @returns {number}
   */
  static extremaT( v0, v1, v2, v3 ) {
    if ( v0 === v1 && v0 === v2 && v0 === v3 ) {
      return [];
    }

    // coefficients of derivative
    const a = -3 * v0 + 9 * v1 - 9 * v2 + 3 * v3;
    const b = 6 * v0 - 12 * v1 + 6 * v2;
    const c = -3 * v0 + 3 * v1;

    return _.filter( solveQuadraticRootsReal( a, b, c ), isBetween0And1 );
  }

  /**
   * Determine whether two Cubics overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   * @public
   *
   * NOTE: for this particular function, we assume we're not degenerate. Things may work if we can be degree-reduced
   * to a quadratic, but generally that shouldn't be done.
   *
   * @param {Cubic} cubic1
   * @param {Cubic} cubic2
   * @param {number} [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns {Array.<Overlap>} - The solution, if there is one (and only one)
   */
  static getOverlaps( cubic1, cubic2, epsilon = 1e-6 ) {
    assert && assert( cubic1 instanceof Cubic, 'first Cubic is not an instance of Cubic' );
    assert && assert( cubic2 instanceof Cubic, 'second Cubic is not an instance of Cubic' );

    /*
     * For a 1-dimensional cubic bezier, we have the formula:
     *
     *                            [  0  0  0  0 ]   [ p0 ]
     * p( t ) = [ 1 t t^2 t^3 ] * [ -3  3  0  0 ] * [ p1 ]
     *                            [  3 -6  3  0 ]   [ p2 ]
     *                            [ -1  3 -3  1 ]   [ p3 ]
     *
     * where p0,p1,p2,p3 are the control values (start,control1,control2,end). We want to see if a linear-mapped cubic:
     *
     *                                              [ 1 b b^2  b^3  ]   [  0  0  0  0 ]   [ q0 ]
     * p( t ) =? q( a * t + b ) = [ 1 t t^2 t^3 ] * [ 0 a 2ab 3ab^2 ] * [ -3  3  0  0 ] * [ q1 ]
     *                                              [ 0 0 a^2 3a^2b ]   [  3 -6  3  0 ]   [ q2 ]
     *                                              [ 0 0  0   a^3  ]   [ -1  3 -3  1 ]   [ q3 ]
     *
     * (is it equal to the second cubic if we can find a linear way to map its input t-value?)
     *
     * For simplicity and efficiency, we'll precompute the multiplication of the bezier matrix:
     * [ p0s ]    [  1   0   0   0 ]   [ p0 ]
     * [ p1s ] == [ -3   3   0   0 ] * [ p1 ]
     * [ p2s ]    [  3  -6   3   0 ]   [ p2 ]
     * [ p3s ]    [ -1   3  -3   1 ]   [ p3 ]
     *
     * Leaving our computation to solve for a,b such that:
     *
     * [ p0s ]    [ 1 b b^2  b^3  ]   [ q0s ]
     * [ p1s ] == [ 0 a 2ab 3ab^2 ] * [ q1s ]
     * [ p2s ]    [ 0 0 a^2 3a^2b ]   [ q2s ]
     * [ p3s ]    [ 0 0  0   a^3  ]   [ q3s ]
     *
     * The subproblem of computing possible a,b pairs will be left to Segment.polynomialGetOverlapCubic and its
     * reductions (if p3s/q3s are zero, they aren't fully cubic beziers and can be degree reduced, which is handled).
     *
     * Then, given an a,b pair, we need to ensure the above formula is satisfied (approximately, due to floating-point
     * arithmetic).
     */

    const noOverlap = [];

    // Efficiently compute the multiplication of the bezier matrix:
    const p0x = cubic1._start.x;
    const p1x = -3 * cubic1._start.x + 3 * cubic1._control1.x;
    const p2x = 3 * cubic1._start.x - 6 * cubic1._control1.x + 3 * cubic1._control2.x;
    const p3x = -1 * cubic1._start.x + 3 * cubic1._control1.x - 3 * cubic1._control2.x + cubic1._end.x;
    const p0y = cubic1._start.y;
    const p1y = -3 * cubic1._start.y + 3 * cubic1._control1.y;
    const p2y = 3 * cubic1._start.y - 6 * cubic1._control1.y + 3 * cubic1._control2.y;
    const p3y = -1 * cubic1._start.y + 3 * cubic1._control1.y - 3 * cubic1._control2.y + cubic1._end.y;
    const q0x = cubic2._start.x;
    const q1x = -3 * cubic2._start.x + 3 * cubic2._control1.x;
    const q2x = 3 * cubic2._start.x - 6 * cubic2._control1.x + 3 * cubic2._control2.x;
    const q3x = -1 * cubic2._start.x + 3 * cubic2._control1.x - 3 * cubic2._control2.x + cubic2._end.x;
    const q0y = cubic2._start.y;
    const q1y = -3 * cubic2._start.y + 3 * cubic2._control1.y;
    const q2y = 3 * cubic2._start.y - 6 * cubic2._control1.y + 3 * cubic2._control2.y;
    const q3y = -1 * cubic2._start.y + 3 * cubic2._control1.y - 3 * cubic2._control2.y + cubic2._end.y;

    // Determine the candidate overlap (preferring the dimension with the largest variation)
    const xSpread = Math.abs( Math.max( cubic1._start.x, cubic1._control1.x, cubic1._control2.x, cubic1._end.x,
      cubic1._start.x, cubic1._control1.x, cubic1._control2.x, cubic1._end.x ) -
                              Math.min( cubic1._start.x, cubic1._control1.x, cubic1._control2.x, cubic1._end.x,
                                cubic1._start.x, cubic1._control1.x, cubic1._control2.x, cubic1._end.x ) );
    const ySpread = Math.abs( Math.max( cubic1._start.y, cubic1._control1.y, cubic1._control2.y, cubic1._end.y,
      cubic1._start.y, cubic1._control1.y, cubic1._control2.y, cubic1._end.y ) -
                              Math.min( cubic1._start.y, cubic1._control1.y, cubic1._control2.y, cubic1._end.y,
                                cubic1._start.y, cubic1._control1.y, cubic1._control2.y, cubic1._end.y ) );
    const xOverlap = Segment.polynomialGetOverlapCubic( p0x, p1x, p2x, p3x, q0x, q1x, q2x, q3x );
    const yOverlap = Segment.polynomialGetOverlapCubic( p0y, p1y, p2y, p3y, q0y, q1y, q2y, q3y );
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

    // Premultiply a few values
    const aa = a * a;
    const aaa = a * a * a;
    const bb = b * b;
    const bbb = b * b * b;
    const ab2 = 2 * a * b;
    const abb3 = 3 * a * bb;
    const aab3 = 3 * aa * b;

    // Compute cubic coefficients for the difference between p(t) and q(a*t+b)
    const d0x = q0x + b * q1x + bb * q2x + bbb * q3x - p0x;
    const d1x = a * q1x + ab2 * q2x + abb3 * q3x - p1x;
    const d2x = aa * q2x + aab3 * q3x - p2x;
    const d3x = aaa * q3x - p3x;
    const d0y = q0y + b * q1y + bb * q2y + bbb * q3y - p0y;
    const d1y = a * q1y + ab2 * q2y + abb3 * q3y - p1y;
    const d2y = aa * q2y + aab3 * q3y - p2y;
    const d3y = aaa * q3y - p3y;

    // Find the t values where extremes lie in the [0,1] range for each 1-dimensional cubic. We do this by
    // differentiating the cubic and finding the roots of the resulting quadratic.
    const xRoots = Utils.solveQuadraticRootsReal( 3 * d3x, 2 * d2x, d1x );
    const yRoots = Utils.solveQuadraticRootsReal( 3 * d3y, 2 * d2y, d1y );
    const xExtremeTs = _.uniq( [ 0, 1 ].concat( xRoots !== null ? xRoots.filter( isBetween0And1 ) : [] ) );
    const yExtremeTs = _.uniq( [ 0, 1 ].concat( yRoots !== null ? yRoots.filter( isBetween0And1 ) : [] ) );

    // Examine the single-coordinate distances between the "overlaps" at each extreme T value. If the distance is larger
    // than our epsilon, then the "overlap" would not be valid.
    for ( let i = 0; i < xExtremeTs.length; i++ ) {
      const t = xExtremeTs[ i ];
      if ( Math.abs( ( ( d3x * t + d2x ) * t + d1x ) * t + d0x ) > epsilon ) {
        return noOverlap;
      }
    }
    for ( let i = 0; i < yExtremeTs.length; i++ ) {
      const t = yExtremeTs[ i ];
      if ( Math.abs( ( ( d3y * t + d2y ) * t + d1y ) * t + d0y ) > epsilon ) {
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

// @public {number} - degree of this polynomial (cubic)
Cubic.prototype.degree = 3;

kite.register( 'Cubic', Cubic );

export default Cubic;