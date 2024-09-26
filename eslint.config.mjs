// Copyright 2024, University of Colorado Boulder

/**
 * ESlint configuration for kite.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import parent from '../chipper/eslint/phet-library.eslint.config.mjs';

export default [
  ...parent,
  {
    ignores: [
      'js/parser/svgPath.js'
    ]
  }
];