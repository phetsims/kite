// Copyright 2013-2015, University of Colorado Boulder

/**
 * An intersection between two different segments.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );

  /**
   * @public
   * @constructor
   *
   * @param {Vector2} point - The location of the intersection
   * @param {number} aT - The parametric value for the first segment at the location of the intersection
   * @param {number} bT - The parametric value for the second segment at the location of the intersection
   */
  function SegmentIntersection( point, aT, bT ) {
    // @public {Vector2}
    this.point = point;

    // @public {number}
    this.aT = aT;
    this.bT = bT;
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

  return SegmentIntersection;
} );
