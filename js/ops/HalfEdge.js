// Copyright 2017, University of Colorado Boulder

/**
 * Represents a single direction/side of an Edge. There are two half-edges for each edge, representing each direction.
 * The half-edge also stores face information for the face that would be to the left of the direction of travel.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Edge} edge
   * @param {boolean} isReversed
   */
  function HalfEdge( edge, isReversed ) {
    this.initialize( edge, isReversed );
  }

  kite.register( 'HalfEdge', HalfEdge );

  inherit( Object, HalfEdge, {
    initialize: function( edge, isReversed ) {
      assert && assert( edge instanceof kite.Edge );
      assert && assert( typeof isReversed === 'boolean' );

      // @public {Edge|null} - Null if disposed (in pool)
      this.edge = edge;

      // @public {Face|null} - Filled in later, contains a face reference
      this.face = null;

      // @public {boolean}
      this.isReversed = isReversed;

      // @public {number}
      this.signedAreaFragment = edge.signedAreaFragment * ( isReversed ? -1 : 1 );

      // @public {Vertex|null}
      this.startVertex = null;
      this.endVertex = null;

      this.updateReferences(); // Initializes vertex references

      return this;
    },

    dispose: function() {
      this.edge = null;
      this.face = null;
      this.startVertex = null;
      this.endVertex = null;
      this.freeToPool();
    },

    /**
     * Returns the next half-edge, walking around counter-clockwise as possible. Assumes edges have been sorted.
     * @public
     *
     * @param {function} [filter] - function( {Edge} ) => {boolean}. If it returns false, the edge will be skipped, and
     *                              not returned by getNext
     */
    getNext: function( filter ) {
      for ( var i = 1;; i++ ) {
        var index = this.endVertex.incidentHalfEdges.indexOf( this ) - i;
        if ( index < 0 ) {
          index += this.endVertex.incidentHalfEdges.length;
        }
        var halfEdge = this.endVertex.incidentHalfEdges[ index ].getReversed();
        if ( filter && !filter( halfEdge.edge ) ) {
          continue;
        }
        assert && assert( this.endVertex === halfEdge.startVertex );
        return halfEdge;
      }
    },

    /**
     * Update possibly reversed vertex references.
     * @private
     */
    updateReferences: function() {
      this.startVertex = this.isReversed ? this.edge.endVertex : this.edge.startVertex;
      this.endVertex = this.isReversed ? this.edge.startVertex : this.edge.endVertex;
      assert && assert( this.startVertex );
      assert && assert( this.endVertex );
    },

    /**
     * Returns the tangent of the edge at the end vertex (in the direction away from the vertex).
     * @public
     *
     * @returns {Vector2}
     */
    getEndTangent: function() {
      if ( this.isReversed ) {
        return this.edge.segment.startTangent;
      }
      else {
        return this.edge.segment.endTangent.negated();
      }
    },

    getReversed: function() {
      return this.isReversed ? this.edge.forwardHalf : this.edge.reversedHalf;
    },

    getDirectionalSegment: function() {
      if ( this.isReversed ) {
        return this.edge.segment.reversed();
      }
      else {
        return this.edge.segment;
      }
    }
  } );

  Poolable.mixin( HalfEdge, {
    constructorDuplicateFactory: function( pool ) {
      return function( edge, isReversed ) {
        if ( pool.length ) {
          return pool.pop().initialize( edge, isReversed );
        }
        else {
          return new HalfEdge( edge, isReversed );
        }
      };
    }
  } );

  return kite.HalfEdge;
} );
