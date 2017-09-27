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
  var Line = require( 'KITE/segments/Line' );
  var Loop = require( 'KITE/ops/Loop' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Segment = require( 'KITE/segments/Segment' );
  var Subpath = require( 'KITE/util/Subpath' );
  var Transform3 = require( 'DOT/Transform3' );
  var Util = require( 'DOT/Util' );
  var Vertex = require( 'KITE/ops/Vertex' );

  // TODO: Move to common place
  var vertexEpsilon = 1e-5;

  /**
   * @public (kite-internal)
   * @constructor
   */
  function Graph() {
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

    // @public {Array.<Loop>}
    this.loops = [];

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
        this.addSubpath( shapeId, shape.subpaths[ i ] );
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
      var needsLoop = true;
      while ( needsLoop ) {
        needsLoop = false;

        overlap:
        for ( var i = 0; i < this.edges.length; i++ ) {
          var aEdge = this.edges[ i ];
          var aSegment = aEdge.segment;
          for ( var j = i + 1; j < this.edges.length; j++ ) {
            var bEdge = this.edges[ j ];
            var bSegment = bEdge.segment;

            var overlaps;
            var overlap;
            if ( aSegment instanceof Line && bSegment instanceof Line ) {
              overlaps = Line.getOverlaps( aSegment, bSegment );
              if ( overlaps.length ) {
                overlap = overlaps[ 0 ];
                if ( Math.abs( overlap.t1 - overlap.t0 ) > 1e-5 &&
                     Math.abs( overlap.qt1 - overlap.qt0 ) > 1e-5 ) {
                  this.splitOverlap( aEdge, bEdge, overlap );

                  needsLoop = true;
                  break overlap;
                }
              }
            }
          }
        }
      }
      // TODO
    },

    splitOverlap: function( aEdge, bEdge, overlap ) {
      var aSegment = aEdge.segment;
      var bSegment = bEdge.segment;

      // Remove the edges from before
      arrayRemove( aEdge.startVertex.incidentEdges, aEdge );
      arrayRemove( aEdge.endVertex.incidentEdges, aEdge );
      arrayRemove( bEdge.startVertex.incidentEdges, bEdge );
      arrayRemove( bEdge.endVertex.incidentEdges, bEdge );
      arrayRemove( this.edges, aEdge );
      arrayRemove( this.edges, bEdge );

      var t0 = overlap.t0;
      var t1 = overlap.t1;
      var qt0 = overlap.qt0;
      var qt1 = overlap.qt1;

      // Apply rounding so we don't generate really small segments on the ends
      if ( t0 < 1e-5 ) { t0 = 0; }
      if ( t1 > 1 - 1e-5 ) { t1 = 1; }
      if ( qt0 < 1e-5 ) { qt0 = 0; }
      if ( qt1 > 1 - 1e-5 ) { qt1 = 1; }

      var aBefore = t0 > 0 ? aSegment.subdivided( t0 )[ 0 ] : null;
      var bBefore = qt0 > 0 ? bSegment.subdivided( qt0 )[ 0 ] : null;
      var aAfter = t1 < 1 ? aSegment.subdivided( t1 )[ 1 ] : null;
      var bAfter = qt1 < 1 ? bSegment.subdivided( qt1 )[ 1 ] : null;

      var middle = aSegment;
      if ( t0 > 0 ) {
        middle = middle.subdivided( t0 )[ 1 ];
      }
      if ( t1 < 1 ) {
        middle = middle.subdivided( Util.linear( t0, 1, 0, 1, t1 ) )[ 0 ];
      }

      var beforeVertex;
      if ( aBefore && bBefore ) {
        beforeVertex = Vertex.createFromPool( middle.start );
        this.vertices.push( beforeVertex );
      }
      else if ( aBefore ) {
        beforeVertex = overlap.a > 0 ? bEdge.startVertex : bEdge.endVertex;
      }
      else {
        beforeVertex = aEdge.startVertex;
      }

      var afterVertex;
      if ( aAfter && bAfter ) {
        afterVertex = Vertex.createFromPool( middle.end );
        this.vertices.push( afterVertex );
      }
      else if ( aAfter ) {
        afterVertex = overlap.a > 0 ? bEdge.endVertex : bEdge.startVertex;
      }
      else {
        afterVertex = aEdge.endVertex;
      }

      var middleEdge = Edge.createFromPool( middle, beforeVertex, afterVertex );
      beforeVertex.incidentEdges.push( middleEdge );
      afterVertex.incidentEdges.push( middleEdge );
      this.edges.push( middleEdge );


      var aBeforeEdge;
      var aAfterEdge;
      var bBeforeEdge;
      var bAfterEdge;

      if ( aBefore ) {
        var aBeforeVertex = beforeVertex;
        aBeforeEdge = Edge.createFromPool( aBefore, aEdge.startVertex, aBeforeVertex );
        aEdge.startVertex.incidentEdges.push( aBeforeEdge );
        aBeforeVertex.incidentEdges.push( aBeforeEdge );
        this.edges.push( aBeforeEdge );
      }
      if ( aAfter ) {
        var aAfterVertex = afterVertex;
        aAfterEdge = Edge.createFromPool( aAfter, aAfterVertex, aEdge.endVertex );
        aEdge.endVertex.incidentEdges.push( aAfterEdge );
        aAfterVertex.incidentEdges.push( aAfterEdge );
        this.edges.push( aAfterEdge );
      }
      if ( bBefore ) {
        var bBeforeVertex = overlap.a > 0 ? beforeVertex : afterVertex;
        bBeforeEdge = Edge.createFromPool( bBefore, bEdge.startVertex, bBeforeVertex );
        bEdge.startVertex.incidentEdges.push( bBeforeEdge );
        bBeforeVertex.incidentEdges.push( bBeforeEdge );
        this.edges.push( bBeforeEdge );
      }
      if ( bAfter ) {
        var bAfterVertex = overlap.a > 0 ? afterVertex : beforeVertex;
        bAfterEdge = Edge.createFromPool( bAfter, bAfterVertex, bEdge.endVertex );
        //TODO: consider Edge creation to do the adding to incident edges?
        bEdge.endVertex.incidentEdges.push( bAfterEdge );
        bAfterVertex.incidentEdges.push( bAfterEdge );
        this.edges.push( bAfterEdge );
      }

      var aEdges = ( aBefore ? [ aBeforeEdge ] : [] ).concat( [ middleEdge ] ).concat( aAfter ? [ aAfterEdge ] : [] );
      var bEdges = ( bBefore ? [ bBeforeEdge ] : [] ).concat( [ middleEdge ] ).concat( bAfter ? [ bAfterEdge ] : [] );

      var aForwardHalfEdges = [];
      var aReversedHalfEdges = [];
      var bForwardHalfEdges = [];
      var bReversedHalfEdges = [];

      for ( var i = 0; i < aEdges.length; i++ ) {
        aForwardHalfEdges.push( aEdges[ i ].forwardHalf );
        aReversedHalfEdges.push( aEdges[ aEdges.length - 1 - i ].reversedHalf );
      }
      for ( i = 0; i < bEdges.length; i++ ) {
        if ( bEdges[ i ] !== middleEdge || overlap.a > 0 ) {
          bForwardHalfEdges.push( bEdges[ i ].forwardHalf );
          bReversedHalfEdges.push( bEdges[ bEdges.length - 1 - i ].reversedHalf );
        }
        // Handle reversing the "middle" edge
        else {
          bForwardHalfEdges.push( bEdges[ i ].reversedHalf );
          bReversedHalfEdges.push( bEdges[ bEdges.length - 1 - i ].forwardHalf );
        }
      }

      for ( i = 0; i < this.loops.length; i++ ) {
        var loop = this.loops[ i ];
        for ( var j = loop.halfEdges.length - 1; j >= 0; j-- ) {
          var halfEdge = loop.halfEdges[ j ];
          if ( halfEdge === aEdge.forwardHalf ) {
            assert && assert( halfEdge.startVertex.point.distance( aForwardHalfEdges[ 0 ].startVertex.point ) < 1e-5 );
            assert && assert( halfEdge.endVertex.point.distance( aForwardHalfEdges[ aForwardHalfEdges.length - 1 ].endVertex.point ) < 1e-5 );
            Array.prototype.splice.apply( loop.halfEdges, [ j, 1 ].concat( aForwardHalfEdges ) );
          }
          if ( halfEdge === aEdge.reversedHalf ) {
            assert && assert( halfEdge.startVertex.point.distance( aReversedHalfEdges[ 0 ].startVertex.point ) < 1e-5 );
            assert && assert( halfEdge.endVertex.point.distance( aReversedHalfEdges[ aReversedHalfEdges.length - 1 ].endVertex.point ) < 1e-5 );
            Array.prototype.splice.apply( loop.halfEdges, [ j, 1 ].concat( aReversedHalfEdges ) );
          }
          if ( halfEdge === bEdge.forwardHalf ) {
            assert && assert( halfEdge.startVertex.point.distance( bForwardHalfEdges[ 0 ].startVertex.point ) < 1e-5 );
            assert && assert( halfEdge.endVertex.point.distance( bForwardHalfEdges[ bForwardHalfEdges.length - 1 ].endVertex.point ) < 1e-5 );
            Array.prototype.splice.apply( loop.halfEdges, [ j, 1 ].concat( bForwardHalfEdges ) );
          }
          if ( halfEdge === bEdge.reversedHalf ) {
            assert && assert( halfEdge.startVertex.point.distance( bReversedHalfEdges[ 0 ].startVertex.point ) < 1e-5 );
            assert && assert( halfEdge.endVertex.point.distance( bReversedHalfEdges[ bReversedHalfEdges.length - 1 ].endVertex.point ) < 1e-5 );
            Array.prototype.splice.apply( loop.halfEdges, [ j, 1 ].concat( bReversedHalfEdges ) );
          }
        }
      }
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
      arrayRemove( this.edges, edge ); // TODO: disposal
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
      var self = this;
      assert && assert( _.every( this.edges, function( edge ) { return _.includes( self.vertices, edge.startVertex ); } ) );
      assert && assert( _.every( this.edges, function( edge ) { return _.includes( self.vertices, edge.endVertex ); } ) );

      var needsLoop = true;
      while ( needsLoop ) {
        needsLoop = false;
        nextLoop:
        for ( var i = 0; i < this.vertices.length; i++ ) {
          var aVertex = this.vertices[ i ];
          for ( var j = i + 1; j < this.vertices.length; j++ ) {
            var bVertex = this.vertices[ j ];

            var distance = aVertex.point.distance( bVertex.point );
            if ( distance < vertexEpsilon ) {
              var newVertex = Vertex.createFromPool( distance === 0 ? aVertex.point : aVertex.point.average( bVertex.point ) );
              this.vertices.push( newVertex );

              // TODO: disposal
              arrayRemove( this.vertices, aVertex );
              arrayRemove( this.vertices, bVertex );
              for ( var k = this.edges.length - 1; k >= 0; k-- ) {
                var edge = this.edges[ k ];
                var startMatches = edge.startVertex === aVertex || edge.startVertex === bVertex;
                var endMatches = edge.endVertex === aVertex || edge.endVertex === bVertex;

                // Outright remove edges that were between A and B.
                if ( startMatches && endMatches ) {
                  this.edges.splice( k, 1 ); // TODO: disposal
                  for ( var m = 0; m < this.loops.length; m++ ) {
                    var loop = this.loops[ m ];
                    for ( var n = loop.halfEdges.length - 1; n >= 0; n-- ) {
                      if ( loop.halfEdges[ n ] === edge.forwardHalf || loop.halfEdges[ n ] === edge.reversedHalf ) {
                        loop.halfEdges.splice( n, 1 );
                      }
                    }
                    // TODO: check to see if the loop ceases to exist
                  }
                }
                else if ( startMatches ) {
                  edge.startVertex = newVertex;
                  newVertex.incidentEdges.push( edge );
                  edge.updateReferences();
                }
                else if ( endMatches ) {
                  edge.endVertex = newVertex;
                  newVertex.incidentEdges.push( edge );
                  edge.updateReferences();
                }
              }

              needsLoop = true;
              break nextLoop;
            }
          }
        }
      }

      assert && assert( _.every( this.edges, function( edge ) { return _.includes( self.vertices, edge.startVertex ); } ) );
      assert && assert( _.every( this.edges, function( edge ) { return _.includes( self.vertices, edge.endVertex ); } ) );
    },

    removeSingleEdgeVertices: function() {
      var self = this;
      assert && assert( _.every( this.edges, function( edge ) { return _.includes( self.vertices, edge.startVertex ); } ) );
      assert && assert( _.every( this.edges, function( edge ) { return _.includes( self.vertices, edge.endVertex ); } ) );
      // TODO: Really need to make sure things are 2-vertex-connected. Look up ways

      var needsLoop = true;
      while ( needsLoop ) {
        needsLoop = false;

        nextVertexLoop:
        for ( var i = this.vertices.length - 1; i >= 0; i-- ) {
          var vertex = this.vertices[ i ];

          // TODO: proper disposal
          if ( vertex.incidentEdges.length < 2 ) {
            // Disconnect any existing edges
            for ( var j = 0; j < vertex.incidentEdges.length; j++ ) {
              var edge = vertex.incidentEdges[ j ];
              var otherVertex = edge.getOtherVertex( vertex );
              arrayRemove( otherVertex.incidentEdges, edge );
              arrayRemove( this.edges, edge );

              // TODO: remember to simplify this out (deduplicate)
              for ( var m = 0; m < this.loops.length; m++ ) {
                var loop = this.loops[ m ];
                for ( var n = loop.halfEdges.length - 1; n >= 0; n-- ) {
                  if ( loop.halfEdges[ n ] === edge.forwardHalf || loop.halfEdges[ n ] === edge.reversedHalf ) {
                    loop.halfEdges.splice( n, 1 );
                  }
                }
                // TODO: check to see if the loop ceases to exist
              }
            }

            // Remove the vertex
            this.vertices.splice( i, 1 );

            needsLoop = true;
            break nextVertexLoop;
          }
        }
      }
      assert && assert( _.every( this.edges, function( edge ) { return _.includes( self.vertices, edge.startVertex ); } ) );
      assert && assert( _.every( this.edges, function( edge ) { return _.includes( self.vertices, edge.endVertex ); } ) );
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

    // TODO: detect "indeterminate" for robustness
    computeBoundaryGraph: function() {
      var unboundedHoles = []; // {Array.<Boundary>}

      // TODO: uhhh, pray this angle works and doesnt get indeterminate results?
      var transform = new Transform3( Matrix3.rotation2( 1.5729657 ) );

      for ( var i = 0; i < this.outerBoundaries.length; i++ ) {
        var outerBoundary = this.outerBoundaries[ i ];

        var ray = outerBoundary.computeExtremeRay( transform );

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

            if ( assert ) {
              for ( var m = 0; m < this.shapeIds.length; m++ ) {
                var id = this.shapeIds[ m ];
                assert( forwardFace.windingMap[ id ] - reversedFace.windingMap[ id ] === this.computeDifferential( edge, id ) );
              }
            }
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
              var differential = this.computeDifferential( edge, shapeId );
              windingMap[ shapeId ] = solvedFace.windingMap[ shapeId ] + differential * ( solvedForward ? -1 : 1 );
            }
            unsolvedFace.windingMap = windingMap;
          }
        }
      }
    },

    /**
     * Computes the differential in winding numbers (forward face winding number minus the reversed face winding number)
     * ("forward face" is the face on the forward half-edge side, etc.)
     * @public
     *
     * @param {Edge} edge
     * @param {number} shapeId
     * @returns {number} - The difference between forward face and reversed face winding numbers.
     */
    computeDifferential: function( edge, shapeId ) {
      var differential = 0; // forward face - reversed face
      for ( var m = 0; m < this.loops.length; m++ ) {
        var loop = this.loops[ m ];
        if ( loop.shapeId !== shapeId ) {
          continue;
        }

        for ( var n = 0; n < loop.halfEdges.length; n++ ) {
          var loopHalfEdge = loop.halfEdges[ n ];
          if ( loopHalfEdge === edge.forwardHalf ) {
            differential++;
          }
          else if ( loopHalfEdge === edge.reversedHalf ) {
            differential--;
          }
        }
      }
      return differential;
    },

    computeFaceInclusion: function( windingMapFilter ) {
      for ( var i = 0; i < this.faces.length; i++ ) {
        var face = this.faces[ i ];
        face.filled = windingMapFilter( face.windingMap );
      }
    },

    createFilledSubGraph: function() {
      var graph = new Graph();

      var vertexMap = {}; // old id => newVertex

      for ( var i = 0; i < this.edges.length; i++ ) {
        var edge = this.edges[ i ];
        if ( edge.forwardHalf.face.filled !== edge.reversedHalf.face.filled ) {
          if ( !vertexMap[ edge.startVertex.id ] ) {
            var newStartVertex = Vertex.createFromPool( edge.startVertex.point );
            graph.vertices.push( newStartVertex );
            vertexMap[ edge.startVertex.id ] = newStartVertex;
          }
          if ( !vertexMap[ edge.endVertex.id ] ) {
            var newEndVertex = Vertex.createFromPool( edge.endVertex.point );
            graph.vertices.push( newEndVertex );
            vertexMap[ edge.endVertex.id ] = newEndVertex;
          }

          var startVertex = vertexMap[ edge.startVertex.id ];
          var endVertex = vertexMap[ edge.endVertex.id ];
          var newEdge = Edge.createFromPool( edge.segment, startVertex, endVertex );
          startVertex.incidentEdges.push( newEdge );
          endVertex.incidentEdges.push( newEdge );
          graph.edges.push( newEdge );
        }
      }

      graph.orderVertexEdges();
      graph.extractFaces();
      graph.computeBoundaryGraph();

      return graph;
    },

    fillAlternatingFaces: function() {
      var nullFaceFilledCount = 0;
      for ( var i = 0; i < this.faces.length; i++ ) {
        this.faces[ i ].filled = null;
        nullFaceFilledCount++;
      }

      this.unboundedFace.filled = false;
      nullFaceFilledCount--;

      while ( nullFaceFilledCount ) {
        for ( i = 0; i < this.edges.length; i++ ) {
          var edge = this.edges[ i ];
          var forwardFace = edge.forwardHalf.face;
          var reversedFace = edge.reversedHalf.face;

          var forwardNull = forwardFace.filled === null;
          var reversedNull = reversedFace.filled === null;

          if ( forwardNull && !reversedNull ) {
            forwardFace.filled = !reversedFace.filled;
            nullFaceFilledCount--;
          }
          else if ( !forwardNull && reversedNull ) {
            reversedFace.filled = !forwardFace.filled;
            nullFaceFilledCount--;
          }
        }
      }
    },

    facesToShape: function() {
      var subpaths = [];
      for ( var i = 0; i < this.faces.length; i++ ) {
        var face = this.faces[ i ];
        if ( face.filled ) {
          subpaths.push( face.boundary.toSubpath() );
          for ( var j = 0; j < face.holes.length; j++ ) {
            subpaths.push( face.holes[ j ].toSubpath() );
          }
        }
      }
      return new kite.Shape( subpaths );
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
      var pad = 20;
      var scale = ( debugSize - pad * 2 ) / Math.max( bounds.width, bounds.height );

      function transformContext( context ) {
        context.translate( pad, debugSize - pad );
        context.translate( -bounds.minX, -bounds.minY );
        context.scale( scale, -scale );
      }

      //TODO: add title
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
          // var ray = innerBoundary.computeExtremeRay( new Transform3( Matrix3.rotation2( Math.PI * 1.4 ) ) );
          // context.beginPath();
          // context.moveTo( ray.position.x, ray.position.y );
          // context.lineTo( ray.pointAtDistance( 2 ).x, ray.pointAtDistance( 2 ).y );
          // context.strokeStyle = 'rgba(0,255,0,0.4)';
          // context.stroke();
        } );
      }
      for ( j = 0; j < this.outerBoundaries.length; j++ ) {
        var outerBoundary = this.outerBoundaries[ j ];
        draw( function( context ) {
          drawVertices( context );
          drawHalfEdges( context, outerBoundary.halfEdges, 'rgba(255,0,0,0.4)' );
          // var ray = outerBoundary.computeExtremeRay( new Transform3( Matrix3.rotation2( Math.PI * 1.4 ) ) );
          // context.beginPath();
          // context.moveTo( ray.position.x, ray.position.y );
          // context.lineTo( ray.pointAtDistance( 2 ).x, ray.pointAtDistance( 2 ).y );
          // context.strokeStyle = 'rgba(0,255,0,0.4)';
          // context.stroke();
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
            if ( self.faces[ j ].windingMap ) {
              drawFace( context, self.faces[ j ], colorMap[ self.faces[ j ].windingMap[ self.shapeIds[ k ] ] ] || 'green' );
            }
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
      for ( k = 0; k < this.shapeIds.length; k++ ) {
        draw( function( context ) {
          drawVertices( context );
          drawHalfEdges( context, self.edges.map( function( edge ) { return edge.forwardHalf; } ), 'rgba(0,0,0,0.4)' );
          for ( j = 0; j < self.edges.length; j++ ) {
            var edge = self.edges[ j ];
            var center = edge.segment.start.average( edge.segment.end );
            context.save();
            context.translate( center.x, center.y );
            context.scale( 1, -1 );
            context.font = '2px serif';
            context.textBasline = 'middle';
            context.textAlign = 'center';
            context.fillStyle = 'red';
            context.fillText( '' + self.computeDifferential( edge, self.shapeIds[ k ] ), 0, 0 );
            context.fillStyle = 'blue';
            context.font = '1px serif';
            context.fillText( edge.id, 0, 1 );
            context.restore();
          }
          // for ( j = 0; j < self.faces.length; j++ ) {
          //   if ( self.faces[ j ].windingMap ) {
          //     drawFace( context, self.faces[ j ], colorMap[ self.faces[ j ].windingMap[ self.shapeIds[ k ] ] ] || 'green' );
          //   }
          // }
        } );
      }
    }
  } );

  Graph.BINARY_NONZERO_UNION = function( windingMap ) {
    return windingMap[ '0' ] !== 0 || windingMap[ '1' ] !== 0;
  };

  Graph.BINARY_NONZERO_INTERSECTION = function( windingMap ) {
    return windingMap[ '0' ] !== 0 && windingMap[ '1' ] !== 0;
  };

  Graph.BINARY_NONZERO_DIFFERENCE = function( windingMap ) {
    return windingMap[ '0' ] !== 0 && windingMap[ '1' ] === 0;
  };

  Graph.BINARY_NONZERO_XOR = function( windingMap ) {
    return ( ( windingMap[ '0' ] !== 0 ) ^ ( windingMap[ '1' ] !== 0 ) ) === 1;
  };

  Graph.binaryResult = function( shapeA, shapeB, windingMapFilter ) {
    var graph = new Graph();
    graph.addShape( 0, shapeA );
    graph.addShape( 1, shapeB );

    graph.eliminateOverlap();
    graph.eliminateIntersection();
    graph.collapseVertices();
    graph.removeSingleEdgeVertices();
    graph.orderVertexEdges();
    graph.extractFaces();
    graph.computeBoundaryGraph();
    graph.computeWindingMap();
    graph.computeFaceInclusion( windingMapFilter );
    // graph.debug();
    var subgraph = graph.createFilledSubGraph();
    subgraph.fillAlternatingFaces();
    // subgraph.debug();
    var shape = subgraph.facesToShape();

    // TODO: disposal

    return shape;
  };

  return kite.Graph;
} );
