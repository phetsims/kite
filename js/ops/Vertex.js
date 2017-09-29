// Copyright 2017, University of Colorado Boulder

/**
 * TODO: doc
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Vector2 = require( 'DOT/Vector2' );

  // TODO: Move to common place
  var edgeAngleEpsilon = 1e-4;

  var globaId = 0;

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Vector2} point
   */
  function Vertex( point ) {
    // @public {number}
    this.id = ++globaId;

    this.initialize( point );

    // @private {function}
    this.edgeCompare = this.edgeComparison.bind( this );
  }

  kite.register( 'Vertex', Vertex );

  inherit( Object, Vertex, {
    initialize: function( point ) {
      assert && assert( point instanceof Vector2 );

      // @public {Vector2}
      this.point = point;

      // @public {Array.<Edge>}
      this.incidentEdges = cleanArray( this.incidentEdges );

      return this;
    },

    dispose: function() {
      this.point = Vector2.ZERO;
      cleanArray( this.incidentEdges );
      this.freeToPool();
    },

    /**
     * Comparse two edges for sortEdges.
     * @private
     *
     * TODO: For sorting, don't require multiple computation of the angles
     *
     * @param {Edge} edgeA
     * @param {Edge} edgeB
     * @returns {number}
     */
    edgeComparison: function( edgeA, edgeB ) {
      var angleA = edgeA.getTangent( this ).angle();
      var angleB = edgeB.getTangent( this ).angle();

      if ( Math.abs( angleA - angleB ) > edgeAngleEpsilon ) {
        return angleA < angleB ? -1 : 1;
      }
      else {
        throw new Error( 'Need to implement curvature (2nd derivative) detection' );
      }
    },

    /**
     * Sorts the edges in increasing angle order.
     * @public
     */
    sortEdges: function() {
      this.incidentEdges.sort( this.edgeCompare );
    }
  } );

  Poolable.mixin( Vertex, {
    constructorDuplicateFactory: function( pool ) {
      return function( point ) {
        if ( pool.length ) {
          return pool.pop().initialize( point );
        }
        else {
          return new Vertex( point );
        }
      };
    }
  } );

  return kite.Vertex;
} );
