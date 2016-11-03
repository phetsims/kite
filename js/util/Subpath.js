// Copyright 2013-2015, University of Colorado Boulder

/**
 * A Canvas-style stateful (mutable) subpath, which tracks segments in addition to the points.
 *
 * See http://www.w3.org/TR/2dcontext/#concept-path
 * for the path / subpath Canvas concept.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var Bounds2 = require( 'DOT/Bounds2' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Events = require( 'AXON/Events' );

  var kite = require( 'KITE/kite' );

  var Line = require( 'KITE/segments/Line' );
  var Arc = require( 'KITE/segments/Arc' );
  var LineStyles = require( 'KITE/util/LineStyles' );

  /**
   * all arguments optional (they are for the copy() method)
   * @param {Array.<Segment>} [segments]
   * @param {Array.<Vector2>} [points]
   * @param {boolean} [closed]
   * @constructor
   */
  function Subpath( segments, points, closed ) {
    Events.call( this );

    var self = this;

    this.segments = [];

    // recombine points if necessary, based off of start points of segments + the end point of the last segment
    this.points = points || ( ( segments && segments.length ) ? _.map( segments, function( segment ) { return segment.start; } ).concat( segments[ segments.length - 1 ].end ) : [] );
    this.closed = !!closed;

    // cached stroked shape (so hit testing can be done quickly on stroked shapes)
    this._strokedSubpaths = null;
    this._strokedSubpathsComputed = false;
    this._strokedStyles = null;

    this._bounds = null; // {Bounds2 | null} - If non-null, the bounds of the subpath

    this._invalidateListener = this.invalidate.bind( this );
    this._invalidatingPoints = false; // So we can invalidate all of the points without firing invalidation tons of times

    // Add all segments directly (hooks up invalidation listeners properly)
    if ( segments ) {
      for ( var i = 0; i < segments.length; i++ ) {
        _.each( segments[ i ].getNondegenerateSegments(), function( segment ) {
          self.addSegmentDirectly( segment );
        } );
      }
    }
  }

  kite.register( 'Subpath', Subpath );

  inherit( Events, Subpath, {

    /**
     * Returns the bounds of this subpath. It is the bounding-box union of the bounds of each segment contained.
     * @public
     *
     * @returns {Bounds2}
     */
    getBounds: function() {
      if ( this._bounds === null ) {
        var bounds = Bounds2.NOTHING.copy();
        _.each( this.segments, function( segment ) {
          bounds.includeBounds( segment.getBounds() );
        } );
        this._bounds = bounds;
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    /**
     * Returns an immutable copy of this subpath
     * @returns {Subpath}
     */
    copy: function() {
      return new Subpath( this.segments.slice( 0 ), this.points.slice( 0 ), this.closed );
    },

    invalidatePoints: function() {
      this._invalidatingPoints = true;

      var numSegments = this.segments.length;
      for ( var i = 0; i < numSegments; i++ ) {
        this.segments[ i ].invalidate();
      }

      this._invalidatingPoints = false;
      this.invalidate();
    },

    invalidate: function() {
      if ( !this._invalidatingPoints ) {
        this._bounds = null;
        this._strokedSubpathsComputed = false;
        this.trigger0( 'invalidated' );
      }
    },

    /**
     * Adds a point to this subpath
     * @param {Vector2} point
     * @returns {Subpath}
     */
    addPoint: function( point ) {
      this.points.push( point );

      return this; // allow chaining
    },

    /**
     * @private - REALLY! Make sure we invalidate() after this is called
     * @param {Segment} segment
     * @returns {Subpath}
     */
    addSegmentDirectly: function( segment ) {
      assert && assert( segment.start.isFinite(), 'Segment start is infinite' );
      assert && assert( segment.end.isFinite(), 'Segment end is infinite' );
      assert && assert( segment.startTangent.isFinite(), 'Segment startTangent is infinite' );
      assert && assert( segment.endTangent.isFinite(), 'Segment endTangent is infinite' );
      assert && assert( segment.bounds.isEmpty() || segment.bounds.isFinite(), 'Segment bounds is infinite and non-empty' );
      this.segments.push( segment );

      // Hook up an invalidation listener, so if this segment is invalidated, it will invalidate our subpath!
      // NOTE: if we add removal of segments, we'll need to remove these listeners, or we'll leak!
      segment.onStatic( 'invalidated', this._invalidateListener );

      return this; // allow chaining
    },

    /**
     * Adds a segment to this subpath
     * @param {Segment} segment
     * @returns {Subpath}
     */
    addSegment: function( segment ) {
      var nondegenerateSegments = segment.getNondegenerateSegments();
      var numNondegenerateSegments = nondegenerateSegments.length;
      for ( var i = 0; i < numNondegenerateSegments; i++ ) {
        this.addSegmentDirectly( segment );
      }
      this.invalidate(); // need to invalidate after addSegmentDirectly

      return this; // allow chaining
    },

    /**
     * Adds a line segment from the start to end (if non-zero length) and marks the subpath as closed.
     * NOTE: normally you just want to mark the subpath as closed, and not generate the closing segment this way?
     */
    addClosingSegment: function() {
      if ( this.hasClosingSegment() ) {
        var closingSegment = this.getClosingSegment();
        this.addSegmentDirectly( closingSegment );
        this.invalidate(); // need to invalidate after addSegmentDirectly
        this.addPoint( this.getFirstPoint() );
        this.closed = true;
      }
    },

    // TODO: consider always adding a closing segment into our segments list for easier processing!! see addClosingSegment()
    /**
     * Sets this subpath to be a closed path
     */
    close: function() {
      this.closed = true;
    },

    /**
     * Returns the numbers of points in this subpath
     * @returns {number}
     */
    getLength: function() {
      return this.points.length;
    },

    /**
     * Returns the first point of this subpath
     * @returns {Vector2}
     */
    getFirstPoint: function() {
      return _.first( this.points );
    },

    /**
     * Returns the last point of this subpath
     * @returns {Vector2}
     */
    getLastPoint: function() {
      return _.last( this.points );
    },

    /**
     * Returns the first segment of this subpath
     * @returns {Segment}
     */
    getFirstSegment: function() {
      return _.first( this.segments );
    },

    /**
     * Returns the last segment of this subpath
     * @returns {Segment}
     */
    getLastSegment: function() {
      return _.last( this.segments );
    },

    /**
     * Determines if this subpath is drawable, i.e. if it contains asny segments
     * @returns {boolean}
     */
    isDrawable: function() {
      return this.segments.length > 0;
    },

    /**
     * Determines if this subpath is a closed path, i.e. if the flag is set to closed
     * @returns {boolean}
     */
    isClosed: function() {
      return this.closed;
    },

    /**
     * Determines if this subpath is a closed path, i.e. if it has a closed segment
     * @returns {boolean}
     */
    hasClosingSegment: function() {
      return !this.getFirstPoint().equalsEpsilon( this.getLastPoint(), 0.000000001 );
    },

    /**
     * Returns a line that would closed this subpath
     * @returns {Line}
     */
    getClosingSegment: function() {
      assert && assert( this.hasClosingSegment(), 'Implicit closing segment unnecessary on a fully closed path' );
      return new Line( this.getLastPoint(), this.getFirstPoint() );
    },

    /**
     * Draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
     * @param {CanvasRenderingContext2D} context
     */
    writeToContext: function( context ) {
      if ( this.isDrawable() ) {
        var startPoint = this.getFirstSegment().start;
        context.moveTo( startPoint.x, startPoint.y ); // the segments assume the current context position is at their start

        var len = this.segments.length;
        for ( var i = 0; i < len; i++ ) {
          this.segments[ i ].writeToContext( context );
        }

        if ( this.closed ) {
          context.closePath();
        }
      }
    },

    /**
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
    toPiecewiseLinear: function( options ) {
      assert && assert( !options.pointMap, 'For use with pointMap, please use nonlinearTransformed' );
      return new Subpath( _.flatten( _.map( this.segments, function( segment ) {
        return segment.toPiecewiseLinearSegments( options );
      } ) ), null, this.closed );
    },

    /**
     *
     * @param {Matrix3} matrix
     * @returns {Subpath}
     */
    transformed: function( matrix ) {
      return new Subpath(
        _.map( this.segments, function( segment ) { return segment.transformed( matrix ); } ),
        _.map( this.points, function( point ) { return matrix.timesVector2( point ); } ),
        this.closed
      );
    },

    /**
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
    nonlinearTransformed: function( options ) {
      // specify an actual closing segment, so it can be mapped properly by any non-linear transforms
      // TODO: always create and add the closing segments when the subpath is closed!!!
      if ( this.closed && this.hasClosingSegment() ) {
        this.addClosingSegment();
      }

      return new Subpath( _.flatten( _.map( this.segments, function( segment ) {
        // check for this segment's support for the specific transform or discretization being applied
        if ( options.methodName && segment[ options.methodName ] ) {
          return segment[ options.methodName ]( options );
        }
        else {
          return segment.toPiecewiseLinearSegments( options );
        }
      } ) ), null, this.closed );
    },

    /**
     * Returns the bounds of this subpath when transform by a matrix
     * An immutable method
     * @param {Matrix3} matrix
     * @returns {bounds}
     */
    getBoundsWithTransform: function( matrix ) {
      var bounds = Bounds2.NOTHING.copy();
      var numSegments = this.segments.length;
      for ( var i = 0; i < numSegments; i++ ) {
        bounds.includeBounds( this.segments[ i ].getBoundsWithTransform( matrix ) );
      }
      return bounds;
    },

    /**
     * Returns a subpath that is offset from this subpath by a distance
     * {experimental} returns a subpath
     * @param {number} distance
     * @returns {Subpath}
     */
    offset: function( distance ) {
      if ( !this.isDrawable() ) {
        return new Subpath( [], null, this.closed );
      }
      if ( distance === 0 ) {
        return new Subpath( this.segments.slice(), null, this.closed );
      }

      var i;

      var regularSegments = this.segments.slice();
      if ( this.closed && this.hasClosingSegment() ) {
        regularSegments.push( this.getClosingSegment() );
      }
      var offsets = [];

      for ( i = 0; i < regularSegments.length; i++ ) {
        offsets.push( regularSegments[ i ].strokeLeft( 2 * distance ) );
      }

      var segments = [];
      for ( i = 0; i < regularSegments.length; i++ ) {
        if ( this.closed || i > 0 ) {
          var previousI = ( i > 0 ? i : regularSegments.length ) - 1;
          var center = regularSegments[ i ].start;
          var fromTangent = regularSegments[ previousI ].endTangent;
          var toTangent = regularSegments[ i ].startTangent;

          var startAngle = fromTangent.perpendicular().negated().times( distance ).angle();
          var endAngle = toTangent.perpendicular().negated().times( distance ).angle();
          var anticlockwise = fromTangent.perpendicular().dot( toTangent ) > 0;
          segments.push( new Arc( center, Math.abs( distance ), startAngle, endAngle, anticlockwise ) );
        }
        segments = segments.concat( offsets[ i ] );
      }

      return new Subpath( segments, null, this.closed );
    },

    /**
     * Returns an array of subpaths (one if open, two if closed) that represent a stroked copy of this subpath.
     * @param {LineStyles} lineStyles
     * @returns {Array.<Subpath>}
     */
    stroked: function( lineStyles ) {
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

      var lineWidth = lineStyles.lineWidth;

      var i;
      var leftSegments = [];
      var rightSegments = [];
      var firstSegment = this.getFirstSegment();
      var lastSegment = this.getLastSegment();

      function appendLeftSegments( segments ) {
        leftSegments = leftSegments.concat( segments );
      }

      function appendRightSegments( segments ) {
        rightSegments = rightSegments.concat( segments );
      }

      // we don't need to insert an implicit closing segment if the start and end points are the same
      var alreadyClosed = lastSegment.end.equals( firstSegment.start );
      // if there is an implicit closing segment
      var closingSegment = alreadyClosed ? null : new Line( this.segments[ this.segments.length - 1 ].end, this.segments[ 0 ].start );

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

      var subpaths;
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
      this._strokedStyles = new LineStyles( lineStyles ); // shallow copy, since we consider linestyles to be mutable

      return subpaths;
    }
  } );

  return kite.Subpath;
} );
