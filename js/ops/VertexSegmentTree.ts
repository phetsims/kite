// Copyright 2022, University of Colorado Boulder

/**
 * A SegmentTree for Vertices. See SegmentTree for more details
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import { kite, Vertex, SegmentTree } from '../imports.js';

class VertexSegmentTree extends SegmentTree<Vertex> {
  getMinX( vertex: Vertex, epsilon: number ): number {
    return vertex.point!.x - epsilon;
  }

  getMaxX( vertex: Vertex, epsilon: number ): number {
    return vertex.point!.x + epsilon;
  }
}

kite.register( 'VertexSegmentTree', VertexSegmentTree );

export default VertexSegmentTree;
