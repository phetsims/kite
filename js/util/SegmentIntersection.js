// Copyright 2017-2020, University of Colorado Boulder

/**
 * An intersection between two different segments.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Utils from '../../../dot/js/Utils.js';
import Vector2 from '../../../dot/js/Vector2.js';
import inherit from '../../../phet-core/js/inherit.js';
import kite from '../kite.js';

/**
 * @public
 * @constructor
 *
 * @param {Vector2} point - The location of the intersection
 * @param {number} aT - The parametric value for the first segment at the location of the intersection
 * @param {number} bT - The parametric value for the second segment at the location of the intersection
 */
function SegmentIntersection( point, aT, bT ) {
  assert && assert( point instanceof Vector2, 'invalid point' );
  assert && assert( typeof aT === 'number' && aT >= -1e-10 && aT <= 1 + 1e-10, 'aT out of range' );
  assert && assert( typeof bT === 'number' && bT >= -1e-10 && bT <= 1 + 1e-10, 'bT out of range' );

  // @public {Vector2}
  this.point = point;

  // @public {number} - Clamped in case it's slightly out-of-range
  this.aT = Utils.clamp( aT, 0, 1 );
  this.bT = Utils.clamp( bT, 0, 1 );
}

kite.register( 'SegmentIntersection', SegmentIntersection );

inherit( Object, SegmentIntersection, {
  /**
   * Returns the intersection with a and b swapped.
   * @public
   *
   * @returns {SegmentIntersection}
   */
  getSwapped: function() {
    return new SegmentIntersection( this.point, this.bT, this.aT );
  }
} );

export default SegmentIntersection;