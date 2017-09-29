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
   * @param {number} shapeId
   */
  function Loop( shapeId ) {
    // @public {number}
    this.id = ++globaId;

    this.initialize( shapeId );
  }

  kite.register( 'Loop', Loop );

  inherit( Object, Loop, {
    initialize: function( shapeId ) {
      assert && assert( typeof shapeId === 'number' );

      // @public {number}
      this.shapeId = shapeId;

      // @public {Array.<HalfEdge>}
      this.halfEdges = cleanArray( this.halfEdges );

      return this;
    },

    dispose: function() {
      cleanArray( this.halfEdges );
      this.freeToPool();
    }
  } );

  Poolable.mixin( Loop, {
    constructorDuplicateFactory: function( pool ) {
      return function( shapeId ) {
        if ( pool.length ) {
          return pool.pop().initialize( shapeId );
        }
        else {
          return new Loop( shapeId );
        }
      };
    }
  } );

  return kite.Loop;
} );
