// Copyright 2002-2014, University of Colorado Boulder

/**
 * Elliptical arc segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Transform3 = require( 'DOT/Transform3' );
  var toDegrees = require( 'DOT/Util' ).toDegrees;
  var DotUtil = require( 'DOT/Util' ); // eslint-disable-line require-statement-match

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  // TODO: notes at http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
  // Canvas notes were at http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-ellipse
  // context.ellipse was removed from the Canvas spec
  kite.EllipticalArc = Segment.EllipticalArc = function EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
    Segment.call( this );

    this._center = center;
    this._radiusX = radiusX;
    this._radiusY = radiusY;
    this._rotation = rotation;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;

    this.invalidate();
  };
  inherit( Segment, Segment.EllipticalArc, {

    // @public - Clears cached information, should be called when any of the 'constructor arguments' are mutated.
    invalidate: function() {
      // Lazily-computed derived information
      this._unitTransform = null; // {Transform3 | null} - Mapping between our ellipse and a unit circle
      this._start = null; // {Vector2 | null}
      this._end = null; // {Vector2 | null}
      this._startTangent = null; // {Vector2 | null}
      this._endTangent = null; // {Vector2 | null}
      this._actualEndAngle = null; // {number | null} - End angle in relation to our start angle (can get remapped)
      this._isFullPerimeter = null; // {boolean | null} - Whether it's a full ellipse (and not just an arc)
      this._angleDifference = null; // {number | null}
      this._unitArcSegment = null; // {Segment.Arc | null} - Corresponding circular arc for our unit transform.
      this._bounds = null; // {Bounds2 | null}

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

      // constraints shared with Segment.Arc
      assert && assert( !( ( !this.anticlockwise && this.endAngle - this.startAngle <= -Math.PI * 2 ) ||
                           ( this.anticlockwise && this.startAngle - this.endAngle <= -Math.PI * 2 ) ),
        'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
      assert && assert( !( ( !this.anticlockwise && this.endAngle - this.startAngle > Math.PI * 2 ) ||
                           ( this.anticlockwise && this.startAngle - this.endAngle > Math.PI * 2 ) ),
        'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
    },

    getUnitTransform: function() {
      if ( this._unitTransform === null ) {
        this._unitTransform = Segment.EllipticalArc.computeUnitTransform( this._center, this._radiusX, this._radiusY, this._rotation );
      }
      return this._unitTransform;
    },
    get unitTransform() { return this.getUnitTransform(); },

    getStart: function() {
      if ( this._start === null ) {
        this._start = this.positionAtAngle( this._startAngle );
      }
      return this._start;
    },
    get start() { return this.getStart(); },

    getEnd: function() {
      if ( this._end === null ) {
        this._end = this.positionAtAngle( this._endAngle );
      }
      return this._end;
    },
    get end() { return this.getEnd(); },

    getStartTangent: function() {
      if ( this._startTangent === null ) {
        this._startTangent = this.tangentAtAngle( this._startAngle );
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      if ( this._endTangent === null ) {
        this._endTangent = this.tangentAtAngle( this._endAngle );
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

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

    getIsFullPerimeter: function() {
      if ( this._isFullPerimeter === null ) {
        this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
      }
      return this._isFullPerimeter;
    },
    get isFullPerimeter() { return this.getIsFullPerimeter(); },

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

    // a unit arg segment that we can map to our ellipse. useful for hit testing and such.
    getUnitArcSegment: function() {
      if ( this._unitArcSegment === null ) {
        this._unitArcSegment = new kite.Arc( Vector2.ZERO, 1, this._startAngle, this._endAngle, this._anticlockwise );
      }
      return this._unitArcSegment;
    },

    // temporary shims
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

    includeBoundsAtAngle: function( angle ) {
      if ( this.containsAngle( angle ) ) {
        // the boundary point is in the arc
        this._bounds = this._bounds.withPoint( this.positionAtAngle( angle ) );
      }
    },

    // maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
    mapAngle: function( angle ) {
      // consider an assert that we contain that angle?
      return ( this._startAngle > this.getActualEndAngle() ) ?
             DotUtil.moduloBetweenUp( angle, this._startAngle - 2 * Math.PI, this._startAngle ) :
             DotUtil.moduloBetweenDown( angle, this._startAngle, this._startAngle + 2 * Math.PI );
    },

    tAtAngle: function( angle ) {
      return ( this.mapAngle( angle ) - this._startAngle ) / ( this.getActualEndAngle() - this._startAngle );
    },

    angleAt: function( t ) {
      return this._startAngle + ( this.getActualEndAngle() - this._startAngle ) * t;
    },

    positionAt: function( t ) {
      return this.positionAtAngle( this.angleAt( t ) );
    },

    tangentAt: function( t ) {
      return this.tangentAtAngle( this.angleAt( t ) );
    },

    curvatureAt: function( t ) {
      // see http://mathworld.wolfram.com/Ellipse.html (59)
      var angle = this.angleAt( t );
      var aq = this._radiusX * Math.sin( angle );
      var bq = this._radiusY * Math.cos( angle );
      var denominator = Math.pow( bq * bq + aq * aq, 3 / 2 );
      return ( this._anticlockwise ? -1 : 1 ) * this._radiusX * this._radiusY / denominator;
    },

    positionAtAngle: function( angle ) {
      return this.getUnitTransform().transformPosition2( Vector2.createPolar( 1, angle ) );
    },

    tangentAtAngle: function( angle ) {
      var normal = this.getUnitTransform().transformNormal2( Vector2.createPolar( 1, angle ) );

      return this._anticlockwise ? normal.perpendicular() : normal.perpendicular().negated();
    },

    // TODO: refactor? exact same as Segment.Arc
    containsAngle: function( angle ) {
      // transform the angle into the appropriate coordinate form
      // TODO: check anticlockwise version!
      var normalizedAngle = this._anticlockwise ? angle - this._endAngle : angle - this._startAngle;

      // get the angle between 0 and 2pi
      var positiveMinAngle = normalizedAngle % ( Math.PI * 2 );
      // check this because modular arithmetic with negative numbers reveal a negative number
      if ( positiveMinAngle < 0 ) {
        positiveMinAngle += Math.PI * 2;
      }

      return positiveMinAngle <= this.getAngleDifference();
    },

    // discretizes the elliptical arc and returns an offset curve as a list of lineTos
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

        points.push( this.positionAtAngle( angle ).plus( this.tangentAtAngle( angle ).perpendicular().normalized().times( r ) ) );
        if ( i > 0 ) {
          result.push( new kite.Line( points[ i - 1 ], points[ i ] ) );
        }
      }

      return result;
    },

    getSVGPathFragment: function() {
      // see http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands for more info
      // rx ry x-axis-rotation large-arc-flag sweep-flag x y
      var epsilon = 0.01; // allow some leeway to render things as 'almost circles'
      var sweepFlag = this._anticlockwise ? '0' : '1';
      var largeArcFlag;
      var degreesRotation = toDegrees( this._rotation ); // bleh, degrees?
      if ( this.getAngleDifference() < Math.PI * 2 - epsilon ) {
        largeArcFlag = this.getAngleDifference() < Math.PI ? '0' : '1';
        return 'A ' + kite.svgNumber( this._radiusX ) + ' ' + kite.svgNumber( this._radiusY ) + ' ' + degreesRotation +
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

        return firstArc + ' ' + secondArc;
      }
    },

    strokeLeft: function( lineWidth ) {
      return this.offsetTo( -lineWidth / 2, false );
    },

    strokeRight: function( lineWidth ) {
      return this.offsetTo( lineWidth / 2, true );
    },

    // not including 0 and 1
    getInteriorExtremaTs: function() {
      var that = this;
      var result = [];
      _.each( this.possibleExtremaAngles, function( angle ) {
        if ( that.containsAngle( angle ) ) {
          var t = that.tAtAngle( angle );
          var epsilon = 0.0000000001; // TODO: general kite epsilon?
          if ( t > epsilon && t < 1 - epsilon ) {
            result.push( t );
          }
        }
      } );
      return result.sort(); // modifies original, which is OK
    },

    subdivided: function( t ) {
      // TODO: verify that we don't need to switch anticlockwise here, or subtract 2pi off any angles
      var angle0 = this.angleAt( 0 );
      var angleT = this.angleAt( t );
      var angle1 = this.angleAt( 1 );
      return [
        new kite.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angle0, angleT, this._anticlockwise ),
        new kite.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angleT, angle1, this._anticlockwise )
      ];
    },

    intersection: function( ray ) {
      // be lazy. transform it into the space of a non-elliptical arc.
      var unitTransform = this.getUnitTransform();
      var rayInUnitCircleSpace = unitTransform.inverseRay2( ray );
      var hits = this.getUnitArcSegment().intersection( rayInUnitCircleSpace );

      return _.map( hits, function( hit ) {
        var transformedPoint = unitTransform.transformPosition2( hit.point );
        return {
          distance: ray.position.distance( transformedPoint ),
          point: transformedPoint,
          normal: unitTransform.inverseNormal2( hit.normal ),
          wind: hit.wind
        };
      } );
    },

    // returns the resultant winding number of this ray intersecting this segment.
    windingIntersection: function( ray ) {
      // be lazy. transform it into the space of a non-elliptical arc.
      var rayInUnitCircleSpace = this.getUnitTransform().inverseRay2( ray );
      return this.getUnitArcSegment().windingIntersection( rayInUnitCircleSpace );
    },

    // assumes the current position is at start
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

    transformed: function( matrix ) {
      var transformedSemiMajorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusX, this._rotation ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
      var transformedSemiMinorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusY, this._rotation + Math.PI / 2 ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
      var rotation = transformedSemiMajorAxis.angle();
      var radiusX = transformedSemiMajorAxis.magnitude();
      var radiusY = transformedSemiMinorAxis.magnitude();

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
    }
  } );

  Segment.addInvalidatingGetterSetter( Segment.EllipticalArc, 'center' );
  Segment.addInvalidatingGetterSetter( Segment.EllipticalArc, 'radiusX' );
  Segment.addInvalidatingGetterSetter( Segment.EllipticalArc, 'radiusY' );
  Segment.addInvalidatingGetterSetter( Segment.EllipticalArc, 'rotation' );
  Segment.addInvalidatingGetterSetter( Segment.EllipticalArc, 'startAngle' );
  Segment.addInvalidatingGetterSetter( Segment.EllipticalArc, 'endAngle' );
  Segment.addInvalidatingGetterSetter( Segment.EllipticalArc, 'anticlockwise' );

  // adapted from http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
  // transforms the unit circle onto our ellipse
  Segment.EllipticalArc.computeUnitTransform = function( center, radiusX, radiusY, rotation ) {
    return new Transform3( Matrix3.translation( center.x, center.y ) // TODO: convert to Matrix3.translation( this._center) when available
      .timesMatrix( Matrix3.rotation2( rotation ) )
      .timesMatrix( Matrix3.scaling( radiusX, radiusY ) ) );
  };

  return Segment.EllipticalArc;
} );
