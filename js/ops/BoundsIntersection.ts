// Copyright 2017-2023, University of Colorado Boulder

/**
 * A region of two segments that intersects (contains static functions for segment intersection).
 *
 * BoundsIntersection.intersect( a, b ) should be used for most general intersection routines as a fallback.
 * Other segment-specific routines may be much faster.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Vector2 from '../../../dot/js/Vector2.js';
import Pool from '../../../phet-core/js/Pool.js';
import { kite, Segment, SegmentIntersection } from '../imports.js';

type ActiveBoundsIntersection = {
  [ PropertyName in keyof BoundsIntersection ]: BoundsIntersection[PropertyName] extends ( infer T | null ) ? T : BoundsIntersection[PropertyName];
};

export default class BoundsIntersection {

  // Null if cleaned of references
  public a!: Segment | null;
  public b!: Segment | null;

  public atMin!: number;
  public atMax!: number;
  public btMin!: number;
  public btMax!: number;

  // Null if cleaned of references
  public aMin!: Vector2 | null;
  public aMax!: Vector2 | null;
  public bMin!: Vector2 | null;
  public bMax!: Vector2 | null;

  /**
   * @param a
   * @param b
   * @param atMin - Lower t value for the region of the 'a' segment
   * @param atMax - Higher t value for the region of the 'a' segment
   * @param btMin - Lower t value for the region of the 'b' segment
   * @param btMax - Higher t value for the region of the 'b' segment
   * @param aMin - Location of the lower t value for the 'a' segment's region
   * @param aMax - Location of the higher t value for the 'a' segment's region
   * @param bMin - Location of the lower t value for the 'b' segment's region
   * @param bMax - Location of the higher t value for the 'b' segment's region
   */
  public constructor( a: Segment, b: Segment, atMin: number, atMax: number, btMin: number, btMax: number, aMin: Vector2, aMax: Vector2, bMin: Vector2, bMax: Vector2 ) {
    this.initialize( a, b, atMin, atMax, btMin, btMax, aMin, aMax, bMin, bMax );
  }

  /**
   * @param a
   * @param b
   * @param atMin - Lower t value for the region of the 'a' segment
   * @param atMax - Higher t value for the region of the 'a' segment
   * @param btMin - Lower t value for the region of the 'b' segment
   * @param btMax - Higher t value for the region of the 'b' segment
   * @param aMin - Location of the lower t value for the 'a' segment's region
   * @param aMax - Location of the higher t value for the 'a' segment's region
   * @param bMin - Location of the lower t value for the 'b' segment's region
   * @param bMax - Location of the higher t value for the 'b' segment's region
   * @returns -  This reference for chaining
   */
  public initialize( a: Segment, b: Segment, atMin: number, atMax: number, btMin: number, btMax: number, aMin: Vector2, aMax: Vector2, bMin: Vector2, bMax: Vector2 ): BoundsIntersection {

    this.a = a;
    this.b = b;
    this.atMin = atMin;
    this.atMax = atMax;
    this.btMin = btMin;
    this.btMax = btMax;
    this.aMin = aMin;
    this.aMax = aMax;
    this.bMin = bMin;
    this.bMax = bMax;

    return this as unknown as BoundsIntersection;
  }

  /**
   * Handles subdivision of the regions into 2 for the 'a' segment and 2 for the 'b' segment, then pushes any
   * intersecting bounding box regions (between 'a' and 'b') to the array.
   */
  private pushSubdivisions( intersections: BoundsIntersection[] ): void {

    // We are not in the pool, so our things aren't null
    const thisActive = this as unknown as ActiveBoundsIntersection;

    const atMid = ( thisActive.atMax + thisActive.atMin ) / 2;
    const btMid = ( thisActive.btMax + thisActive.btMin ) / 2;

    // If we reached the point where no higher precision can be obtained, return the given intersection
    if ( atMid === this.atMin || atMid === this.atMax || btMid === this.btMin || btMid === this.btMax ) {
      intersections.push( this as unknown as BoundsIntersection );
      return;
    }
    const aMid = thisActive.a.positionAt( atMid );
    const bMid = thisActive.b.positionAt( btMid );

    if ( BoundsIntersection.boxIntersects( thisActive.aMin, aMid, thisActive.bMin, bMid ) ) {
      intersections.push( BoundsIntersection.pool.create(
        thisActive.a, thisActive.b, thisActive.atMin, atMid, thisActive.btMin, btMid, thisActive.aMin, aMid, thisActive.bMin, bMid
      ) );
    }
    if ( BoundsIntersection.boxIntersects( aMid, thisActive.aMax, thisActive.bMin, bMid ) ) {
      intersections.push( BoundsIntersection.pool.create(
        thisActive.a, thisActive.b, atMid, thisActive.atMax, thisActive.btMin, btMid, aMid, thisActive.aMax, thisActive.bMin, bMid
      ) );
    }
    if ( BoundsIntersection.boxIntersects( thisActive.aMin, aMid, bMid, thisActive.bMax ) ) {
      intersections.push( BoundsIntersection.pool.create(
        thisActive.a, thisActive.b, thisActive.atMin, atMid, btMid, thisActive.btMax, thisActive.aMin, aMid, bMid, thisActive.bMax
      ) );
    }
    if ( BoundsIntersection.boxIntersects( aMid, thisActive.aMax, bMid, thisActive.bMax ) ) {
      intersections.push( BoundsIntersection.pool.create(
        thisActive.a, thisActive.b, atMid, thisActive.atMax, btMid, thisActive.btMax, aMid, thisActive.aMax, bMid, thisActive.bMax
      ) );
    }

    ( this as unknown as BoundsIntersection ).freeToPool();
  }

  /**
   * A measure of distance between this and another intersection.
   */
  public distance( otherIntersection: BoundsIntersection ): number {
    const daMin = this.atMin - otherIntersection.atMin;
    const daMax = this.atMax - otherIntersection.atMax;
    const dbMin = this.btMin - otherIntersection.btMin;
    const dbMax = this.btMax - otherIntersection.btMax;
    return daMin * daMin + daMax * daMax + dbMin * dbMin + dbMax * dbMax;
  }

  /**
   * Removes references (so it can allow other objects to be GC'ed or pooled)
   */
  public clean(): void {
    this.a = null;
    this.b = null;
    this.aMin = null;
    this.aMax = null;
    this.bMin = null;
    this.bMax = null;
  }

  /**
   * Determine (finite) points of intersection between two arbitrary segments.
   *
   * Does repeated subdivision and excludes a-b region pairs that don't intersect. Doing this repeatedly narrows down
   * intersections, to the point that they can be combined for a fairly accurate answer.
   */
  public static intersect( a: Segment, b: Segment ): SegmentIntersection[] {
    if ( !a.bounds.intersectsBounds( b.bounds ) ) {
      return [];
    }

    const intersections = BoundsIntersection.getIntersectionRanges( a, b );

    // Group together intersections that are very close (in parametric value space) so we can only return
    // one intersection (averaged value) for them.
    const groups = [];

    // NOTE: Doesn't have to be the fastest, won't be a crazy huge amount of these unless something went
    //       seriously wrong (degenerate case?)
    for ( let i = 0; i < intersections.length; i++ ) {
      const intersection = intersections[ i ];
      let wasAdded = false;
      nextComparison: // eslint-disable-line no-labels
        for ( let j = 0; j < groups.length; j++ ) {
          const group = groups[ j ];
          for ( let k = 0; k < group.length; k++ ) {
            const otherIntersection = group[ k ];
            if ( intersection.distance( otherIntersection ) < 1e-13 ) {
              group.push( intersection );
              wasAdded = true;
              break nextComparison; // eslint-disable-line no-labels
            }
          }
        }
      if ( !wasAdded ) {
        groups.push( [ intersection ] );
      }
    }

    const results: SegmentIntersection[] = [];

    // For each group, average its parametric values, and create a "result intersection" from it.
    for ( let i = 0; i < groups.length; i++ ) {
      const group = groups[ i ];

      let aT = 0;
      let bT = 0;
      for ( let j = 0; j < group.length; j++ ) {
        aT += group[ j ].atMin + group[ j ].atMax;
        bT += group[ j ].btMin + group[ j ].btMax;
      }
      aT /= 2 * group.length;
      bT /= 2 * group.length;

      const positionA = a.positionAt( aT );
      const positionB = b.positionAt( bT );
      assert && assert( positionA.distance( positionB ) < 1e-10 );

      results.push( new SegmentIntersection( positionA.average( positionB ), aT, bT ) );
    }

    // Clean up
    for ( let i = 0; i < intersections.length; i++ ) {
      intersections[ i ].freeToPool();
    }
    BoundsIntersection.cleanPool();

    return results;
  }

  /**
   * Given two segments, returns an array of candidate intersection ranges.
   */
  private static getIntersectionRanges( a: Segment, b: Segment ): BoundsIntersection[] {
    // Internal t-values that have a local min/max in at least one coordinate. We'll split based on these, so we only
    // check intersections between monotone segments (won't have to check self-intersection).
    const aExtrema = a.getInteriorExtremaTs();
    const bExtrema = b.getInteriorExtremaTs();

    // T-value pairs
    const aInternals = _.zip( [ 0 ].concat( aExtrema ), aExtrema.concat( [ 1 ] ) );
    const bInternals = _.zip( [ 0 ].concat( bExtrema ), bExtrema.concat( [ 1 ] ) );

    // Set up initial candidate intersection ranges
    let intersections = [];
    for ( let i = 0; i < aInternals.length; i++ ) {
      for ( let j = 0; j < bInternals.length; j++ ) {
        const atMin = aInternals[ i ][ 0 ]!;
        const atMax = aInternals[ i ][ 1 ]!;
        const btMin = bInternals[ j ][ 0 ]!;
        const btMax = bInternals[ j ][ 1 ]!;
        const aMin = a.positionAt( atMin );
        const aMax = a.positionAt( atMax );
        const bMin = b.positionAt( btMin );
        const bMax = b.positionAt( btMax );
        if ( BoundsIntersection.boxIntersects( aMin, aMax, bMin, bMax ) ) {
          intersections.push( BoundsIntersection.pool.create(
            a, b, atMin, atMax, btMin, btMax, aMin, aMax, bMin, bMax
          ) );
        }
      }
    }

    // Subdivide continuously
    // TODO: is 50 the proper number of iterations?
    for ( let i = 0; i < 50; i++ ) {
      const newIntersections: BoundsIntersection[] = [];
      for ( let j = intersections.length - 1; j >= 0; j-- ) {
        intersections[ j ].pushSubdivisions( newIntersections );
      }
      intersections = newIntersections;
    }

    return intersections;
  }

  /**
   * Given the endpoints of two monotone segment regions, returns whether their bounding boxes intersect.
   */
  private static boxIntersects( aMin: Vector2, aMax: Vector2, bMin: Vector2, bMax: Vector2 ): boolean {

    // e.g. Bounds2.includeBounds
    const minX = Math.max( Math.min( aMin.x, aMax.x ), Math.min( bMin.x, bMax.x ) );
    const minY = Math.max( Math.min( aMin.y, aMax.y ), Math.min( bMin.y, bMax.y ) );
    const maxX = Math.min( Math.max( aMin.x, aMax.x ), Math.max( bMin.x, bMax.x ) );
    const maxY = Math.min( Math.max( aMin.y, aMax.y ), Math.max( bMin.y, bMax.y ) );
    return ( maxX - minX ) >= 0 && ( maxY - minY >= 0 );
  }

  /**
   * Since we'll burn through a lot of pooled instances, we only remove external references fully once the full
   * process is done.
   */
  private static cleanPool(): void {
    BoundsIntersection.pool.forEach( intersection => intersection.clean() );
  }

  public freeToPool(): void {
    BoundsIntersection.pool.freeToPool( this );
  }

  public static readonly pool = new Pool( BoundsIntersection );
}

kite.register( 'BoundsIntersection', BoundsIntersection );
