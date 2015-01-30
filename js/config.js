// Copyright 2002-2014, University of Colorado Boulder

require.config( {
  deps: [ 'main', 'DOT/main', 'PHET_CORE/main' ],

  paths: {
    underscore: '../../sherpa/lodash-2.4.1',
    KITE: '.',
    DOT: '../../dot/js',
    PHET_CORE: '../../phet-core/js',
    AXON: '../../axon/js'
  },

  shim: {
    underscore: { exports: '_' }
  },

  urlArgs: new Date().getTime() // add cache buster query string to make browser refresh actually reload everything
} );
