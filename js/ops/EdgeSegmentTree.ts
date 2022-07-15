// Copyright 2022, University of Colorado Boulder

/**
 * A SegmentTree for Edges. See SegmentTree for more details
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import { kite, Edge, SegmentTree } from '../imports.js';

export default class EdgeSegmentTree extends SegmentTree<Edge> {
  public getMinX( edge: Edge, epsilon: number ): number {
    // @ts-ignore -- TODO: Get Segment typed correctly
    return edge.segment!.bounds.left - epsilon;
  }

  public getMaxX( edge: Edge, epsilon: number ): number {
    // @ts-ignore -- TODO: Get Segment typed correctly
    return edge.segment!.bounds.right + epsilon;
  }
}

kite.register( 'EdgeSegmentTree', EdgeSegmentTree );
