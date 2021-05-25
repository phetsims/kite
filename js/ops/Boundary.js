// Copyright 2017-2021, University of Colorado Boulder

/**
 * A boundary is a loop of directed half-edges that always follow in the tightest counter-clockwise direction around
 * vertices.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Bounds2 from '../../../dot/js/Bounds2.js';
import Ray2 from '../../../dot/js/Ray2.js';
import Vector2 from '../../../dot/js/Vector2.js';
import Poolable from '../../../phet-core/js/Poolable.js';
import cleanArray from '../../../phet-core/js/cleanArray.js';
import kite from '../kite.js';
import Subpath from '../util/Subpath.js';

let globaId = 0;

class Boundary {
  /**
   * @public (kite-internal)
   *
   * NOTE: Use Boundary.createFromPool for most usage instead of using the constructor directly.
   *
   * @param {Array.<HalfEdge>} halfEdges
   */
  constructor( halfEdges ) {
    // @public {number}
    this.id = ++globaId;

    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( halfEdges );
  }

  /**
   * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
   * support pooling.
   * @private
   *
   * @param {Array.<HalfEdge>} halfEdges
   * @returns {Boundary} - This reference for chaining
   */
  initialize( halfEdges ) {
    // @public {Array.<HalfEdge>}
    this.halfEdges = halfEdges;

    // @public {number}
    this.signedArea = this.computeSignedArea();

    // @public {Bounds2}
    this.bounds = this.computeBounds();

    // @public {Boundary}
    this.childBoundaries = cleanArray( this.childBoundaries );

    return this;
  }

  /**
   * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
   * can be reused.
   * @public
   */
  dispose() {
    this.halfEdges = [];
    cleanArray( this.childBoundaries );
    this.freeToPool();
  }

  /**
   * Returns whether this boundary is essentially "counter-clockwise" (in the non-reversed coordinate system) with
   * positive signed area, or "clockwise" with negative signed area.
   * @public
   *
   * Boundaries are treated as "inner" boundaries when they are counter-clockwise, as the path followed will generally
   * follow the inside of a face (given how the "next" edge of a vertex is computed).
   *
   * @returns {number}
   */
  isInner() {
    return this.signedArea > 0;
  }

  /**
   * Returns the signed area of this boundary, given its half edges.
   * @public
   *
   * Each half-edge has its own contribution to the signed area, which are summed together.
   *
   * @returns {number}
   */
  computeSignedArea() {
    let signedArea = 0;
    for ( let i = 0; i < this.halfEdges.length; i++ ) {
      signedArea += this.halfEdges[ i ].signedAreaFragment;
    }
    return signedArea;
  }

  /**
   * Returns the bounds of the boundary (the union of each of the boundary's segments' bounds).
   * @public
   *
   * @returns {Bounds2}
   */
  computeBounds() {
    const bounds = Bounds2.NOTHING.copy();

    for ( let i = 0; i < this.halfEdges.length; i++ ) {
      bounds.includeBounds( this.halfEdges[ i ].edge.segment.getBounds() );
    }
    return bounds;
  }

  /**
   * Returns a point on the boundary which, when the shape (and point) are transformed with the given transform, would
   * be a point with the minimal y value.
   * @public
   *
   * Will only return one point, even if there are multiple points that have the same minimal y values for the
   * boundary. The point may be at the end of one of the edges/segments (at a vertex), but also may somewhere in the
   * middle of an edge/segment.
   *
   * @param {Transform3} transform - Transform used because we want the inverse also.
   * @returns {Vector2}
   */
  computeExtremePoint( transform ) {
    assert && assert( this.halfEdges.length > 0, 'There is no extreme point if we have no edges' );

    // Transform all of the segments into the new transformed coordinate space.
    const transformedSegments = [];
    for ( let i = 0; i < this.halfEdges.length; i++ ) {
      transformedSegments.push( this.halfEdges[ i ].edge.segment.transformed( transform.getMatrix() ) );
    }

    // Find the bounds of the entire transformed boundary
    const transformedBounds = Bounds2.NOTHING.copy();
    for ( let i = 0; i < transformedSegments.length; i++ ) {
      transformedBounds.includeBounds( transformedSegments[ i ].getBounds() );
    }

    for ( let i = 0; i < transformedSegments.length; i++ ) {
      const segment = transformedSegments[ i ];

      // See if this is one of our potential segments whose bounds have the minimal y value. This indicates at least
      // one point on this segment will be a minimal-y point.
      if ( segment.getBounds().top === transformedBounds.top ) {
        // Pick a point with values that guarantees any point will have a smaller y value.
        let minimalPoint = new Vector2( 0, Number.POSITIVE_INFINITY );

        // Grab parametric t-values for where our segment has extreme points, and adds the end points (which are
        // candidates). One of the points at these values should be our minimal point.
        const tValues = [ 0, 1 ].concat( segment.getInteriorExtremaTs() );
        for ( let j = 0; j < tValues.length; j++ ) {
          const point = segment.positionAt( tValues[ j ] );
          if ( point.y < minimalPoint.y ) {
            minimalPoint = point;
          }
        }

        // Transform this minimal point back into our (non-transformed) boundary's coordinate space.
        return transform.inversePosition2( minimalPoint );
      }
    }

    throw new Error( 'Should not reach here if we have segments' );
  }

  /**
   * Returns a ray (position and direction) pointing away from our boundary at an "extreme" point, so that the ray
   * will be guaranteed not to intersect this boundary.
   * @public
   *
   * The ray's position will be slightly offset from the boundary, so that it will not technically intersect the
   * boundary where the extreme point lies. The extreme point will be chosen such that it would have the smallest
   * y value when the boundary is transformed by the given transformation.
   *
   * The ray's direction will be such that if the ray is transformed by the given transform, it will be pointing
   * in the negative-y direction (e.g. a vector of (0,-1)). This should guarantee it is facing away from the
   * boundary, and will be consistent in direction with other extreme rays (needed for its use case with the
   * boundary graph).
   *
   * @param {Transform3} transform
   * @returns {Ray2}
   */
  computeExtremeRay( transform ) {
    const extremePoint = this.computeExtremePoint( transform );
    const orientation = transform.inverseDelta2( new Vector2( 0, -1 ) ).normalized();
    return new Ray2( extremePoint.plus( orientation.timesScalar( 1e-4 ) ), orientation );
  }

  /**
   * Returns whether this boundary includes the specified half-edge.
   * @public
   *
   * @param {HalfEdge} halfEdge
   * @returns {boolean}
   */
  hasHalfEdge( halfEdge ) {
    for ( let i = 0; i < this.halfEdges.length; i++ ) {
      if ( this.halfEdges[ i ] === halfEdge ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Converts this boundary to a Subpath, so that we can construct things like Shape objects from it.
   * @public
   *
   * @returns {Subpath}
   */
  toSubpath() {
    const segments = [];
    for ( let i = 0; i < this.halfEdges.length; i++ ) {
      segments.push( this.halfEdges[ i ].getDirectionalSegment() );
    }
    return new Subpath( segments, null, true );
  }
}

kite.register( 'Boundary', Boundary );

Poolable.mixInto( Boundary );

export default Boundary;