// Copyright 2013-2015, University of Colorado Boulder

/**
 * The main 'kite' namespace object for the exported (non-Require.js) API. Used internally
 * since it prevents Require.js issues with circular dependencies.
 *
 * The returned kite object namespace may be incomplete if not all modules are listed as
 * dependencies. Please use the 'main' module for that purpose if all of Kite is desired.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( function( require ) {
  'use strict';

  var Namespace = require( 'PHET_CORE/Namespace' );

  var kite = new Namespace( 'kite' );

  // Since SVG doesn't support parsing scientific notation (e.g. 7e5), we need to output fixed decimal-point strings.
  // Since this needs to be done quickly, and we don't particularly care about slight rounding differences (it's
  // being used for display purposes only, and is never shown to the user), we use the built-in JS toFixed instead of
  // Dot's version of toFixed. See https://github.com/phetsims/kite/issues/50
  kite.register( 'svgNumber', function( n ) {
    return n.toFixed( 20 );
  } );

  // will be filled in by other modules
  return kite;
} );
