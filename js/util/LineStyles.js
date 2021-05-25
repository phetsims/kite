// Copyright 2013-2021, University of Colorado Boulder

/**
 * Styles needed to determine a stroked line shape. Generally immutable.
 *
 * Mirrors much of what is done with SVG/Canvas, see https://svgwg.org/svg2-draft/painting.html for details.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Utils from '../../../dot/js/Utils.js';
import merge from '../../../phet-core/js/merge.js';
import kite from '../kite.js';
import Arc from '../segments/Arc.js';
import Line from '../segments/Line.js';

// constants
const lineLineIntersection = Utils.lineLineIntersection;

const DEFAULT_OPTIONS = {
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  lineDash: [],
  lineDashOffset: 0,
  miterLimit: 10
};

class LineStyles {
  /**
   * @public
   *
   * @param {Object} [options]
   */
  constructor( options ) {
    options = merge( {}, DEFAULT_OPTIONS, options );

    // @public {number} - The width of the line (will be offset to each side by lineWidth/2)
    this.lineWidth = options.lineWidth;

    // @public {string} - 'butt', 'round' or 'square' - Controls appearance at endpoints for non-closed subpaths.
    // - butt: straight-line at end point, going through the endpoint (perpendicular to the tangent)
    // - round: circular border with radius lineWidth/2 around endpoints
    // - square: straight-line past the end point (by lineWidth/2)
    // See: https://svgwg.org/svg2-draft/painting.html#LineCaps
    this.lineCap = options.lineCap;

    // @public {string} - 'miter', 'round' or 'bevel' - Controls appearance at joints between segments (at the point)
    // - miter: Use sharp corners (which aren't too sharp, see miterLimit). Extends edges until they meed.
    // - round: circular border with radius lineWidth/2 around joints
    // - bevel: directly joins the gap with a line segment.
    // See: https://svgwg.org/svg2-draft/painting.html#LineJoin
    this.lineJoin = options.lineJoin;

    // @public {Array.<number>} - Even values in the array are the "dash" length, odd values are the "gap" length.
    // NOTE: If there is an odd number of entries, it behaves like lineDash.concat( lineDash ).
    // See: https://svgwg.org/svg2-draft/painting.html#StrokeDashing
    this.lineDash = options.lineDash;

    // @public {number} - Offset from the start of the subpath where the start of the line-dash array starts.
    this.lineDashOffset = options.lineDashOffset;

    // @public {number} - When to cut off lineJoin:miter to look like lineJoin:bevel. See https://svgwg.org/svg2-draft/painting.html
    this.miterLimit = options.miterLimit;

    assert && assert( typeof this.lineWidth === 'number', `lineWidth should be a number: ${this.lineWidth}` );
    assert && assert( isFinite( this.lineWidth ), `lineWidth should be a finite number: ${this.lineWidth}` );
    assert && assert( this.lineWidth >= 0, `lineWidth should be non-negative: ${this.lineWidth}` );
    assert && assert( this.lineCap === 'butt' || this.lineCap === 'round' || this.lineCap === 'square',
      `Invalid lineCap: ${this.lineCap}` );
    assert && assert( this.lineJoin === 'miter' || this.lineJoin === 'round' || this.lineJoin === 'bevel',
      `Invalid lineJoin: ${this.lineJoin}` );
    assert && assert( Array.isArray( this.lineDash ), `lineDash should be an array: ${this.lineDash}` );
    assert && assert( _.every( this.lineDash, dash => ( typeof dash === 'number' ) && isFinite( dash ) && dash >= 0 ),
      `Every lineDash should be a non-negative finite number: ${this.lineDash}` );
    assert && assert( typeof this.lineDashOffset === 'number', `lineDashOffset should be a number: ${this.lineDashOffset}` );
    assert && assert( isFinite( this.lineDashOffset ), `lineDashOffset should be a finite number: ${this.lineDashOffset}` );
    assert && assert( typeof this.miterLimit === 'number', `miterLimit should be a number: ${this.miterLimit}` );
    assert && assert( isFinite( this.miterLimit ), `miterLimit should be a finite number: ${this.miterLimit}` );
  }

  /**
   * Determines of this lineStyles is equal to the other LineStyles
   * @public
   *
   * @param {LineStyles} other
   * @returns {boolean}
   */
  equals( other ) {
    const typical = this.lineWidth === other.lineWidth &&
                    this.lineCap === other.lineCap &&
                    this.lineJoin === other.lineJoin &&
                    this.miterLimit === other.miterLimit &&
                    this.lineDashOffset === other.lineDashOffset;
    if ( !typical ) {
      return false;
    }

    if ( this.lineDash.length === other.lineDash.length ) {
      for ( let i = 0; i < this.lineDash.length; i++ ) {
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
  }

  /**
   * Returns a copy of this LineStyles.
   * @public
   *
   * @returns {LineStyles}
   */
  copy() {
    return new LineStyles( {
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      lineDash: this.lineDash,
      lineDashOffset: this.lineDashOffset,
      miterLimit: this.miterLimit
    } );
  }

  /**
   * Creates an array of Segments that make up a line join, to the left side.
   * @public
   *
   * Joins two segments together on the logical "left" side, at 'center' (where they meet), and un-normalized tangent
   * vectors in the direction of the stroking. To join on the "right" side, switch the tangent order and negate them.
   *
   * @param {Vector2} center
   * @param {Vector2} fromTangent
   * @param {Vector2} toTangent
   * @returns {Array.<Line>}
   */
  leftJoin( center, fromTangent, toTangent ) {
    fromTangent = fromTangent.normalized();
    toTangent = toTangent.normalized();

    // where our join path starts and ends
    const fromPoint = center.plus( fromTangent.perpendicular.negated().times( this.lineWidth / 2 ) );
    const toPoint = center.plus( toTangent.perpendicular.negated().times( this.lineWidth / 2 ) );

    const bevel = ( fromPoint.equals( toPoint ) ? [] : [ new Line( fromPoint, toPoint ) ] );

    let fromAngle;
    let toAngle;
    let theta;

    // only insert a join on the non-acute-angle side
    // epsilon present for https://github.com/phetsims/kite/issues/73, where we don't want to join barely-existing
    // joins.
    if ( fromTangent.perpendicular.dot( toTangent ) > 1e-12 ) {
      switch( this.lineJoin ) {
        case 'round':
          fromAngle = fromTangent.angle + Math.PI / 2;
          toAngle = toTangent.angle + Math.PI / 2;
          return [ new Arc( center, this.lineWidth / 2, fromAngle, toAngle, true ) ];
        case 'miter':
          theta = fromTangent.angleBetween( toTangent.negated() );
          if ( 1 / Math.sin( theta / 2 ) <= this.miterLimit && theta < Math.PI - 0.00001 ) {
            // draw the miter
            const miterPoint = lineLineIntersection( fromPoint, fromPoint.plus( fromTangent ), toPoint, toPoint.plus( toTangent ) );
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
          throw new Error( `invalid lineJoin: ${this.lineJoin}` );
      }
    }
    else {
      // no join necessary here since we have the acute angle. just simple lineTo for now so that the next segment starts from the right place
      // TODO: can we prevent self-intersection here?
      return bevel;
    }
  }

  /**
   * Creates an array of Segments that make up a line join, to the right side.
   * @public
   *
   * Joins two segments together on the logical "right" side, at 'center' (where they meet), and normalized tangent
   * vectors in the direction of the stroking. To join on the "left" side, switch the tangent order and negate them.
   * @param {Vector2} center
   * @param {Vector2} fromTangent
   * @param {Vector2} toTangent
   * @returns {Array.<Line>}
   */
  rightJoin( center, fromTangent, toTangent ) {
    return this.leftJoin( center, toTangent.negated(), fromTangent.negated() );
  }

  /**
   * Creates an array of Segments that make up a line cap from the endpoint 'center' in the direction of the tangent
   * @public
   *
   * @param {Vector2} center
   * @param {Vector2} tangent
   * @returns {Array.<Segment>}
   */
  cap( center, tangent ) {
    tangent = tangent.normalized();

    const fromPoint = center.plus( tangent.perpendicular.times( -this.lineWidth / 2 ) );
    const toPoint = center.plus( tangent.perpendicular.times( this.lineWidth / 2 ) );

    let tangentAngle;
    let toLeft;
    let toRight;
    let toFront;
    let left;
    let right;

    switch( this.lineCap ) {
      case 'butt':
        return [ new Line( fromPoint, toPoint ) ];
      case 'round':
        tangentAngle = tangent.angle;
        return [ new Arc( center, this.lineWidth / 2, tangentAngle + Math.PI / 2, tangentAngle - Math.PI / 2, true ) ];
      case 'square':
        toLeft = tangent.perpendicular.negated().times( this.lineWidth / 2 );
        toRight = tangent.perpendicular.times( this.lineWidth / 2 );
        toFront = tangent.times( this.lineWidth / 2 );

        left = center.plus( toLeft ).plus( toFront );
        right = center.plus( toRight ).plus( toFront );
        return [
          new Line( fromPoint, left ),
          new Line( left, right ),
          new Line( right, toPoint )
        ];
      default:
        throw new Error( `invalid lineCap: ${this.lineCap}` );
    }
  }
}

kite.register( 'LineStyles', LineStyles );

// @public {Object}
LineStyles.DEFAULT_OPTIONS = DEFAULT_OPTIONS;

export default LineStyles;