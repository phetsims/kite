// Copyright 2017-2025, University of Colorado Boulder

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

import cleanArray from '../../../phet-core/js/cleanArray.js';
import Pool, { TPoolable } from '../../../phet-core/js/Pool.js';
import kite from '../kite.js';
import type HalfEdge from './HalfEdge.js';

let globalId = 0;

export type SerializedLoop = {
  type: 'Loop';
  id: number;
  shapeId: number;
  closed: boolean;
  halfEdges: number[];
};

export default class Loop implements TPoolable {

  public readonly id: number = ++globalId;

  // Set in initialize
  public shapeId = 0;
  public closed = false;
  public halfEdges: HalfEdge[] = [];

  /**
   * (kite-internal)
   *
   * NOTE: Use Loop.pool.create for most usage instead of using the constructor directly.
   */
  public constructor( shapeId: number, closed: boolean ) {
    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( shapeId, closed );
  }

  /**
   * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
   * support pooling.
   */
  private initialize( shapeId: number, closed: boolean ): this {
    this.shapeId = shapeId;
    this.closed = closed;
    cleanArray( this.halfEdges );

    return this;
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedLoop {
    return {
      type: 'Loop',
      id: this.id,
      shapeId: this.shapeId,
      closed: this.closed,
      halfEdges: this.halfEdges.map( halfEdge => halfEdge.id )
    };
  }

  /**
   * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
   * can be reused.
   */
  public dispose(): void {
    cleanArray( this.halfEdges );
    this.freeToPool();
  }

  public freeToPool(): void {
    Loop.pool.freeToPool( this );
  }

  public static pool = new Pool( Loop, {
    initialize: Loop.prototype.initialize
  } );
}

kite.register( 'Loop', Loop );