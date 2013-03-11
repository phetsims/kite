// Copyright 2002-2012, University of Colorado

/**
 * Creates a line from the previous point
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'kite' );
  
  var kite = require( 'KITE/kite' );
  
  var Piece = require( 'KITE/pieces/Piece' );
  require( 'KITE/segments/Line' );
  
  Piece.LineTo = function( point ) {
    this.point = point;
  };
  Piece.LineTo.prototype = {
    constructor: Piece.LineTo,
    
    writeToContext: function( context ) {
      context.lineTo( this.point.x, this.point.y );
    },
    
    transformed: function( matrix ) {
      return [new Piece.LineTo( matrix.timesVector2( this.point ) )];
    },
    
    applyPiece: function( shape ) {
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-lineto
      if ( shape.hasSubpaths() ) {
        var start = shape.getLastSubpath().getLastPoint();
        var end = this.point;
        var line = new kite.Segment.Line( start, end );
        shape.getLastSubpath().addSegment( line );
        shape.getLastSubpath().addPoint( end );
        shape.bounds = shape.bounds.withPoint( start ).withPoint( end );
        assert && assert( !isNaN( shape.bounds.getX() ) );
      } else {
        shape.ensure( this.point );
      }
    }
  };
  
  return Piece.LineTo;
} );
