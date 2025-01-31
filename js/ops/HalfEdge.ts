// Copyright 2017-2025, University of Colorado Boulder

/**
 * Represents a single direction/side of an Edge. There are two half-edges for each edge, representing each direction.
 * The half-edge also stores face information for the face that would be to the left of the direction of travel.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Vector2, { Vector2StateObject } from '../../../dot/js/Vector2.js';
import Pool from '../../../phet-core/js/Pool.js';
import kite from '../kite.js';
import type Edge from './Edge.js';
import type Face from './Face.js';
import type Vertex from './Vertex.js';
import IntentionalAny from '../../../phet-core/js/types/IntentionalAny.js';
import type Segment from '../segments/Segment.js';

let globalId = 0;

export type SerializedHalfEdge = {
  type: 'HalfEdge';
  id: number;
  edge: number;
  face: number | null;
  isReversed: boolean;
  signedAreaFragment: number;
  startVertex: number | null;
  endVertex: number | null;
  sortVector: Vector2StateObject;
  data: IntentionalAny;
};

export default class HalfEdge {

  public readonly id: number = ++globalId;

  // Set in initialize, will be null when disposed (in pool)
  public edge: Edge = null as unknown as Edge;
  public face: Face | null = null;
  public isReversed = false;
  public signedAreaFragment = 0;
  public startVertex: Vertex | null = null;
  public endVertex: Vertex | null = null;

  // Used for vertex sorting in Vertex.js. X is angle of end tangent (shifted),
  // Y is curvature at end. See Vertex edge sort for more information.
  public sortVector: Vector2 = new Vector2( 0, 0 );

  // Available for arbitrary client usage. -- Keep JSONable
  public data: IntentionalAny = null;

  /**
   * (kite-internal)
   *
   * NOTE: Use HalfEdge.pool.create for most usage instead of using the constructor directly.
   */
  public constructor( edge: Edge, isReversed: boolean ) {
    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( edge, isReversed );
  }

  /**
   * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
   * support pooling.
   */
  private initialize( edge: Edge, isReversed: boolean ): this {
    this.edge = edge;
    this.face = null; // Filled in later, contains a face reference
    this.isReversed = isReversed;
    this.signedAreaFragment = edge.signedAreaFragment * ( isReversed ? -1 : 1 );
    this.startVertex = null;
    this.endVertex = null;
    this.data = null;

    this.updateReferences(); // Initializes vertex references

    return this;
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedHalfEdge {
    return {
      type: 'HalfEdge',
      id: this.id,
      edge: this.edge.id,
      face: this.face === null ? null : this.face.id,
      isReversed: this.isReversed,
      signedAreaFragment: this.signedAreaFragment,
      startVertex: this.startVertex === null ? null : this.startVertex.id,
      endVertex: this.endVertex === null ? null : this.endVertex.id,
      sortVector: Vector2.Vector2IO.toStateObject( this.sortVector ),
      data: this.data
    };
  }

  /**
   * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
   * can be reused.
   */
  public dispose(): void {
    this.edge = null as unknown as Edge;
    this.face = null;
    this.startVertex = null;
    this.endVertex = null;
    this.data = null;
    this.freeToPool();
  }

  /**
   * Returns the next half-edge, walking around counter-clockwise as possible. Assumes edges have been sorted.
   *
   * @param [filter] - If it returns false, the edge will be skipped, and not returned by getNext
   */
  public getNext( filter?: ( edge: Edge ) => boolean ): HalfEdge {
    // Starting at 1, forever incrementing (we will bail out with normal conditions)
    for ( let i = 1; ; i++ ) {
      let index = this.endVertex!.incidentHalfEdges.indexOf( this ) - i;
      if ( index < 0 ) {
        index += this.endVertex!.incidentHalfEdges.length;
      }
      const halfEdge = this.endVertex!.incidentHalfEdges[ index ].getReversed();
      if ( filter && !filter( halfEdge.edge ) ) {
        continue;
      }
      assert && assert( this.endVertex === halfEdge.startVertex );
      return halfEdge;
    }
  }

  /**
   * Update possibly reversed vertex references.
   * (kite-internal)
   */
  public updateReferences(): void {
    this.startVertex = this.isReversed ? this.edge.endVertex : this.edge.startVertex;
    this.endVertex = this.isReversed ? this.edge.startVertex : this.edge.endVertex;
    assert && assert( this.startVertex );
    assert && assert( this.endVertex );
  }

  /**
   * Returns the tangent of the edge at the end vertex (in the direction away from the vertex).
   */
  public getEndTangent(): Vector2 {
    if ( this.isReversed ) {
      return this.edge.segment.startTangent;
    }
    else {
      return this.edge.segment.endTangent.negated();
    }
  }

  /**
   * Returns the curvature of the edge at the end vertex.
   */
  public getEndCurvature(): number {
    if ( this.isReversed ) {
      return -this.edge.segment.curvatureAt( 0 );
    }
    else {
      return this.edge.segment.curvatureAt( 1 );
    }
  }

  /**
   * Returns the opposite half-edge for the same edge.
   */
  public getReversed(): HalfEdge {
    return this.isReversed ? this.edge.forwardHalf : this.edge.reversedHalf;
  }

  /**
   * Returns a segment that starts at our startVertex and ends at our endVertex (may be reversed to accomplish that).
   */
  public getDirectionalSegment(): Segment {
    if ( this.isReversed ) {
      return this.edge.segment.reversed();
    }
    else {
      return this.edge.segment;
    }
  }

  public freeToPool(): void {
    HalfEdge.pool.freeToPool( this );
  }

  public static pool = new Pool( HalfEdge, {
    initialize: HalfEdge.prototype.initialize
  } );
}

kite.register( 'HalfEdge', HalfEdge );