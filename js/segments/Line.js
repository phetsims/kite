// Copyright 2002-2013, University of Colorado Boulder

/**
 * Linear segment
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  'use strict';
  
  var kite = require( 'KITE/kite' );
  
  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Util = require( 'DOT/Util' );
  var lineLineIntersection = require( 'DOT/Util' ).lineLineIntersection;
  
  var Segment = require( 'KITE/segments/Segment' );

  Segment.Line = function Line( start, end ) {
    this._start = start;
    this._end = end;
    
    // TODO: performance test removal of these undefined declarations
    this._tangent = undefined;
    this._bounds = undefined;
  };
  inherit( Segment, Segment.Line, {
    
    getStart: function() {
      return this._start;
    },
    get start() { return this._start; },
    
    getEnd: function() {
      return this._end;
    },
    get end() { return this._end; },
    
    getStartTangent: function() {
      if ( this._tangent === undefined ) {
        // TODO: allocation reduction
        this._tangent = this._end.minus( this._start ).normalized();
      }
      return this._tangent;
    },
    get startTangent() { return this.getStartTangent(); },
    
    getEndTangent: function() {
      return this.getStartTangent();
    },
    get endTangent() { return this.getEndTangent(); },
    
    getBounds: function() {
      // TODO: allocation reduction
      if ( this._bounds === undefined ) {
        this._bounds = Bounds2.NOTHING.withPoint( this._start ).withPoint( this._end );
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },
    
    getNondegenerateSegments: function() {
      // if it is degenerate (0-length), just ignore it
      if ( this._start.equals( this._end ) ) {
        return [];
      } else {
        return [this];
      }
    },
    
    positionAt: function( t ) {
      return this._start.plus( this._end.minus( this._start ).times( t ) );
    },
    
    tangentAt: function( t ) {
      // tangent always the same, just use the start tanget
      return this.getStartTangent();
    },
    
    curvatureAt: function( t ) {
      return 0; // no curvature on a straight line segment
    },
    
    getSVGPathFragment: function() {
      return 'L ' + this._end.x + ' ' + this._end.y;
    },
    
    strokeLeft: function( lineWidth ) {
      var offset = this.getEndTangent().perpendicular().negated().times( lineWidth / 2 );
      return [new Segment.Line( this._start.plus( offset ), this._end.plus( offset ) )];
    },
    
    strokeRight: function( lineWidth ) {
      var offset = this.getStartTangent().perpendicular().times( lineWidth / 2 );
      return [new Segment.Line( this._end.plus( offset ), this._start.plus( offset ) )];
    },
    
    // lines are already monotone
    getInteriorExtremaTs: function() { return []; },
    
    subdivided: function( t ) {
      var pt = this.positionAt( t );
      return [
        new Segment.Line( this._start, pt ),
        new Segment.Line( pt, this._end )
      ];
    },
    
    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.Line.intersectsBounds unimplemented' ); // TODO: implement
    },
    
    intersection: function( ray ) {
      var result = [];
      
      var start = this._start;
      var end = this._end;
      
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
      context.lineTo( this._end.x, this._end.y );
    },
    
    transformed: function( matrix ) {
      return new Segment.Line( matrix.timesVector2( this._start ), matrix.timesVector2( this._end ) );
    },
    
    explicitClosestToPoint: function( point ) {
      var diff = this._end.minus( this._start );
      var t = point.minus( this._start ).dot( diff ) / diff.magnitudeSquared();
      t = Util.clamp( t, 0, 1 );
      var closestPoint = this.positionAt( t );
      return [{
        segment: this,
        t: t,
        closestPoint: closestPoint,
        distanceSquared: point.distanceSquared( closestPoint )
      }];
    }
  } );
  
  return Segment.Line;
} );
