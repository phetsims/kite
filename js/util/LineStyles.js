//jshint -W018
// Copyright 2002-2013, University of Colorado

/**
 * Styles needed to determine a stroked line shape.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  'use strict';
  
  var assert = require( 'ASSERT/assert' )( 'kite' );
  
  var kite = require( 'KITE/kite' );
  
  kite.LineStyles = function( args ) {
    if ( args === undefined ) {
      args = {};
    }
    this.lineWidth = args.lineWidth !== undefined ? args.lineWidth : 1;
    this.lineCap = args.lineCap !== undefined ? args.lineCap : 'butt'; // butt, round, square
    this.lineJoin = args.lineJoin !== undefined ? args.lineJoin : 'miter'; // miter, round, bevel
    this.lineDash = args.lineDash !== undefined ? args.lineDash : null; // null is default, otherwise an array of numbers
    this.lineDashOffset = args.lineDashOffset !== undefined ? args.lineDashOffset : 0; // 0 default, any number
    this.miterLimit = args.miterLimit !== undefined ? args.miterLimit : 10; // see https://svgwg.org/svg2-draft/painting.html for miterLimit computations
  };
  var LineStyles = kite.LineStyles;
  LineStyles.prototype = {
    constructor: LineStyles,
    
    equals: function( other ) {
      var typical = this.lineWidth === other.lineWidth &&
                    this.lineCap === other.lineCap &&
                    this.lineJoin === other.lineJoin &&
                    this.miterLimit === other.miterLimit &&
                    this.lineDashOffset === other.lineDashOffset;
      if ( !typical ) {
        return false;
      }
      
      // now we need to compare the line dashes
      /* jshint -W018 */
      //jshint -W018
      if ( !this.lineDash !== !other.lineDash ) {
        // one is defined, the other is not
        return false;
      }
      
      if ( this.lineDash ) {
        if ( this.lineDash.length !== other.lineDash.length ) {
          return false;
        }
        for ( var i = 0; i < this.lineDash.length; i++ ) {
          if ( this.lineDash[i] !== other.lineDash[i] ) {
            return false;
          }
        }
        return true;
      } else {
        // both have no line dash, so they are equal
        return true;
      }
    }
  };
  
  return kite.LineStyles;
} );
