// Copyright 2013-2016, University of Colorado Boulder


// use chipper's gruntfile
const Gruntfile = require( '../chipper/js/grunt/gruntMain.js' ); // eslint-disable-line phet/require-statement-match
const registerTasks = require( '../perennial-alias/js/grunt/util/registerTasks' );

// Add repo-specific grunt tasks
module.exports = function( grunt ) {
  registerTasks( grunt, `${__dirname}/js/grunt/tasks/` );

  Gruntfile( grunt );
};