// Copyright 2002-2012, University of Colorado

/**
 * Arc segment
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'kite' );

  var kite = require( 'KITE/kite' );
  
  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var DotUtil = require( 'DOT/Util' );

  var Segment = require( 'KITE/segments/Segment' );

  Segment.Arc = function Arc( center, radius, startAngle, endAngle, anticlockwise ) {
    if ( radius < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      radius = -radius;
      startAngle += Math.PI;
      endAngle += Math.PI;
    }
    
    this.center = center;
    this.radius = radius;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.anticlockwise = anticlockwise;
    
    this.start = this.positionAtAngle( startAngle );
    this.end = this.positionAtAngle( endAngle );
    this.startTangent = this.tangentAtAngle( startAngle );
    this.endTangent = this.tangentAtAngle( endAngle );
    
    if ( radius <= 0 || startAngle === endAngle ) {
      this.invalid = true;
      return;
    }
    
    // compute an actual end angle so that we can smoothly go from this.startAngle to this.actualEndAngle
    if ( this.anticlockwise ) {
      // angle is 'decreasing'
      // -2pi <= end - start < 2pi
      if ( this.startAngle > this.endAngle ) {
        this.actualEndAngle = this.endAngle;
      } else if ( this.startAngle < this.endAngle ) {
        this.actualEndAngle = this.endAngle - 2 * Math.PI;
      } else {
        // equal
        this.actualEndAngle = this.startAngle;
      }
    } else {
      // angle is 'increasing'
      // -2pi < end - start <= 2pi
      if ( this.startAngle < this.endAngle ) {
        this.actualEndAngle = this.endAngle;
      } else if ( this.startAngle > this.endAngle ) {
        this.actualEndAngle = this.endAngle + Math.PI * 2;
      } else {
        // equal
        this.actualEndAngle = this.startAngle;
      }
    }
    
    // constraints
    assert && assert( !( ( !anticlockwise && endAngle - startAngle <= -Math.PI * 2 ) || ( anticlockwise && startAngle - endAngle <= -Math.PI * 2 ) ), 'Not handling arcs with start/end angles that show differences in-between browser handling' );
    assert && assert( !( ( !anticlockwise && endAngle - startAngle > Math.PI * 2 ) || ( anticlockwise && startAngle - endAngle > Math.PI * 2 ) ), 'Not handling arcs with start/end angles that show differences in-between browser handling' );
    
    var isFullPerimeter = ( !anticlockwise && endAngle - startAngle >= Math.PI * 2 ) || ( anticlockwise && startAngle - endAngle >= Math.PI * 2 );
    
    // compute an angle difference that represents how "much" of the circle our arc covers
    this.angleDifference = this.anticlockwise ? this.startAngle - this.endAngle : this.endAngle - this.startAngle;
    if ( this.angleDifference < 0 ) {
      this.angleDifference += Math.PI * 2;
    }
    assert && assert( this.angleDifference >= 0 ); // now it should always be zero or positive
    
    // acceleration for intersection
    this.bounds = Bounds2.NOTHING;
    this.bounds = this.bounds.withPoint( this.start );
    this.bounds = this.bounds.withPoint( this.end );
    
    // for bounds computations
    var that = this;
    function boundsAtAngle( angle ) {
      if ( that.containsAngle( angle ) ) {
        // the boundary point is in the arc
        that.bounds = that.bounds.withPoint( center.plus( Vector2.createPolar( radius, angle ) ) );
      }
    }
    
    // if the angles are different, check extrema points
    if ( startAngle !== endAngle ) {
      // check all of the extrema points
      boundsAtAngle( 0 );
      boundsAtAngle( Math.PI / 2 );
      boundsAtAngle( Math.PI );
      boundsAtAngle( 3 * Math.PI / 2 );
    }
  };
  inherit( Segment.Arc, Segment, {
    
    // maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
    mapAngle: function( angle ) {
      // consider an assert that we contain that angle?
      return ( this.startAngle > this.actualEndAngle ) ?
             DotUtil.moduloBetweenUp( angle, this.startAngle - 2 * Math.PI, this.startAngle ) :
             DotUtil.moduloBetweenDown( angle, this.startAngle, this.startAngle + 2 * Math.PI );
    },
    
    tAtAngle: function( angle ) {
      return ( this.mapAngle( angle ) - this.startAngle ) / ( this.actualEndAngle - this.startAngle );
    },
    
    angleAt: function( t ) {
      return this.startAngle + ( this.actualEndAngle - this.startAngle ) * t;
    },
    
    positionAt: function( t ) {
      return this.positionAtAngle( this.angleAt( t ) );
    },
    
    tangentAt: function( t ) {
      return this.tangentAtAngle( this.angleAt( t ) );
    },
    
    curvatureAt: function( t ) {
      return ( this.anticlockwise ? -1 : 1 ) / this.radius;
    },
    
    positionAtAngle: function( angle ) {
      return this.center.plus( Vector2.createPolar( this.radius, angle ) );
    },
    
    tangentAtAngle: function( angle ) {
      var normal = Vector2.createPolar( 1, angle );
      
      return this.anticlockwise ? normal.perpendicular() : normal.perpendicular().negated();
    },
    
    // TODO: refactor? shared with Segment.EllipticalArc (use this improved version)
    containsAngle: function( angle ) {
      // transform the angle into the appropriate coordinate form
      // TODO: check anticlockwise version!
      var normalizedAngle = this.anticlockwise ? angle - this.endAngle : angle - this.startAngle;
      
      // get the angle between 0 and 2pi
      var positiveMinAngle = DotUtil.moduloBetweenDown( normalizedAngle, 0, Math.PI * 2 );
      
      return positiveMinAngle <= this.angleDifference;
    },
    
    getSVGPathFragment: function() {
      // see http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands for more info
      // rx ry x-axis-rotation large-arc-flag sweep-flag x y
      
      var epsilon = 0.01; // allow some leeway to render things as 'almost circles'
      var sweepFlag = this.anticlockwise ? '0' : '1';
      var largeArcFlag;
      if ( this.angleDifference < Math.PI * 2 - epsilon ) {
        largeArcFlag = this.angleDifference < Math.PI ? '0' : '1';
        return 'A ' + this.radius + ' ' + this.radius + ' 0 ' + largeArcFlag + ' ' + sweepFlag + ' ' + this.end.x + ' ' + this.end.y;
      } else {
        // circle (or almost-circle) case needs to be handled differently
        // since SVG will not be able to draw (or know how to draw) the correct circle if we just have a start and end, we need to split it into two circular arcs
        
        // get the angle that is between and opposite of both of the points
        var splitOppositeAngle = ( this.startAngle + this.endAngle ) / 2; // this _should_ work for the modular case?
        var splitPoint = this.center.plus( Vector2.createPolar( this.radius, splitOppositeAngle ) );
        
        largeArcFlag = '0'; // since we split it in 2, it's always the small arc
        
        var firstArc = 'A ' + this.radius + ' ' + this.radius + ' 0 ' + largeArcFlag + ' ' + sweepFlag + ' ' + splitPoint.x + ' ' + splitPoint.y;
        var secondArc = 'A ' + this.radius + ' ' + this.radius + ' 0 ' + largeArcFlag + ' ' + sweepFlag + ' ' + this.end.x + ' ' + this.end.y;
        
        return firstArc + ' ' + secondArc;
      }
    },
    
    strokeLeft: function( lineWidth ) {
      return [new Segment.Arc( this.center, this.radius + ( this.anticlockwise ? 1 : -1 ) * lineWidth / 2, this.startAngle, this.endAngle, this.anticlockwise )];
    },
    
    strokeRight: function( lineWidth ) {
      return [new Segment.Arc( this.center, this.radius + ( this.anticlockwise ? -1 : 1 ) * lineWidth / 2, this.endAngle, this.startAngle, !this.anticlockwise )];
    },
    
    // not including 0 and 1
    getInteriorExtremaTs: function() {
      var that = this;
      var result = [];
      _.each( [ 0, Math.PI / 2, Math.PI, 3 * Math.PI / 2 ], function( angle ) {
        if ( that.containsAngle( angle ) ) {
          var t = that.tAtAngle( angle );
          var epsilon = 0.0000000001; // TODO: general kite epsilon?
          if ( t > epsilon && t < 1 - epsilon ) {
            result.push( t );
          }
        }
      } );
      return result.sort(); // modifies original, which is OK
    },
    
    subdivided: function( t ) {
      // TODO: verify that we don't need to switch anticlockwise here, or subtract 2pi off any angles
      var angle0 = this.angleAt( 0 );
      var angleT = this.angleAt( t );
      var angle1 = this.angleAt( 1 );
      return [
        new Segment.Arc( this.center, this.radius, angle0, angleT, this.anticlockwise ),
        new Segment.Arc( this.center, this.radius, angleT, angle1, this.anticlockwise )
      ];
    },
    
    // TODO: move to Segment?
    subdividedIntoMonotone: function() {
      return this.subdivisions( this.getInteriorExtremaTs() );
    },
    
    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.intersectsBounds unimplemented!' );
    },
    
    intersection: function( ray ) {
      var result = []; // hits in order
      
      // left here, if in the future we want to better-handle boundary points
      var epsilon = 0;
      
      // Run a general circle-intersection routine, then we can test the angles later.
      // Solves for the two solutions t such that ray.pos + ray.dir * t is on the circle.
      // Then we check whether the angle at each possible hit point is in our arc.
      var centerToRay = ray.pos.minus( this.center );
      var tmp = ray.dir.dot( centerToRay );
      var centerToRayDistSq = centerToRay.magnitudeSquared();
      var discriminant = 4 * tmp * tmp - 4 * ( centerToRayDistSq - this.radius * this.radius );
      if ( discriminant < epsilon ) {
        // ray misses circle entirely
        return result;
      }
      var base = ray.dir.dot( this.center ) - ray.dir.dot( ray.pos );
      var sqt = Math.sqrt( discriminant ) / 2;
      var ta = base - sqt;
      var tb = base + sqt;
      
      if ( tb < epsilon ) {
        // circle is behind ray
        return result;
      }
      
      var pointB = ray.pointAtDistance( tb );
      var normalB = pointB.minus( this.center ).normalized();
      
      if ( ta < epsilon ) {
        // we are inside the circle, so only one intersection is possible
        if ( this.containsAngle( normalB.angle() ) ) {
          result.push( {
            distance: tb,
            point: pointB,
            normal: normalB.negated(), // normal is towards the ray
            wind: this.anticlockwise ? -1 : 1 // since we are inside, wind this way
          } );
        }
      }
      else {
        // two possible hits (outside circle)
        var pointA = ray.pointAtDistance( ta );
        var normalA = pointA.minus( this.center ).normalized();
        
        if ( this.containsAngle( normalA.angle() ) ) {
          result.push( {
            distance: ta,
            point: pointA,
            normal: normalA,
            wind: this.anticlockwise ? 1 : -1 // hit from outside
          } );
        }
        if ( this.containsAngle( normalB.angle() ) ) {
          result.push( {
            distance: tb,
            point: pointB,
            normal: normalB.negated(),
            wind: this.anticlockwise ? -1 : 1 // this is the far hit, which winds the opposite way
          } );
        }
      }
      
      return result;
    },
    
    // returns the resultant winding number of this ray intersecting this segment.
    windingIntersection: function( ray ) {
      var wind = 0;
      var hits = this.intersection( ray );
      _.each( hits, function( hit ) {
        wind += hit.wind;
      } );
      return wind;
    },
    
    writeToContext: function( context ) {
      context.arc( this.center.x, this.center.y, this.radius, this.startAngle, this.endAngle, this.anticlockwise );
    },
    
    // TODO: test various transform types, especially rotations, scaling, shears, etc.
    transformed: function( matrix ) {
      // so we can handle reflections in the transform, we do the general case handling for start/end angles
      var startAngle = matrix.timesVector2( Vector2.createPolar( 1, this.startAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle();
      var endAngle = matrix.timesVector2( Vector2.createPolar( 1, this.endAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle();
      
      // reverse the 'clockwiseness' if our transform includes a reflection
      var anticlockwise = matrix.getDeterminant() >= 0 ? this.anticlockwise : !this.anticlockwise;

      var scaleVector = matrix.getScaleVector();
      if ( scaleVector.x !== scaleVector.y ) {
        var radiusX = scaleVector.x * this.radius;
        var radiusY = scaleVector.y * this.radius;
        return new Segment.EllipticalArc( matrix.timesVector2( this.center ), radiusX, radiusY, 0, startAngle, endAngle, anticlockwise );
      } else {
        var radius = scaleVector.x * this.radius;
        return new Segment.Arc( matrix.timesVector2( this.center ), radius, startAngle, endAngle, anticlockwise );
      }
    }
  } );
  
  return Segment.Arc;
} );
