// Copyright 2017-2021, University of Colorado Boulder

/**
 * A multigraph whose edges are segments.
 *
 * Supports general shape simplification, overlap/intersection removal and computation. General output would include
 * Shapes (from CAG - Constructive Area Geometry) and triangulations.
 *
 * See Graph.binaryResult for the general procedure for CAG.
 *
 * TODO: Use https://github.com/mauriciosantos/Buckets-JS for priority queue, implement simple sweep line
 *       with "enters" and "leaves" entries in the queue. When edge removed, remove "leave" from queue.
 *       and add any replacement edges. Applies to overlap and intersection handling.
 *       NOTE: This should impact performance a lot, as we are currently over-scanning and re-scanning a lot.
 *       Intersection is currently (by far?) the performance bottleneck.
 * TODO: Collapse non-Line adjacent edges together. Similar logic to overlap for each segment time, hopefully can
 *       factor this out.
 * TODO: Properly handle sorting edges around a vertex when two edges have the same tangent out. We'll need to use
 *       curvature, or do tricks to follow both curves by an 'epsilon' and sort based on that.
 * TODO: Consider separating out epsilon values (may be a general Kite thing rather than just ops)
 * TODO: Loop-Blinn output and constrained Delaunay triangulation
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Matrix3 from '../../../dot/js/Matrix3.js';
import Transform3 from '../../../dot/js/Transform3.js';
import Utils from '../../../dot/js/Utils.js';
import arrayRemove from '../../../phet-core/js/arrayRemove.js';
import cleanArray from '../../../phet-core/js/cleanArray.js';
import merge from '../../../phet-core/js/merge.js';
import kite from '../kite.js';
import Arc from '../segments/Arc.js';
import Cubic from '../segments/Cubic.js';
import EllipticalArc from '../segments/EllipticalArc.js';
import Line from '../segments/Line.js';
import Quadratic from '../segments/Quadratic.js';
import Segment from '../segments/Segment.js';
import Subpath from '../util/Subpath.js';
import Boundary from './Boundary.js';
import Edge from './Edge.js';
import Face from './Face.js';
import Loop from './Loop.js';
import Vertex from './Vertex.js';

let bridgeId = 0;

class Graph {
  /**
   * @public (kite-internal)
   */
  constructor() {
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


  /**
   * Adds a Shape (with a given ID for CAG purposes) to the graph.
   * @public
   *
   * @param {number} shapeId - The ID which should be shared for all paths/shapes that should be combined with
   *                           respect to the winding number of faces. For CAG, independent shapes should be given
   *                           different IDs (so they have separate winding numbers recorded).
   * @param {Shape} shape
   * @param {Object} [options] - See addSubpath
   */
  addShape( shapeId, shape, options ) {
    for ( let i = 0; i < shape.subpaths.length; i++ ) {
      this.addSubpath( shapeId, shape.subpaths[ i ], options );
    }
  }

  /**
   * Adds a subpath of a Shape (with a given ID for CAG purposes) to the graph.
   * @public
   *
   * @param {number} shapeId - See addShape() documentation
   * @param {Subpath} subpath
   * @param {Object} [options]
   */
  addSubpath( shapeId, subpath, options ) {
    assert && assert( typeof shapeId === 'number' );
    assert && assert( subpath instanceof Subpath );

    options = merge( {
      ensureClosed: true
    }, options );

    // Ensure the shapeId is recorded
    if ( this.shapeIds.indexOf( shapeId ) < 0 ) {
      this.shapeIds.push( shapeId );
    }

    if ( subpath.segments.length === 0 ) {
      return;
    }

    const closed = subpath.closed || options.ensureClosed;
    const segments = options.ensureClosed ? subpath.getFillSegments() : subpath.segments;
    let index;

    // Collects all of the vertices
    const vertices = [];
    for ( index = 0; index < segments.length; index++ ) {
      let previousIndex = index - 1;
      if ( previousIndex < 0 ) {
        previousIndex = segments.length - 1;
      }

      // Get the end of the previous segment and start of the next. Generally they should be equal or almost equal,
      // as it's the point at the joint of two segments.
      let end = segments[ previousIndex ].end;
      const start = segments[ index ].start;

      // If we are creating an open "loop", don't interpolate the start/end of the entire subpath together.
      if ( !closed && index === 0 ) {
        end = start;
      }

      // If they are exactly equal, don't take a chance on floating-point arithmetic
      if ( start.equals( end ) ) {
        vertices.push( Vertex.createFromPool( start ) );
      }
      else {
        assert && assert( start.distance( end ) < 1e-5, 'Inaccurate start/end points' );
        vertices.push( Vertex.createFromPool( start.average( end ) ) );
      }
    }
    if ( !closed ) {
      // If we aren't closed, create an "end" vertex since it may be different from the "start"
      vertices.push( Vertex.createFromPool( segments[ segments.length - 1 ].end ) );
    }

    // Create the loop object from the vertices, filling in edges
    const loop = Loop.createFromPool( shapeId, closed );
    for ( index = 0; index < segments.length; index++ ) {
      let nextIndex = index + 1;
      if ( closed && nextIndex === segments.length ) {
        nextIndex = 0;
      }

      const edge = Edge.createFromPool( segments[ index ], vertices[ index ], vertices[ nextIndex ] );
      loop.halfEdges.push( edge.forwardHalf );
      this.addEdge( edge );
    }

    this.loops.push( loop );
    this.vertices.push( ...vertices );
  }

  /**
   * Simplifies edges/vertices, computes boundaries and faces (with the winding map).
   * @public
   */
  computeSimplifiedFaces() {
    // Before we find any intersections (self-intersection or between edges), we'll want to identify and fix up
    // any cases where there are an infinite number of intersections between edges (they are continuously
    // overlapping). For any overlap, we'll split it into one "overlap" edge and any remaining edges. After this
    // process, there should be no continuous overlaps.
    this.eliminateOverlap();

    // Detects any edge self-intersection, and splits it into multiple edges. This currently happens with cubics only,
    // but needs to be done before we intersect those cubics with any other edges.
    this.eliminateSelfIntersection();

    // Find inter-edge intersections (that aren't at endpoints). Splits edges involved into the intersection. After
    // this pass, we should have a well-defined graph where in the planar embedding edges don't intersect or overlap.
    this.eliminateIntersection();

    // From the above process (and input), we may have multiple vertices that occupy essentially the same location.
    // These vertices get combined into one vertex in the location. If there was a mostly-degenerate edge that was
    // very small between edges, it will be removed.
    this.collapseVertices();

    // Our graph can end up with edges that would have the same face on both sides (are considered a "bridge" edge).
    // These need to be removed, so that our face handling logic doesn't have to handle another class of cases.
    this.removeBridges();

    // Vertices can be left over where they have less than 2 incident edges, and they can be safely removed (since
    // they won't contribute to the area output).
    this.removeLowOrderVertices();

    // Now that the graph has well-defined vertices and edges (2-edge-connected, nonoverlapping), we'll want to know
    // the order of edges around a vertex (if you rotate around a vertex, what edges are in what order?).
    this.orderVertexEdges();

    // Extracts boundaries and faces, by following each half-edge counter-clockwise, and faces are created for
    // boundaries that have positive signed area.
    this.extractFaces();

    // We need to determine which boundaries are holes for each face. This creates a "boundary tree" where the nodes
    // are boundaries. All connected components should be one face and its holes. The holes get stored on the
    // respective face.
    this.computeBoundaryTree();

    // Compute the winding numbers of each face for each shapeId, to determine whether the input would have that
    // face "filled". It should then be ready for future processing.
    this.computeWindingMap();
  }

  /**
   * Sets whether each face should be filled or unfilled based on a filter function.
   * @public
   *
   * The windingMapFilter will be called on each face's winding map, and will use the return value as whether the face
   * is filled or not.
   *
   * The winding map is an {Object} associated with each face that has a key for every shapeId that was used in
   * addShape/addSubpath, and the value for those keys is the winding number of the face given all paths with the
   * shapeId.
   *
   * For example, imagine you added two shapeIds (0 and 1), and the iteration is on a face that is included in
   * one loop specified with shapeId:0 (inside a counter-clockwise curve), and is outside of any segments specified
   * by the second loop (shapeId:1). Then the winding map will be:
   * {
   *   0: 1 // shapeId:0 has a winding number of 1 for this face (generally filled)
   *   1: 0 // shapeId:1 has a winding number of 0 for this face (generally not filled)
   * }
   *
   * Generally, winding map filters can be broken down into two steps:
   * 1. Given the winding number for each shapeId, compute whether that loop was originally filled. Normally, this is
   *    done with a non-zero rule (any winding number is filled, except zero). SVG also provides an even-odd rule
   *    (odd numbers are filled, even numbers are unfilled).
   * 2. Given booleans for each shapeId from step 1, compute CAG operations based on boolean formulas. Say you wanted
   *    to take the union of shapeIds 0 and 1, then remove anything in shapeId 2. Given the booleans above, this can
   *    be directly computed as (filled0 || filled1) && !filled2.
   *
   * @param {function} windingMapFilter
   */
  computeFaceInclusion( windingMapFilter ) {
    for ( let i = 0; i < this.faces.length; i++ ) {
      const face = this.faces[ i ];
      face.filled = windingMapFilter( face.windingMap );
    }
  }

  /**
   * Create a new Graph object based only on edges in this graph that separate a "filled" face from an "unfilled"
   * face.
   * @public
   *
   * This is a convenient way to "collapse" adjacent filled and unfilled faces together, and compute the curves and
   * holes properly, given a filled "normal" graph.
   */
  createFilledSubGraph() {
    const graph = new Graph();

    const vertexMap = {}; // old id => newVertex

    for ( let i = 0; i < this.edges.length; i++ ) {
      const edge = this.edges[ i ];
      if ( edge.forwardHalf.face.filled !== edge.reversedHalf.face.filled ) {
        if ( !vertexMap[ edge.startVertex.id ] ) {
          const newStartVertex = Vertex.createFromPool( edge.startVertex.point );
          graph.vertices.push( newStartVertex );
          vertexMap[ edge.startVertex.id ] = newStartVertex;
        }
        if ( !vertexMap[ edge.endVertex.id ] ) {
          const newEndVertex = Vertex.createFromPool( edge.endVertex.point );
          graph.vertices.push( newEndVertex );
          vertexMap[ edge.endVertex.id ] = newEndVertex;
        }

        const startVertex = vertexMap[ edge.startVertex.id ];
        const endVertex = vertexMap[ edge.endVertex.id ];
        graph.addEdge( Edge.createFromPool( edge.segment, startVertex, endVertex ) );
      }
    }

    // Run some more "simplified" processing on this graph to determine which faces are filled (after simplification).
    // We don't need the intersection or other processing steps, since this was accomplished (presumably) already
    // for the given graph.
    graph.collapseAdjacentEdges();
    graph.orderVertexEdges();
    graph.extractFaces();
    graph.computeBoundaryTree();
    graph.fillAlternatingFaces();

    return graph;
  }

  /**
   * Returns a Shape that creates a subpath for each filled face (with the desired holes).
   * @public
   *
   * Generally should be called on a graph created with createFilledSubGraph().
   *
   * @returns {Shape}
   */
  facesToShape() {
    const subpaths = [];
    for ( let i = 0; i < this.faces.length; i++ ) {
      const face = this.faces[ i ];
      if ( face.filled ) {
        subpaths.push( face.boundary.toSubpath() );
        for ( let j = 0; j < face.holes.length; j++ ) {
          subpaths.push( face.holes[ j ].toSubpath() );
        }
      }
    }
    return new kite.Shape( subpaths );
  }

  /**
   * Releases owned objects to their pools, and clears references that may have been picked up from external sources.
   * @public
   */
  dispose() {

    // this.boundaries should contain all elements of innerBoundaries and outerBoundaries
    while ( this.boundaries.length ) {
      this.boundaries.pop().dispose();
    }
    cleanArray( this.innerBoundaries );
    cleanArray( this.outerBoundaries );

    while ( this.loops.length ) {
      this.loops.pop().dispose();
    }
    while ( this.faces.length ) {
      this.faces.pop().dispose();
    }
    while ( this.vertices.length ) {
      this.vertices.pop().dispose();
    }
    while ( this.edges.length ) {
      this.edges.pop().dispose();
    }
  }

  /**
   * Adds an edge to the graph (and sets up connection information).
   * @private
   *
   * @param {Edge} edge
   */
  addEdge( edge ) {
    assert && assert( edge instanceof Edge );
    assert && assert( !_.includes( edge.startVertex.incidentHalfEdges, edge.reversedHalf ), 'Should not already be connected' );
    assert && assert( !_.includes( edge.endVertex.incidentHalfEdges, edge.forwardHalf ), 'Should not already be connected' );

    this.edges.push( edge );
    edge.startVertex.incidentHalfEdges.push( edge.reversedHalf );
    edge.endVertex.incidentHalfEdges.push( edge.forwardHalf );
  }

  /**
   * Removes an edge from the graph (and disconnects incident information).
   * @private
   *
   * @param {Edge} edge
   */
  removeEdge( edge ) {
    assert && assert( edge instanceof Edge );

    arrayRemove( this.edges, edge );
    arrayRemove( edge.startVertex.incidentHalfEdges, edge.reversedHalf );
    arrayRemove( edge.endVertex.incidentHalfEdges, edge.forwardHalf );
  }

  /**
   * Replaces a single edge (in loops) with a series of edges (possibly empty).
   * @private
   *
   * @param {Edge} edge
   * @param {Array.<HalfEdge>} forwardHalfEdges
   */
  replaceEdgeInLoops( edge, forwardHalfEdges ) {
    // Compute reversed half-edges
    const reversedHalfEdges = [];
    for ( let i = 0; i < forwardHalfEdges.length; i++ ) {
      reversedHalfEdges.push( forwardHalfEdges[ forwardHalfEdges.length - 1 - i ].getReversed() );
    }

    for ( let i = 0; i < this.loops.length; i++ ) {
      const loop = this.loops[ i ];

      for ( let j = loop.halfEdges.length - 1; j >= 0; j-- ) {
        const halfEdge = loop.halfEdges[ j ];

        if ( halfEdge.edge === edge ) {
          const replacementHalfEdges = halfEdge === edge.forwardHalf ? forwardHalfEdges : reversedHalfEdges;
          Array.prototype.splice.apply( loop.halfEdges, [ j, 1 ].concat( replacementHalfEdges ) );
        }
      }
    }
  }

  /**
   * Tries to combine adjacent edges (with a 2-order vertex) into one edge where possible.
   * @private
   *
   * This helps to combine things like collinear lines, where there's a vertex that can basically be removed.
   */
  collapseAdjacentEdges() {
    let needsLoop = true;
    while ( needsLoop ) {
      needsLoop = false;

      for ( let i = 0; i < this.vertices.length; i++ ) {
        const vertex = this.vertices[ i ];
        if ( vertex.incidentHalfEdges.length === 2 ) {
          const aEdge = vertex.incidentHalfEdges[ 0 ].edge;
          const bEdge = vertex.incidentHalfEdges[ 1 ].edge;
          let aSegment = aEdge.segment;
          let bSegment = bEdge.segment;
          const aVertex = aEdge.getOtherVertex( vertex );
          const bVertex = bEdge.getOtherVertex( vertex );

          assert && assert( this.loops.length === 0 );

          // TODO: Can we avoid this in the inner loop?
          if ( aEdge.startVertex === vertex ) {
            aSegment = aSegment.reversed();
          }
          if ( bEdge.endVertex === vertex ) {
            bSegment = bSegment.reversed();
          }

          if ( aSegment instanceof Line && bSegment instanceof Line ) {
            // See if the lines are collinear, so that we can combine them into one edge
            if ( aSegment.tangentAt( 0 ).normalized().distance( bSegment.tangentAt( 0 ).normalized() ) < 1e-6 ) {
              this.removeEdge( aEdge );
              this.removeEdge( bEdge );
              aEdge.dispose();
              bEdge.dispose();
              arrayRemove( this.vertices, vertex );
              vertex.dispose();

              const newSegment = new Line( aVertex.point, bVertex.point );
              this.addEdge( new Edge( newSegment, aVertex, bVertex ) );

              needsLoop = true;
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Gets rid of overlapping segments by combining overlaps into a shared edge.
   * @private
   */
  eliminateOverlap() {
    let needsLoop = true;
    while ( needsLoop ) {
      needsLoop = false;

      overlap: // eslint-disable-line no-labels
        for ( let i = 0; i < this.edges.length; i++ ) {
          const aEdge = this.edges[ i ];
          const aSegment = aEdge.segment;
          for ( let j = i + 1; j < this.edges.length; j++ ) {
            const bEdge = this.edges[ j ];
            const bSegment = bEdge.segment;

            let overlapFunction = null;
            if ( aSegment instanceof Line && bSegment instanceof Line ) {
              overlapFunction = Line.getOverlaps;
            }
            if ( aSegment instanceof Quadratic && bSegment instanceof Quadratic ) {
              overlapFunction = Quadratic.getOverlaps;
            }
            if ( aSegment instanceof Cubic && bSegment instanceof Cubic ) {
              overlapFunction = Cubic.getOverlaps;
            }
            if ( aSegment instanceof Arc && bSegment instanceof Arc ) {
              overlapFunction = Arc.getOverlaps;
            }
            if ( aSegment instanceof EllipticalArc && bSegment instanceof EllipticalArc ) {
              overlapFunction = EllipticalArc.getOverlaps;
            }

            if ( overlapFunction ) {
              const overlaps = overlapFunction( aSegment, bSegment );
              if ( overlaps.length ) {
                for ( let k = 0; k < overlaps.length; k++ ) {
                  const overlap = overlaps[ k ];
                  if ( Math.abs( overlap.t1 - overlap.t0 ) > 1e-5 &&
                       Math.abs( overlap.qt1 - overlap.qt0 ) > 1e-5 ) {
                    this.splitOverlap( aEdge, bEdge, overlap );

                    needsLoop = true;
                    break overlap; // eslint-disable-line no-labels
                  }
                }
              }
            }
          }
        }
    }
  }

  /**
   * Splits/combines edges when there is an overlap of two edges (two edges who have an infinite number of
   * intersection points).
   * @private
   *
   * Generally this creates an edge for the "shared" part of both segments, and then creates edges for the parts
   * outside of the shared region, connecting them together.
   *
   * @param {Edge} aEdge
   * @param {Edge} bEdge
   * @param {Overlap} overlap
   */
  splitOverlap( aEdge, bEdge, overlap ) {
    const aSegment = aEdge.segment;
    const bSegment = bEdge.segment;

    // Remove the edges from before
    this.removeEdge( aEdge );
    this.removeEdge( bEdge );

    let t0 = overlap.t0;
    let t1 = overlap.t1;
    let qt0 = overlap.qt0;
    let qt1 = overlap.qt1;

    // Apply rounding so we don't generate really small segments on the ends
    if ( t0 < 1e-5 ) { t0 = 0; }
    if ( t1 > 1 - 1e-5 ) { t1 = 1; }
    if ( qt0 < 1e-5 ) { qt0 = 0; }
    if ( qt1 > 1 - 1e-5 ) { qt1 = 1; }

    // Whether there will be remaining edges on each side.
    const aBefore = t0 > 0 ? aSegment.subdivided( t0 )[ 0 ] : null;
    const bBefore = qt0 > 0 ? bSegment.subdivided( qt0 )[ 0 ] : null;
    const aAfter = t1 < 1 ? aSegment.subdivided( t1 )[ 1 ] : null;
    const bAfter = qt1 < 1 ? bSegment.subdivided( qt1 )[ 1 ] : null;

    let middle = aSegment;
    if ( t0 > 0 ) {
      middle = middle.subdivided( t0 )[ 1 ];
    }
    if ( t1 < 1 ) {
      middle = middle.subdivided( Utils.linear( t0, 1, 0, 1, t1 ) )[ 0 ];
    }

    let beforeVertex;
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

    let afterVertex;
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

    const middleEdge = Edge.createFromPool( middle, beforeVertex, afterVertex );
    this.addEdge( middleEdge );

    let aBeforeEdge;
    let aAfterEdge;
    let bBeforeEdge;
    let bAfterEdge;

    // Add "leftover" edges
    if ( aBefore ) {
      aBeforeEdge = Edge.createFromPool( aBefore, aEdge.startVertex, beforeVertex );
      this.addEdge( aBeforeEdge );
    }
    if ( aAfter ) {
      aAfterEdge = Edge.createFromPool( aAfter, afterVertex, aEdge.endVertex );
      this.addEdge( aAfterEdge );
    }
    if ( bBefore ) {
      bBeforeEdge = Edge.createFromPool( bBefore, bEdge.startVertex, overlap.a > 0 ? beforeVertex : afterVertex );
      this.addEdge( bBeforeEdge );
    }
    if ( bAfter ) {
      bAfterEdge = Edge.createFromPool( bAfter, overlap.a > 0 ? afterVertex : beforeVertex, bEdge.endVertex );
      this.addEdge( bAfterEdge );
    }

    // Collect "replacement" edges
    const aEdges = ( aBefore ? [ aBeforeEdge ] : [] ).concat( [ middleEdge ] ).concat( aAfter ? [ aAfterEdge ] : [] );
    const bEdges = ( bBefore ? [ bBeforeEdge ] : [] ).concat( [ middleEdge ] ).concat( bAfter ? [ bAfterEdge ] : [] );

    const aForwardHalfEdges = [];
    const bForwardHalfEdges = [];

    for ( let i = 0; i < aEdges.length; i++ ) {
      aForwardHalfEdges.push( aEdges[ i ].forwardHalf );
    }
    for ( let i = 0; i < bEdges.length; i++ ) {
      // Handle reversing the "middle" edge
      const isForward = bEdges[ i ] !== middleEdge || overlap.a > 0;
      bForwardHalfEdges.push( isForward ? bEdges[ i ].forwardHalf : bEdges[ i ].reversedHalf );
    }

    // Replace edges in the loops
    this.replaceEdgeInLoops( aEdge, aForwardHalfEdges );
    this.replaceEdgeInLoops( bEdge, bForwardHalfEdges );

    aEdge.dispose();
    bEdge.dispose();
  }

  /**
   * Handles splitting of self-intersection of segments (happens with Cubics).
   * @private
   */
  eliminateSelfIntersection() {
    assert && assert( this.boundaries.length === 0, 'Only handles simpler level primitive splitting right now' );

    for ( let i = this.edges.length - 1; i >= 0; i-- ) {
      const edge = this.edges[ i ];
      const segment = edge.segment;

      if ( segment instanceof Cubic ) {
        // TODO: This might not properly handle when it only one endpoint is on the curve
        const selfIntersection = segment.getSelfIntersection();

        if ( selfIntersection ) {
          assert && assert( selfIntersection.aT < selfIntersection.bT );

          const segments = segment.subdivisions( [ selfIntersection.aT, selfIntersection.bT ] );

          const vertex = Vertex.createFromPool( selfIntersection.point );
          this.vertices.push( vertex );

          const startEdge = Edge.createFromPool( segments[ 0 ], edge.startVertex, vertex );
          const middleEdge = Edge.createFromPool( segments[ 1 ], vertex, vertex );
          const endEdge = Edge.createFromPool( segments[ 2 ], vertex, edge.endVertex );

          this.removeEdge( edge );

          this.addEdge( startEdge );
          this.addEdge( middleEdge );
          this.addEdge( endEdge );

          this.replaceEdgeInLoops( edge, [ startEdge.forwardHalf, middleEdge.forwardHalf, endEdge.forwardHalf ] );

          edge.dispose();
        }
      }
    }
  }

  /**
   * Replace intersections between different segments by splitting them and creating a vertex.
   * @private
   */
  eliminateIntersection() {
    let needsLoop = true;
    while ( needsLoop ) {
      needsLoop = false;

      intersect: // eslint-disable-line no-labels
        for ( let i = 0; i < this.edges.length; i++ ) {
          const aEdge = this.edges[ i ];
          const aSegment = aEdge.segment;
          for ( let j = i + 1; j < this.edges.length; j++ ) {
            const bEdge = this.edges[ j ];
            const bSegment = bEdge.segment;

            let intersections = Segment.intersect( aSegment, bSegment );
            intersections = intersections.filter( intersection => {
              const aT = intersection.aT;
              const bT = intersection.bT;
              const aInternal = aT > 1e-5 && aT < ( 1 - 1e-5 );
              const bInternal = bT > 1e-5 && bT < ( 1 - 1e-5 );
              return aInternal || bInternal;
            } );
            if ( intersections.length ) {

              // TODO: In the future, handle multiple intersections (instead of re-running)
              const intersection = intersections[ 0 ];

              needsLoop = this.simpleSplit( aEdge, bEdge, intersection.aT, intersection.bT, intersection.point );
              break intersect; // eslint-disable-line no-labels
            }
          }
        }
    }
  }

  /**
   * Handles splitting two intersecting edges.
   * @private
   *
   * @param {Edge} aEdge
   * @param {Edge} bEdge
   * @param {number} aT - Parametric t value of the intersection for aEdge
   * @param {number} bT - Parametric t value of the intersection for bEdge
   * @param {Vector2} point - Location of the intersection
   *
   * @returns {boolean} - true if something was split.
   */
  simpleSplit( aEdge, bEdge, aT, bT, point ) {
    let changed = false;

    const aInternal = aT > 1e-6 && aT < ( 1 - 1e-6 );
    const bInternal = bT > 1e-6 && bT < ( 1 - 1e-6 );

    let vertex = null;
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

    if ( aInternal && vertex !== aEdge.startVertex && vertex !== aEdge.endVertex ) {
      this.splitEdge( aEdge, aT, vertex );
      changed = true;
    }
    if ( bInternal && vertex !== bEdge.startVertex && vertex !== bEdge.endVertex ) {
      this.splitEdge( bEdge, bT, vertex );
      changed = true;
    }

    return changed;
  }

  /**
   * Splits an edge into two edges at a specific parametric t value.
   * @private
   *
   * @param {Edge} edge
   * @param {number} t
   * @param {Vertex} vertex - The vertex that is placed at the split location
   */
  splitEdge( edge, t, vertex ) {
    assert && assert( this.boundaries.length === 0, 'Only handles simpler level primitive splitting right now' );
    assert && assert( edge.startVertex !== vertex );
    assert && assert( edge.endVertex !== vertex );

    const segments = edge.segment.subdivided( t );
    assert && assert( segments.length === 2 );

    const firstEdge = Edge.createFromPool( segments[ 0 ], edge.startVertex, vertex );
    const secondEdge = Edge.createFromPool( segments[ 1 ], vertex, edge.endVertex );

    // Remove old connections
    this.removeEdge( edge );

    // Add new connections
    this.addEdge( firstEdge );
    this.addEdge( secondEdge );

    this.replaceEdgeInLoops( edge, [ firstEdge.forwardHalf, secondEdge.forwardHalf ] );

    edge.dispose();
  }

  /**
   * Combine vertices that are almost exactly in the same place (removing edges and vertices where necessary).
   * @private
   */
  collapseVertices() {
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.startVertex ) ) );
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.endVertex ) ) );

    let needsLoop = true;
    while ( needsLoop ) {
      needsLoop = false;
      nextLoop: // eslint-disable-line no-labels
        for ( let i = 0; i < this.vertices.length; i++ ) {
          const aVertex = this.vertices[ i ];
          for ( let j = i + 1; j < this.vertices.length; j++ ) {
            const bVertex = this.vertices[ j ];

            const distance = aVertex.point.distance( bVertex.point );
            if ( distance < 1e-5 ) {
              const newVertex = Vertex.createFromPool( distance === 0 ? aVertex.point : aVertex.point.average( bVertex.point ) );
              this.vertices.push( newVertex );

              arrayRemove( this.vertices, aVertex );
              arrayRemove( this.vertices, bVertex );
              for ( let k = this.edges.length - 1; k >= 0; k-- ) {
                const edge = this.edges[ k ];
                const startMatches = edge.startVertex === aVertex || edge.startVertex === bVertex;
                const endMatches = edge.endVertex === aVertex || edge.endVertex === bVertex;

                // Outright remove edges that were between A and B that aren't loops
                if ( startMatches && endMatches ) {
                  if ( ( edge.segment.bounds.width > 1e-5 || edge.segment.bounds.height > 1e-5 ) &&
                       ( edge.segment instanceof Cubic || edge.segment instanceof Arc || edge.segment instanceof EllipticalArc ) ) {
                    // Replace it with a new edge that is from the vertex to itself
                    const replacementEdge = Edge.createFromPool( edge.segment, newVertex, newVertex );
                    this.addEdge( replacementEdge );
                    this.replaceEdgeInLoops( edge, [ replacementEdge.forwardHalf ] );
                  }
                  else {
                    this.replaceEdgeInLoops( edge, [] ); // remove the edge from loops with no replacement
                  }
                  this.removeEdge( edge );
                  edge.dispose();
                }
                else if ( startMatches ) {
                  edge.startVertex = newVertex;
                  newVertex.incidentHalfEdges.push( edge.reversedHalf );
                  edge.updateReferences();
                }
                else if ( endMatches ) {
                  edge.endVertex = newVertex;
                  newVertex.incidentHalfEdges.push( edge.forwardHalf );
                  edge.updateReferences();
                }
              }

              aVertex.dispose();
              bVertex.dispose();

              needsLoop = true;
              break nextLoop; // eslint-disable-line no-labels
            }
          }
        }
    }

    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.startVertex ) ) );
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.endVertex ) ) );
  }

  /**
   * Scan a given vertex for bridges recursively with a depth-first search.
   * @private
   *
   * Records visit times to each vertex, and back-propagates so that we can efficiently determine if there was another
   * path around to the vertex.
   *
   * Assumes this is only called one time once all edges/vertices are set up. Repeated calls will fail because we
   * don't mark visited/etc. references again on startup
   *
   * See Tarjan's algorithm for more information. Some modifications were needed, since this is technically a
   * multigraph/pseudograph (can have edges that have the same start/end vertex, and can have multiple edges
   * going from the same two vertices).
   *
   * @param {Array.<Edge>} bridges - Appends bridge edges to here.
   * @param {Vertex} vertex
   */
  markBridges( bridges, vertex ) {
    vertex.visited = true;
    vertex.visitIndex = vertex.lowIndex = bridgeId++;

    for ( let i = 0; i < vertex.incidentHalfEdges.length; i++ ) {
      const edge = vertex.incidentHalfEdges[ i ].edge;
      const childVertex = vertex.incidentHalfEdges[ i ].startVertex; // by definition, our vertex should be the endVertex
      if ( !childVertex.visited ) {
        edge.visited = true;
        childVertex.parent = vertex;
        this.markBridges( bridges, childVertex );

        // Check if there's another route that reaches back to our vertex from an ancestor
        vertex.lowIndex = Math.min( vertex.lowIndex, childVertex.lowIndex );

        // If there was no route, then we reached a bridge
        if ( childVertex.lowIndex > vertex.visitIndex ) {
          bridges.push( edge );
        }
      }
      else if ( !edge.visited ) {
        vertex.lowIndex = Math.min( vertex.lowIndex, childVertex.visitIndex );
      }
    }
  }

  /**
   * Removes edges that are the only edge holding two connected components together. Based on our problem, the
   * face on either side of the "bridge" edges would always be the same, so we can safely remove them.
   * @private
   */
  removeBridges() {
    const bridges = [];

    for ( let i = 0; i < this.vertices.length; i++ ) {
      const vertex = this.vertices[ i ];
      if ( !vertex.visited ) {
        this.markBridges( bridges, vertex );
      }
    }

    for ( let i = 0; i < bridges.length; i++ ) {
      const bridgeEdge = bridges[ i ];

      this.removeEdge( bridgeEdge );
      this.replaceEdgeInLoops( bridgeEdge, [] );
      bridgeEdge.dispose();
    }
  }

  /**
   * Removes vertices that have order less than 2 (so either a vertex with one or zero edges adjacent).
   * @private
   */
  removeLowOrderVertices() {
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.startVertex ) ) );
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.endVertex ) ) );

    let needsLoop = true;
    while ( needsLoop ) {
      needsLoop = false;

      for ( let i = this.vertices.length - 1; i >= 0; i-- ) {
        const vertex = this.vertices[ i ];

        if ( vertex.incidentHalfEdges.length < 2 ) {
          // Disconnect any existing edges
          for ( let j = 0; j < vertex.incidentHalfEdges.length; j++ ) {
            const edge = vertex.incidentHalfEdges[ j ].edge;
            this.removeEdge( edge );
            this.replaceEdgeInLoops( edge, [] ); // remove the edge from the loops
            edge.dispose();
          }

          // Remove the vertex
          this.vertices.splice( i, 1 );
          vertex.dispose();

          needsLoop = true;
          break;
        }
      }
    }
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.startVertex ) ) );
    assert && assert( _.every( this.edges, edge => _.includes( this.vertices, edge.endVertex ) ) );
  }

  /**
   * Sorts incident half-edges for each vertex.
   * @private
   */
  orderVertexEdges() {
    for ( let i = 0; i < this.vertices.length; i++ ) {
      this.vertices[ i ].sortEdges();
    }
  }

  /**
   * Creates boundaries and faces by following each half-edge counter-clockwise
   * @private
   */
  extractFaces() {
    const halfEdges = [];
    for ( let i = 0; i < this.edges.length; i++ ) {
      halfEdges.push( this.edges[ i ].forwardHalf );
      halfEdges.push( this.edges[ i ].reversedHalf );
    }

    while ( halfEdges.length ) {
      const boundaryHalfEdges = [];
      let halfEdge = halfEdges[ 0 ];
      const startingHalfEdge = halfEdge;
      while ( halfEdge ) {
        arrayRemove( halfEdges, halfEdge );
        boundaryHalfEdges.push( halfEdge );
        halfEdge = halfEdge.getNext();
        if ( halfEdge === startingHalfEdge ) {
          break;
        }
      }
      const boundary = Boundary.createFromPool( boundaryHalfEdges );
      ( boundary.signedArea > 0 ? this.innerBoundaries : this.outerBoundaries ).push( boundary );
      this.boundaries.push( boundary );
    }

    for ( let i = 0; i < this.innerBoundaries.length; i++ ) {
      this.faces.push( Face.createFromPool( this.innerBoundaries[ i ] ) );
    }
  }

  /**
   * Given the inner and outer boundaries, it compues a tree representation to determine what boundaries are
   * holes of what other boundaries, then sets up face holes with the result.
   * @public
   *
   * This information is stored in the childBoundaries array of Boundary, and is then read out to set up faces.
   */
  computeBoundaryTree() {
    // TODO: detect "indeterminate" for robustness (and try new angles?)
    const unboundedHoles = []; // {Array.<Boundary>}

    // We'll want to compute a ray for each outer boundary that starts at an extreme point for that direction and
    // continues outwards. The next boundary it intersects will be linked together in the tree.
    // We have a mostly-arbitrary angle here that hopefully won't be used.
    const transform = new Transform3( Matrix3.rotation2( 1.5729657 ) );

    for ( let i = 0; i < this.outerBoundaries.length; i++ ) {
      const outerBoundary = this.outerBoundaries[ i ];

      const ray = outerBoundary.computeExtremeRay( transform );

      let closestEdge = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      let closestWind = false;

      for ( let j = 0; j < this.edges.length; j++ ) {
        const edge = this.edges[ j ];

        const intersections = edge.segment.intersection( ray );
        for ( let k = 0; k < intersections.length; k++ ) {
          const intersection = intersections[ k ];

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
        const reversed = closestWind < 0;
        const closestHalfEdge = reversed ? closestEdge.reversedHalf : closestEdge.forwardHalf;
        const closestBoundary = this.getBoundaryOfHalfEdge( closestHalfEdge );
        closestBoundary.childBoundaries.push( outerBoundary );
      }
    }

    unboundedHoles.forEach( this.unboundedFace.recursivelyAddHoles.bind( this.unboundedFace ) );
    for ( let i = 0; i < this.faces.length; i++ ) {
      const face = this.faces[ i ];
      if ( face.boundary !== null ) {
        face.boundary.childBoundaries.forEach( face.recursivelyAddHoles.bind( face ) );
      }
    }
  }

  /**
   * Computes the winding map for each face, starting with 0 on the unbounded face (for each shapeId).
   * @private
   */
  computeWindingMap() {
    const edges = this.edges.slice();

    // Winding numbers for "outside" are 0.
    const outsideMap = {};
    for ( let i = 0; i < this.shapeIds.length; i++ ) {
      outsideMap[ this.shapeIds[ i ] ] = 0;
    }
    this.unboundedFace.windingMap = outsideMap;

    // We have "solved" the unbounded face, and then iteratively go over the edges looking for a case where we have
    // solved one of the faces that is adjacent to that edge. We can then compute the difference between winding
    // numbers between the two faces, and thus determine the (absolute) winding numbers for the unsolved face.
    while ( edges.length ) {
      for ( let j = edges.length - 1; j >= 0; j-- ) {
        const edge = edges[ j ];

        const forwardHalf = edge.forwardHalf;
        const reversedHalf = edge.reversedHalf;

        const forwardFace = forwardHalf.face;
        const reversedFace = reversedHalf.face;
        assert && assert( forwardFace !== reversedFace );

        const solvedForward = forwardFace.windingMap !== null;
        const solvedReversed = reversedFace.windingMap !== null;

        if ( solvedForward && solvedReversed ) {
          edges.splice( j, 1 );

          if ( assert ) {
            for ( let m = 0; m < this.shapeIds.length; m++ ) {
              const id = this.shapeIds[ m ];
              assert( forwardFace.windingMap[ id ] - reversedFace.windingMap[ id ] === this.computeDifferential( edge, id ) );
            }
          }
        }
        else if ( !solvedForward && !solvedReversed ) {
          continue;
        }
        else {
          const solvedFace = solvedForward ? forwardFace : reversedFace;
          const unsolvedFace = solvedForward ? reversedFace : forwardFace;

          const windingMap = {};
          for ( let k = 0; k < this.shapeIds.length; k++ ) {
            const shapeId = this.shapeIds[ k ];
            const differential = this.computeDifferential( edge, shapeId );
            windingMap[ shapeId ] = solvedFace.windingMap[ shapeId ] + differential * ( solvedForward ? -1 : 1 );
          }
          unsolvedFace.windingMap = windingMap;
        }
      }
    }
  }

  /**
   * Computes the differential in winding numbers (forward face winding number minus the reversed face winding number)
   * ("forward face" is the face on the forward half-edge side, etc.)
   * @private
   *
   * @param {Edge} edge
   * @param {number} shapeId
   * @returns {number} - The difference between forward face and reversed face winding numbers.
   */
  computeDifferential( edge, shapeId ) {
    let differential = 0; // forward face - reversed face
    for ( let m = 0; m < this.loops.length; m++ ) {
      const loop = this.loops[ m ];
      assert && assert( loop.closed, 'This is only defined to work for closed loops' );
      if ( loop.shapeId !== shapeId ) {
        continue;
      }

      for ( let n = 0; n < loop.halfEdges.length; n++ ) {
        const loopHalfEdge = loop.halfEdges[ n ];
        if ( loopHalfEdge === edge.forwardHalf ) {
          differential++;
        }
        else if ( loopHalfEdge === edge.reversedHalf ) {
          differential--;
        }
      }
    }
    return differential;
  }

  /**
   * Sets the unbounded face as unfilled, and then sets each face's fill so that edges separate one filled face with
   * one unfilled face.
   * @private
   *
   * NOTE: Best to call this on the result from createFilledSubGraph(), since it should have guaranteed properties
   *       to make this consistent. Notably, all vertices need to have an even order (number of edges)
   */
  fillAlternatingFaces() {
    let nullFaceFilledCount = 0;
    for ( let i = 0; i < this.faces.length; i++ ) {
      this.faces[ i ].filled = null;
      nullFaceFilledCount++;
    }

    this.unboundedFace.filled = false;
    nullFaceFilledCount--;

    while ( nullFaceFilledCount ) {
      for ( let i = 0; i < this.edges.length; i++ ) {
        const edge = this.edges[ i ];
        const forwardFace = edge.forwardHalf.face;
        const reversedFace = edge.reversedHalf.face;

        const forwardNull = forwardFace.filled === null;
        const reversedNull = reversedFace.filled === null;

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
  }

  /**
   * Returns the boundary that contains the specified half-edge.
   * @private
   *
   * TODO: find a better way, this is crazy inefficient
   *
   * @param {HalfEdge} halfEdge
   * @returns {Boundary}
   */
  getBoundaryOfHalfEdge( halfEdge ) {
    for ( let i = 0; i < this.boundaries.length; i++ ) {
      const boundary = this.boundaries[ i ];

      if ( boundary.hasHalfEdge( halfEdge ) ) {
        return boundary;
      }
    }

    throw new Error( 'Could not find boundary' );
  }

  /**
   * "Union" binary winding map filter for use with Graph.binaryResult.
   * @public
   *
   * This combines both shapes together so that a point is in the resulting shape if it was in either of the input
   * shapes.
   *
   * @param {Object} windingMap - See computeFaceInclusion for more details
   * @returns {boolean}
   */
  static BINARY_NONZERO_UNION( windingMap ) {
    return windingMap[ '0' ] !== 0 || windingMap[ '1' ] !== 0;
  }

  /**
   * "Intersection" binary winding map filter for use with Graph.binaryResult.
   * @public
   *
   * This combines both shapes together so that a point is in the resulting shape if it was in both of the input
   * shapes.
   *
   * @param {Object} windingMap - See computeFaceInclusion for more details
   * @returns {boolean}
   */
  static BINARY_NONZERO_INTERSECTION( windingMap ) {
    return windingMap[ '0' ] !== 0 && windingMap[ '1' ] !== 0;
  }

  /**
   * "Difference" binary winding map filter for use with Graph.binaryResult.
   * @public
   *
   * This combines both shapes together so that a point is in the resulting shape if it was in the first shape AND
   * was NOT in the second shape.
   *
   * @param {Object} windingMap - See computeFaceInclusion for more details
   * @returns {boolean}
   */
  static BINARY_NONZERO_DIFFERENCE( windingMap ) {
    return windingMap[ '0' ] !== 0 && windingMap[ '1' ] === 0;
  }

  /**
   * "XOR" binary winding map filter for use with Graph.binaryResult.
   * @public
   *
   * This combines both shapes together so that a point is in the resulting shape if it is only in exactly one of the
   * input shapes. It's like the union minus intersection.
   *
   * @param {Object} windingMap - See computeFaceInclusion for more details
   * @returns {boolean}
   */
  static BINARY_NONZERO_XOR( windingMap ) {
    return ( ( windingMap[ '0' ] !== 0 ) ^ ( windingMap[ '1' ] !== 0 ) ) === 1; // eslint-disable-line no-bitwise
  }

  /**
   * Returns the resulting Shape obtained by combining the two shapes given with the filter.
   * @public
   *
   * @param {Shape} shapeA
   * @param {Shape} shapeB
   * @param {function} windingMapFilter - See computeFaceInclusion for details on the format
   * @returns {Shape}
   */
  static binaryResult( shapeA, shapeB, windingMapFilter ) {
    const graph = new Graph();
    graph.addShape( 0, shapeA );
    graph.addShape( 1, shapeB );

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( windingMapFilter );
    const subgraph = graph.createFilledSubGraph();
    const shape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return shape;
  }

  /**
   * Returns the union of an array of shapes.
   * @public
   *
   * @param {Array.<Shape>} shapes
   * @returns {Shape}
   */
  static unionNonZero( shapes ) {
    const graph = new Graph();
    for ( let i = 0; i < shapes.length; i++ ) {
      graph.addShape( i, shapes[ i ] );
    }

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( windingMap => {
      for ( let j = 0; j < shapes.length; j++ ) {
        if ( windingMap[ j ] !== 0 ) {
          return true;
        }
      }
      return false;
    } );
    const subgraph = graph.createFilledSubGraph();
    const shape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return shape;
  }

  /**
   * Returns the intersection of an array of shapes.
   * @public
   *
   * @param {Array.<Shape>} shapes
   * @returns {Shape}
   */
  static intersectionNonZero( shapes ) {
    const graph = new Graph();
    for ( let i = 0; i < shapes.length; i++ ) {
      graph.addShape( i, shapes[ i ] );
    }

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( windingMap => {
      for ( let j = 0; j < shapes.length; j++ ) {
        if ( windingMap[ j ] === 0 ) {
          return false;
        }
      }
      return true;
    } );
    const subgraph = graph.createFilledSubGraph();
    const shape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return shape;
  }

  /**
   * Returns the xor of an array of shapes.
   * @public
   *
   * TODO: reduce code duplication?
   *
   * @param {Array.<Shape>} shapes
   * @returns {Shape}
   */
  static xorNonZero( shapes ) {
    const graph = new Graph();
    for ( let i = 0; i < shapes.length; i++ ) {
      graph.addShape( i, shapes[ i ] );
    }

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( windingMap => {
      let included = false;
      for ( let j = 0; j < shapes.length; j++ ) {
        if ( windingMap[ j ] !== 0 ) {
          included = !included;
        }
      }
      return included;
    } );
    const subgraph = graph.createFilledSubGraph();
    const shape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return shape;
  }

  /**
   * Returns a simplified Shape obtained from running it through the simplification steps with non-zero output.
   * @public
   *
   * @param {Shape} shape
   * @returns {Shape}
   */
  static simplifyNonZero( shape ) {
    const graph = new Graph();
    graph.addShape( 0, shape );

    graph.computeSimplifiedFaces();
    graph.computeFaceInclusion( map => map[ '0' ] !== 0 );
    const subgraph = graph.createFilledSubGraph();
    const resultShape = subgraph.facesToShape();

    graph.dispose();
    subgraph.dispose();

    return resultShape;
  }

  /**
   * Returns a clipped version of `shape` that contains only the parts that are within the area defined by
   * `clipAreaShape`
   * @public
   *
   * @param {Shape} clipAreaShape
   * @param {Shape} shape
   * @param {Object} [options]
   * @returns {Shape}
   */
  static clipShape( clipAreaShape, shape, options ) {
    let i;
    let j;
    let loop;

    const SHAPE_ID = 0;
    const CLIP_SHAPE_ID = 1;

    options = merge( {
      // {boolean} - Respectively whether segments should be in the returned shape if they are in the exterior of the
      // clipAreaShape (outside), on the boundary, or in the interior.
      includeExterior: false,
      includeBoundary: true,
      includeInterior: true
    }, options );

    const simplifiedClipAreaShape = Graph.simplifyNonZero( clipAreaShape );

    const graph = new Graph();
    graph.addShape( SHAPE_ID, shape, {
      ensureClosed: false // don't add closing segments, since we'll be recreating subpaths/etc.
    } );
    graph.addShape( CLIP_SHAPE_ID, simplifiedClipAreaShape );

    // A subset of simplifications (we want to keep low-order vertices, etc.)
    graph.eliminateOverlap();
    graph.eliminateSelfIntersection();
    graph.eliminateIntersection();
    graph.collapseVertices();

    // Mark clip edges with data=true
    for ( i = 0; i < graph.loops.length; i++ ) {
      loop = graph.loops[ i ];
      if ( loop.shapeId === CLIP_SHAPE_ID ) {
        for ( j = 0; j < loop.halfEdges.length; j++ ) {
          loop.halfEdges[ j ].edge.data = true;
        }
      }
    }

    const subpaths = [];
    for ( i = 0; i < graph.loops.length; i++ ) {
      loop = graph.loops[ i ];
      if ( loop.shapeId === SHAPE_ID ) {
        let segments = [];
        for ( j = 0; j < loop.halfEdges.length; j++ ) {
          const halfEdge = loop.halfEdges[ j ];

          const included = halfEdge.edge.data ? options.includeBoundary : (
            simplifiedClipAreaShape.containsPoint( halfEdge.edge.segment.positionAt( 0.5 ) ) ? options.includeInterior : options.includeExterior
          );
          if ( included ) {
            segments.push( halfEdge.getDirectionalSegment() );
          }
            // If we have an excluded segment in-between included segments, we'll need to split into more subpaths to handle
          // the gap.
          else if ( segments.length ) {
            subpaths.push( new Subpath( segments, undefined, loop.closed ) );
            segments = [];
          }
        }
        if ( segments.length ) {
          subpaths.push( new Subpath( segments, undefined, loop.closed ) );
        }
      }
    }

    graph.dispose();

    return new kite.Shape( subpaths );
  }
}

kite.register( 'Graph', Graph );

export default Graph;