// Copyright 2002-2012, University of Colorado

/**
 * A segment represents a specific curve with a start and end.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'kite' );

  var kite = require( 'KITE/kite' );
  
  var DotUtil = require( 'DOT/Util' );
  
  /*
   * Will contain (for segments):
   * properties:
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
   * subdivided( t, skip )    - returns an array with 2 sub-segments, split at the parametric t value. if skip is passed, expensive operations are not performed
   * getSVGPathFragment()     - returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls this needs to put the M calls first
   * strokeLeft( lineWidth )  - returns an array of segments that will draw an offset curve on the logical left side
   * strokeRight( lineWidth ) - returns an array of segments that will draw an offset curve on the logical right side
   * intersectsBounds         - whether this segment intersects the specified bounding box (not just the segment's bounding box, but the actual segment)
   * windingIntersection      - returns the winding number for intersection with a ray
   *
   * writeToContext( context ) - draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   * transformed( matrix )     - returns a new segment that represents this segment after transformation by the matrix
   */
  kite.Segment = function Segment(){}; // no common construction for now
  var Segment = kite.Segment;
  
  Segment.prototype = {
    constructor: Segment,
    
    // tList should be a list of sorted t values from 0 <= t <= 1
    // TODO: move this to Segment?
    subdivisions: function( tList, skipComputation ) {
      // this could be solved by recursion, but we don't plan on the JS engine doing tail-call optimization
      var right = this;
      var result = [];
      for ( var i = 0; i < tList.length; i++ ) {
        // assume binary subdivision
        var t = tList[i];
        var arr = right.subdivided( t, skipComputation );
        assert && assert( arr.length === 2 );
        result.push( arr[0] );
        right = arr[1];
        
        // scale up the remaining t values
        for ( var j = i + 1; j < tList.length; j++ ) {
          tList[j] = DotUtil.linear( t, 0, 1, 1, tList[j] );
        }
      }
      result.push( right );
      return result;
    }
  };
  
  return Segment;
} );
