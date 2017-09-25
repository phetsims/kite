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
  var Bounds2 = require( 'DOT/Bounds2' );
  var Edge = require( 'KITE/ops/Edge' );
  var Face = require( 'KITE/ops/Face' );
  var inherit = require( 'PHET_CORE/inherit' );
  var kite = require( 'KITE/kite' );
  var Loop = require( 'KITE/ops/Loop' );
  var Ray2 = require( 'DOT/Ray2' );
  var Segment = require( 'KITE/segments/Segment' );
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
    this.innerBoundaries = [];
    this.outerBoundaries = [];
    this.boundaries = [];

    // @public {Array.<number>}
    this.shapeIds = [];

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

      if ( this.shapeIds.indexOf( shapeId ) < 0 ) {
        this.shapeIds.push( shapeId );
      }

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
      // TODO: ideally initially scan to determine potential "intersection" pairs based on bounds overlap
      // TODO: Then iterate (potentially adding pairs when intersections split things) until no pairs exist

      var needsLoop = true;
      while ( needsLoop ) {
        needsLoop = false;

        intersect:
        for ( var i = 0; i < this.edges.length; i++ ) {
          var aEdge = this.edges[ i ];
          var aSegment = aEdge.segment;
          for ( var j = i + 1; j < this.edges.length; j++ ) {
            var bEdge = this.edges[ j ];
            var bSegment = bEdge.segment;

            var intersections = Segment.intersect( aSegment, bSegment );
            intersections = intersections.filter( function( intersection ) {
              // TODO: refactor duplication
              var aT = intersection.aT;
              var bT = intersection.bT;
              // TODO: factor out epsilon
              var aInternal = aT > 1e-5 && aT < ( 1 - 1e-5 );
              var bInternal = bT > 1e-5 && bT < ( 1 - 1e-5 );
              return aInternal || bInternal;
            } );
            if ( intersections.length ) {

              // TODO: In the future, handle multiple intersections (instead of re-running)
              var intersection = intersections[ 0 ];

              // TODO: handle better?
              this.simpleSplit( aEdge, bEdge, intersection.aT, intersection.bT, intersection.point );

              needsLoop = true;
              break intersect;
            }
          }
        }
      }
    },

    simpleSplit: function( aEdge, bEdge, aT, bT, point ) {
      // TODO: factor out epsilon and duplication
      var aInternal = aT > 1e-5 && aT < ( 1 - 1e-5 );
      var bInternal = bT > 1e-5 && bT < ( 1 - 1e-5 );

      var vertex = null;
      if ( !aInternal ) {
        vertex = aT < 0.5 ? aEdge.startVertex : aEdge.endVertex;
      }
      else if ( !bInternal ) {
        vertex = bT < 0.5 ? bEdge.startVertex : bEdge.endVertex;
      }
      else {
        vertex = Vertex.createFromPool( point );
        this.vertices.push( vertex );
      }

      if ( aInternal ) {
        this.splitEdge( aEdge, aT, vertex );
      }
      if ( bInternal ) {
        this.splitEdge( bEdge, bT, vertex );
      }
    },

    splitEdge: function( edge, t, vertex ) {
      assert && assert( this.boundaries.length === 0, 'Only handles simpler level primitive splitting right now' );

      var segments = edge.segment.subdivided( t );
      assert && assert( segments.length === 2 );

      var firstEdge = Edge.createFromPool( segments[ 0 ], edge.startVertex, vertex );
      var secondEdge = Edge.createFromPool( segments[ 1 ], vertex, edge.endVertex );

      // Remove old connections
      arrayRemove( this.edges, edge );
      arrayRemove( edge.startVertex.incidentEdges, edge );
      arrayRemove( edge.endVertex.incidentEdges, edge );

      // Add new connections
      this.edges.push( firstEdge );
      this.edges.push( secondEdge );
      vertex.incidentEdges.push( firstEdge );
      vertex.incidentEdges.push( secondEdge );
      edge.startVertex.incidentEdges.push( firstEdge );
      edge.endVertex.incidentEdges.push( secondEdge );

      for ( var i = 0; i < this.loops.length; i++ ) {
        var loop = this.loops[ i ];

        for ( var j = loop.halfEdges.length - 1; j >= 0; j-- ) {
          var halfEdge = loop.halfEdges[ j ];
          if ( halfEdge === edge.forwardHalf ) {
            loop.halfEdges.splice( j, 1, firstEdge.forwardHalf, secondEdge.forwardHalf );
          }
          else if ( halfEdge === edge.reversedHalf ) {
            loop.halfEdges.splice( j, 1, secondEdge.reversedHalf, firstEdge.reversedHalf );
          }
        }
      }
    },

    collapseVertices: function() {
      // TODO
    },

    removeSingleEdgeVertices: function() {
      // TODO
    },

    orderVertexEdges: function() {
      for ( var i = 0; i < this.vertices.length; i++ ) {
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
        var boundary = Boundary.createFromPool( boundaryHalfEdges );
        ( boundary.signedArea > 0 ? this.innerBoundaries : this.outerBoundaries ).push( boundary );
        this.boundaries.push( boundary );
      }

      for ( i = 0; i < this.innerBoundaries.length; i++ ) {
        this.faces.push( Face.createFromPool( this.innerBoundaries[ i ] ) );
      }
    },

    computeBoundaryGraph: function() {
      var unboundedHoles = []; // {Array.<Boundary>}

      for ( var i = 0; i < this.outerBoundaries.length; i++ ) {
        var outerBoundary = this.outerBoundaries[ i ];

        var topPoint = outerBoundary.computeMinYPoint();
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

        if ( closestEdge === null ) {
          unboundedHoles.push( outerBoundary );
        }
        else {
          var reversed = closestWind < 0;
          var closestHalfEdge = reversed ? closestEdge.reversedHalf : closestEdge.forwardHalf;
          var closestBoundary = this.getBoundaryOfHalfEdge( closestHalfEdge );
          closestBoundary.childBoundaries.push( outerBoundary );
        }
      }

      unboundedHoles.forEach( this.unboundedFace.recursivelyAddHoles.bind( this.unboundedFace ) );
      for ( i = 0; i < this.faces.length; i++ ) {
        var face = this.faces[ i ];
        if ( face.boundary !== null ) {
          face.boundary.childBoundaries.forEach( face.recursivelyAddHoles.bind( face ) );
        }
      }
    },

    computeWindingMap: function() {
      var edges = this.edges.slice();

      // Winding numbers for "outside" are 0.
      var outsideMap = {};
      for ( var i = 0; i < this.shapeIds.length; i++ ) {
        outsideMap[ this.shapeIds[ i ] ] = 0;
      }
      this.unboundedFace.windingMap = outsideMap;

      while ( edges.length ) {
        for ( var j = edges.length - 1; j >= 0; j-- ) {
          var edge = edges[ j ];

          var forwardHalf = edge.forwardHalf;
          var reversedHalf = edge.reversedHalf;

          var forwardFace = forwardHalf.face;
          var reversedFace = reversedHalf.face;
          assert && assert( forwardFace !== reversedFace );

          var solvedForward = forwardFace.windingMap !== null;
          var solvedReversed = reversedFace.windingMap !== null;

          if ( solvedForward && solvedReversed ) {
            edges.splice( j, 1 );
          }
          else if ( !solvedForward && !solvedReversed ) {
            continue;
          }
          else {
            var solvedFace = solvedForward ? forwardFace : reversedFace;
            var unsolvedFace = solvedForward ? reversedFace : forwardFace;

            var windingMap = {};
            for ( var k = 0; k < this.shapeIds.length; k++ ) {
              var shapeId = this.shapeIds[ k ];

              var differential = 0; // forward face - reversed face
              for ( var m = 0; m < this.loops.length; m++ ) {
                var loop = this.loops[ m ];
                if ( loop.shapeId !== shapeId ) {
                  continue;
                }

                for ( var n = 0; n < loop.halfEdges.length; n++ ) {
                  var loopHalfEdge = loop.halfEdges[ n ];
                  if ( loopHalfEdge === forwardHalf ) {
                    differential++;
                  }
                  else if ( loopHalfEdge === reversedHalf ) {
                    differential--;
                  }
                }
              }

              windingMap[ shapeId ] = solvedFace.windingMap[ shapeId ] + differential * ( solvedForward ? -1 : 1 );
            }
            unsolvedFace.windingMap = windingMap;
          }
        }
      }
    },

    computeFaceInclusion: function( windingMapFilter ) {
      for ( var i = 0; i < this.faces.length; i++ ) {
        var face = this.faces[ i ];
        face.filled = windingMapFilter( face.windingMap );
      }
    },

    collapseAdjacentFaces: function() {
      // TODO
    },

    combineAdjacentSegments: function() {
      // TODO
    },

    getBoundaryOfHalfEdge: function( halfEdge ) {
      for ( var i = 0; i < this.boundaries.length; i++ ) {
        var boundary = this.boundaries[ i ];

        if ( boundary.hasHalfEdge( halfEdge ) ) {
          return boundary;
        }
      }

      throw new Error( 'Could not find boundary' );
    },

    debug: function() {
      var self = this;

      var bounds = Bounds2.NOTHING.copy();
      for ( var i = 0; i < this.edges.length; i++ ) {
        bounds.includeBounds( this.edges[ i ].segment.getBounds() );
      }

      var debugSize = 256;
      var pad = 10;
      var scale = ( debugSize - pad * 2 ) / Math.max( bounds.width, bounds.height );

      function transformContext( context ) {
        context.translate( pad, debugSize - pad );
        context.translate( -bounds.minX, -bounds.minY );
        context.scale( scale, -scale );
      }

      function draw( callback ) {
        var canvas = document.createElement( 'canvas' );
        canvas.width = debugSize;
        canvas.height = debugSize;
        canvas.style.border = '1px solid black';
        var context = canvas.getContext( '2d' );
        transformContext( context );
        callback( context );
        document.body.appendChild( canvas );
      }

      function drawHalfEdges( context, halfEdges, color ) {
        for ( var i = 0; i < halfEdges.length; i++ ) {
          var segment = halfEdges[ i ].getDirectionalSegment();
          context.beginPath();
          context.moveTo( segment.start.x, segment.start.y );
          segment.writeToContext( context );

          var t = 0.8;
          var t2 = 0.83;
          var halfPosition = segment.positionAt( t );
          var morePosition = segment.positionAt( t2 );
          var ext = halfPosition.distance( morePosition ) * 2 / 3;
          var halfTangent = segment.tangentAt( t ).normalized();
          context.moveTo( halfPosition.x - halfTangent.y * ext, halfPosition.y + halfTangent.x * ext );
          context.lineTo( halfPosition.x + halfTangent.y * ext, halfPosition.y - halfTangent.x * ext );
          context.lineTo( morePosition.x, morePosition.y );
          context.closePath();

          context.strokeStyle = color;
          context.lineWidth = 2 / scale;
          context.stroke();
        }
      }

      function drawVertices( context ) {
        for ( var i = 0; i < self.vertices.length; i++ ) {
          context.beginPath();
          context.arc( self.vertices[ i ].point.x, self.vertices[ i ].point.y, 3 / scale, 0, Math.PI * 2, false );
          context.closePath();
          context.fillStyle = 'rgba(0,0,0,0.4)';
          context.fill();
        }
      }

      function drawEdges( context ) {
        for ( var i = 0; i < self.edges.length; i++ ) {
          var edge = self.edges[ i ];
          context.beginPath();
          context.moveTo( edge.segment.start.x, edge.segment.start.y );
          edge.segment.writeToContext( context );
          context.strokeStyle = 'rgba(0,0,0,0.4)';
          context.lineWidth = 2 / scale;
          context.stroke();
        }
      }

      function followBoundary( context, boundary ) {
        var startPoint = boundary.halfEdges[ 0 ].getDirectionalSegment().start;
        context.moveTo( startPoint.x, startPoint.y );
        for ( var i = 0; i < boundary.halfEdges.length; i++ ) {
          var segment = boundary.halfEdges[ i ].getDirectionalSegment();
          segment.writeToContext( context );
        }
        context.closePath();
      }

      function drawFace( context, face, color ) {
        context.beginPath();
        if ( face.boundary === null ) {
          context.moveTo( 1000, 0 );
          context.lineTo( 0, 1000 );
          context.lineTo( -1000, 0 );
          context.lineTo( 0, -1000 );
          context.closePath();
        }
        else {
          followBoundary( context, face.boundary );
        }
        face.holes.forEach( function( boundary ) {
          followBoundary( context, boundary );
        } );
        context.fillStyle = color;
        context.fill();
      }

      draw( function( context ) {
        drawVertices( context );
        drawEdges( context );
      } );

      for ( var j = 0; j < this.loops.length; j++ ) {
        var loop = this.loops[ j ];
        draw( function( context ) {
          drawVertices( context );
          drawHalfEdges( context, loop.halfEdges, 'rgba(0,0,0,0.4)' );
        } );
      }
      for ( j = 0; j < this.innerBoundaries.length; j++ ) {
        var innerBoundary = this.innerBoundaries[ j ];
        draw( function( context ) {
          drawVertices( context );
          drawHalfEdges( context, innerBoundary.halfEdges, 'rgba(0,0,255,0.4)' );
        } );
      }
      for ( j = 0; j < this.outerBoundaries.length; j++ ) {
        var outerBoundary = this.outerBoundaries[ j ];
        draw( function( context ) {
          drawVertices( context );
          drawHalfEdges( context, outerBoundary.halfEdges, 'rgba(255,0,0,0.4)' );
        } );
      }
      for ( j = 0; j < this.faces.length; j++ ) {
        draw( function( context ) {
          drawVertices( context );
          drawEdges( context );
          drawFace( context, self.faces[ j ], 'rgba(0,255,0,0.4)' );
        } );
      }
      for ( var k = 0; k < this.shapeIds.length; k++ ) {
        draw( function( context ) {
          var colorMap = {
            '-3': 'rgba(255,0,0,0.8)',
            '-2': 'rgba(255,0,0,0.4)',
            '-1': 'rgba(127,0,0,0.4)',
            '0': 'rgba(0,0,0,0.4)',
            '1': 'rgba(0,0,127,0.4)',
            '2': 'rgba(0,0,255,0.4)',
            '3': 'rgba(0,0,255,0.8)'
          };
          drawVertices( context );
          drawEdges( context );
          for ( j = 0; j < self.faces.length; j++ ) {
            drawFace( context, self.faces[ j ], colorMap[ self.faces[ j ].windingMap[ self.shapeIds[ k ] ] ] || 'green' );
          }
        } );
      }
      draw( function( context ) {
        drawVertices( context );
        drawEdges( context );
        for ( j = 0; j < self.faces.length; j++ ) {
          if ( self.faces[ j ].filled ) {
            drawFace( context, self.faces[ j ], 'rgba(0,0,0,0.4)' );
          }
        }
      } );
    }
  } );

  return kite.Graph;
} );
