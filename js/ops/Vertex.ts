// Copyright 2017-2025, University of Colorado Boulder

/**
 * Represents a point in space that connects to edges. It stores the edges that are connected (directionally as
 * half-edges since Cubic segments can start and end at the same point/vertex), and can handle sorting edges so that
 * a half-edge's "next" half-edge (following counter-clockwise) can be determined.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Vector2, { Vector2StateObject } from '../../../dot/js/Vector2.js';
import cleanArray from '../../../phet-core/js/cleanArray.js';
import Pool from '../../../phet-core/js/Pool.js';
import kite from '../kite.js';
import { Line } from '../segments/Segment.js';
import type HalfEdge from './HalfEdge.js';
import IntentionalAny from '../../../phet-core/js/types/IntentionalAny.js';

let globalId = 0;

export type SerializedVertex = {
  type: 'Vertex';
  id: number;
  point: Vector2StateObject;
  incidentHalfEdges: number[];
  visited: boolean;
  visitIndex: number;
  lowIndex: number;
};

export default class Vertex {

  public readonly id: number = ++globalId;

  // NOTE: created in initialize. Certain things may be null when disposed (in pool)
  public point: Vector2 = Vector2.ZERO;

  // Records the half-edge that points to (ends at) this vertex.
  public incidentHalfEdges: HalfEdge[] = [];

  // Used for depth-first search
  public visited = false;

  // Visit index for bridge detection (more efficient to have inline here)
  public visitIndex = 0;

  // Low index for bridge detection (more efficient to have inline here)
  public lowIndex = 0;

  // Available for arbitrary client usage. -- Keep JSONable
  public data: IntentionalAny = null;

  // @kite-internal
  public internalData: IntentionalAny = null;

  /**
   * (kite-internal)
   *
   * NOTE: Use Vertex.pool.create for most usage instead of using the constructor directly.
   *
   * @param point - The point where the vertex should be located.
   */
  public constructor( point: Vector2 ) {
    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( point );
  }

  /**
   * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
   * support pooling.
   */
  private initialize( point: Vector2 ): this {
    this.point = point;

    cleanArray( this.incidentHalfEdges );
    this.visited = false;
    this.visitIndex = 0;
    this.lowIndex = 0;
    this.data = null;
    this.internalData = {};

    return this;
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedVertex {
    return {
      type: 'Vertex',
      id: this.id,
      point: Vector2.Vector2IO.toStateObject( this.point ),
      incidentHalfEdges: this.incidentHalfEdges.map( halfEdge => halfEdge.id ),
      visited: this.visited,
      visitIndex: this.visitIndex,
      lowIndex: this.lowIndex
    };
  }

  /**
   * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
   * can be reused.
   */
  public dispose(): void {
    this.point = Vector2.ZERO;
    cleanArray( this.incidentHalfEdges );
    this.freeToPool();
  }

  /**
   * Sorts the edges in increasing angle order.
   */
  public sortEdges(): void {
    const vectors = []; // x coordinate will be "angle", y coordinate will be curvature
    for ( let i = 0; i < this.incidentHalfEdges.length; i++ ) {
      const halfEdge = this.incidentHalfEdges[ i ];
      // NOTE: If it is expensive to precompute curvature, we could save it until edgeComparison needs it.
      vectors.push( halfEdge.sortVector.setXY( halfEdge.getEndTangent().angle, halfEdge.getEndCurvature() ) );
    }

    // "Rotate" the angles until we are sure that our "cut" (where -pi goes to pi around the circle) is at a place
    // not near any angle. This should prevent ambiguity in sorting (which can lead to bugs in the order)
    const cutoff = -Math.PI + 1e-4;
    let atCutAngle = false;
    while ( !atCutAngle ) {
      atCutAngle = true;
      for ( let i = 0; i < vectors.length; i++ ) {
        if ( vectors[ i ].x < cutoff ) {
          atCutAngle = false;
        }
      }
      if ( !atCutAngle ) {
        for ( let i = 0; i < vectors.length; i++ ) {
          const vector = vectors[ i ];
          vector.x -= 1.62594024516; // Definitely not choosing random digits by typing! (shouldn't matter)
          if ( vector.x < -Math.PI - 1e-4 ) {
            vector.x += Math.PI * 2;
          }
        }
      }
    }

    this.incidentHalfEdges.sort( Vertex.edgeComparison );
  }

  /**
   * Compare two edges for sortEdges. Should have executed that first, as it relies on information looked up in that
   * process.
   */
  public static edgeComparison( halfEdgeA: HalfEdge, halfEdgeB: HalfEdge ): number {
    const angleA = halfEdgeA.sortVector.x;
    const angleB = halfEdgeB.sortVector.x;

    // Don't allow angleA=-pi, angleB=pi (they are equivalent)
    // If our angle is very small, we need to accept it still if we have two lines (since they will have the same
    // curvature).
    if ( Math.abs( angleA - angleB ) > 1e-5 ||
         ( angleA !== angleB && ( halfEdgeA.edge.segment instanceof Line ) && ( halfEdgeB.edge.segment instanceof Line ) ) ) {
      return angleA < angleB ? -1 : 1;
    }
    else {
      const curvatureA = halfEdgeA.sortVector.y;
      const curvatureB = halfEdgeB.sortVector.y;
      if ( Math.abs( curvatureA - curvatureB ) > 1e-5 ) {
        return curvatureA < curvatureB ? 1 : -1;
      }
      else {
        const t = 1 - 1e-3;
        const curvatureAX = halfEdgeA.getDirectionalSegment().subdivided( t )[ 1 ].curvatureAt( 0 );
        const curvatureBX = halfEdgeB.getDirectionalSegment().subdivided( t )[ 1 ].curvatureAt( 0 );
        return curvatureAX < curvatureBX ? 1 : -1;
      }
    }
  }

  public freeToPool(): void {
    Vertex.pool.freeToPool( this );
  }

  public static pool = new Pool( Vertex, {
    initialize: Vertex.prototype.initialize
  } );
}

kite.register( 'Vertex', Vertex );