// Copyright 2013-2016, University of Colorado Boulder

const Gruntfile = require( '../chipper/Gruntfile.cjs' );
const registerTasks = require( '../perennial-alias/js/grunt/commonjs/registerTasks.js' );

/**
 * Kite grunt tasks
 * @author Jonathan Olson (PhET Interactive Simulations)
 */
module.exports = function( grunt ) {
  Gruntfile( grunt ); // use chipper's gruntfile
  registerTasks( grunt, `${__dirname}/js/grunt/tasks/` );
};