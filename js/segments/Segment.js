// Copyright 2013-2020, University of Colorado Boulder

/**
 * A segment represents a specific curve with a start and end.
 *
 * Each segment is treated parametrically, where t=0 is the start of the segment, and t=1 is the end. Values of t
 * between those represent points along the segment.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import TinyEmitter from '../../../axon/js/TinyEmitter.js';
import Bounds2 from '../../../dot/js/Bounds2.js';
import Utils from '../../../dot/js/Utils.js';
import merge from '../../../phet-core/js/merge.js';
import kite from '../kite.js';
import BoundsIntersection from '../ops/BoundsIntersection.js';

class Segment {
  /**
   *
   * Each segment should implement the following API.
   *
   * properties (backed by ES5 getters, created usually lazily):
   *
   *   start {Vector2}
   *     The start point of the segment, parametrically at t=0.
   *
   *   end {Vector2}
   *     The end point of the segment, parametrically at t=1.
   *
   *   startTangent {Vector2}
   *     The normalized tangent vector to the segment at its start point, pointing in the direction of motion
   *     (form start to end).
   *
   *   endTangent {Vector2}
   *     The normalized tangent vector to the segment at its end point, pointing in the direction of motion
   *     (form start to end).
   *
   *   bounds {Bounds2}
   *     The bounding box for the segment.
   *
   * methods:
   *
   *   positionAt( t: {number} ) : {Vector2}
   *     Returns the position parametrically, with 0 <= t <= 1. NOTE that this function doesn't keep a constant
   *     magnitude tangent.
   *
   *   tangentAt( t: {number} ) : {Vector2}
   *     Returns the non-normalized tangent (dx/dt, dy/dt) of this segment at the parametric value of t, with
   *     0 <= t <= 1.
   *
   *   curvatureAt( t: {number} ) : {number}
   *     Returns the signed curvature (positive for visual clockwise - mathematical counterclockwise)
   *
   *   subdivided( t: {number} ) : {Array.<Segment>}
   *     Returns an array with up to 2 sub-segments, split at the parametric t value. The segments together should make
   *     the same shape as the original segment.
   *
   *   getSVGPathFragment()     - returns a string containing the SVG path. assumes that the start point is already
   *                              provided, so anything that calls this needs to put the M calls first
   *   strokeLeft( lineWidth )  - returns an array of segments that will draw an offset curve on the logical left side
   *   strokeRight( lineWidth ) - returns an array of segments that will draw an offset curve on the logical right side
   *   windingIntersection      - returns the winding number for intersection with a ray
   *   getInteriorExtremaTs     - returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on
   *                              these will result in monotonic segments
   *   intersection( ray )      - returns a list of intersections between the segment and the ray. Intersections will be
   *                              of the {RayIntersection} type (see documentation there for details)
   *   getBounds() : {Bounds2} - Returns a {Bounds2} representing the bounding box for the segment.
   *   getSignedAreaFragment(): {number} - Returns signed area contribution for this segment using Green's Theorem
   *   getNondegenerateSegments() : {Array.<Segment>} - Returns a list of non-degenerate segments that are equivalent to
   *                                                    this segment. Generally gets rid (or simplifies) invalid or
   *                                                    repeated segments.
   *   writeToContext( context ) - draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   *   transformed( matrix )     - returns a new segment that represents this segment after transformation by the matrix
   */
  constructor() {
    this.invalidationEmitter = new TinyEmitter();
  }

  /**
   * Will return true if the start/end tangents are purely vertical or horizontal. If all of the segments of a shape
   * have this property, then the only line joins will be a multiple of pi/2 (90 degrees), and so all of the types of
   * line joins will have the same bounds. This means that the stroked bounds will just be a pure dilation of the
   * regular bounds, by lineWidth / 2.
   * @public
   *
   * @returns {boolean}
   */
  areStrokedBoundsDilated() {
    const epsilon = 0.0000001;

    // If the derivative at the start/end are pointing in a cardinal direction (north/south/east/west), then the
    // endpoints won't trigger non-dilated bounds, and the interior of the curve will not contribute.
    return Math.abs( this.startTangent.x * this.startTangent.y ) < epsilon && Math.abs( this.endTangent.x * this.endTangent.y ) < epsilon;
  }

  /**
   * TODO: override everywhere so this isn't necessary (it's not particularly efficient!)
   * @public
   *
   * @param {Matrix3} matrix
   * @returns {Bounds2}
   */
  getBoundsWithTransform( matrix ) {
    const transformedSegment = this.transformed( matrix );
    return transformedSegment.getBounds();
  }

  /**
   * Extracts a slice of a segment, based on the parametric value.
   * @public
   *
   * Given that this segment is represented by the interval [0,1]
   *
   * @param {number} t0
   * @param {number} t1
   * @returns {Segment}
   */
  slice( t0, t1 ) {
    assert && assert( t0 >= 0 && t0 <= 1 && t1 >= 0 && t1 <= 1, 'Parametric value out of range' );
    assert && assert( t0 < t1 );

    let segment = this; // eslint-disable-line consistent-this
    if ( t1 < 1 ) {
      segment = segment.subdivided( t1 )[ 0 ];
    }
    if ( t0 > 0 ) {
      segment = segment.subdivided( Utils.linear( 0, t1, 0, 1, t0 ) )[ 1 ];
    }
    return segment;
  }

  /**
   * @public
   *
   * @param {Array.<number>} tList - list of sorted t values from 0 <= t <= 1
   * @returns {Array.<Segment>}
   */
  subdivisions( tList ) {
    // this could be solved by recursion, but we don't plan on the JS engine doing tail-call optimization
    let right = this; // eslint-disable-line consistent-this
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
        tList[ j ] = Utils.linear( t, 1, 0, 1, tList[ j ] );
      }
    }
    result.push( right );
    return result;
  }

  /**
   * Return an array of segments from breaking this segment into monotone pieces
   * @public
   *
   * @returns {Array.<Segment>}
   */
  subdividedIntoMonotone() {
    return this.subdivisions( this.getInteriorExtremaTs() );
  }

  /**
   * Determines if the segment is sufficiently flat (given certain epsilon values)
   * @public
   *
   * @param {number} distanceEpsilon - controls level of subdivision by attempting to ensure a maximum (squared)
   *                                   deviation from the curve
   * @param {number} curveEpsilon - controls level of subdivision by attempting to ensure a maximum curvature change
   *                                between segments
   * @returns {boolean}
   */
  isSufficientlyFlat( distanceEpsilon, curveEpsilon ) {
    const start = this.start;
    const middle = this.positionAt( 0.5 );
    const end = this.end;

    return Segment.isSufficientlyFlat( distanceEpsilon, curveEpsilon, start, middle, end );
  }

  /**
   * Returns the (sometimes approximate) arc length of the segment.
   * @public
   *
   * @param {number} [distanceEpsilon]
   * @param {number} [curveEpsilon]
   * @param {number} [maxLevels]
   * @returns {number}
   */
  getArcLength( distanceEpsilon, curveEpsilon, maxLevels ) {
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
   * @public
   *
   * As always, this is fairly approximate depending on the type of segment.
   *
   * @param {Array.<number>} lineDash
   * @param {number} lineDashOffset
   * @param {number} distanceEpsilon - controls level of subdivision by attempting to ensure a maximum (squared)
   *                                   deviation from the curve
   * @param {number} curveEpsilon - controls level of subdivision by attempting to ensure a maximum curvature change
   *                                between segments
   * @returns {Object} - Of the form: {
   *   values: {Array.<number>} - Parametric (t) values for where dash boundaries exist
   *   arcLength: {number} - Total arc length for this segment
   *   initiallyInside: {boolean} - Whether the start of the segment is inside a dash (instead of a gap)
   * }
   */
  getDashValues( lineDash, lineDashOffset, distanceEpsilon, curveEpsilon ) {
    assert && assert( lineDash.length > 0, 'Do not call with an empty dash array' );

    const self = this;

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

    function nextDashIndex() {
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
    ( function recur( t0, t1, p0, p1, depth ) {
      // Compute the t/position at the midpoint t value
      const tMid = ( t0 + t1 ) / 2;
      const pMid = self.positionAt( tMid );

      // If it's flat enough (or we hit our recursion limit), process it
      if ( depth > 14 || Segment.isSufficientlyFlat( distanceEpsilon, curveEpsilon, p0, pMid, p1 ) ) {
        // Estimate length
        const totalLength = p0.distance( pMid ) + pMid.distance( p1 );
        arcLength += totalLength;

        // While we are longer than the remaining amount for the next dash change.
        let lengthLeft = totalLength;
        while ( dashOffset + lengthLeft >= lineDash[ dashIndex ] ) {
          // Compute the t (for now, based on the total length for ease)
          const t = Utils.linear( 0, totalLength, t0, t1, totalLength - lengthLeft + lineDash[ dashIndex ] - dashOffset );

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
   * @public
   *
   * @param {Object} [options] -           with the following options provided:
   *  - minLevels:                       how many levels to force subdivisions
   *  - maxLevels:                       prevent subdivision past this level
   *  - distanceEpsilon (optional null): controls level of subdivision by attempting to ensure a maximum (squared) deviation from the curve
   *  - curveEpsilon (optional null):    controls level of subdivision by attempting to ensure a maximum curvature change between segments
   *  - pointMap (optional):             function( Vector2 ) : Vector2, represents a (usually non-linear) transformation applied
   *  - methodName (optional):           if the method name is found on the segment, it is called with the expected signature function( options ) : Array[Segment]
   *                                     instead of using our brute-force logic
   * @param {number} [minLevels] -   how many levels to force subdivisions
   * @param {number} [maxLevels] -   prevent subdivision past this level
   * @param {Array.<Segment>} [segments]
   * @param {Vector2} [start]
   * @param {Vector2} [end]
   * @returns {Array.<Line>}
   */
  toPiecewiseLinearSegments( options, minLevels, maxLevels, segments, start, end ) {
    // for the first call, initialize min/max levels from our options
    minLevels = minLevels === undefined ? options.minLevels : minLevels;
    maxLevels = maxLevels === undefined ? options.maxLevels : maxLevels;
    segments = segments || [];
    const pointMap = options.pointMap || identityFunction;

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
        options.distanceEpsilon === null ? Number.POSITIVE_INFINITY : options.distanceEpsilon,
        options.curveEpsilon === null ? Number.POSITIVE_INFINITY : options.curveEpsilon
      );
    }

    if ( finished ) {
      segments.push( new kite.Line( start, end ) );
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
   * @public
   *
   * @param {Object} [options]
   * @returns {Array.<Segment>}
   */
  toPiecewiseLinearOrArcSegments( options ) {
    options = merge( {
      minLevels: 2,
      maxLevels: 7,
      curvatureThreshold: 0.02,
      errorThreshold: 10,
      errorPoints: [ 0.25, 0.75 ]
    }, options );

    const segments = [];
    this.toPiecewiseLinearOrArcRecursion( options, options.minLevels, options.maxLevels, segments,
      0, 1,
      this.positionAt( 0 ), this.positionAt( 1 ),
      this.curvatureAt( 0 ), this.curvatureAt( 1 ) );
    return segments;
  }

  /**
   * Helper function for toPiecewiseLinearOrArcSegments.
   * @private
   *
   * @param {Object} [options]
   * @param {number} minLevels
   * @param {number} maxLevels
   * @param {Array.<Segment>} segments - We will push resulting segments to here
   * @param {number} startT
   * @param {number} endT
   * @param {Vector2} startPoint
   * @param {Vector2} endPoint
   * @param {number} startCurvature
   * @param {number} endCurvature
   */
  toPiecewiseLinearOrArcRecursion( options, minLevels, maxLevels, segments, startT, endT, startPoint, endPoint, startCurvature, endCurvature ) {
    const middleT = ( startT + endT ) / 2;
    const middlePoint = this.positionAt( middleT );
    const middleCurvature = this.curvatureAt( middleT );

    if ( maxLevels <= 0 || ( minLevels <= 0 && Math.abs( startCurvature - middleCurvature ) + Math.abs( middleCurvature - endCurvature ) < options.curvatureThreshold * 2 ) ) {
      const segment = kite.Arc.createFromPoints( startPoint, middlePoint, endPoint );
      let needsSplit = false;
      if ( segment instanceof kite.Arc ) {
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

  /**
   * Returns a Shape containing just this one segment.
   * @public
   *
   * @returns {Shape}
   */
  toShape() {
    return new kite.Shape( [ new kite.Subpath( [ this ] ) ] );
  }

  /**
   * List of { segment: ..., t: ..., closestPoint: ..., distanceSquared: ... } (since there can be duplicates), threshold is used for subdivision,
   * where it will exit if all of the segments are shorter than the threshold
   * @public
   *
   * TODO: solve segments to determine this analytically!
   *
   * @param {Array.<Segment>} segments
   * @param {Vector2} point
   * @param {number} threshold
   * @returns {Array.<Object>}
   */
  static closestToPoint( segments, point, threshold ) {
    const thresholdSquared = threshold * threshold;
    let items = [];
    let bestList = [];
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    let thresholdOk = false;

    _.each( segments, segment => {
      // if we have an explicit computation for this segment, use it
      if ( segment.explicitClosestToPoint ) {
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

      _.each( curItems, item => {
        if ( item.minDistanceSquared > bestDistanceSquared ) {
          return; // drop this item
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
      } );
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
   * @public
   *
   * Given a 1-dimensional cubic bezier determined by the control points p0, p1, p2 and p3, compute:
   *
   * [ p0s ]    [  1   0   0   0 ]   [ p0 ]
   * [ p1s ] == [ -3   3   0   0 ] * [ p1 ]
   * [ p2s ] == [  3  -6   3   0 ] * [ p2 ]
   * [ p3s ]    [ -1   3  -3   1 ]   [ p3 ]
   *
   * see Cubic.getOverlaps for more information.
   *
   * @param {number} p0s
   * @param {number} p1s
   * @param {number} p2s
   * @param {number} p3s
   * @param {number} q0s
   * @param {number} q1s
   * @param {number} q2s
   * @param {number} q3s
   * @returns {null|true|{a:number,b:number}} - null if no solution, true if every a,b pair is a solution, otherwise
   *                                            the single solution
   */
  static polynomialGetOverlapCubic( p0s, p1s, p2s, p3s, q0s, q1s, q2s, q3s ) {
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
   * @public
   *
   * Given a 1-dimensional quadratic bezier determined by the control points p0, p1, p2, compute:
   *
   * [ p0s ]    [  1   0   0 ]   [ p0 ]
   * [ p1s ] == [ -2   2   0 ] * [ p1 ]
   * [ p2s ]    [  2  -2   3 ] * [ p2 ]
   *
   * see Quadratic.getOverlaps for more information.
   *
   * @param {number} p0s
   * @param {number} p1s
   * @param {number} p2s
   * @param {number} q0s
   * @param {number} q1s
   * @param {number} q2s
   * @returns {null|true|{a:number,b:number}} - null if no solution, true if every a,b pair is a solution, otherwise
   *                                            the single solution
   */
  static polynomialGetOverlapQuadratic( p0s, p1s, p2s, q0s, q1s, q2s ) {
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
   * @public
   *
   * Given a line determined by the control points p0, p1, compute:
   *
   * [ p0s ] == [  1   0 ] * [ p0 ]
   * [ p1s ] == [ -1   1 ] * [ p1 ]
   *
   * see Quadratic/Cubic.getOverlaps for more information.
   *
   * @param {number} p0s
   * @param {number} p1s
   * @param {number} q0s
   * @param {number} q1s
   * @returns {null|true|{a:number,b:number}} - null if no solution, true if every a,b pair is a solution, otherwise
   *                                            the single solution
   */
  static polynomialGetOverlapLinear( p0s, p1s, q0s, q1s ) {
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
   * Returns all of the distinct (non-endpoint) intersections between the two segments.
   * @public
   *
   * @param {Segment} a
   * @param {Segment} b
   * @returns {Array.<SegmentIntersection>}
   */
  static intersect( a, b ) {
    if ( kite.Line && a instanceof kite.Line && b instanceof kite.Line ) {
      return kite.Line.intersect( a, b );
    }
    else if ( kite.Line && a instanceof kite.Line ) {
      return kite.Line.intersectOther( a, b );
    }
    else if ( kite.Line && b instanceof kite.Line ) {
      // need to swap our intersections, since 'b' is the line
      return kite.Line.intersectOther( b, a ).map( swapSegmentIntersection );
    }
    else if ( kite.Arc && a instanceof kite.Arc && b instanceof kite.Arc ) {
      return kite.Arc.intersect( a, b );
    }
    else {
      return BoundsIntersection.intersect( a, b );
    }
  }

  /**
   * Returns a Segment from the serialized representation.
   * @public
   *
   * @param {Object} obj
   * @returns {Segment}
   */
  static deserialize( obj ) {
    assert && assert( obj.type && kite[ obj.type ] && kite[ obj.type ].deserialize );

    return kite[ obj.type ].deserialize( obj );
  }

  /**
   * Determines if the start/middle/end points are representative of a sufficiently flat segment
   * (given certain epsilon values)
   * @public
   *
   * @param {Vector2} start
   * @param {Vector2} middle
   * @param {Vector2} end
   * @param {number} distanceEpsilon - controls level of subdivision by attempting to ensure a maximum (squared)
   *                                   deviation from the curve
   * @param {number} curveEpsilon - controls level of subdivision by attempting to ensure a maximum curvature change
   *                                between segments
   * @returns {boolean}
   */
  static isSufficientlyFlat( distanceEpsilon, curveEpsilon, start, middle, end ) {
    // flatness criterion: A=start, B=end, C=midpoint, d0=distance from AB, d1=||B-A||, subdivide if d0/d1 > sqrt(epsilon)
    if ( Utils.distToSegmentSquared( middle, start, end ) / start.distanceSquared( end ) > curveEpsilon ) {
      return false;
    }
    // deviation criterion
    if ( Utils.distToSegmentSquared( middle, start, end ) > distanceEpsilon ) {
      return false;
    }
    return true;
  }
}

kite.register( 'Segment', Segment );

/**
 * Returns itself
 * @param {Vector2} x
 * @returns {Vector2}
 */
const identityFunction = function identityFunction( x ) { return x; };

function swapSegmentIntersection( segmentIntersection ) {
  return segmentIntersection.getSwapped();
}

export default Segment;