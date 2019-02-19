// Copyright 2013-2015, University of Colorado Boulder

/**
 * An intersection between a ray and a segment.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Util = require( 'DOT/Util' );
  var Vector2 = require( 'DOT/Vector2' );

  /**
   * @public
   * @constructor
   *
   * @param {number} distance - The distance between the ray's position and the point of intersection
   * @param {Vector2} point - The location of the intersection
   * @param {Vector2} normal - The normal (unit vector perpendicular to the segment at the location) at the
   *                           intersection, such that the dot product between the normal and ray direction is <= 0.
   * @param {number} wind - The winding number for the intersection. Either 1 or -1, depending on the direction the
   *                        segment goes relative to the ray (to the left or right). Used for computing Shape
   *                        intersection via the non-zero fill rule.
   * @param {number} t - Parametric value (for the segment) of the intersection
   */
  function RayIntersection( distance, point, normal, wind, t ) {
    assert && assert( typeof distance === 'number' && isFinite( distance ) && distance >= 0, 'invalid distance' );
    assert && assert( point instanceof Vector2, 'invalid point' );
    assert && assert( normal instanceof Vector2 && Math.abs( normal.magnitude - 1 ) < 1e-7, 'invalid normal' );
    assert && assert( typeof wind === 'number' );
    assert && assert( typeof t === 'number' && t >= -1e-10 && t <= 1 + 1e-10, 't out of range: ' + t );

    // @public {Vector2}
    this.point = point;
    this.normal = normal;

    // @public {number}
    this.distance = distance;
    this.wind = wind;
    this.t = Util.clamp( t, 0, 1 ); // In case it is slightly out of range
  }

  kite.register( 'RayIntersection', RayIntersection );

  inherit( Object, RayIntersection );

  return RayIntersection;
} );
