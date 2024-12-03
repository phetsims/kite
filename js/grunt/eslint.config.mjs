// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for kite grunt.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import nodeEslintConfig from '../../../perennial-alias/js/eslint/config/node.eslint.config.mjs';
import { mutateForNestedConfig } from '../../../perennial-alias/js/eslint/config/root.eslint.config.mjs';

export default [
  ...mutateForNestedConfig( nodeEslintConfig )
];