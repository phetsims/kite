// Copyright 2017, University of Colorado Boulder

/**
 * TODO: doc
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Edge} edge
   * @param {boolean} isReversed
   */
  function HalfEdge( edge, isReversed ) {
    assert && assert( edge instanceof kite.Edge );
    assert && assert( typeof isReversed === 'boolean' );

    // @public {Edge}
    this.edge = edge;

    // @public {Face|null} - Filled in later, contains a face reference
    this.face = null;

    // @public {boolean}
    this.isReversed = isReversed;

    // @public {number}
    this.signedAreaFragment = edge.signedAreaFragment * ( isReversed ? -1 : 1 );

    // @public {Vertex|null}
    this.startVertex = null;
    this.endVertex = null;
    this.updateReferences(); // Initializes vertex references
  }

  kite.register( 'HalfEdge', HalfEdge );

  inherit( Object, HalfEdge, {
    /**
     * Returns the next half-edge, walking around counter-clockwise as possible. Assumes edges have been sorted.
     * @public
     *
     * @param {function} [filter] --- TODO doc, {Edge} => {boolean}
     */
    getNext: function( filter ) {
      for ( var i = 1;; i++ ) {
        var index = this.endVertex.incidentEdges.indexOf( this.edge ) - i;
        if ( index < 0 ) {
          index += this.endVertex.incidentEdges.length;
        }
        var edge = this.endVertex.incidentEdges[ index ];
        if ( filter && !filter( edge ) ) {
          continue;
        }
        var halfEdge = ( edge.endVertex === this.endVertex ) ? edge.reversedHalf : edge.forwardHalf;
        assert && assert( this.endVertex === halfEdge.startVertex );
        return halfEdge;
      }
    },

    /**
     * Update possibly reversed vertex references.
     * @private
     */
    updateReferences: function() {
      this.startVertex = this.isReversed ? this.edge.endVertex : this.edge.startVertex;
      this.endVertex = this.isReversed ? this.edge.startVertex : this.edge.endVertex;
      assert && assert( this.startVertex );
      assert && assert( this.endVertex );
    },

    getDirectionalSegment: function() {
      if ( this.isReversed ) {
        return this.edge.segment.reversed();
      }
      else {
        return this.edge.segment; // TODO: copy, so we don't need to worry about modification?
      }
    }
  } );

  return kite.HalfEdge;
} );
