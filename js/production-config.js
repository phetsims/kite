
// Copyright 2002-2013, University of Colorado Boulder

if ( window.has ) {
  window.has.add( 'assert.kite', function( global, document, anElement ) {
    'use strict';
    return false;
  } );
  window.has.add( 'assert.kite.extra', function( global, document, anElement ) {
    'use strict';
    return false;
  } );
}

window.loadedKiteConfig = true;

require.config( {
  deps: [ 'main', 'DOT/main', 'PHET_CORE/main' ],

  paths: {
    underscore: '../lib/lodash.min-1.0.0-rc.3',
    KITE: '.',
    DOT: '../common/dot/js',
    PHET_CORE: '../common/phet-core/js',
    ASSERT: '../common/assert/js'
  },
  
  shim: {
    underscore: { exports: '_' }
  },

  urlArgs: new Date().getTime() // add cache buster query string to make browser refresh actually reload everything
} );
