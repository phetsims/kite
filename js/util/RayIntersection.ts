// Copyright 2017-2022, University of Colorado Boulder

/**
 * An intersection between a ray and a segment.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Utils from '../../../dot/js/Utils.js';
import Vector2 from '../../../dot/js/Vector2.js';
import { kite } from '../imports.js';

export default class RayIntersection {

  point: Vector2;
  normal: Vector2;
  distance: number;
  wind: number;
  t: number;

  /**
   * @param distance - The distance between the ray's position and the point of intersection
   * @param point - The location of the intersection
   * @param normal - The normal (unit vector perpendicular to the segment at the location) at the
   *                           intersection, such that the dot product between the normal and ray direction is <= 0.
   * @param wind - The winding number for the intersection. Either 1 or -1, depending on the direction the
   *                        segment goes relative to the ray (to the left or right). Used for computing Shape
   *                        intersection via the non-zero fill rule.
   * @param t - Parametric value (for the segment) of the intersection
   */
  constructor( distance: number, point: Vector2, normal: Vector2, wind: number, t: number ) {
    assert && assert( typeof distance === 'number' && isFinite( distance ) && distance >= 0, 'invalid distance' );
    assert && assert( point instanceof Vector2, 'invalid point' );
    assert && assert( normal instanceof Vector2 && Math.abs( normal.magnitude - 1 ) < 1e-7, 'invalid normal' );
    assert && assert( typeof wind === 'number' );
    assert && assert( typeof t === 'number' && t >= -1e-10 && t <= 1 + 1e-10, `t out of range: ${t}` );

    this.point = point;
    this.normal = normal;
    this.distance = distance;
    this.wind = wind;
    this.t = Utils.clamp( t, 0, 1 ); // In case it is slightly out of range
  }
}

kite.register( 'RayIntersection', RayIntersection );