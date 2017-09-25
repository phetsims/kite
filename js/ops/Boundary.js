// Copyright 2017, University of Colorado Boulder

/**
 * TODO: doc
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var Bounds2 = require( 'DOT/Bounds2' );
  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Vector2 = require( 'DOT/Vector2' );

  /**
   * A loop described by a list of half-edges.
   * @public (kite-internal)
   * @constructor
   *
   * @param {Array.<HalfEdge>} halfEdges
   */
  function Boundary( halfEdges ) {
    this.initialize( halfEdges );
  }

  kite.register( 'Boundary', Boundary );

  inherit( Object, Boundary, {
    initialize: function( halfEdges ) {
      // @public {Array.<HalfEdge>}
      this.halfEdges = halfEdges;

      // @public {number}
      this.signedArea = this.computeSignedArea();

      // @public {Bounds2}
      this.bounds = this.computeBounds();

      // @public {Boundary}
      this.childBoundaries = cleanArray( this.childBoundaries );
    },

    isInner: function() {
      return this.signedArea > 0;
    },

    /**
     * @public
     *
     * @returns {number}
     */
    computeSignedArea: function() {
      var signedArea = 0;
      for ( var i = 0; i < this.halfEdges.length; i++ ) {
        signedArea += this.halfEdges[ i ].signedAreaFragment;
      }
      return signedArea;
    },

    /**
     * @public
     *
     * @returns {Bounds2}
     */
    computeBounds: function() {
      var bounds = Bounds2.NOTHING.copy();

      for ( var i = 0; i < this.halfEdges.length; i++ ) {
        bounds.includeBounds( this.halfEdges[ i ].edge.segment.getBounds() );
      }
      return bounds;
    },

    /**
     * @public
     *
     * @returns {Vector2}
     */
    computeMinYPoint: function() {
      for ( var i = 0; i < this.halfEdges.length; i++ ) {
        var segment = this.halfEdges[ i ].edge.segment;
        if ( segment.getBounds().top === this.bounds.top ) {
          var minYPoint = new Vector2( 0, Number.POSITIVE_INFINITY );
          var tValues = [ 0, 1, ].concat( segment.getInteriorExtremaTs() );
          for ( var j = 0; j < tValues.length; j++ ) {
            var point = segment.positionAt( tValues[ j ] );
            if ( point.y < minYPoint.y ) {
              minYPoint = point;
            }
          }
          return minYPoint;
        }
      }
    },

    hasHalfEdge: function( halfEdge ) {
      for ( var i = 0; i < this.halfEdges.length; i++ ) {
        if ( this.halfEdges[ i ] === halfEdge ) {
          return true;
        }
      }
      return false;
    }
  } );

  Poolable.mixin( Boundary, {
    constructorDuplicateFactory: function( pool ) {
      return function( halfEdges ) {
        if ( pool.length ) {
          return pool.pop().initialize( halfEdges );
        }
        else {
          return new Boundary( halfEdges );
        }
      };
    }
  } );

  return kite.Boundary;
} );
