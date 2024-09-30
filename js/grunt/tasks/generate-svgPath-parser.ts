// Copyright 2024, University of Colorado Boulder

/**
 * Uses js/parser/svgPath.pegjs to generate js/parser/svgPath.js
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * TODO: move this to chipper to simplify things? https://github.com/phetsims/chipper/issues/1464
 */

import fs from 'fs';
// @ts-expect-error TODO: why does it not think we are in node land? https://github.com/phetsims/chipper/issues/1463
import pegjs from 'pegjs';

const pegInput = fs.readFileSync( 'js/parser/svgPath.pegjs', 'utf8' );
let source = pegjs.buildParser( pegInput ).toSource();

// replace fixed strings at the start/end with our prefix/suffix, so that it will work nicely with require.js
const prefix = '/*\n' +
               ' * NOTE: Generated from svgPath.pegjs using PEG.js, with added kite namespace and require.js compatibility.\n' +
               ' * See svgPath.pegjs for more documentation, or run \'grunt generate-svgPath-parser\' to regenerate.\n' +
               ' */\n' +
               '\n' +
               'define( require => {\n' +
               '  const kite = require( \'KITE/kite\' );\n';
const suffix = '  kite.register( \'svgPath\', result );\n' +
               '  return kite.svgPath;\n' +
               '} );\n';
const toStripFromStart = '(function(){';
const toStrimFromEnd = '  return result;\n})()';

const startIndex = source.indexOf( toStripFromStart );
if ( startIndex !== 0 ) {
  throw new Error( 'Could not find string to strip from the beginning of the PEG.js output' );
}
source = prefix + source.substring( startIndex + toStripFromStart.length );

const endIndex = source.lastIndexOf( toStrimFromEnd );
if ( endIndex === -1 ) {
  throw new Error( 'Could not find string to strip from the end of the PEG.js output' );
}
source = source.substring( 0, endIndex ) + suffix;

// write the output
fs.writeFileSync( 'js/parser/svgPath.js', source, 'utf8' );

console.log( 'Please reformat the generated svgPath.js before checking in!' );