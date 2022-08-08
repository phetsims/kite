// Copyright 2022, University of Colorado Boulder

/**
 * Since SVG doesn't support parsing scientific notation (e.g. 7e5), we need to output fixed decimal-point strings.
 * Since this needs to be done quickly, and we don't particularly care about slight rounding differences (it's
 * being used for display purposes only, and is never shown to the user), we use the built-in JS toFixed instead of
 * Dot's version of toFixed. See https://github.com/phetsims/kite/issues/50
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import { kite } from '../imports.js';

const svgNumber = ( n: number ): string => {
  return n.toFixed( 20 ); // eslint-disable-line bad-sim-text
};

kite.register( 'svgNumber', svgNumber );

export default svgNumber;
