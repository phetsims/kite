// Copyright 2017, University of Colorado Boulder

/**
 * A graph whose edges are segments.
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
     */
    getNext: function() {
      var index = this.endVertex.incidentEdges.indexOf( this.edge ) - 1;
      if ( index < 0 ) {
        index = this.endVertex.incidentEdges.length - 1;
      }
      var edge = this.endVertex.incidentEdges[ index ];
      var halfEdge = ( edge.endVertex === this.endVertex ) ? edge.reversedHalf : edge.forwardHalf;
      assert && assert( this.endVertex === halfEdge.startVertex );
      return halfEdge;
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
    }
  } );

  return kite.HalfEdge;
} );
