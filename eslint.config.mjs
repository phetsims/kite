// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for kite.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import getNodeConfiguration from '../perennial-alias/js/eslint/getNodeConfiguration.mjs';
import { getPhetLibraryConfiguration } from '../perennial-alias/js/eslint/phet-library.eslint.config.mjs';
import rootEslintConfig from '../perennial-alias/js/eslint/root.eslint.config.mjs';

const nodeFiles = [
  'js/grunt/**/*'
];

export default [
  ...rootEslintConfig,
  ...getPhetLibraryConfiguration( {
    files: [ '**/*' ],
    ignores: nodeFiles
  } ),
  ...getNodeConfiguration( { files: nodeFiles } ),
  {
    ignores: [
      'js/parser/svgPath.js'
    ]
  }
];