// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for kite.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import phetLibraryEslintConfig from '../chipper/eslint/phet-library.eslint.config.mjs';

export default [
  ...phetLibraryEslintConfig,
  {
    ignores: [
      'js/parser/svgPath.js',
      'js/grunt/**/*' // TODO: support this, https://github.com/phetsims/chipper/issues/1464
    ]
  }
];