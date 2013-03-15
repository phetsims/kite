// Copyright 2002-2012, University of Colorado

/**
 * Quadratic Bezier segment
 *
 * Good reference: http://cagd.cs.byu.edu/~557/text/ch2.pdf
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'kite' );

  var kite = require( 'KITE/kite' );
  
  var Bounds2 = require( 'DOT/Bounds2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var solveQuadraticRootsReal = require( 'DOT/Util' ).solveQuadraticRootsReal;

  var Segment = require( 'KITE/segments/Segment' );
  var Piece = require( 'KITE/pieces/Piece' );

  Segment.Quadratic = function( start, control, end, skipComputations ) {
    this.start = start;
    this.control = control;
    this.end = end;
    
    if ( start.equals( end, 0 ) && start.equals( control, 0 ) ) {
      this.invalid = true;
      return;
    }
    
    var t;
    
    // allows us to skip unnecessary computation in the subdivision steps
    if ( skipComputations ) {
      return;
    }
    
    var controlIsStart = start.equals( control );
    var controlIsEnd = end.equals( control );
    // ensure the points are distinct
    assert && assert( !controlIsStart || !controlIsEnd );
    
    // allow either the start or end point to be the same as the control point (necessary if you do a quadraticCurveTo on an empty path)
    // tangents go through the control point, which simplifies things
    this.startTangent = controlIsStart ? end.minus( start ).normalized() : control.minus( start ).normalized();
    this.endTangent = controlIsEnd ? end.minus( start ).normalized() : end.minus( control ).normalized();
    
    // calculate our temporary guaranteed lower bounds based on the end points
    this.bounds = new Bounds2( Math.min( start.x, end.x ), Math.min( start.y, end.y ), Math.max( start.x, end.x ), Math.max( start.y, end.y ) );
    
    // compute x and y where the derivative is 0, so we can include this in the bounds
    var divisorX = 2 * ( end.x - 2 * control.x + start.x );
    if ( divisorX !== 0 ) {
      t = -2 * ( control.x - start.x ) / divisorX;
      
      if ( t > 0 && t < 1 ) {
        this.bounds = this.bounds.withPoint( this.positionAt( t ) );
      }
    }
    var divisorY = 2 * ( end.y - 2 * control.y + start.y );
    if ( divisorY !== 0 ) {
      t = -2 * ( control.y - start.y ) / divisorY;
      
      if ( t > 0 && t < 1 ) {
        this.bounds = this.bounds.withPoint( this.positionAt( t ) );
      }
    }
  };
  Segment.Quadratic.prototype = {
    constructor: Segment.Quadratic,
    
    degree: 2,
    
    // can be described from t=[0,1] as: (1-t)^2 start + 2(1-t)t control + t^2 end
    positionAt: function( t ) {
      var mt = 1 - t;
      return this.start.times( mt * mt ).plus( this.control.times( 2 * mt * t ) ).plus( this.end.times( t * t ) );
    },
    
    // derivative: 2(1-t)( control - start ) + 2t( end - control )
    tangentAt: function( t ) {
      return this.control.minus( this.start ).times( 2 * ( 1 - t ) ).plus( this.end.minus( this.control ).times( 2 * t ) );
    },
    
    curvatureAt: function( t ) {
      // see http://cagd.cs.byu.edu/~557/text/ch2.pdf p31
      // TODO: remove code duplication with Cubic
      var epsilon = 0.0000001;
      if ( Math.abs( t - 0.5 ) > 0.5 - epsilon ) {
        var isZero = t < 0.5;
        var p0 = isZero ? this.start : this.end;
        var p1 = this.control;
        var p2 = isZero ? this.end : this.start;
        var d10 = p1.minus( p0 );
        var a = d10.magnitude();
        var h = ( isZero ? -1 : 1 ) * d10.perpendicular().normalized().dot( p2.minus( p1 ) );
        return ( h * ( this.degree - 1 ) ) / ( this.degree * a * a );
      } else {
        return this.subdivided( t, true )[0].curvatureAt( 1 );
      }
    },
    
    // see http://www.visgraf.impa.br/sibgrapi96/trabs/pdf/a14.pdf
    // and http://math.stackexchange.com/questions/12186/arc-length-of-bezier-curves for curvature / arc length
    
    offsetTo: function( r, reverse ) {
      // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html
      // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      var curves = [this];
      
      // subdivide this curve
      var depth = 5; // generates 2^depth curves
      for ( var i = 0; i < depth; i++ ) {
        curves = _.flatten( _.map( curves, function( curve ) {
          return curve.subdivided( 0.5, true );
        } ));
      }
      
      var offsetCurves = _.map( curves, function( curve ) { return curve.approximateOffset( r ); } );
      
      if ( reverse ) {
        offsetCurves.reverse();
        offsetCurves = _.map( offsetCurves, function( curve ) { return curve.reversed( true ); } );
      }
      
      var result = _.map( offsetCurves, function( curve ) {
        return new Piece.QuadraticCurveTo( curve.control, curve.end );
      } );
      
      return result;
    },
    
    subdivided: function( t, skipComputations ) {
      // de Casteljau method
      var leftMid = this.start.blend( this.control, t );
      var rightMid = this.control.blend( this.end, t );
      var mid = leftMid.blend( rightMid, t );
      return [
        new Segment.Quadratic( this.start, leftMid, mid, skipComputations ),
        new Segment.Quadratic( mid, rightMid, this.end, skipComputations )
      ];
    },
    
    reversed: function( skipComputations ) {
      return new Segment.Quadratic( this.end, this.control, this.start );
    },
    
    approximateOffset: function( r ) {
      return new Segment.Quadratic(
        this.start.plus( ( this.start.equals( this.control ) ? this.end.minus( this.start ) : this.control.minus( this.start ) ).perpendicular().normalized().times( r ) ),
        this.control.plus( this.end.minus( this.start ).perpendicular().normalized().times( r ) ),
        this.end.plus( ( this.end.equals( this.control ) ? this.end.minus( this.start ) : this.end.minus( this.control ) ).perpendicular().normalized().times( r ) )
      );
    },
    
    toPieces: function() {
      return [ new Piece.QuadraticCurveTo( this.control, this.end ) ];
    },
    
    getSVGPathFragment: function() {
      return 'Q ' + this.control.x + ' ' + this.control.y + ' ' + this.end.x + ' ' + this.end.y;
    },
    
    strokeLeft: function( lineWidth ) {
      return this.offsetTo( -lineWidth / 2, false );
    },
    
    strokeRight: function( lineWidth ) {
      return this.offsetTo( lineWidth / 2, true );
    },
    
    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.Quadratic.intersectsBounds unimplemented' ); // TODO: implement
    },
    
    // returns the resultant winding number of this ray intersecting this segment.
    intersection: function( ray ) {
      var self = this;
      var result = [];
      
      // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
      var inverseMatrix = Matrix3.rotation2( -ray.dir.angle() ).timesMatrix( Matrix3.translation( -ray.pos.x, -ray.pos.y ) );
      
      var p0 = inverseMatrix.timesVector2( this.start );
      var p1 = inverseMatrix.timesVector2( this.control );
      var p2 = inverseMatrix.timesVector2( this.end );
      
      //(1-t)^2 start + 2(1-t)t control + t^2 end
      var a = p0.y - 2 * p1.y + p2.y;
      var b = -2 * p0.y + 2 * p1.y;
      var c = p0.y;
      
      var ts = solveQuadraticRootsReal( a, b, c );
      
      _.each( ts, function( t ) {
        if ( t >= 0 && t <= 1 ) {
          var hitPoint = self.positionAt( t );
          var unitTangent = self.tangentAt( t ).normalized();
          var perp = unitTangent.perpendicular();
          var toHit = hitPoint.minus( ray.pos );
          
          // make sure it's not behind the ray
          if ( toHit.dot( ray.dir ) > 0 ) {
            result.push( {
              distance: toHit.magnitude(),
              point: hitPoint,
              normal: perp.dot( ray.dir ) > 0 ? perp.negated() : perp,
              wind: ray.dir.perpendicular().dot( unitTangent ) < 0 ? 1 : -1
            } );
          }
        }
      } );
      return result;
    },
    
    windingIntersection: function( ray ) {
      var wind = 0;
      var hits = this.intersection( ray );
      _.each( hits, function( hit ) {
        wind += hit.wind;
      } );
      return wind;
    }
  };
  
  return Segment.Quadratic;
} );
