// Copyright 2017, University of Colorado Boulder

/**
 * Shape tests
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 * @author Sam Reid (PhET Interactive Simulations)
 */
define( function( require ) {
  'use strict';

  // modules
  var Arc = require( 'KITE/segments/Arc' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Cubic = require( 'KITE/segments/Cubic' );
  var Line = require( 'KITE/segments/Line' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Quadratic = require( 'KITE/segments/Quadratic' );
  var Ray2 = require( 'DOT/Ray2' );
  var Shape = require( 'KITE/Shape' );
  var Vector2 = require( 'DOT/Vector2' );

  QUnit.module( 'Shape' );

  function dataToCanvas( snapshot ) {

    var canvas = document.createElement( 'canvas' );
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    var context = canvas.getContext( '2d' );
    context.putImageData( snapshot, 0, 0 );
    $( canvas ).css( 'border', '1px solid black' );
    return canvas;
  }

  // compares two pixel snapshots {ImageData} and uses the qunit's assert to verify they are the same
  function dataEquals( assert, a, b, threshold, message, extraDom ) {

    var isEqual = a.width === b.width && a.height === b.height;
    var largestDifference = 0;
    var totalDifference = 0;
    var colorDiffData = document.createElement( 'canvas' ).getContext( '2d' ).createImageData( a.width, a.height );
    var alphaDiffData = document.createElement( 'canvas' ).getContext( '2d' ).createImageData( a.width, a.height );
    if ( isEqual ) {
      for ( var i = 0; i < a.data.length; i++ ) {
        var diff = Math.abs( a.data[ i ] - b.data[ i ] );
        if ( i % 4 === 3 ) {
          colorDiffData.data[ i ] = 255;
          alphaDiffData.data[ i ] = 255;
          alphaDiffData.data[ i - 3 ] = diff; // red
          alphaDiffData.data[ i - 2 ] = diff; // green
          alphaDiffData.data[ i - 1 ] = diff; // blue
        }
        else {
          colorDiffData.data[ i ] = diff;
        }
        var alphaIndex = ( i - ( i % 4 ) + 3 );
        // grab the associated alpha channel and multiply it times the diff
        var alphaMultipliedDiff = ( i % 4 === 3 ) ? diff : diff * ( a.data[ alphaIndex ] / 255 ) * ( b.data[ alphaIndex ] / 255 );

        totalDifference += alphaMultipliedDiff;
        // if ( alphaMultipliedDiff > threshold ) {
        // console.log( message + ': ' + Math.abs( a.data[i] - b.data[i] ) );
        largestDifference = Math.max( largestDifference, alphaMultipliedDiff );
        // isEqual = false;
        // break;
        // }
      }
    }
    var averageDifference = totalDifference / ( 4 * a.width * a.height );
    if ( averageDifference > threshold ) {
      var display = $( '#display' );
      // header
      var note = document.createElement( 'h2' );
      $( note ).text( message );
      display.append( note );
      var differenceDiv = document.createElement( 'div' );
      $( differenceDiv ).text( '(actual) (expected) (color diff) (alpha diff) Diffs max: ' + largestDifference + ', average: ' + averageDifference );
      display.append( differenceDiv );

      display.append( dataToCanvas( a ) );
      display.append( dataToCanvas( b ) );
      display.append( dataToCanvas( colorDiffData ) );
      display.append( dataToCanvas( alphaDiffData ) );

      if ( extraDom ) {
        display.append( extraDom );
      }

      // for a line-break
      display.append( document.createElement( 'div' ) );

      isEqual = false;
    }
    assert.ok( isEqual, message );
    return isEqual;
  }

  function testUnion( assert, aShape, bShape, threshold, message ) {
    var normalCanvas = document.createElement( 'canvas' );
    normalCanvas.width = 100;
    normalCanvas.height = 100;
    var normalContext = normalCanvas.getContext( '2d' );
    normalContext.fillStyle = 'black';

    normalContext.beginPath();
    aShape.writeToContext( normalContext );
    normalContext.fill();

    normalContext.beginPath();
    bShape.writeToContext( normalContext );
    normalContext.fill();

    // document.body.appendChild( normalCanvas );

    var shape = aShape.shapeUnion( bShape );

    var testCanvas = document.createElement( 'canvas' );
    testCanvas.width = 100;
    testCanvas.height = 100;
    var testContext = testCanvas.getContext( '2d' );
    testContext.fillStyle = 'black';

    testContext.beginPath();
    shape.writeToContext( testContext );
    testContext.fill();

    // document.body.appendChild( testCanvas );

    var normalData = normalContext.getImageData( 0, 0, 100, 100 );
    var testData = testContext.getImageData( 0, 0, 100, 100 );

    dataEquals( assert, normalData, testData, threshold, message );
  }

  function testDifference( assert, aShape, bShape, threshold, message ) {
    var normalCanvas = document.createElement( 'canvas' );
    normalCanvas.width = 100;
    normalCanvas.height = 100;
    var normalContext = normalCanvas.getContext( '2d' );
    normalContext.fillStyle = 'white';
    normalContext.fillRect( 0, 0, 100, 100 );
    normalContext.fillStyle = 'black';

    normalContext.beginPath();
    aShape.writeToContext( normalContext );
    normalContext.fill();

    normalContext.fillStyle = 'white';

    normalContext.beginPath();
    bShape.writeToContext( normalContext );
    normalContext.fill();

    // document.body.appendChild( normalCanvas );

    var shape = aShape.shapeDifference( bShape );

    var testCanvas = document.createElement( 'canvas' );
    testCanvas.width = 100;
    testCanvas.height = 100;
    var testContext = testCanvas.getContext( '2d' );
    testContext.fillStyle = 'white';
    testContext.fillRect( 0, 0, 100, 100 );
    testContext.fillStyle = 'black';

    testContext.beginPath();
    shape.writeToContext( testContext );
    testContext.fill();

    // document.body.appendChild( testCanvas );

    var normalData = normalContext.getImageData( 0, 0, 100, 100 );
    var testData = testContext.getImageData( 0, 0, 100, 100 );

    dataEquals( assert, normalData, testData, threshold, message );
  }

  QUnit.test( 'Triangle union', function( assert ) {
    testUnion( assert,
      new Shape().moveTo( 10, 10 ).lineTo( 90, 10 ).lineTo( 50, 90 ).close(),
      new Shape().moveTo( 10, 90 ).lineTo( 90, 90 ).lineTo( 50, 10 ).close(),
      1, 'Union of opposite orientation triangles'
    );
  } );

  QUnit.test( 'CAG union #1', function( assert ) {
    testUnion( assert,
      new Shape().moveTo( 0, 0 ).lineTo( 10, 10 ).lineTo( 20, 0 ).close()
        .moveTo( 4, 2 ).lineTo( 16, 2 ).lineTo( 10, 6 ).close(),
      new Shape()
        .moveTo( 0, 8 ).lineTo( 10, 18 ).lineTo( 20, 8 ).close()
        .moveTo( 0, 20 ).lineTo( 20, 25 ).lineTo( 20, 20 ).lineTo( 0, 25 ).close()
        .moveTo( 0, 25 ).lineTo( 20, 30 ).lineTo( 20, 25 ).lineTo( 0, 30 ).close(),
      1, 'CAG test #1'
    );
  } );

  QUnit.test( 'CAG union #2', function( assert ) {
    testUnion( assert,
      new Shape().moveTo( 0, 0 ).lineTo( 10, 0 ).lineTo( 10, 10 ).lineTo( 0, 10 ).close()
        .moveTo( 5, 10 ).lineTo( 15, 10 ).lineTo( 15, 20 ).lineTo( 5, 20 ).close(),
      new Shape().moveTo( 10, 0 ).lineTo( 20, 0 ).lineTo( 20, 10 ).lineTo( 10, 10 ).close()
        .moveTo( 20, 0 ).lineTo( 20, 10 ).lineTo( 30, 10 ).lineTo( 30, 0 ).close(),
      1, 'CAG test #2'
    );
  } );

  QUnit.test( 'Difference test', function( assert ) {
    testDifference( assert,
      new Shape().rect( 0, 0, 100, 10 ).rect( 0, 20, 100, 10 ).rect( 0, 40, 100, 10 ).rect( 0, 60, 100, 10 ).rect( 0, 80, 100, 10 ),
      new Shape().rect( 0, 0, 10, 100 ).rect( 20, 0, 10, 100 ).rect( 40, 0, 10, 100 ).rect( 60, 0, 10, 100 ).rect( 80, 0, 10, 100 ),
      1, 'Difference test'
    );
  } );

  QUnit.test( 'CAG multiple test', function( assert ) {
    var a = new Shape();
    var b = new Shape();
    var c = new Shape();

    a.moveTo( 0, 2 ).cubicCurveTo( 22, 2, -1, 10, 25, 10 ).lineTo( 25, 16.5 ).lineTo( 0, 16.5 ).close();
    a.moveTo( 0, 10 ).lineTo( 10, 10 ).lineTo( 10, 25 ).lineTo( 0, 25 ).close();
    a.moveTo( 13, 25 ).arc( 10, 25, 3, 0, Math.PI * 1.3, false ).close();

    b.moveTo( 0, 0 ).lineTo( 30, 16.5 ).lineTo( 30, 0 ).close();
    b.moveTo( 15, 2 ).lineTo( 25, 2 ).lineTo( 25, 7 ).quadraticCurveTo( 15, 7, 15, 2 ).close();

    c.rect( 20, 0, 3, 20 );

    a = a.transformed( Matrix3.scaling( 3 ) );
    b = b.transformed( Matrix3.scaling( 3 ) );
    c = c.transformed( Matrix3.scaling( 3 ) );

    testUnion( assert, a, b, 1, 'CAG multiple #1' );

    var ab = a.shapeUnion( b );

    testDifference( assert, ab, c, 1, 'CAG multiple #2' );
  } );

  QUnit.test( 'Testing cubic overlap', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    var curve = new Cubic( new Vector2( 0, 0 ), new Vector2( 10, 0 ), new Vector2( 10, 10 ), new Vector2( 20, 10 ) );

    var left = curve.subdivided( 0.7 )[ 0 ];
    var right = curve.subdivided( 0.3 )[ 1 ];

    a.moveTo( 0, 10 ).lineTo( left.start.x, left.start.y ).cubicCurveTo( left.control1.x, left.control1.y, left.control2.x, left.control2.y, left.end.x, left.end.y ).close();
    b.moveTo( 20, 0 ).lineTo( right.start.x, right.start.y ).cubicCurveTo( right.control1.x, right.control1.y, right.control2.x, right.control2.y, right.end.x, right.end.y ).close();

    testUnion( assert, a, b, 1, 'Cubic overlap union' );
  } );

  QUnit.test( 'Testing quadratic overlap', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    var curve = new Quadratic( new Vector2( 0, 0 ), new Vector2( 10, 0 ), new Vector2( 10, 10 ) );

    var left = curve.subdivided( 0.7 )[ 0 ];
    var right = curve.subdivided( 0.3 )[ 1 ];

    a.moveTo( 0, 10 ).lineTo( left.start.x, left.start.y ).quadraticCurveTo( left.control.x, left.control.y, left.end.x, left.end.y ).close();
    b.moveTo( 20, 0 ).lineTo( right.start.x, right.start.y ).quadraticCurveTo( right.control.x, right.control.y, right.end.x, right.end.y ).close();

    testUnion( assert, a, b, 1, 'Quadratic overlap union' );
  } );

  QUnit.test( 'Cubic self-intersection', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    a.moveTo( 10, 0 ).cubicCurveTo( 30, 10, 0, 10, 20, 0 ).close();
    b.rect( 0, 0, 5, 5 );

    testUnion( assert, a, b, 1, 'Cubic self-intersection' );
  } );

  QUnit.test( 'Cubic self-intersection + overlapping unused edge', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    a.moveTo( 10, 0 ).lineTo( 10, 10 ).lineTo( 10, 0 ).cubicCurveTo( 30, 10, 0, 10, 20, 0 ).close();
    b.rect( 0, 0, 5, 5 );

    testUnion( assert, a, b, 1, 'Cubic self-intersection' );
  } );

  QUnit.test( 'Removal of bridge edges', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    a.moveTo( 40, 50 ).lineTo( 20, 70 ).lineTo( 20, 30 ).lineTo( 40, 50 ).lineTo( 60, 50 ).lineTo( 80, 30 ).lineTo( 80, 70 ).lineTo( 60, 50 ).close();
    b.rect( 0, 0, 5, 5 );

    testUnion( assert, a, b, 1, 'Removal of bridge edges' );
  } );

  QUnit.test( 'Double circle', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    a.circle( 20, 20, 10 );
    b.circle( 25, 20, 10 );

    testUnion( assert, a, b, 1, 'Double circle union' );
    testDifference( assert, a, b, 1, 'Double circle difference' );
  } );

  QUnit.test( 'Half circle join', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    a.arc( 50, 50, 30, 0, Math.PI, false ).close();
    b.arc( 50, 50, 30, Math.PI, Math.PI * 2, false ).close();

    testUnion( assert, a, b, 1, 'Half circle union' );
  } );

  QUnit.test( 'Partial circle overlap', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    a.arc( 50, 50, 30, 0, Math.PI, false ).close();
    b.arc( 50, 50, 30, Math.PI * 0.5, Math.PI * 2, false ).close();

    testUnion( assert, a, b, 1, 'Partial circle union' );
  } );

  QUnit.test( 'Circle overlap', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    a.circle( 50, 50, 30 );
    b.circle( 50, 50, 30 );

    testUnion( assert, a, b, 1, 'Circle overlap union' );
  } );

  QUnit.test( 'Circle adjacent', function( assert ) {
    var a = new Shape();
    var b = new Shape();

    a.circle( 10, 10, 5 );
    b.arc( 20, 10, 5, Math.PI, 3 * Math.PI, false ).close();

    testUnion( assert, a, b, 1, 'Circle adjacent union' );
  } );

  QUnit.test( '4 adjacent circles', function( assert ) {
    var a = new Shape().circle( -5, 0, 5 ).circle( 5, 0, 5 );
    var b = new Shape().circle( 0, -5, 5 ).circle( 0, 5, 5 );

    testUnion( assert, a, b, 1, '4 adjacent circles union' );
  } );

  QUnit.test( 'stroked line 1', function( assert ) {

    var a = Shape.deserialize( {
      'type': 'Shape',
      'subpaths': [ {
        'type': 'Subpath',
        'segments': [ {
          'type': 'Line',
          'startX': 580,
          'startY': 372,
          'endX': 580,
          'endY': 155.69419920487314
        }, {
          'type': 'Arc',
          'centerX': 570,
          'centerY': 155.69419920487314,
          'radius': 10,
          'startAngle': 0,
          'endAngle': -3.141592653589793,
          'anticlockwise': true
        }, { 'type': 'Line', 'startX': 560, 'startY': 155.69419920487314, 'endX': 560, 'endY': 372 }, {
          'type': 'Arc',
          'centerX': 570,
          'centerY': 372,
          'radius': 10,
          'startAngle': 3.141592653589793,
          'endAngle': 0,
          'anticlockwise': true
        } ],
        'points': [ { 'x': 580, 'y': 372 }, { 'x': 580, 'y': 155.69419920487314 }, {
          'x': 560,
          'y': 155.69419920487314
        }, { 'x': 560, 'y': 372 }, { 'x': 580, 'y': 372 } ],
        'closed': true
      } ]
    } );
    var b = Shape.deserialize( {
      'type': 'Shape',
      'subpaths': [ {
        'type': 'Subpath',
        'segments': [ {
          'type': 'Line',
          'startX': 570,
          'startY': 145.69419920487314,
          'endX': 348.3058007951268,
          'endY': 145.69419920487314
        }, {
          'type': 'Arc',
          'centerX': 348.3058007951268,
          'centerY': 155.69419920487314,
          'radius': 10,
          'startAngle': 4.71238898038469,
          'endAngle': 1.5707963267948966,
          'anticlockwise': true
        }, {
          'type': 'Line',
          'startX': 348.3058007951268,
          'startY': 165.69419920487314,
          'endX': 570,
          'endY': 165.69419920487314
        }, {
          'type': 'Arc',
          'centerX': 570,
          'centerY': 155.69419920487314,
          'radius': 10,
          'startAngle': 1.5707963267948966,
          'endAngle': -1.5707963267948966,
          'anticlockwise': true
        } ],
        'points': [ { 'x': 570, 'y': 145.69419920487314 }, {
          'x': 348.3058007951268,
          'y': 145.69419920487314
        }, { 'x': 348.3058007951268, 'y': 165.69419920487314 }, { 'x': 570, 'y': 165.69419920487314 }, {
          'x': 570,
          'y': 145.69419920487314
        } ],
        'closed': true
      } ]
    } );

    testUnion( assert, a, b, 1, 'stroked line 1 union' );
  } );

  QUnit.test( 'Shared endpoint test', function( assert ) {
    var a = Shape.deserialize( {
      'type': 'Shape',
      'subpaths': [
        {
          'type': 'Subpath',
          'segments': [
            {
              'type': 'Line',
              'startX': 293.1293439302738,
              'startY': 314.4245163440668,
              'endX': 288.8867032431545,
              'endY': 321.21274144345773
            },
            {
              'type': 'Line',
              'startX': 288.8867032431545,
              'startY': 321.21274144345773,
              'endX': 283.3712703498995,
              'endY': 326.7281743367127
            },
            {
              'type': 'Line',
              'startX': 283.3712703498995,
              'startY': 326.7281743367127,
              'endX': 280.8256859376279,
              'endY': 324.1825899244411
            },
            {
              'type': 'Line',
              'startX': 280.8256859376279,
              'startY': 324.1825899244411,
              'endX': 286.3411188308829,
              'endY': 318.66715703118615
            },
            {
              'type': 'Line',
              'startX': 286.3411188308829,
              'startY': 318.66715703118615,
              'endX': 293.1293439302738,
              'endY': 314.4245163440668
            }
          ],
          'points': [ { 'x': 293.1293439302738, 'y': 314.4245163440668 }, {
            'x': 288.8867032431545,
            'y': 321.21274144345773
          }, { 'x': 283.3712703498995, 'y': 326.7281743367127 }, {
            'x': 280.8256859376279,
            'y': 324.1825899244411
          }, { 'x': 286.3411188308829, 'y': 318.66715703118615 }, { 'x': 293.1293439302738, 'y': 314.4245163440668 } ],
          'closed': true
        }, {
          'type': 'Subpath',
          'segments': [],
          'points': [ { 'x': 293.1293439302738, 'y': 314.4245163440668 } ],
          'closed': false
        } ]
    } );
    var b = Shape.deserialize( {
      'type': 'Shape', 'subpaths': [
        {
          'type': 'Subpath',
          'segments': [
            {
              'type': 'Line',
              'startX': 296,
              'startY': 272.7867965644035,
              'endX': 447.21320343559637,
              'endY': 272.7867965644035
            },
            {
              'type': 'Line',
              'startX': 447.21320343559637,
              'startY': 272.7867965644035,
              'endX': 447.21320343559637,
              'endY': 278.7867965644035
            },
            {
              'type': 'Line',
              'startX': 447.21320343559637,
              'startY': 278.7867965644035,
              'endX': 404.7867965644035,
              'endY': 321.2132034355964
            },
            {
              'type': 'Line',
              'startX': 404.7867965644035,
              'startY': 321.2132034355964,
              'endX': 284.7867965644036,
              'endY': 321.2132034355964
            },
            {
              'type': 'Line',
              'startX': 284.7867965644036,
              'startY': 321.2132034355964,
              'endX': 284.7867965644036,
              'endY': 315.2132034355964
            },
            {
              'type': 'Line',
              'startX': 284.7867965644036,
              'startY': 315.2132034355964,
              'endX': 296,
              'endY': 272.7867965644035
            }
          ],
          'points': [ { 'x': 296, 'y': 272.7867965644035 }, {
            'x': 447.21320343559637,
            'y': 272.7867965644035
          }, { 'x': 447.21320343559637, 'y': 278.7867965644035 }, {
            'x': 404.7867965644035,
            'y': 321.2132034355964
          }, { 'x': 284.7867965644036, 'y': 321.2132034355964 }, {
            'x': 284.7867965644036,
            'y': 315.2132034355964
          }, { 'x': 296, 'y': 272.7867965644035 } ],
          'closed': true
        } ]
    } );
    testUnion( assert, a, b, 1, 'shared endpoint test 1' );
  } );

  QUnit.test( 'Line segment winding', function( assert ) {
    var line = new Line( new Vector2( 0, 0 ), new Vector2( 2, 2 ) );

    assert.equal( line.windingIntersection( new Ray2( new Vector2( 0, 1 ), new Vector2( 1, 0 ) ) ), 1 );
    assert.equal( line.windingIntersection( new Ray2( new Vector2( 0, 5 ), new Vector2( 1, 0 ) ) ), 0 );
    assert.equal( line.windingIntersection( new Ray2( new Vector2( 1, 0 ), new Vector2( 0, 1 ) ) ), -1 );
    assert.equal( line.windingIntersection( new Ray2( new Vector2( 0, 0 ), new Vector2( 1, 1 ).normalized() ) ), 0 );
    assert.equal( line.windingIntersection( new Ray2( new Vector2( 0, 1 ), new Vector2( 1, 1 ).normalized() ) ), 0 );
  } );

  QUnit.test( 'Rectangle hit testing', function( assert ) {
    var shape = Shape.rectangle( 0, 0, 1, 1 );

    assert.equal( shape.containsPoint( new Vector2( 0.2, 0.3 ) ), true, '0.2, 0.3' );
    assert.equal( shape.containsPoint( new Vector2( 0.5, 0.5 ) ), true, '0.5, 0.5' );
    assert.equal( shape.containsPoint( new Vector2( 1.5, 0.5 ) ), false, '1.5, 0.5' );
    assert.equal( shape.containsPoint( new Vector2( -0.5, 0.5 ) ), false, '-0.5, 0.5' );
  } );

  //See https://github.com/phetsims/kite/issues/34
  QUnit.test( 'Trapezoid hit testing', function( assert ) {
    var shape = new Shape( 'M 415 298.5 L 414.99999999999994 94.5 L 468.596798162286 101.08659447295564 L 468.59679816228606 291.91340552704435 Z' );
    assert.equal( shape.containsPoint( new Vector2( 441, 125 ) ), true, 'trapezoid should report that an interior point is "containsPoint" true' );
  } );

  QUnit.test( 'Un-closed shape hit testing', function( assert ) {
    var shape = new Shape().moveTo( 0, 0 ).lineTo( 10, 10 ).lineTo( 0, 10 );

    assert.equal( shape.containsPoint( new Vector2( 1, 2 ) ), true, '1, 2' );
    assert.equal( shape.containsPoint( new Vector2( 10, 2 ) ), false, '10, 2' );
  } );

  QUnit.test( 'Zero-size rectangle', function( assert ) {
    var shape = new Shape().rect( 20, 50, 0, 0 );

    assert.ok( shape.bounds.isFinite() || shape.bounds.isEmpty() ); // relies on the boundary case from dot
  } );

  QUnit.test( 'Zero-size line segment', function( assert ) {
    var shape = new Shape().moveTo( 20, 50 ).lineTo( 20, 50 ).close();

    assert.ok( shape.bounds.isFinite() || shape.bounds.isEmpty() ); // relies on the boundary case from dot
  } );

  QUnit.test( 'Bucket hit region', function( assert ) {
    var shape = new Shape().moveTo( -60, 0 )
      .lineTo( -48, 42 )
      .cubicCurveTo( -36, 51, 36, 51, 48, 42 )
      .lineTo( 60, 0 )
      .ellipticalArc( 0, 0, 60, 7.5, 0, 0, -Math.PI, false )
      .close();
    var point = new Vector2( -131.07772925764198, -274.65043668122274 );
    var ray = new Ray2( point, new Vector2( 1, 0 ) );

    assert.equal( 0, shape.windingIntersection( ray ), 'The winding intersection should be zero' );
  } );

  QUnit.test( 'intersectsBounds', function( assert ) {
    assert.ok( !Shape.circle( 0, 0, 2 ).intersectsBounds( new Bounds2( -1, -1, 1, 1 ) ),
      'Circle surrounds the bounds but should not intersect' );
    assert.ok( Shape.circle( 0, 0, 1.3 ).intersectsBounds( new Bounds2( -1, -1, 1, 1 ) ),
      'Circle intersects the bounds' );
    assert.ok( Shape.circle( 0, 0, 0.9 ).intersectsBounds( new Bounds2( -1, -1, 1, 1 ) ),
      'Circle contained within the bounds' );
    assert.ok( ( new Shape() ).moveTo( -2, 0 ).lineTo( 2, 0 ).intersectsBounds( new Bounds2( -1, -1, 1, 1 ) ),
      'Line goes through bounds directly' );
    assert.ok( !( new Shape() ).moveTo( -2, 2 ).lineTo( 2, 2 ).intersectsBounds( new Bounds2( -1, -1, 1, 1 ) ),
      'Line goes above bounds' );
  } );

  QUnit.test( 'interiorIntersectsLineSegment', function( assert ) {
    var circle = Shape.circle( 0, 0, 10 ); // radius 10 at 0,0

    assert.ok( circle.interiorIntersectsLineSegment( new Vector2( -1, 0 ), new Vector2( 1, 0 ) ),
      'Fully contained' );
    assert.ok( !circle.interiorIntersectsLineSegment( new Vector2( -100, 0 ), new Vector2( -50, 0 ) ),
      'Outside with ray towards circle' );
    assert.ok( !circle.interiorIntersectsLineSegment( new Vector2( 50, 0 ), new Vector2( 100, 0 ) ),
      'Outside with ray away from circle' );
    assert.ok( circle.interiorIntersectsLineSegment( new Vector2( 100, 0 ), new Vector2( 0, 0 ) ),
      'Inside to outside (intersects)' );
    assert.ok( !circle.interiorIntersectsLineSegment( new Vector2( 100, 0 ), new Vector2( 0, 100 ) ),
      'Outside at an angle' );
    assert.ok( circle.interiorIntersectsLineSegment( new Vector2( 10.1, 0 ), new Vector2( 0, 10.1 ) ),
      'Glancing with two intersection points' );
  } );

  QUnit.test( 'Cubic overlap', function( assert ) {
    var cubic = new Cubic( new Vector2( 0, 0 ), new Vector2( 0, 3 ), new Vector2( 10, 7 ), new Vector2( 10, 9 ) );
    var otherCubic = new Cubic( new Vector2( 10, 0 ), new Vector2( 0, 3 ), new Vector2( 10, 7 ), new Vector2( 10, 9 ) );

    var selfTest = Cubic.getOverlaps( cubic, cubic )[ 0 ];
    assert.equal( selfTest.a, 1, 'selfTest.a' );
    assert.equal( selfTest.b, 0, 'selfTest.b' );

    var firstHalf = cubic.subdivided( 0.5 )[ 0 ];
    var firstTest = Cubic.getOverlaps( cubic, firstHalf )[ 0 ];
    assert.equal( firstTest.a, 2, 'firstTest.a' );
    assert.equal( firstTest.b, 0, 'firstTest.b' );
    assert.ok( cubic.positionAt( 0.25 ).distance( firstHalf.positionAt( 0.25 * firstTest.a + firstTest.b ) ) < 1e-6, 'firstHalf t=0.25 check' );

    var secondHalf = cubic.subdivided( 0.5 )[ 1 ];
    var secondTest = Cubic.getOverlaps( cubic, secondHalf )[ 0 ];
    assert.equal( secondTest.a, 2, 'secondTest.a' );
    assert.equal( secondTest.b, -1, 'secondTest.b' );
    assert.ok( cubic.positionAt( 0.75 ).distance( secondHalf.positionAt( 0.75 * secondTest.a + secondTest.b ) ) < 1e-6, 'secondHalf t=0.75 check' );

    var negativeTest = Cubic.getOverlaps( cubic, otherCubic );
    assert.equal( negativeTest.length, 0, 'negativeTest' );
  } );

  QUnit.test( 'Quadratic overlap', function( assert ) {
    var quadratic = new Quadratic( new Vector2( 0, 0 ), new Vector2( 0, 3 ), new Vector2( 10, 9 ) );
    var otherQuadratic = new Quadratic( new Vector2( 10, 0 ), new Vector2( 0, 3 ), new Vector2( 10, 9 ) );

    var selfTest = Quadratic.getOverlaps( quadratic, quadratic )[ 0 ];
    assert.equal( selfTest.a, 1, 'selfTest.a' );
    assert.equal( selfTest.b, 0, 'selfTest.b' );

    var firstHalf = quadratic.subdivided( 0.5 )[ 0 ];
    var firstTest = Quadratic.getOverlaps( quadratic, firstHalf )[ 0 ];
    assert.equal( firstTest.a, 2, 'firstTest.a' );
    assert.equal( firstTest.b, 0, 'firstTest.b' );
    assert.ok( quadratic.positionAt( 0.25 ).distance( firstHalf.positionAt( 0.25 * firstTest.a + firstTest.b ) ) < 1e-6, 'firstHalf t=0.25 check' );

    var secondHalf = quadratic.subdivided( 0.5 )[ 1 ];
    var secondTest = Quadratic.getOverlaps( quadratic, secondHalf )[ 0 ];
    assert.equal( secondTest.a, 2, 'secondTest.a' );
    assert.equal( secondTest.b, -1, 'secondTest.b' );
    assert.ok( quadratic.positionAt( 0.75 ).distance( secondHalf.positionAt( 0.75 * secondTest.a + secondTest.b ) ) < 1e-6, 'secondHalf t=0.75 check' );

    var negativeTest = Quadratic.getOverlaps( quadratic, otherQuadratic );
    assert.equal( negativeTest.length, 0, 'negativeTest' );
  } );

  QUnit.test( 'Linear overlap', function( assert ) {
    var line = new Line( new Vector2( 0, 0 ), new Vector2( 10, 9 ) );
    var otherLine = new Line( new Vector2( 10, 0 ), new Vector2( 10, 9 ) );

    var selfTest = Line.getOverlaps( line, line )[ 0 ];
    assert.equal( selfTest.a, 1, 'selfTest.a' );
    assert.equal( selfTest.b, 0, 'selfTest.b' );

    var firstHalf = line.subdivided( 0.5 )[ 0 ];
    var firstTest = Line.getOverlaps( line, firstHalf )[ 0 ];
    assert.equal( firstTest.a, 2, 'firstTest.a' );
    assert.equal( firstTest.b, 0, 'firstTest.b' );
    assert.ok( line.positionAt( 0.25 ).distance( firstHalf.positionAt( 0.25 * firstTest.a + firstTest.b ) ) < 1e-6, 'firstHalf t=0.25 check' );

    var secondHalf = line.subdivided( 0.5 )[ 1 ];
    var secondTest = Line.getOverlaps( line, secondHalf )[ 0 ];
    assert.equal( secondTest.a, 2, 'secondTest.a' );
    assert.equal( secondTest.b, -1, 'secondTest.b' );
    assert.ok( line.positionAt( 0.75 ).distance( secondHalf.positionAt( 0.75 * secondTest.a + secondTest.b ) ) < 1e-6, 'secondHalf t=0.75 check' );

    var negativeTest = Line.getOverlaps( line, otherLine );
    assert.equal( negativeTest.length, 0, 'negativeTest' );
  } );

  QUnit.test( 'Closure of common Shape commands', function( assert ) {
    assert.ok( new Shape().circle( 0, 0, 10 ).subpaths[ 0 ].closed, 'circle should result in a closed subpath' );
    assert.ok( new Shape().ellipse( 0, 0, 10, 20, Math.PI / 4 ).subpaths[ 0 ].closed, 'ellipse should result in a closed subpath' );
    assert.ok( new Shape().rect( 0, 0, 100, 50 ).subpaths[ 0 ].closed, 'rect should result in a closed subpath' );
    assert.ok( new Shape().roundRect( 0, 0, 100, 50, 3, 4 ).subpaths[ 0 ].closed, 'roundRect should result in a closed subpath' );
    assert.ok( new Shape().polygon( [ new Vector2( 0, 0 ), new Vector2( 10, 0 ), new Vector2( 0, 10 ) ] ).subpaths[ 0 ].closed, 'polygon should result in a closed subpath' );
    assert.ok( Shape.regularPolygon( 6, 10 ).subpaths[ 0 ].closed, 'regularPolygon should result in a closed subpath' );
  } );

  QUnit.test( 'Circle-circle intersection', function( assert ) {
    // Accuracy assertions are contained in the intersection function

    assert.equal( Arc.getCircleIntersectionPoint( new Vector2( 0, 0 ), 10, new Vector2( 20, 0 ), 10 ).length, 1, 'two 10-radii adjacent' );
    assert.equal( Arc.getCircleIntersectionPoint( new Vector2( 0, 0 ), 10, new Vector2( 21, 0 ), 10 ).length, 0, 'two 10-radii separated' );
    assert.equal( Arc.getCircleIntersectionPoint( new Vector2( 0, 0 ), 10, new Vector2( 30, 0 ), 20 ).length, 1, 'two 20-radii adjacent' );
    assert.equal( Arc.getCircleIntersectionPoint( new Vector2( 0, 0 ), 10, new Vector2( 31, 0 ), 20 ).length, 0, 'two 20-radii separated' );
    assert.equal( Arc.getCircleIntersectionPoint( new Vector2( 0, 0 ), 10, new Vector2( 0, 0 ), 8 ).length, 0, 'inner center' );
    assert.equal( Arc.getCircleIntersectionPoint( new Vector2( 0, 0 ), 10, new Vector2( 1, 0 ), 5 ).length, 0, 'inner offset' );
    assert.equal( Arc.getCircleIntersectionPoint( new Vector2( 0, 0 ), 10, new Vector2( 5, 0 ), 5 ).length, 1, 'inner touching' );

    function r() {
      const randomSource = Math.random; // (We can't get joist's random reference here)
      return Math.ceil( randomSource() * 20 );
    }

    for ( var i = 0; i < 200; i++ ) {
      Arc.getCircleIntersectionPoint( new Vector2( r(), r() ), r(), new Vector2( r(), r() ), r() );
    }
  } );

  QUnit.test( 'Close linear overlap', function( assert ) {
    var a = new Line( new Vector2( 0, 0 ), new Vector2( 6.123233995736766e-16, -10 ) );
    var b = new Line( new Vector2( -1.8369701987210296e-15, -10 ), new Vector2( 0, 0 ) );

    assert.ok( Line.getOverlaps( a, b ).length === 1, 'Should find one continuous overlap' );
  } );
} );