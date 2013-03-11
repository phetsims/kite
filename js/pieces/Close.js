// Copyright 2002-2012, University of Colorado

/**
 * Closes a subpath
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  "use strict";
  
  var assert = require( 'ASSERT/assert' )( 'kite' );
  
  var kite = require( 'KITE/kite' );
  
  var Piece = require( 'KITE/pieces/Piece' );
  require( 'KITE/util/Subpath' );
  
  Piece.Close = function() {};
  Piece.Close.prototype = {
    constructor: Piece.Close,
    
    writeToContext: function( context ) {
      context.closePath();
    },
    
    transformed: function( matrix ) {
      return [this];
    },
    
    applyPiece: function( shape ) {
      if ( shape.hasSubpaths() ) {
        var previousPath = shape.getLastSubpath();
        var nextPath = new kite.Subpath();
        
        previousPath.close();
        shape.addSubpath( nextPath );
        nextPath.addPoint( previousPath.getFirstPoint() );
      }
    }
  };
  
  return Piece.Close;
} );
