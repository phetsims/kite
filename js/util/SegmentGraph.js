// Copyright 2017, University of Colorado Boulder

/**
 * A graph whose edges are segments.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var arrayRemove = require( 'PHET_CORE/arrayRemove' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var cleanArray = require( 'PHET_CORE/cleanArray' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Ray2 = require( 'DOT/Ray2' );
  var Segment = require( 'KITE/segments/Segment' );
  var Subpath = require( 'KITE/util/Subpath' );
  var Vector2 = require( 'DOT/Vector2' );

  var vertexEpsilon = 1e-5;
  var edgeAngleEpsilon = 1e-4;

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

    // @public {Array.<Boundary>}
    this.boundaries = [];

    // @public {Face}
    this.unboundedFace = Face.createFromPool( null );

    // @public {Array.<Face>}
    this.faces = [ this.unboundedFace ];
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

    // @private {function}
    this.edgeCompare = this.edgeComparison.bind( this );
  }

  inherit( Object, Vertex, {
    initialize: function( point ) {
      assert && assert( point instanceof Vector2 );

      // @public {Vector2}
      this.point = point;

      // @public {Array.<Edge>}
      this.incidentEdges = cleanArray( this.incidentEdges );
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

      // @public {Vertex}
      this.startVertex = startVertex;
      this.endVertex = endVertex;

      // @public {number}
      this.signedAreaFragment = segment.getSignedAreaFragment();

      // @public {HalfEdge}
      this.forwardHalf = this.forwardHalf || new HalfEdge( this, false );
      this.reversedHalf = this.reversedHalf || new HalfEdge( this, true );
    },

    /**
     * Returns the tangent of the edge at a specific vertex (in the direction away from the vertex).
     * @public
     *
     * @param {Vertex} vertex
     * @returns {Vector2}
     */
    getTangent: function( vertex ) {
      if ( this.startVertex === vertex ) {
        return this.segment.startTangent;
      }
      else if ( this.endVertex === vertex ) {
        return this.segment.endTangent.negated();
      }
      else {
        throw new Error( 'unknown vertex' );
      }
    },

    /**
     * Update possibly reversed vertex references.
     * @public
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

    // @public {number}
    this.signedAreaFragment = edge.signedAreaFragment * ( isReversed ? -1 : 1 );

    // @public {Vertex|null}
    this.startVertex = null;
    this.endVertex = null;
    this.updateReferences(); // Initializes vertex references
  }

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

  inherit( Object, Boundary, {
    initialize: function( halfEdges ) {
      // @public {Array.<HalfEdge>}
      this.halfEdges = halfEdges;

      // @public {number}
      this.signedArea = this.computeSignedArea();

      // @public {Bounds2}
      this.bounds = this.computeBounds();
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

  /**
   * @public (kite-internal)
   * @constructor
   *
   * @param {Boundary|null} outerBoundary - Null if it's the "outer" face
   */
  function Face( outerBoundary ) {
    this.initialize( outerBoundary );
  }

  inherit( Object, Face, {
    initialize: function( outerBoundary ) {
      // @public {Boundary}
      this.outerBoundary = outerBoundary;

      // @public {Array.<Face>}
      this.containedAdjacentFaces = cleanArray( this.containedAdjacentFaces );

      // @public {Array.<Face>}
      this.adjacentFacesToRight = cleanArray( this.adjacentFacesToRight );

      // @public {Array.<Face>}
      this.holes = cleanArray( this.holes );
    }
  } );

  Poolable.mixin( Face, {
    constructorDuplicateFactory: function( pool ) {
      return function( outerBoundary ) {
        if ( pool.length ) {
          return pool.pop().initialize( outerBoundary );
        }
        else {
          return new Face( outerBoundary );
        }
      };
    }
  } );

  return kite.SegmentGraph;
} );
