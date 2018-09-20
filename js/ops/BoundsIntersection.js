// Copyright 2017, University of Colorado Boulder

/**
 * A region of two segments that intersects (contains static functions for segment intersection).
 *
 * BoundsIntersection.intersect( a, b ) should be used for most general intersection routines as a fallback.
 * Other segment-specific routines may be much faster.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var SegmentIntersection = require( 'KITE/util/SegmentIntersection' );
  var Vector2 = require( 'DOT/Vector2' );

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Segment} a
   * @param {Segment} b
   * @param {number} atMin - Lower t value for the region of the 'a' segment
   * @param {number} atMax - Higher t value for the region of the 'a' segment
   * @param {number} btMin - Lower t value for the region of the 'b' segment
   * @param {number} btMax - Higher t value for the region of the 'b' segment
   * @param {Vector2} aMin - Location of the lower t value for the 'a' segment's region
   * @param {Vector2} aMax - Location of the higher t value for the 'a' segment's region
   * @param {Vector2} bMin - Location of the lower t value for the 'b' segment's region
   * @param {Vector2} bMax - Location of the higher t value for the 'b' segment's region
   */
  function BoundsIntersection( a, b, atMin, atMax, btMin, btMax, aMin, aMax, bMin, bMax ) {
    this.initialize( a, b, atMin, atMax, btMin, btMax, aMin, aMax, bMin, bMax );
  }

  kite.register( 'BoundsIntersection', BoundsIntersection );

  inherit( Object, BoundsIntersection, {
    /**
     * @private
     *
     * @param {Segment} a
     * @param {Segment} b
     * @param {number} atMin - Lower t value for the region of the 'a' segment
     * @param {number} atMax - Higher t value for the region of the 'a' segment
     * @param {number} btMin - Lower t value for the region of the 'b' segment
     * @param {number} btMax - Higher t value for the region of the 'b' segment
     * @param {Vector2} aMin - Location of the lower t value for the 'a' segment's region
     * @param {Vector2} aMax - Location of the higher t value for the 'a' segment's region
     * @param {Vector2} bMin - Location of the lower t value for the 'b' segment's region
     * @param {Vector2} bMax - Location of the higher t value for the 'b' segment's region
     * @returns {BoundsIntersection} - This reference for chaining
     */
    initialize: function( a, b, atMin, atMax, btMin, btMax, aMin, aMax, bMin, bMax ) {
      assert && assert( typeof atMin === 'number' );
      assert && assert( typeof atMax === 'number' );
      assert && assert( typeof btMin === 'number' );
      assert && assert( typeof btMax === 'number' );
      assert && assert( aMin instanceof Vector2 );
      assert && assert( aMax instanceof Vector2 );
      assert && assert( bMin instanceof Vector2 );
      assert && assert( bMax instanceof Vector2 );

      // @public {Segment|null} - Null if cleaned of references
      this.a = a;
      this.b = b;

      // @public {number}
      this.atMin = atMin;
      this.atMax = atMax;
      this.btMin = btMin;
      this.btMax = btMax;

      // @public {Vector2|null} - Null if cleaned of references
      this.aMin = aMin;
      this.aMax = aMax;
      this.bMin = bMin;
      this.bMax = bMax;

      return this;
    },

    /**
     * Handles subdivision of the regions into 2 for the 'a' segment and 2 for the 'b' segment, then pushes any
     * intersecting bounding box regions (between 'a' and 'b') to the array.
     * @private
     *
     * @param {Array.<BoundsIntersection>}
     */
    pushSubdivisions: function( intersections ) {
      var atMid = ( this.atMax + this.atMin ) / 2;
      var btMid = ( this.btMax + this.btMin ) / 2;

      // If we reached the point where no higher precision can be obtained, return the given intersection
      if ( atMid === this.atMin || atMid === this.atMax || btMid === this.btMin || btMid === this.btMax ) {
        intersections.push( this );
        return;
      }

      var aMid = this.a.positionAt( atMid );
      var bMid = this.b.positionAt( btMid );

      if ( BoundsIntersection.boxIntersects( this.aMin, aMid, this.bMin, bMid ) ) {
        intersections.push( BoundsIntersection.createFromPool(
          this.a, this.b, this.atMin, atMid, this.btMin, btMid, this.aMin, aMid, this.bMin, bMid
        ) );
      }
      if ( BoundsIntersection.boxIntersects( aMid, this.aMax, this.bMin, bMid ) ) {
        intersections.push( BoundsIntersection.createFromPool(
          this.a, this.b, atMid, this.atMax, this.btMin, btMid, aMid, this.aMax, this.bMin, bMid
        ) );
      }
      if ( BoundsIntersection.boxIntersects( this.aMin, aMid, bMid, this.bMax ) ) {
        intersections.push( BoundsIntersection.createFromPool(
          this.a, this.b, this.atMin, atMid, btMid, this.btMax, this.aMin, aMid, bMid, this.bMax
        ) );
      }
      if ( BoundsIntersection.boxIntersects( aMid, this.aMax, bMid, this.bMax ) ) {
        intersections.push( BoundsIntersection.createFromPool(
          this.a, this.b, atMid, this.atMax, btMid, this.btMax, aMid, this.aMax, bMid, this.bMax
        ) );
      }

      this.freeToPool();
    },

    /**
     * A measure of distance between this and another intersection.
     * @public
     *
     * @param {BoundsIntersection} otherIntersection
     * @returns {number}
     */
    distance: function( otherIntersection ) {
      var daMin = this.atMin - otherIntersection.atMin;
      var daMax = this.atMax - otherIntersection.atMax;
      var dbMin = this.btMin - otherIntersection.btMin;
      var dbMax = this.btMax - otherIntersection.btMax;
      return daMin * daMin + daMax * daMax + dbMin * dbMin + dbMax * dbMax;
    },

    /**
     * Removes references (so it can allow other objects to be GC'ed or pooled)
     * @public
     */
    clean: function() {
      this.a = null;
      this.b = null;
      this.aMin = null;
      this.aMax = null;
      this.bMin = null;
      this.bMax = null;
    }
  }, {
    /**
     * Determine points of intersection between two arbitrary segments.
     * @public
     *
     * Does repeated subdivision and excludes a-b region pairs that don't intersect. Doing this repeatedly narrows down
     * intersections, to the point that they can be combined for a fairly accurate answer.
     *
     * @param {number} a
     * @param {number} b
     * @returns {Array.<SegmentIntersection>}
     */
    intersect: function( a, b ) {
      if ( !a.bounds.intersectsBounds( b.bounds ) ) {
        return [];
      }

      var intersections = BoundsIntersection.getIntersectionRanges( a, b );

      // Group together intersections that are very close (in parametric value space) so we can only return
      // one intersection (averaged value) for them.
      var groups = [];

      // NOTE: Doesn't have to be the fastest, won't be a crazy huge amount of these unless something went
      //       seriously wrong (degenerate case?)
      for ( var i = 0; i < intersections.length; i++ ) {
        var intersection = intersections[ i ];
        var wasAdded = false;
        nextComparison:
        for ( var j = 0; j < groups.length; j++ ) {
          var group = groups[ j ];
          for ( var k = 0; k < group.length; k++ ) {
            var otherIntersection = group[ k ];
            if ( intersection.distance( otherIntersection ) < 1e-13 ) {
              group.push( intersection );
              wasAdded = true;
              break nextComparison;
            }
          }
        }
        if ( !wasAdded ) {
          groups.push( [ intersection ] );
        }
      }

      var results = [];

      // For each group, average its parametric values, and create a "result intersection" from it.
      for ( i = 0; i < groups.length; i++ ) {
        group = groups[ i ];

        var aT = 0;
        var bT = 0;
        for ( j = 0; j < group.length; j++ ) {
          aT += group[ j ].atMin + group[ j ].atMax;
          bT += group[ j ].btMin + group[ j ].btMax;
        }
        aT /= 2 * group.length;
        bT /= 2 * group.length;

        var positionA = a.positionAt( aT );
        var positionB = b.positionAt( bT );
        assert && assert( positionA.distance( positionB ) < 1e-10 );

        results.push( new SegmentIntersection( positionA.average( positionB ), aT, bT ) );
      }

      // Clean up
      for ( i = 0; i < intersections.length; i++ ) {
        intersections[ i ].freeToPool();
      }
      BoundsIntersection.cleanPool();

      return results;
    },

    /**
     * Given two segments, returns an array of candidate intersection ranges.
     * @private
     *
     * @param {Segment} a
     * @param {Segment} b
     * @returns {Array.<BoundsIntersection>}
     */
    getIntersectionRanges: function( a, b ) {
      // Internal t-values that have a local min/max in at least one coordinate. We'll split based on these, so we only
      // check intersections between monotone segments (won't have to check self-intersection).
      var aExtrema = a.getInteriorExtremaTs();
      var bExtrema = b.getInteriorExtremaTs();

      // T-value pairs
      var aInternals = _.zip( [ 0 ].concat( aExtrema ), aExtrema.concat( [ 1 ] ) );
      var bInternals = _.zip( [ 0 ].concat( bExtrema ), bExtrema.concat( [ 1 ] ) );

      // Set up initial candidiate intersection ranges
      var intersections = [];
      for ( var i = 0; i < aInternals.length; i++ ) {
        for ( var j = 0; j < bInternals.length; j++ ) {
          var atMin = aInternals[ i ][ 0 ];
          var atMax = aInternals[ i ][ 1 ];
          var btMin = bInternals[ j ][ 0 ];
          var btMax = bInternals[ j ][ 1 ];
          var aMin = a.positionAt( atMin );
          var aMax = a.positionAt( atMax );
          var bMin = b.positionAt( btMin );
          var bMax = b.positionAt( btMax );
          if ( BoundsIntersection.boxIntersects( aMin, aMax, bMin, bMax ) ) {
            intersections.push( BoundsIntersection.createFromPool(
              a, b, atMin, atMax, btMin, btMax, aMin, aMax, bMin, bMax
            ) );
          }
        }
      }

      // Subdivide continuously
      // TODO: is 50 the proper number of iterations?
      for ( i = 0; i < 50; i++ ) {
        var newIntersections = [];
        for ( j = intersections.length - 1; j >= 0; j-- ) {
          intersections[ j ].pushSubdivisions( newIntersections );
        }
        intersections = newIntersections;
      }

      return intersections;
    },

    /**
     * Given the endpoints of two monotone segment regions, returns whether their bounding boxes intersect.
     * @private
     *
     * @param {Vector2} aMin
     * @param {Vector2} aMax
     * @param {Vector2} bMin
     * @param {Vector2} bMax
     * @returns {boolean}
     */
    boxIntersects: function( aMin, aMax, bMin, bMax ) {
      assert && assert( aMin instanceof Vector2 );
      assert && assert( aMax instanceof Vector2 );
      assert && assert( bMin instanceof Vector2 );
      assert && assert( bMax instanceof Vector2 );

      // e.g. Bounds2.includeBounds
      var minX = Math.max( Math.min( aMin.x, aMax.x ), Math.min( bMin.x, bMax.x ) );
      var minY = Math.max( Math.min( aMin.y, aMax.y ), Math.min( bMin.y, bMax.y ) );
      var maxX = Math.min( Math.max( aMin.x, aMax.x ), Math.max( bMin.x, bMax.x ) );
      var maxY = Math.min( Math.max( aMin.y, aMax.y ), Math.max( bMin.y, bMax.y ) );
      return ( maxX - minX ) >= 0 && ( maxY - minY >= 0 );
    },

    /**
     * Since we'll burn through a lot of pooled instances, we only remove external references fully once the full
     * proces is done.
     * @private
     */
    cleanPool: function() {
      for ( var i = 0; i < BoundsIntersection.pool.length; i++ ) {
        BoundsIntersection.pool[ i ].clean();
      }
    }
  } );

  Poolable.mixInto( BoundsIntersection, {
    initialize: BoundsIntersection.prototype.initialize
  } );

  return BoundsIntersection;
} );
