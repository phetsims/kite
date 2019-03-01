// Copyright 2013-2015, University of Colorado Boulder

/**
 * An elliptical arc (a continuous sub-part of an ellipse).
 *
 * Additional helpful notes:
 * - http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
 * - http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-ellipse
 *   (note: context.ellipse was removed from the Canvas spec)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var Arc = require( 'KITE/segments/Arc' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var RayIntersection = require( 'KITE/util/RayIntersection' );
  var Segment = require( 'KITE/segments/Segment' );
  var Transform3 = require( 'DOT/Transform3' );
  var Util = require( 'DOT/Util' );
  var Vector2 = require( 'DOT/Vector2' );

  // constants
  var toDegrees = Util.toDegrees;

  /**
   * @constructor
   *
   * If the startAngle/endAngle difference is ~2pi, this will be a full ellipse
   *
   * @param {Vector2} center - Center of the ellipse
   * @param {number} radiusX - Semi-major radius
   * @param {number} radiusY - Semi-minor radius
   * @param {number} rotation - Rotation of the semi-major axis
   * @param {number} startAngle - Angle (radians) of the start of the arc
   * @param {number} endAngle - Angle (radians) of the end of the arc
   * @param {boolean} anticlockwise - Decides which direction the arc takes around the center
   */
  function EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
    Segment.call( this );

    // @private {Vector2}
    this._center = center;

    // @private {number}
    this._radiusX = radiusX;
    this._radiusY = radiusY;
    this._rotation = rotation;
    this._startAngle = startAngle;
    this._endAngle = endAngle;

    // @private {boolean}
    this._anticlockwise = anticlockwise;

    this.invalidate();
  }

  kite.register( 'EllipticalArc', EllipticalArc );

  inherit( Segment, EllipticalArc, {
    /**
     * Sets the center of the EllipticalArc.
     * @public
     *
     * @param {Vector2} center
     * @returns {EllipticalArc}
     */
    setCenter: function( center ) {
      assert && assert( center instanceof Vector2, 'EllipticalArc center should be a Vector2: ' + center );
      assert && assert( center.isFinite(), 'EllipticalArc center should be finite: ' + center.toString() );

      if ( !this._center.equals( center ) ) {
        this._center = center;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set center( value ) { this.setCenter( value ); },

    /**
     * Returns the center of this EllipticalArc.
     * @public
     *
     * @returns {Vector2}
     */
    getCenter: function() {
      return this._center;
    },
    get center() { return this.getCenter(); },

    /**
     * Sets the semi-major radius of the EllipticalArc.
     * @public
     *
     * @param {number} radiusX
     * @returns {EllipticalArc}
     */
    setRadiusX: function( radiusX ) {
      assert && assert( typeof radiusX === 'number', 'EllipticalArc radiusX should be a number: ' + radiusX );
      assert && assert( isFinite( radiusX ), 'EllipticalArc radiusX should be a finite number: ' + radiusX );

      if ( this._radiusX !== radiusX ) {
        this._radiusX = radiusX;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set radiusX( value ) { this.setRadiusX( value ); },

    /**
     * Returns the semi-major radius of this EllipticalArc.
     * @public
     *
     * @returns {number}
     */
    getRadiusX: function() {
      return this._radiusX;
    },
    get radiusX() { return this.getRadiusX(); },

    /**
     * Sets the semi-minor radius of the EllipticalArc.
     * @public
     *
     * @param {number} radiusY
     * @returns {EllipticalArc}
     */
    setRadiusY: function( radiusY ) {
      assert && assert( typeof radiusY === 'number', 'EllipticalArc radiusY should be a number: ' + radiusY );
      assert && assert( isFinite( radiusY ), 'EllipticalArc radiusY should be a finite number: ' + radiusY );

      if ( this._radiusY !== radiusY ) {
        this._radiusY = radiusY;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set radiusY( value ) { this.setRadiusY( value ); },

    /**
     * Returns the semi-minor radius of this EllipticalArc.
     * @public
     *
     * @returns {number}
     */
    getRadiusY: function() {
      return this._radiusY;
    },
    get radiusY() { return this.getRadiusY(); },

    /**
     * Sets the rotation of the EllipticalArc.
     * @public
     *
     * @param {number} rotation
     * @returns {EllipticalArc}
     */
    setRotation: function( rotation ) {
      assert && assert( typeof rotation === 'number', 'EllipticalArc rotation should be a number: ' + rotation );
      assert && assert( isFinite( rotation ), 'EllipticalArc rotation should be a finite number: ' + rotation );

      if ( this._rotation !== rotation ) {
        this._rotation = rotation;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set rotation( value ) { this.setRotation( value ); },

    /**
     * Returns the rotation of this EllipticalArc.
     * @public
     *
     * @returns {number}
     */
    getRotation: function() {
      return this._rotation;
    },
    get rotation() { return this.getRotation(); },

    /**
     * Sets the startAngle of the EllipticalArc.
     * @public
     *
     * @param {number} startAngle
     * @returns {EllipticalArc}
     */
    setStartAngle: function( startAngle ) {
      assert && assert( typeof startAngle === 'number', 'EllipticalArc startAngle should be a number: ' + startAngle );
      assert && assert( isFinite( startAngle ), 'EllipticalArc startAngle should be a finite number: ' + startAngle );

      if ( this._startAngle !== startAngle ) {
        this._startAngle = startAngle;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set startAngle( value ) { this.setStartAngle( value ); },

    /**
     * Returns the startAngle of this EllipticalArc.
     * @public
     *
     * @returns {number}
     */
    getStartAngle: function() {
      return this._startAngle;
    },
    get startAngle() { return this.getStartAngle(); },

    /**
     * Sets the endAngle of the EllipticalArc.
     * @public
     *
     * @param {number} endAngle
     * @returns {EllipticalArc}
     */
    setEndAngle: function( endAngle ) {
      assert && assert( typeof endAngle === 'number', 'EllipticalArc endAngle should be a number: ' + endAngle );
      assert && assert( isFinite( endAngle ), 'EllipticalArc endAngle should be a finite number: ' + endAngle );

      if ( this._endAngle !== endAngle ) {
        this._endAngle = endAngle;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set endAngle( value ) { this.setEndAngle( value ); },

    /**
     * Returns the endAngle of this EllipticalArc.
     * @public
     *
     * @returns {number}
     */
    getEndAngle: function() {
      return this._endAngle;
    },
    get endAngle() { return this.getEndAngle(); },

    /**
     * Sets the anticlockwise of the EllipticalArc.
     * @public
     *
     * @param {boolean} anticlockwise
     * @returns {EllipticalArc}
     */
    setAnticlockwise: function( anticlockwise ) {
      assert && assert( typeof anticlockwise === 'boolean', 'EllipticalArc anticlockwise should be a boolean: ' + anticlockwise );

      if ( this._anticlockwise !== anticlockwise ) {
        this._anticlockwise = anticlockwise;
        this.invalidate();
      }
      return this; // allow chaining
    },
    set anticlockwise( value ) { this.setAnticlockwise( value ); },

    /**
     * Returns the anticlockwise of this EllipticalArc.
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

      // see http://mathworld.wolfram.com/Ellipse.html (59)
      var angle = this.angleAt( t );
      var aq = this._radiusX * Math.sin( angle );
      var bq = this._radiusY * Math.cos( angle );
      var denominator = Math.pow( bq * bq + aq * aq, 3 / 2 );
      return ( this._anticlockwise ? -1 : 1 ) * this._radiusX * this._radiusY / denominator;
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
        new kite.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angle0, angleT, this._anticlockwise ),
        new kite.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angleT, angle1, this._anticlockwise )
      ];
    },

    /**
     * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
     * @public
     */
    invalidate: function() {

      assert && assert( this._center instanceof Vector2, 'Arc center should be a Vector2' );
      assert && assert( this._center.isFinite(), 'Arc center should be finite (not NaN or infinite)' );
      assert && assert( typeof this._radiusX === 'number', 'Arc radiusX should be a number: ' + this._radiusX );
      assert && assert( isFinite( this._radiusX ), 'Arc radiusX should be a finite number: ' + this._radiusX );
      assert && assert( typeof this._radiusY === 'number', 'Arc radiusY should be a number: ' + this._radiusY );
      assert && assert( isFinite( this._radiusY ), 'Arc radiusY should be a finite number: ' + this._radiusY );
      assert && assert( typeof this._rotation === 'number', 'Arc rotation should be a number: ' + this._rotation );
      assert && assert( isFinite( this._rotation ), 'Arc rotation should be a finite number: ' + this._rotation );
      assert && assert( typeof this._startAngle === 'number', 'Arc startAngle should be a number: ' + this._startAngle );
      assert && assert( isFinite( this._startAngle ), 'Arc startAngle should be a finite number: ' + this._startAngle );
      assert && assert( typeof this._endAngle === 'number', 'Arc endAngle should be a number: ' + this._endAngle );
      assert && assert( isFinite( this._endAngle ), 'Arc endAngle should be a finite number: ' + this._endAngle );
      assert && assert( typeof this._anticlockwise === 'boolean', 'Arc anticlockwise should be a boolean: ' + this._anticlockwise );

      // Lazily-computed derived information
      this._unitTransform = null; // {Transform3|null} - Mapping between our ellipse and a unit circle
      this._start = null; // {Vector2|null}
      this._end = null; // {Vector2|null}
      this._startTangent = null; // {Vector2|null}
      this._endTangent = null; // {Vector2|null}
      this._actualEndAngle = null; // {number|null} - End angle in relation to our start angle (can get remapped)
      this._isFullPerimeter = null; // {boolean|null} - Whether it's a full ellipse (and not just an arc)
      this._angleDifference = null; // {number|null}
      this._unitArcSegment = null; // {Arc|null} - Corresponding circular arc for our unit transform.
      this._bounds = null; // {Bounds2|null}
      this._svgPathFragment = null; // {string|null}

      // remapping of negative radii
      if ( this._radiusX < 0 ) {
        // support this case since we might actually need to handle it inside of strokes?
        this._radiusX = -this._radiusX;
        this._startAngle = Math.PI - this._startAngle;
        this._endAngle = Math.PI - this._endAngle;
        this._anticlockwise = !this._anticlockwise;
      }
      if ( this._radiusY < 0 ) {
        // support this case since we might actually need to handle it inside of strokes?
        this._radiusY = -this._radiusY;
        this._startAngle = -this._startAngle;
        this._endAngle = -this._endAngle;
        this._anticlockwise = !this._anticlockwise;
      }
      if ( this._radiusX < this._radiusY ) {
        // swap radiusX and radiusY internally for consistent Canvas / SVG output
        this._rotation += Math.PI / 2;
        this._startAngle -= Math.PI / 2;
        this._endAngle -= Math.PI / 2;

        // swap radiusX and radiusY
        var tmpR = this._radiusX;
        this._radiusX = this._radiusY;
        this._radiusY = tmpR;
      }

      if ( this._radiusX < this._radiusY ) {
        // TODO: check this
        throw new Error( 'Not verified to work if radiusX < radiusY' );
      }

      // constraints shared with Arc
      assert && assert( !( ( !this._anticlockwise && this._endAngle - this._startAngle <= -Math.PI * 2 ) ||
                           ( this._anticlockwise && this._startAngle - this._endAngle <= -Math.PI * 2 ) ),
        'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
      assert && assert( !( ( !this._anticlockwise && this._endAngle - this._startAngle > Math.PI * 2 ) ||
                           ( this._anticlockwise && this._startAngle - this._endAngle > Math.PI * 2 ) ),
        'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );

      this.trigger0( 'invalidated' );
    },

    /**
     * Computes a transform that maps a unit circle into this ellipse's location.
     * @public
     *
     * Helpful, since we can get the parametric position of our unit circle (at t), and then transform it with this
     * transform to get the ellipse's parametric position (at t).
     *
     * @returns {Transform3}
     */
    getUnitTransform: function() {
      if ( this._unitTransform === null ) {
        this._unitTransform = EllipticalArc.computeUnitTransform( this._center, this._radiusX, this._radiusY, this._rotation );
      }
      return this._unitTransform;
    },
    get unitTransform() { return this.getUnitTransform(); },

    /**
     * Gets the start point of this ellipticalArc
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
     * Gets the end point of this ellipticalArc
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
     * Gets the tangent vector (normalized) to this ellipticalArc at the start, pointing in the direction of motion (from start to end)
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
     * Gets the tangent vector (normalized) to this ellipticalArc at the end point, pointing in the direction of motion (from start to end)
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
     * Gets the end angle in radians
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
     * Returns a boolean value that indicates if the arc wraps up by more than two Pi
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
     * Returns an angle difference that represents how "much" of the circle our arc covers
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
     * A unit arg segment that we can map to our ellipse. useful for hit testing and such.
     * @public
     *
     * @returns {Arc}
     */
    getUnitArcSegment: function() {
      if ( this._unitArcSegment === null ) {
        this._unitArcSegment = new kite.Arc( Vector2.ZERO, 1, this._startAngle, this._endAngle, this._anticlockwise );
      }
      return this._unitArcSegment;
    },
    get unitArcSegment() { return this.getUnitArcSegment(); },

    /**
     * Returns the bounds of this segment.
     * @public
     *
     * @returns {Bounds2}
     */
    getBounds: function() {
      if ( this._bounds === null ) {
        this._bounds = Bounds2.NOTHING.withPoint( this.getStart() )
          .withPoint( this.getEnd() );

        // if the angles are different, check extrema points
        if ( this._startAngle !== this._endAngle ) {
          // solve the mapping from the unit circle, find locations where a coordinate of the gradient is zero.
          // we find one extrema point for both x and y, since the other two are just rotated by pi from them.
          var xAngle = Math.atan( -( this._radiusY / this._radiusX ) * Math.tan( this._rotation ) );
          var yAngle = Math.atan( ( this._radiusY / this._radiusX ) / Math.tan( this._rotation ) );

          // check all of the extrema points
          this.possibleExtremaAngles = [
            xAngle,
            xAngle + Math.PI,
            yAngle,
            yAngle + Math.PI
          ];

          _.each( this.possibleExtremaAngles, this.includeBoundsAtAngle.bind( this ) );
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
      if ( this._radiusX <= 0 || this._radiusY <= 0 || this._startAngle === this._endAngle ) {
        return [];
      }
      else if ( this._radiusX === this._radiusY ) {
        // reduce to an Arc
        var startAngle = this._startAngle - this._rotation;
        var endAngle = this._endAngle - this._rotation;

        // preserve full circles
        if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
          endAngle = this._anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
        }
        return [ new kite.Arc( this._center, this._radiusX, startAngle, endAngle, this._anticlockwise ) ];
      }
      else {
        return [ this ];
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
      if ( this.unitArcSegment.containsAngle( angle ) ) {
        // the boundary point is in the arc
        this._bounds = this._bounds.withPoint( this.positionAtAngle( angle ) );
      }
    },

    /**
     * Maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
     * @public
     *
     * TODO: remove duplication with Arc
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
     * TODO: remove duplication with Arc
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
     *
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
      return this.getUnitTransform().transformPosition2( Vector2.createPolar( 1, angle ) );
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
      var normal = this.getUnitTransform().transformNormal2( Vector2.createPolar( 1, angle ) );

      return this._anticlockwise ? normal.perpendicular : normal.perpendicular.negated();
    },

    /**
     * Returns an array of straight lines that will draw an offset on the logical left (right) side for reverse false (true)
     * It discretizes the elliptical arc in 32 segments and returns an offset curve as a list of lineTos/
     * @public
     *
     * @param {number} r - distance
     * @param {boolean} reverse
     * @returns {Array.<Line>}
     */
    offsetTo: function( r, reverse ) {
      // how many segments to create (possibly make this more adaptive?)
      var quantity = 32;

      var points = [];
      var result = [];
      for ( var i = 0; i < quantity; i++ ) {
        var ratio = i / ( quantity - 1 );
        if ( reverse ) {
          ratio = 1 - ratio;
        }
        var angle = this.angleAt( ratio );

        points.push( this.positionAtAngle( angle ).plus( this.tangentAtAngle( angle ).perpendicular.normalized().times( r ) ) );
        if ( i > 0 ) {
          result.push( new kite.Line( points[ i - 1 ], points[ i ] ) );
        }
      }

      return result;
    },

    /**
     * Returns a string containing the SVG path. assumes that the start point is already provided,
     * so anything that calls this needs to put the M calls first.
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
        var degreesRotation = toDegrees( this._rotation ); // bleh, degrees?
        if ( this.getAngleDifference() < Math.PI * 2 - epsilon ) {
          largeArcFlag = this.getAngleDifference() < Math.PI ? '0' : '1';
          this._svgPathFragment = 'A ' + kite.svgNumber( this._radiusX ) + ' ' + kite.svgNumber( this._radiusY ) + ' ' + degreesRotation +
                                  ' ' + largeArcFlag + ' ' + sweepFlag + ' ' + kite.svgNumber( this.getEnd().x ) + ' ' + kite.svgNumber( this.getEnd().y );
        }
        else {
          // ellipse (or almost-ellipse) case needs to be handled differently
          // since SVG will not be able to draw (or know how to draw) the correct circle if we just have a start and end, we need to split it into two circular arcs

          // get the angle that is between and opposite of both of the points
          var splitOppositeAngle = ( this._startAngle + this._endAngle ) / 2; // this _should_ work for the modular case?
          var splitPoint = this.positionAtAngle( splitOppositeAngle );

          largeArcFlag = '0'; // since we split it in 2, it's always the small arc

          var firstArc = 'A ' + kite.svgNumber( this._radiusX ) + ' ' + kite.svgNumber( this._radiusY ) + ' ' +
                         degreesRotation + ' ' + largeArcFlag + ' ' + sweepFlag + ' ' +
                         kite.svgNumber( splitPoint.x ) + ' ' + kite.svgNumber( splitPoint.y );
          var secondArc = 'A ' + kite.svgNumber( this._radiusX ) + ' ' + kite.svgNumber( this._radiusY ) + ' ' +
                          degreesRotation + ' ' + largeArcFlag + ' ' + sweepFlag + ' ' +
                          kite.svgNumber( this.getEnd().x ) + ' ' + kite.svgNumber( this.getEnd().y );

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
     * Returns an array of straight lines  that will draw an offset on the logical left side.
     * @public
     *
     * @param {number} lineWidth
     * @returns {Array.<Line>}
     */
    strokeLeft: function( lineWidth ) {
      return this.offsetTo( -lineWidth / 2, false );
    },

    /**
     * Returns an array of straight lines that will draw an offset curve on the logical right side.
     * @public
     *
     * @param {number} lineWidth
     * @returns {Array.<Line>}
     */
    strokeRight: function( lineWidth ) {
      return this.offsetTo( lineWidth / 2, true );
    },

    /**
     * Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
     * Does not include t=0 and t=1.
     * @public
     *
     * @returns {Array.<number>}
     */
    getInteriorExtremaTs: function() {
      var self = this;
      var result = [];
      _.each( this.possibleExtremaAngles, function( angle ) {
        if ( self.unitArcSegment.containsAngle( angle ) ) {
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
     * @returns {Array.<RayIntersection>}
     */
    intersection: function( ray ) {
      // be lazy. transform it into the space of a non-elliptical arc.
      var unitTransform = this.getUnitTransform();
      var rayInUnitCircleSpace = unitTransform.inverseRay2( ray );
      var hits = this.getUnitArcSegment().intersection( rayInUnitCircleSpace );

      return _.map( hits, function( hit ) {
        var transformedPoint = unitTransform.transformPosition2( hit.point );
        var distance = ray.position.distance( transformedPoint );
        var normal = unitTransform.inverseNormal2( hit.normal );
        return new RayIntersection( distance, transformedPoint, normal, hit.wind, hit.t );
      } );
    },

    /**
     * Returns the resultant winding number of this ray intersecting this arc.
     * @public
     *
     * @param {Ray2} ray
     * @returns {number}
     */
    windingIntersection: function( ray ) {
      // be lazy. transform it into the space of a non-elliptical arc.
      var rayInUnitCircleSpace = this.getUnitTransform().inverseRay2( ray );
      return this.getUnitArcSegment().windingIntersection( rayInUnitCircleSpace );
    },

    /**
     * Draws this arc to the 2D Canvas context, assuming the context's current location is already at the start point
     * @public
     *
     * @param {CanvasRenderingContext2D} context
     */
    writeToContext: function( context ) {
      if ( context.ellipse ) {
        context.ellipse( this._center.x, this._center.y, this._radiusX, this._radiusY, this._rotation, this._startAngle, this._endAngle, this._anticlockwise );
      }
      else {
        // fake the ellipse call by using transforms
        this.getUnitTransform().getMatrix().canvasAppendTransform( context );
        context.arc( 0, 0, 1, this._startAngle, this._endAngle, this._anticlockwise );
        this.getUnitTransform().getInverse().canvasAppendTransform( context );
      }
    },

    /**
     * Returns this elliptical arc transformed by a matrix
     * @public
     *
     * @param {Matrix3} matrix
     * @returns {EllipticalArc}
     */
    transformed: function( matrix ) {
      var transformedSemiMajorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusX, this._rotation ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
      var transformedSemiMinorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusY, this._rotation + Math.PI / 2 ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
      var rotation = transformedSemiMajorAxis.angle;
      var radiusX = transformedSemiMajorAxis.magnitude;
      var radiusY = transformedSemiMinorAxis.magnitude;

      var reflected = matrix.getDeterminant() < 0;

      // reverse the 'clockwiseness' if our transform includes a reflection
      // TODO: check reflections. swapping angle signs should fix clockwiseness
      var anticlockwise = reflected ? !this._anticlockwise : this._anticlockwise;
      var startAngle = reflected ? -this._startAngle : this._startAngle;
      var endAngle = reflected ? -this._endAngle : this._endAngle;

      if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
        endAngle = anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
      }

      return new kite.EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );
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

      var sin0 = Math.sin( t0 );
      var sin1 = Math.sin( t1 );
      var cos0 = Math.cos( t0 );
      var cos1 = Math.cos( t1 );

      // Derived via Mathematica (curve-area.nb)
      return 0.5 * ( this._radiusX * this._radiusY * ( t1 - t0 ) +
                     Math.cos( this._rotation ) * ( this._radiusX * this._center.y * ( cos0 - cos1 ) +
                                                    this._radiusY * this._center.x * ( sin1 - sin0 ) ) +
                     Math.sin( this._rotation ) * ( this._radiusX * this._center.x * ( cos1 - cos0 ) +
                                                    this._radiusY * this._center.y * ( sin1 - sin0 ) ) );
    },

    /**
     * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
     * @public
     *
     * @returns {EllipticalArc}
     */
    reversed: function() {
      return new kite.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, this._endAngle, this._startAngle, !this._anticlockwise );
    },

    /**
     * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
     * @public
     *
     * @returns {Object}
     */
    serialize: function() {
      return {
        type: 'EllipticalArc',
        centerX: this._center.x,
        centerY: this._center.y,
        radiusX: this._radiusX,
        radiusY: this._radiusY,
        rotation: this._rotation,
        startAngle: this._startAngle,
        endAngle: this._endAngle,
        anticlockwise: this._anticlockwise
      };
    }
  } );

  /**
   * Returns an EllipticalArc from the serialized representation.
   * @public
   *
   * @param {Object} obj
   * @returns {EllipticalArc}
   */
  EllipticalArc.deserialize = function( obj ) {
    assert && assert( obj.type === 'EllipticalArc' );

    return new EllipticalArc( new Vector2( obj.centerX, obj.centerY ), obj.radiusX, obj.radiusY, obj.rotation, obj.startAngle, obj.endAngle, obj.anticlockwise );
  };

  /**
   * Determine whether two Arcs overlap over continuous sections, and if so finds the a,b pairs such that
   * p( t ) === q( a * t + b ).
   * @public
   *
   * @param {EllipticalArc} arc1
   * @param {EllipticalArc} arc2
   * @returns {Array.<Overlap>} - Any overlaps (from 0 to 2)
   */
  EllipticalArc.getOverlaps = function( arc1, arc2 ) {
    // Different centers can't overlap continuously
    if ( arc1._center.distance( arc2._center ) > 1e-8 ) {
      return [];
    }

    assert && assert( arc1._radiusX >= arc1._radiusY, 'Assume radiusX is the larger radius' );
    assert && assert( arc2._radiusX >= arc2._radiusY, 'Assume radiusX is the larger radius' );

    // Since radiusX >= radiusY, we don't need to check for reversals (x1=y2 and y1=x2).
    if ( Math.abs( arc1._radiusX - arc2._radiusX ) > 1e-8 ||
         Math.abs( arc1._radiusY - arc2._radiusY ) > 1e-8 ||
         // Difference between rotations should be an approximate multiple of pi. We add pi/2 before modulo, so the
         // result of that should be ~pi/2 (don't need to check both endpoints)
         Math.abs( Util.moduloBetweenDown( arc1._rotation - arc2._rotation + Math.PI / 2, 0, Math.PI ) - Math.PI / 2 ) > 1e-10 ) {
      return [];
    }

    return Arc.getAngularOverlaps( arc1._startAngle + arc1._rotation, arc1.getActualEndAngle() + arc1._rotation,
                                   arc2._startAngle + arc2._rotation, arc2.getActualEndAngle() + arc2._rotation );
  };

  /**
   * Transforms the unit circle into our ellipse.
   * @public
   *
   * adapted from http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
   *
   * @param {Vector2} center
   * @param {number} radiusX
   * @param {number} radiusY
   * @param {number} rotation
   * @returns {Transform3}
   */
  EllipticalArc.computeUnitTransform = function( center, radiusX, radiusY, rotation ) {
    return new Transform3( Matrix3.translation( center.x, center.y ) // TODO: convert to Matrix3.translation( this._center) when available
      .timesMatrix( Matrix3.rotation2( rotation ) )
      .timesMatrix( Matrix3.scaling( radiusX, radiusY ) ) );
  };

  return EllipticalArc;
} );
