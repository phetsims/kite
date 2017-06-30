// Copyright 2013-2015, University of Colorado Boulder

/**
 * Arc segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var DotUtil = require( 'DOT/Util' ); // eslint-disable-line require-statement-match

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  /**
   * Creates a circular arc (or circle if the startAngle/endAngle difference is ~2pi).
   * @constructor
   *
   * See http://www.w3.org/TR/2dcontext/#dom-context-2d-arc for detailed information on the parameters.
   *
   * @param {Vector2} center - Center of the arc (every point on the arc is equally far from the center)
   * @param {number} radius - How far from the center the arc will be
   * @param {number} startAngle - Angle (radians) of the start of the arc
   * @param {number} endAngle - Angle (radians) of the end of the arc
   * @param {boolean} anticlockwise - Decides which direction the arc takes around the center
   */
  function Arc( center, radius, startAngle, endAngle, anticlockwise ) {
    Segment.call( this );

    this._center = center; // @private {Vector2}
    this._radius = radius; // @private {number}
    this._startAngle = startAngle; // @private {number}
    this._endAngle = endAngle; // @private {number}
    this._anticlockwise = anticlockwise; // @private {boolean}

    this.invalidate();
  }

  kite.register( 'Arc', Arc );

  inherit( Segment, Arc, {

    /**
     * Returns the position parametrically, with 0 <= t <= 1.
     * @public
     *
     * NOTE: positionAt( 0 ) will return the start of the segment, and positionAt( 1 ) will return the end of the
     * segment.
     *
     * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
     *
     * @param {number} t
     * @returns {Vector2}
     */
    positionAt: function( t ) {
      assert && assert( t >= 0, 'positionAt t should be non-negative' );
      assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

      return this.positionAtAngle( this.angleAt( t ) );
    },

    /**
     * Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
     * @public
     *
     * NOTE: tangentAt( 0 ) will return the tangent at the start of the segment, and tangentAt( 1 ) will return the
     * tangent at the end of the segment.
     *
     * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
     *
     * @param {number} t
     * @returns {Vector2}
     */
    tangentAt: function( t ) {
      assert && assert( t >= 0, 'tangentAt t should be non-negative' );
      assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

      return this.tangentAtAngle( this.angleAt( t ) );
    },

    /**
     * Returns the signed curvature of the segment at the parametric value t, where 0 <= t <= 1.
     * @public
     *
     * The curvature will be positive for visual clockwise / mathematical counterclockwise curves, negative for opposite
     * curvature, and 0 for no curvature.
     *
     * NOTE: curvatureAt( 0 ) will return the curvature at the start of the segment, and curvatureAt( 1 ) will return
     * the curvature at the end of the segment.
     *
     * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
     *
     * @param {number} t
     * @returns {number}
     */
    curvatureAt: function( t ) {
      assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
      assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

      // Since it is an arc of as circle, the curvature is independent of t
      return ( this._anticlockwise ? -1 : 1 ) / this._radius;
    },

    /**
     * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
     * up the same shape as the current segment.
     * @public
     *
     * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
     *
     * @param {number} t
     * @returns {Array.<Segment>}
     */
    subdivided: function( t ) {
      assert && assert( t >= 0, 'subdivided t should be non-negative' );
      assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

      // If t is 0 or 1, we only need to return 1 segment
      if ( t === 0 || t === 1 ) {
        return [ this ];
      }

      // TODO: verify that we don't need to switch anticlockwise here, or subtract 2pi off any angles
      var angle0 = this.angleAt( 0 );
      var angleT = this.angleAt( t );
      var angle1 = this.angleAt( 1 );
      return [
        new kite.Arc( this._center, this._radius, angle0, angleT, this._anticlockwise ),
        new kite.Arc( this._center, this._radius, angleT, angle1, this._anticlockwise )
      ];
    },

    /**
     * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
     * @public
     */
    invalidate: function() {
      // Lazily-computed derived information
      this._start = null; // {Vector2|null}
      this._end = null; // {Vector2|null}
      this._startTangent = null; // {Vector2|null}
      this._endTangent = null; // {Vector2|null}
      this._actualEndAngle = null; // {number|null} - End angle in relation to our start angle (can get remapped)
      this._isFullPerimeter = null; // {boolean|null} - Whether it's a full circle (and not just an arc)
      this._angleDifference = null; // {number|null}
      this._bounds = null; // {Bounds2|null}
      this._svgPathFragment = null; // {string|null}

      // Remap negative radius to a positive radius
      if ( this._radius < 0 ) {
        // support this case since we might actually need to handle it inside of strokes?
        this._radius = -this._radius;
        this._startAngle += Math.PI;
        this._endAngle += Math.PI;
      }

      // Constraints that should always be satisfied
      assert && assert( !( ( !this.anticlockwise && this._endAngle - this._startAngle <= -Math.PI * 2 ) ||
                           ( this.anticlockwise && this._startAngle - this._endAngle <= -Math.PI * 2 ) ),
        'Not handling arcs with start/end angles that show differences in-between browser handling' );
      assert && assert( !( ( !this.anticlockwise && this._endAngle - this._startAngle > Math.PI * 2 ) ||
                           ( this.anticlockwise && this._startAngle - this._endAngle > Math.PI * 2 ) ),
        'Not handling arcs with start/end angles that show differences in-between browser handling' );

      this.trigger0( 'invalidated' );
    },

    /**
     * Gets the start position of this arc.
     * @public
     *
     * @returns {Vector2}
     */
    getStart: function() {
      if ( this._start === null ) {
        this._start = this.positionAtAngle( this._startAngle );
      }
      return this._start;
    },
    get start() { return this.getStart(); },

    /**
     * Gets the end position of this arc.
     * @public
     *
     * @returns {Vector2}
     */
    getEnd: function() {
      if ( this._end === null ) {
        this._end = this.positionAtAngle( this._endAngle );
      }
      return this._end;
    },
    get end() { return this.getEnd(); },

    /**
     * Gets the unit vector tangent to this arc at the start point.
     * @public
     *
     * @returns {Vector2}
     */
    getStartTangent: function() {
      if ( this._startTangent === null ) {
        this._startTangent = this.tangentAtAngle( this._startAngle );
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    /**
     * Gets the unit vector tangent to the arc at the end point.
     * @public
     *
     * @returns {Vector2}
     */
    getEndTangent: function() {
      if ( this._endTangent === null ) {
        this._endTangent = this.tangentAtAngle( this._endAngle );
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    /**
     * Gets the end angle in radians.
     *
     * @public
     * @returns {number}
     */
    getActualEndAngle: function() {
      if ( this._actualEndAngle === null ) {
        // compute an actual end angle so that we can smoothly go from this._startAngle to this._actualEndAngle
        if ( this._anticlockwise ) {
          // angle is 'decreasing'
          // -2pi <= end - start < 2pi
          if ( this._startAngle > this._endAngle ) {
            this._actualEndAngle = this._endAngle;
          }
          else if ( this._startAngle < this._endAngle ) {
            this._actualEndAngle = this._endAngle - 2 * Math.PI;
          }
          else {
            // equal
            this._actualEndAngle = this._startAngle;
          }
        }
        else {
          // angle is 'increasing'
          // -2pi < end - start <= 2pi
          if ( this._startAngle < this._endAngle ) {
            this._actualEndAngle = this._endAngle;
          }
          else if ( this._startAngle > this._endAngle ) {
            this._actualEndAngle = this._endAngle + Math.PI * 2;
          }
          else {
            // equal
            this._actualEndAngle = this._startAngle;
          }
        }
      }
      return this._actualEndAngle;
    },
    get actualEndAngle() { return this.getActualEndAngle(); },

    /**
     * Returns a boolean value that indicates if the arc wraps up by more than two Pi.
     * @public
     *
     * @returns {boolean}
     */
    getIsFullPerimeter: function() {
      if ( this._isFullPerimeter === null ) {
        this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
      }
      return this._isFullPerimeter;
    },
    get isFullPerimeter() { return this.getIsFullPerimeter(); },

    /**
     * Returns an angle difference that represents how "much" of the circle our arc covers.
     * The answer is always greater or equal to zero
     * The answer can exceed two Pi
     * @public
     *
     * @returns {number}
     */
    getAngleDifference: function() {
      if ( this._angleDifference === null ) {
        // compute an angle difference that represents how "much" of the circle our arc covers
        this._angleDifference = this._anticlockwise ? this._startAngle - this._endAngle : this._endAngle - this._startAngle;
        if ( this._angleDifference < 0 ) {
          this._angleDifference += Math.PI * 2;
        }
        assert && assert( this._angleDifference >= 0 ); // now it should always be zero or positive
      }
      return this._angleDifference;
    },
    get angleDifference() { return this.getAngleDifference(); },

    /**
     * Returns the bounds of this segment.
     * @public
     *
     * @returns {Bounds2}
     */
    getBounds: function() {
      if ( this._bounds === null ) {
        // acceleration for intersection
        this._bounds = Bounds2.NOTHING.copy().withPoint( this.getStart() )
          .withPoint( this.getEnd() );

        // if the angles are different, check extrema points
        if ( this._startAngle !== this._endAngle ) {
          // check all of the extrema points
          this.includeBoundsAtAngle( 0 );
          this.includeBoundsAtAngle( Math.PI / 2 );
          this.includeBoundsAtAngle( Math.PI );
          this.includeBoundsAtAngle( 3 * Math.PI / 2 );
        }
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    /**
     * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
     * invalid or repeated segments.
     * @public
     *
     * @returns {Array.<Segment>}
     */
    getNondegenerateSegments: function() {
      if ( this._radius <= 0 || this._startAngle === this._endAngle ) {
        return [];
      }
      else {
        return [ this ]; // basically, Arcs aren't really degenerate that easily
      }
    },

    /**
     * Attempts to expand the private _bounds bounding box to include a point at a specific angle, making sure that
     * angle is actually included in the arc. This will presumably be called at angles that are at critical points,
     * where the arc should have maximum/minimum x/y values.
     * @private
     *
     * @param {number} angle
     */
    includeBoundsAtAngle: function( angle ) {
      if ( this.containsAngle( angle ) ) {
        // the boundary point is in the arc
        this._bounds = this._bounds.withPoint( this._center.plus( Vector2.createPolar( this._radius, angle ) ) );
      }
    },

    /**
     * Maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
     * @public
     *
     * @param {number} angle
     * @returns {number}
     */
    mapAngle: function( angle ) {
      // consider an assert that we contain that angle?
      return ( this._startAngle > this.getActualEndAngle() ) ?
             DotUtil.moduloBetweenUp( angle, this._startAngle - 2 * Math.PI, this._startAngle ) :
             DotUtil.moduloBetweenDown( angle, this._startAngle, this._startAngle + 2 * Math.PI );
    },

    /**
     * Returns the parametrized value t for a given angle. The value t should range from 0 to 1 (inclusive).
     * @public
     *
     * @param {number} angle
     * @returns {number}
     */
    tAtAngle: function( angle ) {
      return ( this.mapAngle( angle ) - this._startAngle ) / ( this.getActualEndAngle() - this._startAngle );
    },

    /**
     * Returns the angle for the parametrized t value. The t value should range from 0 to 1 (inclusive).
     * @public
     * @param {number} t
     * @returns {number}
     */
    angleAt: function( t ) {
      return this._startAngle + ( this.getActualEndAngle() - this._startAngle ) * t;
    },

    /**
     * Returns the position of this arc at angle.
     * @public
     *
     * @param {number} angle
     * @returns {Vector2}
     */
    positionAtAngle: function( angle ) {
      return this._center.plus( Vector2.createPolar( this._radius, angle ) );
    },

    /**
     * Returns the normalized tangent of this arc.
     * The tangent points outward (inward) of this arc for clockwise (anticlockwise) direction.
     * @public
     *
     * @param {number} angle
     * @returns {Vector2}
     */
    tangentAtAngle: function( angle ) {
      var normal = Vector2.createPolar( 1, angle );

      return this._anticlockwise ? normal.perpendicular() : normal.perpendicular().negated();
    },

    /**
     * Returns whether the given angle is contained by the arc (whether a ray from the arc's origin going in that angle
     * will intersect the arc).
     * @public
     *
     * @param {number} angle
     * @returns {boolean}
     */
    containsAngle: function( angle ) {
      // transform the angle into the appropriate coordinate form
      // TODO: check anticlockwise version!
      var normalizedAngle = this._anticlockwise ? angle - this._endAngle : angle - this._startAngle;

      // get the angle between 0 and 2pi
      var positiveMinAngle = DotUtil.moduloBetweenDown( normalizedAngle, 0, Math.PI * 2 );

      return positiveMinAngle <= this.angleDifference;
    },

    /**
     * Returns a string containing the SVG path. assumes that the start point is already provided,
     * so anything that calls this needs to put the M calls first
     * @public
     *
     * @returns {string}
     */
    getSVGPathFragment: function() {
      if ( assert ) {
        var oldPathFragment = this._svgPathFragment;
        this._svgPathFragment = null;
      }
      if ( !this._svgPathFragment ) {
        // see http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands for more info
        // rx ry x-axis-rotation large-arc-flag sweep-flag x y

        var epsilon = 0.01; // allow some leeway to render things as 'almost circles'
        var sweepFlag = this._anticlockwise ? '0' : '1';
        var largeArcFlag;
        if ( this.angleDifference < Math.PI * 2 - epsilon ) {
          largeArcFlag = this.angleDifference < Math.PI ? '0' : '1';
          this._svgPathFragment = 'A ' + kite.svgNumber( this._radius ) + ' ' + kite.svgNumber( this._radius ) + ' 0 ' + largeArcFlag +
                                  ' ' + sweepFlag + ' ' + kite.svgNumber( this.end.x ) + ' ' + kite.svgNumber( this.end.y );
        }
        else {
          // circle (or almost-circle) case needs to be handled differently
          // since SVG will not be able to draw (or know how to draw) the correct circle if we just have a start and end, we need to split it into two circular arcs

          // get the angle that is between and opposite of both of the points
          var splitOppositeAngle = ( this._startAngle + this._endAngle ) / 2; // this _should_ work for the modular case?
          var splitPoint = this._center.plus( Vector2.createPolar( this._radius, splitOppositeAngle ) );

          largeArcFlag = '0'; // since we split it in 2, it's always the small arc

          var firstArc = 'A ' + kite.svgNumber( this._radius ) + ' ' + kite.svgNumber( this._radius ) + ' 0 ' +
                         largeArcFlag + ' ' + sweepFlag + ' ' + kite.svgNumber( splitPoint.x ) + ' ' + kite.svgNumber( splitPoint.y );
          var secondArc = 'A ' + kite.svgNumber( this._radius ) + ' ' + kite.svgNumber( this._radius ) + ' 0 ' +
                          largeArcFlag + ' ' + sweepFlag + ' ' + kite.svgNumber( this.end.x ) + ' ' + kite.svgNumber( this.end.y );

          this._svgPathFragment = firstArc + ' ' + secondArc;
        }
      }
      if ( assert ) {
        if ( oldPathFragment ) {
          assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
        }
      }
      return this._svgPathFragment;
    },

    /**
     * Returns an array of arcs that will draw an offset on the logical left side
     * @public
     *
     * @param {number} lineWidth
     * @returns {Array.<Arc>}
     */
    strokeLeft: function( lineWidth ) {
      return [ new kite.Arc( this._center, this._radius + ( this._anticlockwise ? 1 : -1 ) * lineWidth / 2, this._startAngle, this._endAngle, this._anticlockwise ) ];
    },

    /**
     * Returns an array of arcs that will draw an offset curve on the logical right side
     * @public
     *
     * @param {number} lineWidth
     * @returns {Array.<Arc>}
     */
    strokeRight: function( lineWidth ) {
      return [ new kite.Arc( this._center, this._radius + ( this._anticlockwise ? -1 : 1 ) * lineWidth / 2, this._endAngle, this._startAngle, !this._anticlockwise ) ];
    },

    /**
     * Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
     * Does not include t=0 and t=1
     * @public
     *
     * @returns {Array.<number>}
     */
    getInteriorExtremaTs: function() {
      var self = this;
      var result = [];
      _.each( [ 0, Math.PI / 2, Math.PI, 3 * Math.PI / 2 ], function( angle ) {
        if ( self.containsAngle( angle ) ) {
          var t = self.tAtAngle( angle );
          var epsilon = 0.0000000001; // TODO: general kite epsilon?
          if ( t > epsilon && t < 1 - epsilon ) {
            result.push( t );
          }
        }
      } );
      return result.sort(); // modifies original, which is OK
    },

    /**
     * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
     * For details, see the documentation in Segment.js
     * @public
     *
     * @param {Ray2} ray
     * @returns {Array.<Intersection>} - See Segment.js for details
     */
    intersection: function( ray ) {
      var result = []; // hits in order

      // left here, if in the future we want to better-handle boundary points
      var epsilon = 0;

      // Run a general circle-intersection routine, then we can test the angles later.
      // Solves for the two solutions t such that ray.position + ray.direction * t is on the circle.
      // Then we check whether the angle at each possible hit point is in our arc.
      var centerToRay = ray.position.minus( this._center );
      var tmp = ray.direction.dot( centerToRay );
      var centerToRayDistSq = centerToRay.magnitudeSquared();
      var discriminant = 4 * tmp * tmp - 4 * ( centerToRayDistSq - this._radius * this._radius );
      if ( discriminant < epsilon ) {
        // ray misses circle entirely
        return result;
      }
      var base = ray.direction.dot( this._center ) - ray.direction.dot( ray.position );
      var sqt = Math.sqrt( discriminant ) / 2;
      var ta = base - sqt;
      var tb = base + sqt;

      if ( tb < epsilon ) {
        // circle is behind ray
        return result;
      }

      var pointB = ray.pointAtDistance( tb );
      var normalB = pointB.minus( this._center ).normalized();

      if ( ta < epsilon ) {
        // we are inside the circle, so only one intersection is possible
        if ( this.containsAngle( normalB.angle() ) ) {
          result.push( {
            distance: tb,
            point: pointB,
            normal: normalB.negated(), // normal is towards the ray
            wind: this._anticlockwise ? -1 : 1 // since we are inside, wind this way
          } );
        }
      }
      else {
        // two possible hits (outside circle)
        var pointA = ray.pointAtDistance( ta );
        var normalA = pointA.minus( this._center ).normalized();

        if ( this.containsAngle( normalA.angle() ) ) {
          result.push( {
            distance: ta,
            point: pointA,
            normal: normalA,
            wind: this._anticlockwise ? 1 : -1 // hit from outside
          } );
        }
        if ( this.containsAngle( normalB.angle() ) ) {
          result.push( {
            distance: tb,
            point: pointB,
            normal: normalB.negated(),
            wind: this._anticlockwise ? -1 : 1 // this is the far hit, which winds the opposite way
          } );
        }
      }

      return result;
    },

    /**
     * Returns the resultant winding number of this ray intersecting this arc.
     * @public
     *
     * @param {Ray2} ray
     * @returns {number}
     */
    windingIntersection: function( ray ) {
      var wind = 0;
      var hits = this.intersection( ray );
      _.each( hits, function( hit ) {
        wind += hit.wind;
      } );
      return wind;
    },

    /**
     * Draws this arc to the 2D Canvas context, assuming the context's current location is already at the start point
     * @public
     *
     * @param {CanvasRenderingContext2D} context
     */
    writeToContext: function( context ) {
      context.arc( this._center.x, this._center.y, this._radius, this._startAngle, this._endAngle, this._anticlockwise );
    },

    /**
     * Returns a new copy of this arc, transformed by the given matrix.
     * @public
     *
     * TODO: test various transform types, especially rotations, scaling, shears, etc.
     *
     * @param {Matrix3} matrix
     * @returns {Arc|EllipticalArc}
     */
    transformed: function( matrix ) {
      // so we can handle reflections in the transform, we do the general case handling for start/end angles
      var startAngle = matrix.timesVector2( Vector2.createPolar( 1, this._startAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle();
      var endAngle = matrix.timesVector2( Vector2.createPolar( 1, this._endAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle();

      // reverse the 'clockwiseness' if our transform includes a reflection
      var anticlockwise = matrix.getDeterminant() >= 0 ? this._anticlockwise : !this._anticlockwise;

      if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
        endAngle = anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
      }

      var scaleVector = matrix.getScaleVector();
      if ( scaleVector.x !== scaleVector.y ) {
        var radiusX = scaleVector.x * this._radius;
        var radiusY = scaleVector.y * this._radius;
        return new kite.EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, 0, startAngle, endAngle, anticlockwise );
      }
      else {
        var radius = scaleVector.x * this._radius;
        return new kite.Arc( matrix.timesVector2( this._center ), radius, startAngle, endAngle, anticlockwise );
      }
    }
  } );

  /**
   * Add getters and setters
   */
  Segment.addInvalidatingGetterSetter( Arc, 'center' );
  Segment.addInvalidatingGetterSetter( Arc, 'radius' );
  Segment.addInvalidatingGetterSetter( Arc, 'startAngle' );
  Segment.addInvalidatingGetterSetter( Arc, 'endAngle' );
  Segment.addInvalidatingGetterSetter( Arc, 'anticlockwise' );

  return Arc;
} );
