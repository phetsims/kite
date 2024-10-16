// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for kite.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import getNodeConfiguration from '../chipper/eslint/getNodeConfiguration.mjs';
import { getPhetLibraryConfiguration } from '../chipper/eslint/phet-library.eslint.config.mjs';
import rootEslintConfig from '../chipper/eslint/root.eslint.config.mjs';

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