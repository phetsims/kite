// Copyright 2013-2016, University of Colorado Boulder

const Gruntfile = require( '../chipper/Gruntfile.js' );
const registerTasks = require( '../perennial-alias/js/grunt/util/registerTasks.js' );

/**
 * Kite grunt tasks
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
module.exports = function( grunt ) {
  Gruntfile( grunt ); // use chipper's gruntfile
  registerTasks( grunt, `${__dirname}/js/grunt/tasks/` );
};