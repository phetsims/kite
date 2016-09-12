// Copyright 2013-2015, University of Colorado Boulder

require.config( {
  deps: [ 'main', 'AXON/main', 'DOT/main', 'PHET_CORE/main' ],

  paths: {
    KITE: '.',
    DOT: '../../dot/js',
    PHET_CORE: '../../phet-core/js',
    AXON: '../../axon/js',
    ifphetio: '../../chipper/js/requirejs-plugins/ifphetio'
  },

  // optional cache buster to make browser refresh load all included scripts, can be disabled with ?cacheBuster=false
  urlArgs: Date.now()
} );
