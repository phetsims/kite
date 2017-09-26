// Copyright 2017, University of Colorado Boulder

/**
 * TODO: doc
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var HalfEdge = require( 'KITE/ops/HalfEdge' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Segment = require( 'KITE/segments/Segment' );
  var Vertex = require( 'KITE/ops/Vertex' );

  // TODO: Common ops place?
  var vertexEpsilon = 1e-5;

  var globaId = 0;

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Segment} segment
   * @param {Vertex} startVertex
   * @param {Vertex} endVertex
   */
  function Edge( segment, startVertex, endVertex ) {
    // @public {number}
    this.id = ++globaId;

    this.initialize( segment, startVertex, endVertex );
  }

  kite.register( 'Edge', Edge );

  inherit( Object, Edge, {
    initialize: function( segment, startVertex, endVertex ) {
      assert && assert( segment instanceof Segment );
      assert && assert( startVertex instanceof Vertex );
      assert && assert( endVertex instanceof Vertex );
      assert && assert( segment.start.distance( startVertex.point ) < vertexEpsilon );
      assert && assert( segment.end.distance( endVertex.point ) < vertexEpsilon );

      // @public {Segment}
      this.segment = segment;

      // @public {Vertex}
      this.startVertex = startVertex;
      this.endVertex = endVertex;

      // @public {number}
      this.signedAreaFragment = segment.getSignedAreaFragment();

      // @public {HalfEdge}
      this.forwardHalf = this.forwardHalf || new HalfEdge( this, false );
      this.reversedHalf = this.reversedHalf || new HalfEdge( this, true );
    },

    getOtherVertex: function( vertex ) {
      assert && assert( vertex === this.startVertex || vertex === this.endVertex );

      return this.startVertex === vertex ? this.endVertex : this.startVertex;
    },

    /**
     * Returns the tangent of the edge at a specific vertex (in the direction away from the vertex).
     * @public
     *
     * @param {Vertex} vertex
     * @returns {Vector2}
     */
    getTangent: function( vertex ) {
      if ( this.startVertex === vertex ) {
        return this.segment.startTangent;
      }
      else if ( this.endVertex === vertex ) {
        return this.segment.endTangent.negated();
      }
      else {
        throw new Error( 'unknown vertex' );
      }
    },

    /**
     * Update possibly reversed vertex references.
     * @public
     */
    updateReferences: function() {
      this.forwardHalf.updateReferences();
      this.reversedHalf.updateReferences();
    }
  } );

  Poolable.mixin( Edge, {
    constructorDuplicateFactory: function( pool ) {
      return function( segment, startVertex, endVertex ) {
        if ( pool.length ) {
          return pool.pop().initialize( segment, startVertex, endVertex );
        }
        else {
          return new Edge( segment, startVertex, endVertex );
        }
      };
    }
  } );

  return kite.Edge;
} );
