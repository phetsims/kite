// Copyright 2022, University of Colorado Boulder

/**
 * A SegmentTree for Edges. See SegmentTree for more details
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import { kite, Edge, SegmentTree } from '../imports.js';

class EdgeSegmentTree extends SegmentTree<Edge> {
  getMinX( edge: Edge, epsilon: number ): number {
    // @ts-ignore -- TODO: Get Segment typed correctly
    return edge.segment!.bounds.left - epsilon;
  }

  getMaxX( edge: Edge, epsilon: number ): number {
    // @ts-ignore -- TODO: Get Segment typed correctly
    return edge.segment!.bounds.right + epsilon;
  }
}

kite.register( 'EdgeSegmentTree', EdgeSegmentTree );

export default EdgeSegmentTree;
