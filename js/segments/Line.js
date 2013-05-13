// Copyright 2002-2012, University of Colorado

/**
 * Linear segment
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  'use strict';
  
  var assert = require( 'ASSERT/assert' )( 'kite' );

  var kite = require( 'KITE/kite' );
  
  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var lineLineIntersection = require( 'DOT/Util' ).lineLineIntersection;
  
  var Segment = require( 'KITE/segments/Segment' );

  Segment.Line = function Line( start, end ) {
    this.start = start;
    this.end = end;
    
    if ( start.equals( end, 0 ) ) {
      this.invalid = true;
      return;
    }
    
    this.startTangent = end.minus( start ).normalized();
    this.endTangent = this.startTangent;
    
    // acceleration for intersection
    this.bounds = Bounds2.NOTHING.withPoint( start ).withPoint( end );
  };
  inherit( Segment.Line, Segment, {
    
    positionAt: function( t ) {
      return this.start.plus( this.end.minus( this.start ).times( t ) );
    },
    
    tangentAt: function( t ) {
      // tangent always the same, just use the start tanget
      return this.startTangent;
    },
    
    curvatureAt: function( t ) {
      return 0; // no curvature on a straight line segment
    },
    
    getSVGPathFragment: function() {
      return 'L ' + this.end.x + ' ' + this.end.y;
    },
    
    strokeLeft: function( lineWidth ) {
      var offset = this.endTangent.perpendicular().negated().times( lineWidth / 2 );
      return [new Segment.Line( this.start.plus( offset ), this.end.plus( offset ) )];
    },
    
    strokeRight: function( lineWidth ) {
      var offset = this.startTangent.perpendicular().times( lineWidth / 2 );
      return [new Segment.Line( this.end.plus( offset ), this.start.plus( offset ) )];
    },
    
    // lines are already monotone
    getInteriorExtremaTs: function() { return []; },
    
    subdivided: function( t ) {
      var pt = this.positionAt( t );
      return [
        new Segment.Line( this.start, pt ),
        new Segment.Line( pt, this.end )
      ];
    },
    
    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.Line.intersectsBounds unimplemented' ); // TODO: implement
    },
    
    intersection: function( ray ) {
      var result = [];
      
      var start = this.start;
      var end = this.end;
      
      var intersection = lineLineIntersection( start, end, ray.pos, ray.pos.plus( ray.dir ) );
      
      if ( !isFinite( intersection.x ) || !isFinite( intersection.y ) ) {
        // lines must be parallel
        return result;
      }
      
      // check to make sure our point is in our line segment (specifically, in the bounds (start,end], not including the start point so we don't double-count intersections)
      if ( start.x !== end.x && ( start.x > end.x ? ( intersection.x >= start.x || intersection.x < end.x ) : ( intersection.x <= start.x || intersection.x > end.x ) ) ) {
        return result;
      }
      if ( start.y !== end.y && ( start.y > end.y ? ( intersection.y >= start.y || intersection.y < end.y ) : ( intersection.y <= start.y || intersection.y > end.y ) ) ) {
        return result;
      }
      
      // make sure the intersection is not behind the ray
      var t = intersection.minus( ray.pos ).dot( ray.dir );
      if ( t < 0 ) {
        return result;
      }
      
      // return the proper winding direction depending on what way our line intersection is "pointed"
      var diff = end.minus( start );
      var perp = diff.perpendicular();
      result.push( {
        distance: t,
        point: ray.pointAtDistance( t ),
        normal: perp.dot( ray.dir ) > 0 ? perp.negated() : perp,
        wind: ray.dir.perpendicular().dot( diff ) < 0 ? 1 : -1
      } );
      return result;
    },
    
    // returns the resultant winding number of this ray intersecting this segment.
    windingIntersection: function( ray ) {
      var hits = this.intersection( ray );
      if ( hits.length ) {
        return hits[0].wind;
      } else {
        return 0;
      }
    },
    
    // assumes the current position is at start
    writeToContext: function( context ) {
      context.lineTo( this.end.x, this.end.y );
    },
    
    transformed: function( matrix ) {
      return new Segment.Line( matrix.timesVector2( this.start ), matrix.timesVector2( this.end ) );
    }
  } );
  
  return Segment.Line;
} );
