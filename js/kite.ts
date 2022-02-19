// Copyright 2013-2022, University of Colorado Boulder

/**
 * The main 'kite' namespace object for the exported (non-Require.js) API. Used internally
 * since it prevents Require.js issues with circular dependencies.
 *
 * The returned kite object namespace may be incomplete if not all modules are listed as
 * dependencies. Please use the 'main' module for that purpose if all of Kite is desired.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Namespace from '../../phet-core/js/Namespace.js';

const kite = new Namespace( 'kite' );

// will be filled in by other modules
export default kite;