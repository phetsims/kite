// Copyright 2017, University of Colorado Boulder

/**
 * A graph whose edges are segments.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Segment = require( 'KITE/segments/Segment' );
  var Subpath = require( 'KITE/util/Subpath' );
  var Vector2 = require( 'DOT/Vector2' );

  var vertexEpsilon = 1e-5;

  /**
   * @public (kite-internal)
   * @constructor
   */
  function SegmentGraph() {
    // @public {Array.<Loop>}
    this.loops = [];

    // @public {Array.<Vertex>}
    this.vertices = [];

    // @public {Array.<Edge>}
    this.edges = [];
  }

  kite.register( 'SegmentGraph', SegmentGraph );

  inherit( Object, SegmentGraph, {
    /**
     * Adds a Shape (with a given ID for CAG purposes) to the graph.
     * @public
     *
     * @param {number} shapeId
     * @param {Shape} shape
     */
    addShape: function( shapeId, shape ) {
      for ( var i = 0; i < shape.subpaths.length; i++ ) {
        this.addSubpath( shape.subpaths[ i ] );
      }
    },

    /**
     * Adds a subpath of a Shape (with a given ID for CAG purposes) to the graph.
     * @public
     *
     * @param {number} shapeId
     * @param {Subpath} subpath
     */
    addSubpath: function( shapeId, subpath ) {
      assert && assert( typeof shapeId === 'number' );
      assert && assert( subpath instanceof Subpath );

      if ( subpath.segments.length === 0 ) {
        return;
      }

      var index;
      var segments = subpath.segments.slice();
      if ( subpath.hasClosingSegment() ) {
        segments.push( subpath.getClosingSegment() );
      }

      var vertices = [];
      var edges = [];

      for ( index = 0; index < segments.length; index++ ) {
        var previousIndex = index - 1;
        if ( previousIndex < 0 ) {
          previousIndex = segments.length - 1;
        }

        var end = segments[ previousIndex ].end;
        var start = segments[ index ].start;

        if ( start.equals( end ) ) {
          vertices.push( new Vertex( start ) );
        }
        else {
          assert && assert( start.distance( end ) < vertexEpsilon, 'Inaccurate start/end points' );
          vertices.push( new Vertex( start.average( end ) ) );
        }
      }

      for ( index = 0; index < segments.length; index++ ) {
        var nextIndex = index + 1;
        if ( nextIndex === segments.length ) {
          nextIndex = 0;
        }

        edges.push( new Edge( segments[ index ], vertices[ index ], vertices[ nextIndex ] ) );
      }

      var loop = new Loop( shapeId );
      for ( index = 0; index < edges.length; index++ ) {
        loop.halfEdges.push( edges[ index ].forwardHalf );
      }

      this.loops.push( loop );
      this.vertices.push.apply( this.vertices, vertices );
      this.edges.push.apply( this.edges, edges );
    },

    eliminateOverlap: function() {
      // TODO
    },

    eliminateIntersection: function() {
      // TODO
    },

    collapseVertices: function() {
      // TODO
    },

    removeSingleEdgeVertices: function() {
      // TODO
    },

    orderVertexEdges: function() {
      // TODO
    },

    extractFaces: function() {
      // TODO
    }
  } );

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {number} shapeId
   */
  function Loop( shapeId ) {
    this.initialize( shapeId );
  }

  inherit( Object, Loop, {
    initialize: function( shapeId ) {
      assert && assert( typeof shapeId === 'number' );

      // @public {number}
      this.shapeId = shapeId;

      // @public {Array.<HalfEdge>}
      this.halfEdges = cleanArray( this.halfEdges );
    }
  } );

  Poolable.mixin( Loop, {
    constructorDuplicateFactory: function( pool ) {
      return function( shapeId ) {
        if ( pool.length ) {
          return pool.pop().initialize( shapeId );
        }
        else {
          return new Loop( shapeId );
        }
      };
    }
  } );

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Vector2} point
   */
  function Vertex( point ) {
    this.initialize( point );
  }

  inherit( Object, Vertex, {
    initialize: function( point ) {
      assert && assert( point instanceof Vector2 );

      // @public {Vector2}
      this.point = point;

      // @public {Array.<Edge>}
      this.incidentEdges = cleanArray( this.incidentEdges );
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

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Segment} segment
   * @param {Vertex} startVertex
   * @param {Vertex} endVertex
   */
  function Edge( segment, startVertex, endVertex ) {
    this.initialize( segment, startVertex, endVertex );
  }

  inherit( Object, Edge, {
    initialize: function( segment, startVertex, endVertex ) {
      assert && assert( segment instanceof Segment );
      assert && assert( startVertex instanceof Vertex );
      assert && assert( endVertex instanceof Vertex );
      assert && assert( segment.start.distance( startVertex.point ) < vertexEpsilon );
      assert && assert( segment.end.distance( endVertex.point ) < vertexEpsilon );

      // @public {Segment}
      this.segment = segment;

      // @public {HalfEdge}
      this.forwardHalf = this.forwardHalf || new HalfEdge( this, false );
      this.reversedHalf = this.reversedHalf || new HalfEdge( this, true );

      // @public {Vertex}
      this.startVertex = startVertex;
      this.endVertex = endVertex;
    },

    /**
     * Update possibly reversed vertex references.
     * @private
     */
    updateReferences: function() {
      this.forwardHalf.updateReferences();
      this.reversedHalf.updateReferences();
    }
  } );

  Poolable.mixin( Edge, {
    constructorDuplicateFactory: function( pool ) {
      return function( segment, startVertex, endVertex ) {
        if ( pool.length ) {
          return pool.pop().initialize( segment, startVertex, endVertex );
        }
        else {
          return new Edge( segment, startVertex, endVertex );
        }
      };
    }
  } );

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Edge} edge
   * @param {boolean} isReversed
   */
  function HalfEdge( edge, isReversed ) {
    assert && assert( edge instanceof Edge );
    assert && assert( typeof isReversed === 'boolean' );

    // @public {Edge}
    this.edge = edge;

    // @public {boolean}
    this.isReversed = isReversed;

    // @public {Vertex|null}
    this.startVertex = null;
    this.endVertex = null;
    this.updateReferences(); // Initializes vertex references
  }

  inherit( Object, HalfEdge, {
    /**
     * Update possibly reversed vertex references.
     * @private
     */
    updateReferences: function() {
      this.startVertex = this.isReversed ? this.edge.endVertex : this.edge.startVertex;
      this.endVertex = this.isReversed ? this.edge.startVertex : this.edge.endVertex;
    }
  } );


  return kite.SegmentGraph;
} );
