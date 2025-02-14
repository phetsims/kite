// Copyright 2013-2025, University of Colorado Boulder

/**
 * A segment represents a specific curve with a start and end.
 *
 * Each segment is treated parametrically, where t=0 is the start of the segment, and t=1 is the end. Values of t
 * between those represent points along the segment.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

/* global paper */
import TEmitter from '../../../axon/js/TEmitter.js';
import TinyEmitter from '../../../axon/js/TinyEmitter.js';
import Bounds2 from '../../../dot/js/Bounds2.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import Ray2 from '../../../dot/js/Ray2.js';
import Vector2 from '../../../dot/js/Vector2.js';
import optionize from '../../../phet-core/js/optionize.js';
import IntentionalAny from '../../../phet-core/js/types/IntentionalAny.js';
import KeysMatching from '../../../phet-core/js/types/KeysMatching.js';
import RayIntersection from '../util/RayIntersection.js';
import SegmentIntersection from '../util/SegmentIntersection.js';
import BoundsIntersection from '../ops/BoundsIntersection.js';
import kite from '../kite.js';
import Overlap from '../util/Overlap.js';
import svgNumber from '../util/svgNumber.js';
import Transform3 from '../../../dot/js/Transform3.js';
import Enumeration from '../../../phet-core/js/Enumeration.js';
import EnumerationValue from '../../../phet-core/js/EnumerationValue.js';
import { arePointsCollinear } from '../../../dot/js/util/arePointsCollinear.js';
import { linear } from '../../../dot/js/util/linear.js';
import { distToSegmentSquared } from '../../../dot/js/util/distToSegmentSquared.js';
import { clamp } from '../../../dot/js/util/clamp.js';
import { lineSegmentIntersection } from '../../../dot/js/util/lineSegmentIntersection.js';
import { solveLinearRootsReal } from '../../../dot/js/util/solveLinearRootsReal.js';
import { solveQuadraticRootsReal } from '../../../dot/js/util/solveQuadraticRootsReal.js';
import { moduloBetweenDown } from '../../../dot/js/util/moduloBetweenDown.js';
import { moduloBetweenUp } from '../../../dot/js/util/moduloBetweenUp.js';
import { circleCenterFromPoints } from '../../../dot/js/util/circleCenterFromPoints.js';
import { toDegrees } from '../../../dot/js/util/toDegrees.js';
import { solveCubicRootsReal } from '../../../dot/js/util/solveCubicRootsReal.js';

// convenience variables use to reduce the number of vector allocations
const scratchVector1 = new Vector2( 0, 0 );
const scratchVector2 = new Vector2( 0, 0 );
const scratchVector3 = new Vector2( 0, 0 );

// Used in multiple filters
function isBetween0And1( t: number ): boolean {
  return t >= 0 && t <= 1;
}

export type DashValues = {

  // Parametric (t) values for where dash boundaries exist
  values: number[];

  // Total arc length for this segment
  arcLength: number;

  // Whether the start of the segment is inside a dash (instead of a gap)
  initiallyInside: boolean;
};

export type SerializedSegment = SerializedArc | SerializedCubic | SerializedEllipticalArc | SerializedLine | SerializedQuadratic;

type SimpleOverlap = {
  a: number;
  b: number;
};

// null if no solution, true if every a,b pair is a solution, otherwise the single solution
type PossibleSimpleOverlap = SimpleOverlap | null | true;

export type ClosestToPointResult = {
  segment: Segment;
  t: number;
  closestPoint: Vector2;
  distanceSquared: number;
};

export type PiecewiseLinearOptions = {
  // how many levels to force subdivisions
  minLevels?: number;

  // prevent subdivision past this level
  maxLevels?: number;

  // controls level of subdivision by attempting to ensure a maximum (squared) deviation from the curve
  distanceEpsilon?: number | null;

  // controls level of subdivision by attempting to ensure a maximum curvature change between segments
  curveEpsilon?: number | null;

  // represents a (usually non-linear) transformation applied
  pointMap?: ( v: Vector2 ) => Vector2;

  // if the method name is found on the segment, it is called with the expected signature
  // function( options ) : Array[Segment] instead of using our brute-force logic
  methodName?: KeysMatching<Segment, ( options: PiecewiseLinearOptions ) => Segment[]> |
               KeysMatching<Arc, ( options: PiecewiseLinearOptions ) => Segment[]> |
               KeysMatching<Cubic, ( options: PiecewiseLinearOptions ) => Segment[]> |
               KeysMatching<EllipticalArc, ( options: PiecewiseLinearOptions ) => Segment[]> |
               KeysMatching<Line, ( options: PiecewiseLinearOptions ) => Segment[]> |
               KeysMatching<Quadratic, ( options: PiecewiseLinearOptions ) => Segment[]>;
};

type PiecewiseLinearOrArcRecursionOptions = {
  curvatureThreshold: number;
  errorThreshold: number;
  errorPoints: [number, number];
};

type PiecewiseLinearOrArcOptions = {
  minLevels?: number;
  maxLevels?: number;
} & Partial<PiecewiseLinearOrArcRecursionOptions>;

export default abstract class Segment {

  public invalidationEmitter: TEmitter;

  protected constructor() {
    this.invalidationEmitter = new TinyEmitter();
  }

  // The start point of the segment, parametrically at t=0.
  public abstract get start(): Vector2;

  // The end point of the segment, parametrically at t=1.
  public abstract get end(): Vector2;

  // The normalized tangent vector to the segment at its start point, pointing in the direction of motion (from start to
  // end).
  public abstract get startTangent(): Vector2;

  // The normalized tangent vector to the segment at its end point, pointing in the direction of motion (from start to
  // end).
  public abstract get endTangent(): Vector2;

  // The bounding box for the segment.
  public abstract get bounds(): Bounds2;

  // Returns the position parametrically, with 0 <= t <= 1. NOTE that this function doesn't keep a constant magnitude
  // tangent.
  public abstract positionAt( t: number ): Vector2;

  // Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
  public abstract tangentAt( t: number ): Vector2;

  // Returns the signed curvature (positive for visual clockwise - mathematical counterclockwise)
  public abstract curvatureAt( t: number ): number;

  // Returns an array with up to 2 sub-segments, split at the parametric t value. The segments together should make the
  // same shape as the original segment.
  public abstract subdivided( t: number ): Segment[];

  // Returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls
  // this needs to put the M calls first
  public abstract getSVGPathFragment(): string;

  // Returns an array of segments that will draw an offset curve on the logical left side
  public abstract strokeLeft( lineWidth: number ): Segment[];

  // Returns an array of segments that will draw an offset curve on the logical right side
  public abstract strokeRight( lineWidth: number ): Segment[];

  // Returns the winding number for intersection with a ray
  public abstract windingIntersection( ray: Ray2 ): number;

  // Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic
  // segments
  public abstract getInteriorExtremaTs(): number[];

  // Returns a list of intersections between the segment and the ray.
  public abstract intersection( ray: Ray2 ): RayIntersection[];

  // Returns a {Bounds2} representing the bounding box for the segment.
  public abstract getBounds(): Bounds2;

  // Returns signed area contribution for this segment using Green's Theorem
  public abstract getSignedAreaFragment(): number;

  // Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
  // invalid or repeated segments.
  public abstract getNondegenerateSegments(): Segment[];

  public abstract getOverlaps( segment: Segment, epsilon?: number ): Overlap[] | null;

  // Draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
  public abstract writeToContext( context: CanvasRenderingContext2D ): void;

  // Returns a new segment that represents this segment after transformation by the matrix
  public abstract transformed( matrix: Matrix3 ): Segment;

  public abstract reversed(): Segment;

  public abstract invalidate(): void;

  public abstract serialize(): SerializedSegment;

  /**
   * Will return true if the start/end tangents are purely vertical or horizontal. If all of the segments of a shape
   * have this property, then the only line joins will be a multiple of pi/2 (90 degrees), and so all of the types of
   * line joins will have the same bounds. This means that the stroked bounds will just be a pure dilation of the
   * regular bounds, by lineWidth / 2.
   */
  public areStrokedBoundsDilated(): boolean {
    const epsilon = 0.0000001;

    // If the derivative at the start/end are pointing in a cardinal direction (north/south/east/west), then the
    // endpoints won't trigger non-dilated bounds, and the interior of the curve will not contribute.
    return Math.abs( this.startTangent.x * this.startTangent.y ) < epsilon && Math.abs( this.endTangent.x * this.endTangent.y ) < epsilon;
  }

  /**
   * TODO: override everywhere so this isn't necessary (it's not particularly efficient!) https://github.com/phetsims/kite/issues/76
   */
  public getBoundsWithTransform( matrix: Matrix3 ): Bounds2 {
    const transformedSegment = this.transformed( matrix );
    return transformedSegment.getBounds();
  }

  /**
   * Extracts a slice of a segment, based on the parametric value.
   *
   * Given that this segment is represented by the interval [0,1]
   */
  public slice( t0: number, t1: number ): Segment {
    assert && assert( t0 >= 0 && t0 <= 1 && t1 >= 0 && t1 <= 1, 'Parametric value out of range' );
    assert && assert( t0 < t1 );

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let segment: Segment = this; // eslint-disable-line consistent-this
    if ( t1 < 1 ) {
      segment = segment.subdivided( t1 )[ 0 ];
    }
    if ( t0 > 0 ) {
      segment = segment.subdivided( linear( 0, t1, 0, 1, t0 ) )[ 1 ];
    }
    return segment;
  }

  /**
   * @param tList - list of sorted t values from 0 <= t <= 1
   */
  public subdivisions( tList: number[] ): Segment[] {
    // this could be solved by recursion, but we don't plan on the JS engine doing tail-call optimization

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let right: Segment = this; // eslint-disable-line consistent-this
    const result = [];
    for ( let i = 0; i < tList.length; i++ ) {
      // assume binary subdivision
      const t = tList[ i ];
      const arr = right.subdivided( t );
      assert && assert( arr.length === 2 );
      result.push( arr[ 0 ] );
      right = arr[ 1 ];

      // scale up the remaining t values
      for ( let j = i + 1; j < tList.length; j++ ) {
        tList[ j ] = linear( t, 1, 0, 1, tList[ j ] );
      }
    }
    result.push( right );
    return result;
  }

  /**
   * Return an array of segments from breaking this segment into monotone pieces
   */
  public subdividedIntoMonotone(): Segment[] {
    return this.subdivisions( this.getInteriorExtremaTs() );
  }

  /**
   * Determines if the segment is sufficiently flat (given certain epsilon values)
   *
   * @param distanceEpsilon - controls level of subdivision by attempting to ensure a maximum (squared)
   *                          deviation from the curve
   * @param curveEpsilon - controls level of subdivision by attempting to ensure a maximum curvature change
   *                       between segments
   */
  public isSufficientlyFlat( distanceEpsilon: number, curveEpsilon: number ): boolean {
    const start = this.start;
    const middle = this.positionAt( 0.5 );
    const end = this.end;

    return Segment.isSufficientlyFlat( distanceEpsilon, curveEpsilon, start, middle, end );
  }

  /**
   * Returns the (sometimes approximate) arc length of the segment.
   */
  public getArcLength( distanceEpsilon?: number, curveEpsilon?: number, maxLevels?: number ): number {
    distanceEpsilon = distanceEpsilon === undefined ? 1e-10 : distanceEpsilon;
    curveEpsilon = curveEpsilon === undefined ? 1e-8 : curveEpsilon;
    maxLevels = maxLevels === undefined ? 15 : maxLevels;

    if ( maxLevels <= 0 || this.isSufficientlyFlat( distanceEpsilon, curveEpsilon ) ) {
      return this.start.distance( this.end );
    }
    else {
      const subdivided = this.subdivided( 0.5 );
      return subdivided[ 0 ].getArcLength( distanceEpsilon, curveEpsilon, maxLevels - 1 ) +
             subdivided[ 1 ].getArcLength( distanceEpsilon, curveEpsilon, maxLevels - 1 );
    }
  }

  /**
   * Returns information about the line dash parametric offsets for a given segment.
   *
   * As always, this is fairly approximate depending on the type of segment.
   *
   * @param lineDash
   * @param lineDashOffset
   * @param distanceEpsilon - controls level of subdivision by attempting to ensure a maximum (squared)
   *                          deviation from the curve
   * @param curveEpsilon - controls level of subdivision by attempting to ensure a maximum curvature change
   *                       between segments
   */
  public getDashValues( lineDash: number[], lineDashOffset: number, distanceEpsilon: number, curveEpsilon: number ): DashValues {
    assert && assert( lineDash.length > 0, 'Do not call with an empty dash array' );

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const selfReference = this; // eslint-disable-line consistent-this

    const values = [];
    let arcLength = 0;

    // Do the offset modulo the sum, so that we don't have to cycle for a long time
    const lineDashSum = _.sum( lineDash );
    lineDashOffset = lineDashOffset % lineDashSum;

    // Ensure the lineDashOffset is positive
    if ( lineDashOffset < 0 ) {
      lineDashOffset += lineDashSum;
    }

    // The current section of lineDash that we are in
    let dashIndex = 0;
    let dashOffset = 0;
    let isInside = true;

    function nextDashIndex(): void {
      dashIndex = ( dashIndex + 1 ) % lineDash.length;
      isInside = !isInside;
    }

    // Burn off initial lineDashOffset
    while ( lineDashOffset > 0 ) {
      if ( lineDashOffset >= lineDash[ dashIndex ] ) {
        lineDashOffset -= lineDash[ dashIndex ];
        nextDashIndex();
      }
      else {
        dashOffset = lineDashOffset;
        lineDashOffset = 0;
      }
    }

    const initiallyInside = isInside;

    // Recursively progress through until we have mostly-linear segments.
    ( function recur( t0: number, t1: number, p0: Vector2, p1: Vector2, depth: number ) {
      // Compute the t/position at the midpoint t value
      const tMid = ( t0 + t1 ) / 2;
      const pMid = selfReference.positionAt( tMid );

      // If it's flat enough (or we hit our recursion limit), process it
      if ( depth > 14 || Segment.isSufficientlyFlat( distanceEpsilon, curveEpsilon, p0, pMid, p1 ) ) {
        // Estimate length
        const totalLength = p0.distance( pMid ) + pMid.distance( p1 );
        arcLength += totalLength;

        // While we are longer than the remaining amount for the next dash change.
        let lengthLeft = totalLength;
        while ( dashOffset + lengthLeft >= lineDash[ dashIndex ] ) {
          // Compute the t (for now, based on the total length for ease)
          const t = linear( 0, totalLength, t0, t1, totalLength - lengthLeft + lineDash[ dashIndex ] - dashOffset );

          // Record the dash change
          values.push( t );

          // Remove amount added from our lengthLeft (move to the dash)
          lengthLeft -= lineDash[ dashIndex ] - dashOffset;
          dashOffset = 0; // at the dash, we'll have 0 offset
          nextDashIndex();
        }

        // Spill-over, just add it
        dashOffset = dashOffset + lengthLeft;
      }
      else {
        recur( t0, tMid, p0, pMid, depth + 1 );
        recur( tMid, t1, pMid, p1, depth + 1 );
      }
    } )( 0, 1, this.start, this.end, 0 );

    return {
      values: values,
      arcLength: arcLength,
      initiallyInside: initiallyInside
    };
  }

  /**
   *
   * @param [options]
   * @param [minLevels] -   how many levels to force subdivisions
   * @param [maxLevels] -   prevent subdivision past this level
   * @param [segments]
   * @param [start]
   * @param [end]
   */
  public toPiecewiseLinearSegments( options: PiecewiseLinearOptions, minLevels?: number, maxLevels?: number, segments?: Line[], start?: Vector2, end?: Vector2 ): Line[] {
    // for the first call, initialize min/max levels from our options
    minLevels = minLevels === undefined ? options.minLevels! : minLevels;
    maxLevels = maxLevels === undefined ? options.maxLevels! : maxLevels;

    segments = segments || [];
    const pointMap = options.pointMap || _.identity;

    // points mapped by the (possibly-nonlinear) pointMap.
    start = start || pointMap( this.start );
    end = end || pointMap( this.end );
    const middle = pointMap( this.positionAt( 0.5 ) );

    assert && assert( minLevels <= maxLevels );
    assert && assert( options.distanceEpsilon === null || typeof options.distanceEpsilon === 'number' );
    assert && assert( options.curveEpsilon === null || typeof options.curveEpsilon === 'number' );
    assert && assert( !pointMap || typeof pointMap === 'function' );

    // i.e. we will have finished = maxLevels === 0 || ( minLevels <= 0 && epsilonConstraints ), just didn't want to one-line it
    let finished = maxLevels === 0; // bail out once we reach our maximum number of subdivision levels
    if ( !finished && minLevels <= 0 ) { // force subdivision if minLevels hasn't been reached
      finished = this.isSufficientlyFlat(
        options.distanceEpsilon === null || options.distanceEpsilon === undefined ? Number.POSITIVE_INFINITY : options.distanceEpsilon,
        options.curveEpsilon === null || options.curveEpsilon === undefined ? Number.POSITIVE_INFINITY : options.curveEpsilon
      );
    }

    if ( finished ) {
      segments.push( new Line( start!, end! ) );
    }
    else {
      const subdividedSegments = this.subdivided( 0.5 );
      subdividedSegments[ 0 ].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, start, middle );
      subdividedSegments[ 1 ].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, middle, end );
    }
    return segments;
  }

  /**
   * Returns a list of Line and/or Arc segments that approximates this segment.
   */
  public toPiecewiseLinearOrArcSegments( providedOptions: PiecewiseLinearOrArcOptions ): Segment[] {
    const options = optionize<PiecewiseLinearOrArcOptions, PiecewiseLinearOrArcOptions, PiecewiseLinearOrArcRecursionOptions>()( {
      minLevels: 2,
      maxLevels: 7,
      curvatureThreshold: 0.02,
      errorThreshold: 10,
      errorPoints: [ 0.25, 0.75 ]
    }, providedOptions );

    const segments: Segment[] = [];
    this.toPiecewiseLinearOrArcRecursion( options, options.minLevels, options.maxLevels, segments,
      0, 1,
      this.positionAt( 0 ), this.positionAt( 1 ),
      this.curvatureAt( 0 ), this.curvatureAt( 1 ) );
    return segments;
  }

  /**
   * Helper function for toPiecewiseLinearOrArcSegments. - will push into segments
   */
  private toPiecewiseLinearOrArcRecursion( options: PiecewiseLinearOrArcRecursionOptions, minLevels: number, maxLevels: number, segments: Segment[], startT: number, endT: number, startPoint: Vector2, endPoint: Vector2, startCurvature: number, endCurvature: number ): void {
    const middleT = ( startT + endT ) / 2;
    const middlePoint = this.positionAt( middleT );
    const middleCurvature = this.curvatureAt( middleT );

    if ( maxLevels <= 0 || ( minLevels <= 0 && Math.abs( startCurvature - middleCurvature ) + Math.abs( middleCurvature - endCurvature ) < options.curvatureThreshold * 2 ) ) {
      const segment = Arc.createFromPoints( startPoint, middlePoint, endPoint );
      let needsSplit = false;
      if ( segment instanceof Arc ) {
        const radiusSquared = segment.radius * segment.radius;
        for ( let i = 0; i < options.errorPoints.length; i++ ) {
          const t = options.errorPoints[ i ];
          const point = this.positionAt( startT * ( 1 - t ) + endT * t );
          if ( Math.abs( point.distanceSquared( segment.center ) - radiusSquared ) > options.errorThreshold ) {
            needsSplit = true;
            break;
          }
        }
      }
      if ( !needsSplit ) {
        segments.push( segment );
        return;
      }
    }
    this.toPiecewiseLinearOrArcRecursion( options, minLevels - 1, maxLevels - 1, segments,
      startT, middleT,
      startPoint, middlePoint,
      startCurvature, middleCurvature );
    this.toPiecewiseLinearOrArcRecursion( options, minLevels - 1, maxLevels - 1, segments,
      middleT, endT,
      middlePoint, endPoint,
      middleCurvature, endCurvature );
  }

  public getClosestPoints( point: Vector2 ): ClosestToPointResult[] {
    // TODO: solve segments to determine this analytically! (only implemented for Line right now, should be easy to do with some things) https://github.com/phetsims/kite/issues/76
    return Segment.closestToPoint( [ this ], point, 1e-7 );
  }

  /**
   * List of results (since there can be duplicates), threshold is used for subdivision,
   * where it will exit if all of the segments are shorter than the threshold
   *
   * TODO: solve segments to determine this analytically! https://github.com/phetsims/kite/issues/76
   */
  public static closestToPoint( segments: Segment[], point: Vector2, threshold: number ): ClosestToPointResult[] {
    type Item = {
      ta: number;
      tb: number;
      pa: Vector2;
      pb: Vector2;
      segment: Segment;
      bounds: Bounds2;
      min: number;
      max: number;
    };

    const thresholdSquared = threshold * threshold;
    let items: Item[] = [];
    let bestList: ClosestToPointResult[] = [];
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    let thresholdOk = false;

    _.each( segments, ( segment: Segment ) => {
      // if we have an explicit computation for this segment, use it
      if ( segment instanceof Line ) {
        const infos = segment.explicitClosestToPoint( point );
        _.each( infos, info => {
          if ( info.distanceSquared < bestDistanceSquared ) {
            bestList = [ info ];
            bestDistanceSquared = info.distanceSquared;
          }
          else if ( info.distanceSquared === bestDistanceSquared ) {
            bestList.push( info );
          }
        } );
      }
      else {
        // otherwise, we will split based on monotonicity, so we can subdivide
        // separate, so we can map the subdivided segments
        const ts = [ 0 ].concat( segment.getInteriorExtremaTs() ).concat( [ 1 ] );
        for ( let i = 0; i < ts.length - 1; i++ ) {
          const ta = ts[ i ];
          const tb = ts[ i + 1 ];
          const pa = segment.positionAt( ta );
          const pb = segment.positionAt( tb );
          const bounds = Bounds2.point( pa ).addPoint( pb );
          const minDistanceSquared = bounds.minimumDistanceToPointSquared( point );
          if ( minDistanceSquared <= bestDistanceSquared ) {
            const maxDistanceSquared = bounds.maximumDistanceToPointSquared( point );
            if ( maxDistanceSquared < bestDistanceSquared ) {
              bestDistanceSquared = maxDistanceSquared;
              bestList = []; // clear it
            }
            items.push( {
              ta: ta,
              tb: tb,
              pa: pa,
              pb: pb,
              segment: segment,
              bounds: bounds,
              min: minDistanceSquared,
              max: maxDistanceSquared
            } );
          }
        }
      }
    } );

    while ( items.length && !thresholdOk ) {
      const curItems = items;
      items = [];

      // whether all of the segments processed are shorter than the threshold
      thresholdOk = true;

      for ( const item of curItems ) {
        if ( item.min > bestDistanceSquared ) {
          continue; // drop this item
        }
        if ( thresholdOk && item.pa.distanceSquared( item.pb ) > thresholdSquared ) {
          thresholdOk = false;
        }
        const tmid = ( item.ta + item.tb ) / 2;
        const pmid = item.segment.positionAt( tmid );
        const boundsA = Bounds2.point( item.pa ).addPoint( pmid );
        const boundsB = Bounds2.point( item.pb ).addPoint( pmid );
        const minA = boundsA.minimumDistanceToPointSquared( point );
        const minB = boundsB.minimumDistanceToPointSquared( point );
        if ( minA <= bestDistanceSquared ) {
          const maxA = boundsA.maximumDistanceToPointSquared( point );
          if ( maxA < bestDistanceSquared ) {
            bestDistanceSquared = maxA;
            bestList = []; // clear it
          }
          items.push( {
            ta: item.ta,
            tb: tmid,
            pa: item.pa,
            pb: pmid,
            segment: item.segment,
            bounds: boundsA,
            min: minA,
            max: maxA
          } );
        }
        if ( minB <= bestDistanceSquared ) {
          const maxB = boundsB.maximumDistanceToPointSquared( point );
          if ( maxB < bestDistanceSquared ) {
            bestDistanceSquared = maxB;
            bestList = []; // clear it
          }
          items.push( {
            ta: tmid,
            tb: item.tb,
            pa: pmid,
            pb: item.pb,
            segment: item.segment,
            bounds: boundsB,
            min: minB,
            max: maxB
          } );
        }
      }
    }

    // if there are any closest regions, they are within the threshold, so we will add them all
    _.each( items, item => {
      const t = ( item.ta + item.tb ) / 2;
      const closestPoint = item.segment.positionAt( t );
      bestList.push( {
        segment: item.segment,
        t: t,
        closestPoint: closestPoint,
        distanceSquared: point.distanceSquared( closestPoint )
      } );
    } );

    return bestList;
  }

  /**
   * Given the cubic-premultiplied values for two cubic bezier curves, determines (if available) a specified (a,b) pair
   * such that p( t ) === q( a * t + b ).
   *
   * Given a 1-dimensional cubic bezier determined by the control points p0, p1, p2 and p3, compute:
   *
   * [ p0s ]    [  1   0   0   0 ]   [ p0 ]
   * [ p1s ] == [ -3   3   0   0 ] * [ p1 ]
   * [ p2s ] == [  3  -6   3   0 ] * [ p2 ]
   * [ p3s ]    [ -1   3  -3   1 ]   [ p3 ]
   *
   * see Cubic.getOverlaps for more information.
   */
  public static polynomialGetOverlapCubic( p0s: number, p1s: number, p2s: number, p3s: number, q0s: number, q1s: number, q2s: number, q3s: number ): PossibleSimpleOverlap {
    if ( q3s === 0 ) {
      return Segment.polynomialGetOverlapQuadratic( p0s, p1s, p2s, q0s, q1s, q2s );
    }

    const a = Math.sign( p3s / q3s ) * Math.pow( Math.abs( p3s / q3s ), 1 / 3 );
    if ( a === 0 ) {
      return null; // If there would be solutions, then q3s would have been non-zero
    }
    const b = ( p2s - a * a * q2s ) / ( 3 * a * a * q3s );
    return {
      a: a,
      b: b
    };
  }

  /**
   * Given the quadratic-premultiplied values for two quadratic bezier curves, determines (if available) a specified (a,b) pair
   * such that p( t ) === q( a * t + b ).
   *
   * Given a 1-dimensional quadratic bezier determined by the control points p0, p1, p2, compute:
   *
   * [ p0s ]    [  1   0   0 ]   [ p0 ]
   * [ p1s ] == [ -2   2   0 ] * [ p1 ]
   * [ p2s ]    [  2  -2   3 ] * [ p2 ]
   *
   * see Quadratic.getOverlaps for more information.
   */
  public static polynomialGetOverlapQuadratic( p0s: number, p1s: number, p2s: number, q0s: number, q1s: number, q2s: number ): PossibleSimpleOverlap {
    if ( q2s === 0 ) {
      return Segment.polynomialGetOverlapLinear( p0s, p1s, q0s, q1s );
    }

    const discr = p2s / q2s;
    if ( discr < 0 ) {
      return null; // not possible to have a solution with an imaginary a
    }

    const a = Math.sqrt( p2s / q2s );
    if ( a === 0 ) {
      return null; // If there would be solutions, then q2s would have been non-zero
    }

    const b = ( p1s - a * q1s ) / ( 2 * a * q2s );
    return {
      a: a,
      b: b
    };
  }

  /**
   * Given the linear-premultiplied values for two lines, determines (if available) a specified (a,b) pair
   * such that p( t ) === q( a * t + b ).
   *
   * Given a line determined by the control points p0, p1, compute:
   *
   * [ p0s ] == [  1   0 ] * [ p0 ]
   * [ p1s ] == [ -1   1 ] * [ p1 ]
   *
   * see Quadratic/Cubic.getOverlaps for more information.
   */
  public static polynomialGetOverlapLinear( p0s: number, p1s: number, q0s: number, q1s: number ): PossibleSimpleOverlap {
    if ( q1s === 0 ) {
      if ( p0s === q0s ) {
        return true;
      }
      else {
        return null;
      }
    }

    const a = p1s / q1s;
    if ( a === 0 ) {
      return null;
    }

    const b = ( p0s - q0s ) / q1s;
    return {
      a: a,
      b: b
    };
  }

  /**
   * Returns all the distinct (non-endpoint, non-finite) intersections between the two segments.
   */
  public static intersect( a: Segment, b: Segment ): SegmentIntersection[] {
    if ( Line && a instanceof Line && b instanceof Line ) {
      return Line.intersect( a, b );
    }
    else if ( Line && a instanceof Line ) {
      return Line.intersectOther( a, b );
    }
    else if ( Line && b instanceof Line ) {
      // need to swap our intersections, since 'b' is the line
      return Line.intersectOther( b, a ).map( swapSegmentIntersection );
    }
    else if ( Arc && a instanceof Arc && b instanceof Arc ) {
      return Arc.intersect( a, b );
    }
    else if ( EllipticalArc && a instanceof EllipticalArc && b instanceof EllipticalArc ) {
      return EllipticalArc.intersect( a, b );
    }
    else if ( Quadratic && Cubic && ( a instanceof Quadratic || a instanceof Cubic ) && ( b instanceof Quadratic || b instanceof Cubic ) ) {
      const cubicA = a instanceof Cubic ? a : a.degreeElevated();
      const cubicB = b instanceof Cubic ? b : b.degreeElevated();

      // @ts-expect-error (no type definitions yet, perhaps useful if we use it more)
      const paperCurveA = new paper.Curve( cubicA.start.x, cubicA.start.y, cubicA.control1.x, cubicA.control1.y, cubicA.control2.x, cubicA.control2.y, cubicA.end.x, cubicA.end.y );

      // @ts-expect-error (no type definitions yet, perhaps useful if we use it more)
      const paperCurveB = new paper.Curve( cubicB.start.x, cubicB.start.y, cubicB.control1.x, cubicB.control1.y, cubicB.control2.x, cubicB.control2.y, cubicB.end.x, cubicB.end.y );

      const paperIntersections = paperCurveA.getIntersections( paperCurveB );
      return paperIntersections.map( ( paperIntersection: IntentionalAny ) => {
        const point = new Vector2( paperIntersection.point.x, paperIntersection.point.y );
        return new SegmentIntersection( point, paperIntersection.time, paperIntersection.intersection.time );
      } );
    }
    else {
      return BoundsIntersection.intersect( a, b );
    }
  }

  /**
   * Returns a Segment from the serialized representation.
   */
  public static deserialize( obj: SerializedSegment ): Segment {
    // TODO: just import them now that we have circular reference protection, and switch between https://github.com/phetsims/kite/issues/76
    // @ts-expect-error TODO: namespacing https://github.com/phetsims/kite/issues/76
    assert && assert( obj.type && kite[ obj.type ] && kite[ obj.type ].deserialize );

    // @ts-expect-error TODO: namespacing https://github.com/phetsims/kite/issues/76
    return kite[ obj.type ].deserialize( obj );
  }

  /**
   * Determines if the start/middle/end points are representative of a sufficiently flat segment
   * (given certain epsilon values)
   *
   * @param start
   * @param middle
   * @param end
   * @param distanceEpsilon - controls level of subdivision by attempting to ensure a maximum (squared)
   *                          deviation from the curve
   * @param curveEpsilon - controls level of subdivision by attempting to ensure a maximum curvature change
   *                       between segments
   */
  public static isSufficientlyFlat( distanceEpsilon: number, curveEpsilon: number, start: Vector2, middle: Vector2, end: Vector2 ): boolean {
    // flatness criterion: A=start, B=end, C=midpoint, d0=distance from AB, d1=||B-A||, subdivide if d0/d1 > sqrt(epsilon)
    if ( distToSegmentSquared( middle, start, end ) / start.distanceSquared( end ) > curveEpsilon ) {
      return false;
    }
    // deviation criterion
    if ( distToSegmentSquared( middle, start, end ) > distanceEpsilon ) {
      return false;
    }
    return true;
  }

  public static filterClosestToPointResult( results: ClosestToPointResult[] ): ClosestToPointResult[] {
    if ( results.length === 0 ) {
      return [];
    }

    const closestDistanceSquared = _.minBy( results, result => result.distanceSquared )!.distanceSquared;

    // Return all results that are within 1e-11 of the closest distance (to account for floating point error), but unique
    // based on the location.
    return _.uniqWith( results.filter( result => Math.abs( result.distanceSquared - closestDistanceSquared ) < 1e-11 ), ( a, b ) => a.closestPoint.distanceSquared( b.closestPoint ) < 1e-11 );
  }
}

kite.register( 'Segment', Segment );

function swapSegmentIntersection( segmentIntersection: SegmentIntersection ): SegmentIntersection {
  return segmentIntersection.getSwapped();
}

// TODO: See if we should use this more https://github.com/phetsims/kite/issues/76
const TWO_PI = Math.PI * 2;


export type SerializedArc = {
  type: 'Arc';
  centerX: number;
  centerY: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
};

/**
 * A circular arc (a continuous sub-part of a circle).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
export class Arc extends Segment {

  private _center: Vector2;
  private _radius: number;
  private _startAngle: number;
  private _endAngle: number;
  private _anticlockwise: boolean;

  // Lazily-computed derived information
  private _start!: Vector2 | null;
  private _end!: Vector2 | null;
  private _startTangent!: Vector2 | null;
  private _endTangent!: Vector2 | null;
  private _actualEndAngle!: number | null; // End angle in relation to our start angle (can get remapped)
  private _isFullPerimeter!: boolean | null; // Whether it's a full circle (and not just an arc)
  private _angleDifference!: number | null;
  private _bounds!: Bounds2 | null;
  private _svgPathFragment!: string | null;

  /**
   * If the startAngle/endAngle difference is ~2pi, this will be a full circle
   *
   * See http://www.w3.org/TR/2dcontext/#dom-context-2d-arc for detailed information on the parameters.
   *
   * @param center - Center of the arc (every point on the arc is equally far from the center)
   * @param radius - How far from the center the arc will be
   * @param startAngle - Angle (radians) of the start of the arc
   * @param endAngle - Angle (radians) of the end of the arc
   * @param anticlockwise - Decides which direction the arc takes around the center
   */
  public constructor( center: Vector2, radius: number, startAngle: number, endAngle: number, anticlockwise: boolean ) {
    super();

    this._center = center;
    this._radius = radius;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;

    this.invalidate();
  }

  /**
   * Sets the center of the Arc.
   */
  public setCenter( center: Vector2 ): this {
    assert && assert( center.isFinite(), `Arc center should be finite: ${center.toString()}` );

    if ( !this._center.equals( center ) ) {
      this._center = center;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set center( value: Vector2 ) { this.setCenter( value ); }

  public get center(): Vector2 { return this.getCenter(); }


  /**
   * Returns the center of this Arc.
   */
  public getCenter(): Vector2 {
    return this._center;
  }


  /**
   * Sets the radius of the Arc.
   */
  public setRadius( radius: number ): this {
    assert && assert( isFinite( radius ), `Arc radius should be a finite number: ${radius}` );

    if ( this._radius !== radius ) {
      this._radius = radius;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set radius( value: number ) { this.setRadius( value ); }

  public get radius(): number { return this.getRadius(); }


  /**
   * Returns the radius of this Arc.
   */
  public getRadius(): number {
    return this._radius;
  }


  /**
   * Sets the startAngle of the Arc.
   */
  public setStartAngle( startAngle: number ): this {
    assert && assert( isFinite( startAngle ), `Arc startAngle should be a finite number: ${startAngle}` );

    if ( this._startAngle !== startAngle ) {
      this._startAngle = startAngle;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set startAngle( value: number ) { this.setStartAngle( value ); }

  public get startAngle(): number { return this.getStartAngle(); }


  /**
   * Returns the startAngle of this Arc.
   */
  public getStartAngle(): number {
    return this._startAngle;
  }


  /**
   * Sets the endAngle of the Arc.
   */
  public setEndAngle( endAngle: number ): this {
    assert && assert( isFinite( endAngle ), `Arc endAngle should be a finite number: ${endAngle}` );

    if ( this._endAngle !== endAngle ) {
      this._endAngle = endAngle;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set endAngle( value: number ) { this.setEndAngle( value ); }

  public get endAngle(): number { return this.getEndAngle(); }


  /**
   * Returns the endAngle of this Arc.
   */
  public getEndAngle(): number {
    return this._endAngle;
  }


  /**
   * Sets the anticlockwise of the Arc.
   */
  public setAnticlockwise( anticlockwise: boolean ): this {

    if ( this._anticlockwise !== anticlockwise ) {
      this._anticlockwise = anticlockwise;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set anticlockwise( value: boolean ) { this.setAnticlockwise( value ); }

  public get anticlockwise(): boolean { return this.getAnticlockwise(); }

  /**
   * Returns the anticlockwise of this Arc.
   */
  public getAnticlockwise(): boolean {
    return this._anticlockwise;
  }


  /**
   * Returns the position parametrically, with 0 <= t <= 1.
   *
   * NOTE: positionAt( 0 ) will return the start of the segment, and positionAt( 1 ) will return the end of the
   * segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public positionAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'positionAt t should be non-negative' );
    assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

    return this.positionAtAngle( this.angleAt( t ) );
  }

  /**
   * Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
   *
   * NOTE: tangentAt( 0 ) will return the tangent at the start of the segment, and tangentAt( 1 ) will return the
   * tangent at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public tangentAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'tangentAt t should be non-negative' );
    assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

    return this.tangentAtAngle( this.angleAt( t ) );
  }

  /**
   * Returns the signed curvature of the segment at the parametric value t, where 0 <= t <= 1.
   *
   * The curvature will be positive for visual clockwise / mathematical counterclockwise curves, negative for opposite
   * curvature, and 0 for no curvature.
   *
   * NOTE: curvatureAt( 0 ) will return the curvature at the start of the segment, and curvatureAt( 1 ) will return
   * the curvature at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public curvatureAt( t: number ): number {
    assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
    assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

    // Since it is an arc of as circle, the curvature is independent of t
    return ( this._anticlockwise ? -1 : 1 ) / this._radius;
  }

  /**
   * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
   * up the same shape as the current segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public subdivided( t: number ): Arc[] {
    assert && assert( t >= 0, 'subdivided t should be non-negative' );
    assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

    // If t is 0 or 1, we only need to return 1 segment
    if ( t === 0 || t === 1 ) {
      return [ this ];
    }

    // TODO: verify that we don't need to switch anticlockwise here, or subtract 2pi off any angles https://github.com/phetsims/kite/issues/76
    const angle0 = this.angleAt( 0 );
    const angleT = this.angleAt( t );
    const angle1 = this.angleAt( 1 );
    return [
      new Arc( this._center, this._radius, angle0, angleT, this._anticlockwise ),
      new Arc( this._center, this._radius, angleT, angle1, this._anticlockwise )
    ];
  }

  /**
   * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   */
  public invalidate(): void {
    this._start = null;
    this._end = null;
    this._startTangent = null;
    this._endTangent = null;
    this._actualEndAngle = null;
    this._isFullPerimeter = null;
    this._angleDifference = null;
    this._bounds = null;
    this._svgPathFragment = null;

    assert && assert( this._center instanceof Vector2, 'Arc center should be a Vector2' );
    assert && assert( this._center.isFinite(), 'Arc center should be finite (not NaN or infinite)' );
    assert && assert( typeof this._radius === 'number', `Arc radius should be a number: ${this._radius}` );
    assert && assert( isFinite( this._radius ), `Arc radius should be a finite number: ${this._radius}` );
    assert && assert( typeof this._startAngle === 'number', `Arc startAngle should be a number: ${this._startAngle}` );
    assert && assert( isFinite( this._startAngle ), `Arc startAngle should be a finite number: ${this._startAngle}` );
    assert && assert( typeof this._endAngle === 'number', `Arc endAngle should be a number: ${this._endAngle}` );
    assert && assert( isFinite( this._endAngle ), `Arc endAngle should be a finite number: ${this._endAngle}` );
    assert && assert( typeof this._anticlockwise === 'boolean', `Arc anticlockwise should be a boolean: ${this._anticlockwise}` );

    // Remap negative radius to a positive radius
    if ( this._radius < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      this._radius = -this._radius;
      this._startAngle += Math.PI;
      this._endAngle += Math.PI;
    }

    // Constraints that should always be satisfied
    assert && assert( !( ( !this.anticlockwise && this._endAngle - this._startAngle <= -Math.PI * 2 ) ||
                         ( this.anticlockwise && this._startAngle - this._endAngle <= -Math.PI * 2 ) ),
      'Not handling arcs with start/end angles that show differences in-between browser handling' );
    assert && assert( !( ( !this.anticlockwise && this._endAngle - this._startAngle > Math.PI * 2 ) ||
                         ( this.anticlockwise && this._startAngle - this._endAngle > Math.PI * 2 ) ),
      'Not handling arcs with start/end angles that show differences in-between browser handling' );

    this.invalidationEmitter.emit();
  }

  /**
   * Gets the start position of this arc.
   */
  public getStart(): Vector2 {
    if ( this._start === null ) {
      this._start = this.positionAtAngle( this._startAngle );
    }
    return this._start;
  }

  public get start(): Vector2 { return this.getStart(); }

  /**
   * Gets the end position of this arc.
   */
  public getEnd(): Vector2 {
    if ( this._end === null ) {
      this._end = this.positionAtAngle( this._endAngle );
    }
    return this._end;
  }

  public get end(): Vector2 { return this.getEnd(); }

  /**
   * Gets the unit vector tangent to this arc at the start point.
   */
  public getStartTangent(): Vector2 {
    if ( this._startTangent === null ) {
      this._startTangent = this.tangentAtAngle( this._startAngle );
    }
    return this._startTangent;
  }

  public get startTangent(): Vector2 { return this.getStartTangent(); }

  /**
   * Gets the unit vector tangent to the arc at the end point.
   */
  public getEndTangent(): Vector2 {
    if ( this._endTangent === null ) {
      this._endTangent = this.tangentAtAngle( this._endAngle );
    }
    return this._endTangent;
  }

  public get endTangent(): Vector2 { return this.getEndTangent(); }

  /**
   * Gets the end angle in radians.
   */
  public getActualEndAngle(): number {
    if ( this._actualEndAngle === null ) {
      this._actualEndAngle = Arc.computeActualEndAngle( this._startAngle, this._endAngle, this._anticlockwise );
    }
    return this._actualEndAngle;
  }

  public get actualEndAngle(): number { return this.getActualEndAngle(); }

  /**
   * Returns a boolean value that indicates if the arc wraps up by more than two Pi.
   */
  public getIsFullPerimeter(): boolean {
    if ( this._isFullPerimeter === null ) {
      this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
    }
    return this._isFullPerimeter;
  }

  public get isFullPerimeter(): boolean { return this.getIsFullPerimeter(); }

  /**
   * Returns an angle difference that represents how "much" of the circle our arc covers.
   *
   * The answer is always greater or equal to zero
   * The answer can exceed two Pi
   */
  public getAngleDifference(): number {
    if ( this._angleDifference === null ) {
      // compute an angle difference that represents how "much" of the circle our arc covers
      this._angleDifference = this._anticlockwise ? this._startAngle - this._endAngle : this._endAngle - this._startAngle;
      if ( this._angleDifference < 0 ) {
        this._angleDifference += Math.PI * 2;
      }
      assert && assert( this._angleDifference >= 0 ); // now it should always be zero or positive
    }
    return this._angleDifference;
  }

  public get angleDifference(): number { return this.getAngleDifference(); }

  /**
   * Returns the bounds of this segment.
   */
  public getBounds(): Bounds2 {
    if ( this._bounds === null ) {
      // acceleration for intersection
      this._bounds = Bounds2.NOTHING.copy().withPoint( this.getStart() )
        .withPoint( this.getEnd() );

      // if the angles are different, check extrema points
      if ( this._startAngle !== this._endAngle ) {
        // check all of the extrema points
        this.includeBoundsAtAngle( 0 );
        this.includeBoundsAtAngle( Math.PI / 2 );
        this.includeBoundsAtAngle( Math.PI );
        this.includeBoundsAtAngle( 3 * Math.PI / 2 );
      }
    }
    return this._bounds;
  }

  public get bounds(): Bounds2 { return this.getBounds(); }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   */
  public getNondegenerateSegments(): Arc[] {
    if ( this._radius <= 0 || this._startAngle === this._endAngle ) {
      return [];
    }
    else {
      return [ this ]; // basically, Arcs aren't really degenerate that easily
    }
  }

  /**
   * Attempts to expand the private _bounds bounding box to include a point at a specific angle, making sure that
   * angle is actually included in the arc. This will presumably be called at angles that are at critical points,
   * where the arc should have maximum/minimum x/y values.
   */
  private includeBoundsAtAngle( angle: number ): void {
    if ( this.containsAngle( angle ) ) {
      // the boundary point is in the arc
      this._bounds = this._bounds!.withPoint( this._center.plus( Vector2.createPolar( this._radius, angle ) ) );
    }
  }

  /**
   * Maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
   */
  public mapAngle( angle: number ): number {
    if ( Math.abs( moduloBetweenDown( angle - this._startAngle, -Math.PI, Math.PI ) ) < 1e-8 ) {
      return this._startAngle;
    }
    if ( Math.abs( moduloBetweenDown( angle - this.getActualEndAngle(), -Math.PI, Math.PI ) ) < 1e-8 ) {
      return this.getActualEndAngle();
    }
    // consider an assert that we contain that angle?
    return ( this._startAngle > this.getActualEndAngle() ) ?
           moduloBetweenUp( angle, this._startAngle - 2 * Math.PI, this._startAngle ) :
           moduloBetweenDown( angle, this._startAngle, this._startAngle + 2 * Math.PI );
  }

  /**
   * Returns the parametrized value t for a given angle. The value t should range from 0 to 1 (inclusive).
   */
  public tAtAngle( angle: number ): number {
    const t = ( this.mapAngle( angle ) - this._startAngle ) / ( this.getActualEndAngle() - this._startAngle );

    assert && assert( t >= 0 && t <= 1, `tAtAngle out of range: ${t}` );

    return t;
  }

  /**
   * Returns the angle for the parametrized t value. The t value should range from 0 to 1 (inclusive).
   */
  public angleAt( t: number ): number {
    //TODO: add asserts https://github.com/phetsims/kite/issues/76
    return this._startAngle + ( this.getActualEndAngle() - this._startAngle ) * t;
  }

  /**
   * Returns the position of this arc at angle.
   */
  public positionAtAngle( angle: number ): Vector2 {
    return this._center.plus( Vector2.createPolar( this._radius, angle ) );
  }

  /**
   * Returns the normalized tangent of this arc.
   * The tangent points outward (inward) of this arc for clockwise (anticlockwise) direction.
   */
  public tangentAtAngle( angle: number ): Vector2 {
    const normal = Vector2.createPolar( 1, angle );

    return this._anticlockwise ? normal.perpendicular : normal.perpendicular.negated();
  }

  /**
   * Returns whether the given angle is contained by the arc (whether a ray from the arc's origin going in that angle
   * will intersect the arc).
   */
  public containsAngle( angle: number ): boolean {
    // transform the angle into the appropriate coordinate form
    // TODO: check anticlockwise version! https://github.com/phetsims/kite/issues/76
    const normalizedAngle = this._anticlockwise ? angle - this._endAngle : angle - this._startAngle;

    // get the angle between 0 and 2pi
    const positiveMinAngle = moduloBetweenDown( normalizedAngle, 0, Math.PI * 2 );

    return positiveMinAngle <= this.angleDifference;
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided,
   * so anything that calls this needs to put the M calls first
   */
  public getSVGPathFragment(): string {
    let oldPathFragment;
    if ( assert ) {
      oldPathFragment = this._svgPathFragment;
      this._svgPathFragment = null;
    }
    if ( !this._svgPathFragment ) {
      // see http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands for more info
      // rx ry x-axis-rotation large-arc-flag sweep-flag x y

      const epsilon = 0.01; // allow some leeway to render things as 'almost circles'
      const sweepFlag = this._anticlockwise ? '0' : '1';
      let largeArcFlag;
      if ( this.angleDifference < Math.PI * 2 - epsilon ) {
        largeArcFlag = this.angleDifference < Math.PI ? '0' : '1';
        this._svgPathFragment = `A ${svgNumber( this._radius )} ${svgNumber( this._radius )} 0 ${largeArcFlag
        } ${sweepFlag} ${svgNumber( this.end.x )} ${svgNumber( this.end.y )}`;
      }
      else {
        // circle (or almost-circle) case needs to be handled differently
        // since SVG will not be able to draw (or know how to draw) the correct circle if we just have a start and end, we need to split it into two circular arcs

        // get the angle that is between and opposite of both of the points
        const splitOppositeAngle = ( this._startAngle + this._endAngle ) / 2; // this _should_ work for the modular case?
        const splitPoint = this._center.plus( Vector2.createPolar( this._radius, splitOppositeAngle ) );

        largeArcFlag = '0'; // since we split it in 2, it's always the small arc

        const firstArc = `A ${svgNumber( this._radius )} ${svgNumber( this._radius )} 0 ${
          largeArcFlag} ${sweepFlag} ${svgNumber( splitPoint.x )} ${svgNumber( splitPoint.y )}`;
        const secondArc = `A ${svgNumber( this._radius )} ${svgNumber( this._radius )} 0 ${
          largeArcFlag} ${sweepFlag} ${svgNumber( this.end.x )} ${svgNumber( this.end.y )}`;

        this._svgPathFragment = `${firstArc} ${secondArc}`;
      }
    }
    if ( assert ) {
      if ( oldPathFragment ) {
        assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
      }
    }
    return this._svgPathFragment;
  }

  /**
   * Returns an array of arcs that will draw an offset on the logical left side
   */
  public strokeLeft( lineWidth: number ): Arc[] {
    return [ new Arc( this._center, this._radius + ( this._anticlockwise ? 1 : -1 ) * lineWidth / 2, this._startAngle, this._endAngle, this._anticlockwise ) ];
  }

  /**
   * Returns an array of arcs that will draw an offset curve on the logical right side
   */
  public strokeRight( lineWidth: number ): Arc[] {
    return [ new Arc( this._center, this._radius + ( this._anticlockwise ? -1 : 1 ) * lineWidth / 2, this._endAngle, this._startAngle, !this._anticlockwise ) ];
  }

  /**
   * Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   * Does not include t=0 and t=1
   */
  public getInteriorExtremaTs(): number[] {
    const result: number[] = [];
    _.each( [ 0, Math.PI / 2, Math.PI, 3 * Math.PI / 2 ], angle => {
      if ( this.containsAngle( angle ) ) {
        const t = this.tAtAngle( angle );
        const epsilon = 0.0000000001; // TODO: general kite epsilon?, also do 1e-Number format https://github.com/phetsims/kite/issues/76
        if ( t > epsilon && t < 1 - epsilon ) {
          result.push( t );
        }
      }
    } );
    return result.sort(); // modifies original, which is OK
  }

  /**
   * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
   * For details, see the documentation in Segment.js
   */
  public intersection( ray: Ray2 ): RayIntersection[] {
    const result: RayIntersection[] = []; // hits in order

    // left here, if in the future we want to better-handle boundary points
    const epsilon = 0;

    // Run a general circle-intersection routine, then we can test the angles later.
    // Solves for the two solutions t such that ray.position + ray.direction * t is on the circle.
    // Then we check whether the angle at each possible hit point is in our arc.
    const centerToRay = ray.position.minus( this._center );
    const tmp = ray.direction.dot( centerToRay );
    const centerToRayDistSq = centerToRay.magnitudeSquared;
    const discriminant = 4 * tmp * tmp - 4 * ( centerToRayDistSq - this._radius * this._radius );
    if ( discriminant < epsilon ) {
      // ray misses circle entirely
      return result;
    }
    const base = ray.direction.dot( this._center ) - ray.direction.dot( ray.position );
    const sqt = Math.sqrt( discriminant ) / 2;
    const ta = base - sqt;
    const tb = base + sqt;

    if ( tb < epsilon ) {
      // circle is behind ray
      return result;
    }

    const pointB = ray.pointAtDistance( tb );
    const normalB = pointB.minus( this._center ).normalized();
    const normalBAngle = normalB.angle;

    if ( ta < epsilon ) {
      // we are inside the circle, so only one intersection is possible
      if ( this.containsAngle( normalBAngle ) ) {
        // normal is towards the ray, so we negate it. also winds opposite way
        result.push( new RayIntersection( tb, pointB, normalB.negated(), this._anticlockwise ? -1 : 1, this.tAtAngle( normalBAngle ) ) );
      }
    }
    else {
      // two possible hits (outside circle)
      const pointA = ray.pointAtDistance( ta );
      const normalA = pointA.minus( this._center ).normalized();
      const normalAAngle = normalA.angle;

      if ( this.containsAngle( normalAAngle ) ) {
        // hit from outside
        result.push( new RayIntersection( ta, pointA, normalA, this._anticlockwise ? 1 : -1, this.tAtAngle( normalAAngle ) ) );
      }
      if ( this.containsAngle( normalBAngle ) ) {
        result.push( new RayIntersection( tb, pointB, normalB.negated(), this._anticlockwise ? -1 : 1, this.tAtAngle( normalBAngle ) ) );
      }
    }

    return result;
  }

  /**
   * Returns the resultant winding number of this ray intersecting this arc.
   */
  public windingIntersection( ray: Ray2 ): number {
    let wind = 0;
    const hits = this.intersection( ray );
    _.each( hits, hit => {
      wind += hit.wind;
    } );
    return wind;
  }

  /**
   * Draws this arc to the 2D Canvas context, assuming the context's current location is already at the start point
   */
  public writeToContext( context: CanvasRenderingContext2D ): void {
    context.arc( this._center.x, this._center.y, this._radius, this._startAngle, this._endAngle, this._anticlockwise );
  }

  /**
   * Returns a new copy of this arc, transformed by the given matrix.
   *
   * TODO: test various transform types, especially rotations, scaling, shears, etc. https://github.com/phetsims/kite/issues/76
   */
  public transformed( matrix: Matrix3 ): Arc | EllipticalArc {
    // so we can handle reflections in the transform, we do the general case handling for start/end angles
    const startAngle = matrix.timesVector2( Vector2.createPolar( 1, this._startAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle;
    let endAngle = matrix.timesVector2( Vector2.createPolar( 1, this._endAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle;

    // reverse the 'clockwiseness' if our transform includes a reflection
    const anticlockwise = matrix.getDeterminant() >= 0 ? this._anticlockwise : !this._anticlockwise;

    if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
      endAngle = anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
    }

    const scaleVector = matrix.getScaleVector();
    if ( scaleVector.x !== scaleVector.y ) {
      const radiusX = scaleVector.x * this._radius;
      const radiusY = scaleVector.y * this._radius;
      return new EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, 0, startAngle, endAngle, anticlockwise );
    }
    else {
      const radius = scaleVector.x * this._radius;
      return new Arc( matrix.timesVector2( this._center ), radius, startAngle, endAngle, anticlockwise );
    }
  }

  /**
   * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
   *
   * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
   */
  public getSignedAreaFragment(): number {
    const t0 = this._startAngle;
    const t1 = this.getActualEndAngle();

    // Derived via Mathematica (curve-area.nb)
    return 0.5 * this._radius * ( this._radius * ( t1 - t0 ) +
                                  this._center.x * ( Math.sin( t1 ) - Math.sin( t0 ) ) -
                                  this._center.y * ( Math.cos( t1 ) - Math.cos( t0 ) ) );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   */
  public reversed(): Arc {
    return new Arc( this._center, this._radius, this._endAngle, this._startAngle, !this._anticlockwise );
  }

  /**
   * Returns the arc length of the segment.
   */
  public override getArcLength(): number {
    return this.getAngleDifference() * this._radius;
  }

  /**
   * We can handle this simply by returning ourselves.
   */
  public override toPiecewiseLinearOrArcSegments(): Segment[] {
    return [ this ];
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedArc {
    return {
      type: 'Arc',
      centerX: this._center.x,
      centerY: this._center.y,
      radius: this._radius,
      startAngle: this._startAngle,
      endAngle: this._endAngle,
      anticlockwise: this._anticlockwise
    };
  }

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * @param segment
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public getOverlaps( segment: Segment, epsilon = 1e-6 ): Overlap[] | null {
    if ( segment instanceof Arc ) {
      return Arc.getOverlaps( this, segment );
    }

    return null;
  }

  /**
   * Returns the matrix representation of the conic section of the circle.
   * See https://en.wikipedia.org/wiki/Matrix_representation_of_conic_sections
   */
  public getConicMatrix(): Matrix3 {
    // ( x - a )^2 + ( y - b )^2 = r^2
    // x^2 - 2ax + a^2 + y^2 - 2by + b^2 = r^2
    // x^2 + y^2 - 2ax - 2by + ( a^2 + b^2 - r^2 ) = 0

    const a = this.center.x;
    const b = this.center.y;

    // Ax^2 + Bxy + Cy^2 + Dx + Ey + F = 0
    const A = 1;
    const B = 0;
    const C = 1;
    const D = -2 * a;
    const E = -2 * b;
    const F = a * a + b * b - this.radius * this.radius;

    return Matrix3.rowMajor(
      A, B / 2, D / 2,
      B / 2, C, E / 2,
      D / 2, E / 2, F
    );
  }

  /**
   * Returns an Arc from the serialized representation.
   */
  public static override deserialize( obj: SerializedArc ): Arc {
    assert && assert( obj.type === 'Arc' );

    return new Arc( new Vector2( obj.centerX, obj.centerY ), obj.radius, obj.startAngle, obj.endAngle, obj.anticlockwise );
  }

  /**
   * Determines the actual end angle (compared to the start angle).
   *
   * Normalizes the sign of the angles, so that the sign of ( endAngle - startAngle ) matches whether it is
   * anticlockwise.
   */
  public static computeActualEndAngle( startAngle: number, endAngle: number, anticlockwise: boolean ): number {
    if ( anticlockwise ) {
      // angle is 'decreasing'
      // -2pi <= end - start < 2pi
      if ( startAngle > endAngle ) {
        return endAngle;
      }
      else if ( startAngle < endAngle ) {
        return endAngle - 2 * Math.PI;
      }
      else {
        // equal
        return startAngle;
      }
    }
    else {
      // angle is 'increasing'
      // -2pi < end - start <= 2pi
      if ( startAngle < endAngle ) {
        return endAngle;
      }
      else if ( startAngle > endAngle ) {
        return endAngle + Math.PI * 2;
      }
      else {
        // equal
        return startAngle;
      }
    }
  }

  /**
   * Computes the potential overlap between [0,end1] and [start2,end2] (with t-values [0,1] and [tStart2,tEnd2]).
   *
   * @param end1 - Relative end angle of the first segment
   * @param start2 - Relative start angle of the second segment
   * @param end2 - Relative end angle of the second segment
   * @param tStart2 - The parametric value of the second segment's start
   * @param tEnd2 - The parametric value of the second segment's end
   */
  private static getPartialOverlap( end1: number, start2: number, end2: number, tStart2: number, tEnd2: number ): Overlap[] {
    assert && assert( end1 > 0 && end1 <= TWO_PI + 1e-10 );
    assert && assert( start2 >= 0 && start2 < TWO_PI + 1e-10 );
    assert && assert( end2 >= 0 && end2 <= TWO_PI + 1e-10 );
    assert && assert( tStart2 >= 0 && tStart2 <= 1 );
    assert && assert( tEnd2 >= 0 && tEnd2 <= 1 );

    const reversed2 = end2 < start2;
    const min2 = reversed2 ? end2 : start2;
    const max2 = reversed2 ? start2 : end2;

    const overlapMin = min2;
    const overlapMax = Math.min( end1, max2 );

    // If there's not a small amount of overlap
    if ( overlapMax < overlapMin + 1e-8 ) {
      return [];
    }
    else {
      return [ Overlap.createLinear(
        // minimum
        clamp( linear( 0, end1, 0, 1, overlapMin ), 0, 1 ), // arc1 min
        clamp( linear( start2, end2, tStart2, tEnd2, overlapMin ), 0, 1 ), // arc2 min
        // maximum
        clamp( linear( 0, end1, 0, 1, overlapMax ), 0, 1 ), // arc1 max
        clamp( linear( start2, end2, tStart2, tEnd2, overlapMax ), 0, 1 ) // arc2 max
      ) ];
    }
  }

  /**
   * Determine whether two Arcs overlap over continuous sections, and if so finds the a,b pairs such that
   * p( t ) === q( a * t + b ).
   *
   * @param startAngle1 - Start angle of arc 1
   * @param endAngle1 - "Actual" end angle of arc 1
   * @param startAngle2 - Start angle of arc 2
   * @param endAngle2 - "Actual" end angle of arc 2
   * @returns - Any overlaps (from 0 to 2)
   */
  public static getAngularOverlaps( startAngle1: number, endAngle1: number, startAngle2: number, endAngle2: number ): Overlap[] {
    assert && assert( isFinite( startAngle1 ) );
    assert && assert( isFinite( endAngle1 ) );
    assert && assert( isFinite( startAngle2 ) );
    assert && assert( isFinite( endAngle2 ) );

    // Remap start of arc 1 to 0, and the end to be positive (sign1 )
    let end1 = endAngle1 - startAngle1;
    const sign1 = end1 < 0 ? -1 : 1;
    end1 *= sign1;

    // Remap arc 2 so the start point maps to the [0,2pi) range (and end-point may lie outside that)
    const start2 = moduloBetweenDown( sign1 * ( startAngle2 - startAngle1 ), 0, TWO_PI );
    const end2 = sign1 * ( endAngle2 - startAngle2 ) + start2;

    let wrapT;
    if ( end2 < -1e-10 ) {
      wrapT = -start2 / ( end2 - start2 );
      return Arc.getPartialOverlap( end1, start2, 0, 0, wrapT ).concat( Arc.getPartialOverlap( end1, TWO_PI, end2 + TWO_PI, wrapT, 1 ) );
    }
    else if ( end2 > TWO_PI + 1e-10 ) {
      wrapT = ( TWO_PI - start2 ) / ( end2 - start2 );
      return Arc.getPartialOverlap( end1, start2, TWO_PI, 0, wrapT ).concat( Arc.getPartialOverlap( end1, 0, end2 - TWO_PI, wrapT, 1 ) );
    }
    else {
      return Arc.getPartialOverlap( end1, start2, end2, 0, 1 );
    }
  }

  /**
   * Determine whether two Arcs overlap over continuous sections, and if so finds the a,b pairs such that
   * p( t ) === q( a * t + b ).
   *
   * @returns - Any overlaps (from 0 to 2)
   */
  public static getOverlaps( arc1: Arc, arc2: Arc ): Overlap[] {

    if ( arc1._center.distance( arc2._center ) > 1e-4 || Math.abs( arc1._radius - arc2._radius ) > 1e-4 ) {
      return [];
    }

    return Arc.getAngularOverlaps( arc1._startAngle, arc1.getActualEndAngle(), arc2._startAngle, arc2.getActualEndAngle() );
  }

  /**
   * Returns the points of intersections between two circles.
   *
   * @param center1 - Center of the first circle
   * @param radius1 - Radius of the first circle
   * @param center2 - Center of the second circle
   * @param radius2 - Radius of the second circle
   */
  public static getCircleIntersectionPoint( center1: Vector2, radius1: number, center2: Vector2, radius2: number ): Vector2[] {
    assert && assert( isFinite( radius1 ) && radius1 >= 0 );
    assert && assert( isFinite( radius2 ) && radius2 >= 0 );

    const delta = center2.minus( center1 );
    const d = delta.magnitude;
    let results: Vector2[] = [];
    if ( d < 1e-10 || d > radius1 + radius2 + 1e-10 ) {
      // No intersections
    }
    else if ( d > radius1 + radius2 - 1e-10 ) {
      results = [
        center1.blend( center2, radius1 / d )
      ];
    }
    else {
      const xPrime = 0.5 * ( d * d - radius2 * radius2 + radius1 * radius1 ) / d;
      const bit = d * d - radius2 * radius2 + radius1 * radius1;
      const discriminant = 4 * d * d * radius1 * radius1 - bit * bit;
      const base = center1.blend( center2, xPrime / d );
      if ( discriminant >= 1e-10 ) {
        const yPrime = Math.sqrt( discriminant ) / d / 2;
        const perpendicular = delta.perpendicular.setMagnitude( yPrime );
        results = [
          base.plus( perpendicular ),
          base.minus( perpendicular )
        ];
      }
      else if ( discriminant > -1e-10 ) {
        results = [ base ];
      }
    }
    if ( assert ) {
      results.forEach( result => {
        assert!( Math.abs( result.distance( center1 ) - radius1 ) < 1e-8 );
        assert!( Math.abs( result.distance( center2 ) - radius2 ) < 1e-8 );
      } );
    }
    return results;
  }

  /**
   * Returns any (finite) intersection between the two arc segments.
   */
  public static override intersect( a: Arc, b: Arc ): SegmentIntersection[] {
    const epsilon = 1e-7;

    const results = [];

    // If we effectively have the same circle, just different sections of it. The only finite intersections could be
    // at the endpoints, so we'll inspect those.
    if ( a._center.equalsEpsilon( b._center, epsilon ) && Math.abs( a._radius - b._radius ) < epsilon ) {
      const aStart = a.positionAt( 0 );
      const aEnd = a.positionAt( 1 );
      const bStart = b.positionAt( 0 );
      const bEnd = b.positionAt( 1 );

      if ( aStart.equalsEpsilon( bStart, epsilon ) ) {
        results.push( new SegmentIntersection( aStart.average( bStart ), 0, 0 ) );
      }
      if ( aStart.equalsEpsilon( bEnd, epsilon ) ) {
        results.push( new SegmentIntersection( aStart.average( bEnd ), 0, 1 ) );
      }
      if ( aEnd.equalsEpsilon( bStart, epsilon ) ) {
        results.push( new SegmentIntersection( aEnd.average( bStart ), 1, 0 ) );
      }
      if ( aEnd.equalsEpsilon( bEnd, epsilon ) ) {
        results.push( new SegmentIntersection( aEnd.average( bEnd ), 1, 1 ) );
      }
    }
    else {
      const points = Arc.getCircleIntersectionPoint( a._center, a._radius, b._center, b._radius );

      for ( let i = 0; i < points.length; i++ ) {
        const point = points[ i ];
        const angleA = point.minus( a._center ).angle;
        const angleB = point.minus( b._center ).angle;

        if ( a.containsAngle( angleA ) && b.containsAngle( angleB ) ) {
          results.push( new SegmentIntersection( point, a.tAtAngle( angleA ), b.tAtAngle( angleB ) ) );
        }
      }
    }

    return results;
  }

  /**
   * Creates an Arc (or if straight enough a Line) segment that goes from the startPoint to the endPoint, touching
   * the middlePoint somewhere between the two.
   */
  public static createFromPoints( startPoint: Vector2, middlePoint: Vector2, endPoint: Vector2 ): Segment {
    const center = circleCenterFromPoints( startPoint, middlePoint, endPoint );

    // Close enough
    if ( center === null ) {
      return new Line( startPoint, endPoint );
    }
    else {
      const startDiff = startPoint.minus( center );
      const middleDiff = middlePoint.minus( center );
      const endDiff = endPoint.minus( center );
      const startAngle = startDiff.angle;
      const middleAngle = middleDiff.angle;
      const endAngle = endDiff.angle;

      const radius = ( startDiff.magnitude + middleDiff.magnitude + endDiff.magnitude ) / 3;

      // Try anticlockwise first. TODO: Don't require creation of extra Arcs https://github.com/phetsims/kite/issues/76
      const arc = new Arc( center, radius, startAngle, endAngle, false );
      if ( arc.containsAngle( middleAngle ) ) {
        return arc;
      }
      else {
        return new Arc( center, radius, startAngle, endAngle, true );
      }
    }
  }
}

kite.register( 'Arc', Arc );

const unitCircleConicMatrix = Matrix3.rowMajor(
  1, 0, 0,
  0, 1, 0,
  0, 0, -1
);

export type SerializedEllipticalArc = {
  type: 'EllipticalArc';
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
};

/**
 * An elliptical arc (a continuous sub-part of an ellipse).
 *
 * Additional helpful notes:
 * - http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
 * - http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-ellipse
 *   (note: context.ellipse was removed from the Canvas spec)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
export class EllipticalArc extends Segment {

  private _center: Vector2;
  private _radiusX: number;
  private _radiusY: number;
  private _rotation: number;
  private _startAngle: number;
  private _endAngle: number;
  private _anticlockwise: boolean;

  // Lazily-computed derived information
  private _unitTransform!: Transform3 | null; // Mapping between our ellipse and a unit circle
  private _start!: Vector2 | null;
  private _end!: Vector2 | null;
  private _startTangent!: Vector2 | null;
  private _endTangent!: Vector2 | null;
  private _actualEndAngle!: number | null; // End angle in relation to our start angle (can get remapped)
  private _isFullPerimeter!: boolean | null; // Whether it's a full ellipse (and not just an arc)
  private _angleDifference!: number | null;
  private _unitArcSegment!: Arc | null; // Corresponding circular arc for our unit transform.
  private _bounds!: Bounds2 | null;
  private _svgPathFragment!: string | null;

  private possibleExtremaAngles?: number[];

  /**
   * If the startAngle/endAngle difference is ~2pi, this will be a full ellipse
   *
   * @param center - Center of the ellipse
   * @param radiusX - Semi-major radius
   * @param radiusY - Semi-minor radius
   * @param rotation - Rotation of the semi-major axis
   * @param startAngle - Angle (radians) of the start of the arc
   * @param endAngle - Angle (radians) of the end of the arc
   * @param anticlockwise - Decides which direction the arc takes around the center
   */
  public constructor( center: Vector2, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise: boolean ) {
    super();

    this._center = center;
    this._radiusX = radiusX;
    this._radiusY = radiusY;
    this._rotation = rotation;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;

    this.invalidate();
  }

  /**
   * Sets the center of the EllipticalArc.
   */
  public setCenter( center: Vector2 ): this {
    assert && assert( center.isFinite(), `EllipticalArc center should be finite: ${center.toString()}` );

    if ( !this._center.equals( center ) ) {
      this._center = center;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set center( value: Vector2 ) { this.setCenter( value ); }

  public get center(): Vector2 { return this.getCenter(); }


  /**
   * Returns the center of this EllipticalArc.
   */
  public getCenter(): Vector2 {
    return this._center;
  }


  /**
   * Sets the semi-major radius of the EllipticalArc.
   */
  public setRadiusX( radiusX: number ): this {
    assert && assert( isFinite( radiusX ), `EllipticalArc radiusX should be a finite number: ${radiusX}` );

    if ( this._radiusX !== radiusX ) {
      this._radiusX = radiusX;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set radiusX( value: number ) { this.setRadiusX( value ); }

  public get radiusX(): number { return this.getRadiusX(); }


  /**
   * Returns the semi-major radius of this EllipticalArc.
   */
  public getRadiusX(): number {
    return this._radiusX;
  }


  /**
   * Sets the semi-minor radius of the EllipticalArc.
   */
  public setRadiusY( radiusY: number ): this {
    assert && assert( isFinite( radiusY ), `EllipticalArc radiusY should be a finite number: ${radiusY}` );

    if ( this._radiusY !== radiusY ) {
      this._radiusY = radiusY;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set radiusY( value: number ) { this.setRadiusY( value ); }

  public get radiusY(): number { return this.getRadiusY(); }

  /**
   * Returns the semi-minor radius of this EllipticalArc.
   */
  public getRadiusY(): number {
    return this._radiusY;
  }


  /**
   * Sets the rotation of the EllipticalArc.
   */
  public setRotation( rotation: number ): this {
    assert && assert( isFinite( rotation ), `EllipticalArc rotation should be a finite number: ${rotation}` );

    if ( this._rotation !== rotation ) {
      this._rotation = rotation;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set rotation( value: number ) { this.setRotation( value ); }

  public get rotation(): number { return this.getRotation(); }

  /**
   * Returns the rotation of this EllipticalArc.
   */
  public getRotation(): number {
    return this._rotation;
  }


  /**
   * Sets the startAngle of the EllipticalArc.
   */
  public setStartAngle( startAngle: number ): this {
    assert && assert( isFinite( startAngle ), `EllipticalArc startAngle should be a finite number: ${startAngle}` );

    if ( this._startAngle !== startAngle ) {
      this._startAngle = startAngle;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set startAngle( value: number ) { this.setStartAngle( value ); }

  public get startAngle(): number { return this.getStartAngle(); }

  /**
   * Returns the startAngle of this EllipticalArc.
   */
  public getStartAngle(): number {
    return this._startAngle;
  }


  /**
   * Sets the endAngle of the EllipticalArc.
   */
  public setEndAngle( endAngle: number ): this {
    assert && assert( isFinite( endAngle ), `EllipticalArc endAngle should be a finite number: ${endAngle}` );

    if ( this._endAngle !== endAngle ) {
      this._endAngle = endAngle;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set endAngle( value: number ) { this.setEndAngle( value ); }

  public get endAngle(): number { return this.getEndAngle(); }

  /**
   * Returns the endAngle of this EllipticalArc.
   */
  public getEndAngle(): number {
    return this._endAngle;
  }


  /**
   * Sets the anticlockwise of the EllipticalArc.
   */
  public setAnticlockwise( anticlockwise: boolean ): this {
    if ( this._anticlockwise !== anticlockwise ) {
      this._anticlockwise = anticlockwise;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set anticlockwise( value: boolean ) { this.setAnticlockwise( value ); }

  public get anticlockwise(): boolean { return this.getAnticlockwise(); }

  /**
   * Returns the anticlockwise of this EllipticalArc.
   */
  public getAnticlockwise(): boolean {
    return this._anticlockwise;
  }


  /**
   * Returns the position parametrically, with 0 <= t <= 1.
   *
   * NOTE: positionAt( 0 ) will return the start of the segment, and positionAt( 1 ) will return the end of the
   * segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public positionAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'positionAt t should be non-negative' );
    assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

    return this.positionAtAngle( this.angleAt( t ) );
  }

  /**
   * Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
   *
   * NOTE: tangentAt( 0 ) will return the tangent at the start of the segment, and tangentAt( 1 ) will return the
   * tangent at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public tangentAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'tangentAt t should be non-negative' );
    assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

    return this.tangentAtAngle( this.angleAt( t ) );
  }

  /**
   * Returns the signed curvature of the segment at the parametric value t, where 0 <= t <= 1.
   *
   * The curvature will be positive for visual clockwise / mathematical counterclockwise curves, negative for opposite
   * curvature, and 0 for no curvature.
   *
   * NOTE: curvatureAt( 0 ) will return the curvature at the start of the segment, and curvatureAt( 1 ) will return
   * the curvature at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public curvatureAt( t: number ): number {
    assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
    assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

    // see http://mathworld.wolfram.com/Ellipse.html (59)
    const angle = this.angleAt( t );
    const aq = this._radiusX * Math.sin( angle );
    const bq = this._radiusY * Math.cos( angle );
    const denominator = Math.pow( bq * bq + aq * aq, 3 / 2 );
    return ( this._anticlockwise ? -1 : 1 ) * this._radiusX * this._radiusY / denominator;
  }

  /**
   * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
   * up the same shape as the current segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public subdivided( t: number ): EllipticalArc[] {
    assert && assert( t >= 0, 'subdivided t should be non-negative' );
    assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

    // If t is 0 or 1, we only need to return 1 segment
    if ( t === 0 || t === 1 ) {
      return [ this ];
    }

    // TODO: verify that we don't need to switch anticlockwise here, or subtract 2pi off any angles https://github.com/phetsims/kite/issues/76
    const angle0 = this.angleAt( 0 );
    const angleT = this.angleAt( t );
    const angle1 = this.angleAt( 1 );
    return [
      new EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angle0, angleT, this._anticlockwise ),
      new EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angleT, angle1, this._anticlockwise )
    ];
  }

  /**
   * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   */
  public invalidate(): void {

    assert && assert( this._center instanceof Vector2, 'Arc center should be a Vector2' );
    assert && assert( this._center.isFinite(), 'Arc center should be finite (not NaN or infinite)' );
    assert && assert( typeof this._radiusX === 'number', `Arc radiusX should be a number: ${this._radiusX}` );
    assert && assert( isFinite( this._radiusX ), `Arc radiusX should be a finite number: ${this._radiusX}` );
    assert && assert( typeof this._radiusY === 'number', `Arc radiusY should be a number: ${this._radiusY}` );
    assert && assert( isFinite( this._radiusY ), `Arc radiusY should be a finite number: ${this._radiusY}` );
    assert && assert( typeof this._rotation === 'number', `Arc rotation should be a number: ${this._rotation}` );
    assert && assert( isFinite( this._rotation ), `Arc rotation should be a finite number: ${this._rotation}` );
    assert && assert( typeof this._startAngle === 'number', `Arc startAngle should be a number: ${this._startAngle}` );
    assert && assert( isFinite( this._startAngle ), `Arc startAngle should be a finite number: ${this._startAngle}` );
    assert && assert( typeof this._endAngle === 'number', `Arc endAngle should be a number: ${this._endAngle}` );
    assert && assert( isFinite( this._endAngle ), `Arc endAngle should be a finite number: ${this._endAngle}` );
    assert && assert( typeof this._anticlockwise === 'boolean', `Arc anticlockwise should be a boolean: ${this._anticlockwise}` );

    this._unitTransform = null;
    this._start = null;
    this._end = null;
    this._startTangent = null;
    this._endTangent = null;
    this._actualEndAngle = null;
    this._isFullPerimeter = null;
    this._angleDifference = null;
    this._unitArcSegment = null;
    this._bounds = null;
    this._svgPathFragment = null;

    // remapping of negative radii
    if ( this._radiusX < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      this._radiusX = -this._radiusX;
      this._startAngle = Math.PI - this._startAngle;
      this._endAngle = Math.PI - this._endAngle;
      this._anticlockwise = !this._anticlockwise;
    }
    if ( this._radiusY < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      this._radiusY = -this._radiusY;
      this._startAngle = -this._startAngle;
      this._endAngle = -this._endAngle;
      this._anticlockwise = !this._anticlockwise;
    }
    if ( this._radiusX < this._radiusY ) {
      // swap radiusX and radiusY internally for consistent Canvas / SVG output
      this._rotation += Math.PI / 2;
      this._startAngle -= Math.PI / 2;
      this._endAngle -= Math.PI / 2;

      // swap radiusX and radiusY
      const tmpR = this._radiusX;
      this._radiusX = this._radiusY;
      this._radiusY = tmpR;
    }

    if ( this._radiusX < this._radiusY ) {
      // TODO: check this https://github.com/phetsims/kite/issues/76
      throw new Error( 'Not verified to work if radiusX < radiusY' );
    }

    // constraints shared with Arc
    assert && assert( !( ( !this._anticlockwise && this._endAngle - this._startAngle <= -Math.PI * 2 ) ||
                         ( this._anticlockwise && this._startAngle - this._endAngle <= -Math.PI * 2 ) ),
      'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
    assert && assert( !( ( !this._anticlockwise && this._endAngle - this._startAngle > Math.PI * 2 ) ||
                         ( this._anticlockwise && this._startAngle - this._endAngle > Math.PI * 2 ) ),
      'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );

    this.invalidationEmitter.emit();
  }

  /**
   * Computes a transform that maps a unit circle into this ellipse's location.
   *
   * Helpful, since we can get the parametric position of our unit circle (at t), and then transform it with this
   * transform to get the ellipse's parametric position (at t).
   */
  public getUnitTransform(): Transform3 {
    if ( this._unitTransform === null ) {
      this._unitTransform = EllipticalArc.computeUnitTransform( this._center, this._radiusX, this._radiusY, this._rotation );
    }
    return this._unitTransform;
  }

  public get unitTransform(): Transform3 { return this.getUnitTransform(); }

  /**
   * Gets the start point of this ellipticalArc
   */
  public getStart(): Vector2 {
    if ( this._start === null ) {
      this._start = this.positionAtAngle( this._startAngle );
    }
    return this._start;
  }

  public get start(): Vector2 { return this.getStart(); }

  /**
   * Gets the end point of this ellipticalArc
   */
  public getEnd(): Vector2 {
    if ( this._end === null ) {
      this._end = this.positionAtAngle( this._endAngle );
    }
    return this._end;
  }

  public get end(): Vector2 { return this.getEnd(); }

  /**
   * Gets the tangent vector (normalized) to this ellipticalArc at the start, pointing in the direction of motion (from start to end)
   */
  public getStartTangent(): Vector2 {
    if ( this._startTangent === null ) {
      this._startTangent = this.tangentAtAngle( this._startAngle );
    }
    return this._startTangent;
  }

  public get startTangent(): Vector2 { return this.getStartTangent(); }

  /**
   * Gets the tangent vector (normalized) to this ellipticalArc at the end point, pointing in the direction of motion (from start to end)
   */
  public getEndTangent(): Vector2 {
    if ( this._endTangent === null ) {
      this._endTangent = this.tangentAtAngle( this._endAngle );
    }
    return this._endTangent;
  }

  public get endTangent(): Vector2 { return this.getEndTangent(); }

  /**
   * Gets the end angle in radians
   */
  public getActualEndAngle(): number {
    if ( this._actualEndAngle === null ) {
      this._actualEndAngle = Arc.computeActualEndAngle( this._startAngle, this._endAngle, this._anticlockwise );
    }
    return this._actualEndAngle;
  }

  public get actualEndAngle(): number { return this.getActualEndAngle(); }

  /**
   * Returns a boolean value that indicates if the arc wraps up by more than two Pi
   */
  public getIsFullPerimeter(): boolean {
    if ( this._isFullPerimeter === null ) {
      this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
    }
    return this._isFullPerimeter;
  }

  public get isFullPerimeter(): boolean { return this.getIsFullPerimeter(); }

  /**
   * Returns an angle difference that represents how "much" of the circle our arc covers
   *
   * The answer is always greater or equal to zero
   * The answer can exceed two Pi
   */
  public getAngleDifference(): number {
    if ( this._angleDifference === null ) {
      // compute an angle difference that represents how "much" of the circle our arc covers
      this._angleDifference = this._anticlockwise ? this._startAngle - this._endAngle : this._endAngle - this._startAngle;
      if ( this._angleDifference < 0 ) {
        this._angleDifference += Math.PI * 2;
      }
      assert && assert( this._angleDifference >= 0 ); // now it should always be zero or positive
    }
    return this._angleDifference;
  }

  public get angleDifference(): number { return this.getAngleDifference(); }

  /**
   * A unit arg segment that we can map to our ellipse. useful for hit testing and such.
   */
  public getUnitArcSegment(): Arc {
    if ( this._unitArcSegment === null ) {
      this._unitArcSegment = new Arc( Vector2.ZERO, 1, this._startAngle, this._endAngle, this._anticlockwise );
    }
    return this._unitArcSegment;
  }

  public get unitArcSegment(): Arc { return this.getUnitArcSegment(); }

  /**
   * Returns the bounds of this segment.
   */
  public getBounds(): Bounds2 {
    if ( this._bounds === null ) {
      this._bounds = Bounds2.NOTHING.withPoint( this.getStart() )
        .withPoint( this.getEnd() );

      // if the angles are different, check extrema points
      if ( this._startAngle !== this._endAngle ) {
        // solve the mapping from the unit circle, find locations where a coordinate of the gradient is zero.
        // we find one extrema point for both x and y, since the other two are just rotated by pi from them.
        const xAngle = Math.atan( -( this._radiusY / this._radiusX ) * Math.tan( this._rotation ) );
        const yAngle = Math.atan( ( this._radiusY / this._radiusX ) / Math.tan( this._rotation ) );

        // check all of the extrema points
        this.possibleExtremaAngles = [
          xAngle,
          xAngle + Math.PI,
          yAngle,
          yAngle + Math.PI
        ];

        _.each( this.possibleExtremaAngles, this.includeBoundsAtAngle.bind( this ) );
      }
    }
    return this._bounds;
  }

  public get bounds(): Bounds2 { return this.getBounds(); }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   */
  public getNondegenerateSegments(): Segment[] {
    if ( this._radiusX <= 0 || this._radiusY <= 0 || this._startAngle === this._endAngle ) {
      return [];
    }
    else if ( this._radiusX === this._radiusY ) {
      // reduce to an Arc
      const startAngle = this._startAngle + this._rotation;
      let endAngle = this._endAngle + this._rotation;

      // preserve full circles
      if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
        endAngle = this._anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
      }
      return [ new Arc( this._center, this._radiusX, startAngle, endAngle, this._anticlockwise ) ];
    }
    else {
      return [ this ];
    }
  }

  /**
   * Attempts to expand the private _bounds bounding box to include a point at a specific angle, making sure that
   * angle is actually included in the arc. This will presumably be called at angles that are at critical points,
   * where the arc should have maximum/minimum x/y values.
   */
  private includeBoundsAtAngle( angle: number ): void {
    if ( this.unitArcSegment.containsAngle( angle ) ) {
      // the boundary point is in the arc
      this._bounds = this._bounds!.withPoint( this.positionAtAngle( angle ) );
    }
  }

  /**
   * Maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
   *
   * TODO: remove duplication with Arc https://github.com/phetsims/kite/issues/76
   */
  public mapAngle( angle: number ): number {
    if ( Math.abs( moduloBetweenDown( angle - this._startAngle, -Math.PI, Math.PI ) ) < 1e-8 ) {
      return this._startAngle;
    }
    if ( Math.abs( moduloBetweenDown( angle - this.getActualEndAngle(), -Math.PI, Math.PI ) ) < 1e-8 ) {
      return this.getActualEndAngle();
    }
    // consider an assert that we contain that angle?
    return ( this._startAngle > this.getActualEndAngle() ) ?
           moduloBetweenUp( angle, this._startAngle - 2 * Math.PI, this._startAngle ) :
           moduloBetweenDown( angle, this._startAngle, this._startAngle + 2 * Math.PI );
  }

  /**
   * Returns the parametrized value t for a given angle. The value t should range from 0 to 1 (inclusive).
   *
   * TODO: remove duplication with Arc https://github.com/phetsims/kite/issues/76
   */
  public tAtAngle( angle: number ): number {
    return ( this.mapAngle( angle ) - this._startAngle ) / ( this.getActualEndAngle() - this._startAngle );
  }

  /**
   * Returns the angle for the parametrized t value. The t value should range from 0 to 1 (inclusive).
   */
  public angleAt( t: number ): number {
    return this._startAngle + ( this.getActualEndAngle() - this._startAngle ) * t;
  }

  /**
   * Returns the position of this arc at angle.
   */
  public positionAtAngle( angle: number ): Vector2 {
    return this.getUnitTransform().transformPosition2( Vector2.createPolar( 1, angle ) );
  }

  /**
   * Returns the normalized tangent of this arc.
   * The tangent points outward (inward) of this arc for clockwise (anticlockwise) direction.
   */
  public tangentAtAngle( angle: number ): Vector2 {
    const normal = this.getUnitTransform().transformNormal2( Vector2.createPolar( 1, angle ) );

    return this._anticlockwise ? normal.perpendicular : normal.perpendicular.negated();
  }

  /**
   * Returns an array of straight lines that will draw an offset on the logical left (right) side for reverse false (true)
   * It discretizes the elliptical arc in 32 segments and returns an offset curve as a list of lineTos/
   *
   * @param r - distance
   * @param reverse
   */
  public offsetTo( r: number, reverse: boolean ): Line[] {
    // how many segments to create (possibly make this more adaptive?)
    const quantity = 32;

    const points = [];
    const result = [];
    for ( let i = 0; i < quantity; i++ ) {
      let ratio = i / ( quantity - 1 );
      if ( reverse ) {
        ratio = 1 - ratio;
      }
      const angle = this.angleAt( ratio );

      points.push( this.positionAtAngle( angle ).plus( this.tangentAtAngle( angle ).perpendicular.normalized().times( r ) ) );
      if ( i > 0 ) {
        result.push( new Line( points[ i - 1 ], points[ i ] ) );
      }
    }

    return result;
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided,
   * so anything that calls this needs to put the M calls first.
   */
  public getSVGPathFragment(): string {
    let oldPathFragment;
    if ( assert ) {
      oldPathFragment = this._svgPathFragment;
      this._svgPathFragment = null;
    }
    if ( !this._svgPathFragment ) {
      // see http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands for more info
      // rx ry x-axis-rotation large-arc-flag sweep-flag x y
      const epsilon = 0.01; // allow some leeway to render things as 'almost circles'
      const sweepFlag = this._anticlockwise ? '0' : '1';
      let largeArcFlag;
      const degreesRotation = toDegrees( this._rotation ); // bleh, degrees?
      if ( this.getAngleDifference() < Math.PI * 2 - epsilon ) {
        largeArcFlag = this.getAngleDifference() < Math.PI ? '0' : '1';
        this._svgPathFragment = `A ${svgNumber( this._radiusX )} ${svgNumber( this._radiusY )} ${degreesRotation
        } ${largeArcFlag} ${sweepFlag} ${svgNumber( this.getEnd().x )} ${svgNumber( this.getEnd().y )}`;
      }
      else {
        // ellipse (or almost-ellipse) case needs to be handled differently
        // since SVG will not be able to draw (or know how to draw) the correct circle if we just have a start and end, we need to split it into two circular arcs

        // get the angle that is between and opposite of both of the points
        const splitOppositeAngle = ( this._startAngle + this._endAngle ) / 2; // this _should_ work for the modular case?
        const splitPoint = this.positionAtAngle( splitOppositeAngle );

        largeArcFlag = '0'; // since we split it in 2, it's always the small arc

        const firstArc = `A ${svgNumber( this._radiusX )} ${svgNumber( this._radiusY )} ${
          degreesRotation} ${largeArcFlag} ${sweepFlag} ${
          svgNumber( splitPoint.x )} ${svgNumber( splitPoint.y )}`;
        const secondArc = `A ${svgNumber( this._radiusX )} ${svgNumber( this._radiusY )} ${
          degreesRotation} ${largeArcFlag} ${sweepFlag} ${
          svgNumber( this.getEnd().x )} ${svgNumber( this.getEnd().y )}`;

        this._svgPathFragment = `${firstArc} ${secondArc}`;
      }
    }
    if ( assert ) {
      if ( oldPathFragment ) {
        assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
      }
    }
    return this._svgPathFragment;
  }

  /**
   * Returns an array of straight lines  that will draw an offset on the logical left side.
   */
  public strokeLeft( lineWidth: number ): Line[] {
    return this.offsetTo( -lineWidth / 2, false );
  }

  /**
   * Returns an array of straight lines that will draw an offset curve on the logical right side.
   */
  public strokeRight( lineWidth: number ): Line[] {
    return this.offsetTo( lineWidth / 2, true );
  }

  /**
   * Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   * Does not include t=0 and t=1.
   */
  public getInteriorExtremaTs(): number[] {
    const result: number[] = [];
    _.each( this.possibleExtremaAngles, ( angle: number ) => {
      if ( this.unitArcSegment.containsAngle( angle ) ) {
        const t = this.tAtAngle( angle );
        const epsilon = 0.0000000001; // TODO: general kite epsilon? https://github.com/phetsims/kite/issues/76
        if ( t > epsilon && t < 1 - epsilon ) {
          result.push( t );
        }
      }
    } );
    return result.sort(); // modifies original, which is OK
  }

  /**
   * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
   * For details, see the documentation in Segment.js
   */
  public intersection( ray: Ray2 ): RayIntersection[] {
    // be lazy. transform it into the space of a non-elliptical arc.
    const unitTransform = this.getUnitTransform();
    const rayInUnitCircleSpace = unitTransform.inverseRay2( ray );
    const hits = this.getUnitArcSegment().intersection( rayInUnitCircleSpace );

    return _.map( hits, hit => {
      const transformedPoint = unitTransform.transformPosition2( hit.point );
      const distance = ray.position.distance( transformedPoint );
      const normal = unitTransform.inverseNormal2( hit.normal );
      return new RayIntersection( distance, transformedPoint, normal, hit.wind, hit.t );
    } );
  }

  /**
   * Returns the resultant winding number of this ray intersecting this arc.
   */
  public windingIntersection( ray: Ray2 ): number {
    // be lazy. transform it into the space of a non-elliptical arc.
    const rayInUnitCircleSpace = this.getUnitTransform().inverseRay2( ray );
    return this.getUnitArcSegment().windingIntersection( rayInUnitCircleSpace );
  }

  /**
   * Draws this arc to the 2D Canvas context, assuming the context's current location is already at the start point
   */
  public writeToContext( context: CanvasRenderingContext2D ): void {
    if ( context.ellipse ) {
      context.ellipse( this._center.x, this._center.y, this._radiusX, this._radiusY, this._rotation, this._startAngle, this._endAngle, this._anticlockwise );
    }
    else {
      // fake the ellipse call by using transforms
      this.getUnitTransform().getMatrix().canvasAppendTransform( context );
      context.arc( 0, 0, 1, this._startAngle, this._endAngle, this._anticlockwise );
      this.getUnitTransform().getInverse().canvasAppendTransform( context );
    }
  }

  /**
   * Returns this elliptical arc transformed by a matrix
   */
  public transformed( matrix: Matrix3 ): EllipticalArc {
    const transformedSemiMajorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusX, this._rotation ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
    const transformedSemiMinorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusY, this._rotation + Math.PI / 2 ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
    const rotation = transformedSemiMajorAxis.angle;
    const radiusX = transformedSemiMajorAxis.magnitude;
    const radiusY = transformedSemiMinorAxis.magnitude;

    const reflected = matrix.getDeterminant() < 0;

    // reverse the 'clockwiseness' if our transform includes a reflection
    // TODO: check reflections. swapping angle signs should fix clockwiseness https://github.com/phetsims/kite/issues/76
    const anticlockwise = reflected ? !this._anticlockwise : this._anticlockwise;
    const startAngle = reflected ? -this._startAngle : this._startAngle;
    let endAngle = reflected ? -this._endAngle : this._endAngle;

    if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
      endAngle = anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
    }

    return new EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );
  }

  /**
   * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
   *
   * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
   */
  public getSignedAreaFragment(): number {
    const t0 = this._startAngle;
    const t1 = this.getActualEndAngle();

    const sin0 = Math.sin( t0 );
    const sin1 = Math.sin( t1 );
    const cos0 = Math.cos( t0 );
    const cos1 = Math.cos( t1 );

    // Derived via Mathematica (curve-area.nb)
    return 0.5 * ( this._radiusX * this._radiusY * ( t1 - t0 ) +
                   Math.cos( this._rotation ) * ( this._radiusX * this._center.y * ( cos0 - cos1 ) +
                   this._radiusY * this._center.x * ( sin1 - sin0 ) ) +
                   Math.sin( this._rotation ) * ( this._radiusX * this._center.x * ( cos1 - cos0 ) +
                   this._radiusY * this._center.y * ( sin1 - sin0 ) ) );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   */
  public reversed(): EllipticalArc {
    return new EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, this._endAngle, this._startAngle, !this._anticlockwise );
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedEllipticalArc {
    return {
      type: 'EllipticalArc',
      centerX: this._center.x,
      centerY: this._center.y,
      radiusX: this._radiusX,
      radiusY: this._radiusY,
      rotation: this._rotation,
      startAngle: this._startAngle,
      endAngle: this._endAngle,
      anticlockwise: this._anticlockwise
    };
  }

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * @param segment
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public getOverlaps( segment: Segment, epsilon = 1e-6 ): Overlap[] | null {
    if ( segment instanceof EllipticalArc ) {
      return EllipticalArc.getOverlaps( this, segment );
    }

    return null;
  }

  /**
   * Returns the matrix representation of the conic section of the ellipse.
   * See https://en.wikipedia.org/wiki/Matrix_representation_of_conic_sections
   */
  public getConicMatrix(): Matrix3 {
    // Ax^2 + Bxy + Cy^2 + Dx + Ey + F = 0

    // x'^2 + y'^2 = 1      ---- our unit circle
    // (x,y,1) = M * (x',y',1)   ---- our transform matrix
    // C = [ 1, 0, 0, 0, 1, 0, 0, 0, -1 ] --- conic matrix for the unit circle

    // (x',y',1)^T * C * (x',y',1) = 0  --- conic matrix equation for our unit circle
    // ( M^-1 * (x,y,1) )^T * C * M^-1 * (x,y,1) = 0 --- substitute in our transform matrix
    // (x,y,1)^T * ( M^-1^T * C * M^-1 ) * (x,y,1) = 0 --- isolate conic matrix for our ellipse

    // ( M^-1^T * C * M^-1 ) is the conic matrix for our ellipse
    const unitMatrix = EllipticalArc.computeUnitMatrix( this._center, this._radiusX, this._radiusY, this._rotation );
    const invertedUnitMatrix = unitMatrix.inverted();
    return invertedUnitMatrix.transposed().multiplyMatrix( unitCircleConicMatrix ).multiplyMatrix( invertedUnitMatrix );
  }

  /**
   * Returns an EllipticalArc from the serialized representation.
   */
  public static override deserialize( obj: SerializedEllipticalArc ): EllipticalArc {
    assert && assert( obj.type === 'EllipticalArc' );

    return new EllipticalArc( new Vector2( obj.centerX, obj.centerY ), obj.radiusX, obj.radiusY, obj.rotation, obj.startAngle, obj.endAngle, obj.anticlockwise );
  }

  /**
   * Returns what type of overlap is possible based on the center/radii/rotation. We ignore the start/end angles and
   * anticlockwise information, and determine if the FULL ellipses overlap.
   */
  public static getOverlapType( a: EllipticalArc, b: EllipticalArc, epsilon = 1e-4 ): EllipticalArcOverlapType {

    // Different centers can't overlap continuously
    if ( a._center.distance( b._center ) < epsilon ) {

      const matchingRadii = Math.abs( a._radiusX - b._radiusX ) < epsilon && Math.abs( a._radiusY - b._radiusY ) < epsilon;
      const oppositeRadii = Math.abs( a._radiusX - b._radiusY ) < epsilon && Math.abs( a._radiusY - b._radiusX ) < epsilon;

      if ( matchingRadii ) {
        // Difference between rotations should be an approximate multiple of pi. We add pi/2 before modulo, so the
        // result of that should be ~pi/2 (don't need to check both endpoints)
        if ( Math.abs( moduloBetweenDown( a._rotation - b._rotation + Math.PI / 2, 0, Math.PI ) - Math.PI / 2 ) < epsilon ) {
          return EllipticalArcOverlapType.MATCHING_OVERLAP;
        }
      }
      if ( oppositeRadii ) {
        // Difference between rotations should be an approximate multiple of pi (with pi/2 added).
        if ( Math.abs( moduloBetweenDown( a._rotation - b._rotation, 0, Math.PI ) - Math.PI / 2 ) < epsilon ) {
          return EllipticalArcOverlapType.OPPOSITE_OVERLAP;
        }
      }
    }

    return EllipticalArcOverlapType.NONE;
  }

  /**
   * Determine whether two elliptical arcs overlap over continuous sections, and if so finds the a,b pairs such that
   * p( t ) === q( a * t + b ).
   *
   * @returns - Any overlaps (from 0 to 2)
   */
  public static getOverlaps( a: EllipticalArc, b: EllipticalArc ): Overlap[] {

    const overlapType = EllipticalArc.getOverlapType( a, b );

    if ( overlapType === EllipticalArcOverlapType.NONE ) {
      return [];
    }
    else {
      return Arc.getAngularOverlaps( a._startAngle + a._rotation, a.getActualEndAngle() + a._rotation,
        b._startAngle + b._rotation, b.getActualEndAngle() + b._rotation );
    }
  }

  /**
   * Returns any (finite) intersection between the two elliptical arc segments.
   */
  public static override intersect( a: EllipticalArc, b: EllipticalArc, epsilon = 1e-10 ): SegmentIntersection[] {

    const overlapType = EllipticalArc.getOverlapType( a, b, epsilon );

    if ( overlapType === EllipticalArcOverlapType.NONE ) {
      return BoundsIntersection.intersect( a, b );
    }
    else {
      // If we effectively have the same ellipse, just different sections of it. The only finite intersections could be
      // at the endpoints, so we'll inspect those.

      const results = [];
      const aStart = a.positionAt( 0 );
      const aEnd = a.positionAt( 1 );
      const bStart = b.positionAt( 0 );
      const bEnd = b.positionAt( 1 );

      if ( aStart.equalsEpsilon( bStart, epsilon ) ) {
        results.push( new SegmentIntersection( aStart.average( bStart ), 0, 0 ) );
      }
      if ( aStart.equalsEpsilon( bEnd, epsilon ) ) {
        results.push( new SegmentIntersection( aStart.average( bEnd ), 0, 1 ) );
      }
      if ( aEnd.equalsEpsilon( bStart, epsilon ) ) {
        results.push( new SegmentIntersection( aEnd.average( bStart ), 1, 0 ) );
      }
      if ( aEnd.equalsEpsilon( bEnd, epsilon ) ) {
        results.push( new SegmentIntersection( aEnd.average( bEnd ), 1, 1 ) );
      }

      return results;
    }
  }

  /**
   * Matrix that transforms the unit circle into our ellipse
   */
  public static computeUnitMatrix( center: Vector2, radiusX: number, radiusY: number, rotation: number ): Matrix3 {
    return Matrix3.translationFromVector( center )
      .timesMatrix( Matrix3.rotation2( rotation ) )
      .timesMatrix( Matrix3.scaling( radiusX, radiusY ) );
  }

  /**
   * Transforms the unit circle into our ellipse.
   *
   * adapted from http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
   */
  public static computeUnitTransform( center: Vector2, radiusX: number, radiusY: number, rotation: number ): Transform3 {
    return new Transform3( EllipticalArc.computeUnitMatrix( center, radiusX, radiusY, rotation ) );
  }
}

export class EllipticalArcOverlapType extends EnumerationValue {
  // radiusX of one equals radiusX of the other, with equivalent centers and rotations to work
  public static readonly MATCHING_OVERLAP = new EllipticalArcOverlapType();

  // radiusX of one equals radiusY of the other, with equivalent centers and rotations to work
  public static readonly OPPOSITE_OVERLAP = new EllipticalArcOverlapType();

  // no overlap
  public static readonly NONE = new EllipticalArcOverlapType();

  public static readonly enumeration = new Enumeration( EllipticalArcOverlapType );
}

kite.register( 'EllipticalArc', EllipticalArc );

export type SerializedLine = {
  type: 'Line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

/**
 * A line segment (all points directly between the start and end point)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
export class Line extends Segment {

  private _start: Vector2;
  private _end: Vector2;

  private _tangent!: Vector2 | null;
  private _bounds!: Bounds2 | null;
  private _svgPathFragment!: string | null;

  /**
   * @param start - Start point
   * @param end - End point
   */
  public constructor( start: Vector2, end: Vector2 ) {
    super();

    this._start = start;
    this._end = end;

    this.invalidate();
  }

  /**
   * Sets the start point of the Line.
   */
  public setStart( start: Vector2 ): this {
    assert && assert( start.isFinite(), `Line start should be finite: ${start.toString()}` );

    if ( !this._start.equals( start ) ) {
      this._start = start;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set start( value: Vector2 ) { this.setStart( value ); }

  public get start(): Vector2 { return this.getStart(); }

  /**
   * Returns the start of this Line.
   */
  public getStart(): Vector2 {
    return this._start;
  }


  /**
   * Sets the end point of the Line.
   */
  public setEnd( end: Vector2 ): this {
    assert && assert( end.isFinite(), `Line end should be finite: ${end.toString()}` );

    if ( !this._end.equals( end ) ) {
      this._end = end;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set end( value: Vector2 ) { this.setEnd( value ); }

  public get end(): Vector2 { return this.getEnd(); }

  /**
   * Returns the end of this Line.
   */
  public getEnd(): Vector2 {
    return this._end;
  }


  /**
   * Returns the position parametrically, with 0 <= t <= 1.
   *
   * NOTE: positionAt( 0 ) will return the start of the segment, and positionAt( 1 ) will return the end of the
   * segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public positionAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'positionAt t should be non-negative' );
    assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

    return this._start.plus( this._end.minus( this._start ).times( t ) );
  }

  /**
   * Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
   *
   * NOTE: tangentAt( 0 ) will return the tangent at the start of the segment, and tangentAt( 1 ) will return the
   * tangent at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public tangentAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'tangentAt t should be non-negative' );
    assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

    // tangent always the same, just use the start tangent
    return this.getStartTangent();
  }

  /**
   * Returns the signed curvature of the segment at the parametric value t, where 0 <= t <= 1.
   *
   * The curvature will be positive for visual clockwise / mathematical counterclockwise curves, negative for opposite
   * curvature, and 0 for no curvature.
   *
   * NOTE: curvatureAt( 0 ) will return the curvature at the start of the segment, and curvatureAt( 1 ) will return
   * the curvature at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public curvatureAt( t: number ): number {
    assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
    assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

    return 0; // no curvature on a straight line segment
  }

  /**
   * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
   * up the same shape as the current segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public subdivided( t: number ): Segment[] {
    assert && assert( t >= 0, 'subdivided t should be non-negative' );
    assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

    // If t is 0 or 1, we only need to return 1 segment
    if ( t === 0 || t === 1 ) {
      return [ this ];
    }

    const pt = this.positionAt( t );
    return [
      new Line( this._start, pt ),
      new Line( pt, this._end )
    ];
  }

  /**
   * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   */
  public invalidate(): void {
    assert && assert( this._start instanceof Vector2, `Line start should be a Vector2: ${this._start}` );
    assert && assert( this._start.isFinite(), `Line start should be finite: ${this._start.toString()}` );
    assert && assert( this._end instanceof Vector2, `Line end should be a Vector2: ${this._end}` );
    assert && assert( this._end.isFinite(), `Line end should be finite: ${this._end.toString()}` );

    // Lazily-computed derived information
    this._tangent = null;
    this._bounds = null;
    this._svgPathFragment = null;

    this.invalidationEmitter.emit();
  }

  /**
   * Returns a normalized unit vector that is tangent to this line (at the starting point)
   * the unit vectors points toward the end points.
   */
  public getStartTangent(): Vector2 {
    if ( this._tangent === null ) {
      // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
      this._tangent = this._end.minus( this._start ).normalized();
    }
    return this._tangent;
  }

  public get startTangent(): Vector2 { return this.getStartTangent(); }

  /**
   * Returns the normalized unit vector that is tangent to this line
   * same as getStartTangent, since this is a straight line
   */
  public getEndTangent(): Vector2 {
    return this.getStartTangent();
  }

  public get endTangent(): Vector2 { return this.getEndTangent(); }

  /**
   * Returns the bounds of this segment.
   */
  public getBounds(): Bounds2 {
    // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
    if ( this._bounds === null ) {
      this._bounds = Bounds2.NOTHING.copy().addPoint( this._start ).addPoint( this._end );
    }
    return this._bounds;
  }

  public get bounds(): Bounds2 { return this.getBounds(); }

  /**
   * Returns the bounding box for this transformed Line
   */
  public override getBoundsWithTransform( matrix: Matrix3 ): Bounds2 {
    // uses mutable calls
    const bounds = Bounds2.NOTHING.copy();
    bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._start ) ) );
    bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._end ) ) );
    return bounds;
  }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   */
  public getNondegenerateSegments(): Segment[] {
    // if it is degenerate (0-length), just ignore it
    if ( this._start.equals( this._end ) ) {
      return [];
    }
    else {
      return [ this ];
    }
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided,
   * so anything that calls this needs to put the M calls first
   */
  public getSVGPathFragment(): string {
    let oldPathFragment;
    if ( assert ) {
      oldPathFragment = this._svgPathFragment;
      this._svgPathFragment = null;
    }
    if ( !this._svgPathFragment ) {
      this._svgPathFragment = `L ${svgNumber( this._end.x )} ${svgNumber( this._end.y )}`;
    }
    if ( assert ) {
      if ( oldPathFragment ) {
        assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
      }
    }
    return this._svgPathFragment;
  }

  /**
   * Returns an array of Line that will draw an offset curve on the logical left side
   */
  public strokeLeft( lineWidth: number ): Line[] {
    const offset = this.getEndTangent().perpendicular.negated().times( lineWidth / 2 );
    return [ new Line( this._start.plus( offset ), this._end.plus( offset ) ) ];
  }

  /**
   * Returns an array of Line that will draw an offset curve on the logical right side
   */
  public strokeRight( lineWidth: number ): Line[] {
    const offset = this.getStartTangent().perpendicular.times( lineWidth / 2 );
    return [ new Line( this._end.plus( offset ), this._start.plus( offset ) ) ];
  }

  /**
   * In general, this method returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   * Since lines are already monotone, it returns an empty array.
   */
  public getInteriorExtremaTs(): number[] { return []; }

  /**
   * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
   * For details, see the documentation in Segment.js
   */
  public intersection( ray: Ray2 ): RayIntersection[] {
    // We solve for the parametric line-line intersection, and then ensure the parameters are within both
    // the line segment and forwards from the ray.

    const result: RayIntersection[] = [];

    const start = this._start;
    const end = this._end;

    const diff = end.minus( start );

    if ( diff.magnitudeSquared === 0 ) {
      return result;
    }

    const denom = ray.direction.y * diff.x - ray.direction.x * diff.y;

    // If denominator is 0, the lines are parallel or coincident
    if ( denom === 0 ) {
      return result;
    }

    // linear parameter where start (0) to end (1)
    const t = ( ray.direction.x * ( start.y - ray.position.y ) - ray.direction.y * ( start.x - ray.position.x ) ) / denom;

    // check that the intersection point is between the line segment's endpoints
    if ( t < 0 || t >= 1 ) {
      return result;
    }

    // linear parameter where ray.position (0) to ray.position+ray.direction (1)
    const s = ( diff.x * ( start.y - ray.position.y ) - diff.y * ( start.x - ray.position.x ) ) / denom;

    // bail if it is behind our ray
    if ( s < 0.00000001 ) {
      return result;
    }

    // return the proper winding direction depending on what way our line intersection is "pointed"
    const perp = diff.perpendicular;

    const intersectionPoint = start.plus( diff.times( t ) );
    const normal = ( perp.dot( ray.direction ) > 0 ? perp.negated() : perp ).normalized();
    const wind = ray.direction.perpendicular.dot( diff ) < 0 ? 1 : -1;
    result.push( new RayIntersection( s, intersectionPoint, normal, wind, t ) );
    return result;
  }

  /**
   * Returns the resultant winding number of a ray intersecting this line.
   */
  public windingIntersection( ray: Ray2 ): number {
    const hits = this.intersection( ray );
    if ( hits.length ) {
      return hits[ 0 ].wind;
    }
    else {
      return 0;
    }
  }

  /**
   * Draws this line to the 2D Canvas context, assuming the context's current location is already at the start point
   */
  public writeToContext( context: CanvasRenderingContext2D ): void {
    context.lineTo( this._end.x, this._end.y );
  }

  /**
   * Returns a new Line that represents this line after transformation by the matrix
   */
  public transformed( matrix: Matrix3 ): Line {
    return new Line( matrix.timesVector2( this._start ), matrix.timesVector2( this._end ) );
  }

  /**
   * Returns an object that gives information about the closest point (on a line segment) to the point argument
   */
  public explicitClosestToPoint( point: Vector2 ): ClosestToPointResult[] {
    const diff = this._end.minus( this._start );
    let t = point.minus( this._start ).dot( diff ) / diff.magnitudeSquared;
    t = clamp( t, 0, 1 );
    const closestPoint = this.positionAt( t );
    return [
      {
        segment: this,
        t: t,
        closestPoint: closestPoint,
        distanceSquared: point.distanceSquared( closestPoint )
      }
    ];
  }

  /**
   * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
   *
   * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
   */
  public getSignedAreaFragment(): number {
    return 1 / 2 * ( this._start.x * this._end.y - this._start.y * this._end.x );
  }

  /**
   * Given the current curve parameterized by t, will return a curve parameterized by x where t = a * x + b
   */
  public reparameterized( a: number, b: number ): Line {
    return new Line( this.positionAt( b ), this.positionAt( a + b ) );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   */
  public reversed(): Line {
    return new Line( this._end, this._start );
  }

  /**
   * Convert a line in the $(theta,r)$ plane of the form $(\theta_1,r_1)$ to $(\theta_2,r_2)$ and
   * converts to the cartesian coordinate system
   *
   * E.g. a polar line (0,1) to (2 Pi,1) would be mapped to a circle of radius 1
   */
  public polarToCartesian( options: PiecewiseLinearOptions ): Segment[] {
    // x represent an angle whereas y represent a radius
    if ( this._start.x === this._end.x ) {
      // angle is the same, we are still a line segment!
      return [ new Line( Vector2.createPolar( this._start.y, this._start.x ), Vector2.createPolar( this._end.y, this._end.x ) ) ];
    }
    else if ( this._start.y === this._end.y ) {
      // we have a constant radius, so we are a circular arc
      return [ new Arc( Vector2.ZERO, this._start.y, this._start.x, this._end.x, this._start.x > this._end.x ) ];
    }
    else {
      return this.toPiecewiseLinearSegments( options );
    }
  }

  /**
   * Returns the arc length of the segment.
   */
  public override getArcLength(): number {
    return this.start.distance( this.end );
  }

  /**
   * We can handle this simply by returning ourselves.
   */
  public override toPiecewiseLinearOrArcSegments(): Segment[] {
    return [ this ];
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedLine {
    return {
      type: 'Line',
      startX: this._start.x,
      startY: this._start.y,
      endX: this._end.x,
      endY: this._end.y
    };
  }

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * @param segment
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public getOverlaps( segment: Segment, epsilon = 1e-6 ): Overlap[] | null {
    if ( segment instanceof Line ) {
      return Line.getOverlaps( this, segment );
    }

    return null;
  }

  public override getClosestPoints( point: Vector2 ): ClosestToPointResult[] {
    // TODO: Can be simplified by getting the normalized direction vector, getting its perpendicular, and dotting with https://github.com/phetsims/kite/issues/98
    // TODO: the start or end point (should be the same result). https://github.com/phetsims/kite/issues/98
    // TODO: See LinearEdge.evaluateClosestDistanceToOrigin for details. https://github.com/phetsims/kite/issues/98

    const delta = this._end.minus( this._start );

    // Normalized start => end
    const normalizedDirection = delta.normalized();

    // Normalized distance along the line from the start to the point
    const intersectionNormalized = point.minus( this._start ).dot( normalizedDirection );

    const intersectionT = clamp( intersectionNormalized / delta.magnitude, 0, 1 );

    const intersectionPoint = this.positionAt( intersectionT );

    return [ {
      segment: this,
      t: intersectionT,
      closestPoint: intersectionPoint,
      distanceSquared: intersectionPoint.distanceSquared( point )
    } ];
  }

  /**
   * Returns a Line from the serialized representation.
   */
  public static override deserialize( obj: SerializedLine ): Line {
    assert && assert( obj.type === 'Line' );

    return new Line( new Vector2( obj.startX, obj.startY ), new Vector2( obj.endX, obj.endY ) );
  }

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * @param line1
   * @param line2
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public static getOverlaps( line1: Line, line2: Line, epsilon = 1e-6 ): Overlap[] {

    /*
     * NOTE: For implementation details in this function, please see Cubic.getOverlaps. It goes over all of the
     * same implementation details, but instead our bezier matrix is a 2x2:
     *
     * [  1  0 ]
     * [ -1  1 ]
     *
     * And we use the upper-left section of (at+b) adjustment matrix relevant for the line.
     */

    const noOverlap: Overlap[] = [];

    // Efficiently compute the multiplication of the bezier matrix:
    const p0x = line1._start.x;
    const p1x = -1 * line1._start.x + line1._end.x;
    const p0y = line1._start.y;
    const p1y = -1 * line1._start.y + line1._end.y;
    const q0x = line2._start.x;
    const q1x = -1 * line2._start.x + line2._end.x;
    const q0y = line2._start.y;
    const q1y = -1 * line2._start.y + line2._end.y;

    // Determine the candidate overlap (preferring the dimension with the largest variation)
    const xSpread = Math.abs( Math.max( line1._start.x, line1._end.x, line2._start.x, line2._end.x ) -
                              Math.min( line1._start.x, line1._end.x, line2._start.x, line2._end.x ) );
    const ySpread = Math.abs( Math.max( line1._start.y, line1._end.y, line2._start.y, line2._end.y ) -
                              Math.min( line1._start.y, line1._end.y, line2._start.y, line2._end.y ) );
    const xOverlap = Segment.polynomialGetOverlapLinear( p0x, p1x, q0x, q1x );
    const yOverlap = Segment.polynomialGetOverlapLinear( p0y, p1y, q0y, q1y );
    let overlap;
    if ( xSpread > ySpread ) {
      overlap = ( xOverlap === null || xOverlap === true ) ? yOverlap : xOverlap;
    }
    else {
      overlap = ( yOverlap === null || yOverlap === true ) ? xOverlap : yOverlap;
    }
    if ( overlap === null || overlap === true ) {
      return noOverlap; // No way to pin down an overlap
    }

    const a = overlap.a;
    const b = overlap.b;

    // Compute linear coefficients for the difference between p(t) and q(a*t+b)
    const d0x = q0x + b * q1x - p0x;
    const d1x = a * q1x - p1x;
    const d0y = q0y + b * q1y - p0y;
    const d1y = a * q1y - p1y;

    // Examine the single-coordinate distances between the "overlaps" at each extreme T value. If the distance is larger
    // than our epsilon, then the "overlap" would not be valid.
    if ( Math.abs( d0x ) > epsilon ||
         Math.abs( d1x + d0x ) > epsilon ||
         Math.abs( d0y ) > epsilon ||
         Math.abs( d1y + d0y ) > epsilon ) {
      // We're able to efficiently hardcode these for the line-line case, since there are no extreme t values that are
      // not t=0 or t=1.
      return noOverlap;
    }

    const qt0 = b;
    const qt1 = a + b;

    // TODO: do we want an epsilon in here to be permissive? https://github.com/phetsims/kite/issues/76
    if ( ( qt0 > 1 && qt1 > 1 ) || ( qt0 < 0 && qt1 < 0 ) ) {
      return noOverlap;
    }

    return [ new Overlap( a, b ) ];
  }

  /**
   * Returns any (finite) intersection between the two line segments.
   */
  public static override intersect( a: Line, b: Line ): SegmentIntersection[] {

    // TODO: look into numerically more accurate solutions? https://github.com/phetsims/kite/issues/98

    const intersection = lineSegmentIntersection(
      a.start.x, a.start.y, a.end.x, a.end.y,
      b.start.x, b.start.y, b.end.x, b.end.y
    );

    if ( intersection !== null ) {
      const aT = a.explicitClosestToPoint( intersection )[ 0 ].t;
      const bT = b.explicitClosestToPoint( intersection )[ 0 ].t;
      return [ new SegmentIntersection( intersection, aT, bT ) ];
    }
    else {
      return [];
    }
  }

  /**
   * Returns any intersections between a line segment and another type of segment.
   *
   * This should be more optimized than the general intersection routine of arbitrary segments.
   */
  public static intersectOther( line: Line, other: Segment ): SegmentIntersection[] {

    // Set up a ray
    const delta = line.end.minus( line.start );
    const length = delta.magnitude;
    const ray = new Ray2( line.start, delta.normalize() );

    // Find the other segment's intersections with the ray
    const rayIntersections = other.intersection( ray );

    const results = [];
    for ( let i = 0; i < rayIntersections.length; i++ ) {
      const rayIntersection = rayIntersections[ i ];
      const lineT = rayIntersection.distance / length;

      // Exclude intersections that are outside our line segment (or right on the boundary)
      if ( lineT > 1e-8 && lineT < 1 - 1e-8 ) {
        results.push( new SegmentIntersection( rayIntersection.point, lineT, rayIntersection.t ) );
      }
    }
    return results;
  }
}

kite.register( 'Line', Line );

export type SerializedQuadratic = {
  type: 'Quadratic';
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
};

/**
 * Quadratic Bezier segment
 *
 * Good reference: http://cagd.cs.byu.edu/~557/text/ch2.pdf
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
export class Quadratic extends Segment {

  private _start: Vector2;
  private _control: Vector2;
  private _end: Vector2;

  // Lazily-computed derived information
  private _startTangent!: Vector2 | null;
  private _endTangent!: Vector2 | null;
  private _tCriticalX!: number | null; // T where x-derivative is 0 (replaced with NaN if not in range)
  private _tCriticalY!: number | null; // T where y-derivative is 0 (replaced with NaN if not in range)
  private _bounds!: Bounds2 | null;
  private _svgPathFragment!: string | null;

  /**
   * @param start - Start point of the quadratic bezier
   * @param control - Control point (curve usually doesn't go through here)
   * @param end - End point of the quadratic bezier
   */
  public constructor( start: Vector2, control: Vector2, end: Vector2 ) {
    super();

    this._start = start;
    this._control = control;
    this._end = end;

    this.invalidate();
  }

  /**
   * Sets the start point of the Quadratic.
   */
  public setStart( start: Vector2 ): this {
    assert && assert( start.isFinite(), `Quadratic start should be finite: ${start.toString()}` );

    if ( !this._start.equals( start ) ) {
      this._start = start;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set start( value: Vector2 ) { this.setStart( value ); }

  public get start(): Vector2 { return this.getStart(); }

  /**
   * Returns the start of this Quadratic.
   */
  public getStart(): Vector2 {
    return this._start;
  }


  /**
   * Sets the control point of the Quadratic.
   */
  public setControl( control: Vector2 ): this {
    assert && assert( control.isFinite(), `Quadratic control should be finite: ${control.toString()}` );

    if ( !this._control.equals( control ) ) {
      this._control = control;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set control( value: Vector2 ) { this.setControl( value ); }

  public get control(): Vector2 { return this.getControl(); }

  /**
   * Returns the control point of this Quadratic.
   */
  public getControl(): Vector2 {
    return this._control;
  }


  /**
   * Sets the end point of the Quadratic.
   */
  public setEnd( end: Vector2 ): this {
    assert && assert( end.isFinite(), `Quadratic end should be finite: ${end.toString()}` );

    if ( !this._end.equals( end ) ) {
      this._end = end;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set end( value: Vector2 ) { this.setEnd( value ); }

  public get end(): Vector2 { return this.getEnd(); }

  /**
   * Returns the end of this Quadratic.
   */
  public getEnd(): Vector2 {
    return this._end;
  }


  /**
   * Returns the position parametrically, with 0 <= t <= 1.
   *
   * NOTE: positionAt( 0 ) will return the start of the segment, and positionAt( 1 ) will return the end of the
   * segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public positionAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'positionAt t should be non-negative' );
    assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

    const mt = 1 - t;
    // described from t=[0,1] as: (1-t)^2 start + 2(1-t)t control + t^2 end
    // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
    return this._start.times( mt * mt ).plus( this._control.times( 2 * mt * t ) ).plus( this._end.times( t * t ) );
  }

  /**
   * Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
   *
   * NOTE: tangentAt( 0 ) will return the tangent at the start of the segment, and tangentAt( 1 ) will return the
   * tangent at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public tangentAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'tangentAt t should be non-negative' );
    assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

    // For a quadratic curve, the derivative is given by : 2(1-t)( control - start ) + 2t( end - control )
    // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
    return this._control.minus( this._start ).times( 2 * ( 1 - t ) ).plus( this._end.minus( this._control ).times( 2 * t ) );
  }

  /**
   * Returns the signed curvature of the segment at the parametric value t, where 0 <= t <= 1.
   *
   * The curvature will be positive for visual clockwise / mathematical counterclockwise curves, negative for opposite
   * curvature, and 0 for no curvature.
   *
   * NOTE: curvatureAt( 0 ) will return the curvature at the start of the segment, and curvatureAt( 1 ) will return
   * the curvature at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public curvatureAt( t: number ): number {
    assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
    assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

    // see http://cagd.cs.byu.edu/~557/text/ch2.pdf p31
    // TODO: remove code duplication with Cubic https://github.com/phetsims/kite/issues/76
    const epsilon = 0.0000001;
    if ( Math.abs( t - 0.5 ) > 0.5 - epsilon ) {
      const isZero = t < 0.5;
      const p0 = isZero ? this._start : this._end;
      const p1 = this._control;
      const p2 = isZero ? this._end : this._start;
      const d10 = p1.minus( p0 );
      const a = d10.magnitude;
      const h = ( isZero ? -1 : 1 ) * d10.perpendicular.normalized().dot( p2.minus( p1 ) );
      return ( h * ( this.degree - 1 ) ) / ( this.degree * a * a );
    }
    else {
      return this.subdivided( t )[ 0 ].curvatureAt( 1 );
    }
  }

  /**
   * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
   * up the same shape as the current segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public subdivided( t: number ): Quadratic[] {
    assert && assert( t >= 0, 'subdivided t should be non-negative' );
    assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

    // If t is 0 or 1, we only need to return 1 segment
    if ( t === 0 || t === 1 ) {
      return [ this ];
    }

    // de Casteljau method
    const leftMid = this._start.blend( this._control, t );
    const rightMid = this._control.blend( this._end, t );
    const mid = leftMid.blend( rightMid, t );
    return [
      new Quadratic( this._start, leftMid, mid ),
      new Quadratic( mid, rightMid, this._end )
    ];
  }

  /**
   * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   */
  public invalidate(): void {
    assert && assert( this._start instanceof Vector2, `Quadratic start should be a Vector2: ${this._start}` );
    assert && assert( this._start.isFinite(), `Quadratic start should be finite: ${this._start.toString()}` );
    assert && assert( this._control instanceof Vector2, `Quadratic control should be a Vector2: ${this._control}` );
    assert && assert( this._control.isFinite(), `Quadratic control should be finite: ${this._control.toString()}` );
    assert && assert( this._end instanceof Vector2, `Quadratic end should be a Vector2: ${this._end}` );
    assert && assert( this._end.isFinite(), `Quadratic end should be finite: ${this._end.toString()}` );

    // Lazily-computed derived information
    this._startTangent = null;
    this._endTangent = null;
    this._tCriticalX = null;
    this._tCriticalY = null;

    this._bounds = null;
    this._svgPathFragment = null;

    this.invalidationEmitter.emit();
  }

  /**
   * Returns the tangent vector (normalized) to the segment at the start, pointing in the direction of motion (from start to end)
   */
  public getStartTangent(): Vector2 {
    if ( this._startTangent === null ) {
      const controlIsStart = this._start.equals( this._control );
      // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
      this._startTangent = controlIsStart ?
                           this._end.minus( this._start ).normalized() :
                           this._control.minus( this._start ).normalized();
    }
    return this._startTangent;
  }

  public get startTangent(): Vector2 { return this.getStartTangent(); }

  /**
   * Returns the tangent vector (normalized) to the segment at the end, pointing in the direction of motion (from start to end)
   */
  public getEndTangent(): Vector2 {
    if ( this._endTangent === null ) {
      const controlIsEnd = this._end.equals( this._control );
      // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
      this._endTangent = controlIsEnd ?
                         this._end.minus( this._start ).normalized() :
                         this._end.minus( this._control ).normalized();
    }
    return this._endTangent;
  }

  public get endTangent(): Vector2 { return this.getEndTangent(); }

  public getTCriticalX(): number {
    // compute x where the derivative is 0 (used for bounds and other things)
    if ( this._tCriticalX === null ) {
      this._tCriticalX = Quadratic.extremaT( this._start.x, this._control.x, this._end.x );
    }
    return this._tCriticalX;
  }

  public get tCriticalX(): number { return this.getTCriticalX(); }

  public getTCriticalY(): number {
    // compute y where the derivative is 0 (used for bounds and other things)
    if ( this._tCriticalY === null ) {
      this._tCriticalY = Quadratic.extremaT( this._start.y, this._control.y, this._end.y );
    }
    return this._tCriticalY;
  }

  public get tCriticalY(): number { return this.getTCriticalY(); }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   */
  public getNondegenerateSegments(): Segment[] {
    const start = this._start;
    const control = this._control;
    const end = this._end;

    const startIsEnd = start.equals( end );
    const startIsControl = start.equals( control );
    const endIsControl = start.equals( control );

    if ( startIsEnd && startIsControl ) {
      // all same points
      return [];
    }
    else if ( startIsEnd ) {
      // this is a special collinear case, we basically line out to the farthest point and back
      const halfPoint = this.positionAt( 0.5 );
      return [
        new Line( start, halfPoint ),
        new Line( halfPoint, end )
      ];
    }
    else if ( arePointsCollinear( start, control, end ) ) {
      // if they are collinear, we can reduce to start->control and control->end, or if control is between, just one line segment
      // also, start !== end (handled earlier)
      if ( startIsControl || endIsControl ) {
        // just a line segment!
        return [ new Line( start, end ) ]; // no extra nondegenerate check since start !== end
      }
      // now control point must be unique. we check to see if our rendered path will be outside of the start->end line segment
      const delta = end.minus( start );
      const p1d = control.minus( start ).dot( delta.normalized() ) / delta.magnitude;
      const t = Quadratic.extremaT( 0, p1d, 1 );
      if ( !isNaN( t ) && t > 0 && t < 1 ) {
        // we have a local max inside the range, indicating that our extrema point is outside of start->end
        // we'll line to and from it
        const pt = this.positionAt( t );
        return _.flatten( [
          new Line( start, pt ).getNondegenerateSegments(),
          new Line( pt, end ).getNondegenerateSegments()
        ] );
      }
      else {
        // just provide a line segment, our rendered path doesn't go outside of this
        return [ new Line( start, end ) ]; // no extra nondegenerate check since start !== end
      }
    }
    else {
      return [ this ];
    }
  }

  /**
   * Returns the bounds of this segment.
   */
  public getBounds(): Bounds2 {
    // calculate our temporary guaranteed lower bounds based on the end points
    if ( this._bounds === null ) {
      this._bounds = new Bounds2( Math.min( this._start.x, this._end.x ), Math.min( this._start.y, this._end.y ), Math.max( this._start.x, this._end.x ), Math.max( this._start.y, this._end.y ) );

      // compute x and y where the derivative is 0, so we can include this in the bounds
      const tCriticalX = this.getTCriticalX();
      const tCriticalY = this.getTCriticalY();

      if ( !isNaN( tCriticalX ) && tCriticalX > 0 && tCriticalX < 1 ) {
        this._bounds = this._bounds.withPoint( this.positionAt( tCriticalX ) );
      }
      if ( !isNaN( tCriticalY ) && tCriticalY > 0 && tCriticalY < 1 ) {
        this._bounds = this._bounds.withPoint( this.positionAt( tCriticalY ) );
      }
    }
    return this._bounds;
  }

  public get bounds(): Bounds2 { return this.getBounds(); }

  // see http://www.visgraf.impa.br/sibgrapi96/trabs/pdf/a14.pdf
  // and http://math.stackexchange.com/questions/12186/arc-length-of-bezier-curves for curvature / arc length

  /**
   * Returns an array of quadratic that are offset to this quadratic by a distance r
   *
   * @param r - distance
   * @param reverse
   */
  public offsetTo( r: number, reverse: boolean ): Quadratic[] {
    // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html https://github.com/phetsims/kite/issues/76
    // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf https://github.com/phetsims/kite/issues/76
    let curves: Quadratic[] = [ this ];

    // subdivide this curve
    const depth = 5; // generates 2^depth curves
    for ( let i = 0; i < depth; i++ ) {
      curves = _.flatten( _.map( curves, ( curve: Quadratic ) => curve.subdivided( 0.5 ) ) );
    }

    let offsetCurves = _.map( curves, ( curve: Quadratic ) => curve.approximateOffset( r ) );

    if ( reverse ) {
      offsetCurves.reverse();
      offsetCurves = _.map( offsetCurves, ( curve: Quadratic ) => curve.reversed() );
    }

    return offsetCurves;
  }

  /**
   * Elevation of this quadratic Bezier curve to a cubic Bezier curve
   */
  public degreeElevated(): Cubic {
    // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
    return new Cubic(
      this._start,
      this._start.plus( this._control.timesScalar( 2 ) ).dividedScalar( 3 ),
      this._end.plus( this._control.timesScalar( 2 ) ).dividedScalar( 3 ),
      this._end
    );
  }

  /**
   * @param r - distance
   */
  public approximateOffset( r: number ): Quadratic {
    return new Quadratic(
      this._start.plus( ( this._start.equals( this._control ) ? this._end.minus( this._start ) : this._control.minus( this._start ) ).perpendicular.normalized().times( r ) ),
      this._control.plus( this._end.minus( this._start ).perpendicular.normalized().times( r ) ),
      this._end.plus( ( this._end.equals( this._control ) ? this._end.minus( this._start ) : this._end.minus( this._control ) ).perpendicular.normalized().times( r ) )
    );
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls this needs to put the M calls first
   */
  public getSVGPathFragment(): string {
    let oldPathFragment;
    if ( assert ) {
      oldPathFragment = this._svgPathFragment;
      this._svgPathFragment = null;
    }
    if ( !this._svgPathFragment ) {
      this._svgPathFragment = `Q ${svgNumber( this._control.x )} ${svgNumber( this._control.y )} ${
        svgNumber( this._end.x )} ${svgNumber( this._end.y )}`;
    }
    if ( assert ) {
      if ( oldPathFragment ) {
        assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
      }
    }
    return this._svgPathFragment;
  }

  /**
   * Returns an array of lines that will draw an offset curve on the logical left side
   */
  public strokeLeft( lineWidth: number ): Quadratic[] {
    return this.offsetTo( -lineWidth / 2, false );
  }

  /**
   * Returns an array of lines that will draw an offset curve on the logical right side
   */
  public strokeRight( lineWidth: number ): Quadratic[] {
    return this.offsetTo( lineWidth / 2, true );
  }

  public getInteriorExtremaTs(): number[] {
    // TODO: we assume here we are reduce, so that a criticalX doesn't equal a criticalY? https://github.com/phetsims/kite/issues/76
    const result = [];
    const epsilon = 0.0000000001; // TODO: general kite epsilon? https://github.com/phetsims/kite/issues/76

    const criticalX = this.getTCriticalX();
    const criticalY = this.getTCriticalY();

    if ( !isNaN( criticalX ) && criticalX > epsilon && criticalX < 1 - epsilon ) {
      result.push( this.tCriticalX );
    }
    if ( !isNaN( criticalY ) && criticalY > epsilon && criticalY < 1 - epsilon ) {
      result.push( this.tCriticalY );
    }
    return result.sort();
  }

  /**
   * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
   * For details, see the documentation in Segment.js
   */
  public intersection( ray: Ray2 ): RayIntersection[] {
    const result: RayIntersection[] = [];

    // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
    const inverseMatrix = Matrix3.rotation2( -ray.direction.angle ).timesMatrix( Matrix3.translation( -ray.position.x, -ray.position.y ) );

    const p0 = inverseMatrix.timesVector2( this._start );
    const p1 = inverseMatrix.timesVector2( this._control );
    const p2 = inverseMatrix.timesVector2( this._end );

    //(1-t)^2 start + 2(1-t)t control + t^2 end
    const a = p0.y - 2 * p1.y + p2.y;
    const b = -2 * p0.y + 2 * p1.y;
    const c = p0.y;

    const ts = solveQuadraticRootsReal( a, b, c );

    _.each( ts, t => {
      if ( t >= 0 && t <= 1 ) {
        const hitPoint = this.positionAt( t );
        const unitTangent = this.tangentAt( t ).normalized();
        const perp = unitTangent.perpendicular;
        const toHit = hitPoint.minus( ray.position );

        // make sure it's not behind the ray
        if ( toHit.dot( ray.direction ) > 0 ) {
          const normal = perp.dot( ray.direction ) > 0 ? perp.negated() : perp;
          const wind = ray.direction.perpendicular.dot( unitTangent ) < 0 ? 1 : -1;
          result.push( new RayIntersection( toHit.magnitude, hitPoint, normal, wind, t ) );
        }
      }
    } );
    return result;
  }

  /**
   * Returns the winding number for intersection with a ray
   */
  public windingIntersection( ray: Ray2 ): number {
    let wind = 0;
    const hits = this.intersection( ray );
    _.each( hits, hit => {
      wind += hit.wind;
    } );
    return wind;
  }

  /**
   * Draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   */
  public writeToContext( context: CanvasRenderingContext2D ): void {
    context.quadraticCurveTo( this._control.x, this._control.y, this._end.x, this._end.y );
  }

  /**
   * Returns a new quadratic that represents this quadratic after transformation by the matrix
   */
  public transformed( matrix: Matrix3 ): Quadratic {
    return new Quadratic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control ), matrix.timesVector2( this._end ) );
  }

  /**
   * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
   *
   * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
   */
  public getSignedAreaFragment(): number {
    return 1 / 6 * (
      this._start.x * ( 2 * this._control.y + this._end.y ) +
      this._control.x * ( -2 * this._start.y + 2 * this._end.y ) +
      this._end.x * ( -this._start.y - 2 * this._control.y )
    );
  }

  /**
   * Given the current curve parameterized by t, will return a curve parameterized by x where t = a * x + b
   */
  public reparameterized( a: number, b: number ): Quadratic {
    // to the polynomial pt^2 + qt + r:
    const p = this._start.plus( this._end.plus( this._control.timesScalar( -2 ) ) );
    const q = this._control.minus( this._start ).timesScalar( 2 );
    const r = this._start;

    // to the polynomial alpha*x^2 + beta*x + gamma:
    const alpha = p.timesScalar( a * a );
    const beta = p.timesScalar( a * b ).timesScalar( 2 ).plus( q.timesScalar( a ) );
    const gamma = p.timesScalar( b * b ).plus( q.timesScalar( b ) ).plus( r );

    // back to the form start,control,end
    return new Quadratic( gamma, beta.timesScalar( 0.5 ).plus( gamma ), alpha.plus( beta ).plus( gamma ) );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   */
  public reversed(): Quadratic {
    return new Quadratic( this._end, this._control, this._start );
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedQuadratic {
    return {
      type: 'Quadratic',
      startX: this._start.x,
      startY: this._start.y,
      controlX: this._control.x,
      controlY: this._control.y,
      endX: this._end.x,
      endY: this._end.y
    };
  }

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * @param segment
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public getOverlaps( segment: Segment, epsilon = 1e-6 ): Overlap[] | null {
    if ( segment instanceof Quadratic ) {
      return Quadratic.getOverlaps( this, segment );
    }

    return null;
  }

  /**
   * Returns a Quadratic from the serialized representation.
   */
  public static override deserialize( obj: SerializedQuadratic ): Quadratic {
    assert && assert( obj.type === 'Quadratic' );

    return new Quadratic( new Vector2( obj.startX, obj.startY ), new Vector2( obj.controlX, obj.controlY ), new Vector2( obj.endX, obj.endY ) );
  }

  /**
   * One-dimensional solution to extrema
   */
  public static extremaT( start: number, control: number, end: number ): number {
    // compute t where the derivative is 0 (used for bounds and other things)
    const divisorX = 2 * ( end - 2 * control + start );
    if ( divisorX !== 0 ) {
      return -2 * ( control - start ) / divisorX;
    }
    else {
      return NaN;
    }
  }

  /**
   * Determine whether two Quadratics overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * NOTE: for this particular function, we assume we're not degenerate. Things may work if we can be degree-reduced
   * to a quadratic, but generally that shouldn't be done.
   *
   * @param quadratic1
   * @param quadratic2
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public static getOverlaps( quadratic1: Quadratic, quadratic2: Quadratic, epsilon = 1e-6 ): Overlap[] {

    /*
     * NOTE: For implementation details in this function, please see Cubic.getOverlaps. It goes over all of the
     * same implementation details, but instead our bezier matrix is a 3x3:
     *
     * [  1  0  0 ]
     * [ -2  2  0 ]
     * [  1 -2  1 ]
     *
     * And we use the upper-left section of (at+b) adjustment matrix relevant for the quadratic.
     */

    const noOverlap: Overlap[] = [];

    // Efficiently compute the multiplication of the bezier matrix:
    const p0x = quadratic1._start.x;
    const p1x = -2 * quadratic1._start.x + 2 * quadratic1._control.x;
    const p2x = quadratic1._start.x - 2 * quadratic1._control.x + quadratic1._end.x;
    const p0y = quadratic1._start.y;
    const p1y = -2 * quadratic1._start.y + 2 * quadratic1._control.y;
    const p2y = quadratic1._start.y - 2 * quadratic1._control.y + quadratic1._end.y;
    const q0x = quadratic2._start.x;
    const q1x = -2 * quadratic2._start.x + 2 * quadratic2._control.x;
    const q2x = quadratic2._start.x - 2 * quadratic2._control.x + quadratic2._end.x;
    const q0y = quadratic2._start.y;
    const q1y = -2 * quadratic2._start.y + 2 * quadratic2._control.y;
    const q2y = quadratic2._start.y - 2 * quadratic2._control.y + quadratic2._end.y;

    // Determine the candidate overlap (preferring the dimension with the largest variation)
    const xSpread = Math.abs( Math.max( quadratic1._start.x, quadratic1._control.x, quadratic1._end.x,
                                quadratic2._start.x, quadratic2._control.x, quadratic2._end.x ) -
                              Math.min( quadratic1._start.x, quadratic1._control.x, quadratic1._end.x,
                                quadratic2._start.x, quadratic2._control.x, quadratic2._end.x ) );
    const ySpread = Math.abs( Math.max( quadratic1._start.y, quadratic1._control.y, quadratic1._end.y,
                                quadratic2._start.y, quadratic2._control.y, quadratic2._end.y ) -
                              Math.min( quadratic1._start.y, quadratic1._control.y, quadratic1._end.y,
                                quadratic2._start.y, quadratic2._control.y, quadratic2._end.y ) );
    const xOverlap = Segment.polynomialGetOverlapQuadratic( p0x, p1x, p2x, q0x, q1x, q2x );
    const yOverlap = Segment.polynomialGetOverlapQuadratic( p0y, p1y, p2y, q0y, q1y, q2y );
    let overlap;
    if ( xSpread > ySpread ) {
      overlap = ( xOverlap === null || xOverlap === true ) ? yOverlap : xOverlap;
    }
    else {
      overlap = ( yOverlap === null || yOverlap === true ) ? xOverlap : yOverlap;
    }
    if ( overlap === null || overlap === true ) {
      return noOverlap; // No way to pin down an overlap
    }

    const a = overlap.a;
    const b = overlap.b;

    const aa = a * a;
    const bb = b * b;
    const ab2 = 2 * a * b;

    // Compute quadratic coefficients for the difference between p(t) and q(a*t+b)
    const d0x = q0x + b * q1x + bb * q2x - p0x;
    const d1x = a * q1x + ab2 * q2x - p1x;
    const d2x = aa * q2x - p2x;
    const d0y = q0y + b * q1y + bb * q2y - p0y;
    const d1y = a * q1y + ab2 * q2y - p1y;
    const d2y = aa * q2y - p2y;

    // Find the t values where extremes lie in the [0,1] range for each 1-dimensional quadratic. We do this by
    // differentiating the quadratic and finding the roots of the resulting line.
    const xRoots = solveLinearRootsReal( 2 * d2x, d1x );
    const yRoots = solveLinearRootsReal( 2 * d2y, d1y );
    const xExtremeTs = _.uniq( [ 0, 1 ].concat( xRoots ? xRoots.filter( isBetween0And1 ) : [] ) );
    const yExtremeTs = _.uniq( [ 0, 1 ].concat( yRoots ? yRoots.filter( isBetween0And1 ) : [] ) );

    // Examine the single-coordinate distances between the "overlaps" at each extreme T value. If the distance is larger
    // than our epsilon, then the "overlap" would not be valid.
    for ( let i = 0; i < xExtremeTs.length; i++ ) {
      const t = xExtremeTs[ i ];
      if ( Math.abs( ( d2x * t + d1x ) * t + d0x ) > epsilon ) {
        return noOverlap;
      }
    }
    for ( let i = 0; i < yExtremeTs.length; i++ ) {
      const t = yExtremeTs[ i ];
      if ( Math.abs( ( d2y * t + d1y ) * t + d0y ) > epsilon ) {
        return noOverlap;
      }
    }

    const qt0 = b;
    const qt1 = a + b;

    // TODO: do we want an epsilon in here to be permissive? https://github.com/phetsims/kite/issues/76
    if ( ( qt0 > 1 && qt1 > 1 ) || ( qt0 < 0 && qt1 < 0 ) ) {
      return noOverlap;
    }

    return [ new Overlap( a, b ) ];
  }

  // Degree of the polynomial (quadratic)
  public degree!: number;
}

Quadratic.prototype.degree = 2;

kite.register( 'Quadratic', Quadratic );

export type SerializedCubic = {
  type: 'Cubic';
  startX: number;
  startY: number;
  control1X: number;
  control1Y: number;
  control2X: number;
  control2Y: number;
  endX: number;
  endY: number;
};

/**
 * Cubic Bezier segment.
 *
 * See http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf for info
 *
 * Good reference: http://cagd.cs.byu.edu/~557/text/ch2.pdf
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
export class Cubic extends Segment {

  private _start: Vector2;
  private _control1: Vector2;
  private _control2: Vector2;
  private _end: Vector2;

  // Lazily-computed derived information
  private _startTangent!: Vector2 | null;
  private _endTangent!: Vector2 | null;
  private _r!: Vector2 | null;
  private _s!: Vector2 | null;

  // Cusp-specific information
  private _tCusp!: number | null; // T value for a potential cusp
  private _tDeterminant!: number | null;
  private _tInflection1!: number | null; // NaN if not applicable
  private _tInflection2!: number | null; // NaN if not applicable
  private _quadratics!: Quadratic[] | null;

  // T-values where X and Y (respectively) reach an extrema (not necessarily including 0 and 1)
  private _xExtremaT!: number[] | null;
  private _yExtremaT!: number[] | null;

  private _bounds!: Bounds2 | null;
  private _svgPathFragment!: string | null;

  /**
   * @param start - Start point of the cubic bezier
   * @param control1 - First control point (curve usually doesn't go through here)
   * @param control2 - Second control point (curve usually doesn't go through here)
   * @param end - End point of the cubic bezier
   */
  public constructor( start: Vector2, control1: Vector2, control2: Vector2, end: Vector2 ) {
    super();

    this._start = start;
    this._control1 = control1;
    this._control2 = control2;
    this._end = end;

    this.invalidate();
  }

  /**
   * Sets the start point of the Cubic.
   */
  public setStart( start: Vector2 ): this {
    assert && assert( start.isFinite(), `Cubic start should be finite: ${start.toString()}` );

    if ( !this._start.equals( start ) ) {
      this._start = start;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set start( value: Vector2 ) { this.setStart( value ); }

  public get start(): Vector2 { return this.getStart(); }


  /**
   * Returns the start of this Cubic.
   */
  public getStart(): Vector2 {
    return this._start;
  }


  /**
   * Sets the first control point of the Cubic.
   */
  public setControl1( control1: Vector2 ): this {
    assert && assert( control1.isFinite(), `Cubic control1 should be finite: ${control1.toString()}` );

    if ( !this._control1.equals( control1 ) ) {
      this._control1 = control1;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set control1( value: Vector2 ) { this.setControl1( value ); }

  public get control1(): Vector2 { return this.getControl1(); }


  /**
   * Returns the first control point of this Cubic.
   */
  public getControl1(): Vector2 {
    return this._control1;
  }


  /**
   * Sets the second control point of the Cubic.
   */
  public setControl2( control2: Vector2 ): this {
    assert && assert( control2.isFinite(), `Cubic control2 should be finite: ${control2.toString()}` );

    if ( !this._control2.equals( control2 ) ) {
      this._control2 = control2;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set control2( value: Vector2 ) { this.setControl2( value ); }

  public get control2(): Vector2 { return this.getControl2(); }


  /**
   * Returns the second control point of this Cubic.
   */
  public getControl2(): Vector2 {
    return this._control2;
  }


  /**
   * Sets the end point of the Cubic.
   */
  public setEnd( end: Vector2 ): this {
    assert && assert( end.isFinite(), `Cubic end should be finite: ${end.toString()}` );

    if ( !this._end.equals( end ) ) {
      this._end = end;
      this.invalidate();
    }
    return this; // allow chaining
  }

  public set end( value: Vector2 ) { this.setEnd( value ); }

  public get end(): Vector2 { return this.getEnd(); }


  /**
   * Returns the end of this Cubic.
   */
  public getEnd(): Vector2 {
    return this._end;
  }


  /**
   * Returns the position parametrically, with 0 <= t <= 1.
   *
   * NOTE: positionAt( 0 ) will return the start of the segment, and positionAt( 1 ) will return the end of the
   * segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public positionAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'positionAt t should be non-negative' );
    assert && assert( t <= 1, 'positionAt t should be no greater than 1' );

    // Equivalent position: (1 - t)^3*start + 3*(1 - t)^2*t*control1 + 3*(1 - t) t^2*control2 + t^3*end
    const mt = 1 - t;
    const mmm = mt * mt * mt;
    const mmt = 3 * mt * mt * t;
    const mtt = 3 * mt * t * t;
    const ttt = t * t * t;

    return new Vector2(
      this._start.x * mmm + this._control1.x * mmt + this._control2.x * mtt + this._end.x * ttt,
      this._start.y * mmm + this._control1.y * mmt + this._control2.y * mtt + this._end.y * ttt
    );
  }

  /**
   * Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with 0 <= t <= 1.
   *
   * NOTE: tangentAt( 0 ) will return the tangent at the start of the segment, and tangentAt( 1 ) will return the
   * tangent at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public tangentAt( t: number ): Vector2 {
    assert && assert( t >= 0, 'tangentAt t should be non-negative' );
    assert && assert( t <= 1, 'tangentAt t should be no greater than 1' );

    // derivative: -3 p0 (1 - t)^2 + 3 p1 (1 - t)^2 - 6 p1 (1 - t) t + 6 p2 (1 - t) t - 3 p2 t^2 + 3 p3 t^2
    const mt = 1 - t;
    const result = new Vector2( 0, 0 );
    return result.set( this._start ).multiplyScalar( -3 * mt * mt )
      .add( scratchVector1.set( this._control1 ).multiplyScalar( 3 * mt * mt - 6 * mt * t ) )
      .add( scratchVector1.set( this._control2 ).multiplyScalar( 6 * mt * t - 3 * t * t ) )
      .add( scratchVector1.set( this._end ).multiplyScalar( 3 * t * t ) );
  }

  /**
   * Returns the signed curvature of the segment at the parametric value t, where 0 <= t <= 1.
   *
   * The curvature will be positive for visual clockwise / mathematical counterclockwise curves, negative for opposite
   * curvature, and 0 for no curvature.
   *
   * NOTE: curvatureAt( 0 ) will return the curvature at the start of the segment, and curvatureAt( 1 ) will return
   * the curvature at the end of the segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public curvatureAt( t: number ): number {
    assert && assert( t >= 0, 'curvatureAt t should be non-negative' );
    assert && assert( t <= 1, 'curvatureAt t should be no greater than 1' );

    // see http://cagd.cs.byu.edu/~557/text/ch2.pdf p31
    // TODO: remove code duplication with Quadratic https://github.com/phetsims/kite/issues/76
    const epsilon = 0.0000001;
    if ( Math.abs( t - 0.5 ) > 0.5 - epsilon ) {
      const isZero = t < 0.5;
      const p0 = isZero ? this._start : this._end;
      const p1 = isZero ? this._control1 : this._control2;
      const p2 = isZero ? this._control2 : this._control1;
      const d10 = p1.minus( p0 );
      const a = d10.magnitude;
      const h = ( isZero ? -1 : 1 ) * d10.perpendicular.normalized().dot( p2.minus( p1 ) );
      return ( h * ( this.degree - 1 ) ) / ( this.degree * a * a );
    }
    else {
      return this.subdivided( t )[ 0 ].curvatureAt( 1 );
    }
  }

  /**
   * Returns an array with up to 2 sub-segments, split at the parametric t value. Together (in order) they should make
   * up the same shape as the current segment.
   *
   * This method is part of the Segment API. See Segment.js's constructor for more API documentation.
   */
  public subdivided( t: number ): Cubic[] {
    assert && assert( t >= 0, 'subdivided t should be non-negative' );
    assert && assert( t <= 1, 'subdivided t should be no greater than 1' );

    // If t is 0 or 1, we only need to return 1 segment
    if ( t === 0 || t === 1 ) {
      return [ this ];
    }

    // de Casteljau method
    // TODO: add a 'bisect' or 'between' method for vectors? https://github.com/phetsims/kite/issues/76
    const left = this._start.blend( this._control1, t );
    const right = this._control2.blend( this._end, t );
    const middle = this._control1.blend( this._control2, t );
    const leftMid = left.blend( middle, t );
    const rightMid = middle.blend( right, t );
    const mid = leftMid.blend( rightMid, t );
    return [
      new Cubic( this._start, left, leftMid, mid ),
      new Cubic( mid, rightMid, right, this._end )
    ];
  }

  /**
   * Clears cached information, should be called when any of the 'constructor arguments' are mutated.
   */
  public invalidate(): void {
    assert && assert( this._start instanceof Vector2, `Cubic start should be a Vector2: ${this._start}` );
    assert && assert( this._start.isFinite(), `Cubic start should be finite: ${this._start.toString()}` );
    assert && assert( this._control1 instanceof Vector2, `Cubic control1 should be a Vector2: ${this._control1}` );
    assert && assert( this._control1.isFinite(), `Cubic control1 should be finite: ${this._control1.toString()}` );
    assert && assert( this._control2 instanceof Vector2, `Cubic control2 should be a Vector2: ${this._control2}` );
    assert && assert( this._control2.isFinite(), `Cubic control2 should be finite: ${this._control2.toString()}` );
    assert && assert( this._end instanceof Vector2, `Cubic end should be a Vector2: ${this._end}` );
    assert && assert( this._end.isFinite(), `Cubic end should be finite: ${this._end.toString()}` );

    // Lazily-computed derived information
    this._startTangent = null;
    this._endTangent = null;
    this._r = null;
    this._s = null;

    // Cusp-specific information
    this._tCusp = null;
    this._tDeterminant = null;
    this._tInflection1 = null;
    this._tInflection2 = null;
    this._quadratics = null;

    // T-values where X and Y (respectively) reach an extrema (not necessarily including 0 and 1)
    this._xExtremaT = null;
    this._yExtremaT = null;

    this._bounds = null;
    this._svgPathFragment = null;

    this.invalidationEmitter.emit();
  }

  /**
   * Gets the start position of this cubic polynomial.
   */
  public getStartTangent(): Vector2 {
    if ( this._startTangent === null ) {
      this._startTangent = this.tangentAt( 0 ).normalized();
    }
    return this._startTangent;
  }

  public get startTangent(): Vector2 { return this.getStartTangent(); }

  /**
   * Gets the end position of this cubic polynomial.
   */
  public getEndTangent(): Vector2 {
    if ( this._endTangent === null ) {
      this._endTangent = this.tangentAt( 1 ).normalized();
    }
    return this._endTangent;
  }

  public get endTangent(): Vector2 { return this.getEndTangent(); }

  /**
   * TODO: documentation https://github.com/phetsims/kite/issues/76
   */
  public getR(): Vector2 {
    // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
    if ( this._r === null ) {
      this._r = this._control1.minus( this._start ).normalized();
    }
    return this._r;
  }

  public get r(): Vector2 { return this.getR(); }

  /**
   * TODO: documentation https://github.com/phetsims/kite/issues/76
   */
  public getS(): Vector2 {
    // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
    if ( this._s === null ) {
      this._s = this.getR().perpendicular;
    }
    return this._s;
  }

  public get s(): Vector2 { return this.getS(); }

  /**
   * Returns the parametric t value for the possible cusp location. A cusp may or may not exist at that point.
   */
  public getTCusp(): number {
    if ( this._tCusp === null ) {
      this.computeCuspInfo();
    }
    assert && assert( this._tCusp !== null );
    return this._tCusp!;
  }

  public get tCusp(): number { return this.getTCusp(); }

  /**
   * Returns the determinant value for the cusp, which indicates the presence (or lack of presence) of a cusp.
   */
  public getTDeterminant(): number {
    if ( this._tDeterminant === null ) {
      this.computeCuspInfo();
    }
    assert && assert( this._tDeterminant !== null );
    return this._tDeterminant!;
  }

  public get tDeterminant(): number { return this.getTDeterminant(); }

  /**
   * Returns the parametric t value for the potential location of the first possible inflection point.
   */
  public getTInflection1(): number {
    if ( this._tInflection1 === null ) {
      this.computeCuspInfo();
    }
    assert && assert( this._tInflection1 !== null );
    return this._tInflection1!;
  }

  public get tInflection1(): number { return this.getTInflection1(); }

  /**
   * Returns the parametric t value for the potential location of the second possible inflection point.
   */
  public getTInflection2(): number {
    if ( this._tInflection2 === null ) {
      this.computeCuspInfo();
    }
    assert && assert( this._tInflection2 !== null );
    return this._tInflection2!;
  }

  public get tInflection2(): number { return this.getTInflection2(); }

  /**
   * If there is a cusp, this cubic will consist of one or two quadratic segments, typically "start => cusp" and
   * "cusp => end".
   */
  public getQuadratics(): Quadratic[] | null {
    if ( this._quadratics === null ) {
      this.computeCuspSegments();
    }
    assert && assert( this._quadratics !== null );
    return this._quadratics;
  }

  /**
   * Returns a list of parametric t values where x-extrema exist, i.e. where dx/dt==0. These are candidate locations
   * on the cubic for "maximum X" and "minimum X", and are needed for bounds computations.
   */
  public getXExtremaT(): number[] {
    if ( this._xExtremaT === null ) {
      this._xExtremaT = Cubic.extremaT( this._start.x, this._control1.x, this._control2.x, this._end.x );
    }
    return this._xExtremaT;
  }

  public get xExtremaT(): number[] { return this.getXExtremaT(); }

  /**
   * Returns a list of parametric t values where y-extrema exist, i.e. where dy/dt==0. These are candidate locations
   * on the cubic for "maximum Y" and "minimum Y", and are needed for bounds computations.
   */
  public getYExtremaT(): number[] {
    if ( this._yExtremaT === null ) {
      this._yExtremaT = Cubic.extremaT( this._start.y, this._control1.y, this._control2.y, this._end.y );
    }
    return this._yExtremaT;
  }

  public get yExtremaT(): number[] { return this.getYExtremaT(); }

  /**
   * Returns the bounds of this segment.
   */
  public getBounds(): Bounds2 {
    if ( this._bounds === null ) {
      this._bounds = Bounds2.NOTHING;
      this._bounds = this._bounds.withPoint( this._start );
      this._bounds = this._bounds.withPoint( this._end );

      _.each( this.getXExtremaT(), t => {
        if ( t >= 0 && t <= 1 ) {
          this._bounds = this._bounds!.withPoint( this.positionAt( t ) );
        }
      } );
      _.each( this.getYExtremaT(), t => {
        if ( t >= 0 && t <= 1 ) {
          this._bounds = this._bounds!.withPoint( this.positionAt( t ) );
        }
      } );

      if ( this.hasCusp() ) {
        this._bounds = this._bounds.withPoint( this.positionAt( this.getTCusp() ) );
      }
    }
    return this._bounds;
  }

  public get bounds(): Bounds2 { return this.getBounds(); }

  /**
   * Computes all cusp-related information, including whether there is a cusp, any inflection points, etc.
   */
  private computeCuspInfo(): void {
    // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
    // TODO: allocation reduction https://github.com/phetsims/kite/issues/76
    const a = this._start.times( -1 ).plus( this._control1.times( 3 ) ).plus( this._control2.times( -3 ) ).plus( this._end );
    const b = this._start.times( 3 ).plus( this._control1.times( -6 ) ).plus( this._control2.times( 3 ) );
    const c = this._start.times( -3 ).plus( this._control1.times( 3 ) );

    const aPerp = a.perpendicular; // {Vector2}
    const bPerp = b.perpendicular; // {Vector2}
    const aPerpDotB = aPerp.dot( b ); // {number}

    this._tCusp = -0.5 * ( aPerp.dot( c ) / aPerpDotB ); // {number}
    this._tDeterminant = this._tCusp * this._tCusp - ( 1 / 3 ) * ( bPerp.dot( c ) / aPerpDotB ); // {number}
    if ( this._tDeterminant >= 0 ) {
      const sqrtDet = Math.sqrt( this._tDeterminant );
      this._tInflection1 = this._tCusp - sqrtDet;
      this._tInflection2 = this._tCusp + sqrtDet;
    }
    else {
      // there are no real roots to the quadratic polynomial.
      this._tInflection1 = NaN;
      this._tInflection2 = NaN;
    }
  }

  /**
   * If there is a cusp, this computes the 2 quadratic Bezier curves that this Cubic can be converted into.
   */
  private computeCuspSegments(): void {
    if ( this.hasCusp() ) {
      // if there is a cusp, we'll split at the cusp into two quadratic bezier curves.
      // see http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.94.8088&rep=rep1&type=pdf (Singularities of rational Bezier curves - J Monterde, 2001)
      this._quadratics = [];
      const tCusp = this.getTCusp();
      if ( tCusp === 0 ) {
        this._quadratics.push( new Quadratic( this.start, this.control2, this.end ) );
      }
      else if ( tCusp === 1 ) {
        this._quadratics.push( new Quadratic( this.start, this.control1, this.end ) );
      }
      else {
        const subdividedAtCusp = this.subdivided( tCusp );
        this._quadratics.push( new Quadratic( subdividedAtCusp[ 0 ].start, subdividedAtCusp[ 0 ].control1, subdividedAtCusp[ 0 ].end ) );
        this._quadratics.push( new Quadratic( subdividedAtCusp[ 1 ].start, subdividedAtCusp[ 1 ].control2, subdividedAtCusp[ 1 ].end ) );
      }
    }
    else {
      this._quadratics = null;
    }
  }

  /**
   * Returns a list of non-degenerate segments that are equivalent to this segment. Generally gets rid (or simplifies)
   * invalid or repeated segments.
   */
  public getNondegenerateSegments(): Segment[] {
    const start = this._start;
    const control1 = this._control1;
    const control2 = this._control2;
    const end = this._end;

    const reduced = this.degreeReduced( 1e-9 );

    if ( start.equals( end ) && start.equals( control1 ) && start.equals( control2 ) ) {
      // degenerate point
      return [];
    }
    else if ( this.hasCusp() ) {
      return _.flatten( this.getQuadratics()!.map( quadratic => quadratic.getNondegenerateSegments() ) );
    }
    else if ( reduced ) {
      // if we can reduce to a quadratic Bezier, always do this (and make sure it is non-degenerate)
      return reduced.getNondegenerateSegments();
    }
    else if ( arePointsCollinear( start, control1, end ) && arePointsCollinear( start, control2, end ) && !start.equalsEpsilon( end, 1e-7 ) ) {
      const extremaPoints = this.getXExtremaT().concat( this.getYExtremaT() ).sort().map( t => this.positionAt( t ) );

      const segments = [];
      let lastPoint = start;
      if ( extremaPoints.length ) {
        segments.push( new Line( start, extremaPoints[ 0 ] ) );
        lastPoint = extremaPoints[ 0 ];
      }
      for ( let i = 1; i < extremaPoints.length; i++ ) {
        segments.push( new Line( extremaPoints[ i - 1 ], extremaPoints[ i ] ) );
        lastPoint = extremaPoints[ i ];
      }
      segments.push( new Line( lastPoint, end ) );

      return _.flatten( segments.map( segment => segment.getNondegenerateSegments() ) );
    }
    else {
      return [ this ];
    }
  }

  /**
   * Returns whether this cubic has a cusp.
   */
  public hasCusp(): boolean {
    const tCusp = this.getTCusp();

    const epsilon = 1e-7; // TODO: make this available to change? https://github.com/phetsims/kite/issues/76
    return tCusp >= 0 && tCusp <= 1 && this.tangentAt( tCusp ).magnitude < epsilon;
  }

  public toRS( point: Vector2 ): Vector2 {
    const firstVector = point.minus( this._start );
    return new Vector2( firstVector.dot( this.getR() ), firstVector.dot( this.getS() ) );
  }

  public offsetTo( r: number, reverse: boolean ): Line[] {
    // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html https://github.com/phetsims/kite/issues/76
    // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf https://github.com/phetsims/kite/issues/76

    // how many segments to create (possibly make this more adaptive?)
    const quantity = 32;

    const points = [];
    const result = [];
    for ( let i = 0; i < quantity; i++ ) {
      let t = i / ( quantity - 1 );
      if ( reverse ) {
        t = 1 - t;
      }

      points.push( this.positionAt( t ).plus( this.tangentAt( t ).perpendicular.normalized().times( r ) ) );
      if ( i > 0 ) {
        result.push( new Line( points[ i - 1 ], points[ i ] ) );
      }
    }

    return result;
  }

  /**
   * Returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls this needs to put
   * the M calls first
   */
  public getSVGPathFragment(): string {
    let oldPathFragment;
    if ( assert ) {
      oldPathFragment = this._svgPathFragment;
      this._svgPathFragment = null;
    }
    if ( !this._svgPathFragment ) {
      this._svgPathFragment = `C ${svgNumber( this._control1.x )} ${svgNumber( this._control1.y )} ${
        svgNumber( this._control2.x )} ${svgNumber( this._control2.y )} ${
        svgNumber( this._end.x )} ${svgNumber( this._end.y )}`;
    }
    if ( assert ) {
      if ( oldPathFragment ) {
        assert( oldPathFragment === this._svgPathFragment, 'Quadratic line segment changed without invalidate()' );
      }
    }
    return this._svgPathFragment;
  }

  /**
   * Returns an array of lines that will draw an offset curve on the logical left side
   */
  public strokeLeft( lineWidth: number ): Line[] {
    return this.offsetTo( -lineWidth / 2, false );
  }

  /**
   * Returns an array of lines that will draw an offset curve on the logical right side
   */
  public strokeRight( lineWidth: number ): Line[] {
    return this.offsetTo( lineWidth / 2, true );
  }

  /**
   * Returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   * The list does not include t=0 and t=1
   */
  public getInteriorExtremaTs(): number[] {
    const ts = this.getXExtremaT().concat( this.getYExtremaT() );
    const result: number[] = [];
    _.each( ts, t => {
      const epsilon = 0.0000000001; // TODO: general kite epsilon? https://github.com/phetsims/kite/issues/76
      if ( t > epsilon && t < 1 - epsilon ) {
        // don't add duplicate t values
        if ( _.every( result, otherT => Math.abs( t - otherT ) > epsilon ) ) {
          result.push( t );
        }
      }
    } );
    return result.sort();
  }


  /**
   * Hit-tests this segment with the ray. An array of all intersections of the ray with this segment will be returned.
   * For details, see the documentation in Segment.js
   */
  public intersection( ray: Ray2 ): RayIntersection[] {
    const result: RayIntersection[] = [];

    // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
    const inverseMatrix = Matrix3.rotation2( -ray.direction.angle ).timesMatrix( Matrix3.translation( -ray.position.x, -ray.position.y ) );

    const p0 = inverseMatrix.timesVector2( this._start );
    const p1 = inverseMatrix.timesVector2( this._control1 );
    const p2 = inverseMatrix.timesVector2( this._control2 );
    const p3 = inverseMatrix.timesVector2( this._end );

    // polynomial form of cubic: start + (3 control1 - 3 start) t + (-6 control1 + 3 control2 + 3 start) t^2 + (3 control1 - 3 control2 + end - start) t^3
    const a = -p0.y + 3 * p1.y - 3 * p2.y + p3.y;
    const b = 3 * p0.y - 6 * p1.y + 3 * p2.y;
    const c = -3 * p0.y + 3 * p1.y;
    const d = p0.y;

    const ts = solveCubicRootsReal( a, b, c, d );

    _.each( ts, ( t: number ) => {
      if ( t >= 0 && t <= 1 ) {
        const hitPoint = this.positionAt( t );
        const unitTangent = this.tangentAt( t ).normalized();
        const perp = unitTangent.perpendicular;
        const toHit = hitPoint.minus( ray.position );

        // make sure it's not behind the ray
        if ( toHit.dot( ray.direction ) > 0 ) {
          const normal = perp.dot( ray.direction ) > 0 ? perp.negated() : perp;
          const wind = ray.direction.perpendicular.dot( unitTangent ) < 0 ? 1 : -1;
          result.push( new RayIntersection( toHit.magnitude, hitPoint, normal, wind, t ) );
        }
      }
    } );
    return result;
  }

  /**
   * Returns the winding number for intersection with a ray
   */
  public windingIntersection( ray: Ray2 ): number {
    let wind = 0;
    const hits = this.intersection( ray );
    _.each( hits, ( hit: RayIntersection ) => {
      wind += hit.wind;
    } );
    return wind;
  }

  /**
   * Draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   */
  public writeToContext( context: CanvasRenderingContext2D ): void {
    context.bezierCurveTo( this._control1.x, this._control1.y, this._control2.x, this._control2.y, this._end.x, this._end.y );
  }

  /**
   * Returns a new cubic that represents this cubic after transformation by the matrix
   */
  public transformed( matrix: Matrix3 ): Cubic {
    return new Cubic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control1 ), matrix.timesVector2( this._control2 ), matrix.timesVector2( this._end ) );
  }


  /**
   * Returns a degree-reduced quadratic Bezier if possible, otherwise it returns null
   */
  public degreeReduced( epsilon: number ): Quadratic | null {
    epsilon = epsilon || 0; // if not provided, use an exact version
    const controlA = scratchVector1.set( this._control1 ).multiplyScalar( 3 ).subtract( this._start ).divideScalar( 2 );
    const controlB = scratchVector2.set( this._control2 ).multiplyScalar( 3 ).subtract( this._end ).divideScalar( 2 );
    const difference = scratchVector3.set( controlA ).subtract( controlB );
    if ( difference.magnitude <= epsilon ) {
      return new Quadratic(
        this._start,
        controlA.average( controlB ), // average the control points for stability. they should be almost identical
        this._end
      );
    }
    else {
      // the two options for control points are too far away, this curve isn't easily reducible.
      return null;
    }
  }

  /**
   * Returns the contribution to the signed area computed using Green's Theorem, with P=-y/2 and Q=x/2.
   *
   * NOTE: This is this segment's contribution to the line integral (-y/2 dx + x/2 dy).
   */
  public getSignedAreaFragment(): number {
    return 1 / 20 * (
      this._start.x * ( 6 * this._control1.y + 3 * this._control2.y + this._end.y ) +
      this._control1.x * ( -6 * this._start.y + 3 * this._control2.y + 3 * this._end.y ) +
      this._control2.x * ( -3 * this._start.y - 3 * this._control1.y + 6 * this._end.y ) +
      this._end.x * ( -this._start.y - 3 * this._control1.y - 6 * this._control2.y )
    );
  }

  /**
   * Returns a reversed copy of this segment (mapping the parametrization from [0,1] => [1,0]).
   */
  public reversed(): Cubic {
    return new Cubic( this._end, this._control2, this._control1, this._start );
  }

  /**
   * If it exists, returns the point where the cubic curve self-intersects.
   *
   * @returns - Null if there is no intersection
   */
  public getSelfIntersection(): SegmentIntersection | null {
    // We split the cubic into monotone sections (which can't self-intersect), then check these for intersections
    const tExtremes = this.getInteriorExtremaTs();
    const fullExtremes = [ 0 ].concat( tExtremes ).concat( [ 1 ] );
    const segments = this.subdivisions( tExtremes );
    if ( segments.length < 3 ) {
      return null;
    }

    for ( let i = 0; i < segments.length; i++ ) {
      const aSegment = segments[ i ];
      for ( let j = i + 1; j < segments.length; j++ ) {
        const bSegment = segments[ j ];

        const intersections = BoundsIntersection.intersect( aSegment, bSegment );
        assert && assert( intersections.length < 2 );

        if ( intersections.length ) {
          const intersection = intersections[ 0 ];
          // Exclude endpoints overlapping
          if ( intersection.aT > 1e-7 && intersection.aT < ( 1 - 1e-7 ) &&
               intersection.bT > 1e-7 && intersection.bT < ( 1 - 1e-7 ) ) {
            // Remap parametric values from the subdivided segments to the main segment
            const aT = fullExtremes[ i ] + intersection.aT * ( fullExtremes[ i + 1 ] - fullExtremes[ i ] );
            const bT = fullExtremes[ j ] + intersection.bT * ( fullExtremes[ j + 1 ] - fullExtremes[ j ] );
            return new SegmentIntersection( intersection.point, aT, bT );
          }
        }

      }
    }

    return null;
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   */
  public serialize(): SerializedCubic {
    return {
      type: 'Cubic',
      startX: this._start.x,
      startY: this._start.y,
      control1X: this._control1.x,
      control1Y: this._control1.y,
      control2X: this._control2.x,
      control2Y: this._control2.y,
      endX: this._end.x,
      endY: this._end.y
    };
  }

  /**
   * Determine whether two lines overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * @param segment
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                             in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public getOverlaps( segment: Segment, epsilon = 1e-6 ): Overlap[] | null {
    if ( segment instanceof Cubic ) {
      return Cubic.getOverlaps( this, segment );
    }

    return null;
  }

  /**
   * Returns a Cubic from the serialized representation.
   */
  public static override deserialize( obj: SerializedCubic ): Cubic {
    assert && assert( obj.type === 'Cubic' );

    return new Cubic( new Vector2( obj.startX, obj.startY ), new Vector2( obj.control1X, obj.control1Y ), new Vector2( obj.control2X, obj.control2Y ), new Vector2( obj.endX, obj.endY ) );
  }

  /**
   * Finds what t values the cubic extrema are at (if any). This is just the 1-dimensional case, used for multiple purposes
   */
  public static extremaT( v0: number, v1: number, v2: number, v3: number ): number[] {
    if ( v0 === v1 && v0 === v2 && v0 === v3 ) {
      return [];
    }

    // coefficients of derivative
    const a = -3 * v0 + 9 * v1 - 9 * v2 + 3 * v3;
    const b = 6 * v0 - 12 * v1 + 6 * v2;
    const c = -3 * v0 + 3 * v1;

    return _.filter( solveQuadraticRootsReal( a, b, c ), isBetween0And1 );
  }

  /**
   * Determine whether two Cubics overlap over a continuous section, and if so finds the a,b pair such that
   * p( t ) === q( a * t + b ).
   *
   * NOTE: for this particular function, we assume we're not degenerate. Things may work if we can be degree-reduced
   * to a quadratic, but generally that shouldn't be done.
   *
   * @param cubic1
   * @param cubic2
   * @param [epsilon] - Will return overlaps only if no two corresponding points differ by this amount or more
   *                    in one component.
   * @returns - The solution, if there is one (and only one)
   */
  public static getOverlaps( cubic1: Cubic, cubic2: Cubic, epsilon = 1e-6 ): Overlap[] {

    /*
     * For a 1-dimensional cubic bezier, we have the formula:
     *
     *                            [  0  0  0  0 ]   [ p0 ]
     * p( t ) = [ 1 t t^2 t^3 ] * [ -3  3  0  0 ] * [ p1 ]
     *                            [  3 -6  3  0 ]   [ p2 ]
     *                            [ -1  3 -3  1 ]   [ p3 ]
     *
     * where p0,p1,p2,p3 are the control values (start,control1,control2,end). We want to see if a linear-mapped cubic:
     *
     *                                              [ 1 b b^2  b^3  ]   [  0  0  0  0 ]   [ q0 ]
     * p( t ) =? q( a * t + b ) = [ 1 t t^2 t^3 ] * [ 0 a 2ab 3ab^2 ] * [ -3  3  0  0 ] * [ q1 ]
     *                                              [ 0 0 a^2 3a^2b ]   [  3 -6  3  0 ]   [ q2 ]
     *                                              [ 0 0  0   a^3  ]   [ -1  3 -3  1 ]   [ q3 ]
     *
     * (is it equal to the second cubic if we can find a linear way to map its input t-value?)
     *
     * For simplicity and efficiency, we'll precompute the multiplication of the bezier matrix:
     * [ p0s ]    [  1   0   0   0 ]   [ p0 ]
     * [ p1s ] == [ -3   3   0   0 ] * [ p1 ]
     * [ p2s ]    [  3  -6   3   0 ]   [ p2 ]
     * [ p3s ]    [ -1   3  -3   1 ]   [ p3 ]
     *
     * Leaving our computation to solve for a,b such that:
     *
     * [ p0s ]    [ 1 b b^2  b^3  ]   [ q0s ]
     * [ p1s ] == [ 0 a 2ab 3ab^2 ] * [ q1s ]
     * [ p2s ]    [ 0 0 a^2 3a^2b ]   [ q2s ]
     * [ p3s ]    [ 0 0  0   a^3  ]   [ q3s ]
     *
     * The subproblem of computing possible a,b pairs will be left to Segment.polynomialGetOverlapCubic and its
     * reductions (if p3s/q3s are zero, they aren't fully cubic beziers and can be degree reduced, which is handled).
     *
     * Then, given an a,b pair, we need to ensure the above formula is satisfied (approximately, due to floating-point
     * arithmetic).
     */

    const noOverlap: Overlap[] = [];

    // Efficiently compute the multiplication of the bezier matrix:
    const p0x = cubic1._start.x;
    const p1x = -3 * cubic1._start.x + 3 * cubic1._control1.x;
    const p2x = 3 * cubic1._start.x - 6 * cubic1._control1.x + 3 * cubic1._control2.x;
    const p3x = -1 * cubic1._start.x + 3 * cubic1._control1.x - 3 * cubic1._control2.x + cubic1._end.x;
    const p0y = cubic1._start.y;
    const p1y = -3 * cubic1._start.y + 3 * cubic1._control1.y;
    const p2y = 3 * cubic1._start.y - 6 * cubic1._control1.y + 3 * cubic1._control2.y;
    const p3y = -1 * cubic1._start.y + 3 * cubic1._control1.y - 3 * cubic1._control2.y + cubic1._end.y;
    const q0x = cubic2._start.x;
    const q1x = -3 * cubic2._start.x + 3 * cubic2._control1.x;
    const q2x = 3 * cubic2._start.x - 6 * cubic2._control1.x + 3 * cubic2._control2.x;
    const q3x = -1 * cubic2._start.x + 3 * cubic2._control1.x - 3 * cubic2._control2.x + cubic2._end.x;
    const q0y = cubic2._start.y;
    const q1y = -3 * cubic2._start.y + 3 * cubic2._control1.y;
    const q2y = 3 * cubic2._start.y - 6 * cubic2._control1.y + 3 * cubic2._control2.y;
    const q3y = -1 * cubic2._start.y + 3 * cubic2._control1.y - 3 * cubic2._control2.y + cubic2._end.y;

    // Determine the candidate overlap (preferring the dimension with the largest variation)
    const xSpread = Math.abs( Math.max( cubic1._start.x, cubic1._control1.x, cubic1._control2.x, cubic1._end.x,
                                cubic1._start.x, cubic1._control1.x, cubic1._control2.x, cubic1._end.x ) -
                              Math.min( cubic1._start.x, cubic1._control1.x, cubic1._control2.x, cubic1._end.x,
                                cubic1._start.x, cubic1._control1.x, cubic1._control2.x, cubic1._end.x ) );
    const ySpread = Math.abs( Math.max( cubic1._start.y, cubic1._control1.y, cubic1._control2.y, cubic1._end.y,
                                cubic1._start.y, cubic1._control1.y, cubic1._control2.y, cubic1._end.y ) -
                              Math.min( cubic1._start.y, cubic1._control1.y, cubic1._control2.y, cubic1._end.y,
                                cubic1._start.y, cubic1._control1.y, cubic1._control2.y, cubic1._end.y ) );
    const xOverlap = Segment.polynomialGetOverlapCubic( p0x, p1x, p2x, p3x, q0x, q1x, q2x, q3x );
    const yOverlap = Segment.polynomialGetOverlapCubic( p0y, p1y, p2y, p3y, q0y, q1y, q2y, q3y );
    let overlap;
    if ( xSpread > ySpread ) {
      overlap = ( xOverlap === null || xOverlap === true ) ? yOverlap : xOverlap;
    }
    else {
      overlap = ( yOverlap === null || yOverlap === true ) ? xOverlap : yOverlap;
    }
    if ( overlap === null || overlap === true ) {
      return noOverlap; // No way to pin down an overlap
    }

    const a = overlap.a;
    const b = overlap.b;

    // Premultiply a few values
    const aa = a * a;
    const aaa = a * a * a;
    const bb = b * b;
    const bbb = b * b * b;
    const ab2 = 2 * a * b;
    const abb3 = 3 * a * bb;
    const aab3 = 3 * aa * b;

    // Compute cubic coefficients for the difference between p(t) and q(a*t+b)
    const d0x = q0x + b * q1x + bb * q2x + bbb * q3x - p0x;
    const d1x = a * q1x + ab2 * q2x + abb3 * q3x - p1x;
    const d2x = aa * q2x + aab3 * q3x - p2x;
    const d3x = aaa * q3x - p3x;
    const d0y = q0y + b * q1y + bb * q2y + bbb * q3y - p0y;
    const d1y = a * q1y + ab2 * q2y + abb3 * q3y - p1y;
    const d2y = aa * q2y + aab3 * q3y - p2y;
    const d3y = aaa * q3y - p3y;

    // Find the t values where extremes lie in the [0,1] range for each 1-dimensional cubic. We do this by
    // differentiating the cubic and finding the roots of the resulting quadratic.
    const xRoots = solveQuadraticRootsReal( 3 * d3x, 2 * d2x, d1x );
    const yRoots = solveQuadraticRootsReal( 3 * d3y, 2 * d2y, d1y );
    const xExtremeTs = _.uniq( [ 0, 1 ].concat( xRoots !== null ? xRoots.filter( isBetween0And1 ) : [] ) );
    const yExtremeTs = _.uniq( [ 0, 1 ].concat( yRoots !== null ? yRoots.filter( isBetween0And1 ) : [] ) );

    // Examine the single-coordinate distances between the "overlaps" at each extreme T value. If the distance is larger
    // than our epsilon, then the "overlap" would not be valid.
    for ( let i = 0; i < xExtremeTs.length; i++ ) {
      const t = xExtremeTs[ i ];
      if ( Math.abs( ( ( d3x * t + d2x ) * t + d1x ) * t + d0x ) > epsilon ) {
        return noOverlap;
      }
    }
    for ( let i = 0; i < yExtremeTs.length; i++ ) {
      const t = yExtremeTs[ i ];
      if ( Math.abs( ( ( d3y * t + d2y ) * t + d1y ) * t + d0y ) > epsilon ) {
        return noOverlap;
      }
    }

    const qt0 = b;
    const qt1 = a + b;

    // TODO: do we want an epsilon in here to be permissive? https://github.com/phetsims/kite/issues/76
    if ( ( qt0 > 1 && qt1 > 1 ) || ( qt0 < 0 && qt1 < 0 ) ) {
      return noOverlap;
    }

    return [ new Overlap( a, b ) ];
  }

  // Degree of this polynomial (cubic)
  public degree!: number;
}

Cubic.prototype.degree = 3;

kite.register( 'Cubic', Cubic );