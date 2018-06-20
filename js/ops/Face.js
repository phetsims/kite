// Copyright 2017, University of Colorado Boulder

/**
 * A face is usually contained by an ("inner") boundary of edges, and zero or more ("outer") boundary holes on the inside.
 * The naming is somewhat counterintuitive here, because the "inner" boundaries are on the inside of the edges
 * (towards our face), and the "outer" hole boundaries are on the outer half-edges of the holes.
 *
 * There is normally one "unbounded" face without a normal boundary, whose "area" expands to infinity, and contains the
 * everything on the exterior of all of the edges.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  var globaId = 0;

  /**
   * @public (kite-internal)
   * @constructor
   *
   * NOTE: Use Face.createFromPool for most usage instead of using the constructor directly.
   *
   * @param {Boundary|null} boundary - Null if it's the unbounded face
   */
  function Face( boundary ) {
    // @public {number}
    this.id = ++globaId;

    // NOTE: most object properties are declared/documented in the initialize method. Please look there for most
    // definitions.
    this.initialize( boundary );
  }

  kite.register( 'Face', Face );

  inherit( Object, Face, {
    /**
     * Similar to a usual constructor, but is set up so it can be called multiple times (with dispose() in-between) to
     * support pooling.
     * @private
     *
     * @param {Boundary} boundary
     * @returns {Face} - This reference for chaining
     */
    initialize: function( boundary ) {
      assert && assert( boundary === null || boundary.isInner() );

      // @public {Boundary|null} - "inner" types, null when disposed (in pool)
      this.boundary = boundary;

      // @public {Array.<Boundary>} - "outer" types
      this.holes = cleanArray( this.holes );

      // @public {Object|null} - If non-null, it's a map from shapeId {number} => winding {number}
      this.windingMap = null;

      // @public {boolean|null} - Filled in later
      this.filled = null;

      if ( boundary ) {
        this.addBoundaryFaceReferences( boundary );
      }

      return this;
    },

    /**
     * Removes references (so it can allow other objects to be GC'ed or pooled), and frees itself to the pool so it
     * can be reused.
     * @public
     */
    dispose: function() {
      this.boundary = null;
      cleanArray( this.holes );
      this.windingMap = null;
      this.filled = null;
      this.freeToPool();
    },

    /**
     * Marks all half-edges on the boundary as belonging to this face.
     * @public
     *
     * @param {Boundary} boundary
     */
    addBoundaryFaceReferences: function( boundary ) {
      for ( var i = 0; i < boundary.halfEdges.length; i++ ) {
        assert && assert( boundary.halfEdges[ i ].face === null );

        boundary.halfEdges[ i ].face = this;
      }
    },

    /**
     * Processes the boundary-graph for a given outer boundary, and turns it into holes for this face.
     * @public
     *
     * In the graph, every outer boundary in each connected component will be holes for the single inner boundary
     * (which will be, in this case, our face's boundary). Since it's a tree, we can walk the tree recursively to add
     * all necessary holes.
     *
     * @param {Boundary} boundary
     */
    recursivelyAddHoles: function( outerBoundary ) {
      assert && assert( !outerBoundary.isInner() );

      this.holes.push( outerBoundary );
      this.addBoundaryFaceReferences( outerBoundary );
      for ( var i = 0; i < outerBoundary.childBoundaries.length; i++ ) {
        this.recursivelyAddHoles( outerBoundary.childBoundaries[ i ] );
      }
    }
  } );

  Poolable.mixInto( Face, {
    initialize: Face.prototype.initialize
  } );

  return kite.Face;
} );
