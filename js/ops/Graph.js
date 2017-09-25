// Copyright 2017, University of Colorado Boulder

/**
 * A graph whose edges are segments.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var arrayRemove = require( 'PHET_CORE/arrayRemove' );
  var Boundary = require( 'KITE/ops/Boundary' );
  var Edge = require( 'KITE/ops/Edge' );
  var Face = require( 'KITE/ops/Face' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Loop = require( 'KITE/ops/Loop' );
  var Ray2 = require( 'DOT/Ray2' );
  var Subpath = require( 'KITE/util/Subpath' );
  var Vector2 = require( 'DOT/Vector2' );
  var Vertex = require( 'KITE/ops/Vertex' );

  // TODO: Move to common place
  var vertexEpsilon = 1e-5;

  /**
   * @public (kite-internal)
   * @constructor
   */
  function Graph() {
    // @public {Array.<Loop>}
    this.loops = [];

    // @public {Array.<Vertex>}
    this.vertices = [];

    // @public {Array.<Edge>}
    this.edges = [];

    // @public {Array.<Boundary>}
    this.boundaries = [];

    // @public {Face}
    this.unboundedFace = Face.createFromPool( null );

    // @public {Array.<Face>}
    this.faces = [ this.unboundedFace ];
  }

  kite.register( 'Graph', Graph );

  inherit( Object, Graph, {
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
          vertices.push( Vertex.createFromPool( start ) );
        }
        else {
          assert && assert( start.distance( end ) < vertexEpsilon, 'Inaccurate start/end points' );
          vertices.push( Vertex.createFromPool( start.average( end ) ) );
        }
      }

      for ( index = 0; index < segments.length; index++ ) {
        var nextIndex = index + 1;
        if ( nextIndex === segments.length ) {
          nextIndex = 0;
        }

        var edge = Edge.createFromPool( segments[ index ], vertices[ index ], vertices[ nextIndex ] );
        edges.push( edge );
        vertices[ index ].incidentEdges.push( edge );
        vertices[ nextIndex ].incidentEdges.push( edge );
      }

      var loop = Loop.createFromPool( shapeId );
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
      for ( var i = 0; i < this.vertices; i++ ) {
        this.vertices[ i ].sortEdges();
      }
    },

    extractFaces: function() {
      var halfEdges = [];
      for ( var i = 0; i < this.edges.length; i++ ) {
        halfEdges.push( this.edges[ i ].forwardHalf );
        halfEdges.push( this.edges[ i ].reversedHalf );
      }

      while ( halfEdges.length ) {
        var boundaryHalfEdges = [];
        var halfEdge = halfEdges[ 0 ];
        var startingHalfEdge = halfEdge;
        while ( halfEdge ) {
          arrayRemove( halfEdges, halfEdge );
          boundaryHalfEdges.push( halfEdge );
          halfEdge = halfEdge.getNext();
          if ( halfEdge === startingHalfEdge ) {
            break;
          }
        }
        this.boundaries.push( Boundary.createFromPool( boundaryHalfEdges ) );
      }

      for ( i = 0; i < this.boundaries.length; i++ ) {
        var boundary = this.boundaries[ i ];
        if ( boundary.signedArea < 0 ) {
          this.faces.push( Face.createFromPool( boundary ) );
        }
      }
    },

    computeFaceGraph: function() {
      for ( var i = 0; i < this.faces.length; i++ ) {
        var face = this.faces[ i ];
        if ( face.outerBoundary === null ) {
          continue;
        }
        var topPoint = face.outerBoundary.computeMinYPoint();
        var ray = new Ray2( topPoint.plus( new Vector2( 0, -1e-4 ) ), new Vector2( 0, -1 ) );

        var closestEdge = null;
        var closestDistance = Number.POSITIVE_INFINITY;
        var closestWind = false;

        for ( var j = 0; j < this.edges.length; j++ ) {
          var edge = this.edges[ j ];

          var intersections = edge.segment.intersection( ray );
          for ( var k = 0; k < intersections.length; k++ ) {
            var intersection = intersections[ k ];

            if ( intersection.distance < closestDistance ) {
              closestEdge = edge;
              closestDistance = intersection.distance;
              closestWind = intersection.wind;
            }
          }
        }

        var leftFace;
        var isInternal;
        if ( closestEdge === null ) {
          leftFace = this.unboundedFace;
          isInternal = true;
        }
        else {
          hasFace:
          for ( j = 0; j < this.faces.length; j++ ) {
            var halfEdges = this.faces[ j ].outerBoundary.halfEdges;
            for ( k = 0; k < halfEdges.length; k++ ) {
              if ( halfEdges[ k ].edge === closestEdge ) {
                leftFace = this.faces[ j ];
                // TODO: determine if this is reversed
                isInternal = closestWind > 0;
                if ( halfEdges[ k ].isReversed ) {
                  isInternal = !isInternal;
                }
                break hasFace;
              }
            }
          }
        }

        if ( isInternal ) {
          leftFace.containedAdjacentFaces.push( face );
        }
        else {
          leftFace.adjacentFacesToRight.push( face );
        }
      }

      function addHole( f ) {
        face.holes.push( f );
        face.adjacentFacesToRight.forEach( addHole );
      }

      for ( i = 0; i < this.faces.length; i++ ) {
        face = this.faces[ i ];
        face.containedAdjacentFaces.forEach( addHole );
      }
    },

    computeFaceInclusion: function() {
      // TODO
    },

    collapseAdjacentFaces: function() {
      // TODO
    },

    combineAdjacentSegments: function() {
      // TODO
    }
  } );

  return kite.Graph;
} );
