// Copyright 2017-2025, University of Colorado Boulder

/**
 * Represents a segment in the graph (connects to vertices on both ends)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Pool, { TPoolable } from '../../../phet-core/js/Pool.js';
import HalfEdge, { SerializedHalfEdge } from './HalfEdge.js';
import kite from '../kite.js';
import Segment, { Line, SerializedSegment } from '../segments/Segment.js';
import Vertex from './Vertex.js';
import IntentionalAny from '../../../phet-core/js/types/IntentionalAny.js';

let globalId = 0;

export type SerializedEdge = {
  type: 'Edge';
  id: number;
  segment: SerializedSegment;
  startVertex: number | null;
  endVertex: number | null;
  signedAreaFragment: number;
  forwardHalf: SerializedHalfEdge;
  reversedHalf: SerializedHalfEdge;
  visited: boolean;
  data: IntentionalAny;
};

export default class Edge implements TPoolable {

  public readonly id: number = ++globalId;

  // Set in initialize, will be null when disposed (in pool)
  public segment: Segment = null as unknown as Segment;
  public startVertex: Vertex = null as unknown as Vertex;
  public endVertex: Vertex = null as unknown as Vertex;

  public signedAreaFragment = 0;
  public forwardHalf: HalfEdge = null as unknown as HalfEdge;
  public reversedHalf: HalfEdge = null as unknown as HalfEdge;

  // Used for depth-first search
  public visited = false;

  // Available for arbitrary client usage. -- Keep JSONable
  public data: IntentionalAny = null;

  // @kite-internal
  public internalData: IntentionalAny = null;

  /**
   * (kite-internal)
   *
   * NOTE: Use Edge.pool.create for most usage instead of using the constructor directly.
   */
  public constructor( segment: Segment, startVertex: Vertex, endVertex: Vertex ) {
    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( segment, startVertex, endVertex );
  }

  /**
   * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
   * support pooling.
   */
  private initialize( segment: Segment, startVertex: Vertex, endVertex: Vertex ): this {
    assert && assert( segment.start.distance( startVertex.point ) < 1e-3 );
    assert && assert( segment.end.distance( endVertex.point ) < 1e-3 );

    this.segment = segment;
    this.startVertex = startVertex;
    this.endVertex = endVertex;
    this.signedAreaFragment = segment.getSignedAreaFragment();
    this.forwardHalf = HalfEdge.pool.create( this, false );
    this.reversedHalf = HalfEdge.pool.create( this, true );
    this.visited = false;
    this.data = null;
    this.internalData = {};

    return this;
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedEdge {
    return {
      type: 'Edge',
      id: this.id,
      segment: this.segment.serialize(),
      startVertex: this.startVertex === null ? null : this.startVertex.id,
      endVertex: this.endVertex === null ? null : this.endVertex.id,
      signedAreaFragment: this.signedAreaFragment,
      forwardHalf: this.forwardHalf.serialize(),
      reversedHalf: this.reversedHalf.serialize(),
      visited: this.visited,
      data: this.data
    };
  }

  /**
   * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
   * can be reused.
   */
  public dispose(): void {
    this.segment = null as unknown as Segment;
    this.startVertex = null as unknown as Vertex;
    this.endVertex = null as unknown as Vertex;

    this.forwardHalf.dispose();
    this.reversedHalf.dispose();

    this.forwardHalf = null as unknown as HalfEdge;
    this.reversedHalf = null as unknown as HalfEdge;

    this.data = null;

    this.freeToPool();
  }

  /**
   * Returns the other vertex associated with an edge.
   */
  public getOtherVertex( vertex: Vertex ): Vertex {
    assert && assert( vertex === this.startVertex || vertex === this.endVertex );

    return this.startVertex === vertex ? this.endVertex : this.startVertex;
  }

  /**
   * Update possibly reversed vertex references (since they may be updated)
   */
  public updateReferences(): void {
    this.forwardHalf.updateReferences();
    this.reversedHalf.updateReferences();

    assert && assert( !( this.segment instanceof Line ) || this.startVertex !== this.endVertex,
      'No line segments for same vertices' );
  }

  public freeToPool(): void {
    Edge.pool.freeToPool( this );
  }

  public static pool = new Pool( Edge, {
    initialize: Edge.prototype.initialize
  } );
}

kite.register( 'Edge', Edge );