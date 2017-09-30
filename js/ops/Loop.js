// Copyright 2017, University of Colorado Boulder

/**
 * A directed set of half-edges determined by how the original shapes/subpaths were directionally. This is distinct from
 * boundaries, as:
 * 1. Input shapes/subpaths can self-intersect, ignore clockwise restrictions, and avoid boundary restrictions.
 * 2. Input shapes/subpaths can repeat over the same edges multiple times (affecting winding order), and can even
 *    double-back or do other operations.
 * 3. We need to record separate shape IDs for the different loops, so we can perform CAG operations on separate ones.
 *    This means we need to track winding order separately for each ID.
 *
 * As operations simplify/remove/replace edges, it will handle replacement of the edges in the loops.
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

    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
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

    /**
     * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
     * can be reused.
     * @public
     */
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
