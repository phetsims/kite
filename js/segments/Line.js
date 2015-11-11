// Copyright 2013-2015, University of Colorado Boulder

/**
 * Linear segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Vector2 = require( 'DOT/Vector2' );
  var Util = require( 'DOT/Util' );

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  var scratchVector2 = new Vector2();

  function Line( start, end ) {
    Segment.call( this );

    this._start = start;
    this._end = end;

    this.invalidate();
  }

  kite.register( 'Line', Line );

  inherit( Segment, Line, {

    // @public - Clears cached information, should be called when any of the 'constructor arguments' are mutated.
    invalidate: function() {
      // Lazily-computed derived information
      this._tangent = null; // {Vector2 | null}
      this._bounds = null; // {Bounds2 | null}

      this.trigger0( 'invalidated' );
    },

    getStartTangent: function() {
      if ( this._tangent === null ) {
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
      if ( this._bounds === null ) {
        this._bounds = Bounds2.NOTHING.copy().addPoint( this._start ).addPoint( this._end );
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    getBoundsWithTransform: function( matrix ) {
      // uses mutable calls
      var bounds = Bounds2.NOTHING.copy();
      bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._start ) ) );
      bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._end ) ) );
      return bounds;
    },

    getNondegenerateSegments: function() {
      // if it is degenerate (0-length), just ignore it
      if ( this._start.equals( this._end ) ) {
        return [];
      }
      else {
        return [ this ];
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
      return 'L ' + kite.svgNumber( this._end.x ) + ' ' + kite.svgNumber( this._end.y );
    },

    strokeLeft: function( lineWidth ) {
      var offset = this.getEndTangent().perpendicular().negated().times( lineWidth / 2 );
      return [ new kite.Line( this._start.plus( offset ), this._end.plus( offset ) ) ];
    },

    strokeRight: function( lineWidth ) {
      var offset = this.getStartTangent().perpendicular().times( lineWidth / 2 );
      return [ new kite.Line( this._end.plus( offset ), this._start.plus( offset ) ) ];
    },

    // lines are already monotone
    getInteriorExtremaTs: function() { return []; },

    subdivided: function( t ) {
      var pt = this.positionAt( t );
      return [
        new kite.Line( this._start, pt ),
        new kite.Line( pt, this._end )
      ];
    },

    intersection: function( ray ) {
      // We solve for the parametric line-line intersection, and then ensure the parameters are within both
      // the line segment and forwards from the ray.

      var result = [];

      var start = this._start;
      var end = this._end;

      var diff = end.minus( start );

      if ( diff.magnitudeSquared() === 0 ) {
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
      var perp = diff.perpendicular();
      result.push( {
        distance: s,
        point: start.plus( diff.times( t ) ),
        normal: perp.dot( ray.direction ) > 0 ? perp.negated() : perp,
        wind: ray.direction.perpendicular().dot( diff ) < 0 ? 1 : -1,
        segment: this
      } );
      return result;
    },

    // returns the resultant winding number of this ray intersecting this segment.
    windingIntersection: function( ray ) {
      var hits = this.intersection( ray );
      if ( hits.length ) {
        return hits[ 0 ].wind;
      }
      else {
        return 0;
      }
    },

    // assumes the current position is at start
    writeToContext: function( context ) {
      context.lineTo( this._end.x, this._end.y );
    },

    transformed: function( matrix ) {
      return new kite.Line( matrix.timesVector2( this._start ), matrix.timesVector2( this._end ) );
    },

    explicitClosestToPoint: function( point ) {
      var diff = this._end.minus( this._start );
      var t = point.minus( this._start ).dot( diff ) / diff.magnitudeSquared();
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

    // given the current curve parameterized by t, will return a curve parameterized by x where t = a * x + b
    reparameterized: function( a, b ) {
      return new kite.Line( this.positionAt( b ), this.positionAt( a + b ) );
    },

    polarToCartesian: function( options ) {
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
    }
  } );

  Segment.addInvalidatingGetterSetter( Line, 'start' );
  Segment.addInvalidatingGetterSetter( Line, 'end' );

  return Line;
} );
