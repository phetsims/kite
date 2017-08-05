// Copyright 2013-2015, University of Colorado Boulder

/**
 * Styles needed to determine a stroked line shape.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var kite = require( 'KITE/kite' );
  var Util = require( 'DOT/Util' );
  var inherit = require( 'PHET_CORE/inherit' );

  var Arc = require( 'KITE/segments/Arc' );
  var Line = require( 'KITE/segments/Line' );

  // constants
  var lineLineIntersection = Util.lineLineIntersection;

  var DEFAULT_OPTIONS = {
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineDashOffset: 0,
    miterLimit: 10
  };

  /**
   *
   * @param {Object} [args]
   * @constructor
   */
  function LineStyles( args ) {
    if ( args === undefined ) {
      args = {};
    }
    this.lineWidth = args.lineWidth !== undefined ? args.lineWidth : DEFAULT_OPTIONS.lineWidth;
    this.lineCap = args.lineCap !== undefined ? args.lineCap : DEFAULT_OPTIONS.lineCap; // butt, round, square
    this.lineJoin = args.lineJoin !== undefined ? args.lineJoin : DEFAULT_OPTIONS.lineJoin; // miter, round, bevel
    this.lineDash = args.lineDash ? args.lineDash : []; // [] is default, otherwise an array of numbers
    this.lineDashOffset = args.lineDashOffset !== undefined ? args.lineDashOffset : DEFAULT_OPTIONS.lineDashOffset; // 0 default, any number
    this.miterLimit = args.miterLimit !== undefined ? args.miterLimit : DEFAULT_OPTIONS.miterLimit; // see https://svgwg.org/svg2-draft/painting.html for miterLimit computations

    assert && assert( Array.isArray( this.lineDash ) );
  }

  kite.register( 'LineStyles', LineStyles );

  inherit( Object, LineStyles, {

    /**
     * Determines of this lineStyles is equal to the other LineStyles
     * @param {Object} other - arguments of LineStyles
     * @returns {boolean}
     */
    equals: function( other ) {
      var typical = this.lineWidth === other.lineWidth &&
                    this.lineCap === other.lineCap &&
                    this.lineJoin === other.lineJoin &&
                    this.miterLimit === other.miterLimit &&
                    this.lineDashOffset === other.lineDashOffset;
      if ( !typical ) {
        return false;
      }

      if ( this.lineDash.length === other.lineDash.length ) {
        for ( var i = 0; i < this.lineDash.length; i++ ) {
          if ( this.lineDash[ i ] !== other.lineDash[ i ] ) {
            return false;
          }
        }
      }
      else {
        // line dashes must be different
        return false;
      }

      return true;
    },

    /**
     * Creates an array of Segments that make up a line join, to the left side.
     *
     * Joins two segments together on the logical "left" side, at 'center' (where they meet), and un-normalized tangent
     * vectors in the direction of the stroking. To join on the "right" side, switch the tangent order and negate them.
     *
     * @param {Vector2} center
     * @param {Vector2} fromTangent
     * @param {Vector2} toTangent
     * @returns {Array.<Line>|null}
     */
    leftJoin: function( center, fromTangent, toTangent ) {
      fromTangent = fromTangent.normalized();
      toTangent = toTangent.normalized();

      // where our join path starts and ends
      var fromPoint = center.plus( fromTangent.perpendicular().negated().times( this.lineWidth / 2 ) );
      var toPoint = center.plus( toTangent.perpendicular().negated().times( this.lineWidth / 2 ) );

      var bevel = ( fromPoint.equals( toPoint ) ? [] : [ new Line( fromPoint, toPoint ) ] );

      // only insert a join on the non-acute-angle side
      if ( fromTangent.perpendicular().dot( toTangent ) > 0 ) {
        switch( this.lineJoin ) {
          case 'round':
            var fromAngle = fromTangent.angle() + Math.PI / 2;
            var toAngle = toTangent.angle() + Math.PI / 2;
            return [ new Arc( center, this.lineWidth / 2, fromAngle, toAngle, true ) ];
          case 'miter':
            var theta = fromTangent.angleBetween( toTangent.negated() );
            if ( 1 / Math.sin( theta / 2 ) <= this.miterLimit && theta < Math.PI - 0.00001 ) {
              // draw the miter
              var miterPoint = lineLineIntersection( fromPoint, fromPoint.plus( fromTangent ), toPoint, toPoint.plus( toTangent ) );
              return [
                new Line( fromPoint, miterPoint ),
                new Line( miterPoint, toPoint )
              ];
            }
            else {
              // angle too steep, use bevel instead. same as below, but copied for linter
              return bevel;
            }
          case 'bevel':
            return bevel;
          default:
            throw new Error( 'invalid lineJoin: ' + this.lineJoin );
        }
      }
      else {
        // no join necessary here since we have the acute angle. just simple lineTo for now so that the next segment starts from the right place
        // TODO: can we prevent self-intersection here?
        return bevel;
      }
    },

    /**
     * Creates an array of Segments that make up a line join, to the right side.
     *
     * Joins two segments together on the logical "right" side, at 'center' (where they meet), and normalized tangent
     * vectors in the direction of the stroking. To join on the "left" side, switch the tangent order and negate them.
     * @param {Vector2} center
     * @param {Vector2} fromTangent
     * @param {Vector2} toTangent
     * @returns {Array.<Line>|null}
     */
    rightJoin: function( center, fromTangent, toTangent ) {
      return this.leftJoin( center, toTangent.negated(), fromTangent.negated() );
    },

    /**
     * Creates an array of Segments that make up a line cap from the endpoint 'center' in the direction of the tangent
     *
     * @param {Vector2} center
     * @param {Vector2} tangent
     * @returns {Array.<Arc>|Array.<Line>}
     */
    cap: function( center, tangent ) {
      tangent = tangent.normalized();

      var fromPoint = center.plus( tangent.perpendicular().times( -this.lineWidth / 2 ) );
      var toPoint = center.plus( tangent.perpendicular().times( this.lineWidth / 2 ) );

      switch( this.lineCap ) {
        case 'butt':
          return [ new Line( fromPoint, toPoint ) ];
        case 'round':
          var tangentAngle = tangent.angle();
          return [ new Arc( center, this.lineWidth / 2, tangentAngle + Math.PI / 2, tangentAngle - Math.PI / 2, true ) ];
        case 'square':
          var toLeft = tangent.perpendicular().negated().times( this.lineWidth / 2 );
          var toRight = tangent.perpendicular().times( this.lineWidth / 2 );
          var toFront = tangent.times( this.lineWidth / 2 );

          var left = center.plus( toLeft ).plus( toFront );
          var right = center.plus( toRight ).plus( toFront );
          return [
            new Line( fromPoint, left ),
            new Line( left, right ),
            new Line( right, toPoint )
          ];
        default:
          throw new Error( 'invalid lineCap: ' + this.lineCap );
      }
    }
  } );

  LineStyles.DEFAULT_OPTIONS = DEFAULT_OPTIONS;

  return kite.LineStyles;
} );
