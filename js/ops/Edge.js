// Copyright 2017, University of Colorado Boulder

/**
 * Represents a segment in the graph (connects to vertices on both ends)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var HalfEdge = require( 'KITE/ops/HalfEdge' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Line = require( 'KITE/segments/Line' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Segment = require( 'KITE/segments/Segment' );
  var Vertex = require( 'KITE/ops/Vertex' );

  var globaId = 0;

  /**
   * @public (kite-internal)
   * @constructor
   *
   * NOTE: Use Edge.createFromPool for most usage instead of using the constructor directly.
   *
   * @param {Segment} segment
   * @param {Vertex} startVertex
   * @param {Vertex} endVertex
   */
  function Edge( segment, startVertex, endVertex ) {
    // @public {number}
    this.id = ++globaId;

    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( segment, startVertex, endVertex );
  }

  kite.register( 'Edge', Edge );

  inherit( Object, Edge, {
    /**
     * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
     * support pooling.
     * @private
     *
     * @param {Segment} segment
     * @param {Vertex} startVertex
     * @param {Vertex} endVertex
     * @returns {Edge} - This reference for chaining
     */
    initialize: function( segment, startVertex, endVertex ) {
      assert && assert( segment instanceof Segment );
      assert && assert( startVertex instanceof Vertex );
      assert && assert( endVertex instanceof Vertex );
      assert && assert( segment.start.distance( startVertex.point ) < 1e-3 );
      assert && assert( segment.end.distance( endVertex.point ) < 1e-3 );

      // @public {Segment|null} - Null when disposed (in pool)
      this.segment = segment;

      // @public {Vertex|null} - Null when disposed (in pool)
      this.startVertex = startVertex;
      this.endVertex = endVertex;

      // @public {number}
      this.signedAreaFragment = segment.getSignedAreaFragment();

      // @public {HalfEdge|null} - Null when disposed (in pool)
      this.forwardHalf = HalfEdge.createFromPool( this, false );
      this.reversedHalf = HalfEdge.createFromPool( this, true );

      // @public {boolean} - Used for depth-first search
      this.visited = false;

      // @public {*} - Available for arbitrary client usage.
      this.data = null;

      return this;
    },

    /**
     * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
     * can be reused.
     * @public
     */
    dispose: function() {
      this.segment = null;
      this.startVertex = null;
      this.endVertex = null;

      this.forwardHalf.dispose();
      this.reversedHalf.dispose();

      this.forwardHalf = null;
      this.reversedHalf = null;

      this.data = null;

      this.freeToPool();
    },

    /**
     * Returns the other vertex associated with an edge.
     * @public
     *
     * @param {Vertex} vertex
     * @returns {Vertex}
     */
    getOtherVertex: function( vertex ) {
      assert && assert( vertex === this.startVertex || vertex === this.endVertex );

      return this.startVertex === vertex ? this.endVertex : this.startVertex;
    },

    /**
     * Update possibly reversed vertex references (since they may be updated)
     * @public
     */
    updateReferences: function() {
      this.forwardHalf.updateReferences();
      this.reversedHalf.updateReferences();

      assert && assert( !( this.segment instanceof Line ) || this.startVertex !== this.endVertex,
        'No line segments for same vertices' );
    }
  } );

  Poolable.mixInto( Edge, {
    initialize: Edge.prototype.initialize
  } );

  return kite.Edge;
} );
