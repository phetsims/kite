// Copyright 2013-2015, University of Colorado Boulder

/**
 * Cubic Bezier segment.
 *
 * See http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf for info
 *
 * Good reference: http://cagd.cs.byu.edu/~557/text/ch2.pdf
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Vector2 = require( 'DOT/Vector2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Util = require( 'DOT/Util' );

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );
  require( 'KITE/segments/Quadratic' );


  var solveQuadraticRootsReal = Util.solveQuadraticRootsReal; // function that returns an array of number
  var solveCubicRootsReal = Util.solveCubicRootsReal; // function that returns an array of number
  var arePointsCollinear = Util.arePointsCollinear; // function that returns a boolean

  // convenience variables use to reduce the number of vector allocations
  var scratchVector1 = new Vector2();
  var scratchVector2 = new Vector2();
  var scratchVector3 = new Vector2();

  /**
   * Creates a cubic bezier curve
   * @param {Vector2} start - Start point of the cubic bezier
   * @param {Vector2} control1 - First control point
   * @param {Vector2} control2 - Second control point
   * @param {Vector2} end - End point of the cubic bezier
   * @constructor
   */
  function Cubic( start, control1, control2, end ) {
    Segment.call( this );

    this._start = start; //  @private {Vector2}
    this._control1 = control1; // @private {Vector2}
    this._control2 = control2; // @private {Vector2}
    this._end = end; // @private {Vector2}

    this.invalidate();
  }

  kite.register( 'Cubic', Cubic );

  inherit( Segment, Cubic, {

    degree: 3, // degree of this polynomial (cubic)

    /**
     * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
     * @public
     */
    invalidate: function() {
      // Lazily-computed derived information
      this._startTangent = null; // {Vector2 | null}
      this._endTangent = null; // {Vector2 | null}
      this._r = null; // {number | null}
      this._s = null; // {number | null}

      // Cusp-specific information
      this._tCusp = null; // {number | null} - T value for a potential cusp
      this._tDeterminant = null; // {number | null}
      this._tInflection1 = null; // {number | null} - NaN if not applicable
      this._tInflection2 = null; // {number | null} - NaN if not applicable
      this._startQuadratic = null; // {Quadratic | null}
      this._endQuadratic = null; // {Quadratic | null}

      // T-values where X and Y (respectively) reach an extrema (not necessarily including 0 and 1)
      this._xExtremaT = null; // {Array.<number> | null}
      this._yExtremaT = null; // {Array.<number> | null}

      this._bounds = null; // {Bounds2 | null}

      this.trigger0( 'invalidated' );
    },

    /**
     * Gets the start position of this cubic polynomial
     * @public
     * @returns {Vector2}
     */
    getStartTangent: function() {
      if ( this._startTangent === null ) {
        this._startTangent = this.tangentAt( 0 ).normalized();
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    /**
     * Gets the end position of this cubic polynomial
     * @public
     * @returns {Vector2}
     */
    getEndTangent: function() {
      if ( this._endTangent === null ) {
        this._endTangent = this.tangentAt( 1 ).normalized();
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    /**
     * @public
     * @returns {Vector2}
     */
    getR: function() {
      // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      if ( this._r === null ) {
        this._r = this._control1.minus( this._start ).normalized();
      }
      return this._r;
    },
    get r() { return this.getR(); },

    /**
     * @public
     * @returns {Vector2}
     */
    getS: function() {
      // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      if ( this._s === null ) {
        this._s = this.getR().perpendicular();
      }
      return this._s;
    },
    get s() { return this.getS(); },

    /**
     *
     * @returns {number}
     */
    getTCusp: function() {
      if ( this._tCusp === null ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tCusp !== null );
      return this._tCusp;
    },
    get tCusp() { return this.getTCusp(); },

    /**
     *
     * @returns {number}
     */
    getTDeterminant: function() {
      if ( this._tDeterminant === null ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tDeterminant !== null );
      return this._tDeterminant;
    },
    get tDeterminant() { return this.getTDeterminant(); },

    /**
     *
     * @returns {number}
     */
    getTInflection1: function() {
      if ( this._tInflection1 === null ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tInflection1 !== null );
      return this._tInflection1;
    },
    get tInflection1() { return this.getTInflection1(); },

    /**
     *
     * @returns {number}
     */
    getTInflection2: function() {
      if ( this._tInflection2 === null ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tInflection2 !== null );
      return this._tInflection2;
    },
    get tInflection2() { return this.getTInflection2(); },

    /**
     *
     * @returns {Quadratic}
     */
    getStartQuadratic: function() {
      if ( this._startQuadratic === null ) {
        this.computeCuspSegments();
      }
      assert && assert( this._startQuadratic !== null );
      return this._startQuadratic;
    },
    get startQuadratic() { return this.getStartQuadratic(); },

    /**
     *
     * @returns {Quadratic}
     */
    getEndQuadratic: function() {
      if ( this._endQuadratic === null ) {
        this.computeCuspSegments();
      }
      assert && assert( this._endQuadratic !== null );
      return this._endQuadratic;
    },
    get endQuadratic() { return this.getEndQuadratic(); },

    /**
     *
     *
     * @returns {Array.<number>}
     */
    getXExtremaT: function() {
      if ( this._xExtremaT === null ) {
        this._xExtremaT = Cubic.extremaT( this._start.x, this._control1.x, this._control2.x, this._end.x );
      }
      return this._xExtremaT;
    },
    get xExtremaT() { return this.getXExtremaT(); },

    /**
     *
     * @returns {Array.<number>}
     */
    getYExtremaT: function() {
      if ( this._yExtremaT === null ) {
        this._yExtremaT = Cubic.extremaT( this._start.y, this._control1.y, this._control2.y, this._end.y );
      }
      return this._yExtremaT;
    },
    get yExtremaT() { return this.getYExtremaT(); },

    /**
     *
     * @returns {Bounds2}
     */
    getBounds: function() {
      if ( this._bounds === null ) {
        this._bounds = Bounds2.NOTHING;
        this._bounds = this._bounds.withPoint( this._start );
        this._bounds = this._bounds.withPoint( this._end );

        var cubic = this;
        _.each( this.getXExtremaT(), function( t ) {
          if ( t >= 0 && t <= 1 ) {
            cubic._bounds = cubic._bounds.withPoint( cubic.positionAt( t ) );
          }
        } );
        _.each( this.getYExtremaT(), function( t ) {
          if ( t >= 0 && t <= 1 ) {
            cubic._bounds = cubic._bounds.withPoint( cubic.positionAt( t ) );
          }
        } );

        if ( this.hasCusp() ) {
          this._bounds = this._bounds.withPoint( this.positionAt( this.getTCusp() ) );
        }
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    /**
     * t value for the cusp, and the related determinant and inflection points
     */
    computeCuspInfo: function() {
      // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      // TODO: allocation reduction
      var a = this._start.times( -1 ).plus( this._control1.times( 3 ) ).plus( this._control2.times( -3 ) ).plus( this._end );
      var b = this._start.times( 3 ).plus( this._control1.times( -6 ) ).plus( this._control2.times( 3 ) );
      var c = this._start.times( -3 ).plus( this._control1.times( 3 ) );

      var aPerp = a.perpendicular(); // {Vector2}
      var bPerp = b.perpendicular(); // {Vector2}
      var aPerpDotB = aPerp.dot( b ); // {number}

      this._tCusp = -0.5 * ( aPerp.dot( c ) / aPerpDotB ); // {number}
      this._tDeterminant = this._tCusp * this._tCusp - ( 1 / 3 ) * ( bPerp.dot( c ) / aPerpDotB ); // {number}
      if ( this._tDeterminant >= 0 ) {
        var sqrtDet = Math.sqrt( this._tDeterminant );
        this._tInflection1 = this._tCusp - sqrtDet;
        this._tInflection2 = this._tCusp + sqrtDet;
      }
      else {
        // there are no real roots to the quadratic polynomial.
        this._tInflection1 = NaN;
        this._tInflection2 = NaN;
      }
    },

    /**
     *   the cusp allows us to split into 2 quadratic Bezier curves
     */
    computeCuspSegments: function() {
      if ( this.hasCusp() ) {
        // if there is a cusp, we'll split at the cusp into two quadratic bezier curves.
        // see http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.94.8088&rep=rep1&type=pdf (Singularities of rational Bezier curves - J Monterde, 2001)
        var subdividedAtCusp = this.subdivided( this.getTCusp );
        this._startQuadratic = new kite.Quadratic( subdividedAtCusp[ 0 ].start, subdividedAtCusp[ 0 ].control1, subdividedAtCusp[ 0 ].end, false );
        this._endQuadratic = new kite.Quadratic( subdividedAtCusp[ 1 ].start, subdividedAtCusp[ 1 ].control2, subdividedAtCusp[ 1 ].end, false );
      }
      else {
        this._startQuadratic = null;
        this._endQuadratic = null;
      }
    },

    /**
     * Returns non degenerate segments of this cubic
     * @returns
     */
    getNondegenerateSegments: function() {
      var self = this;

      var start = this._start;
      var control1 = this._control1;
      var control2 = this._control2;
      var end = this._end;

      var reduced = this.degreeReduced( 1e-9 );

      if ( start.equals( end ) && start.equals( control1 ) && start.equals( control2 ) ) {
        // degenerate point
        return [];
      }
      else if ( this.hasCusp() ) {
        return _.flatten( [
          this._startQuadratic.getNondegenerateSegments(),
          this._endQuadratic.getNondegenerateSegments()
        ] );
      }
      else if ( reduced ) {
        // if we can reduce to a quadratic Bezier, always do this (and make sure it is non-degenerate)
        return reduced.getNondegenerateSegments();
      }
      else if ( arePointsCollinear( start, control1, end ) && arePointsCollinear( start, control2, end ) ) {
        var extremaPoints = this.getXExtremaT().concat( this.getYExtremaT() ).sort().map( function( t ) {
          return self.positionAt( t );
        } );

        var segments = [];
        var lastPoint = start;
        if ( extremaPoints.length ) {
          segments.push( new kite.Line( start, extremaPoints[ 0 ] ) );
          lastPoint = extremaPoints[ 0 ];
        }
        for ( var i = 1; i < extremaPoints.length; i++ ) {
          segments.push( new kite.Line( extremaPoints[ i - 1 ], extremaPoints[ i ] ) );
          lastPoint = extremaPoints[ i ];
        }
        segments.push( new kite.Line( lastPoint, end ) );

        return _.flatten( segments.map( function( segment ) { return segment.getNondegenerateSegments(); } ), true );
      }
      else {
        return [ this ];
      }
    },

    /**
     *
     * @returns {boolean}
     */
    hasCusp: function() {
      var tCusp = this.getTCusp();

      var epsilon = 1e-7; // TODO: make this available to change?
      return this.tangentAt( tCusp ).magnitude() < epsilon && tCusp >= 0 && tCusp <= 1;
    },

    /**
     * Returns the position along the polynomial paramaterized with the variable t.
     * Recall that t=0 is the start position and t=1 is the end position
     * Equivalent position: (1 - t)^3*start + 3*(1 - t)^2*t*control1 + 3*(1 - t) t^2*control2 + t^3*end
     * @public
     * @param {number} t
     * @returns {Vector2}
     */
    positionAt: function( t ) {
      var mt = 1 - t;
      return this._start.times( mt * mt * mt ).plus( this._control1.times( 3 * mt * mt * t ) ).plus( this._control2.times( 3 * mt * t * t ) ).plus( this._end.times( t * t * t ) );
    },

    //
    /**
     * Returns the derivative along this polynomial paramaterized with the variable t.
     * Recall that t=0 is the derivative at the start position and t=1 is the derivative at the end position
     * derivative: -3 p0 (1 - t)^2 + 3 p1 (1 - t)^2 - 6 p1 (1 - t) t + 6 p2 (1 - t) t - 3 p2 t^2 + 3 p3 t^2
     * @param {number} t
     * @returns {Vector2}
     */
    tangentAt: function( t ) {
      var mt = 1 - t;
      var result = new Vector2();
      return result.set( this._start ).multiplyScalar( -3 * mt * mt )
        .add( scratchVector1.set( this._control1 ).multiplyScalar( 3 * mt * mt - 6 * mt * t ) )
        .add( scratchVector1.set( this._control2 ).multiplyScalar( 6 * mt * t - 3 * t * t ) )
        .add( scratchVector1.set( this._end ).multiplyScalar( 3 * t * t ) );
    },

    /**
     * Returns the curvature of this polynomial paramaterized with the variable t.
     * Recall that t=0 is the curvature at the start position and t=1 is the curvature at the end position
     * @public
     * @param {number} t
     * @returns {number}
     */
    curvatureAt: function( t ) {
      // see http://cagd.cs.byu.edu/~557/text/ch2.pdf p31
      // TODO: remove code duplication with Quadratic
      var epsilon = 0.0000001;
      if ( Math.abs( t - 0.5 ) > 0.5 - epsilon ) {
        var isZero = t < 0.5;
        var p0 = isZero ? this._start : this._end;
        var p1 = isZero ? this._control1 : this._control2;
        var p2 = isZero ? this._control2 : this._control1;
        var d10 = p1.minus( p0 );
        var a = d10.magnitude();
        var h = ( isZero ? -1 : 1 ) * d10.perpendicular().normalized().dot( p2.minus( p1 ) );
        return ( h * ( this.degree - 1 ) ) / ( this.degree * a * a );
      }
      else {
        return this.subdivided( t )[ 0 ].curvatureAt( 1 );
      }
    },

    /**
     *
     * @param {Vector2} point
     * @returns {Vector2}
     */
    toRS: function( point ) {
      var firstVector = point.minus( this._start );
      return new Vector2( firstVector.dot( this.getR() ), firstVector.dot( this.getS() ) );
    },

    /**
     * Returns an array with 2 cubic segments, split at the parametric t value.
     * @param {number} t
     * @returns {Array.<Cubic>}
     */
    subdivided: function( t ) {
      // de Casteljau method
      // TODO: add a 'bisect' or 'between' method for vectors?
      var left = this._start.blend( this._control1, t );
      var right = this._control2.blend( this._end, t );
      var middle = this._control1.blend( this._control2, t );
      var leftMid = left.blend( middle, t );
      var rightMid = middle.blend( right, t );
      var mid = leftMid.blend( rightMid, t );
      return [
        new kite.Cubic( this._start, left, leftMid, mid ),
        new kite.Cubic( mid, rightMid, right, this._end )
      ];
    },

    /**
     *
     * @param {number} r
     * @param {boolean} reverse
     * @returns {Array.<Line>}
     */
    offsetTo: function( r, reverse ) {
      // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html
      // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf

      // how many segments to create (possibly make this more adaptive?)
      var quantity = 32;

      var points = [];
      var result = [];
      for ( var i = 0; i < quantity; i++ ) {
        var t = i / ( quantity - 1 );
        if ( reverse ) {
          t = 1 - t;
        }

        points.push( this.positionAt( t ).plus( this.tangentAt( t ).perpendicular().normalized().times( r ) ) );
        if ( i > 0 ) {
          result.push( new kite.Line( points[ i - 1 ], points[ i ] ) );
        }
      }

      return result;
    },

    /**
     * Returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls this needs to put
     * the M calls first
     * @returns {string}
     */
    getSVGPathFragment: function() {
      return 'C ' + kite.svgNumber( this._control1.x ) + ' ' + kite.svgNumber( this._control1.y ) + ' ' +
             kite.svgNumber( this._control2.x ) + ' ' + kite.svgNumber( this._control2.y ) + ' ' +
             kite.svgNumber( this._end.x ) + ' ' + kite.svgNumber( this._end.y );
    },

    /**
     * Returns an array of lines that will draw an offset curve on the logical left side
     * @param {number} lineWidth
     * @returns {Array.<Line>}
     */
    strokeLeft: function( lineWidth ) {
      return this.offsetTo( -lineWidth / 2, false );
    },

    /**
     * Returns an array of lines that will draw an offset curve on the logical right side
     * @param {number} lineWidth
     * @returns {Array.<Line>}
     */
    strokeRight: function( lineWidth ) {
      return this.offsetTo( lineWidth / 2, true );
    },

    /**
     * Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
     * The list does not include t=0 and t=1
     * @returns {Array.<number>}
     */
    getInteriorExtremaTs: function() {
      var ts = this.getXExtremaT().concat( this.getYExtremaT() );
      var result = [];
      _.each( ts, function( t ) {
        var epsilon = 0.0000000001; // TODO: general kite epsilon?
        if ( t > epsilon && t < 1 - epsilon ) {
          // don't add duplicate t values
          if ( _.every( result, function( otherT ) { return Math.abs( t - otherT ) > epsilon; } ) ) {
            result.push( t );
          }
        }
      } );
      return result.sort();
    },


    /**
     * @param {Ray2} ray
     * @returns {Array}
     */
    intersection: function( ray ) {
      var self = this;
      var result = [];

      // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
      var inverseMatrix = Matrix3.rotation2( -ray.direction.angle() ).timesMatrix( Matrix3.translation( -ray.position.x, -ray.position.y ) );

      var p0 = inverseMatrix.timesVector2( this._start );
      var p1 = inverseMatrix.timesVector2( this._control1 );
      var p2 = inverseMatrix.timesVector2( this._control2 );
      var p3 = inverseMatrix.timesVector2( this._end );

      // polynomial form of cubic: start + (3 control1 - 3 start) t + (-6 control1 + 3 control2 + 3 start) t^2 + (3 control1 - 3 control2 + end - start) t^3
      var a = -p0.y + 3 * p1.y - 3 * p2.y + p3.y;
      var b = 3 * p0.y - 6 * p1.y + 3 * p2.y;
      var c = -3 * p0.y + 3 * p1.y;
      var d = p0.y;

      var ts = solveCubicRootsReal( a, b, c, d );

      _.each( ts, function( t ) {
        if ( t >= 0 && t <= 1 ) {
          var hitPoint = self.positionAt( t );
          var unitTangent = self.tangentAt( t ).normalized();
          var perp = unitTangent.perpendicular();
          var toHit = hitPoint.minus( ray.position );

          // make sure it's not behind the ray
          if ( toHit.dot( ray.direction ) > 0 ) {
            result.push( {
              distance: toHit.magnitude(),
              point: hitPoint,
              normal: perp.dot( ray.direction ) > 0 ? perp.negated() : perp,
              wind: ray.direction.perpendicular().dot( unitTangent ) < 0 ? 1 : -1
            } );
          }
        }
      } );
      return result;
    },

    /**
     * Returns the winding number for intersection with a ray
     * @param {Ray2} ray
     * @returns {number}
     */
    windingIntersection: function( ray ) {
      var wind = 0;
      var hits = this.intersection( ray );
      _.each( hits, function( hit ) {
        wind += hit.wind;
      } );
      return wind;
    },

    /**
     * Draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
     * @param {CanvasRenderingContext2D} context
     */
    writeToContext: function( context ) {
      context.bezierCurveTo( this._control1.x, this._control1.y, this._control2.x, this._control2.y, this._end.x, this._end.y );
    },

    /**
     * Returns a new cubic that represents this cubic after transformation by the matrix
     * @param {Matrix3} matrix
     * @returns {Cubic}
     */
    transformed: function( matrix ) {
      return new kite.Cubic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control1 ), matrix.timesVector2( this._control2 ), matrix.timesVector2( this._end ) );
    },


    /**
     * Returns a degree-reduced quadratic Bezier if possible, otherwise it returns null
     * @param {number} epsilon
     * @returns {Quadratic|null}
     */
    degreeReduced: function( epsilon ) {
      epsilon = epsilon || 0; // if not provided, use an exact version
      var controlA = scratchVector1.set( this._control1 ).multiplyScalar( 3 ).subtract( this._start ).divideScalar( 2 );
      var controlB = scratchVector2.set( this._control2 ).multiplyScalar( 3 ).subtract( this._end ).divideScalar( 2 );
      var difference = scratchVector3.set( controlA ).subtract( controlB );
      if ( difference.magnitude() <= epsilon ) {
        return new kite.Quadratic(
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

    // returns the resultant winding number of this ray intersecting this segment.
    // windingIntersection: function( ray ) {
    //   // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
    //   var inverseMatrix = Matrix3.rotation2( -ray.direction.angle() );
    //   assert && assert( inverseMatrix.timesVector2( ray.direction ).x > 0.99 ); // verify that we transform the unit vector to the x-unit

    //   var y0 = inverseMatrix.timesVector2( this._start ).y;
    //   var y1 = inverseMatrix.timesVector2( this._control1 ).y;
    //   var y2 = inverseMatrix.timesVector2( this._control2 ).y;
    //   var y3 = inverseMatrix.timesVector2( this._end ).y;

    //   // polynomial form of cubic: start + (3 control1 - 3 start) t + (-6 control1 + 3 control2 + 3 start) t^2 + (3 control1 - 3 control2 + end - start) t^3
    //   var a = -y0 + 3 * y1 - 3 * y2 + y3;
    //   var b = 3 * y0 - 6 * y1 + 3 * y2;
    //   var c = -3 * y0 + 3 * y1;
    //   var d = y0;

    //   // solve cubic roots
    //   var ts = solveCubicRootsReal( a, b, c, d );

    //   var result = 0;

    //   // for each hit
    //   _.each( ts, function( t ) {
    //     if ( t >= 0 && t <= 1 ) {
    //       result += ray.direction.perpendicular().dot( this.tangentAt( t ) ) < 0 ? 1 : -1;
    //     }
    //   } );

    //   return result;
    // }
  } );

  /**
   * Add getters and setters
   */
  Segment.addInvalidatingGetterSetter( Cubic, 'start' );
  Segment.addInvalidatingGetterSetter( Cubic, 'control1' );
  Segment.addInvalidatingGetterSetter( Cubic, 'control2' );
  Segment.addInvalidatingGetterSetter( Cubic, 'end' );


  /**
   * finds what t values the cubic extrema are at (if any). This is just the 1-dimensional case, used for multiple purposes
   * @param {number} v0
   * @param {number} v1
   * @param {number} v2
   * @param {number} v3
   * @returns {number}
   */
  Cubic.extremaT = function( v0, v1, v2, v3 ) {
    if ( v0 === v1 && v0 === v2 && v0 === v3 ) {
      return [];
    }

    // coefficients of derivative
    var a = -3 * v0 + 9 * v1 - 9 * v2 + 3 * v3;
    var b = 6 * v0 - 12 * v1 + 6 * v2;
    var c = -3 * v0 + 3 * v1;

    return solveQuadraticRootsReal( a, b, c );
  };

  return Cubic;
} );
