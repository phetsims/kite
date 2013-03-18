// Copyright 2002-2012, University of Colorado

/**
 * Draws a rectangle.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'kite' );
  
  var kite = require( 'KITE/kite' );
  
  var Vector2 = require( 'DOT/Vector2' );
  
  var Piece = require( 'KITE/pieces/Piece' );
  require( 'KITE/pieces/MoveTo' );
  require( 'KITE/pieces/Close' );
  require( 'KITE/util/Subpath' );
  require( 'KITE/segments/Line' );
  
  // for brevity
  function p( x,y ) { return new Vector2( x, y ); }
  
  Piece.Rect = function( x, y, width, height ) {
    assert && assert( x !== undefined && y !== undefined && width !== undefined && height !== undefined, 'Undefined argument for Piece.Rect' );
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  };
  Piece.Rect.prototype = {
    constructor: Piece.Rect,
    
    writeToContext: function( context ) {
      context.rect( this.x, this.y, this.width, this.height );
    },
    
    transformed: function( matrix ) {
      var a = matrix.timesVector2( p( this.x, this.y ) );
      var b = matrix.timesVector2( p( this.x + this.width, this.y ) );
      var c = matrix.timesVector2( p( this.x + this.width, this.y + this.height ) );
      var d = matrix.timesVector2( p( this.x, this.y + this.height ) );
      return [new Piece.MoveTo( a ), new Piece.LineTo( b ), new Piece.LineTo( c ), new Piece.LineTo( d ), new Piece.Close(), new Piece.MoveTo( a )];
    },
    
    applyPiece: function( shape ) {
      var subpath = new kite.Subpath();
      shape.addSubpath( subpath );
      subpath.addPoint( p( this.x, this.y ) );
      subpath.addPoint( p( this.x + this.width, this.y ) );
      subpath.addPoint( p( this.x + this.width, this.y + this.height ) );
      subpath.addPoint( p( this.x, this.y + this.height ) );
      subpath.addSegment( new kite.Segment.Line( subpath.points[0], subpath.points[1] ) );
      subpath.addSegment( new kite.Segment.Line( subpath.points[1], subpath.points[2] ) );
      subpath.addSegment( new kite.Segment.Line( subpath.points[2], subpath.points[3] ) );
      subpath.close();
      shape.addSubpath( new kite.Subpath() );
      shape.getLastSubpath().addPoint( p( this.x, this.y ) );
      shape.bounds = shape.bounds.withCoordinates( this.x, this.y ).withCoordinates( this.x + this.width, this.y + this.height );
      assert && assert( !isNaN( shape.bounds.getX() ) );
    }
  };
  
  return Piece.Rect;
} );
