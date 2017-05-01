// Copyright 2016, University of Colorado Boulder

(function() {
  'use strict';

  module( 'Kite: Shapes' );

  var Shape = kite.Shape;

  function p( x, y ) { return new dot.Vector2( x, y ); }

  test( 'Line segment winding', function() {
    var line = new kite.Line( p( 0, 0 ), p( 2, 2 ) );

    equal( line.windingIntersection( new dot.Ray2( p( 0, 1 ), p( 1, 0 ) ) ), 1 );
    equal( line.windingIntersection( new dot.Ray2( p( 0, 5 ), p( 1, 0 ) ) ), 0 );
    equal( line.windingIntersection( new dot.Ray2( p( 1, 0 ), p( 0, 1 ) ) ), -1 );
    equal( line.windingIntersection( new dot.Ray2( p( 0, 0 ), p( 1, 1 ).normalized() ) ), 0 );
    equal( line.windingIntersection( new dot.Ray2( p( 0, 1 ), p( 1, 1 ).normalized() ) ), 0 );
  } );

  test( 'Rectangle hit testing', function() {
    var shape = Shape.rectangle( 0, 0, 1, 1 );

    equal( shape.containsPoint( p( 0.2, 0.3 ) ), true, '0.2, 0.3' );
    equal( shape.containsPoint( p( 0.5, 0.5 ) ), true, '0.5, 0.5' );
    equal( shape.containsPoint( p( 1.5, 0.5 ) ), false, '1.5, 0.5' );
    equal( shape.containsPoint( p( -0.5, 0.5 ) ), false, '-0.5, 0.5' );
  } );

  //See https://github.com/phetsims/kite/issues/34
  test( 'Trapezoid hit testing', function() {
    var shape = new kite.Shape( 'M 415 298.5 L 414.99999999999994 94.5 L 468.596798162286 101.08659447295564 L 468.59679816228606 291.91340552704435 Z' );
    equal( shape.containsPoint( p( 441, 125 ) ), true, 'trapezoid should report that an interior point is "containsPoint" true' );
  } );

  test( 'Un-closed shape hit testing', function() {
    var shape = new Shape().moveTo( 0, 0 ).lineTo( 10, 10 ).lineTo( 0, 10 );

    equal( shape.containsPoint( p( 1, 2 ) ), true, '1, 2' );
    equal( shape.containsPoint( p( 10, 2 ) ), false, '10, 2' );
  } );

  test( 'Zero-size rectangle', function() {
    var shape = new Shape().rect( 20, 50, 0, 0 );

    ok( shape.bounds.isFinite() || shape.bounds.isEmpty() ); // relies on the boundary case from dot
  } );

  test( 'Zero-size line segment', function() {
    var shape = new Shape().moveTo( 20, 50 ).lineTo( 20, 50 ).close();

    ok( shape.bounds.isFinite() || shape.bounds.isEmpty() ); // relies on the boundary case from dot
  } );

  test( 'Bucket hit region', function() {
    var shape = new kite.Shape().moveTo( -60, 0 )
      .lineTo( -48, 42 )
      .cubicCurveTo( -36, 51, 36, 51, 48, 42 )
      .lineTo( 60, 0 )
      .ellipticalArc( 0, 0, 60, 7.5, 0, 0, -Math.PI, false )
      .close();
    var point = dot.v2( -131.07772925764198, -274.65043668122274 );
    var ray = new dot.Ray2( point, dot.v2( 1, 0 ) );

    equal( 0, shape.windingIntersection( ray ), 'The winding intersection should be zero' );
  } );

  test( 'intersectsBounds', function() {
    ok( !kite.Shape.circle( 0, 0, 2 ).intersectsBounds( new dot.Bounds2( -1, -1, 1, 1 ) ),
      'Circle surrounds the bounds but should not intersect' );
    ok( kite.Shape.circle( 0, 0, 1.3 ).intersectsBounds( new dot.Bounds2( -1, -1, 1, 1 ) ),
      'Circle intersects the bounds' );
    ok( kite.Shape.circle( 0, 0, 0.9 ).intersectsBounds( new dot.Bounds2( -1, -1, 1, 1 ) ),
      'Circle contained within the bounds' );
    ok( ( new kite.Shape() ).moveTo( -2, 0 ).lineTo( 2, 0 ).intersectsBounds( new dot.Bounds2( -1, -1, 1, 1 ) ),
      'Line goes through bounds directly' );
    ok( !( new kite.Shape() ).moveTo( -2, 2 ).lineTo( 2, 2 ).intersectsBounds( new dot.Bounds2( -1, -1, 1, 1 ) ),
      'Line goes above bounds' );
  } );

  test( 'interiorIntersectsLineSegment', function() {
    var circle = kite.Shape.circle( 0, 0, 10 ); // radius 10 at 0,0

    ok( circle.interiorIntersectsLineSegment( new dot.Vector2( -1, 0 ), new dot.Vector2( 1, 0 ) ),
      'Fully contained' );
    ok( !circle.interiorIntersectsLineSegment( new dot.Vector2( -100, 0 ), new dot.Vector2( -50, 0 ) ),
      'Outside with ray towards circle' );
    ok( !circle.interiorIntersectsLineSegment( new dot.Vector2( 50, 0 ), new dot.Vector2( 100, 0 ) ),
      'Outside with ray away from circle' );
    ok( circle.interiorIntersectsLineSegment( new dot.Vector2( 100, 0 ), new dot.Vector2( 0, 0 ) ),
      'Inside to outside (intersects)' );
    ok( !circle.interiorIntersectsLineSegment( new dot.Vector2( 100, 0 ), new dot.Vector2( 0, 100 ) ),
      'Outside at an angle' );
    ok( circle.interiorIntersectsLineSegment( new dot.Vector2( 10.1, 0 ), new dot.Vector2( 0, 10.1 ) ),
      'Glancing with two intersection points' );
  } );

  test( 'Cubic overlap', function() {
    var cubic = new kite.Cubic( dot.v2( 0, 0 ), dot.v2( 0, 3 ), dot.v2( 10, 7 ), dot.v3( 10, 9 ) );
    var otherCubic = new kite.Cubic( dot.v2( 10, 0 ), dot.v2( 0, 3 ), dot.v2( 10, 7 ), dot.v3( 10, 9 ) );

    var selfTest = kite.Cubic.getOverlaps( cubic, cubic )[ 0 ];
    equal( selfTest.a, 1, 'selfTest.a' );
    equal( selfTest.b, 0, 'selfTest.b' );

    var firstHalf = cubic.subdivided( 0.5 )[ 0 ];
    var firstTest = kite.Cubic.getOverlaps( cubic, firstHalf )[ 0 ];
    equal( firstTest.a, 2, 'firstTest.a' );
    equal( firstTest.b, 0, 'firstTest.b' );
    ok( cubic.positionAt( 0.25 ).distance( firstHalf.positionAt( 0.25 * firstTest.a + firstTest.b ) ) < 1e-6, 'firstHalf t=0.25 check' );

    var secondHalf = cubic.subdivided( 0.5 )[ 1 ];
    var secondTest = kite.Cubic.getOverlaps( cubic, secondHalf )[ 0 ];
    equal( secondTest.a, 2, 'secondTest.a' );
    equal( secondTest.b, -1, 'secondTest.b' );
    ok( cubic.positionAt( 0.75 ).distance( secondHalf.positionAt( 0.75 * secondTest.a + secondTest.b ) ) < 1e-6, 'secondHalf t=0.75 check' );

    var negativeTest = kite.Cubic.getOverlaps( cubic, otherCubic );
    equal( negativeTest.length, 0, 'negativeTest' );
  } );

  test( 'Quadratic overlap', function() {
    var quadratic = new kite.Quadratic( dot.v2( 0, 0 ), dot.v2( 0, 3 ), dot.v3( 10, 9 ) );
    var otherQuadratic = new kite.Quadratic( dot.v2( 10, 0 ), dot.v2( 0, 3 ), dot.v3( 10, 9 ) );

    var selfTest = kite.Quadratic.getOverlaps( quadratic, quadratic )[ 0 ];
    equal( selfTest.a, 1, 'selfTest.a' );
    equal( selfTest.b, 0, 'selfTest.b' );

    var firstHalf = quadratic.subdivided( 0.5 )[ 0 ];
    var firstTest = kite.Quadratic.getOverlaps( quadratic, firstHalf )[ 0 ];
    equal( firstTest.a, 2, 'firstTest.a' );
    equal( firstTest.b, 0, 'firstTest.b' );
    ok( quadratic.positionAt( 0.25 ).distance( firstHalf.positionAt( 0.25 * firstTest.a + firstTest.b ) ) < 1e-6, 'firstHalf t=0.25 check' );

    var secondHalf = quadratic.subdivided( 0.5 )[ 1 ];
    var secondTest = kite.Quadratic.getOverlaps( quadratic, secondHalf )[ 0 ];
    equal( secondTest.a, 2, 'secondTest.a' );
    equal( secondTest.b, -1, 'secondTest.b' );
    ok( quadratic.positionAt( 0.75 ).distance( secondHalf.positionAt( 0.75 * secondTest.a + secondTest.b ) ) < 1e-6, 'secondHalf t=0.75 check' );

    var negativeTest = kite.Quadratic.getOverlaps( quadratic, otherQuadratic );
    equal( negativeTest.length, 0, 'negativeTest' );
  } );

  test( 'Linear overlap', function() {
    var line = new kite.Line( dot.v2( 0, 0 ), dot.v3( 10, 9 ) );
    var otherLine = new kite.Line( dot.v2( 10, 0 ), dot.v3( 10, 9 ) );

    var selfTest = kite.Line.getOverlaps( line, line )[ 0 ];
    equal( selfTest.a, 1, 'selfTest.a' );
    equal( selfTest.b, 0, 'selfTest.b' );

    var firstHalf = line.subdivided( 0.5 )[ 0 ];
    var firstTest = kite.Line.getOverlaps( line, firstHalf )[ 0 ];
    equal( firstTest.a, 2, 'firstTest.a' );
    equal( firstTest.b, 0, 'firstTest.b' );
    ok( line.positionAt( 0.25 ).distance( firstHalf.positionAt( 0.25 * firstTest.a + firstTest.b ) ) < 1e-6, 'firstHalf t=0.25 check' );

    var secondHalf = line.subdivided( 0.5 )[ 1 ];
    var secondTest = kite.Line.getOverlaps( line, secondHalf )[ 0 ];
    equal( secondTest.a, 2, 'secondTest.a' );
    equal( secondTest.b, -1, 'secondTest.b' );
    ok( line.positionAt( 0.75 ).distance( secondHalf.positionAt( 0.75 * secondTest.a + secondTest.b ) ) < 1e-6, 'secondHalf t=0.75 check' );

    var negativeTest = kite.Line.getOverlaps( line, otherLine );
    equal( negativeTest.length, 0, 'negativeTest' );
  } );

  test( 'Closure of common Shape commands', function() {
    ok( new Shape().circle( 0, 0, 10 ).subpaths[ 0 ].closed, 'circle should result in a closed subpath' );
    ok( new Shape().ellipse( 0, 0, 10, 20, Math.PI / 4 ).subpaths[ 0 ].closed, 'ellipse should result in a closed subpath' );
    ok( new Shape().rect( 0, 0, 100, 50 ).subpaths[ 0 ].closed, 'rect should result in a closed subpath' );
    ok( new Shape().roundRect( 0, 0, 100, 50, 3, 4 ).subpaths[ 0 ].closed, 'roundRect should result in a closed subpath' );
    ok( new Shape().polygon( [ dot.v2( 0, 0 ), dot.v2( 10, 0 ), dot.v2( 0, 10 ) ] ).subpaths[ 0 ].closed, 'polygon should result in a closed subpath' );
    ok( Shape.regularPolygon( 6, 10 ).subpaths[ 0 ].closed, 'regularPolygon should result in a closed subpath' );
  } );

})();
