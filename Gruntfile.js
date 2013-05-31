/*global module:false*/
module.exports = function( grunt ) {
  'use strict';
  
  // print this immediately, so it is clear what project grunt is building
  grunt.log.writeln( 'Kite' );
  
  // Project configuration.
  grunt.initConfig( {
    pkg: '<json:package.json>',
    
    requirejs: {
      // unminified, with has.js
      development: {
        options: {
          almond: true,
          mainConfigFile: "js/config.js",
          out: "dist/development/kite.js",
          name: "config",
          optimize: 'none',
          wrap: {
            startFile: [ "js/wrap-start.frag", "contrib/has.js" ],
            endFile: [ "js/wrap-end.frag" ]
          }
        }
      },
      
      // with has.js
      standalone: {
        options: {
          almond: true,
          mainConfigFile: "js/production-config.js",
          out: "dist/standalone/kite.min.js",
          name: "production-config",
          optimize: 'uglify2',
          generateSourceMaps: true,
          preserveLicenseComments: false,
          wrap: {
            startFile: [ "js/wrap-start.frag", "contrib/has.js" ],
            endFile: [ "js/wrap-end.frag" ]
          }
        }
      },
      
      // without has.js
      production: {
        options: {
          almond: true,
          mainConfigFile: "js/production-config.js",
          out: "dist/production/kite.min.js",
          name: "production-config",
          optimize: 'uglify2',
          generateSourceMaps: true,
          preserveLicenseComments: false,
          wrap: {
            startFile: [ "js/wrap-start.frag" ],
            endFile: [ "js/wrap-end.frag" ]
          }
        }
      }
    },
    
    jshint: {
      all: [
        'Gruntfile.js', 'js/**/*.js', 'common/dot/js/**/*.js', 'common/phet-core/js/**/*.js', 'common/assert/js/**/*.js'
      ],
      kite: [
        'js/**/*.js'
      ],
      // reference external JSHint options in jshint-options.js
      options: require( '../chipper/grunt/jshint-options' )
    }
  } );
  
  // Default task.
  grunt.registerTask( 'default', [ 'jshint:all', 'development', 'standalone', 'production' ] );
  
  // linter on kite subset only ('grunt lint')
  grunt.registerTask( 'lint', [ 'jshint:kite' ] );
  
  grunt.registerTask( 'production', [ 'requirejs:production' ] );
  grunt.registerTask( 'standalone', [ 'requirejs:standalone' ] );
  grunt.registerTask( 'development', [ 'requirejs:development' ] );
  grunt.loadNpmTasks( 'grunt-requirejs' );
  grunt.loadNpmTasks( 'grunt-contrib-jshint' );
};
