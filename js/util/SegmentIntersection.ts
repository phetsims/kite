// Copyright 2017-2022, University of Colorado Boulder

/**
 * An intersection between two different segments.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Utils from '../../../dot/js/Utils.js';
import Vector2 from '../../../dot/js/Vector2.js';
import { kite } from '../imports.js';

export default class SegmentIntersection {

  point: Vector2;
  aT: number;
  bT: number;

  /**
   * @param point - The location of the intersection
   * @param aT - The parametric value for the first segment at the location of the intersection
   * @param bT - The parametric value for the second segment at the location of the intersection
   */
  constructor( point: Vector2, aT: number, bT: number ) {
    assert && assert( point instanceof Vector2, 'invalid point' );
    assert && assert( typeof aT === 'number' && aT >= -1e-10 && aT <= 1 + 1e-10, 'aT out of range' );
    assert && assert( typeof bT === 'number' && bT >= -1e-10 && bT <= 1 + 1e-10, 'bT out of range' );

    this.point = point;

    // Clamped in case it's slightly out-of-range
    this.aT = Utils.clamp( aT, 0, 1 );
    this.bT = Utils.clamp( bT, 0, 1 );
  }

  /**
   * Returns the intersection with a and b swapped.
   */
  getSwapped(): SegmentIntersection {
    return new SegmentIntersection( this.point, this.bT, this.aT );
  }
}

kite.register( 'SegmentIntersection', SegmentIntersection );