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
  var Line = require( 'KITE/segments/Line' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Vector2 = require( 'DOT/Vector2' );

  var globaId = 0;

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
      var vectors = []; // x coordinate will be "angle", y coordinate will be curvature
      for ( var i = 0; i < this.incidentHalfEdges.length; i++ ) {
        var halfEdge = this.incidentHalfEdges[ i ];
        // NOTE: If it is expensive to precompute curvature, we could save it until edgeComparison needs it.
        vectors.push( halfEdge.sortVector.setXY( halfEdge.getEndTangent().angle, halfEdge.getEndCurvature() ) );
      }

      // "Rotate" the angles until we are sure that our "cut" (where -pi goes to pi around the circle) is at a place
      // not near any angle. This should prevent ambiguity in sorting (which can lead to bugs in the order)
      var cutoff = -Math.PI + 1e-4;
      var atCutAngle = false;
      while ( !atCutAngle ) {
        atCutAngle = true;
        for ( i = 0; i < vectors.length; i++ ) {
          if ( vectors[ i ].x < cutoff ) {
            atCutAngle = false;
          }
        }
        if ( !atCutAngle ) {
          for ( i = 0; i < vectors.length; i++ ) {
            var vector = vectors[ i ];
            vector.x -= 1.62594024516; // Definitely not choosing random digits by typing! (shouldn't matter)
            if ( vector.x < -Math.PI - 1e-4 ) {
              vector.x += Math.PI * 2;
            }
          }
        }
      }

      this.incidentHalfEdges.sort( Vertex.edgeComparison );
    }
  }, {
    /**
     * Comparse two edges for sortEdges. Should have executed that first, as it relies on information looked up in that
     * process.
     *
     * @param {Edge} halfEdgeA
     * @param {Edge} halfEdgeB
     * @returns {number}
     */
    edgeComparison: function( halfEdgeA, halfEdgeB ) {
      var angleA = halfEdgeA.sortVector.x;
      var angleB = halfEdgeB.sortVector.x;

      // Don't allow angleA=-pi, angleB=pi (they are equivalent)
      // If our angle is very small, we need to accept it still if we have two lines (since they will have the same
      // curvature).
      if ( Math.abs( angleA - angleB ) > 1e-5 ||
           ( angleA !== angleB && ( halfEdgeA.edge.segment instanceof Line ) && ( halfEdgeB.edge.segment instanceof Line ) ) ) {
        return angleA < angleB ? -1 : 1;
      }
      else {
        var curvatureA = halfEdgeA.sortVector.y;
        var curvatureB = halfEdgeB.sortVector.y;
        if ( Math.abs( curvatureA - curvatureB ) > 1e-5 ) {
          return curvatureA < curvatureB ? 1 : -1;
        }
        else {
          throw new Error( 'TODO: Need to implement more advanced disambiguation ' );
        }
      }
    }
  } );

  Poolable.mixInto( Vertex, {
    initialize: Vertex.prototype.initialize
  } );

  return kite.Vertex;
} );
