// Copyright 2002-2013, University of Colorado Boulder

/**
 * Shape handling
 *
 * Shapes are internally made up of Subpaths, which contain a series of segments, and are optionally closed.
 * Familiarity with how Canvas handles subpaths is helpful for understanding this code.
 *
 * Canvas spec: http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html
 * SVG spec: http://www.w3.org/TR/SVG/expanded-toc.html
 *           http://www.w3.org/TR/SVG/paths.html#PathData (for paths)
 * Notes for elliptical arcs: http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
 * Notes for painting strokes: https://svgwg.org/svg2-draft/painting.html
 *
 * TODO: add nonzero / evenodd support when browsers support it
 * TODO: docs
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  'use strict';
  
  var assert = require( 'ASSERT/assert' )( 'kite' );
  var assertExtra = require( 'ASSERT/assert' )( 'kite.extra', true );
  
  var kite = require( 'KITE/kite' );
  
  // TODO: clean up imports
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Ray2 = require( 'DOT/Ray2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Transform3 = require( 'DOT/Transform3' );
  var toDegrees = require( 'DOT/Util' ).toDegrees;
  var lineLineIntersection = require( 'DOT/Util' ).lineLineIntersection;
  
  var Subpath = require( 'KITE/util/Subpath' );
  
  var svgPath = require( 'KITE/../parser/svgPath' );
  require( 'KITE/util/LineStyles' );
  require( 'KITE/segments/Arc' );
  require( 'KITE/segments/Cubic' );
  require( 'KITE/segments/EllipticalArc' );
  require( 'KITE/segments/Line' );
  require( 'KITE/segments/Quadratic' );
  
  // for brevity
  function p( x,y ) { return new Vector2( x, y ); }
  function v( x,y ) { return new Vector2( x, y ); } // TODO: use this version in general, it makes more sense and is easier to type
  
  // a normalized vector for non-zero winding checks
  // var weirdDir = p( Math.PI, 22 / 7 );
  
  // all arguments optional, they are for the copy() method. if used, ensure that 'bounds' is consistent with 'subpaths'
  kite.Shape = function Shape( subpaths, bounds ) {
    // lower-level piecewise mathematical description using segments, also individually immutable
    this.subpaths = ( typeof subpaths === 'object' ) ? subpaths : [];
    assert && assert( this.subpaths.length === 0 || this.subpaths[0].constructor.name !== 'Array' );
    
    // computed bounds for all pieces added so far
    this.bounds = bounds || Bounds2.NOTHING;
    
    var that = this;
    if ( subpaths && typeof subpaths !== 'object' ) {
      assert && assert( typeof subpaths === 'string', 'if subpaths is not an object, it must be a string' );
      // parse the SVG path
      _.each( svgPath.parse( subpaths ), function( item ) {
        assert && assert( Shape.prototype[item.cmd] !== undefined, 'method ' + item.cmd + ' from parsed SVG does not exist' );
        that[item.cmd].apply( that, item.args );
      } );
    }
  };
  var Shape = kite.Shape;
  
  Shape.prototype = {
    constructor: Shape,
    
    moveTo: function( x, y ) { return this.moveToPoint( v( x, y ) ); },
    moveToRelative: function( x, y ) { return this.moveToPointRelative( v( x, y ) ); },
    moveToPointRelative: function( point ) { return this.moveToPoint( this.getRelativePoint().plus( point ) ); },
    moveToPoint: function( point ) {
      return this.addSubpath( new kite.Subpath().addPoint( point ) );
    },
    
    lineTo: function( x, y ) { return this.lineToPoint( v( x, y ) ); },
    lineToRelative: function( x, y ) { return this.lineToPointRelative( v( x, y ) ); },
    lineToPointRelative: function( point ) { return this.lineToPoint( this.getRelativePoint().plus( point ) ); },
    lineToPoint: function( point ) {
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-lineto
      if ( this.hasSubpaths() ) {
        var start = this.getLastSubpath().getLastPoint();
        var end = point;
      var line = new kite.Segment.Line( start, end );
        this.getLastSubpath().addPoint( end );
        if ( !line.invalid ) {
          this.getLastSubpath().addSegment( line );
          this.bounds = this.bounds.withPoint( start ).withPoint( end );
          assert && assert( !isNaN( this.bounds.getX() ) );
        }
      } else {
        this.ensure( point );
      }
      
      return this;
    },
    
    horizontalLineTo: function( x ) { return this.lineTo( x, this.getRelativePoint().y ); },
    horizontalLineToRelative: function( x ) { return this.lineToRelative( x, 0 ); },
    
    verticalLineTo: function( y ) { return this.lineTo( this.getRelativePoint().x, y ); },
    verticalLineToRelative: function( y ) { return this.lineToRelative( 0, y ); },
    
    quadraticCurveTo: function( cpx, cpy, x, y ) { return this.quadraticCurveToPoint( v( cpx, cpy ), v( x, y ) ); },
    quadraticCurveToRelative: function( cpx, cpy, x, y ) { return this.quadraticCurveToPointRelative( v( cpx, cpy ), v( x, y ) ); },
    quadraticCurveToPointRelative: function( controlPoint, point ) {
      var relativePoint = this.getRelativePoint();
      return this.quadraticCurveToPoint( relativePoint.plus( controlPoint ), relativePoint.plus( point ) );
    },
    // TODO: consider a rename to put 'smooth' farther back?
    smoothQuadraticCurveTo: function( x, y ) { return this.quadraticCurveToPoint( this.getSmoothQuadraticControlPoint(), v( x, y ) ); },
    smoothQuadraticCurveToRelative: function( x, y ) { return this.quadraticCurveToPoint( this.getSmoothQuadraticControlPoint(), v( x, y ).plus( this.getRelativePoint() ) ); },
    quadraticCurveToPoint: function( controlPoint, point ) {
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-quadraticcurveto
      this.ensure( controlPoint );
      var start = this.getLastSubpath().getLastPoint();
      var quadratic = new kite.Segment.Quadratic( start, controlPoint, point );
      this.getLastSubpath().addPoint( point );
      if ( !quadratic.invalid ) {
        this.getLastSubpath().addSegment( quadratic );
        this.bounds = this.bounds.union( quadratic.bounds );
      }
      
      return this;
    },
    
    cubicCurveTo: function( cp1x, cp1y, cp2x, cp2y, x, y ) { return this.cubicCurveToPoint( v( cp1x, cp1y ), v( cp2x, cp2y ), v( x, y ) ); },
    cubicCurveToRelative: function( cp1x, cp1y, cp2x, cp2y, x, y ) { return this.cubicCurveToPointRelative( v( cp1x, cp1y ), v( cp2x, cp2y ), v( x, y ) ); },
    cubicCurveToPointRelative: function( control1, control2, point ) {
      var relativePoint = this.getRelativePoint();
      return this.cubicCurveToPoint( relativePoint.plus( control1 ), relativePoint.plus( control2 ), relativePoint.plus( point ) );
    },
    smoothCubicCurveTo: function( cp2x, cp2y, x, y ) { return this.cubicCurveToPoint( this.getSmoothCubicControlPoint(), v( cp2x, cp2y ), v( x, y ) ); },
    smoothCubicCurveToRelative: function( cp2x, cp2y, x, y ) { return this.cubicCurveToPoint( this.getSmoothCubicControlPoint(), v( cp2x, cp2y ).plus( this.getRelativePoint() ), v( x, y ).plus( this.getRelativePoint() ) ); },
    cubicCurveToPoint: function( control1, control2, point ) {
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-quadraticcurveto
      this.ensure( control1 );
      var start = this.getLastSubpath().getLastPoint();
      var cubic = new kite.Segment.Cubic( start, control1, control2, point );
      
      if ( !cubic.invalid ) {
        // if there is a cusp, we add the two (split) quadratic segments instead so that stroking treats the 'join' between them with the proper lineJoin
        if ( cubic.hasCusp() ) {
          this.getLastSubpath().addSegment( cubic.startQuadratic );
          this.getLastSubpath().addSegment( cubic.endQuadratic );
        } else {
          this.getLastSubpath().addSegment( cubic );
        }
        
        this.bounds = this.bounds.union( cubic.bounds );
      }
      this.getLastSubpath().addPoint( point );
      
      return this;
    },
    
    arc: function( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) { return this.arcPoint( v( centerX, centerY ), radius, startAngle, endAngle, anticlockwise ); },
    arcPoint: function( center, radius, startAngle, endAngle, anticlockwise ) {
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-arc
      
      var arc = new kite.Segment.Arc( center, radius, startAngle, endAngle, anticlockwise );
      
      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = arc.start;
      var endPoint = arc.end;
      
      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint(), 0 ) ) {
        this.getLastSubpath().addSegment( new kite.Segment.Line( this.getLastSubpath().getLastPoint(), startPoint ) );
      }
      
      if ( !this.hasSubpaths() ) {
        this.addSubpath( new kite.Subpath() );
      }
      
      // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
      this.getLastSubpath().addPoint( startPoint );
      this.getLastSubpath().addPoint( endPoint );
      
      if ( !arc.invalid ) {
        this.getLastSubpath().addSegment( arc );
        
        // and update the bounds
        this.bounds = this.bounds.union( arc.bounds );
      }
      
      return this;
    },
    
    ellipticalArc: function( centerX, centerY, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) { return this.ellipticalArcPoint( v( centerX, centerY ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ); },
    ellipticalArcPoint: function( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-arc
      
      var ellipticalArc = new kite.Segment.EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );
      
      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = ellipticalArc.start;
      var endPoint = ellipticalArc.end;
      
      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint(), 0 ) ) {
        this.getLastSubpath().addSegment( new kite.Segment.Line( this.getLastSubpath().getLastPoint(), startPoint ) );
      }
      
      if ( !this.hasSubpaths() ) {
        this.addSubpath( new kite.Subpath() );
      }
      
      // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
      this.getLastSubpath().addPoint( startPoint );
      this.getLastSubpath().addPoint( endPoint );
      
      if ( !ellipticalArc.invalid ) {
        this.getLastSubpath().addSegment( ellipticalArc );
        
        // and update the bounds
        this.bounds = this.bounds.union( ellipticalArc.bounds );
      }
      
      return this;
    },
    
    close: function() {
      if ( this.hasSubpaths() ) {
        var previousPath = this.getLastSubpath();
        var nextPath = new kite.Subpath();
        
        previousPath.close();
        this.addSubpath( nextPath );
        nextPath.addPoint( previousPath.getFirstPoint() );
      }
      return this;
    },
    
    // matches SVG's elliptical arc from http://www.w3.org/TR/SVG/paths.html
    ellipticalArcToRelative: function( radiusX, radiusY, rotation, largeArc, sweep, x, y ) {
      var relativePoint = this.getRelativePoint();
      return this.ellipticalArcTo( radiusX, radiusY, rotation, largeArc, sweep, x + relativePoint.x, y + relativePoint.y );
    },
    ellipticalArcTo: function( radiusX, radiusY, rotation, largeArc, sweep, x, y ) {
      throw new Error( 'ellipticalArcTo unimplemented' );
    },
    
    /*
     * Draws a circle using the arc() call with the following parameters:
     * circle( center, radius ) // center is a Vector2
     * circle( centerX, centerY, radius )
     */
    circle: function( centerX, centerY, radius ) {
      if ( typeof centerX === 'object' ) {
        // circle( center, radius )
        var center = centerX;
        radius = centerY;
        return this.arcPoint( center, radius, 0, Math.PI * 2, false );
      } else {
        // circle( centerX, centerY, radius )
        return this.arcPoint( p( centerX, centerY ), radius, 0, Math.PI * 2, false );
      }
    },
    
    /*
     * Draws an ellipse using the ellipticalArc() call with the following parameters:
     * ellipse( center, radiusX, radiusY, rotation ) // center is a Vector2
     * ellipse( centerX, centerY, radiusX, radiusY, rotation )
     */
    ellipse: function( centerX, centerY, radiusX, radiusY, rotation ) {
      // TODO: separate into ellipse() and ellipsePoint()?
      // TODO: Ellipse/EllipticalArc has a mess of parameters. Consider parameter object, or double-check parameter handling
      if ( typeof centerX === 'object' ) {
        // ellipse( center, radiusX, radiusY, rotation )
        var center = centerX;
        rotation = radiusY;
        radiusY = radiusX;
        radiusX = centerY;
        return this.ellipticalArcPoint( center, radiusX, radiusY, rotation || 0, 0, Math.PI * 2, false );
      } else {
        // ellipse( centerX, centerY, radiusX, radiusY, rotation )
        return this.ellipticalArcPoint( v( centerX, centerY ), radiusX, radiusY, rotation || 0, 0, Math.PI * 2, false );
      }
    },
    
    rect: function( x, y, width, height ) {
      var subpath = new kite.Subpath();
      this.addSubpath( subpath );
      subpath.addPoint( v( x, y ) );
      subpath.addPoint( v( x + width, y ) );
      subpath.addPoint( v( x + width, y + height ) );
      subpath.addPoint( v( x, y + height ) );
      subpath.addSegment( new kite.Segment.Line( subpath.points[0], subpath.points[1] ) );
      subpath.addSegment( new kite.Segment.Line( subpath.points[1], subpath.points[2] ) );
      subpath.addSegment( new kite.Segment.Line( subpath.points[2], subpath.points[3] ) );
      subpath.close();
      this.addSubpath( new kite.Subpath() );
      this.getLastSubpath().addPoint( v( x, y ) );
      this.bounds = this.bounds.withCoordinates( x, y ).withCoordinates( x + width, y + height );
      assert && assert( !isNaN( this.bounds.getX() ) );
      
      return this;
    },

    //Create a round rectangle. All arguments are number.
    roundRect: function( x, y, width, height, arcw, arch ) {
      var lowX = x + arcw;
      var highX = x + width - arcw;
      var lowY = y + arch;
      var highY = y + height - arch;
      // if ( true ) {
      if ( arcw === arch ) {
        // we can use circular arcs, which have well defined stroked offsets
        this.arc( highX, lowY, arcw, -Math.PI / 2, 0, false )
            .arc( highX, highY, arcw, 0, Math.PI / 2, false )
            .arc( lowX, highY, arcw, Math.PI / 2, Math.PI, false )
            .arc( lowX, lowY, arcw, Math.PI, Math.PI * 3 / 2, false )
            .close();
      } else {
        // we have to resort to elliptical arcs
        this.ellipticalArc( highX, lowY, arcw, arch, 0, -Math.PI / 2, 0, false )
            .ellipticalArc( highX, highY, arcw, arch, 0, 0, Math.PI / 2, false )
            .ellipticalArc( lowX, highY, arcw, arch, 0, Math.PI / 2, Math.PI, false )
            .ellipticalArc( lowX, lowY, arcw, arch, 0, Math.PI, Math.PI * 3 / 2, false )
            .close();
      }
      return this;
    },
    
    copy: function() {
      // copy each individual subpath, so future modifications to either Shape doesn't affect the other one
      return new Shape( _.map( this.subpaths, function( subpath ) { return subpath.copy(); } ), this.bounds );
    },
    
    // write out this shape's path to a canvas 2d context. does NOT include the beginPath()!
    writeToContext: function( context ) {
      var len = this.subpaths.length;
      for ( var i = 0; i < len; i++ ) {
        this.subpaths[i].writeToContext( context );
      }
    },
    
    // returns something like "M150 0 L75 200 L225 200 Z" for a triangle
    getSVGPath: function() {
      var subpathStrings = [];
      var len = this.subpaths.length;
      for ( var i = 0; i < len; i++ ) {
        var subpath = this.subpaths[i];
        if( subpath.isDrawable() ) {
          // since the commands after this are relative to the previous 'point', we need to specify a move to the initial point
          var startPoint = subpath.getFirstSegment().start;
          assert && assert( startPoint.equals( subpath.getFirstPoint(), 0.00001 ) ); // sanity check
          var string = 'M ' + startPoint.x + ' ' + startPoint.y + ' ';
          
          string += _.map( subpath.segments, function( segment ) { return segment.getSVGPathFragment(); } ).join( ' ' );
          
          if ( subpath.isClosed() ) {
            string += ' Z';
          }
          subpathStrings.push( string );
        }
      }
      return subpathStrings.join( ' ' );
    },
    
    // return a new Shape that is transformed by the associated matrix
    transformed: function( matrix ) {
      var subpaths = _.map( this.subpaths, function( subpath ) { return subpath.transformed( matrix ); } );
      var bounds = _.reduce( subpaths, function( bounds, subpath ) { return bounds.union( subpath.computeBounds() ); }, Bounds2.NOTHING );
      return new Shape( subpaths, bounds );
    },
    
    // returns the bounds. if lineStyles exists, include the stroke in the bounds
    // TODO: consider renaming to getBounds()?
    computeBounds: function( lineStyles ) {
      if ( lineStyles ) {
        return this.bounds.union( this.getStrokedShape( lineStyles ).bounds );
      } else {
        return this.bounds;
      }
    },
    
    containsPoint: function( point ) {
      // we pick a ray, and determine the winding number over that ray. if the number of segments crossing it CCW == number of segments crossing it CW, then the point is contained in the shape
      var ray = new Ray2( point, p( 1, 0 ) );
      
      return this.windingIntersection( ray ) !== 0;
    },
    
    intersection: function( ray ) {
      var hits = [];
      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[i];
        
        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            var segment = subpath.segments[k];
            hits = hits.concat( segment.intersection( ray ) );
          }
          
          if ( subpath.hasClosingSegment() ) {
            hits = hits.concat( subpath.getClosingSegment().intersection( ray ) );
          }
        }
      }
      return _.sortBy( hits, function( hit ) { return hit.distance; } );
    },
    
    windingIntersection: function( ray ) {
      var wind = 0;
      
      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[i];
        
        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            wind += subpath.segments[k].windingIntersection( ray );
          }
          
          // handle the implicit closing line segment
          if ( subpath.hasClosingSegment() ) {
            wind += subpath.getClosingSegment().windingIntersection( ray );
          }
        }
      }
      
      return wind;
    },
    
    intersectsBounds: function( bounds ) {
      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[i];
        
        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            if ( subpath.segments[k].intersectsBounds( bounds ) ) {
              return true;
            }
          }
          
          // handle the implicit closing line segment
          if ( subpath.hasClosingSegment() ) {
            if ( subpath.getClosingSegment().intersectsBounds( bounds ) ) {
              return true;
            }
          }
        }
      }
      return false;
    },
    
    // returns a new Shape that is an outline of the stroked path of this current Shape. currently not intended to be nested (doesn't do intersection computations yet)
    // TODO: rename stroked( lineStyles )
    getStrokedShape: function( lineStyles ) {
      var subpaths = [];
      var bounds = Bounds2.NOTHING.copy();
      var subLen = this.subpaths.length;
      for ( var i = 0; i < subLen; i++ ) {
        var subpath = this.subpaths[i];
        var strokedSubpath = subpath.stroked( lineStyles );
        subpaths = subpaths.concat( strokedSubpath );
      }
      subLen = subpaths.length;
      for ( i = 0; i < subLen; i++ ) {
        bounds.includeBounds( subpaths[i].computeBounds() );
      }
      return new Shape( subpaths, bounds );
    },
    
    toString: function() {
      // TODO: consider a more verbose but safer way?
      return 'new kite.Shape( \'' + this.getSVGPath() + '\' )';
    },
    
    /*---------------------------------------------------------------------------*
    * Internal subpath computations
    *----------------------------------------------------------------------------*/
    
    ensure: function( point ) {
      if ( !this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
        this.getLastSubpath().addPoint( point );
      }
    },
    
    addSubpath: function( subpath ) {
      this.subpaths.push( subpath );
      
      return this; // allow chaining
    },
    
    hasSubpaths: function() {
      return this.subpaths.length > 0;
    },
    
    getLastSubpath: function() {
      return _.last( this.subpaths );
    },
    
    // gets the last point in the last subpath, or null if it doesn't exist
    getLastPoint: function() {
      return this.hasSubpaths() ? this.getLastSubpath().getLastPoint() : null;
    },
    
    getLastSegment: function() {
      if ( !this.hasSubpaths() ) { return null; }
      
      var subpath = this.getLastSubpath();
      if ( !subpath.isDrawable() ) { return null; }
      
      return subpath.getLastSegment();
    },
    
    // returns the point to be used for smooth quadratic segments
    getSmoothQuadraticControlPoint: function() {
      var lastPoint = this.getLastPoint();
      
      var segment = this.getLastSegment();
      if ( !segment || !( segment instanceof kite.Segment.Quadratic ) ) { return lastPoint; }
      
      return lastPoint.plus( lastPoint.minus( segment.control ) );
    },
    
    // returns the point to be used for smooth cubic segments
    getSmoothCubicControlPoint: function() {
      var lastPoint = this.getLastPoint();
      
      var segment = this.getLastSegment();
      if ( !segment || !( segment instanceof kite.Segment.Cubic ) ) { return lastPoint; }
      
      return lastPoint.plus( lastPoint.minus( segment.control2 ) );
    },
    
    getRelativePoint: function() {
      var lastPoint = this.getLastPoint();
      return lastPoint ? lastPoint : Vector2.ZERO;
    }
  };
  
  /*---------------------------------------------------------------------------*
  * Shape shortcuts
  *----------------------------------------------------------------------------*/
  
  Shape.rectangle = function( x, y, width, height ) {
    return new Shape().rect( x, y, width, height );
  };
  Shape.rect = Shape.rectangle;

  //Create a round rectangle. All arguments are number.
  //Rounding is currently using quadraticCurveTo.  Please note, future versions may use arcTo
  //TODO: rewrite with arcTo?
  Shape.roundRect = function( x, y, width, height, arcw, arch ) {
    return new Shape().roundRect( x, y, width, height, arcw, arch );
  };
  Shape.roundRectangle = Shape.roundRect;
  
  Shape.bounds = function( bounds ) {
    return new Shape().rect( bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY );
  };

  //Create a line segment, using either (x1,y1,x2,y2) or ({x1,y1},{x2,y2}) arguments
  Shape.lineSegment = function( a, b, c, d ) {
    // TODO: add type assertions?
    if ( typeof a === 'number' ) {
      return new Shape().moveTo( a, b ).lineTo( c, d );
    }
    else {
      return new Shape().moveToPoint( a ).lineToPoint( b );
    }
  };
  
  Shape.regularPolygon = function( sides, radius ) {
    var shape = new Shape();
    _.each( _.range( sides ), function( k ) {
      var point = Vector2.createPolar( radius, 2 * Math.PI * k / sides );
      ( k === 0 ) ? shape.moveToPoint( point ) : shape.lineToPoint( point );
    } );
    return shape.close();
  };
  
  // supports both circle( centerX, centerY, radius ), circle( center, radius ), and circle( radius ) with the center default to 0,0
  Shape.circle = function( centerX, centerY, radius ) {
    if ( centerY === undefined ) {
      // circle( radius ), center = 0,0
      return new Shape().circle( 0, 0, centerX );
    }
    return new Shape().circle( centerX, centerY, radius ).close();
  };
  
  /*
   * Supports ellipse( centerX, centerY, radiusX, radiusY ), ellipse( center, radiusX, radiusY ), and ellipse( radiusX, radiusY )
   * with the center default to 0,0 and rotation of 0
   */
  Shape.ellipse = function( centerX, centerY, radiusX, radiusY ) {
    // TODO: Ellipse/EllipticalArc has a mess of parameters. Consider parameter object, or double-check parameter handling
    if ( radiusX === undefined ) {
      // ellipse( radiusX, radiusY ), center = 0,0
      return new Shape().ellipse( 0, 0, centerX, centerY );
    }
    return new Shape().ellipse( centerX, centerY, radiusX, radiusY ).close();
  };
  
  // supports both arc( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) and arc( center, radius, startAngle, endAngle, anticlockwise )
  Shape.arc = function( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) {
    return new Shape().arc( centerX, centerY, radius, startAngle, endAngle, anticlockwise );
  };
  
  return Shape;
} );
