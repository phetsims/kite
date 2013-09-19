
(function(){
  'use strict';
  
  module( 'Kite: Shapes' );
  
  var Shape = kite.Shape;
  
  function p( x, y ) { return new dot.Vector2( x, y ); }
  
  test( 'Line segment winding', function() {
    var line = new kite.Segment.Line( p( 0, 0 ), p( 2, 2 ) );
    
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

  test('bucket hit region',function(){
    var shape = new kite.Shape().moveTo( -60, 0 )
      .lineTo( -48, 42 )
      .cubicCurveTo( -36, 51, 36, 51, 48, 42 )
      .lineTo( 60, 0 )
      .ellipticalArc( 0, 0, 60, 7.5, 0, 0, -Math.PI, false )
      .close();
    var point = dot( -131.07772925764198, -274.65043668122274 );
    var ray = new dot.Ray2( point, dot( 1, 0 ) );

    equal( 0, shape.windingIntersection( ray ), 'The winding intersection should be zero' );
  });
})();
