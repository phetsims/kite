// Copyright 2022, University of Colorado Boulder

/**
 * A SegmentTree for Vertices. See SegmentTree for more details
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import { kite, SegmentTree, Vertex } from '../imports.js';

export default class VertexSegmentTree extends SegmentTree<Vertex> {
  public getMinX( vertex: Vertex, epsilon: number ): number {
    return vertex.point!.x - epsilon;
  }

  public getMaxX( vertex: Vertex, epsilon: number ): number {
    return vertex.point!.x + epsilon;
  }
}

kite.register( 'VertexSegmentTree', VertexSegmentTree );
