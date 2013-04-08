{
  function createMoveTo( args, isRelative ) {
    var result = [ {
      cmd: isRelative ? 'relativeMoveTo' : 'moveTo',
      args: [ args[0].x, args[0].y ]
    } ];
    
    // any other coordinate pairs are implicit lineTos
    if ( args.length > 1 ) {
      for ( var i = 0; i < args.length; i++ ) {
        result.push( {
          cmd: isRelative ? 'relativeLineTo' : 'lineTo',
          args: [ args[i].x, args[i].y ]
        } );
      }
    }
    return result;
  }
  
  function mapSVGEllipticalArc( args ) {
    return args;
  }
}

start
  = svgPath

svgPath
  = wsp* path:movetoDrawtoCommandGroups? wsp* { return path; }

movetoDrawtoCommandGroups
  = a:movetoDrawtoCommandGroup wsp* b:movetoDrawtoCommandGroups { return [a].concat( b ); }
    / a:movetoDrawtoCommandGroup { return [a]; }

movetoDrawtoCommandGroup
  = m:moveto wsp* c:drawtoCommands? { return [m].concat( c ); }

drawtoCommands
  = cmd:drawtoCommand wsp* cmds:drawtoCommands { return [cmd].concat( cmds ); }
    / cmd:drawtoCommand { return [cmd]; }

drawtoCommand
  = closepath
    / lineto
    / horizontalLineto
    / verticalLineto
    / curveto
    / smoothCurveto
    / quadraticBezierCurveto
    / smoothQuadraticBezierCurveto
    / ellipticalArc

moveto
  = 'M' wsp* args:movetoArgumentSequence { return createMoveTo( args, false ); }
    / 'm' wsp* args:movetoArgumentSequence { return createMoveTo( args, true ); }

movetoArgumentSequence
  = pair:coordinatePair commaWsp? list:linetoArgumentSequence { return [pair].concat( list ); }
    / pair:coordinatePair { return [pair]; }

closepath
  = command:( 'Z' / 'z' ) { return { cmd: 'close' }; }

lineto
  = 'L' wsp* args:linetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'lineTo', args: [ arg.x, arg.y ] }; } ); }
    / 'l' wsp* args:linetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'relativeLineTo', args: [ arg.x, arg.y ] }; } ); }

linetoArgumentSequence
  = a:coordinatePair commaWsp? b:linetoArgumentSequence { return [a].concat( b ); }
    / a:coordinatePair { return [a]; }

horizontalLineto
  = 'H' wsp* args:horizontalLinetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'horizontalLineTo', args: [ arg ] } } ); }
    / 'h' wsp* args:horizontalLinetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'relativeHorizontalLineTo', args: [ arg ] } } ); }

horizontalLinetoArgumentSequence
  = a:coordinate commaWsp? b:horizontalLinetoArgumentSequence { return [a].concat( b ); }
    / a:coordinate { return [a]; }

verticalLineto
  = 'V' wsp* args:verticalLinetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'verticalLineTo', args: [ arg ] } } ); }
    / 'v' wsp* args:verticalLinetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'relativeVerticalLineTo', args: [ arg ] } } ); }

verticalLinetoArgumentSequence
  = a:coordinate commaWsp? b:verticalLinetoArgumentSequence { return [a].concat( b ); }
    / a:coordinate { return [a]; }

curveto
  = 'C' wsp* args:curvetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'cubicCurveTo', args: arg } } ); }
    / 'c' wsp* args:curvetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'relativeCubicCurveTo', args: arg } } ); }

curvetoArgumentSequence
  = a:curvetoArgument commaWsp? list:curvetoArgumentSequence { return [a].concat( list ); }
    / a:curvetoArgument { return [a]; }

curvetoArgument
  = a:coordinatePair commaWsp? b:coordinatePair commaWsp? c:coordinatePair { return [ a.x, a.y, b.x, b.y, c.x, c.y ]; }

smoothCurveto
  = 'S' wsp* args:smoothCurvetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'smoothCubicCurveTo', args: arg } } ); }
    / 's' wsp* args:smoothCurvetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'relativeSmoothCubicCurveTo', args: arg } } ); }

smoothCurvetoArgumentSequence
  = a:smoothCurvetoArgument commaWsp? list:smoothCurvetoArgumentSequence { return [a].concat( list ); }
    / a:smoothCurvetoArgument { return [a]; }

smoothCurvetoArgument
  = a:coordinatePair commaWsp? b:coordinatePair { return [ a.x, a.y, b.x, b.y ]; }

quadraticBezierCurveto
  = 'Q' wsp* args:quadraticBezierCurvetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'quadraticCurveTo', args: arg } } ); }
    / 'q' wsp* args:quadraticBezierCurvetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'relativeQuadraticCurveTo', args: arg } } ); }

quadraticBezierCurvetoArgumentSequence
  = a:quadraticBezierCurvetoArgument commaWsp? list:quadraticBezierCurvetoArgumentSequence { return [a].concat( list ); }
    / a:quadraticBezierCurvetoArgument { return [a]; }

quadraticBezierCurvetoArgument
  = a:coordinatePair commaWsp? b:coordinatePair { return [ a.x, a.y, b.x, b.y ]; }

smoothQuadraticBezierCurveto
  = 'T' wsp* args:smoothQuadraticBezierCurvetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'smoothQuadraticCurveTo', args: [ arg.x, arg.y ] } } ); }
    / 't' wsp* args:smoothQuadraticBezierCurvetoArgumentSequence { return args.map( function( arg ) { return { cmd: 'relativeSmoothQuadraticCurveTo', args: [ arg.x, arg.y ] } } ); }

smoothQuadraticBezierCurvetoArgumentSequence
  = a:coordinatePair commaWsp? list:smoothQuadraticBezierCurvetoArgumentSequence { return [a].concat( list ); }
    / a:coordinatePair { return [a]; }

ellipticalArc
  = 'A' wsp* args:ellipticalArcArgumentSequence { return args.map( function( arg ) { return { cmd: 'ellipticalArc', args: arg } } ); }
    / 'a' wsp* args:ellipticalArcArgumentSequence { return args.map( function( arg ) { return { cmd: 'relativeEllipticalArc', args: arg } } ); }

ellipticalArcArgumentSequence
  = a:ellipticalArcArgument commaWsp? list:ellipticalArcArgumentSequence { return [a].concat( list ); }
    / a:ellipticalArcArgument { return [a]; }

ellipticalArcArgument
  = rx:nonnegativeNumber commaWsp? ry:nonnegativeNumber commaWsp? rot:number commaWsp largeArc:flag commaWsp? sweep:flag commaWsp? to:coordinatePair
    { return mapSVGEllipticalArc( [ rx, ry, rot, largeArc, sweep, to.x, to.y ] ) }

coordinatePair
  = a:coordinate commaWsp? b:coordinate { return { x: a, y: b }; } // TODO Vector2

coordinate
  = number

nonnegativeNumber
  = number:floatingPointConstant { return parseFloat( number, 10 ); }
    / number:integerConstant { return parseInt( number, 10 ); }

number
  = ( sign:sign? number:floatingPointConstant ) { return parseFloat( sign + number, 10 ); }
    / ( sign:sign? number:integerConstant ) { return parseInt( sign + number, 10 ); }

flag
  = '0' { return false; } / '1' { return true; }

commaWsp
  = ( wsp+ comma? wsp* ) / ( comma wsp* )

comma
  = ','

integerConstant
  = digitSequence

floatingPointConstant
  = a:fractionalConstant b:exponent? { return a + b; }
    / a:digitSequence b:exponent { return a + b; }

fractionalConstant
  = a: digitSequence? '.' b:digitSequence { return a + '.' + b; }
    / a:digitSequence '.' { return a }

exponent
  = a:( 'e' / 'E' ) b:sign? c:digitSequence { return a + b + c; }

sign
  = '+' / '-'

digitSequence
  = a:digit b:digitSequence { return a + b; }
    / digit

digit
  = [0-9]

wsp
  = '\u0020' / '\u0009' / '\u000D' / '\u000A'
