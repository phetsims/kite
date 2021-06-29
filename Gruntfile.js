// Copyright 2013-2016, University of Colorado Boulder

/* eslint-env node */

const pegjs = require( 'pegjs' );
const fs = require( 'fs' );

// use chipper's gruntfile
const Gruntfile = require( '../chipper/js/grunt/Gruntfile.js' ); // eslint-disable-line require-statement-match

// Add repo-specific grunt tasks
module.exports = function( grunt ) {
  

  grunt.registerTask( 'generate-svgPath-parser',
    'Uses js/parser/svgPath.pegjs to generate js/parser/svgPath.js',
    () => {
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
    } );

  Gruntfile( grunt );
};
