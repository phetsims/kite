// Copyright 2016-2021, University of Colorado Boulder

import axon from '../../axon/js/main.js'; // eslint-disable-line default-import-match-filename
import dot from '../../dot/js/main.js'; // eslint-disable-line default-import-match-filename
import phetCore from '../../phet-core/js/main.js'; // eslint-disable-line default-import-match-filename
import kite from './main.js'; // eslint-disable-line default-import-match-filename

if ( !window.hasOwnProperty( '_' ) ) {
  throw new Error( 'Underscore/Lodash not found: _' );
}


window.axon = axon;
window.dot = dot;
window.kite = kite;
window.phetCore = phetCore;