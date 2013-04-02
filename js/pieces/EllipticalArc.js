// Copyright 2002-2012, University of Colorado

/**
 * Elliptical arc piece
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'kite' );
  var assertExtra = require( 'ASSERT/assert' )( 'kite.extra', true );
  
  var kite = require( 'KITE/kite' );
  
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Ray2 = require( 'DOT/Ray2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Transform3 = require( 'DOT/Transform3' );

  var Piece = require( 'KITE/pieces/Piece' );
  require( 'KITE/segments/EllipticalArc' );
  require( 'KITE/segments/Line' );
  require( 'KITE/util/Subpath' );
  
  Piece.EllipticalArc = function( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
    if ( radiusX < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      radiusX = -radiusX;
      startAngle = Math.PI - startAngle;
      endAngle = Math.PI - endAngle;
      anticlockwise = !anticlockwise;
    }
    if ( radiusY < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      radiusY = -radiusY;
      startAngle = -startAngle;
      endAngle = -endAngle;
      anticlockwise = !anticlockwise;
    }
    if ( radiusX < radiusY ) {
      // swap radiusX and radiusY internally for consistent Canvas / SVG output
      rotation += Math.PI / 2;
      startAngle -= Math.PI / 2;
      endAngle -= Math.PI / 2;
      
      // swap radiusX and radiusY
      var tmpR = radiusX;
      radiusX = radiusY;
      radiusY = tmpR;
    }
    this.center = center;
    this.radiusX = radiusX;
    this.radiusY = radiusY;
    this.rotation = rotation;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.anticlockwise = anticlockwise;
    
    this.unitTransform = kite.Segment.EllipticalArc.computeUnitTransform( center, radiusX, radiusY, rotation );
  };
  Piece.EllipticalArc.prototype = {
    constructor: Piece.EllipticalArc,
    
    writeToContext: function( context ) {
      if ( context.ellipse ) {
        context.ellipse( this.center.x, this.center.y, this.radiusX, this.radiusY, this.rotation, this.startAngle, this.endAngle, this.anticlockwise );
      } else {
        // fake the ellipse call by using transforms
        this.unitTransform.getMatrix().canvasAppendTransform( context );
        context.arc( 0, 0, 1, this.startAngle, this.endAngle, this.anticlockwise );
        this.unitTransform.getInverse().canvasAppendTransform( context );
      }
    },
    
    // TODO: test various transform types, especially rotations, scaling, shears, etc.
    transformed: function( matrix ) {
      var transformedSemiMajorAxis = matrix.timesVector2( Vector2.createPolar( this.radiusX, this.rotation ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
      var transformedSemiMinorAxis = matrix.timesVector2( Vector2.createPolar( this.radiusY, this.rotation + Math.PI / 2 ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
      var rotation = transformedSemiMajorAxis.angle();
      var radiusX = transformedSemiMajorAxis.magnitude();
      var radiusY = transformedSemiMinorAxis.magnitude();
      
      var reflected = matrix.getDeterminant() < 0;
      
      // reverse the 'clockwiseness' if our transform includes a reflection
      // TODO: check reflections. swapping angle signs should fix clockwiseness
      var anticlockwise = reflected ? !this.anticlockwise : this.anticlockwise;
      var startAngle = reflected ? -this.startAngle : this.startAngle;
      var endAngle = reflected ? -this.endAngle : this.endAngle;
      
      return [new Piece.EllipticalArc( matrix.timesVector2( this.center ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise )];
    },
    
    applyPiece: function( shape ) {
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-arc
      
      var ellipticalArc = new kite.Segment.EllipticalArc( this.center, this.radiusX, this.radiusY, this.rotation, this.startAngle, this.endAngle, this.anticlockwise );
      
      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = ellipticalArc.start;
      var endPoint = ellipticalArc.end;
      
      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( shape.hasSubpaths() && shape.getLastSubpath().getLength() > 0 && !startPoint.equals( shape.getLastSubpath().getLastPoint(), 0 ) ) {
        shape.getLastSubpath().addSegment( new kite.Segment.Line( shape.getLastSubpath().getLastPoint(), startPoint ) );
      }
      
      if ( !shape.hasSubpaths() ) {
        shape.addSubpath( new kite.Subpath() );
      }
      
      shape.getLastSubpath().addSegment( ellipticalArc );
      
      // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
      shape.getLastSubpath().addPoint( startPoint );
      shape.getLastSubpath().addPoint( endPoint );
      
      // and update the bounds
      if ( !ellipticalArc.invalid ) {
        shape.bounds = shape.bounds.union( ellipticalArc.bounds );
      }
    },
    
    toString: function() {
      return 'ellipticalArc( ' + this.center.x + ', ' + this.center.y + ', ' + this.radiusX + ', ' + this.radiusY + ', ' + this.rotation + ', ' + this.startAngle + ', ' + this.endAngle + ', ' + this.anticlockwise + ' )';
    }
  };
  
  return Piece.EllipticalArc;
} );
