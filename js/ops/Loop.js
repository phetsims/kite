// Copyright 2017-2023, University of Colorado Boulder

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
import Pool from '../../../phet-core/js/Pool.js';
import { kite, Subpath } from '../imports.js';

let globaId = 0;

class Loop {
  /**
   * @public (kite-internal)
   *
   * NOTE: Use Loop.pool.create for most usage instead of using the constructor directly.
   *
   * @param {number} shapeId
   * @param {boolean} closed
   */
  constructor( shapeId, closed ) {
    // @public {number}
    this.id = ++globaId;

    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( shapeId, closed );
  }

  /**
   * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
   * support pooling.
   * @private
   *
   * @param {number} shapeId
   * @param {boolean} closed
   * @returns {Loop} - This reference for chaining
   */
  initialize( shapeId, closed ) {
    assert && assert( typeof shapeId === 'number' );
    assert && assert( typeof closed === 'boolean' );

    // @public {number}
    this.shapeId = shapeId;

    // @public {boolean}
    this.closed = closed;

    // @public {Array.<HalfEdge>}
    this.halfEdges = cleanArray( this.halfEdges );

    return this;
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   * @public
   *
   * @returns {Object}
   */
  serialize() {
    return {
      type: 'Loop',
      id: this.id,
      shapeId: this.shapeId,
      closed: this.closed,
      halfEdges: this.halfEdges.map( halfEdge => halfEdge.id )
    };
  }

  /**
   * Returns a Subpath equivalent to this loop.
   * @public
   *
   * @returns {Subpath}
   */
  toSubpath() {
    const segments = [];
    for ( let i = 0; i < this.halfEdges.length; i++ ) {
      segments.push( this.halfEdges[ i ].getDirectionalSegment() );
    }
    return new Subpath( segments, undefined, this.closed );
  }

  /**
   * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
   * can be reused.
   * @public
   */
  dispose() {
    cleanArray( this.halfEdges );
    this.freeToPool();
  }

  // @public
  freeToPool() {
    Loop.pool.freeToPool( this );
  }

  // @public
  static pool = new Pool( Loop );
}

kite.register( 'Loop', Loop );

export default Loop;