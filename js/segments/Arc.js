// Copyright 2013-2015, University of Colorado Boulder

/**
 * A circular arc (a continuous sub-part of a circle).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var Bounds2 = require( 'DOT/Bounds2' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Line = require( 'KITE/segments/Line' );
  var Overlap = require( 'KITE/util/Overlap' );
  var RayIntersection = require( 'KITE/util/RayIntersection' );
  var Segment = require( 'KITE/segments/Segment' );
  var SegmentIntersection = require( 'KITE/util/SegmentIntersection' );
  var Util = require( 'DOT/Util' );
  var Vector2 = require( 'DOT/Vector2' );

  // TODO: See if we should use this more
  var TWO_PI = Math.PI * 2;

  /**
   * @constructor
   *
   * If the startAngle/endAngle difference is ~2pi, this will be a full circle
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

    // @private {Vector2}
    this._center = center;

    // @private {number}
    this._radius = radius;
    this._startAngle = startAngle;
    this._endAngle = endAngle;

    // @private {boolean}
    this._anticlockwise = anticlockwise;

    this.invalidate();
  }

  kite.register( 'Arc', Arc );

  inherit( Segment, Arc, {
    /**
     * Sets the center of the Arc.
     * @public
     *
     * @param {Vector2} center
     * @returns {Arc}
     */
    setCenter: function( center ) {
      assert && assert( center instanceof Vector2, 'Arc center should be a Vector2: ' + center );
      assert && assert( center.isFinite(), 'Arc center should be finite: ' + center.toString() );

      if ( !this._center.equals( center ) ) {
        this._center = center;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set center( value ) { this.setCenter( value ); },

    /**
     * Returns the center of this Arc.
     * @public
     *
     * @returns {Vector2}
     */
    getCenter: function() {
      return this._center;
    },
    get center() { return this.getCenter(); },

    /**
     * Sets the radius of the Arc.
     * @public
     *
     * @param {number} radius
     * @returns {Arc}
     */
    setRadius: function( radius ) {
      assert && assert( typeof radius === 'number', 'Arc radius should be a number: ' + radius );
      assert && assert( isFinite( radius ), 'Arc radius should be a finite number: ' + radius );

      if ( this._radius !== radius ) {
        this._radius = radius;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set radius( value ) { this.setRadius( value ); },

    /**
     * Returns the radius of this Arc.
     * @public
     *
     * @returns {number}
     */
    getRadius: function() {
      return this._radius;
    },
    get radius() { return this.getRadius(); },

    /**
     * Sets the startAngle of the Arc.
     * @public
     *
     * @param {number} startAngle
     * @returns {Arc}
     */
    setStartAngle: function( startAngle ) {
      assert && assert( typeof startAngle === 'number', 'Arc startAngle should be a number: ' + startAngle );
      assert && assert( isFinite( startAngle ), 'Arc startAngle should be a finite number: ' + startAngle );

      if ( this._startAngle !== startAngle ) {
        this._startAngle = startAngle;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set startAngle( value ) { this.setStartAngle( value ); },

    /**
     * Returns the startAngle of this Arc.
     * @public
     *
     * @returns {number}
     */
    getStartAngle: function() {
      return this._startAngle;
    },
    get startAngle() { return this.getStartAngle(); },

    /**
     * Sets the endAngle of the Arc.
     * @public
     *
     * @param {number} endAngle
     * @returns {Arc}
     */
    setEndAngle: function( endAngle ) {
      assert && assert( typeof endAngle === 'number', 'Arc endAngle should be a number: ' + endAngle );
      assert && assert( isFinite( endAngle ), 'Arc endAngle should be a finite number: ' + endAngle );

      if ( this._endAngle !== endAngle ) {
        this._endAngle = endAngle;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set endAngle( value ) { this.setEndAngle( value ); },

    /**
     * Returns the endAngle of this Arc.
     * @public
     *
     * @returns {number}
     */
    getEndAngle: function() {
      return this._endAngle;
    },
    get endAngle() { return this.getEndAngle(); },

    /**
     * Sets the anticlockwise of the Arc.
     * @public
     *
     * @param {boolean} anticlockwise
     * @returns {Arc}
     */
    setAnticlockwise: function( anticlockwise ) {
      assert && assert( typeof anticlockwise === 'boolean', 'Arc anticlockwise should be a boolean: ' + anticlockwise );

      if ( this._anticlockwise !== anticlockwise ) {
        this._anticlockwise = anticlockwise;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set anticlockwise( value ) { this.setAnticlockwise( value ); },

    /**
     * Returns the anticlockwise of this Arc.
     * @public
     *
     * @returns {boolean}
     */
    getAnticlockwise: function() {
      return this._anticlockwise;
    },
    get anticlockwise() { return this.getAnticlockwise(); },

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

      assert && assert( this._center instanceof Vector2, 'Arc center should be a Vector2' );
      assert && assert( this._center.isFinite(), 'Arc center should be finite (not NaN or infinite)' );
      assert && assert( typeof this._radius === 'number', 'Arc radius should be a number: ' + this._radius );
      assert && assert( isFinite( this._radius ), 'Arc radius should be a finite number: ' + this._radius );
      assert && assert( typeof this._startAngle === 'number', 'Arc startAngle should be a number: ' + this._startAngle );
      assert && assert( isFinite( this._startAngle ), 'Arc startAngle should be a finite number: ' + this._startAngle );
      assert && assert( typeof this._endAngle === 'number', 'Arc endAngle should be a number: ' + this._endAngle );
      assert && assert( isFinite( this._endAngle ), 'Arc endAngle should be a finite number: ' + this._endAngle );
      assert && assert( typeof this._anticlockwise === 'boolean', 'Arc anticlockwise should be a boolean: ' + this._anticlockwise );

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
     * @public
     *
     * @returns {number}
     */
    getActualEndAngle: function() {
      if ( this._actualEndAngle === null ) {
        this._actualEndAngle = Arc.computeActualEndAngle( this._startAngle, this._endAngle, this._anticlockwise );
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
     * @public
     *
     * The answer is always greater or equal to zero
     * The answer can exceed two Pi
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
      if ( Math.abs( Util.moduloBetweenDown( angle - this._startAngle, -Math.PI, Math.PI ) ) < 1e-8 ) {
        return this._startAngle;
      }
      if ( Math.abs( Util.moduloBetweenDown( angle - this.getActualEndAngle(), -Math.PI, Math.PI ) ) < 1e-8 ) {
        return this.getActualEndAngle();
      }
      // consider an assert that we contain that angle?
      return ( this._startAngle > this.getActualEndAngle() ) ?
             Util.moduloBetweenUp( angle, this._startAngle - 2 * Math.PI, this._startAngle ) :
             Util.moduloBetweenDown( angle, this._startAngle, this._startAngle + 2 * Math.PI );
    },

    /**
     * Returns the parametrized value t for a given angle. The value t should range from 0 to 1 (inclusive).
     * @public
     *
     * @param {number} angle
     * @returns {number}
     */
    tAtAngle: function( angle ) {
      var t = ( this.mapAngle( angle ) - this._startAngle ) / ( this.getActualEndAngle() - this._startAngle );

      assert && assert( t >= 0 && t <= 1, 'tAtAngle out of range: ' + t );

      return t;
    },

    /**
     * Returns the angle for the parametrized t value. The t value should range from 0 to 1 (inclusive).
     * @public
     *
     * @param {number} t
     * @returns {number}
     */
    angleAt: function( t ) {
      //TODO: add asserts
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

      return this._anticlockwise ? normal.perpendicular : normal.perpendicular.negated();
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
      var positiveMinAngle = Util.moduloBetweenDown( normalizedAngle, 0, Math.PI * 2 );

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
          var epsilon = 0.0000000001; // TODO: general kite epsilon?, also do 1e-Number format
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
     * @returns {Array.<RayIntersection>} - See Segment.js for details
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
      var centerToRayDistSq = centerToRay.magnitudeSquared;
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
      var normalBAngle = normalB.angle;

      if ( ta < epsilon ) {
        // we are inside the circle, so only one intersection is possible
        if ( this.containsAngle( normalBAngle ) ) {
          // normal is towards the ray, so we negate it. also winds opposite way
          result.push( new RayIntersection( tb, pointB, normalB.negated(), this._anticlockwise ? -1 : 1, this.tAtAngle( normalBAngle ) ) );
        }
      }
      else {
        // two possible hits (outside circle)
        var pointA = ray.pointAtDistance( ta );
        var normalA = pointA.minus( this._center ).normalized();
        var normalAAngle = normalA.angle;

        if ( this.containsAngle( normalAAngle ) ) {
          // hit from outside
          result.push( new RayIntersection( ta, pointA, normalA, this._anticlockwise ? 1 : -1, this.tAtAngle( normalAAngle ) ) );
        }
        if ( this.containsAngle( normalBAngle ) ) {
          result.push( new RayIntersection( tb, pointB, normalB.negated(), this._anticlockwise ? -1 : 1, this.tAtAngle( normalBAngle ) ) );
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
      var startAngle = matrix.timesVector2( Vector2.createPolar( 1, this._startAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle;
      var endAngle = matrix.timesVector2( Vector2.createPolar( 1, this._endAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle;

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
    },

    /**
     * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
     * @public
     *
     * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
     *
     * @returns {number}
     */
    getSignedAreaFragment: function() {
      var t0 = this._startAngle;
      var t1 = this.getActualEndAngle();

      // Derived via Mathematica (curve-area.nb)
      return 0.5 * this._radius * ( this._radius * ( t1 - t0 ) +
                                    this._center.x * ( Math.sin( t1 ) - Math.sin( t0 ) ) -
                                    this._center.y * ( Math.cos( t1 ) - Math.cos( t0 ) ) );
    },

    /**
     * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
     * @public
     *
     * @returns {Arc}
     */
    reversed: function() {
      return new kite.Arc( this._center, this._radius, this._endAngle, this._startAngle, !this._anticlockwise );
    },

    /**
     * Returns the arc length of the segment.
     * @public
     * @override (ignores parameters)
     *
     * @returns {number}
     */
    getArcLength: function() {
      return this.getAngleDifference() * this._radius;
    },

    /**
     * We can handle this simply by returning ourselves.
     * @override
     *
     * @returns {Array.<Segment>}
     */
    toPiecewiseLinearOrArcSegments: function() {
      return [ this ];
    },

    /**
     * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
     * @public
     *
     * @returns {Object}
     */
    serialize: function() {
      return {
        type: 'Arc',
        centerX: this._center.x,
        centerY: this._center.y,
        radius: this._radius,
        startAngle: this._startAngle,
        endAngle: this._endAngle,
        anticlockwise: this._anticlockwise
      };
    }
  } );

  /**
   * Returns an Arc from the serialized representation.
   * @public
   *
   * @param {Object} obj
   * @returns {Arc}
   */
  Arc.deserialize = function( obj ) {
    assert && assert( obj.type === 'Arc' );

    return new Arc( new Vector2( obj.centerX, obj.centerY ), obj.radius, obj.startAngle, obj.endAngle, obj.anticlockwise );
  };

  /**
   * Determines the actual end angle (compared to the start angle).
   * @public
   *
   * Normalizes the sign of the angles, so that the sign of ( endAngle - startAngle ) matches whether it is
   * anticlockwise.
   *
   * @param {number} startAngle
   * @param {number} endAngle
   * @param {boolean} anticlockwise
   * @returns {number}
   */
  Arc.computeActualEndAngle = function( startAngle, endAngle, anticlockwise ) {
    if ( anticlockwise ) {
      // angle is 'decreasing'
      // -2pi <= end - start < 2pi
      if ( startAngle > endAngle ) {
        return endAngle;
      }
      else if ( startAngle < endAngle ) {
        return endAngle - 2 * Math.PI;
      }
      else {
        // equal
        return startAngle;
      }
    }
    else {
      // angle is 'increasing'
      // -2pi < end - start <= 2pi
      if ( startAngle < endAngle ) {
        return endAngle;
      }
      else if ( startAngle > endAngle ) {
        return endAngle + Math.PI * 2;
      }
      else {
        // equal
        return startAngle;
      }
    }
  };

  /**
   * Computes the potential overlap between [0,end1] and [start2,end2] (with t-values [0,1] and [tStart2,tEnd2]).
   * @private
   *
   * @param {number} end1 - Relative end angle of the first segment
   * @param {number} start2 - Relative start angle of the second segment
   * @param {number} end2 - Relative end angle of the second segment
   * @param {number} tStart2 - The parametric value of the second segment's start
   * @param {number} tEnd2 - The parametric value of the second segment's end
   * @returns {Array.<Overlap>}
   */
  Arc.getPartialOverlap = function( end1, start2, end2, tStart2, tEnd2 ) {
    assert && assert( end1 > 0 && end1 <= TWO_PI + 1e-10 );
    assert && assert( start2 >= 0 && start2 < TWO_PI + 1e-10 );
    assert && assert( end2 >= 0 && end2 <= TWO_PI + 1e-10 );
    assert && assert( tStart2 >= 0 && tStart2 <= 1 );
    assert && assert( tEnd2 >= 0 && tEnd2 <= 1 );

    var reversed2 = end2 < start2;
    var min2 = reversed2 ? end2 : start2;
    var max2 = reversed2 ? start2 : end2;

    var overlapMin = min2;
    var overlapMax = Math.min( end1, max2 );

    // If there's not a small amount of overlap
    if ( overlapMax < overlapMin + 1e-8 ) {
      return [];
    }
    else {
      return [ Overlap.createLinear(
        // minimum
        Util.clamp( Util.linear( 0, end1, 0, 1, overlapMin ), 0, 1 ), // arc1 min
        Util.clamp( Util.linear( start2, end2, tStart2, tEnd2, overlapMin ), 0, 1 ), // arc2 min
        // maximum
        Util.clamp( Util.linear( 0, end1, 0, 1, overlapMax ), 0, 1 ), // arc1 max
        Util.clamp( Util.linear( start2, end2, tStart2, tEnd2, overlapMax ), 0, 1 ) // arc2 max
      ) ];
    }
  };

  /**
   * Determine whether two Arcs overlap over continuous sections, and if so finds the a,b pairs such that
   * p( t ) === q( a * t + b ).
   * @public
   *
   * @param {number} startAngle1 - Start angle of arc 1
   * @param {number} endAngle1 - "Actual" end angle of arc 1
   * @param {number} startAngle2 - Start angle of arc 2
   * @param {number} endAngle2 - "Actual" end angle of arc 2
   * @returns {Array.<Overlap>} - Any overlaps (from 0 to 2)
   */
  Arc.getAngularOverlaps = function( startAngle1, endAngle1, startAngle2, endAngle2 ) {
    assert && assert( typeof startAngle1 === 'number' && isFinite( startAngle1 ) );
    assert && assert( typeof endAngle1 === 'number' && isFinite( endAngle1 ) );
    assert && assert( typeof startAngle2 === 'number' && isFinite( startAngle2 ) );
    assert && assert( typeof endAngle2 === 'number' && isFinite( endAngle2 ) );

    // Remap start of arc 1 to 0, and the end to be positive (sign1 )
    var end1 = endAngle1 - startAngle1;
    var sign1 = end1 < 0 ? -1 : 1;
    end1 *= sign1;

    // Remap arc 2 so the start point maps to the [0,2pi) range (and end-point may lie outside that)
    var start2 = Util.moduloBetweenDown( sign1 * ( startAngle2 - startAngle1 ), 0, TWO_PI );
    var end2 = sign1 * ( endAngle2 - startAngle2 ) + start2;

    var wrapT;
    if ( end2 < -1e-10 ) {
      wrapT = -start2 / ( end2 - start2 );
      return Arc.getPartialOverlap( end1, start2, 0, 0, wrapT ).concat( Arc.getPartialOverlap( end1, TWO_PI, end2 + TWO_PI, wrapT, 1 ) );
    }
    else if ( end2 > TWO_PI + 1e-10 ) {
      wrapT = ( TWO_PI - start2 ) / ( end2 - start2 );
      return Arc.getPartialOverlap( end1, start2, TWO_PI, 0, wrapT ).concat( Arc.getPartialOverlap( end1, 0, end2 - TWO_PI, wrapT, 1 ) );
    }
    else {
      return Arc.getPartialOverlap( end1, start2, end2, 0, 1 );
    }
  };

  /**
   * Determine whether two Arcs overlap over continuous sections, and if so finds the a,b pairs such that
   * p( t ) === q( a * t + b ).
   * @public
   *
   * @param {Arc} arc1
   * @param {Arc} arc2
   * @returns {Array.<Overlap>} - Any overlaps (from 0 to 2)
   */
  Arc.getOverlaps = function( arc1, arc2 ) {
    assert && assert( arc1 instanceof Arc );
    assert && assert( arc2 instanceof Arc );

    if ( arc1._center.distance( arc2._center ) > 1e-8 || Math.abs( arc1._radius - arc2._radius ) > 1e-8 ) {
      return [];
    }

    return Arc.getAngularOverlaps( arc1._startAngle, arc1.getActualEndAngle(), arc2._startAngle, arc2.getActualEndAngle() );
  };

  /**
   * Returns the points of intersections between two circles.
   * @public
   *
   * @param {Vector2} center1 - Center of the first circle
   * @param {number} radius1 - Radius of the first circle
   * @param {Vector2} center2 - Center of the second circle
   * @param {number} radius2 - Radius of the second circle
   */
  Arc.getCircleIntersectionPoint = function( center1, radius1, center2, radius2 ) {
    assert && assert( center1 instanceof Vector2 );
    assert && assert( typeof radius1 === 'number' && isFinite( radius1 ) && radius1 >= 0 );
    assert && assert( center2 instanceof Vector2 );
    assert && assert( typeof radius2 === 'number' && isFinite( radius2 ) && radius2 >= 0 );

    var delta = center2.minus( center1 );
    var d = delta.magnitude;
    var results = [];
    if ( d < 1e-10 || d > radius1 + radius2 + 1e-10 ) {
      // No intersections
    }
    else if ( d > radius1 + radius2 - 1e-10 ) {
      results = [
        center1.blend( center2, radius1 / d )
      ];
    }
    else {
      var xPrime = 0.5 * ( d * d  - radius2 * radius2 + radius1 * radius1 ) / d;
      var bit = d * d - radius2 * radius2 + radius1 * radius1;
      var discriminant = 4 * d * d * radius1 * radius1 - bit * bit;
      var base = center1.blend( center2, xPrime / d );
      if ( discriminant >= 1e-10 ) {
        var yPrime = Math.sqrt( discriminant ) / d / 2;
        var perpendicular = delta.perpendicular.setMagnitude( yPrime );
        results = [
          base.plus( perpendicular ),
          base.minus( perpendicular )
        ];
      }
      else if ( discriminant > -1e-10 ) {
        results = [ base ];
      }
    }
    if ( assert ) {
      results.forEach( function( result ) {
        assert( Math.abs( result.distance( center1 ) - radius1 ) < 1e-8 );
        assert( Math.abs( result.distance( center2 ) - radius2 ) < 1e-8 );
      } );
    }
    return results;
  };

  /**
   * Returns any intersection between the two line segments.
   *
   * @param {Arc} a
   * @param {Arc} b
   * @returns {Array.<SegmentIntersection>}
   */
  Arc.intersect = function( a, b ) {
    assert && assert( a instanceof Arc );
    assert && assert( b instanceof Arc );

    var points = Arc.getCircleIntersectionPoint( a._center, a._radius, b._center, b._radius );
    var results = [];

    for ( var i = 0; i < points.length; i++ ) {
      var point = points[ i ];
      var angleA = point.minus( a._center ).angle;
      var angleB = point.minus( b._center ).angle;

      if ( a.containsAngle( angleA ) && b.containsAngle( angleB ) ) {
        results.push( new SegmentIntersection( point, a.tAtAngle( angleA ), b.tAtAngle( angleB ) ) );
      }
    }

    return results;
  };

  /**
   * Creates an Arc (or if straight enough a Line) segment that goes from the startPoint to the endPoint, touching
   * the middlePoint somewhere between the two.
   * @public
   *
   * @param {Vector2} startPoint
   * @param {Vector2} middlePoint
   * @param {Vector2} endPoint
   * @returns {Segment}
   */
  Arc.createFromPoints = function( startPoint, middlePoint, endPoint ) {
    var center = Util.circleCenterFromPoints( startPoint, middlePoint, endPoint );

    // Close enough
    if ( center === null ) {
      return new Line( startPoint, endPoint );
    }
    else {
      var startDiff = startPoint.minus( center );
      var middleDiff = middlePoint.minus( center );
      var endDiff = endPoint.minus( center );
      var startAngle = startDiff.angle;
      var middleAngle = middleDiff.angle;
      var endAngle = endDiff.angle;

      var radius = ( startDiff.magnitude + middleDiff.magnitude + endDiff.magnitude ) / 3;

      // Try anticlockwise first. TODO: Don't require creation of extra Arcs
      var arc = new Arc( center, radius, startAngle, endAngle, false );
      if ( arc.containsAngle( middleAngle ) ) {
        return arc;
      }
      else {
        return new Arc( center, radius, startAngle, endAngle, true );
      }
    }
  };

  return Arc;
} );
