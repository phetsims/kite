// Copyright 2017, University of Colorado Boulder

/**
 * TODO: doc
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  var globaId = 0;

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Boundary|null} boundary - Null if it's the unbounded face
   */
  function Face( boundary ) {
    // @public {number}
    this.id = ++globaId;

    this.initialize( boundary );
  }

  kite.register( 'Face', Face );

  inherit( Object, Face, {
    initialize: function( boundary ) {
      assert && assert( boundary === null || boundary.isInner() );

      // @public {Boundary|null} - "inner" types, null when disposed (in pool)
      this.boundary = boundary;

      // @public {Array.<Boundary>} - "outer" types
      this.holes = cleanArray( this.holes );

      // @public {Object|null} - If non-null, it's a map from shapeId {number} => winding {number}
      this.windingMap = null;

      // @public {boolean|null} - Filled in later
      this.filled = null;

      if ( boundary ) {
        this.addBoundaryFaceReferences( boundary );
      }

      return this;
    },

    dispose: function() {
      this.boundary = null;
      cleanArray( this.holes );
      this.windingMap = null;
      this.filled = null;
      this.freeToPool();
    },

    addBoundaryFaceReferences: function( boundary ) {
      for ( var i = 0; i < boundary.halfEdges.length; i++ ) {
        assert && assert( boundary.halfEdges[ i ].face === null );

        boundary.halfEdges[ i ].face = this;
      }
    },

    recursivelyAddHoles: function( outerBoundary ) {
      assert && assert( !outerBoundary.isInner() );

      this.holes.push( outerBoundary );
      this.addBoundaryFaceReferences( outerBoundary );
      for ( var i = 0; i < outerBoundary.childBoundaries.length; i++ ) {
        this.recursivelyAddHoles( outerBoundary.childBoundaries[ i ] );
      }
    }
  } );

  Poolable.mixin( Face, {
    constructorDuplicateFactory: function( pool ) {
      return function( boundary ) {
        if ( pool.length ) {
          return pool.pop().initialize( boundary );
        }
        else {
          return new Face( boundary );
        }
      };
    }
  } );

  return kite.Face;
} );
