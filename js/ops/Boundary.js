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
  var Ray2 = require( 'DOT/Ray2' );
  var Subpath = require( 'KITE/util/Subpath' );
  var Vector2 = require( 'DOT/Vector2' );

  var globaId = 0;

  /**
   * A loop described by a list of half-edges.
   * @public (kite-internal)
   * @constructor
   *
   * @param {Array.<HalfEdge>} halfEdges
   */
  function Boundary( halfEdges ) {
    // @public {number}
    this.id = ++globaId;

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

    dispose: function() {
      this.halfEdges = [];
      cleanArray( this.childBoundaries );
      this.freeToPool();
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

    computeExtremePoint: function( transform ) {
      var transformedSegments = [];
      for ( var i = 0; i < this.halfEdges.length; i++ ) {
        transformedSegments.push( this.halfEdges[ i ].edge.segment.transformed( transform.getMatrix() ) );
      }

      var transformedBounds = Bounds2.NOTHING.copy();
      for ( i = 0; i < transformedSegments.length; i++ ) {
        transformedBounds.includeBounds( transformedSegments[ i ].getBounds() );
      }

      for ( i = 0; i < transformedSegments.length; i++ ) {
        var segment = transformedSegments[ i ];
        if ( segment.getBounds().top === transformedBounds.top ) {
          var extremePoint = new Vector2( 0, Number.POSITIVE_INFINITY );
          var tValues = [ 0, 1, ].concat( segment.getInteriorExtremaTs() );
          for ( var j = 0; j < tValues.length; j++ ) {
            var point = segment.positionAt( tValues[ j ] );
            if ( point.y < extremePoint.y ) {
              extremePoint = point;
            }
          }
          return transform.inversePosition2( extremePoint );
        }
      }

      throw new Error( 'No... segments?' );
    },

    computeExtremeRay: function( transform ) {
      var extremePoint = this.computeExtremePoint( transform );
      var orientation = transform.inverseDelta2( new Vector2( 0, -1 ) ).normalized();
      return new Ray2( extremePoint.plus( orientation.timesScalar( 1e-4 ) ), orientation );
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
    },

    toSubpath: function() {
      var segments = [];
      for ( var i = 0; i < this.halfEdges.length; i++ ) {
        segments.push( this.halfEdges[ i ].getDirectionalSegment() );
      }
      return new Subpath( segments, null, true );
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
