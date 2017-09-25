// Copyright 2017, University of Colorado Boulder

/**
 * A graph whose edges are segments.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Boundary|null} outerBoundary - Null if it's the "outer" face
   */
  function Face( outerBoundary ) {
    this.initialize( outerBoundary );
  }

  kite.register( 'Face', Face );

  inherit( Object, Face, {
    initialize: function( outerBoundary ) {
      // @public {Boundary}
      this.outerBoundary = outerBoundary;

      // @public {Array.<Face>}
      this.containedAdjacentFaces = cleanArray( this.containedAdjacentFaces );

      // @public {Array.<Face>}
      this.adjacentFacesToRight = cleanArray( this.adjacentFacesToRight );

      // @public {Array.<Face>}
      this.holes = cleanArray( this.holes );
    }
  } );

  Poolable.mixin( Face, {
    constructorDuplicateFactory: function( pool ) {
      return function( outerBoundary ) {
        if ( pool.length ) {
          return pool.pop().initialize( outerBoundary );
        }
        else {
          return new Face( outerBoundary );
        }
      };
    }
  } );

  return kite.Face;
} );
