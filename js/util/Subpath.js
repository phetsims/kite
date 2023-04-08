// Copyright 2013-2023, University of Colorado Boulder

/**
 * A Canvas-style stateful (mutable) subpath, which tracks segments in addition to the points.
 *
 * See http://www.w3.org/TR/2dcontext/#concept-path
 * for the path / subpath Canvas concept.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import TinyEmitter from '../../../axon/js/TinyEmitter.js';
import Bounds2 from '../../../dot/js/Bounds2.js';
import Vector2 from '../../../dot/js/Vector2.js';
import { Arc, kite, Line, LineStyles, Segment } from '../imports.js';

class Subpath {
  /**
   * @public
   *
   * NOTE: No arguments required (they are usually used for copy() usage or creation with new segments)
   *
   * @param {Array.<Segment>} [segments]
   * @param {Array.<Vector2>} [points]
   * @param {boolean} [closed]
   */
  constructor( segments, points, closed ) {
    this.invalidatedEmitter = new TinyEmitter();
    // @public {Array.<Segment>}
    this.segments = [];

    // @public {Array.<Vector2>} recombine points if necessary, based off of start points of segments + the end point
    // of the last segment
    this.points = points || ( ( segments && segments.length ) ? _.map( segments, segment => segment.start ).concat( segments[ segments.length - 1 ].end ) : [] );

    // @public {boolean}
    this.closed = !!closed;

    // cached stroked shape (so hit testing can be done quickly on stroked shapes)
    this._strokedSubpaths = null; // @private {Array.<Subpath>|null}
    this._strokedSubpathsComputed = false; // @private {boolean}
    this._strokedStyles = null; // @private {LineStyles|null}

    // {Bounds2|null} - If non-null, the bounds of the subpath
    this._bounds = null;

    // @private {function} - Invalidation listener
    this._invalidateListener = this.invalidate.bind( this );

    // @private {boolean} - So we can invalidate all of the points without firing invalidation tons of times
    this._invalidatingPoints = false;

    // Add all segments directly (hooks up invalidation listeners properly)
    if ( segments ) {
      for ( let i = 0; i < segments.length; i++ ) {
        _.each( segments[ i ].getNondegenerateSegments(), segment => {
          this.addSegmentDirectly( segment );
        } );
      }
    }
  }


  /**
   * Returns the bounds of this subpath. It is the bounding-box union of the bounds of each segment contained.
   * @public
   *
   * @returns {Bounds2}
   */
  getBounds() {
    if ( this._bounds === null ) {
      const bounds = Bounds2.NOTHING.copy();
      _.each( this.segments, segment => {
        bounds.includeBounds( segment.getBounds() );
      } );
      this._bounds = bounds;
    }
    return this._bounds;
  }

  get bounds() { return this.getBounds(); }

  /**
   * Returns the (sometimes approximate) arc length of the subpath.
   * @public
   *
   * @param {number} [distanceEpsilon]
   * @param {number} [curveEpsilon]
   * @param {number} [maxLevels]
   * @returns {number}
   */
  getArcLength( distanceEpsilon, curveEpsilon, maxLevels ) {
    let length = 0;
    for ( let i = 0; i < this.segments.length; i++ ) {
      length += this.segments[ i ].getArcLength( distanceEpsilon, curveEpsilon, maxLevels );
    }
    return length;
  }

  /**
   * Returns an immutable copy of this subpath
   * @public
   *
   * @returns {Subpath}
   */
  copy() {
    return new Subpath( this.segments.slice( 0 ), this.points.slice( 0 ), this.closed );
  }

  /**
   * Invalidates all segments (then ourself), since some points in segments may have been changed.
   * @public
   */
  invalidatePoints() {
    this._invalidatingPoints = true;

    const numSegments = this.segments.length;
    for ( let i = 0; i < numSegments; i++ ) {
      this.segments[ i ].invalidate();
    }

    this._invalidatingPoints = false;
    this.invalidate();
  }

  /**
   * Trigger invalidation (usually for our Shape)
   * @public (kite-internal)
   */
  invalidate() {
    if ( !this._invalidatingPoints ) {
      this._bounds = null;
      this._strokedSubpathsComputed = false;
      this.invalidatedEmitter.emit();
    }
  }

  /**
   * Adds a point to this subpath
   * @public
   *
   * @param {Vector2} point
   * @returns {Subpath}
   */
  addPoint( point ) {
    this.points.push( point );

    return this; // allow chaining
  }

  /**
   * Adds a segment directly
   * @private - REALLY! Make sure we invalidate() after this is called
   *
   * @param {Segment} segment
   * @returns {Subpath}
   */
  addSegmentDirectly( segment ) {
    assert && assert( segment.start.isFinite(), 'Segment start is infinite' );
    assert && assert( segment.end.isFinite(), 'Segment end is infinite' );
    assert && assert( segment.startTangent.isFinite(), 'Segment startTangent is infinite' );
    assert && assert( segment.endTangent.isFinite(), 'Segment endTangent is infinite' );
    assert && assert( segment.bounds.isEmpty() || segment.bounds.isFinite(), 'Segment bounds is infinite and non-empty' );
    this.segments.push( segment );

    // Hook up an invalidation listener, so if this segment is invalidated, it will invalidate our subpath!
    // NOTE: if we add removal of segments, we'll need to remove these listeners, or we'll leak!
    segment.invalidationEmitter.addListener( this._invalidateListener );

    return this; // allow chaining
  }

  /**
   * Adds a segment to this subpath
   * @public
   *
   * @param {Segment} segment
   * @returns {Subpath}
   */
  addSegment( segment ) {
    const nondegenerateSegments = segment.getNondegenerateSegments();
    const numNondegenerateSegments = nondegenerateSegments.length;
    for ( let i = 0; i < numNondegenerateSegments; i++ ) {
      this.addSegmentDirectly( segment );
    }
    this.invalidate(); // need to invalidate after addSegmentDirectly

    return this; // allow chaining
  }

  /**
   * Adds a line segment from the start to end (if non-zero length) and marks the subpath as closed.
   * NOTE: normally you just want to mark the subpath as closed, and not generate the closing segment this way?
   * @public
   */
  addClosingSegment() {
    if ( this.hasClosingSegment() ) {
      const closingSegment = this.getClosingSegment();
      this.addSegmentDirectly( closingSegment );
      this.invalidate(); // need to invalidate after addSegmentDirectly
      this.addPoint( this.getFirstPoint() );
      this.closed = true;
    }
  }

  /**
   * Sets this subpath to be a closed path
   * @public
   */
  close() {
    this.closed = true;

    // If needed, add a connecting "closing" segment
    this.addClosingSegment();
  }

  /**
   * Returns the numbers of points in this subpath
   * @public
   *
   * @returns {number}
   */
  getLength() {
    return this.points.length;
  }

  /**
   * Returns the first point of this subpath
   * @public
   *
   * @returns {Vector2}
   */
  getFirstPoint() {
    return _.first( this.points );
  }

  /**
   * Returns the last point of this subpath
   * @public
   *
   * @returns {Vector2}
   */
  getLastPoint() {
    return _.last( this.points );
  }

  /**
   * Returns the first segment of this subpath
   * @public
   *
   * @returns {Segment}
   */
  getFirstSegment() {
    return _.first( this.segments );
  }

  /**
   * Returns the last segment of this subpath
   * @public
   *
   * @returns {Segment}
   */
  getLastSegment() {
    return _.last( this.segments );
  }

  /**
   * Returns segments that include the "filled" area, which may include an extra closing segment if necessary.
   * @public
   *
   * @returns {Array.<Segment>}
   */
  getFillSegments() {
    const segments = this.segments.slice();
    if ( this.hasClosingSegment() ) {
      segments.push( this.getClosingSegment() );
    }
    return segments;
  }

  /**
   * Determines if this subpath is drawable, i.e. if it contains asny segments
   * @public
   *
   * @returns {boolean}
   */
  isDrawable() {
    return this.segments.length > 0;
  }

  /**
   * Determines if this subpath is a closed path, i.e. if the flag is set to closed
   * @public
   *
   * @returns {boolean}
   */
  isClosed() {
    return this.closed;
  }

  /**
   * Determines if this subpath is a closed path, i.e. if it has a closed segment
   * @public
   *
   * @returns {boolean}
   */
  hasClosingSegment() {
    return !this.getFirstPoint().equalsEpsilon( this.getLastPoint(), 0.000000001 );
  }

  /**
   * Returns a line that would close this subpath
   * @public
   *
   * @returns {Line}
   */
  getClosingSegment() {
    assert && assert( this.hasClosingSegment(), 'Implicit closing segment unnecessary on a fully closed path' );
    return new Line( this.getLastPoint(), this.getFirstPoint() );
  }

  /**
   * Returns an array of potential closest points on the subpath to the given point.
   * @public
   *
   * @param {Vector2} point
   * @returns {ClosestToPointResult[]}
   */
  getClosestPoints( point ) {
    return Segment.filterClosestToPointResult( _.flatten( this.segments.map( segment => segment.getClosestPoints( point ) ) ) );
  }

  /**
   * Draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   * @public
   *
   * @param {CanvasRenderingContext2D} context
   */
  writeToContext( context ) {
    if ( this.isDrawable() ) {
      const startPoint = this.getFirstSegment().start;
      context.moveTo( startPoint.x, startPoint.y ); // the segments assume the current context position is at their start

      let len = this.segments.length;

      // Omit an ending line segment if our path is closed.
      // see https://github.com/phetsims/ph-scale/issues/83#issuecomment-512663949
      if ( this.closed && len >= 2 && this.segments[ len - 1 ] instanceof Line ) {
        len--;
      }

      for ( let i = 0; i < len; i++ ) {
        this.segments[ i ].writeToContext( context );
      }

      if ( this.closed ) {
        context.closePath();
      }
    }
  }

  /**
   * Converts this subpath to a new subpath made of many line segments (approximating the current subpath)
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
   * @returns {Subpath}
   */
  toPiecewiseLinear( options ) {
    assert && assert( !options.pointMap, 'For use with pointMap, please use nonlinearTransformed' );
    return new Subpath( _.flatten( _.map( this.segments, segment => segment.toPiecewiseLinearSegments( options ) ) ), null, this.closed );
  }

  /**
   * Returns a copy of this Subpath transformed with the given matrix.
   * @public
   *
   * @param {Matrix3} matrix
   * @returns {Subpath}
   */
  transformed( matrix ) {
    return new Subpath(
      _.map( this.segments, segment => segment.transformed( matrix ) ),
      _.map( this.points, point => matrix.timesVector2( point ) ),
      this.closed
    );
  }

  /**
   * Converts this subpath to a new subpath made of many line segments (approximating the current subpath) with the
   * transformation applied.
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
   * @returns {Subpath}
   */
  nonlinearTransformed( options ) {
    return new Subpath( _.flatten( _.map( this.segments, segment => {
      // check for this segment's support for the specific transform or discretization being applied
      if ( options.methodName && segment[ options.methodName ] ) {
        return segment[ options.methodName ]( options );
      }
      else {
        return segment.toPiecewiseLinearSegments( options );
      }
    } ) ), null, this.closed );
  }

  /**
   * Returns the bounds of this subpath when transform by a matrix.
   * @public
   *
   * @param {Matrix3} matrix
   * @returns {bounds}
   */
  getBoundsWithTransform( matrix ) {
    const bounds = Bounds2.NOTHING.copy();
    const numSegments = this.segments.length;
    for ( let i = 0; i < numSegments; i++ ) {
      bounds.includeBounds( this.segments[ i ].getBoundsWithTransform( matrix ) );
    }
    return bounds;
  }

  /**
   * Returns a subpath that is offset from this subpath by a distance
   * @public
   *
   * TODO: Resolve the bug with the inside-line-join overlap. We have the intersection handling now (potentially)
   *
   * @param {number} distance
   * @returns {Subpath}
   */
  offset( distance ) {
    if ( !this.isDrawable() ) {
      return new Subpath( [], null, this.closed );
    }
    if ( distance === 0 ) {
      return new Subpath( this.segments.slice(), null, this.closed );
    }

    let i;

    const regularSegments = this.segments.slice();
    const offsets = [];

    for ( i = 0; i < regularSegments.length; i++ ) {
      offsets.push( regularSegments[ i ].strokeLeft( 2 * distance ) );
    }

    let segments = [];
    for ( i = 0; i < regularSegments.length; i++ ) {
      if ( this.closed || i > 0 ) {
        const previousI = ( i > 0 ? i : regularSegments.length ) - 1;
        const center = regularSegments[ i ].start;
        const fromTangent = regularSegments[ previousI ].endTangent;
        const toTangent = regularSegments[ i ].startTangent;

        const startAngle = fromTangent.perpendicular.negated().times( distance ).angle;
        const endAngle = toTangent.perpendicular.negated().times( distance ).angle;
        const anticlockwise = fromTangent.perpendicular.dot( toTangent ) > 0;
        segments.push( new Arc( center, Math.abs( distance ), startAngle, endAngle, anticlockwise ) );
      }
      segments = segments.concat( offsets[ i ] );
    }

    return new Subpath( segments, null, this.closed );
  }

  /**
   * Returns an array of subpaths (one if open, two if closed) that represent a stroked copy of this subpath.
   * @public
   *
   * @param {LineStyles} lineStyles
   * @returns {Array.<Subpath>}
   */
  stroked( lineStyles ) {
    // non-drawable subpaths convert to empty subpaths
    if ( !this.isDrawable() ) {
      return [];
    }

    if ( lineStyles === undefined ) {
      lineStyles = new LineStyles();
    }

    // return a cached version if possible
    if ( this._strokedSubpathsComputed && this._strokedStyles.equals( lineStyles ) ) {
      return this._strokedSubpaths;
    }

    const lineWidth = lineStyles.lineWidth;

    let i;
    let leftSegments = [];
    let rightSegments = [];
    const firstSegment = this.getFirstSegment();
    const lastSegment = this.getLastSegment();

    function appendLeftSegments( segments ) {
      leftSegments = leftSegments.concat( segments );
    }

    function appendRightSegments( segments ) {
      rightSegments = rightSegments.concat( segments );
    }

    // we don't need to insert an implicit closing segment if the start and end points are the same
    const alreadyClosed = lastSegment.end.equals( firstSegment.start );
    // if there is an implicit closing segment
    const closingSegment = alreadyClosed ? null : new Line( this.segments[ this.segments.length - 1 ].end, this.segments[ 0 ].start );

    // stroke the logical "left" side of our path
    for ( i = 0; i < this.segments.length; i++ ) {
      if ( i > 0 ) {
        appendLeftSegments( lineStyles.leftJoin( this.segments[ i ].start, this.segments[ i - 1 ].endTangent, this.segments[ i ].startTangent ) );
      }
      appendLeftSegments( this.segments[ i ].strokeLeft( lineWidth ) );
    }

    // stroke the logical "right" side of our path
    for ( i = this.segments.length - 1; i >= 0; i-- ) {
      if ( i < this.segments.length - 1 ) {
        appendRightSegments( lineStyles.rightJoin( this.segments[ i ].end, this.segments[ i ].endTangent, this.segments[ i + 1 ].startTangent ) );
      }
      appendRightSegments( this.segments[ i ].strokeRight( lineWidth ) );
    }

    let subpaths;
    if ( this.closed ) {
      if ( alreadyClosed ) {
        // add the joins between the start and end
        appendLeftSegments( lineStyles.leftJoin( lastSegment.end, lastSegment.endTangent, firstSegment.startTangent ) );
        appendRightSegments( lineStyles.rightJoin( lastSegment.end, lastSegment.endTangent, firstSegment.startTangent ) );
      }
      else {
        // logical "left" stroke on the implicit closing segment
        appendLeftSegments( lineStyles.leftJoin( closingSegment.start, lastSegment.endTangent, closingSegment.startTangent ) );
        appendLeftSegments( closingSegment.strokeLeft( lineWidth ) );
        appendLeftSegments( lineStyles.leftJoin( closingSegment.end, closingSegment.endTangent, firstSegment.startTangent ) );

        // logical "right" stroke on the implicit closing segment
        appendRightSegments( lineStyles.rightJoin( closingSegment.end, closingSegment.endTangent, firstSegment.startTangent ) );
        appendRightSegments( closingSegment.strokeRight( lineWidth ) );
        appendRightSegments( lineStyles.rightJoin( closingSegment.start, lastSegment.endTangent, closingSegment.startTangent ) );
      }
      subpaths = [
        new Subpath( leftSegments, null, true ),
        new Subpath( rightSegments, null, true )
      ];
    }
    else {
      subpaths = [
        new Subpath( leftSegments.concat( lineStyles.cap( lastSegment.end, lastSegment.endTangent ) )
            .concat( rightSegments )
            .concat( lineStyles.cap( firstSegment.start, firstSegment.startTangent.negated() ) ),
          null, true )
      ];
    }

    this._strokedSubpaths = subpaths;
    this._strokedSubpathsComputed = true;
    this._strokedStyles = lineStyles.copy(); // shallow copy, since we consider linestyles to be mutable

    return subpaths;
  }

  /**
   * Returns a copy of this subpath with the dash "holes" removed (has many subpaths usually).
   * @public
   *
   * @param {Array.<number>} lineDash
   * @param {number} lineDashOffset
   * @param {number} distanceEpsilon - controls level of subdivision by attempting to ensure a maximum (squared)
   *                                   deviation from the curve
   * @param {number} curveEpsilon - controls level of subdivision by attempting to ensure a maximum curvature change
   *                                between segments
   * @returns {Array.<Subpath>}
   */
  dashed( lineDash, lineDashOffset, distanceEpsilon, curveEpsilon ) {
    // Combine segment arrays (collapsing the two-most-adjacent arrays into one, with concatenation)
    function combineSegmentArrays( left, right ) {
      const combined = left[ left.length - 1 ].concat( right[ 0 ] );
      const result = left.slice( 0, left.length - 1 ).concat( [ combined ] ).concat( right.slice( 1 ) );
      assert && assert( result.length === left.length + right.length - 1 );
      return result;
    }

    // Whether two dash items (return type from getDashValues()) can be combined together to have their end segments
    // combined with combineSegmentArrays.
    function canBeCombined( leftItem, rightItem ) {
      if ( !leftItem.hasRightFilled || !rightItem.hasLeftFilled ) {
        return false;
      }
      const leftSegment = _.last( _.last( leftItem.segmentArrays ) );
      const rightSegment = rightItem.segmentArrays[ 0 ][ 0 ];
      return leftSegment.end.distance( rightSegment.start ) < 1e-5;
    }

    // Compute all of the dashes
    const dashItems = [];
    for ( let i = 0; i < this.segments.length; i++ ) {
      const segment = this.segments[ i ];
      const dashItem = segment.getDashValues( lineDash, lineDashOffset, distanceEpsilon, curveEpsilon );
      dashItems.push( dashItem );

      // We moved forward in the offset by this much
      lineDashOffset += dashItem.arcLength;

      const values = [ 0 ].concat( dashItem.values ).concat( [ 1 ] );
      const initiallyInside = dashItem.initiallyInside;

      // Mark whether the ends are filled, so adjacent filled ends can be combined
      dashItem.hasLeftFilled = initiallyInside;
      dashItem.hasRightFilled = ( values.length % 2 === 0 ) ? initiallyInside : !initiallyInside;

      // {Array.<Array.<Segment>>}, where each contained array will be turned into a subpath at the end.
      dashItem.segmentArrays = [];
      for ( let j = ( initiallyInside ? 0 : 1 ); j < values.length - 1; j += 2 ) {
        if ( values[ j ] !== values[ j + 1 ] ) {
          dashItem.segmentArrays.push( [ segment.slice( values[ j ], values[ j + 1 ] ) ] );
        }
      }
    }

    // Combine adjacent which both are filled on the middle
    for ( let i = dashItems.length - 1; i >= 1; i-- ) {
      const leftItem = dashItems[ i - 1 ];
      const rightItem = dashItems[ i ];
      if ( canBeCombined( leftItem, rightItem ) ) {
        dashItems.splice( i - 1, 2, {
          segmentArrays: combineSegmentArrays( leftItem.segmentArrays, rightItem.segmentArrays ),
          hasLeftFilled: leftItem.hasLeftFilled,
          hasRightFilled: rightItem.hasRightFilled
        } );
      }
    }

    // Combine adjacent start/end if applicable
    if ( dashItems.length > 1 && canBeCombined( dashItems[ dashItems.length - 1 ], dashItems[ 0 ] ) ) {
      const leftItem = dashItems.pop();
      const rightItem = dashItems.shift();
      dashItems.push( {
        segmentArrays: combineSegmentArrays( leftItem.segmentArrays, rightItem.segmentArrays ),
        hasLeftFilled: leftItem.hasLeftFilled,
        hasRightFilled: rightItem.hasRightFilled
      } );
    }

    // Determine if we are closed (have only one subpath)
    if ( this.closed && dashItems.length === 1 && dashItems[ 0 ].segmentArrays.length === 1 && dashItems[ 0 ].hasLeftFilled && dashItems[ 0 ].hasRightFilled ) {
      return [ new Subpath( dashItems[ 0 ].segmentArrays[ 0 ], null, true ) ];
    }

    // Convert to subpaths
    return _.flatten( dashItems.map( dashItem => dashItem.segmentArrays ) ).map( segments => new Subpath( segments ) );
  }

  /**
   * Returns an object form that can be turned back into a segment with the corresponding deserialize method.
   * @public
   *
   * @returns {Object}
   */
  serialize() {
    return {
      type: 'Subpath',
      segments: this.segments.map( segment => segment.serialize() ),
      points: this.points.map( point => ( {
        x: point.x,
        y: point.y
      } ) ),
      closed: this.closed
    };
  }

  /**
   * Returns a Subpath from the serialized representation.
   * @public
   *
   * @param {Object} obj
   * @returns {Subpath}
   */
  static deserialize( obj ) {
    assert && assert( obj.type === 'Subpath' );

    return new Subpath( obj.segments.map( Segment.deserialize ), obj.points.map( pt => new Vector2( pt.x, pt.y ) ), obj.closed );
  }
}

kite.register( 'Subpath', Subpath );

export default Subpath;
