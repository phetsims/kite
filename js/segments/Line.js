// Copyright 2013-2015, University of Colorado Boulder

/**
 * A line segment (all points directly between the start and end point)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var Bounds2 = require( 'DOT/Bounds2' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Overlap = require( 'KITE/util/Overlap' );
  var Ray2 = require( 'DOT/Ray2' );
  var RayIntersection = require( 'KITE/util/RayIntersection' );
  var Segment = require( 'KITE/segments/Segment' );
  var SegmentIntersection = require( 'KITE/util/SegmentIntersection' );
  var Util = require( 'DOT/Util' );
  var Vector2 = require( 'DOT/Vector2' );

  var scratchVector2 = new Vector2( 0, 0 );

  /**
   * @constructor
   *
   * @param {Vector2} start - Start point
   * @param {Vector2} end - End point
   */
  function Line( start, end ) {
    Segment.call( this );

    // @private {Vector2}
    this._start = start;
    this._end = end;

    this.invalidate();
  }

  kite.register( 'Line', Line );

  inherit( Segment, Line, {

    /**
     * Sets the start point of the Line.
     * @public
     *
     * @param {Vector2} start
     * @returns {Line}
     */
    setStart: function( start ) {
      assert && assert( start instanceof Vector2, 'Line start should be a Vector2: ' + start );
      assert && assert( start.isFinite(), 'Line start should be finite: ' + start.toString() );

      if ( !this._start.equals( start ) ) {
        this._start = start;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set start( value ) { this.setStart( value ); },

    /**
     * Returns the start of this Line.
     * @public
     *
     * @returns {Vector2}
     */
    getStart: function() {
      return this._start;
    },
    get start() { return this.getStart(); },

    /**
     * Sets the end point of the Line.
     * @public
     *
     * @param {Vector2} end
     * @returns {Line}
     */
    setEnd: function( end ) {
      assert && assert( end instanceof Vector2, 'Line end should be a Vector2: ' + end );
      assert && assert( end.isFinite(), 'Line end should be finite: ' + end.toString() );

      if ( !this._end.equals( end ) ) {
        this._end = end;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set end( value ) { this.setEnd( value ); },

    /**
     * Returns the end of this Line.
     * @public
     *
     * @returns {Vector2}
     */
    getEnd: function() {
      return this._end;
    },
    get end() { return this.getEnd(); },

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
    positionAt: function( t ) {
      assert && assert( t >= 0, 'positionAt t should be non-negative' );
      assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

      return this._start.plus( this._end.minus( this._start ).times( t ) );
    },

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
    tangentAt: function( t ) {
      assert && assert( t >= 0, 'tangentAt t should be non-negative' );
      assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

      // tangent always the same, just use the start tangent
      return this.getStartTangent();
    },

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
    curvatureAt: function( t ) {
      assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
      assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

      return 0; // no curvature on a straight line segment
    },

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
    subdivided: function( t ) {
      assert && assert( t >= 0, 'subdivided t should be non-negative' );
      assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

      // If t is 0 or 1, we only need to return 1 segment
      if ( t === 0 || t === 1 ) {
        return [ this ];
      }

      var pt = this.positionAt( t );
      return [
        new kite.Line( this._start, pt ),
        new kite.Line( pt, this._end )
      ];
    },

    /**
     * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
     * @public
     */
    invalidate: function() {
      assert && assert( this._start instanceof Vector2, 'Line start should be a Vector2: ' + this._start );
      assert && assert( this._start.isFinite(), 'Line start should be finite: ' + this._start.toString() );
      assert && assert( this._end instanceof Vector2, 'Line end should be a Vector2: ' + this._end );
      assert && assert( this._end.isFinite(), 'Line end should be finite: ' + this._end.toString() );

      // Lazily-computed derived information
      this._tangent = null; // {Vector2|null}
      this._bounds = null; // {Bounds2|null}
      this._svgPathFragment = null; // {string|null}

      this.trigger0( 'invalidated' );
    },

    /**
     * Returns a normalized unit vector that is tangent to this line (at the starting point)
     * the unit vectors points toward the end points.
     * @returns {Vector2}
     */
    getStartTangent: function() {
      if ( this._tangent === null ) {
        // TODO: allocation reduction
        this._tangent = this._end.minus( this._start ).normalized();
      }
      return this._tangent;
    },
    get startTangent() { return this.getStartTangent(); },

    /**
     * Returns the normalized unit vector that is tangent to this line
     * same as getStartTangent, since this is a straight line
     * @returns {Vector2}
     */
    getEndTangent: function() {
      return this.getStartTangent();
    },
    get endTangent() { return this.getEndTangent(); },

    /**
     * Returns the bounds of this segment.
     * @public
     *
     * @returns {Bounds2}
     */
    getBounds: function() {
      // TODO: allocation reduction
      if ( this._bounds === null ) {
        this._bounds = Bounds2.NOTHING.copy().addPoint( this._start ).addPoint( this._end );
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    /**
     * Returns the bounding box for this transformed Line
     * @param {Matrix3} matrix
     * @returns {Bounds2}
     */
    getBoundsWithTransform: function( matrix ) {
      // uses mutable calls
      var bounds = Bounds2.NOTHING.copy();
      bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._start ) ) );
      bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._end ) ) );
      return bounds;
    },

    /**
     * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
     * invalid or repeated segments.
     * @public
     *
     * @returns {Array.<Segment>}
     */
    getNondegenerateSegments: function() {
      // if it is degenerate (0-length), just ignore it
      if ( this._start.equals( this._end ) ) {
        return [];
      }
      else {
        return [ this ];
      }
    },

    /**
     * Returns a string containing the SVG path. assumes that the start point is already provided,
     * so anything that calls this needs to put the M calls first
     * @returns {string}
     */
    getSVGPathFragment: function() {
      if ( assert ) {
        var oldPathFragment = this._svgPathFragment;
        this._svgPathFragment = null;
      }
      if ( !this._svgPathFragment ) {
        this._svgPathFragment = 'L ' + kite.svgNumber( this._end.x ) + ' ' + kite.svgNumber( this._end.y );
      }
      if ( assert ) {
        if ( oldPathFragment ) {
          assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
        }
      }
      return this._svgPathFragment;
    },

    /**
     * Returns an array of Line that will draw an offset curve on the logical left side
     * @param {number} lineWidth
     * @returns {Array.<Line>}
     */
    strokeLeft: function( lineWidth ) {
      var offset = this.getEndTangent().perpendicular.negated().times( lineWidth / 2 );
      return [ new kite.Line( this._start.plus( offset ), this._end.plus( offset ) ) ];
    },
    /**
     * Returns an array of Line that will draw an offset curve on the logical right side
     * @param {number} lineWidth
     * @returns {Array.<Line>}
     */
    strokeRight: function( lineWidth ) {
      var offset = this.getStartTangent().perpendicular.times( lineWidth / 2 );
      return [ new kite.Line( this._end.plus( offset ), this._start.plus( offset ) ) ];
    },

    /**
     * In general, this method returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
     * Since lines are already monotone, it returns an empty array.
     * @public
     *
     * @returns {Array.<number>}
     */
    getInteriorExtremaTs: function() { return []; },

    /**
     * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
     * For details, see the documentation in Segment.js
     * @public
     *
     * @param {Ray2} ray
     * @returns {Array.<RayIntersection>}
     */
    intersection: function( ray ) {
      // We solve for the parametric line-line intersection, and then ensure the parameters are within both
      // the line segment and forwards from the ray.

      var result = [];

      var start = this._start;
      var end = this._end;

      var diff = end.minus( start );

      if ( diff.magnitudeSquared === 0 ) {
        return result;
      }

      var denom = ray.direction.y * diff.x - ray.direction.x * diff.y;

      // If denominator is 0, the lines are parallel or coincident
      if ( denom === 0 ) {
        return result;
      }

      // linear parameter where start (0) to end (1)
      var t = ( ray.direction.x * ( start.y - ray.position.y ) - ray.direction.y * ( start.x - ray.position.x ) ) / denom;

      // check that the intersection point is between the line segment's endpoints
      if ( t < 0 || t >= 1 ) {
        return result;
      }

      // linear parameter where ray.position (0) to ray.position+ray.direction (1)
      var s = ( diff.x * ( start.y - ray.position.y ) - diff.y * ( start.x - ray.position.x ) ) / denom;

      // bail if it is behind our ray
      if ( s < 0.00000001 ) {
        return result;
      }

      // return the proper winding direction depending on what way our line intersection is "pointed"
      var perp = diff.perpendicular;

      var intersectionPoint = start.plus( diff.times( t ) );
      var normal = ( perp.dot( ray.direction ) > 0 ? perp.negated() : perp ).normalized();
      var wind = ray.direction.perpendicular.dot( diff ) < 0 ? 1 : -1;
      result.push( new RayIntersection( s, intersectionPoint, normal, wind, t ) );
      return result;
    },

    /**
     * Returns the resultant winding number of a ray intersecting this line.
     * @public
     *
     * @param {Ray2} ray
     * @returns {number}
     */
    windingIntersection: function( ray ) {
      var hits = this.intersection( ray );
      if ( hits.length ) {
        return hits[ 0 ].wind;
      }
      else {
        return 0;
      }
    },

    /**
     * Draws this line to the 2D Canvas context, assuming the context's current location is already at the start point
     * @param {CanvasRenderingContext2D} context
     */
    writeToContext: function( context ) {
      context.lineTo( this._end.x, this._end.y );
    },

    /**
     * Returns a new Line that represents this line after transformation by the matrix
     * @param {Matrix3} matrix
     * @returns {Line}
     */
    transformed: function( matrix ) {
      return new kite.Line( matrix.timesVector2( this._start ), matrix.timesVector2( this._end ) );
    },

    /**
     * Returns an object that gives information about the closest point (on a line segment) to the point argument
     * @param {Vector2} point
     * @returns {Array.<Object>}
     */
    explicitClosestToPoint: function( point ) {
      var diff = this._end.minus( this._start );
      var t = point.minus( this._start ).dot( diff ) / diff.magnitudeSquared;
      t = Util.clamp( t, 0, 1 );
      var closestPoint = this.positionAt( t );
      return [
        {
          segment: this,
          t: t,
          closestPoint: closestPoint,
          distanceSquared: point.distanceSquared( closestPoint )
        }
      ];
    },

    /**
     * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
     * @public
     *
     * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
     *
     * @returns {number}
     */
    getSignedAreaFragment: function() {
      return 1 / 2 * ( this._start.x * this._end.y - this._start.y * this._end.x );
    },

    /**
     * Given the current curve parameterized by t, will return a curve parameterized by x where t = a * x + b
     * @public
     *
     * @param {number} a
     * @param {number} b
     * @returns {Line}
     */
    reparameterized: function( a, b ) {
      return new kite.Line( this.positionAt( b ), this.positionAt( a + b ) );
    },

    /**
     * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
     * @public
     *
     * @returns {Line}
     */
    reversed: function() {
      return new kite.Line( this._end, this._start );
    },

    /**
     * Convert a line in the $(theta,r)$ plane of the form $(\theta_1,r_1)$ to $(\theta_2,r_2)$ and
     * converts to the cartesian coordinate system
     * @public
     *
     * E.g. a polar line (0,1) to (2 Pi,1) would be mapped to a circle of radius 1
     *
     * @param {Object} [options]
     * @returns {Array.<Segment>}
     */
    polarToCartesian: function( options ) {
      // x represent an angle whereas y represent a radius
      if ( this._start.x === this._end.x ) {
        // angle is the same, we are still a line segment!
        return [ new kite.Line( Vector2.createPolar( this._start.y, this._start.x ), Vector2.createPolar( this._end.y, this._end.x ) ) ];
      }
      else if ( this._start.y === this._end.y ) {
        // we have a constant radius, so we are a circular arc
        return [ new kite.Arc( Vector2.ZERO, this._start.y, this._start.x, this._end.x, this._start.x > this._end.x ) ];
      }
      else {
        return this.toPiecewiseLinearSegments( options );
      }
    },

    /**
     * Returns the arc length of the segment.
     * @public
     * @override (ignores parameters)
     *
     * @returns {number}
     */
    getArcLength: function() {
      return this.start.distance( this.end );
    },

    /**
     * We can handle this simply by returning ourselves.
     * @override
     *
     * @returns {Array.<Segment>}
     */
    toPiecewiseLinearOrArcSegments: function() {
      return [ this ];
    },

    /**
     * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
     * @public
     *
     * @returns {Object}
     */
    serialize: function() {
      return {
        type: 'Line',
        startX: this._start.x,
        startY: this._start.y,
        endX: this._end.x,
        endY: this._end.y
      };
    }
  } );

  /**
   * Returns a Line from the serialized representation.
   * @public
   *
   * @param {Object} obj
   * @returns {Line}
   */
  Line.deserialize = function( obj ) {
    assert && assert( obj.type === 'Line' );

    return new Line( new Vector2( obj.startX, obj.startY ), new Vector2( obj.endX, obj.endY ) );
  };

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   * @public
   *
   * @param {Line} line1
   * @param {Line} line2
   * @param {number} [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns {Array.<Overlap>} - The solution, if there is one (and only one)
   */
  Line.getOverlaps = function( line1, line2, epsilon = 1e-6 ) {
    assert && assert( line1 instanceof Line, 'first Line is not an instance of Line' );
    assert && assert( line2 instanceof Line, 'second Line is not an instance of Line' );

    /*
     * NOTE: For implementation details in this function, please see Cubic.getOverlaps. It goes over all of the
     * same implementation details, but instead our bezier matrix is a 2x2:
     *
     * [  1  0 ]
     * [ -1  1 ]
     *
     * And we use the upper-left section of (at+b) adjustment matrix relevant for the line.
     */

    var noOverlap = [];

    // Efficiently compute the multiplication of the bezier matrix:
    var p0x = line1._start.x;
    var p1x = -1 * line1._start.x + line1._end.x;
    var p0y = line1._start.y;
    var p1y = -1 * line1._start.y + line1._end.y;
    var q0x = line2._start.x;
    var q1x = -1 * line2._start.x + line2._end.x;
    var q0y = line2._start.y;
    var q1y = -1 * line2._start.y + line2._end.y;

    // Determine the candidate overlap (preferring the dimension with the largest variation)
    var xSpread = Math.abs( Math.max( line1._start.x, line1._end.x, line2._start.x, line2._end.x ) -
                            Math.min( line1._start.x, line1._end.x, line2._start.x, line2._end.x ) );
    var ySpread = Math.abs( Math.max( line1._start.y, line1._end.y, line2._start.y, line2._end.y ) -
                            Math.min( line1._start.y, line1._end.y, line2._start.y, line2._end.y ) );
    var xOverlap = Segment.polynomialGetOverlapLinear( p0x, p1x, q0x, q1x );
    var yOverlap = Segment.polynomialGetOverlapLinear( p0y, p1y, q0y, q1y );
    var overlap;
    if ( xSpread > ySpread ) {
      overlap = ( xOverlap === null || xOverlap === true ) ? yOverlap : xOverlap;
    }
    else {
      overlap = ( yOverlap === null || yOverlap === true ) ? xOverlap : yOverlap;
    }
    if ( overlap === null || overlap === true ) {
      return noOverlap; // No way to pin down an overlap
    }

    var a = overlap.a;
    var b = overlap.b;

    // Compute linear coefficients for the difference between p(t) and q(a*t+b)
    var d0x = q0x + b * q1x - p0x;
    var d1x = a * q1x - p1x;
    var d0y = q0y + b * q1y - p0y;
    var d1y = a * q1y - p1y;

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

    var qt0 = b;
    var qt1 = a + b;

    // TODO: do we want an epsilon in here to be permissive?
    if ( ( qt0 > 1 && qt1 > 1 ) || ( qt0 < 0 && qt1 < 0 ) ) {
      return noOverlap;
    }

    return [ new Overlap( a, b ) ];
  };

  /**
   * Returns any intersection between the two line segments.
   *
   * @param {Segment} a
   * @param {Segment} b
   * @returns {Array.<SegmentIntersection>}
   */
  Line.intersect = function( a, b ) {
    assert && assert( a instanceof Line );
    assert && assert( b instanceof Line );

    var lineSegmentIntersection = Util.lineSegmentIntersection(
      a.start.x, a.start.y, a.end.x, a.end.y,
      b.start.x, b.start.y, b.end.x, b.end.y
    );

    if ( lineSegmentIntersection !== null ) {
      var aT = a.explicitClosestToPoint( lineSegmentIntersection )[ 0 ].t;
      var bT = b.explicitClosestToPoint( lineSegmentIntersection )[ 0 ].t;
      return [ new SegmentIntersection( lineSegmentIntersection, aT, bT ) ];
    }
    else {
      return [];
    }
  };

  /**
   * Returns any intersections between a line segment and another type of segment.
   * @public
   *
   * This should be more optimized than the general intersection routine of arbitrary segments.
   *
   * @param {Segment} a
   * @param {Segment} b
   * @returns {Array.<SegmentIntersection>}
   */
  Line.intersectOther = function( line, other ) {
    assert && assert( line instanceof Line );
    assert && assert( other instanceof Segment );

    // Set up a ray
    var delta = line.end.minus( line.start );
    var length = delta.magnitude;
    var ray = new Ray2( line.start, delta.normalize() );

    // Find the other segment's intersections with the ray
    var rayIntersections = other.intersection( ray );

    var results = [];
    for ( var i = 0; i < rayIntersections.length; i++ ) {
      var rayIntersection = rayIntersections[ i ];
      var lineT = rayIntersection.distance / length;

      // Exclude intersections that are outside of our line segment (or right on the boundary)
      if ( lineT > 1e-8 && lineT < 1 - 1e-8 ) {
        results.push( new SegmentIntersection( rayIntersection.point, lineT, rayIntersection.t ) );
      }
    }
    return results;
  };

  return Line;
} );
