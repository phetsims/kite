// Copyright 2002-2014, University of Colorado Boulder

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

  // object allocation tracking
  window.phetAllocation = require( 'PHET_CORE/phetAllocation' );

  // workaround for Axon, since it needs window.arch to be defined
  window.arch = window.arch || null;

  var kite = {
    svgNumber: function( n ) {
      return n.toFixed( 20 );
    }
  };

  // will be filled in by other modules
  return kite;
} );
