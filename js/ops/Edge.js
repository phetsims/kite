// Copyright 2017-2020, University of Colorado Boulder

/**
 * Represents a segment in the graph (connects to vertices on both ends)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Poolable from '../../../phet-core/js/Poolable.js';
import kite from '../kite.js';
import Line from '../segments/Line.js';
import Segment from '../segments/Segment.js';
import HalfEdge from './HalfEdge.js';
import Vertex from './Vertex.js';

let globaId = 0;

class Edge {
  /**
   * @public (kite-internal)
   *
   * NOTE: Use Edge.createFromPool for most usage instead of using the constructor directly.
   *
   * @param {Segment} segment
   * @param {Vertex} startVertex
   * @param {Vertex} endVertex
   */
  constructor( segment, startVertex, endVertex ) {
    // @public {number}
    this.id = ++globaId;

    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( segment, startVertex, endVertex );
  }

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
  initialize( segment, startVertex, endVertex ) {
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
  }

  /**
   * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
   * can be reused.
   * @public
   */
  dispose() {
    this.segment = null;
    this.startVertex = null;
    this.endVertex = null;

    this.forwardHalf.dispose();
    this.reversedHalf.dispose();

    this.forwardHalf = null;
    this.reversedHalf = null;

    this.data = null;

    this.freeToPool();
  }

  /**
   * Returns the other vertex associated with an edge.
   * @public
   *
   * @param {Vertex} vertex
   * @returns {Vertex}
   */
  getOtherVertex( vertex ) {
    assert && assert( vertex === this.startVertex || vertex === this.endVertex );

    return this.startVertex === vertex ? this.endVertex : this.startVertex;
  }

  /**
   * Update possibly reversed vertex references (since they may be updated)
   * @public
   */
  updateReferences() {
    this.forwardHalf.updateReferences();
    this.reversedHalf.updateReferences();

    assert && assert( !( this.segment instanceof Line ) || this.startVertex !== this.endVertex,
      'No line segments for same vertices' );
  }
}

kite.register( 'Edge', Edge );

Poolable.mixInto( Edge );

export default Edge;