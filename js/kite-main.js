import axon from '../../axon/js/main.js';
import dot from '../../dot/js/main.js';
import phetCore from '../../phet-core/js/main.js';
import kite from './main.js';

// Copyright 2016-2019, University of Colorado Boulder

if ( !window.hasOwnProperty( '_' ) ) {
  throw new Error( 'Underscore/Lodash not found: _' );
}


window.axon = axon;
window.dot = dot;
window.kite = kite;
window.phetCore = phetCore;