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

  // TODO: Move to common place
  var edgeAngleEpsilon = 1e-4;

  var globaId = 0;

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Vector2} point
   */
  function Vertex( point ) {
    // @public {number}
    this.id = ++globaId;

    this.initialize( point );

    // @private {function}
    this.edgeCompare = this.edgeComparison.bind( this );
  }

  kite.register( 'Vertex', Vertex );

  inherit( Object, Vertex, {
    initialize: function( point ) {
      assert && assert( point instanceof Vector2 );

      // @public {Vector2}
      this.point = point;

      // @public {Array.<HalfEdge>} - Records the half-edge that points to (ends at) this vertex.
      this.incidentHalfEdges = cleanArray( this.incidentHalfEdges );

      return this;
    },

    dispose: function() {
      this.point = Vector2.ZERO;
      cleanArray( this.incidentHalfEdges );
      this.freeToPool();
    },

    /**
     * Comparse two edges for sortEdges.
     * @private
     *
     * TODO: For sorting, don't require multiple computation of the angles
     *
     * @param {Edge} halfEdgeA
     * @param {Edge} halfEdgeB
     * @returns {number}
     */
    edgeComparison: function( halfEdgeA, halfEdgeB ) {
      var angleA = halfEdgeA.getEndTangent().angle();
      var angleB = halfEdgeB.getEndTangent().angle();

      if ( Math.abs( angleA - angleB ) > edgeAngleEpsilon ) {
        return angleA < angleB ? -1 : 1;
      }
      else {
        throw new Error( 'Need to implement curvature (2nd derivative) detection' );
      }
    },

    /**
     * Sorts the edges in increasing angle order.
     * @public
     */
    sortEdges: function() {
      this.incidentHalfEdges.sort( this.edgeCompare );
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
