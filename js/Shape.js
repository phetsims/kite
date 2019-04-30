// Copyright 2013-2015, University of Colorado Boulder

/**
 * Shape handling
 *
 * Shapes are internally made up of Subpaths, which contain a series of segments, and are optionally closed.
 * Familiarity with how Canvas handles subpaths is helpful for understanding this code.
 *
 * Canvas spec: http://www.w3.org/TR/2dcontext/
 * SVG spec: http://www.w3.org/TR/SVG/expanded-toc.html
 *           http://www.w3.org/TR/SVG/paths.html#PathData (for paths)
 * Notes for elliptical arcs: http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
 * Notes for painting strokes: https://svgwg.org/svg2-draft/painting.html
 *
 * TODO: add nonzero / evenodd support when browsers support it
 * TODO: docs
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var Arc = require( 'KITE/segments/Arc' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Cubic = require( 'KITE/segments/Cubic' );
  var EllipticalArc = require( 'KITE/segments/EllipticalArc' );
  var Events = require( 'AXON/Events' );
  var Graph = require( 'KITE/ops/Graph' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Line = require( 'KITE/segments/Line' );
  var LineStyles = require( 'KITE/util/LineStyles' );
  var Quadratic = require( 'KITE/segments/Quadratic' );
  var Ray2 = require( 'DOT/Ray2' );
  var Subpath = require( 'KITE/util/Subpath' );
  var svgPath = require( 'KITE/parser/svgPath' );
  var Vector2 = require( 'DOT/Vector2' );

  const randomSource = Math.random; // eslint-disable-line bad-sim-text (We can't get joist's random reference here)

  /**
   * Convenience function that returns a Vector2
   * used throughout this file as an abbreviation for a displacement, a position or a point.
   * @private
   * @param {number} x
   * @param {number} y
   * @returns {Vector2}
   */
  function v( x, y ) { return new Vector2( x, y ); }

  /**
   * The tension parameter controls how smoothly the curve turns through its control points. For a Catmull-Rom curve,
   * the tension is zero. The tension should range from -1 to 1.
   * @private
   * @param {Vector2} beforeVector
   * @param {Vector2} currentVector
   * @param {Vector2} afterVector
   * @param {number} tension - the tension should range from -1 to 1.
   * @returns {Vector2}
   */
  function weightedSplineVector( beforeVector, currentVector, afterVector, tension ) {
    return afterVector.copy()
      .subtract( beforeVector )
      .multiplyScalar( ( 1 - tension ) / 6 )
      .add( currentVector );
  }

  // a normalized vector for non-zero winding checks
  // var weirdDir = v( Math.PI, 22 / 7 );

  /**
   * @public
   * @constructor
   *
   * All arguments optional, they are for the copy() method. if used, ensure that 'bounds' is consistent with 'subpaths'
   *
   * @param {Array.<Subpath>} [subpaths]
   * @param {Bounds2} [bounds]
   */
  function Shape( subpaths, bounds ) {
    var self = this;

    Events.call( this );

    // @public {Array.<Subpath>} Lower-level piecewise mathematical description using segments, also
    // individually immutable
    this.subpaths = [];

    // @private {Bounds2} If non-null, computed bounds for all pieces added so far. Lazily computed with
    // getBounds/bounds ES5 getter
    this._bounds = bounds ? bounds.copy() : null; // {Bounds2 | null}

    this.resetControlPoints();

    // @private {function}
    this._invalidateListener = this.invalidate.bind( this );

    // @private {boolean} - So we can invalidate all of the points without firing invalidation tons of times
    this._invalidatingPoints = false;

    // @private {boolean} - When set by makeImmutable(), it indicates this Shape won't be changed from now on, and
    //                      attempts to change it may result in errors.
    this._immutable = false;

    // Add in subpaths from the constructor (if applicable)
    if ( typeof subpaths === 'object' ) {
      // assume it's an array
      for ( var i = 0; i < subpaths.length; i++ ) {
        this.addSubpath( subpaths[ i ] );
      }
    }

    if ( subpaths && typeof subpaths !== 'object' ) {
      assert && assert( typeof subpaths === 'string', 'if subpaths is not an object, it must be a string' );
      // parse the SVG path
      _.each( svgPath.parse( subpaths ), function( item ) {
        assert && assert( Shape.prototype[ item.cmd ] !== undefined, 'method ' + item.cmd + ' from parsed SVG does not exist' );
        self[ item.cmd ].apply( self, item.args );
      } );
    }

    // defines _bounds if not already defined (among other things)
    this.invalidate();
  }

  kite.register( 'Shape', Shape );

  inherit( Events, Shape, {

    /**
     * Resets the control points
     * @private
     *
     * for tracking the last quadratic/cubic control point for smooth* functions
     * see https://github.com/phetsims/kite/issues/38
     */
    resetControlPoints: function() {
      this.lastQuadraticControlPoint = null;
      this.lastCubicControlPoint = null;
    },

    /**
     * Sets the quadratic control point
     * @private
     *
     * @param {Vector2} point
     */
    setQuadraticControlPoint: function( point ) {
      this.lastQuadraticControlPoint = point;
      this.lastCubicControlPoint = null;
    },

    /**
     * Sets the cubic control point
     * @private
     *
     * @param {Vector2} point
     */
    setCubicControlPoint: function( point ) {
      this.lastQuadraticControlPoint = null;
      this.lastCubicControlPoint = point;
    },

    /**
     * Moves to a point given by the coordinates x and y
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @returns {Shape}
     */
    moveTo: function( x, y ) {
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.moveToPoint( v( x, y ) );
    },

    /**
     * Moves a relative displacement (x,y) from last point
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @returns {Shape}
     */
    moveToRelative: function( x, y ) {
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.moveToPointRelative( v( x, y ) );
    },

    /**
     * Moves a relative displacement (point) from last point
     * @public
     *
     * @param {Vector2} point - a displacement
     * @returns {Shape}
     */
    moveToPointRelative: function( point ) {
      return this.moveToPoint( this.getRelativePoint().plus( point ) );
    },

    /**
     * Adds to this shape a subpath that moves (no joint) it to a point
     * @public
     *
     * @param {Vector2} point
     * @returns {Shape}
     */
    moveToPoint: function( point ) {
      this.addSubpath( new Subpath().addPoint( point ) );
      this.resetControlPoints();

      return this; // for chaining
    },

    /**
     * Adds to this shape a straight line from last point to the coordinate (x,y)
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @returns {Shape}
     */
    lineTo: function( x, y ) {
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.lineToPoint( v( x, y ) );
    },

    /**
     * Adds to this shape a straight line displaced by a relative amount x, and y from last point
     * @public
     *
     * @param {number} x - horizontal displacement
     * @param {number} y - vertical displacement
     * @returns {Shape}
     */
    lineToRelative: function( x, y ) {
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.lineToPointRelative( v( x, y ) );
    },

    /**
     * Adds to this shape a straight line displaced by a relative displacement (point)
     * @public
     *
     * @param {Vector2} point - a displacement
     * @returns {Shape}
     */
    lineToPointRelative: function( point ) {
      return this.lineToPoint( this.getRelativePoint().plus( point ) );
    },

    /**
     * Adds to this shape a straight line from this lastPoint to point
     * @public
     *
     * @param {Vector2} point
     * @returns {Shape}
     */
    lineToPoint: function( point ) {
      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-lineto
      if ( this.hasSubpaths() ) {
        var start = this.getLastSubpath().getLastPoint();
        var end = point;
        var line = new Line( start, end );
        this.getLastSubpath().addPoint( end );
        this.addSegmentAndBounds( line );
      }
      else {
        this.ensure( point );
      }
      this.resetControlPoints();

      return this;  // for chaining
    },

    /**
     * Adds a horizontal line (x represents the x-coordinate of the end point)
     * @public
     *
     * @param {number} x
     * @returns {Shape}
     */
    horizontalLineTo: function( x ) {
      return this.lineTo( x, this.getRelativePoint().y );
    },

    /**
     * Adds a horizontal line (x represent a horizontal displacement)
     * @public
     *
     * @param {number} x
     * @returns {Shape}
     */
    horizontalLineToRelative: function( x ) {
      return this.lineToRelative( x, 0 );
    },

    /**
     * Adds a vertical line (y represents the y-coordinate of the end point)
     * @public
     *
     * @param {number} y
     * @returns {Shape}
     */
    verticalLineTo: function( y ) {
      return this.lineTo( this.getRelativePoint().x, y );
    },

    /**
     * Adds a vertical line (y represents a vertical displacement)
     * @public
     *
     * @param {number} y
     * @returns {Shape}
     */
    verticalLineToRelative: function( y ) {
      return this.lineToRelative( 0, y );
    },

    /**
     * Zig-zags between the current point and the specified point
     * @public
     *
     * @param {number} endX - the end of the shape
     * @param {number} endY - the end of the shape
     * @param {number} amplitude - the vertical amplitude of the zig zag wave
     * @param {number} numberZigZags - the number of oscillations
     * @param {boolean} symmetrical - flag for drawing a symmetrical zig zag
     */
    zigZagTo: function( endX, endY, amplitude, numberZigZags, symmetrical ) {
      return this.zigZagToPoint( new Vector2( endX, endY ), amplitude, numberZigZags, symmetrical );
    },

    /**
     * Zig-zags between the current point and the specified point.
     * Implementation moved from circuit-construction-kit-common on April 22, 2019.
     * @public
     *
     * @param {Vector2} endPoint - the end of the shape
     * @param {number} amplitude - the vertical amplitude of the zig zag wave, signed to choose initial direction
     * @param {number} numberZigZags - the number of complete oscillations
     * @param {boolean} symmetrical - flag for drawing a symmetrical zig zag
     * @public
     */
    zigZagToPoint: function( endPoint, amplitude, numberZigZags, symmetrical ) {
      this.ensure( endPoint );
      const startPoint = this.getLastPoint();
      const delta = endPoint.minus( startPoint );
      const directionUnitVector = delta.normalized();
      const amplitudeNormalVector = directionUnitVector.perpendicular.times( amplitude );
      const wavelength = delta.magnitude / numberZigZags;

      // Handles cases where zig zag symmetry is required.
      if ( symmetrical ) {
        for ( let i = 0; i < numberZigZags - 1; i++ ) {
          const yPos = startPoint.y + ( endPoint.y - startPoint.y ) / numberZigZags * ( i + 1 );
          if ( i % 2 === 0 ) {
            // zig
            this.lineTo( startPoint.x + amplitude, yPos );
          }
          else {
            // zag
            this.lineTo( startPoint.x, yPos );
          }
        }
      }
      else {
        for ( let i = 0; i < numberZigZags; i++ ) {
          const waveOrigin = directionUnitVector.times( i * wavelength ).plus( startPoint );
          const topPoint = waveOrigin.plus( directionUnitVector.times( wavelength / 4 ) ).plus( amplitudeNormalVector );
          const bottomPoint = waveOrigin.plus( directionUnitVector.times( 3 * wavelength / 4 ) ).minus( amplitudeNormalVector );
          this.lineToPoint( topPoint );
          this.lineToPoint( bottomPoint );
        }
      }
      return this.lineToPoint( endPoint );
    },

    /**
     * Adds a quadratic curve to this shape
     * @public
     *
     * The curve is guaranteed to pass through the coordinate (x,y) but does not pass through the control point
     *
     * @param {number} cpx - control point horizontal coordinate
     * @param {number} cpy - control point vertical coordinate
     * @param {number} x
     * @param {number} y
     * @returns {Shape}
     */
    quadraticCurveTo: function( cpx, cpy, x, y ) {
      assert && assert( typeof cpx === 'number' && isFinite( cpx ), 'cpx must be a finite number: ' + cpx );
      assert && assert( typeof cpy === 'number' && isFinite( cpy ), 'cpy must be a finite number: ' + cpy );
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.quadraticCurveToPoint( v( cpx, cpy ), v( x, y ) );
    },

    /**
     * Adds a quadratic curve to this shape. The control and final points are specified as displacment from the last
     * point in this shape
     * @public
     *
     * @param {number} cpx - control point horizontal coordinate
     * @param {number} cpy - control point vertical coordinate
     * @param {number} x - final x position of the quadratic curve
     * @param {number} y - final y position of the quadratic curve
     * @returns {Shape}
     */
    quadraticCurveToRelative: function( cpx, cpy, x, y ) {
      assert && assert( typeof cpx === 'number' && isFinite( cpx ), 'cpx must be a finite number: ' + cpx );
      assert && assert( typeof cpy === 'number' && isFinite( cpy ), 'cpy must be a finite number: ' + cpy );
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.quadraticCurveToPointRelative( v( cpx, cpy ), v( x, y ) );
    },

    /**
     * Adds a quadratic curve to this shape. The control and final points are specified as displacement from the
     * last point in this shape
     * @public
     *
     * @param {Vector2} controlPoint
     * @param {Vector2} point - the quadratic curve passes through this point
     * @returns {Shape}
     */
    quadraticCurveToPointRelative: function( controlPoint, point ) {
      var relativePoint = this.getRelativePoint();
      return this.quadraticCurveToPoint( relativePoint.plus( controlPoint ), relativePoint.plus( point ) );
    },

    /**
     * Adds a quadratic curve to this shape. The quadratic curves passes through the x and y coordinate.
     * The shape should join smoothly with the previous subpaths
     * @public
     *
     * TODO: consider a rename to put 'smooth' farther back?
     *
     * @param {number} x - final x position of the quadratic curve
     * @param {number} y - final y position of the quadratic curve
     * @returns {Shape}
     */
    smoothQuadraticCurveTo: function( x, y ) {
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.quadraticCurveToPoint( this.getSmoothQuadraticControlPoint(), v( x, y ) );
    },

    /**
     * Adds a quadratic curve to this shape. The quadratic curves passes through the x and y coordinate.
     * The shape should join smoothly with the previous subpaths
     * @public
     *
     * @param {number} x - final x position of the quadratic curve
     * @param {number} y - final y position of the quadratic curve
     * @returns {Shape}
     */
    smoothQuadraticCurveToRelative: function( x, y ) {
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.quadraticCurveToPoint( this.getSmoothQuadraticControlPoint(), v( x, y ).plus( this.getRelativePoint() ) );
    },

    /**
     * Adds a quadratic bezier curve to this shape.
     * @public
     *
     * @param {Vector2} controlPoint
     * @param {Vector2} point - the quadratic curve passes through this point
     * @returns {Shape}
     */
    quadraticCurveToPoint: function( controlPoint, point ) {
      var self = this;

      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-quadraticcurveto
      this.ensure( controlPoint );
      var start = this.getLastSubpath().getLastPoint();
      var quadratic = new Quadratic( start, controlPoint, point );
      this.getLastSubpath().addPoint( point );
      var nondegenerateSegments = quadratic.getNondegenerateSegments();
      _.each( nondegenerateSegments, function( segment ) {
        // TODO: optimization
        self.addSegmentAndBounds( segment );
      } );
      this.setQuadraticControlPoint( controlPoint );

      return this;  // for chaining
    },

    /**
     * Adds a cubic bezier curve to this shape.
     * @public
     *
     * @param {number} cp1x - control point 1,  horizontal coordinate
     * @param {number} cp1y - control point 1,  vertical coordinate
     * @param {number} cp2x - control point 2,  horizontal coordinate
     * @param {number} cp2y - control point 2,  vertical coordinate
     * @param {number} x - final x position of the cubic curve
     * @param {number} y - final y position of the cubic curve
     * @returns {Shape}
     */
    cubicCurveTo: function( cp1x, cp1y, cp2x, cp2y, x, y ) {
      assert && assert( typeof cp1x === 'number' && isFinite( cp1x ), 'cp1x must be a finite number: ' + cp1x );
      assert && assert( typeof cp1y === 'number' && isFinite( cp1y ), 'cp1y must be a finite number: ' + cp1y );
      assert && assert( typeof cp2x === 'number' && isFinite( cp2x ), 'cp2x must be a finite number: ' + cp2x );
      assert && assert( typeof cp2y === 'number' && isFinite( cp2y ), 'cp2y must be a finite number: ' + cp2y );
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.cubicCurveToPoint( v( cp1x, cp1y ), v( cp2x, cp2y ), v( x, y ) );
    },

    /**
     * @public
     *
     * @param {number} cp1x - control point 1,  horizontal displacement
     * @param {number} cp1y - control point 1,  vertical displacement
     * @param {number} cp2x - control point 2,  horizontal displacement
     * @param {number} cp2y - control point 2,  vertical displacement
     * @param {number} x - final horizontal displacement
     * @param {number} y - final vertical displacment
     * @returns {Shape}
     */
    cubicCurveToRelative: function( cp1x, cp1y, cp2x, cp2y, x, y ) {
      assert && assert( typeof cp1x === 'number' && isFinite( cp1x ), 'cp1x must be a finite number: ' + cp1x );
      assert && assert( typeof cp1y === 'number' && isFinite( cp1y ), 'cp1y must be a finite number: ' + cp1y );
      assert && assert( typeof cp2x === 'number' && isFinite( cp2x ), 'cp2x must be a finite number: ' + cp2x );
      assert && assert( typeof cp2y === 'number' && isFinite( cp2y ), 'cp2y must be a finite number: ' + cp2y );
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.cubicCurveToPointRelative( v( cp1x, cp1y ), v( cp2x, cp2y ), v( x, y ) );
    },

    /**
     * @public
     *
     * @param {Vector2} control1 - control displacement  1
     * @param {Vector2} control2 - control displacement 2
     * @param {Vector2} point - final displacement
     * @returns {Shape}
     */
    cubicCurveToPointRelative: function( control1, control2, point ) {
      var relativePoint = this.getRelativePoint();
      return this.cubicCurveToPoint( relativePoint.plus( control1 ), relativePoint.plus( control2 ), relativePoint.plus( point ) );
    },

    /**
     * @public
     *
     * @param {number} cp2x - control point 2,  horizontal coordinate
     * @param {number} cp2y - control point 2,  vertical coordinate
     * @param {number} x
     * @param {number} y
     * @returns {Shape}
     */
    smoothCubicCurveTo: function( cp2x, cp2y, x, y ) {
      assert && assert( typeof cp2x === 'number' && isFinite( cp2x ), 'cp2x must be a finite number: ' + cp2x );
      assert && assert( typeof cp2y === 'number' && isFinite( cp2y ), 'cp2y must be a finite number: ' + cp2y );
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.cubicCurveToPoint( this.getSmoothCubicControlPoint(), v( cp2x, cp2y ), v( x, y ) );
    },

    /**
     * @public
     *
     * @param {number} cp2x - control point 2,  horizontal coordinate
     * @param {number} cp2y - control point 2,  vertical coordinate
     * @param {number} x
     * @param {number} y
     * @returns {Shape}
     */
    smoothCubicCurveToRelative: function( cp2x, cp2y, x, y ) {
      assert && assert( typeof cp2x === 'number' && isFinite( cp2x ), 'cp2x must be a finite number: ' + cp2x );
      assert && assert( typeof cp2y === 'number' && isFinite( cp2y ), 'cp2y must be a finite number: ' + cp2y );
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      return this.cubicCurveToPoint( this.getSmoothCubicControlPoint(), v( cp2x, cp2y ).plus( this.getRelativePoint() ), v( x, y ).plus( this.getRelativePoint() ) );
    },

    /**
     * @public
     *
     * @param {Vector2} control1
     * @param {Vector2} control2
     * @param {Vector2} point
     * @returns {Shape}
     */
    cubicCurveToPoint: function( control1, control2, point ) {
      var self = this;
      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-quadraticcurveto
      this.ensure( control1 );
      var start = this.getLastSubpath().getLastPoint();
      var cubic = new Cubic( start, control1, control2, point );

      var nondegenerateSegments = cubic.getNondegenerateSegments();
      _.each( nondegenerateSegments, function( segment ) {
        self.addSegmentAndBounds( segment );
      } );
      this.getLastSubpath().addPoint( point );

      this.setCubicControlPoint( control2 );

      return this;  // for chaining
    },

    /**
     * @public
     *
     * @param {number} centerX - horizontal coordinate of the center of the arc
     * @param {number} centerY - Center of the arc
     * @param {number} radius - How far from the center the arc will be
     * @param {number} startAngle - Angle (radians) of the start of the arc
     * @param {number} endAngle - Angle (radians) of the end of the arc
     * @param {boolean} [anticlockwise] - Decides which direction the arc takes around the center
     * @returns {Shape}
     */
    arc: function( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) {
      assert && assert( typeof centerX === 'number' && isFinite( centerX ), 'centerX must be a finite number: ' + centerX );
      assert && assert( typeof centerY === 'number' && isFinite( centerY ), 'centerY must be a finite number: ' + centerY );
      return this.arcPoint( v( centerX, centerY ), radius, startAngle, endAngle, anticlockwise );
    },

    /**
     * @public
     *
     * @param {Vector2} center - Center of the arc (every point on the arc is equally far from the center)
     * @param {number} radius - How far from the center the arc will be
     * @param {number} startAngle - Angle (radians) of the start of the arc
     * @param {number} endAngle - Angle (radians) of the end of the arc
     * @param {boolean} [anticlockwise] - Decides which direction the arc takes around the center
     * @returns {Shape}
     */
    arcPoint: function( center, radius, startAngle, endAngle, anticlockwise ) {
      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-arc
      if ( anticlockwise === undefined ) {
        anticlockwise = false;
      }

      var arc = new Arc( center, radius, startAngle, endAngle, anticlockwise );

      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = arc.getStart();
      var endPoint = arc.getEnd();

      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint(), 0 ) ) {
        this.addSegmentAndBounds( new Line( this.getLastSubpath().getLastPoint(), startPoint ) );
      }

      if ( !this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
      }

      // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
      this.getLastSubpath().addPoint( startPoint );
      this.getLastSubpath().addPoint( endPoint );

      this.addSegmentAndBounds( arc );
      this.resetControlPoints();

      return this;  // for chaining
    },

    /**
     * Creates an elliptical arc
     * @public
     *
     * @param {number} centerX - horizontal coordinate of the center of the arc
     * @param {number} centerY -  vertical coordinate of the center of the arc
     * @param {number} radiusX - semi axis
     * @param {number} radiusY - semi axis
     * @param {number} rotation - rotation of the elliptical arc with respect to the
     * @param {number} startAngle
     * @param {number} endAngle
     * @param {boolean} [anticlockwise]
     * @returns {Shape}
     */
    ellipticalArc: function( centerX, centerY, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
      assert && assert( typeof centerX === 'number' && isFinite( centerX ), 'centerX must be a finite number: ' + centerX );
      assert && assert( typeof centerY === 'number' && isFinite( centerY ), 'centerY must be a finite number: ' + centerY );
      return this.ellipticalArcPoint( v( centerX, centerY ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );
    },

    /**
     * Creates an elliptic arc
     * @public
     *
     * @param {Vector2} center
     * @param {number} radiusX
     * @param {number} radiusY
     * @param {number} rotation - rotation of the arc with respect to the positive x axis.
     * @param {number} startAngle -
     * @param {number} endAngle
     * @param {boolean} [anticlockwise]
     * @returns {Shape}
     */
    ellipticalArcPoint: function( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-arc
      if ( anticlockwise === undefined ) {
        anticlockwise = false;
      }

      var ellipticalArc = new EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );

      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = ellipticalArc.start;
      var endPoint = ellipticalArc.end;

      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint(), 0 ) ) {
        this.addSegmentAndBounds( new Line( this.getLastSubpath().getLastPoint(), startPoint ) );
      }

      if ( !this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
      }

      // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
      this.getLastSubpath().addPoint( startPoint );
      this.getLastSubpath().addPoint( endPoint );

      this.addSegmentAndBounds( ellipticalArc );
      this.resetControlPoints();

      return this;  // for chaining
    },

    /**
     * Adds a subpath that joins the last point of this shape to the first point to form a closed shape
     * @public
     *
     * @returns {Shape}
     */
    close: function() {
      if ( this.hasSubpaths() ) {
        var previousPath = this.getLastSubpath();
        var nextPath = new Subpath();

        previousPath.close();
        this.addSubpath( nextPath );
        nextPath.addPoint( previousPath.getFirstPoint() );
      }
      this.resetControlPoints();
      return this;  // for chaining
    },

    /**
     * Moves to the next subpath, but without adding any points to it (like a moveTo would do).
     * @public
     *
     * This is particularly helpful for cases where you don't want to have to compute the explicit starting point of
     * the next subpath. For instance, if you want three disconnected circles:
     * - shape.circle( 50, 50, 20 ).newSubpath().circle( 100, 100, 20 ).newSubpath().circle( 150, 50, 20 )
     *
     * See https://github.com/phetsims/kite/issues/72 for more info.
     *
     * @returns {Shape}
     */
    newSubpath: function() {
      this.addSubpath( new Subpath() );
      this.resetControlPoints();

      return this; // for chaining
    },

    /**
     * Makes this Shape immutable, so that attempts to further change the Shape will fail. This allows clients to avoid
     * adding change listeners to this Shape.
     * @public
     *
     * @returns {Shape} - Self, for chaining
     */
    makeImmutable: function() {
      this._immutable = true;

      this.notifyInvalidationListeners();

      return this; // for chaining
    },

    /**
     * Returns whether this Shape is immutable (see makeImmutable for details).
     * @public
     *
     * @returns {boolean}
     */
    isImmutable: function() {
      return this._immutable;
    },

    /**
     * Matches SVG's elliptical arc from http://www.w3.org/TR/SVG/paths.html
     * @public
     *
     * WARNING: rotation (for now) is in DEGREES. This will probably change in the future.
     *
     * @param {number} radiusX - Semi-major axis size
     * @param {number} radiusY - Semi-minor axis size
     * @param {number} rotation - Rotation of the ellipse (its semi-major axis)
     * @param {boolean} largeArc - Whether the arc will go the longest route around the ellipse.
     * @param {boolean} sweep - Whether the arc made goes from start to end "clockwise" (opposite of anticlockwise flag)
     * @param {number} x - End point X location
     * @param {number} y - End point Y location
     * @returns {Shape} - this Shape for chaining
     */
    ellipticalArcToRelative: function( radiusX, radiusY, rotation, largeArc, sweep, x, y ) {
      var relativePoint = this.getRelativePoint();
      return this.ellipticalArcTo( radiusX, radiusY, rotation, largeArc, sweep, x + relativePoint.x, y + relativePoint.y );
    },

    /**
     * Matches SVG's elliptical arc from http://www.w3.org/TR/SVG/paths.html
     * @public
     *
     * WARNING: rotation (for now) is in DEGREES. This will probably change in the future.
     *
     * @param {number} radiusX - Semi-major axis size
     * @param {number} radiusY - Semi-minor axis size
     * @param {number} rotation - Rotation of the ellipse (its semi-major axis)
     * @param {boolean} largeArc - Whether the arc will go the longest route around the ellipse.
     * @param {boolean} sweep - Whether the arc made goes from start to end "clockwise" (opposite of anticlockwise flag)
     * @param {number} x - End point X location
     * @param {number} y - End point Y location
     * @returns {Shape} - this Shape for chaining
     */
    ellipticalArcTo: function( radiusX, radiusY, rotation, largeArc, sweep, x, y ) {
      // See "F.6.5 Conversion from endpoint to center parameterization"
      // in https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes

      var self = this;

      var endPoint = new Vector2( x, y );
      this.ensure( endPoint );

      var startPoint = this.getLastSubpath().getLastPoint();
      this.getLastSubpath().addPoint( endPoint );

      // Absolute value applied to radii (per SVG spec)
      if ( radiusX < 0 ) { radiusX *= -1.0; }
      if ( radiusY < 0 ) { radiusY *= -1.0; }

      var rxs = radiusX * radiusX;
      var rys = radiusY * radiusY;
      var prime = startPoint.minus( endPoint ).dividedScalar( 2 ).rotated( -rotation );
      var pxs = prime.x * prime.x;
      var pys = prime.y * prime.y;
      var centerPrime = new Vector2( radiusX * prime.y / radiusY, -radiusY * prime.x / radiusX );

      // If the radii are not large enough to accomodate the start/end point, apply F.6.6 correction
      var size = pxs / rxs + pys / rys;
      if ( size > 1 ) {
        radiusX *= Math.sqrt( size );
        radiusY *= Math.sqrt( size );

        // redo some computations from above
        rxs = radiusX * radiusX;
        rys = radiusY * radiusY;
        centerPrime = new Vector2( radiusX * prime.y / radiusY, -radiusY * prime.x / radiusX );
      }

      // Naming matches https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes for
      // F.6.5 Conversion from endpoint to center parameterization

      centerPrime.multiplyScalar( Math.sqrt( Math.max( 0, ( rxs * rys - rxs * pys - rys * pxs ) / ( rxs * pys + rys * pxs ) ) ) );
      if ( largeArc === sweep ) {
        // From spec: where the + sign is chosen if fA ≠ fS, and the − sign is chosen if fA = fS.
        centerPrime.multiplyScalar( -1 );
      }
      var center = startPoint.blend( endPoint, 0.5 ).plus( centerPrime.rotated( rotation ) );

      function signedAngle( u, v ) {
        // From spec: where the ± sign appearing here is the sign of ux vy − uy vx.
        return ( ( u.x * v.y - u.y * v.x ) > 0 ? 1 : -1 ) * u.angleBetween( v );
      }

      var victor = new Vector2( ( prime.x - centerPrime.x ) / radiusX, ( prime.y - centerPrime.y ) / radiusY );
      var ross = new Vector2( ( -prime.x - centerPrime.x ) / radiusX, ( -prime.y - centerPrime.y ) / radiusY );
      var startAngle = signedAngle( Vector2.X_UNIT, victor );
      var deltaAngle = signedAngle( victor, ross ) % ( Math.PI * 2 );

      // From spec:
      // > In other words, if fS = 0 and the right side of (F.6.5.6) is greater than 0, then subtract 360°, whereas if
      // > fS = 1 and the right side of (F.6.5.6) is less than 0, then add 360°. In all other cases leave it as is.
      if ( !sweep && deltaAngle > 0 ) {
        deltaAngle -= Math.PI * 2;
      }
      if ( sweep && deltaAngle < 0 ) {
        deltaAngle += Math.PI * 2;
      }

      // Standard handling of degenerate segments (particularly, converting elliptical arcs to circular arcs)
      var ellipticalArc = new EllipticalArc( center, radiusX, radiusY, rotation, startAngle, startAngle + deltaAngle, !sweep );
      var nondegenerateSegments = ellipticalArc.getNondegenerateSegments();
      _.each( nondegenerateSegments, function( segment ) {
        self.addSegmentAndBounds( segment );
      } );

      return this;
    },

    /**
     * Draws a circle using the arc() call with the following parameters:
     * circle( center, radius ) // center is a Vector2
     * circle( centerX, centerY, radius )
     * @public
     *
     * @param {Vector2|number} centerX
     * @param {number} centerY
     * @param {number} [radius]
     * @returns {Shape} - this shape for chaining
     */
    circle: function( centerX, centerY, radius ) {
      if ( typeof centerX === 'object' ) {
        // circle( center, radius )
        var center = centerX;
        radius = centerY;
        return this.arcPoint( center, radius, 0, Math.PI * 2, false ).close();
      }
      else {
        assert && assert( typeof centerX === 'number' && isFinite( centerX ), 'centerX must be a finite number: ' + centerX );
        assert && assert( typeof centerY === 'number' && isFinite( centerY ), 'centerY must be a finite number: ' + centerY );

        // circle( centerX, centerY, radius )
        return this.arcPoint( v( centerX, centerY ), radius, 0, Math.PI * 2, false ).close();
      }
    },

    /**
     * Draws an ellipse using the ellipticalArc() call with the following parameters:
     * ellipse( center, radiusX, radiusY, rotation ) // center is a Vector2
     * ellipse( centerX, centerY, radiusX, radiusY, rotation )
     * @public
     *
     * The rotation is about the centerX, centerY.
     *
     * @param {number|Vector2} centerX
     * @param {number} [centerY]
     * @param {number} radiusX
     * @param {number} radiusY
     * @param {number} rotation
     * @returns {Shape}
     */
    ellipse: function( centerX, centerY, radiusX, radiusY, rotation ) {
      // TODO: separate into ellipse() and ellipsePoint()?
      // TODO: Ellipse/EllipticalArc has a mess of parameters. Consider parameter object, or double-check parameter handling
      if ( typeof centerX === 'object' ) {
        // ellipse( center, radiusX, radiusY, rotation )
        var center = centerX;
        rotation = radiusY;
        radiusY = radiusX;
        radiusX = centerY;
        return this.ellipticalArcPoint( center, radiusX, radiusY, rotation || 0, 0, Math.PI * 2, false ).close();
      }
      else {
        assert && assert( typeof centerX === 'number' && isFinite( centerX ), 'centerX must be a finite number: ' + centerX );
        assert && assert( typeof centerY === 'number' && isFinite( centerY ), 'centerY must be a finite number: ' + centerY );

        // ellipse( centerX, centerY, radiusX, radiusY, rotation )
        return this.ellipticalArcPoint( v( centerX, centerY ), radiusX, radiusY, rotation || 0, 0, Math.PI * 2, false ).close();
      }
    },

    /**
     * Creates a rectangle shape
     * @public
     *
     * @param {number} x - left position
     * @param {number} y - bottom position (in non inverted cartesian system)
     * @param {number} width
     * @param {number} height
     * @returns {Shape}
     */
    rect: function( x, y, width, height ) {
      assert && assert( typeof x === 'number' && isFinite( x ), 'x must be a finite number: ' + x );
      assert && assert( typeof y === 'number' && isFinite( y ), 'y must be a finite number: ' + y );
      assert && assert( typeof width === 'number' && isFinite( width ), 'width must be a finite number: ' + width );
      assert && assert( typeof height === 'number' && isFinite( height ), 'height must be a finite number: ' + height );

      var subpath = new Subpath();
      this.addSubpath( subpath );
      subpath.addPoint( v( x, y ) );
      subpath.addPoint( v( x + width, y ) );
      subpath.addPoint( v( x + width, y + height ) );
      subpath.addPoint( v( x, y + height ) );
      this.addSegmentAndBounds( new Line( subpath.points[ 0 ], subpath.points[ 1 ] ) );
      this.addSegmentAndBounds( new Line( subpath.points[ 1 ], subpath.points[ 2 ] ) );
      this.addSegmentAndBounds( new Line( subpath.points[ 2 ], subpath.points[ 3 ] ) );
      subpath.close();
      this.addSubpath( new Subpath() );
      this.getLastSubpath().addPoint( v( x, y ) );
      assert && assert( !isNaN( this.bounds.getX() ) );
      this.resetControlPoints();

      return this;
    },

    /**
     * Creates a round rectangle. All arguments are number.
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @param {number} width - width of the rectangle
     * @param {number} height - height of the rectangle
     * @param {number} arcw - arc width
     * @param {number} arch - arc height
     * @returns {Shape}
     */
    roundRect: function( x, y, width, height, arcw, arch ) {
      var lowX = x + arcw;
      var highX = x + width - arcw;
      var lowY = y + arch;
      var highY = y + height - arch;
      // if ( true ) {
      if ( arcw === arch ) {
        // we can use circular arcs, which have well defined stroked offsets
        this
          .arc( highX, lowY, arcw, -Math.PI / 2, 0, false )
          .arc( highX, highY, arcw, 0, Math.PI / 2, false )
          .arc( lowX, highY, arcw, Math.PI / 2, Math.PI, false )
          .arc( lowX, lowY, arcw, Math.PI, Math.PI * 3 / 2, false )
          .close();
      }
      else {
        // we have to resort to elliptical arcs
        this
          .ellipticalArc( highX, lowY, arcw, arch, 0, -Math.PI / 2, 0, false )
          .ellipticalArc( highX, highY, arcw, arch, 0, 0, Math.PI / 2, false )
          .ellipticalArc( lowX, highY, arcw, arch, 0, Math.PI / 2, Math.PI, false )
          .ellipticalArc( lowX, lowY, arcw, arch, 0, Math.PI, Math.PI * 3 / 2, false )
          .close();
      }
      return this;
    },

    /**
     * Creates a polygon from an array of vertices.
     * @public
     *
     * @param {Array.<Vector2>} vertices
     * @returns {Shape}
     */
    polygon: function( vertices ) {
      var length = vertices.length;
      if ( length > 0 ) {
        this.moveToPoint( vertices[ 0 ] );
        for ( var i = 1; i < length; i++ ) {
          this.lineToPoint( vertices[ i ] );
        }
      }
      return this.close();
    },

    /**
     * This is a convenience function that allows to generate Cardinal splines
     * from a position array. Cardinal spline differs from Bezier curves in that all
     * defined points on a Cardinal spline are on the path itself.
     * @public
     *
     * It includes a tension parameter to allow the client to specify how tightly
     * the path interpolates between points. One can think of the tension as the tension in
     * a rubber band around pegs. however unlike a rubber band the tension can be negative.
     * the tension ranges from -1 to 1
     *
     * @param {Array.<Vector2>} positions
     * @param {Object} [options] - see documentation below
     * @returns {Shape}
     */
    cardinalSpline: function( positions, options ) {
      options = _.extend( {
        // the tension parameter controls how smoothly the curve turns through its
        // control points. For a Catmull-Rom curve the tension is zero.
        // the tension should range from  -1 to 1
        tension: 0,

        // is the resulting shape forming a closed line?
        isClosedLineSegments: false
      }, options );

      assert && assert( options.tension < 1 && options.tension > -1, ' the tension goes from -1 to 1 ' );

      var pointNumber = positions.length; // number of points in the array

      // if the line is open, there is one less segments than point vectors
      var segmentNumber = ( options.isClosedLineSegments ) ? pointNumber : pointNumber - 1;

      for ( var i = 0; i < segmentNumber; i++ ) {
        var cardinalPoints; // {Array.<Vector2>} cardinal points Array
        if ( i === 0 && !options.isClosedLineSegments ) {
          cardinalPoints = [
            positions[ 0 ],
            positions[ 0 ],
            positions[ 1 ],
            positions[ 2 ] ];
        }
        else if ( ( i === segmentNumber - 1 ) && !options.isClosedLineSegments ) {
          cardinalPoints = [
            positions[ i - 1 ],
            positions[ i ],
            positions[ i + 1 ],
            positions[ i + 1 ] ];
        }
        else {
          cardinalPoints = [
            positions[ ( i - 1 + pointNumber ) % pointNumber ],
            positions[ i % pointNumber ],
            positions[ ( i + 1 ) % pointNumber ],
            positions[ ( i + 2 ) % pointNumber ] ];
        }

        // Cardinal Spline to Cubic Bezier conversion matrix
        //    0                 1             0            0
        //  (-1+tension)/6      1      (1-tension)/6       0
        //    0            (1-tension)/6      1       (-1+tension)/6
        //    0                 0             1           0

        // {Array.<Vector2>} bezier points Array
        var bezierPoints = [
          cardinalPoints[ 1 ],
          weightedSplineVector( cardinalPoints[ 0 ], cardinalPoints[ 1 ], cardinalPoints[ 2 ], options.tension ),
          weightedSplineVector( cardinalPoints[ 3 ], cardinalPoints[ 2 ], cardinalPoints[ 1 ], options.tension ),
          cardinalPoints[ 2 ]
        ];

        // special operations on the first point
        if ( i === 0 ) {
          this.ensure( bezierPoints[ 0 ] );
          this.getLastSubpath().addPoint( bezierPoints[ 0 ] );
        }

        this.cubicCurveToPoint( bezierPoints[ 1 ], bezierPoints[ 2 ], bezierPoints[ 3 ] );
      }

      return this;
    },

    /**
     * Returns a copy of this shape
     * @public
     *
     * @returns {Shape}
     */
    copy: function() {
      // copy each individual subpath, so future modifications to either Shape doesn't affect the other one
      return new Shape( _.map( this.subpaths, function( subpath ) { return subpath.copy(); } ), this.bounds );
    },

    /**
     * Writes out this shape's path to a canvas 2d context. does NOT include the beginPath()!
     * @public
     *
     * @param {CanvasRenderingContext2D} context
     */
    writeToContext: function( context ) {
      var len = this.subpaths.length;
      for ( var i = 0; i < len; i++ ) {
        this.subpaths[ i ].writeToContext( context );
      }
    },

    /**
     * Returns something like "M150 0 L75 200 L225 200 Z" for a triangle
     * @public
     *
     * @returns {string}
     */
    getSVGPath: function() {
      var string = '';
      var len = this.subpaths.length;
      for ( var i = 0; i < len; i++ ) {
        var subpath = this.subpaths[ i ];
        if ( subpath.isDrawable() ) {
          // since the commands after this are relative to the previous 'point', we need to specify a move to the initial point
          var startPoint = subpath.segments[ 0 ].start;

          string += 'M ' + kite.svgNumber( startPoint.x ) + ' ' + kite.svgNumber( startPoint.y ) + ' ';

          for ( var k = 0; k < subpath.segments.length; k++ ) {
            string += subpath.segments[ k ].getSVGPathFragment() + ' ';
          }

          if ( subpath.isClosed() ) {
            string += 'Z ';
          }
        }
      }
      return string;
    },

    /**
     * Returns a new Shape that is transformed by the associated matrix
     * @public
     *
     * @param {Matrix3} matrix
     * @returns {Shape}
     */
    transformed: function( matrix ) {
      // TODO: allocation reduction
      var subpaths = _.map( this.subpaths, function( subpath ) { return subpath.transformed( matrix ); } );
      var bounds = _.reduce( subpaths, function( bounds, subpath ) { return bounds.union( subpath.bounds ); }, Bounds2.NOTHING );
      return new Shape( subpaths, bounds );
    },

    /**
     * Converts this subpath to a new shape made of many line segments (approximating the current shape) with the
     * transformation applied.
     * @public
     *
     * Provided options (see Segment.nonlinearTransformed)
     * - minLevels:                       how many levels to force subdivisions
     * - maxLevels:                       prevent subdivision past this level
     * - distanceEpsilon (optional null): controls level of subdivision by attempting to ensure a maximum (squared) deviation from the curve. smaller => more subdivision
     * - curveEpsilon (optional null):    controls level of subdivision by attempting to ensure a maximum curvature change between segments. smaller => more subdivision
     * -   OR includeCurvature:           {boolean}, whether to include a default curveEpsilon (usually off by default)
     * - pointMap (optional):             function( Vector2 ) : Vector2, represents a (usually non-linear) transformation applied
     * - methodName (optional):           if the method name is found on the segment, it is called with the expected signature function( options ) : Array[Segment]
     *                                    instead of using our brute-force logic. Supports optimizations for custom non-linear transforms (like polar coordinates)
     * @param {Object} [options]
     * @returns {Shape}
     */
    nonlinearTransformed: function( options ) {
      // defaults
      options = _.extend( {
        minLevels: 0,
        maxLevels: 7,
        distanceEpsilon: 0.16, // NOTE: this will change when the Shape is scaled, since this is a threshold for the square of a distance value
        curveEpsilon: ( options && options.includeCurvature ) ? 0.002 : null
      }, options );

      // TODO: allocation reduction
      var subpaths = _.map( this.subpaths, function( subpath ) { return subpath.nonlinearTransformed( options ); } );
      var bounds = _.reduce( subpaths, function( bounds, subpath ) { return bounds.union( subpath.bounds ); }, Bounds2.NOTHING );
      return new Shape( subpaths, bounds );
    },

    /**
     * Maps points by treating their x coordinate as polar angle, and y coordinate as polar magnitude.
     * See http://en.wikipedia.org/wiki/Polar_coordinate_system
     * @public
     *
     * Please see Shape.nonlinearTransformed for more documentation on adaptive discretization options (minLevels, maxLevels, distanceEpsilon, curveEpsilon)
     *
     * Example: A line from (0,10) to (pi,10) will be transformed to a circular arc from (10,0) to (-10,0) passing through (0,10).
     *
     * @param {Object} [options]
     * @returns {Shape}
     */
    polarToCartesian: function( options ) {
      return this.nonlinearTransformed( _.extend( {
        pointMap: function( p ) {
          return Vector2.createPolar( p.y, p.x );
          // return new Vector2( p.y * Math.cos( p.x ), p.y * Math.sin( p.x ) );
        },
        methodName: 'polarToCartesian' // this will be called on Segments if it exists to do more optimized conversion (see Line)
      }, options ) );
    },

    /**
     * Converts each segment into lines, using an adaptive (midpoint distance subdivision) method.
     * @public
     *
     * NOTE: uses nonlinearTransformed method internally, but since we don't provide a pointMap or methodName, it won't create anything but line segments.
     * See nonlinearTransformed for documentation of options
     *
     * @param {Object} [options]
     * @returns {Shape}
     */
    toPiecewiseLinear: function( options ) {
      assert && assert( !options.pointMap, 'No pointMap for toPiecewiseLinear allowed, since it could create non-linear segments' );
      assert && assert( !options.methodName, 'No methodName for toPiecewiseLinear allowed, since it could create non-linear segments' );
      return this.nonlinearTransformed( options );
    },

    /**
     * Is this point contained in this shape
     * @public
     *
     * @param {Vector2} point
     * @returns {boolean}
     */
    containsPoint: function( point ) {
      // we pick a ray, and determine the winding number over that ray. if the number of segments crossing it CCW == number of segments crossing it CW, then the point is contained in the shape
      var ray = new Ray2( point, Vector2.X_UNIT );

      return this.windingIntersection( ray ) !== 0;
    },

    /**
     * Hit-tests this shape with the ray. An array of all intersections of the ray with this shape will be returned.
     * For details, see the documentation in Segment.js
     * @public
     *
     * @param {Ray2} ray
     * @returns {Array.<Intersection>} - See Segment.js for details. For this function, intersections will be returned
     *                                   sorted by the distance from the ray's location.
     */
    intersection: function( ray ) {
      var hits = [];
      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[ i ];

        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            var segment = subpath.segments[ k ];
            hits = hits.concat( segment.intersection( ray ) );
          }

          if ( subpath.hasClosingSegment() ) {
            hits = hits.concat( subpath.getClosingSegment().intersection( ray ) );
          }
        }
      }
      return _.sortBy( hits, function( hit ) { return hit.distance; } );
    },

    /**
     * Returns whether the provided line segment would have some part on top or touching the interior (filled area) of
     * this shape.
     * @public
     *
     * This differs somewhat from an intersection of the line segment with the Shape's path, as we will return true
     * ("intersection") if the line segment is entirely contained in the interior of the Shape's path.
     *
     * @param {Vector2} startPoint - One end of the line segment
     * @param {Vector2} endPoint - The other end of the line segment
     * @returns {boolean}
     */
    interiorIntersectsLineSegment: function( startPoint, endPoint ) {
      // First check if our midpoint is in the Shape (as either our midpoint is in the Shape, OR the line segment will
      // intersect the Shape's boundary path).
      var midpoint = startPoint.blend( endPoint, 0.5 );
      if ( this.containsPoint( midpoint ) ) {
        return true;
      }

      // TODO: if an issue, we can reduce this allocation to a scratch variable local in the Shape.js scope.
      var delta = endPoint.minus( startPoint );
      var length = delta.magnitude;

      if ( length === 0 ) {
        return false;
      }

      delta.normalize(); // so we can use it as a unit vector, expected by the Ray

      // Grab all intersections (that are from startPoint towards the direction of endPoint)
      var hits = this.intersection( new Ray2( startPoint, delta ) );

      // See if we have any intersections along our infinite ray whose distance from the startPoint is less than or
      // equal to our line segment's length.
      for ( var i = 0; i < hits.length; i++ ) {
        if ( hits[ i ].distance <= length ) {
          return true;
        }
      }

      // Did not hit the boundary, and wasn't fully contained.
      return false;
    },

    /**
     * Returns the winding number for intersection with a ray
     * @public
     *
     * @param {Ray2} ray
     * @returns {number}
     */
    windingIntersection: function( ray ) {
      var wind = 0;

      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[ i ];

        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            wind += subpath.segments[ k ].windingIntersection( ray );
          }

          // handle the implicit closing line segment
          if ( subpath.hasClosingSegment() ) {
            wind += subpath.getClosingSegment().windingIntersection( ray );
          }
        }
      }

      return wind;
    },

    /**
     * Whether the path of the Shape intersects (or is contained in) the provided bounding box.
     * Computed by checking intersections with all four edges of the bounding box, or whether the Shape is totally
     * contained within the bounding box.
     * @public
     *
     * @param {Bounds2} bounds
     * @returns {boolean}
     */
    intersectsBounds: function( bounds ) {
      // If the bounding box completely surrounds our shape, it intersects the bounds
      if ( this.bounds.intersection( bounds ).equals( this.bounds ) ) {
        return true;
      }

      // rays for hit testing along the bounding box edges
      var minHorizontalRay = new Ray2( new Vector2( bounds.minX, bounds.minY ), new Vector2( 1, 0 ) );
      var minVerticalRay = new Ray2( new Vector2( bounds.minX, bounds.minY ), new Vector2( 0, 1 ) );
      var maxHorizontalRay = new Ray2( new Vector2( bounds.maxX, bounds.maxY ), new Vector2( -1, 0 ) );
      var maxVerticalRay = new Ray2( new Vector2( bounds.maxX, bounds.maxY ), new Vector2( 0, -1 ) );

      var hitPoint;
      var i;
      // TODO: could optimize to intersect differently so we bail sooner
      var horizontalRayIntersections = this.intersection( minHorizontalRay ).concat( this.intersection( maxHorizontalRay ) );
      for ( i = 0; i < horizontalRayIntersections.length; i++ ) {
        hitPoint = horizontalRayIntersections[ i ].point;
        if ( hitPoint.x >= bounds.minX && hitPoint.x <= bounds.maxX ) {
          return true;
        }
      }

      var verticalRayIntersections = this.intersection( minVerticalRay ).concat( this.intersection( maxVerticalRay ) );
      for ( i = 0; i < verticalRayIntersections.length; i++ ) {
        hitPoint = verticalRayIntersections[ i ].point;
        if ( hitPoint.y >= bounds.minY && hitPoint.y <= bounds.maxY ) {
          return true;
        }
      }

      // not contained, and no intersections with the sides of the bounding box
      return false;
    },

    /**
     * Returns a new Shape that is an outline of the stroked path of this current Shape. currently not intended to be
     * nested (doesn't do intersection computations yet)
     * @public
     *
     * TODO: rename stroked( lineStyles )?
     *
     * @param {LineStyles} lineStyles
     * @returns {Shape}
     */
    getStrokedShape: function( lineStyles ) {
      var subpaths = [];
      var bounds = Bounds2.NOTHING.copy();
      var subLen = this.subpaths.length;
      for ( var i = 0; i < subLen; i++ ) {
        var subpath = this.subpaths[ i ];
        var strokedSubpath = subpath.stroked( lineStyles );
        subpaths = subpaths.concat( strokedSubpath );
      }
      subLen = subpaths.length;
      for ( i = 0; i < subLen; i++ ) {
        bounds.includeBounds( subpaths[ i ].bounds );
      }
      return new Shape( subpaths, bounds );
    },

    /**
     * Gets a shape offset by a certain amount.
     * @public
     *
     * @param {number} distance
     * @returns {Shape}
     */
    getOffsetShape: function( distance ) {
      // TODO: abstract away this type of behavior
      var subpaths = [];
      var bounds = Bounds2.NOTHING.copy();
      var subLen = this.subpaths.length;
      for ( var i = 0; i < subLen; i++ ) {
        subpaths.push( this.subpaths[ i ].offset( distance ) );
      }
      subLen = subpaths.length;
      for ( i = 0; i < subLen; i++ ) {
        bounds.includeBounds( subpaths[ i ].bounds );
      }
      return new Shape( subpaths, bounds );
    },

    /**
     * Returns a copy of this subpath with the dash "holes" removed (has many subpaths usually).
     * @public
     *
     * @param {Array.<number>} lineDash
     * @param {number} lineDashOffset
     * @param {number} [distanceEpsilon] - controls level of subdivision by attempting to ensure a maximum (squared)
     *                                   deviation from the curve
     * @param {number} [curveEpsilon] - controls level of subdivision by attempting to ensure a maximum curvature change
     *                                between segments
     * @returns {Array.<Subpath>}
     */
    getDashedShape: function( lineDash, lineDashOffset, options ) {
      options = _.extend( {
        distanceEpsilon: 1e-10,
        curveEpsilon: 1e-8
      }, options );

      return new Shape( _.flatten( this.subpaths.map( function( subpath ) {
        return subpath.dashed( lineDash, lineDashOffset, options.distanceEpsilon, options.curveEpsilon );
      } ) ) );
    },

    /**
     * Returns the bounds of this shape. It is the bounding-box union of the bounds of each subpath contained.
     * @public
     *
     * @returns {Bounds2}
     */
    getBounds: function() {
      if ( this._bounds === null ) {
        var bounds = Bounds2.NOTHING.copy();
        _.each( this.subpaths, function( subpath ) {
          bounds.includeBounds( subpath.getBounds() );
        } );
        this._bounds = bounds;
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    /**
     * Returns the bounds for a stroked version of this shape. The input lineStyles are used to determine the size and
     * style of the stroke, and then the bounds of the stroked shape are returned.
     * @public
     *
     * @param {LineStyles} lineStyles
     * @returns {Bounds2}
     */
    getStrokedBounds: function( lineStyles ) {
      assert && assert( lineStyles instanceof LineStyles );

      // Check if all of our segments end vertically or horizontally AND our drawable subpaths are all closed. If so,
      // we can apply a bounds dilation.
      var areStrokedBoundsDilated = true;
      for ( var i = 0; i < this.subpaths.length; i++ ) {
        var subpath = this.subpaths[ i ];

        // If a subpath with any segments is NOT closed, line-caps will apply. We can't make the simplification in this
        // case.
        if ( subpath.isDrawable() && !subpath.isClosed() ) {
          areStrokedBoundsDilated = false;
          break;
        }
        for ( var j = 0; j < subpath.segments.length; j++ ) {
          var segment = subpath.segments[ j ];
          if ( !segment.areStrokedBoundsDilated() ) {
            areStrokedBoundsDilated = false;
            break;
          }
        }
      }

      if ( areStrokedBoundsDilated ) {
        return this.bounds.dilated( lineStyles.lineWidth / 2 );
      }
      else {
        var bounds = this.bounds.copy();
        for ( i = 0; i < this.subpaths.length; i++ ) {
          var subpaths = this.subpaths[ i ].stroked( lineStyles );
          for ( j = 0; j < subpaths.length; j++ ) {
            bounds.includeBounds( subpaths[ j ].bounds );
          }
        }
        return bounds;
      }
    },

    /**
     * Returns a simplified form of this shape.
     * @public
     *
     * Runs it through the normal CAG process, which should combine areas where possible, handles self-intersection,
     * etc.
     *
     * NOTE: Currently (2017-10-04) adjacent segments may get simplified only if they are lines. Not yet complete.
     *
     * @returns {Shape}
     */
    getSimplifiedAreaShape: function() {
      return Graph.simplifyNonZero( this );
    },

    /**
     * @public
     *
     * @param {Matrix3} matrix
     * @param {LineStyles} [lineStyles]
     * @returns {Bounds2}
     */
    getBoundsWithTransform: function( matrix, lineStyles ) {
      var bounds = Bounds2.NOTHING.copy();

      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[ i ];
        bounds.includeBounds( subpath.getBoundsWithTransform( matrix ) );
      }

      if ( lineStyles ) {
        bounds.includeBounds( this.getStrokedShape( lineStyles ).getBoundsWithTransform( matrix ) );
      }

      return bounds;
    },

    /**
     * Return an approximate value of the area inside of this Shape (where containsPoint is true) using Monte-Carlo.
     * @public
     *
     * NOTE: Generally, use getArea(). This can be used for verification, but takes a large number of samples.
     *
     * @param {number} numSamples - How many times to randomly check for inclusion of points.
     * @returns {number}
     */
    getApproximateArea: function( numSamples ) {
      var x = this.bounds.minX;
      var y = this.bounds.minY;
      var width = this.bounds.width;
      var height = this.bounds.height;

      var rectangleArea = width * height;
      var count = 0;
      var point = new Vector2( 0, 0 );
      for ( var i = 0; i < numSamples; i++ ) {
        point.x = x + randomSource() * width;
        point.y = y + randomSource() * height;
        if ( this.containsPoint( point ) ) {
          count++;
        }
      }
      return rectangleArea * count / numSamples;
    },

    /**
     * Return the area inside of the Shape (where containsPoint is true), assuming there is no self-intersection or
     * overlap, and the same orientation (winding order) is used. Should also support holes (with opposite orientation),
     * assuming they don't intersect the containing subpath.
     * @public
     *
     * @returns {number}
     */
    getNonoverlappingArea: function() {
      // Only absolute-value the final value.
      return Math.abs( _.sum( this.subpaths.map( function( subpath ) {
        return _.sum( subpath.getFillSegments().map( function( segment ) {
          return segment.getSignedAreaFragment();
        } ) );
      } ) ) );
    },

    /**
     * Returns the area inside of the shape.
     * @public
     *
     * NOTE: This requires running it through a lot of computation to determine a non-overlapping non-self-intersecting
     *       form first. If the Shape is "simple" enough, getNonoverlappingArea would be preferred.
     *
     * @returns {number}
     */
    getArea: function() {
      return this.getSimplifiedAreaShape().getNonoverlappingArea();
    },

    /**
     * Return the approximate location of the centroid of the Shape (the average of all points where containsPoint is true)
     * using Monte-Carlo methods.
     * @public
     *
     * @param {number} numSamples - How many times to randomly check for inclusion of points.
     * @returns {number}
     */
    getApproximateCentroid: function( numSamples ) {
      var x = this.bounds.minX;
      var y = this.bounds.minY;
      var width = this.bounds.width;
      var height = this.bounds.height;

      var count = 0;
      var sum = new Vector2( 0, 0 );
      var point = new Vector2( 0, 0 );
      for ( var i = 0; i < numSamples; i++ ) {
        point.x = x + randomSource() * width;
        point.y = y + randomSource() * height;
        if ( this.containsPoint( point ) ) {
          sum.add( point );
          count++;
        }
      }
      return sum.dividedScalar( count );
    },

    /**
     * Should be called after mutating the x/y of Vector2 points that were passed in to various Shape calls, so that
     * derived information computed (bounds, etc.) will be correct, and any clients (e.g. Scenery Paths) will be
     * notified of the updates.
     * @public
     */
    invalidatePoints: function() {
      this._invalidatingPoints = true;

      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        this.subpaths[ i ].invalidatePoints();
      }

      this._invalidatingPoints = false;
      this.invalidate();
    },

    /**
     * @public
     *
     * @returns {string}
     */
    toString: function() {
      // TODO: consider a more verbose but safer way?
      return 'new kite.Shape( \'' + this.getSVGPath() + '\' )';
    },

    /*---------------------------------------------------------------------------*
     * Internal subpath computations
     *----------------------------------------------------------------------------*/

    /**
     * @private
     */
    invalidate: function() {
      assert && assert( !this._immutable, 'Attempt to modify an immutable Shape' );

      if ( !this._invalidatingPoints ) {
        this._bounds = null;

        this.notifyInvalidationListeners();
      }
    },

    /**
     * Called when a part of the Shape has changed, or if metadata on the Shape has changed (e.g. it became immutable).
     * @private
     */
    notifyInvalidationListeners: function() {
      this.trigger0( 'invalidated' );
    },

    /**
     * @private
     *
     * @param {Segment} segment
     */
    addSegmentAndBounds: function( segment ) {
      this.getLastSubpath().addSegment( segment );
      this.invalidate();
    },

    /**
     * Makes sure that we have a subpath (and if there is no subpath, start it at this point)
     * @private
     *
     * @param {Vector2} point
     */
    ensure: function( point ) {
      if ( !this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
        this.getLastSubpath().addPoint( point );
      }
    },

    /**
     * Adds a subpath
     * @private
     *
     * @param {Subpath} subpath
     */
    addSubpath: function( subpath ) {
      this.subpaths.push( subpath );

      // listen to when the subpath is invalidated (will cause bounds recomputation here)
      subpath.onStatic( 'invalidated', this._invalidateListener );

      this.invalidate();

      return this; // allow chaining
    },

    /**
     * Determines if there are any subpaths
     * @private
     *
     * @returns {boolean}
     */
    hasSubpaths: function() {
      return this.subpaths.length > 0;
    },

    /**
     * Gets the last subpath
     * @private
     *
     * @returns {Subpath}
     */
    getLastSubpath: function() {
      return _.last( this.subpaths );
    },

    /**
     * Gets the last point in the last subpath, or null if it doesn't exist
     * @private
     *
     * @returns {Subpath|null}
     */
    getLastPoint: function() {
      return this.hasSubpaths() ? this.getLastSubpath().getLastPoint() : null;
    },

    /**
     * Gets the last drawable segment in the last subpath, or null if it doesn't exist
     * @private
     *
     * @returns {Segment|null}
     */
    getLastSegment: function() {
      if ( !this.hasSubpaths() ) { return null; }

      var subpath = this.getLastSubpath();
      if ( !subpath.isDrawable() ) { return null; }

      return subpath.getLastSegment();
    },

    /**
     * Returns the control point to be used to create a smooth quadratic segments
     * @private
     *
     * @returns {Vector2}
     */
    getSmoothQuadraticControlPoint: function() {
      var lastPoint = this.getLastPoint();

      if ( this.lastQuadraticControlPoint ) {
        return lastPoint.plus( lastPoint.minus( this.lastQuadraticControlPoint ) );
      }
      else {
        return lastPoint;
      }
    },

    /**
     * Returns the control point to be used to create a smooth cubic segment
     * @private
     *
     * @returns {Vector2}
     */
    getSmoothCubicControlPoint: function() {
      var lastPoint = this.getLastPoint();

      if ( this.lastCubicControlPoint ) {
        return lastPoint.plus( lastPoint.minus( this.lastCubicControlPoint ) );
      }
      else {
        return lastPoint;
      }
    },

    /**
     * Returns the last point in the last subpath, or the Vector ZERO if it doesn't exist
     * @private
     *
     * @returns {Vector2}
     */
    getRelativePoint: function() {
      var lastPoint = this.getLastPoint();
      return lastPoint ? lastPoint : Vector2.ZERO;
    },

    /**
     * Returns a new shape that contains a union of the two shapes (a point in either shape is in the resulting shape).
     * @public
     *
     * @param {Shape} shape
     * @returns {Shape}
     */
    shapeUnion: function( shape ) {
      return Graph.binaryResult( this, shape, Graph.BINARY_NONZERO_UNION );
    },

    /**
     * Returns a new shape that contains the intersection of the two shapes (a point in both shapes is in the
     * resulting shape).
     * @public
     *
     * @param {Shape} shape
     * @returns {Shape}
     */
    shapeIntersection: function( shape ) {
      return Graph.binaryResult( this, shape, Graph.BINARY_NONZERO_INTERSECTION );
    },

    /**
     * Returns a new shape that contains the difference of the two shapes (a point in the first shape and NOT in the
     * second shape is in the resulting shape).
     * @public
     *
     * @param {Shape} shape
     * @returns {Shape}
     */
    shapeDifference: function( shape ) {
      return Graph.binaryResult( this, shape, Graph.BINARY_NONZERO_DIFFERENCE );
    },

    /**
     * Returns a new shape that contains the xor of the two shapes (a point in only one shape is in the resulting
     * shape).
     * @public
     *
     * @param {Shape} shape
     * @returns {Shape}
     */
    shapeXor: function( shape ) {
      return Graph.binaryResult( this, shape, Graph.BINARY_NONZERO_XOR );
    },

    /**
     * Returns a new shape that only contains portions of segments that are within the passed-in shape's area.
     * @public
     *
     * @param {Shape} shape
     * @param {Object} [options] - See Graph.clipShape options
     * @returns {Shape}
     */
    shapeClip: function( shape, options ) {
      return Graph.clipShape( shape, this, options );
    },

    /**
     * Returns the (sometimes approximate) arc length of all of the shape's subpaths combined.
     * @public
     *
     * @param {number} [distanceEpsilon]
     * @param {number} [curveEpsilon]
     * @param {number} [maxLevels]
     * @returns {number}
     */
    getArcLength: function( distanceEpsilon, curveEpsilon, maxLevels ) {
      var length = 0;
      for ( var i = 0; i < this.subpaths.length; i++ ) {
        length += this.subpaths[ i ].getArcLength( distanceEpsilon, curveEpsilon, maxLevels );
      }
      return length;
    },

    /**
     * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
     * @public
     *
     * @returns {Object}
     */
    serialize: function() {
      return {
        type: 'Shape',
        subpaths: this.subpaths.map( function( subpath ) {
          return subpath.serialize();
        } )
      };
    }
  } );

  /**
   * Returns a Shape from the serialized representation.
   * @public
   *
   * @param {Object} obj
   * @returns {Shape}
   */
  Shape.deserialize = function( obj ) {
    assert && assert( obj.type === 'Shape' );

    return new Shape( obj.subpaths.map( Subpath.deserialize ) );
  };

  /*---------------------------------------------------------------------------*
   * Shape shortcuts
   *----------------------------------------------------------------------------*/

  /**
   * Creates a rectangle
   * @public
   *
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @returns {Shape}
   */
  Shape.rectangle = function( x, y, width, height ) {
    return new Shape().rect( x, y, width, height );
  };
  Shape.rect = Shape.rectangle;

  /**
   * Creates a round rectangle {Shape}, with {number} arguments. Uses circular or elliptical arcs if given.
   * @public
   *
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} arcw
   * @param {number} arch
   * @returns {Shape}
   */
  Shape.roundRect = function( x, y, width, height, arcw, arch ) {
    return new Shape().roundRect( x, y, width, height, arcw, arch );
  };
  Shape.roundRectangle = Shape.roundRect;

  /**
   * Creates a rounded rectangle, where each corner can have a different radius. The radii default to 0, and may be set
   * using topLeft, topRight, bottomLeft and bottomRight in the options.
   * @public
   *
   * E.g.:
   *
   * var cornerRadius = 20;
   * var rect = Shape.roundedRectangleWithRadii( 0, 0, 200, 100, {
   *   topLeft: cornerRadius,
   *   topRight: cornerRadius
   * } );
   *
   * @param {number} x - Left edge location
   * @param {number} y - Top edge location
   * @param {number} width - Width of rectangle
   * @param {number} height - Height of rectangle
   * @param {Object} [cornerRadii] - Optional object with potential radii for each corner.
   * @returns {Shape}
   */
  Shape.roundedRectangleWithRadii = function( x, y, width, height, cornerRadii ) {
    // defaults to 0 (not using _.extends, since we reference each multiple times)
    var topLeftRadius = cornerRadii && cornerRadii.topLeft || 0;
    var topRightRadius = cornerRadii && cornerRadii.topRight || 0;
    var bottomLeftRadius = cornerRadii && cornerRadii.bottomLeft || 0;
    var bottomRightRadius = cornerRadii && cornerRadii.bottomRight || 0;

    // type and constraint assertions
    assert && assert( typeof x === 'number' && isFinite( x ), 'Non-finite x' );
    assert && assert( typeof y === 'number' && isFinite( y ), 'Non-finite y' );
    assert && assert( typeof width === 'number' && width >= 0 && isFinite( width ), 'Negative or non-finite width' );
    assert && assert( typeof height === 'number' && height >= 0 && isFinite( height ), 'Negative or non-finite height' );
    assert && assert( typeof topLeftRadius === 'number' && topLeftRadius >= 0 && isFinite( topLeftRadius ),
      'Invalid topLeft' );
    assert && assert( typeof topRightRadius === 'number' && topRightRadius >= 0 && isFinite( topRightRadius ),
      'Invalid topRight' );
    assert && assert( typeof bottomLeftRadius === 'number' && bottomLeftRadius >= 0 && isFinite( bottomLeftRadius ),
      'Invalid bottomLeft' );
    assert && assert( typeof bottomRightRadius === 'number' && bottomRightRadius >= 0 && isFinite( bottomRightRadius ),
      'Invalid bottomRight' );

    // verify there is no overlap between corners
    assert && assert( topLeftRadius + topRightRadius <= width, 'Corner overlap on top edge' );
    assert && assert( bottomLeftRadius + bottomRightRadius <= width, 'Corner overlap on bottom edge' );
    assert && assert( topLeftRadius + bottomLeftRadius <= height, 'Corner overlap on left edge' );
    assert && assert( topRightRadius + bottomRightRadius <= height, 'Corner overlap on right edge' );

    var shape = new kite.Shape();
    var right = x + width;
    var bottom = y + height;

    // To draw the rounded rectangle, we use the implicit "line from last segment to next segment" and the close() for
    // all of the straight line edges between arcs, or lineTo the corner.

    if ( bottomRightRadius > 0 ) {
      shape.arc( right - bottomRightRadius, bottom - bottomRightRadius, bottomRightRadius, 0, Math.PI / 2, false );
    }
    else {
      shape.moveTo( right, bottom );
    }

    if ( bottomLeftRadius > 0 ) {
      shape.arc( x + bottomLeftRadius, bottom - bottomLeftRadius, bottomLeftRadius, Math.PI / 2, Math.PI, false );
    }
    else {
      shape.lineTo( x, bottom );
    }

    if ( topLeftRadius > 0 ) {
      shape.arc( x + topLeftRadius, y + topLeftRadius, topLeftRadius, Math.PI, 3 * Math.PI / 2, false );
    }
    else {
      shape.lineTo( x, y );
    }

    if ( topRightRadius > 0 ) {
      shape.arc( right - topRightRadius, y + topRightRadius, topRightRadius, 3 * Math.PI / 2, 2 * Math.PI, false );
    }
    else {
      shape.lineTo( right, y );
    }

    shape.close();

    return shape;
  };

  /**
   * Returns a Shape from a bounds, offset by certain amounts, and with certain corner radii.
   * @public
   *
   * @param {Bounds2} bounds
   * @param {Object} offsets - { left, top, right, bottom }, all numbers. Determines how to expand the bounds
   * @param {Object} radii - See Shape.roundedRectangleWithRadii
   * @returns {Shape}
   */
  Shape.boundsOffsetWithRadii = function( bounds, offsets, radii ) {
    const offsetBounds = bounds.withOffsets( offsets.left, offsets.top, offsets.right, offsets.bottom );
    return Shape.roundedRectangleWithRadii( offsetBounds.minX, offsetBounds.minY, offsetBounds.width, offsetBounds.height, radii );
  };

  /**
   * Creates a closed polygon from an array of vertices by connecting them by a series of lines.
   * The lines are joining the adjacent vertices in the array.
   * @public
   *
   * @param {Array.<Vector2>} vertices
   * @returns {Shape}
   */
  Shape.polygon = function( vertices ) {
    return new Shape().polygon( vertices );
  };

  /**
   * Creates a rectangular shape from bounds
   * @public
   *
   * @param {Bounds2} bounds
   * @returns {Shape}
   */
  Shape.bounds = function( bounds ) {
    return new Shape().rect( bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY );
  };

  /**
   * Creates a line segment, using either (x1,y1,x2,y2) or ({x1,y1},{x2,y2}) arguments
   * @public
   *
   * @param {number|Vector2} a
   * @param {number|Vector2} b
   * @param {number} [c]
   * @param {number} [d]
   * @returns {Shape}
   */
  Shape.lineSegment = function( a, b, c, d ) {
    // TODO: add type assertions?
    if ( typeof a === 'number' ) {
      return new Shape().moveTo( a, b ).lineTo( c, d );
    }
    else {
      // then a and b must be {Vector2}
      return new Shape().moveToPoint( a ).lineToPoint( b );
    }
  };

  /**
   * Returns a regular polygon of radius and number of sides
   * The regular polygon is oriented such that the first vertex lies on the positive x-axis.
   * @public
   *
   * @param {number} sides - an integer
   * @param {number} radius
   * @returns {Shape}
   */
  Shape.regularPolygon = function( sides, radius ) {
    var shape = new Shape();
    _.each( _.range( sides ), function( k ) {
      var point = Vector2.createPolar( radius, 2 * Math.PI * k / sides );
      ( k === 0 ) ? shape.moveToPoint( point ) : shape.lineToPoint( point );
    } );
    return shape.close();
  };

  /**
   * Creates a circle
   * supports both circle( centerX, centerY, radius ), circle( center, radius ), and circle( radius ) with the center default to 0,0
   * @public
   *
   * @param {Vector2|number} centerX
   * @param {number} [centerY]
   * @param {number} [radius]
   * @returns {Shape}
   */
  Shape.circle = function( centerX, centerY, radius ) {
    if ( centerY === undefined ) {
      // circle( radius ), center = 0,0
      return new Shape().circle( 0, 0, centerX );
    }
    return new Shape().circle( centerX, centerY, radius );
  };

  /**
   * Supports ellipse( centerX, centerY, radiusX, radiusY, rotation ), ellipse( center, radiusX, radiusY, rotation ), and ellipse( radiusX, radiusY, rotation )
   * with the center default to 0,0 and rotation of 0.  The rotation is about the centerX, centerY.
   * @public
   *
   * @param {number|Vector2} centerX
   * @param {number} [centerY]
   * @param {number|Vector2} radiusX
   * @param {number} [radiusY]
   * @param {number} rotation
   * @returns {Shape}
   */
  Shape.ellipse = function( centerX, centerY, radiusX, radiusY, rotation ) {
    // TODO: Ellipse/EllipticalArc has a mess of parameters. Consider parameter object, or double-check parameter handling
    if ( radiusY === undefined ) {
      // ellipse( radiusX, radiusY ), center = 0,0
      return new Shape().ellipse( 0, 0, centerX, centerY, radiusX );
    }
    return new Shape().ellipse( centerX, centerY, radiusX, radiusY, rotation );
  };

  /**
   * Supports both arc( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) and arc( center, radius, startAngle, endAngle, anticlockwise )
   * @public
   *
   * @param {Vector2|number} centerX
   * @param {number} [centerY]
   * @param {number} radius - How far from the center the arc will be
   * @param {number} startAngle - Angle (radians) of the start of the arc
   * @param {number} endAngle - Angle (radians) of the end of the arc
   * @param {boolean} [anticlockwise] - Decides which direction the arc takes around the center
   * @returns {Shape}
   */
  Shape.arc = function( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) {
    return new Shape().arc( centerX, centerY, radius, startAngle, endAngle, anticlockwise );
  };

  /**
   * Returns the union of an array of shapes.
   * @public
   *
   * @param {Array.<Shape>}
   * @returns {Shape}
   */
  Shape.union = function( shapes ) {
    return Graph.unionNonZero( shapes );
  };

  /**
   * Returns the intersection of an array of shapes.
   * @public
   *
   * @param {Array.<Shape>}
   * @returns {Shape}
   */
  Shape.intersection = function( shapes ) {
    return Graph.intersectionNonZero( shapes );
  };

  /**
   * Returns the xor of an array of shapes.
   * @public
   *
   * @param {Array.<Shape>}
   * @returns {Shape}
   */
  Shape.xor = function( shapes ) {
    return Graph.xorNonZero( shapes );
  };

  /**
   * Returns a new Shape constructed by appending a list of segments together.
   * @public
   *
   * @param {Array.<Segment>} segments
   * @param {boolean} [closed]
   * @returns {Shape}
   */
  Shape.segments = function( segments, closed ) {
    if ( assert ) {
      for ( var i = 1; i < segments.length; i++ ) {
        assert( segments[ i - 1 ].end.equalsEpsilon( segments[ i ].start, 1e-6 ), 'Mismatched start/end' );
      }
    }

    return new Shape( [ new Subpath( segments, undefined, !!closed ) ] );
  };

  return Shape;
} );
