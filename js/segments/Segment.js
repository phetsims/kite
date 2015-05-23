// Copyright 2002-2014, University of Colorado Boulder

/**
 * A segment represents a specific curve with a start and end.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var kite = require( 'KITE/kite' );

  var inherit = require( 'PHET_CORE/inherit' );
  var DotUtil = require( 'DOT/Util' );
  var Bounds2 = require( 'DOT/Bounds2' );

  /*
   * Will contain (for segments):
   * properties (backed by ES5 getters, created usually lazily):
   * start        - start point of this segment
   * end          - end point of this segment
   * startTangent - the tangent vector (normalized) to the segment at the start, pointing in the direction of motion (from start to end)
   * endTangent   - the tangent vector (normalized) to the segment at the end, pointing in the direction of motion (from start to end)
   * bounds       - the bounding box for the segment
   *
   * methods:
   * positionAt( t )          - returns the position parametrically, with 0 <= t <= 1. this does NOT guarantee a constant magnitude tangent... don't feel like adding elliptical functions yet!
   * tangentAt( t )           - returns the non-normalized tangent (dx/dt, dy/dt) parametrically, with 0 <= t <= 1.
   * curvatureAt( t )         - returns the signed curvature (positive for visual clockwise - mathematical counterclockwise)
   * subdivided( t )          - returns an array with 2 sub-segments, split at the parametric t value.
   * getSVGPathFragment()     - returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls this needs to put the M calls first
   * strokeLeft( lineWidth )  - returns an array of segments that will draw an offset curve on the logical left side
   * strokeRight( lineWidth ) - returns an array of segments that will draw an offset curve on the logical right side
   * windingIntersection      - returns the winding number for intersection with a ray
   * getInteriorExtremaTs     - returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   *
   * writeToContext( context ) - draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   * transformed( matrix )     - returns a new segment that represents this segment after transformation by the matrix
   */
  kite.Segment = function Segment() {}; // no common construction for now
  var Segment = kite.Segment;

  var identityFunction = function identityFunction( x ) { return x; };

  inherit( Object, Segment, {
    // TODO: override everywhere so this isn't necessary (it's not particularly efficient!)
    getBoundsWithTransform: function( matrix ) {
      var transformedSegment = this.transformed( matrix );
      return transformedSegment.getBounds();
    },

    // tList should be a list of sorted t values from 0 <= t <= 1
    subdivisions: function( tList ) {
      // this could be solved by recursion, but we don't plan on the JS engine doing tail-call optimization
      var right = this;
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

    /*
     * toPiecewiseLinearSegments( options ), with the following options provided:
     * - minLevels:                       how many levels to force subdivisions
     * - maxLevels:                       prevent subdivision past this level
     * - distanceEpsilon (optional null): controls level of subdivision by attempting to ensure a maximum (squared) deviation from the curve
     * - curveEpsilon (optional null):    controls level of subdivision by attempting to ensure a maximum curvature change between segments
     * - pointMap (optional):             function( Vector2 ) : Vector2, represents a (usually non-linear) transformation applied
     * - methodName (optional):           if the method name is found on the segment, it is called with the expected signature function( options ) : Array[Segment]
     *                                    instead of using our brute-force logic
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
        segments.push( new Segment.Line( start, end ) );
      }
      else {
        var subdividedSegments = this.subdivided( 0.5 );
        subdividedSegments[ 0 ].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, start, middle );
        subdividedSegments[ 1 ].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, middle, end );
      }
      return segments;
    }
  } );

  // list of { segment: ..., t: ..., closestPoint: ..., distanceSquared: ... } (since there can be duplicates), threshold is used for subdivision,
  // where it will exit if all of the segments are shorter than the threshold
  // TODO: solve segments to determine this analytically!
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

  return Segment;
} );
