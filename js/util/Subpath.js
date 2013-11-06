// Copyright 2002-2013, University of Colorado Boulder

/**
 * A Canvas-style stateful (mutable) subpath, which tracks segments in addition to the points.
 *
 * See http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#concept-path
 * for the path / subpath Canvas concept.
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  'use strict';
  
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var lineLineIntersection = require( 'DOT/Util' ).lineLineIntersection;
  
  var kite = require( 'KITE/kite' );
  
  require( 'KITE/segments/Line' );
  require( 'KITE/segments/Arc' );
  
  // all arguments optional (they are for the copy() method)
  kite.Subpath = function Subpath( segments, points, closed ) {
    this.segments = segments || [];
    
    // recombine points if necessary, based off of start points of segments + the end point of the last segment
    this.points = points || ( ( segments && segments.length ) ? _.map( segments, function( segment ) { return segment.start; } ).concat( segments[segments.length-1].end ) : [] );
    this.closed = !!closed;
    
    // cached stroked shape (so hit testing can be done quickly on stroked shapes)
    this._strokedSubpaths = null;
    this._strokedSubpathsComputed = false;
    this._strokedStyles = null;
    
    var bounds = this.bounds = Bounds2.NOTHING.copy();
    _.each( this.segments, function( segment ) {
      bounds.includeBounds( segment.bounds );
    } );
  };
  var Subpath = kite.Subpath;
  Subpath.prototype = {
    copy: function() {
      return new Subpath( this.segments.slice( 0 ), this.points.slice( 0 ), this.closed );
    },
    
    invalidate: function() {
      this._strokedSubpathsComputed = false;
    },
    
    addPoint: function( point ) {
      this.points.push( point );
      
      return this; // allow chaining
    },
    
    addSegmentDirectly: function( segment ) {
      assert && assert( segment.start.isFinite(), 'Segment start is infinite' );
      assert && assert( segment.end.isFinite(), 'Segment end is infinite' );
      assert && assert( segment.startTangent.isFinite(), 'Segment startTangent is infinite' );
      assert && assert( segment.endTangent.isFinite(), 'Segment endTangent is infinite' );
      assert && assert( segment.bounds.isEmpty() || segment.bounds.isFinite(), 'Segment bounds is infinite and non-empty' );
      this.segments.push( segment );
      this.invalidate();
      
      this.bounds.includeBounds( segment.getBounds() );
      
      return this; // allow chaining
    },
    
    addSegment: function( segment ) {
      var subpath = this;
      _.each( segment.getNondegenerateSegments(), function( segment ) {
        subpath.addSegmentDirectly( segment );
      } );
      
      return this; // allow chaining
    },
    
    close: function() {
      this.closed = true;
    },
    
    getLength: function() {
      return this.points.length;
    },
    
    getFirstPoint: function() {
      return _.first( this.points );
    },
    
    getLastPoint: function() {
      return _.last( this.points );
    },
    
    getFirstSegment: function() {
      return _.first( this.segments );
    },
    
    getLastSegment: function() {
      return _.last( this.segments );
    },
    
    isDrawable: function() {
      return this.segments.length > 0;
    },
    
    isClosed: function() {
      return this.closed;
    },
    
    hasClosingSegment: function() {
      return !this.getFirstPoint().equalsEpsilon( this.getLastPoint(), 0.000000001 );
    },
    
    getClosingSegment: function() {
      assert && assert( this.hasClosingSegment(), 'Implicit closing segment unnecessary on a fully closed path' );
      return new kite.Segment.Line( this.getLastPoint(), this.getFirstPoint() );
    },
    
    writeToContext: function( context ) {
      if ( this.isDrawable() ) {
        var startPoint = this.getFirstSegment().start;
        context.moveTo( startPoint.x, startPoint.y ); // the segments assume the current context position is at their start
        
        var len = this.segments.length;
        for ( var i = 0; i < len; i++ ) {
          this.segments[i].writeToContext( context );
        }
        
        if ( this.closed ) {
          context.closePath();
        }
      }
    },
    
    transformed: function( matrix ) {
      return new Subpath(
        _.map( this.segments, function( segment ) { return segment.transformed( matrix ); } ),
        _.map( this.points, function( point ) { return matrix.timesVector2( point ); } ),
        this.closed
      );
    },
    
    // returns an array of subpaths (one if open, two if closed) that represent a stroked copy of this subpath.
    stroked: function( lineStyles ) {
      // non-drawable subpaths convert to empty subpaths
      if ( !this.isDrawable() ) {
        return [];
      }
      
      if ( lineStyles === undefined ) {
        lineStyles = new kite.LineStyles();
      }
      
      // return a cached version if possible
      if ( this._strokedSubpathsComputed && this._strokedStyles.equals( lineStyles ) ) {
        return this._strokedSubpaths;
      }
      
      var lineWidth = lineStyles.lineWidth;
      
      // joins two segments together on the logical "left" side, at 'center' (where they meet), and normalized tangent vectors in the direction of the stroking
      // to join on the "right" side, switch the tangent order and negate them
      function join( center, fromTangent, toTangent ) {
        // where our join path starts and ends
        var fromPoint = center.plus( fromTangent.perpendicular().negated().times( lineWidth / 2 ) );
        var toPoint = center.plus( toTangent.perpendicular().negated().times( lineWidth / 2 ) );
        
        var bevel = ( fromPoint.equals( toPoint ) ? [] : [new kite.Segment.Line( fromPoint, toPoint )] );
        
        // only insert a join on the non-acute-angle side
        if ( fromTangent.perpendicular().dot( toTangent ) > 0 ) {
          switch( lineStyles.lineJoin ) {
            case 'round':
              var fromAngle = fromTangent.angle() + Math.PI / 2;
              var toAngle = toTangent.angle() + Math.PI / 2;
              return [new kite.Segment.Arc( center, lineWidth / 2, fromAngle, toAngle, true )];
            case 'miter':
              var theta = fromTangent.angleBetween( toTangent.negated() );
              var notStraight = theta < Math.PI - 0.00001; // if fromTangent is approximately equal to toTangent, just bevel. it will be indistinguishable
              if ( 1 / Math.sin( theta / 2 ) <= lineStyles.miterLimit && theta < Math.PI - 0.00001 ) {
                // draw the miter
                var miterPoint = lineLineIntersection( fromPoint, fromPoint.plus( fromTangent ), toPoint, toPoint.plus( toTangent ) );
                return [
                  new kite.Segment.Line( fromPoint, miterPoint ),
                  new kite.Segment.Line( miterPoint, toPoint )
                ];
              } else {
                // angle too steep, use bevel instead. same as below, but copied for linter
                return bevel;
              }
              break;
            case 'bevel':
              return bevel;
          }
        } else {
          // no join necessary here since we have the acute angle. just simple lineTo for now so that the next segment starts from the right place
          // TODO: can we prevent self-intersection here?
          return bevel;
        }
      }
      
      // draws the necessary line cap from the endpoint 'center' in the direction of the tangent
      function cap( center, tangent ) {
        var fromPoint = center.plus( tangent.perpendicular().times( -lineWidth / 2 ) );
        var toPoint = center.plus( tangent.perpendicular().times( lineWidth / 2 ) );
        
        switch( lineStyles.lineCap ) {
          case 'butt':
            return [new kite.Segment.Line( fromPoint, toPoint )];
          case 'round':
            var tangentAngle = tangent.angle();
            return [new kite.Segment.Arc( center, lineWidth / 2, tangentAngle + Math.PI / 2, tangentAngle - Math.PI / 2, true )];
          case 'square':
            var toLeft = tangent.perpendicular().negated().times( lineWidth / 2 );
            var toRight = tangent.perpendicular().times( lineWidth / 2 );
            var toFront = tangent.times( lineWidth / 2 );
            
            var left = center.plus( toLeft ).plus( toFront );
            var right = center.plus( toRight ).plus( toFront );
            return [
              new kite.Segment.Line( fromPoint, left ),
              new kite.Segment.Line( left, right ),
              new kite.Segment.Line( right, toPoint )
            ];
        }
      }
      
      var i;
      var leftSegments = [];
      var rightSegments = [];
      var firstSegment = this.getFirstSegment();
      var lastSegment = this.getLastSegment();
      
      function addLeftSegments( segments ) {
        leftSegments = leftSegments.concat( segments );
      }
      function addRightSegments( segments ) {
        rightSegments = rightSegments.concat( segments );
      }
      
      // we don't need to insert an implicit closing segment if the start and end points are the same
      var alreadyClosed = lastSegment.end.equals( firstSegment.start );
      // if there is an implicit closing segment
      var closingSegment = alreadyClosed ? null : new kite.Segment.Line( this.segments[this.segments.length-1].end, this.segments[0].start );
      
      // stroke the logical "left" side of our path
      for ( i = 0; i < this.segments.length; i++ ) {
        if ( i > 0 ) {
          addLeftSegments( join( this.segments[i].start, this.segments[i-1].endTangent, this.segments[i].startTangent, true ) );
        }
        addLeftSegments( this.segments[i].strokeLeft( lineWidth ) );
      }
      
      // stroke the logical "right" side of our path
      for ( i = this.segments.length - 1; i >= 0; i-- ) {
        if ( i < this.segments.length - 1 ) {
          addRightSegments( join( this.segments[i].end, this.segments[i+1].startTangent.negated(), this.segments[i].endTangent.negated(), false ) );
        }
        addRightSegments( this.segments[i].strokeRight( lineWidth ) );
      }
      
      var subpaths;
      if ( this.closed ) {
        if ( alreadyClosed ) {
          // add the joins between the start and end
          addLeftSegments( join( lastSegment.end, lastSegment.endTangent, firstSegment.startTangent ) );
          addRightSegments( join( lastSegment.end, firstSegment.startTangent.negated(), lastSegment.endTangent.negated() ) );
        } else {
          // logical "left" stroke on the implicit closing segment
          addLeftSegments( join( closingSegment.start, lastSegment.endTangent, closingSegment.startTangent ) );
          addLeftSegments( closingSegment.strokeLeft( lineWidth ) );
          addLeftSegments( join( closingSegment.end, closingSegment.endTangent, firstSegment.startTangent ) );
          
          // logical "right" stroke on the implicit closing segment
          addRightSegments( join( closingSegment.end, firstSegment.startTangent.negated(), closingSegment.endTangent.negated() ) );
          addRightSegments( closingSegment.strokeRight( lineWidth ) );
          addRightSegments( join( closingSegment.start, closingSegment.startTangent.negated(), lastSegment.endTangent.negated() ) );
        }
        subpaths = [
          new Subpath( leftSegments, null, true ),
          new Subpath( rightSegments, null, true )
        ];
      } else {
        subpaths = [
          new Subpath( leftSegments
                         .concat( cap( lastSegment.end, lastSegment.endTangent ) )
                         .concat( rightSegments )
                         .concat( cap( firstSegment.start, firstSegment.startTangent.negated() ) ),
                       null, true )
        ];
      }
      
      this._strokedSubpaths = subpaths;
      this._strokedSubpathsComputed = true;
      this._strokedStyles = new kite.LineStyles( lineStyles ); // shallow copy, since we consider linestyles to be mutable
      
      return subpaths;
    }
  };
  
  // TODO: performance / cleanliness to have these as methods instead?
  function segmentStartLeft( segment, lineWidth ) {
    assert && assert( lineWidth !== undefined );
    return segment.start.plus( segment.startTangent.perpendicular().negated().times( lineWidth / 2 ) );
  }
  
  function segmentEndLeft( segment, lineWidth ) {
    assert && assert( lineWidth !== undefined );
    return segment.end.plus( segment.endTangent.perpendicular().negated().times( lineWidth / 2 ) );
  }
  
  function segmentStartRight( segment, lineWidth ) {
    assert && assert( lineWidth !== undefined );
    return segment.start.plus( segment.startTangent.perpendicular().times( lineWidth / 2 ) );
  }
  
  function segmentEndRight( segment, lineWidth ) {
    assert && assert( lineWidth !== undefined );
    return segment.end.plus( segment.endTangent.perpendicular().times( lineWidth / 2 ) );
  }
  
  return kite.Subpath;
} );
