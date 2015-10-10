// Copyright 2002-2015, University of Colorado Boulder

/*global module:false*/
module.exports = function( grunt ) {
  'use strict';

  // print this immediately, so it is clear what project grunt is building
  grunt.log.writeln( 'Kite' );

  var pegjs = require( 'pegjs' );
  var fs = require( 'fs' );

  // --disable-es-cache disables the cache, useful for developing rules
  var cache = !grunt.option( 'disable-eslint-cache' );

  // Project configuration.
  grunt.initConfig( {
    pkg: '<json:package.json>',

    requirejs: {
      // unminified
      development: {
        options: {
          almond: true,
          mainConfigFile: 'js/config.js',
          out: 'build/development/kite.js',
          name: 'config',
          optimize: 'none',
          wrap: {
            startFile: [ 'js/wrap-start.frag', '../assert/js/assert.js' ],
            endFile: [ 'js/wrap-end.frag' ]
          }
        }
      },

      production: {
        options: {
          almond: true,
          mainConfigFile: 'js/config.js',
          out: 'build/production/kite.min.js',
          name: 'config',
          optimize: 'uglify2',
          generateSourceMaps: true,
          preserveLicenseComments: false,
          wrap: {
            startFile: [ 'js/wrap-start.frag', '../assert/js/assert.js' ],
            endFile: [ 'js/wrap-end.frag' ]
          },
          uglify2: {
            compress: {
              global_defs: {
                assert: false,
                assertSlow: false,
                phetAllocation: false
              },
              dead_code: true
            }
          }
        }
      }
    },

    eslint: {
      options: {

        // Rules are specified in the .eslintrc file
        configFile: '../chipper/eslint/.eslintrc',

        // Caching only checks changed files or when the list of rules is changed.  Changing the implementation of a
        // custom rule does not invalidate the cache.  Caches are declared in .eslintcache files in the directory where
        // grunt was run from.
        cache: cache,

        // Our custom rules live here
        rulePaths: [ '../chipper/eslint/rules' ]
      },

      files: [
        'Gruntfile.js',
        '../phet-core/js/**/*.js',
        '../axon/js/**/*.js',
        '../dot/js/**/*.js',
        '../assert/js/**/*.js',
        'js/**/*.js',
        '!js/parser/svgPath.js'
      ]
    }
  } );

  // Default task.
  grunt.registerTask( 'default', [ 'lint', 'development', 'production' ] );

  grunt.registerTask( 'lint', [ 'eslint:files' ] );

  grunt.registerTask( 'production', [ 'requirejs:production' ] );
  grunt.registerTask( 'development', [ 'requirejs:development' ] );
  grunt.loadNpmTasks( 'grunt-requirejs' );
  grunt.loadNpmTasks( 'grunt-eslint' );

  grunt.registerTask( 'generate-svgPath-parser',
    'Uses js/parser/svgPath.pegjs to generate js/parser/svgPath.js',
    function() {
      var pegInput = fs.readFileSync( 'js/parser/svgPath.pegjs', 'utf8' );
      var source = pegjs.buildParser( pegInput ).toSource();

      // replace fixed strings at the start/end with our prefix/suffix, so that it will work nicely with require.js
      var prefix = '// NOTE: Generated from svgPath.pegjs using PEG.js, with added kite namespace and require.js compatibility.\n' +
                   '// See svgPath.pegjs for more documentation, or run \'grunt generate-svgPath-parser\' to regenerate.\n' +
                   '\n' +
                   'define( function( require ) {\n' +
                   '  var kite = require( \'KITE/kite\' );\n';
      var suffix = '  kite.svgPath = result;\n' +
                   '  return kite.svgPath;\n' +
                   '} );\n';
      var toStripFromStart = '(function(){';
      var toStrimFromEnd = '  return result;\n})()';

      var startIndex = source.indexOf( toStripFromStart );
      if ( startIndex !== 0 ) {
        throw new Error( 'Could not find string to strip from the beginning of the PEG.js output' );
      }
      source = prefix + source.substring( startIndex + toStripFromStart.length );

      var endIndex = source.lastIndexOf( toStrimFromEnd );
      if ( endIndex === -1 ) {
        throw new Error( 'Could not find string to strip from the end of the PEG.js output' );
      }
      source = source.substring( 0, endIndex ) + suffix;

      // write the output
      fs.writeFileSync( 'js/parser/svgPath.js', source, 'utf8' );

      console.log( 'Please reformat the generated svgPath.js before checking in!' );
    } );
};
