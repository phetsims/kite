// Copyright 2013-2017, University of Colorado Boulder

/**
 * A segment represents a specific curve with a start and end.
 *
 * Each segment is treated parametrically, where t=0 is the start of the segment, and t=1 is the end. Values of t
 * between those represent points along the segment.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var kite = require( 'KITE/kite' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Events = require( 'AXON/Events' );
  var DotUtil = require( 'DOT/Util' ); // eslint-disable-line require-statement-match
  var Bounds2 = require( 'DOT/Bounds2' );

  /**
   * @constructor
   *
   * Each segment should implement the following API.
   *
   * properties (backed by ES5 getters, created usually lazily):
   *
   *   start {Vector2}
   *     The start point of the segment, parametrically at t=0.
   *
   *   end {Vector2}
   *     The end point of the segment, parametrically at t=1.
   *
   *   startTangent {Vector2}
   *     The normalized tangent vector to the segment at its start point, pointing in the direction of motion
   *     (form start to end).
   *
   *   endTangent {Vector2}
   *     The normalized tangent vector to the segment at its end point, pointing in the direction of motion
   *     (form start to end).
   *
   *   bounds {Bounds2}
   *     The bounding box for the segment.
   *
   * methods:
   *
   *   positionAt( t: {number} ) : {Vector2}
   *     Returns the position parametrically, with 0 <= t <= 1. NOTE that this function doesn't keep a constant
   *     magnitude tangent.
   *
   *   tangentAt( t: {number} ) : {Vector2}
   *     Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with
   *     0 <= t <= 1.
   *
   *   curvatureAt( t: {number} ) : {number}
   *     Returns the signed curvature (positive for visual clockwise - mathematical counterclockwise)
   *
   *   subdivided( t: {number} ) : {Array.<Segment>}
   *     Returns an array with up to 2 sub-segments, split at the parametric t value. The segments together should make
   *     the same shape as the original segment.
   *
   *   getSVGPathFragment()     - returns a string containing the SVG path. assumes that the start point is already
   *                              provided, so anything that calls this needs to put the M calls first
   *   strokeLeft( lineWidth )  - returns an array of segments that will draw an offset curve on the logical left side
   *   strokeRight( lineWidth ) - returns an array of segments that will draw an offset curve on the logical right side
   *   windingIntersection      - returns the winding number for intersection with a ray
   *   getInteriorExtremaTs     - returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on
   *                              these will result in monotonic segments
   *   intersection( ray )      - returns a list of intersections between the segment and the ray. Intersections will be
   *                              of the given format:
   *                              {
   *                                distance: {number} - Distance from the ray's origin to the intersection
   *                                point: {Vector2} - The location of the intersection
   *                                normal: {Vector2} - The normal (unit vector perpendicular to the segment at the
   *                                                    location) at the intersection, such that the dot product between
   *                                                    the normal and ray direction is <= 0
   *                                wind: {number} - The winding number for the intersection. Either 1 or -1, depending
   *                                                 on the direction the segment goes relative to the ray (to the left
   *                                                 or right). Used for computing Shape intersection via the non-zero
   *                                                 fill rule.
   *                              }
   *   getBounds() : {Bounds2} - Returns a {Bounds2} representing the bounding box for the segment.
   *   getNondegenerateSegments() : {Array.<Segment>} - Returns a list of non-degenerate segments that are equivalent to
   *                                                    this segment. Generally gets rid (or simplifies) invalid or
   *                                                    repeated segments.
   *   writeToContext( context ) - draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   *   transformed( matrix )     - returns a new segment that represents this segment after transformation by the matrix
   */
  function Segment() {
    Events.call( this );
  }

  kite.register( 'Segment', Segment );

  /**
   * Returns itself
   * @param {Vector2} x
   * @returns {Vector2}
   */
  var identityFunction = function identityFunction( x ) { return x; };

  inherit( Events, Segment, {
    /**
     * Will return true if the start/end tangents are purely vertical or horizontal. If all of the segments of a shape
     * have this property, then the only line joins will be a multiple of pi/2 (90 degrees), and so all of the types of
     * line joins will have the same bounds. This means that the stroked bounds will just be a pure dilation of the
     * regular bounds, by lineWidth / 2.
     * @public
     *
     * @returns {boolean}
     */
    areStrokedBoundsDilated: function() {
      var epsilon = 0.0000001;

      // If the derivative at the start/end are pointing in a cardinal direction (north/south/east/west), then the
      // endpoints won't trigger non-dilated bounds, and the interior of the curve will not contribute.
      return Math.abs( this.startTangent.x * this.startTangent.y ) < epsilon && Math.abs( this.endTangent.x * this.endTangent.y ) < epsilon;
    },

    /**
     *  // TODO: override everywhere so this isn't necessary (it's not particularly efficient!)
     * @param {Matrix3} matrix
     * @returns {Bounds2}
     */
    getBoundsWithTransform: function( matrix ) {
      var transformedSegment = this.transformed( matrix );
      return transformedSegment.getBounds();
    },

    /**
     *
     * @param {Array.<number>} tList - list of sorted t values from 0 <= t <= 1
     * @returns {Array}
     */
    subdivisions: function( tList ) {
      // this could be solved by recursion, but we don't plan on the JS engine doing tail-call optimization
      var right = this; // eslint-disable-line consistent-this
      var result = [];
      for ( var i = 0; i < tList.length; i++ ) {
        // assume binary subdivision
        var t = tList[ i ];
        var arr = right.subdivided( t );
        assert && assert( arr.length === 2 );
        result.push( arr[ 0 ] );
        right = arr[ 1 ];

        // scale up the remaining t values
        for ( var j = i + 1; j < tList.length; j++ ) {
          tList[ j ] = DotUtil.linear( t, 1, 0, 1, tList[ j ] );
        }
      }
      result.push( right );
      return result;
    },

    // return an array of segments from breaking this segment into monotone pieces
    subdividedIntoMonotone: function() {
      return this.subdivisions( this.getInteriorExtremaTs() );
    },

    /**
     *
     * @param {Object} [options] -           with the following options provided:
     *  - minLevels:                       how many levels to force subdivisions
     *  - maxLevels:                       prevent subdivision past this level
     *  - distanceEpsilon (optional null): controls level of subdivision by attempting to ensure a maximum (squared) deviation from the curve
     *  - curveEpsilon (optional null):    controls level of subdivision by attempting to ensure a maximum curvature change between segments
     *  - pointMap (optional):             function( Vector2 ) : Vector2, represents a (usually non-linear) transformation applied
     *  - methodName (optional):           if the method name is found on the segment, it is called with the expected signature function( options ) : Array[Segment]
     *                                     instead of using our brute-force logic
     * @param {number} [minLevels] -   how many levels to force subdivisions
     * @param {number} [maxLevels] -   prevent subdivision past this level
     * @param {Array.<Segment>} [segments]
     * @param {Vector2} [start]
     * @param {Vector2} [end]
     * @returns {Array.<Line>}
     */
    toPiecewiseLinearSegments: function( options, minLevels, maxLevels, segments, start, end ) {
      // for the first call, initialize min/max levels from our options
      minLevels = minLevels === undefined ? options.minLevels : minLevels;
      maxLevels = maxLevels === undefined ? options.maxLevels : maxLevels;
      segments = segments || [];
      var pointMap = options.pointMap || identityFunction;

      // points mapped by the (possibly-nonlinear) pointMap.
      start = start || pointMap( this.start );
      end = end || pointMap( this.end );
      var middle = pointMap( this.positionAt( 0.5 ) );

      assert && assert( minLevels <= maxLevels );
      assert && assert( options.distanceEpsilon === null || typeof options.distanceEpsilon === 'number' );
      assert && assert( options.curveEpsilon === null || typeof options.curveEpsilon === 'number' );
      assert && assert( !pointMap || typeof pointMap === 'function' );

      // i.e. we will have finished = maxLevels === 0 || ( minLevels <= 0 && epsilonConstraints ), just didn't want to one-line it
      var finished = maxLevels === 0; // bail out once we reach our maximum number of subdivision levels
      if ( !finished && minLevels <= 0 ) { // force subdivision if minLevels hasn't been reached
        // flatness criterion: A=start, B=end, C=midpoint, d0=distance from AB, d1=||B-A||, subdivide if d0/d1 > sqrt(epsilon)
        finished = ( options.curveEpsilon === null || ( DotUtil.distToSegmentSquared( middle, start, end ) / start.distanceSquared( end ) < options.curveEpsilon ) ) &&
                   // deviation criterion
                   ( options.distanceEpsilon === null || ( DotUtil.distToSegmentSquared( middle, start, end ) < options.distanceEpsilon ) );
      }

      if ( finished ) {
        segments.push( new kite.Line( start, end ) );
      }
      else {
        var subdividedSegments = this.subdivided( 0.5 );
        subdividedSegments[ 0 ].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, start, middle );
        subdividedSegments[ 1 ].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, middle, end );
      }
      return segments;
    }
  } );

  /**
   * Adds getter/setter function pairs and ES5 pairs, e.g. addInvalidatingGetterSetter( Arc, 'radius' ) would add:
   * - segment.getRadius()
   * - segment.setRadius( value )
   * - segment.radius // getter and setter
   *
   * It assumes the following is the internal name: '_' + name
   *
   * @param {Function} type - Should be the constructor of the type. We will modify its prototype
   * @param {string} name - Name of the attribute
   */
  Segment.addInvalidatingGetterSetter = function( type, name ) {
    var internalName = '_' + name;
    var capitalizedName = name.charAt( 0 ).toUpperCase() + name.slice( 1 );
    var getterName = 'get' + capitalizedName;
    var setterName = 'set' + capitalizedName;

    // e.g. getRadius()
    type.prototype[ getterName ] = function() {
      return this[ internalName ];
    };

    // e.g. setRadius( value )
    type.prototype[ setterName ] = function( value ) {
      if ( this[ internalName ] !== value ) {
        this[ internalName ] = value;
        this.invalidate();
      }
      return this; // allow chaining
    };

    Object.defineProperty( type.prototype, name, {
      set: type.prototype[ setterName ],
      get: type.prototype[ getterName ]
    } );
  };

  /**
   * list of { segment: ..., t: ..., closestPoint: ..., distanceSquared: ... } (since there can be duplicates), threshold is used for subdivision,
   * where it will exit if all of the segments are shorter than the threshold
   *  TODO: solve segments to determine this analytically!
   * @param {Array.<Segment>} segments
   * @param {Vector2} point
   * @param {number} threshold
   * @returns {Array.<Object>}
   */
  Segment.closestToPoint = function( segments, point, threshold ) {
    var thresholdSquared = threshold * threshold;
    var items = [];
    var bestList = [];
    var bestDistanceSquared = Number.POSITIVE_INFINITY;
    var thresholdOk = false;

    _.each( segments, function( segment ) {
      // if we have an explicit computation for this segment, use it
      if ( segment.explicitClosestToPoint ) {
        var infos = segment.explicitClosestToPoint( point );
        _.each( infos, function( info ) {
          if ( info.distanceSquared < bestDistanceSquared ) {
            bestList = [ info ];
            bestDistanceSquared = info.distanceSquared;
          }
          else if ( info.distanceSquared === bestDistanceSquared ) {
            bestList.push( info );
          }
        } );
      }
      else {
        // otherwise, we will split based on monotonicity, so we can subdivide
        // separate, so we can map the subdivided segments
        var ts = [ 0 ].concat( segment.getInteriorExtremaTs() ).concat( [ 1 ] );
        for ( var i = 0; i < ts.length - 1; i++ ) {
          var ta = ts[ i ];
          var tb = ts[ i + 1 ];
          var pa = segment.positionAt( ta );
          var pb = segment.positionAt( tb );
          var bounds = Bounds2.point( pa ).addPoint( pb );
          var minDistanceSquared = bounds.minimumDistanceToPointSquared( point );
          if ( minDistanceSquared <= bestDistanceSquared ) {
            var maxDistanceSquared = bounds.maximumDistanceToPointSquared( point );
            if ( maxDistanceSquared < bestDistanceSquared ) {
              bestDistanceSquared = maxDistanceSquared;
              bestList = []; // clear it
            }
            items.push( {
              ta: ta,
              tb: tb,
              pa: pa,
              pb: pb,
              segment: segment,
              bounds: bounds,
              min: minDistanceSquared,
              max: maxDistanceSquared
            } );
          }
        }
      }
    } );

    while ( items.length && !thresholdOk ) {
      var curItems = items;
      items = [];

      // whether all of the segments processed are shorter than the threshold
      thresholdOk = true;

      _.each( curItems, function( item ) {
        if ( item.minDistanceSquared > bestDistanceSquared ) {
          return; // drop this item
        }
        if ( thresholdOk && item.pa.distanceSquared( item.pb ) > thresholdSquared ) {
          thresholdOk = false;
        }
        var tmid = ( item.ta + item.tb ) / 2;
        var pmid = item.segment.positionAt( tmid );
        var boundsA = Bounds2.point( item.pa ).addPoint( pmid );
        var boundsB = Bounds2.point( item.pb ).addPoint( pmid );
        var minA = boundsA.minimumDistanceToPointSquared( point );
        var minB = boundsB.minimumDistanceToPointSquared( point );
        if ( minA <= bestDistanceSquared ) {
          var maxA = boundsA.maximumDistanceToPointSquared( point );
          if ( maxA < bestDistanceSquared ) {
            bestDistanceSquared = maxA;
            bestList = []; // clear it
          }
          items.push( {
            ta: item.ta,
            tb: tmid,
            pa: item.pa,
            pb: pmid,
            segment: item.segment,
            bounds: boundsA,
            min: minA,
            max: maxA
          } );
        }
        if ( minB <= bestDistanceSquared ) {
          var maxB = boundsB.maximumDistanceToPointSquared( point );
          if ( maxB < bestDistanceSquared ) {
            bestDistanceSquared = maxB;
            bestList = []; // clear it
          }
          items.push( {
            ta: tmid,
            tb: item.tb,
            pa: pmid,
            pb: item.pb,
            segment: item.segment,
            bounds: boundsB,
            min: minB,
            max: maxB
          } );
        }
      } );
    }

    // if there are any closest regions, they are within the threshold, so we will add them all
    _.each( items, function( item ) {
      var t = ( item.ta + item.tb ) / 2;
      var closestPoint = item.segment.positionAt( t );
      bestList.push( {
        segment: item.segment,
        t: t,
        closestPoint: closestPoint,
        distanceSquared: point.distanceSquared( closestPoint )
      } );
    } );

    return bestList;
  };

  /**
   * Given the cubic-premultiplied values for two cubic bezier curves, determines (if available) a specified (a,b) pair
   * such that p( t ) === q( a * t + b ).
   * @public
   *
   * Given a 1-dimensional cubic bezier determined by the control points p0, p1, p2 and p3, compute:
   *
   * [ p0s ]    [  1   0   0   0 ]   [ p0 ]
   * [ p1s ] == [ -3   3   0   0 ] * [ p1 ]
   * [ p2s ] == [  3  -6   3   0 ] * [ p2 ]
   * [ p3s ]    [ -1   3  -3   1 ]   [ p3 ]
   *
   * see Cubic.getOverlaps for more information.
   *
   * @param {number} p0s
   * @param {number} p1s
   * @param {number} p2s
   * @param {number} p3s
   * @param {number} q0s
   * @param {number} q1s
   * @param {number} q2s
   * @param {number} q3s
   * @returns {null|true|{a:number,b:number}} - null if no solution, true if every a,b pair is a solution, otherwise
   *                                            the single solution
   */
  Segment.polynomialGetOverlapCubic = function( p0s, p1s, p2s, p3s, q0s, q1s, q2s, q3s ) {
    if ( q3s === 0 ) {
      return Segment.polynomialGetOverlapQuadratic( p0s, p1s, p2s, q0s, q1s, q2s );
    }

    var a = Math.pow( p3s / q3s, 1 / 3 );
    if ( a === 0 ) {
      return null; // If there would be solutions, then q3s would have been non-zero
    }
    var b = ( p2s - a * a * q2s ) / ( 3 * a * a * q3s );
    return {
      a: a,
      b: b
    };
  };

  /**
   * Given the quadratic-premultiplied values for two quadratic bezier curves, determines (if available) a specified (a,b) pair
   * such that p( t ) === q( a * t + b ).
   * @public
   *
   * Given a 1-dimensional quadratic bezier determined by the control points p0, p1, p2, compute:
   *
   * [ p0s ]    [  1   0   0 ]   [ p0 ]
   * [ p1s ] == [ -2   2   0 ] * [ p1 ]
   * [ p2s ]    [  2  -2   3 ] * [ p2 ]
   *
   * see Quadratic.getOverlaps for more information.
   *
   * @param {number} p0s
   * @param {number} p1s
   * @param {number} p2s
   * @param {number} q0s
   * @param {number} q1s
   * @param {number} q2s
   * @returns {null|true|{a:number,b:number}} - null if no solution, true if every a,b pair is a solution, otherwise
   *                                            the single solution
   */
  Segment.polynomialGetOverlapQuadratic = function( p0s, p1s, p2s, q0s, q1s, q2s ) {
    if ( q2s === 0 ) {
      return Segment.polynomialGetOverlapLinear( p0s, p1s, q0s, q1s );
    }

    var discr = p2s / q2s;
    if ( discr < 0 ) {
      return null; // not possible to have a solution with an imaginary a
    }

    var a = Math.sqrt( p2s / q2s );
    if ( a === 0 ) {
      return null; // If there would be solutions, then q2s would have been non-zero
    }

    var b = ( p1s - a * q1s ) / ( 2 * a * q2s );
    return {
      a: a,
      b: b
    };
  };

  /**
   * Given the linear-premultiplied values for two lines, determines (if available) a specified (a,b) pair
   * such that p( t ) === q( a * t + b ).
   * @public
   *
   * Given a line determined by the control points p0, p1, compute:
   *
   * [ p0s ] == [  1   0 ] * [ p0 ]
   * [ p1s ] == [ -1   1 ] * [ p1 ]
   *
   * see Quadratic/Cubic.getOverlaps for more information.
   *
   * @param {number} p0s
   * @param {number} p1s
   * @param {number} q0s
   * @param {number} q1s
   * @returns {null|true|{a:number,b:number}} - null if no solution, true if every a,b pair is a solution, otherwise
   *                                            the single solution
   */
  Segment.polynomialGetOverlapLinear = function( p0s, p1s, q0s, q1s ) {
    if ( q1s === 0 ) {
      if ( p0s === q0s ) {
        return true;
      }
      else {
        return null;
      }
    }

    var a = p1s / q1s;
    if ( a === 0 ) {
      return null;
    }

    var b = ( p0s - q0s ) / q1s;
    return {
      a: a,
      b: b
    };
  };

  Segment.clipOverlap = function( overlap ) {

  };

  return Segment;
} );
