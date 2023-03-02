// Copyright 2017-2023, University of Colorado Boulder

/**
 * Represents a single direction/side of an Edge. There are two half-edges for each edge, representing each direction.
 * The half-edge also stores face information for the face that would be to the left of the direction of travel.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Vector2 from '../../../dot/js/Vector2.js';
import Pool from '../../../phet-core/js/Pool.js';
import { kite } from '../imports.js';

let globaId = 0;

class HalfEdge {
  /**
   * @public (kite-internal)
   *
   * NOTE: Use HalfEdge.pool.create for most usage instead of using the constructor directly.
   *
   * @param {Edge} edge
   * @param {boolean} isReversed
   */
  constructor( edge, isReversed ) {
    // @public {number}
    this.id = ++globaId;

    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( edge, isReversed );
  }

  /**
   * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
   * support pooling.
   * @private
   *
   * @param {Edge} edge
   * @param {boolean} isReversed
   * @returns {HalfEdge} - This reference for chaining
   */
  initialize( edge, isReversed ) {
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

    // @public {Vector2} - Used for vertex sorting in Vertex.js. X is angle of end tangent (shifted),
    // Y is curvature at end. See Vertex edge sort for more information.
    this.sortVector = this.sortVector || new Vector2( 0, 0 );

    // @public {*} - Available for arbitrary client usage. --- KEEP JSON
    this.data = null;

    this.updateReferences(); // Initializes vertex references

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
   * @public
   */
  dispose() {
    this.edge = null;
    this.face = null;
    this.startVertex = null;
    this.endVertex = null;
    this.data = null;
    this.freeToPool();
  }

  /**
   * Returns the next half-edge, walking around counter-clockwise as possible. Assumes edges have been sorted.
   * @public
   *
   * @param {function} [filter] - function( {Edge} ) => {boolean}. If it returns false, the edge will be skipped, and
   *                              not returned by getNext
   */
  getNext( filter ) {
    // Starting at 1, forever incrementing (we will bail out with normal conditions)
    for ( let i = 1; ; i++ ) {
      let index = this.endVertex.incidentHalfEdges.indexOf( this ) - i;
      if ( index < 0 ) {
        index += this.endVertex.incidentHalfEdges.length;
      }
      const halfEdge = this.endVertex.incidentHalfEdges[ index ].getReversed();
      if ( filter && !filter( halfEdge.edge ) ) {
        continue;
      }
      assert && assert( this.endVertex === halfEdge.startVertex );
      return halfEdge;
    }
  }

  /**
   * Update possibly reversed vertex references.
   * @private
   */
  updateReferences() {
    this.startVertex = this.isReversed ? this.edge.endVertex : this.edge.startVertex;
    this.endVertex = this.isReversed ? this.edge.startVertex : this.edge.endVertex;
    assert && assert( this.startVertex );
    assert && assert( this.endVertex );
  }

  /**
   * Returns the tangent of the edge at the end vertex (in the direction away from the vertex).
   * @public
   *
   * @returns {Vector2}
   */
  getEndTangent() {
    if ( this.isReversed ) {
      return this.edge.segment.startTangent;
    }
    else {
      return this.edge.segment.endTangent.negated();
    }
  }

  /**
   * Returns the curvature of the edge at the end vertex.
   * @public
   *
   * @returns {number}
   */
  getEndCurvature() {
    if ( this.isReversed ) {
      return -this.edge.segment.curvatureAt( 0 );
    }
    else {
      return this.edge.segment.curvatureAt( 1 );
    }
  }

  /**
   * Returns the opposite half-edge for the same edge.
   * @public
   *
   * @returns {HalfEdge}
   */
  getReversed() {
    return this.isReversed ? this.edge.forwardHalf : this.edge.reversedHalf;
  }

  /**
   * Returns a segment that starts at our startVertex and ends at our endVertex (may be reversed to accomplish that).
   * @public
   *
   * @returns {Segment}
   */
  getDirectionalSegment() {
    if ( this.isReversed ) {
      return this.edge.segment.reversed();
    }
    else {
      return this.edge.segment;
    }
  }

  // @public
  freeToPool() {
    HalfEdge.pool.freeToPool( this );
  }

  // @public
  static pool = new Pool( HalfEdge );
}

kite.register( 'HalfEdge', HalfEdge );

export default HalfEdge;