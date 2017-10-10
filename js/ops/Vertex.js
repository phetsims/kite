// Copyright 2017, University of Colorado Boulder

/**
 * Represents a point in space that connects to edges. It stores the edges that are connected (directionally as
 * half-edges since Cubic segments can start and end at the same point/vertex), and can handle sorting edges so that
 * a half-edge's "next" half-edge (following counter-clockwise) can be determined.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Vector2 = require( 'DOT/Vector2' );

  var globaId = 0;

  /**
   * Comparse two edges for sortEdges.
   *
   * TODO: For sorting, don't require multiple computation of the angles
   *
   * @param {Edge} halfEdgeA
   * @param {Edge} halfEdgeB
   * @returns {number}
   */
  function edgeComparison( halfEdgeA, halfEdgeB ) {
    var angleA = halfEdgeA.getEndTangent().angle();
    var angleB = halfEdgeB.getEndTangent().angle();

    if ( Math.abs( angleA - angleB ) > 1e-4 ) {
      return angleA < angleB ? -1 : 1;
    }
    else {
      var curvatureA = halfEdgeA.getEndCurvature();
      var curvatureB = halfEdgeB.getEndCurvature();
      if ( Math.abs( curvatureA - curvatureB ) > 1e-4 ) {
        return curvatureA < curvatureB ? 1 : -1;
      }
      else {
        throw new Error( 'TODO: Need to implement more advanced disambiguation ' );
      }
    }
  }

  /**
   * @public (kite-internal)
   * @constructor
   *
   * NOTE: Use Vertex.createFromPool for most usage instead of using the constructor directly.
   *
   * @param {Vector2} point - The point where the vertex should be located.
   */
  function Vertex( point ) {
    // @public {number}
    this.id = ++globaId;

    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( point );
  }

  kite.register( 'Vertex', Vertex );

  inherit( Object, Vertex, {
    /**
     * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
     * support pooling.
     * @private
     *
     * @param {Vector2} point
     * @returns {Vertex} - This reference for chaining
     */
    initialize: function( point ) {
      assert && assert( point instanceof Vector2 );

      // @public {Vector2}
      this.point = point;

      // @public {Array.<HalfEdge>} - Records the half-edge that points to (ends at) this vertex.
      this.incidentHalfEdges = cleanArray( this.incidentHalfEdges );

      // @public {boolean} - Used for depth-first search
      this.visited = false;

      // @public {number} - Visit index for bridge detection (more efficient to have inline here)
      this.visitIndex = 0;

      // @public {number} - Low index for bridge detection (more efficient to have inline here)
      this.lowIndex = 0;

      return this;
    },

    /**
     * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
     * can be reused.
     * @public
     */
    dispose: function() {
      this.point = Vector2.ZERO;
      cleanArray( this.incidentHalfEdges );
      this.freeToPool();
    },

    /**
     * Sorts the edges in increasing angle order.
     * @public
     */
    sortEdges: function() {
      this.incidentHalfEdges.sort( edgeComparison );
    }
  } );

  Poolable.mixin( Vertex, {
    constructorDuplicateFactory: function( pool ) {
      return function( point ) {
        if ( pool.length ) {
          return pool.pop().initialize( point );
        }
        else {
          return new Vertex( point );
        }
      };
    }
  } );

  return kite.Vertex;
} );
