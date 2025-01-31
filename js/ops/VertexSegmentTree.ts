// Copyright 2022-2025, University of Colorado Boulder

/**
 * A SegmentTree for Vertices. See SegmentTree for more details
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import kite from '../kite.js';
import SegmentTree from './SegmentTree.js';
import Vertex from './Vertex.js';

export default class VertexSegmentTree extends SegmentTree<Vertex> {
  public getMinX( vertex: Vertex, epsilon: number ): number {
    return vertex.point.x - epsilon;
  }

  public getMaxX( vertex: Vertex, epsilon: number ): number {
    return vertex.point.x + epsilon;
  }
}

kite.register( 'VertexSegmentTree', VertexSegmentTree );