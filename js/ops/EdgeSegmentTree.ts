// Copyright 2022-2025, University of Colorado Boulder

/**
 * A SegmentTree for Edges. See SegmentTree for more details
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import SegmentTree from './SegmentTree.js';
import Edge from './Edge.js';
import kite from '../kite.js';

export default class EdgeSegmentTree extends SegmentTree<Edge> {
  public getMinX( edge: Edge, epsilon: number ): number {
    return edge.segment.bounds.left - epsilon;
  }

  public getMaxX( edge: Edge, epsilon: number ): number {
    return edge.segment.bounds.right + epsilon;
  }
}

kite.register( 'EdgeSegmentTree', EdgeSegmentTree );