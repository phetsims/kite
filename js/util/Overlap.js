// Copyright 2013-2015, University of Colorado Boulder

/**
 * Describes a section of continuous overlap (multiple overlapping points) between two segments.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );

  /**
   * @public
   * @constructor
   *
   * Creates an overlap based on two segments with their t-values (parametric value) within the range of [0,1]
   * (inclusive). The t value from the first curve can be mapped to an equivalent t value from the second curve such
   * that first( t ) === second( a * t + b ).
   *
   * Endpoint values for the actual overlap will be computed, such that
   * - first( t0 ) === second( qt0 )
   * - first( t1 ) === second( qt1 )
   * - All of those t values are in the range [0,1]
   *
   * @param {number} a
   * @param {number} b
   */
  function Overlap( a, b ) {
    assert && assert( typeof a === 'number' && isFinite( a ) && a !== 0,
      'a should be a finite non-zero number' );
    assert && assert( typeof b === 'number' && isFinite( b ),
      'b should be a finite number' );

    // @public {number}
    this.a = a;
    this.b = b;

    var t0 = 0;
    var t1 = 1;
    var qt0 = this.apply( t0 );
    var qt1 = this.apply( t1 );

    if ( qt0 > 1 ) {
      qt0 = 1;
      t0 = this.applyInverse( qt0 );
    }
    if ( qt0 < 0 ) {
      qt0 = 0;
      t0 = this.applyInverse( qt0 );
    }
    if ( qt1 > 1 ) {
      qt1 = 1;
      t1 = this.applyInverse( qt1 );
    }
    if ( qt1 < 0 ) {
      qt1 = 0;
      t1 = this.applyInverse( qt1 );
    }

    // @public {number} - Initial and ending t-values for the first curve (t0,t1) and second curve (qt0,qt1).
    this.t0 = t0;
    this.t1 = t1;
    if ( a > 0 ) {
      this.qt0 = qt0;
      this.qt1 = qt1;
    }
    else {
      this.qt0 = qt1;
      this.qt1 = qt0;
    }

    if ( this.t0 < 0 && this.t0 > -1e-8 ) { this.t0 = 0; }
    if ( this.t0 > 1 && this.t0 < 1 + 1e-8 ) { this.t0 = 1; }

    if ( this.t1 < 0 && this.t1 > -1e-8 ) { this.t1 = 0; }
    if ( this.t1 > 1 && this.t1 < 1 + 1e-8 ) { this.t1 = 1; }

    if ( this.qt0 < 0 && this.qt0 > -1e-8 ) { this.qt0 = 0; }
    if ( this.qt0 > 1 && this.qt0 < 1 + 1e-8 ) { this.qt0 = 1; }

    if ( this.qt1 < 0 && this.qt1 > -1e-8 ) { this.qt1 = 0; }
    if ( this.qt1 > 1 && this.qt1 < 1 + 1e-8 ) { this.qt1 = 1; }

    assert && assert( this.t0 >= 0 && this.t0 <= 1, 't0 out of range: ' + this.t0 );
    assert && assert( this.t1 >= 0 && this.t1 <= 1, 't1 out of range: ' + this.t1 );
    assert && assert( this.qt0 >= 0 && this.qt0 <= 1, 'qt0 out of range: ' + this.qt0 );
    assert && assert( this.qt1 >= 0 && this.qt1 <= 1, 'qt1 out of range: ' + this.qt1 );
  }

  kite.register( 'Overlap', Overlap );

  inherit( Object, Overlap, {
    /**
     * Maps a t value from the first curve to the second curve (assuming it is within the overlap range).
     * @public
     *
     * @param {number} t
     * @returns {number}
     */
    apply: function( t ) {
      return this.a * t + this.b;
    },

    /**
     * Maps a t value from the second curve to the first curve (assuming it is within the overlap range).
     * @public
     *
     * @param {number} t
     * @returns {number}
     */
    applyInverse: function( t ) {
      return ( t - this.b ) / this.a;
    }
  }, {
    /**
     * Returns a new overlap that should map t values of a0 => b0 and a1 => b1
     * @public
     *
     * @param {number} a0
     * @param {number} b0
     * @param {number} a1
     * @param {number} b1
     * @returns {Overlap}
     */
    createLinear: function( a0, b0, a1, b1 ) {
      var factor = ( b1 - b0 ) / ( a1 - a0 );
      return new Overlap( factor, b0 - a0 * factor );
    }
  } );

  return kite.Overlap;
} );
