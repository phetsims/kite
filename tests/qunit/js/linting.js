(function() {
  'use strict';

  module( 'Kite: JSHint' );

  unitTestLintFilesMatching( function( src ) {
    return src.indexOf( 'kite/js' ) !== -1 && src.indexOf( 'kite/js/parser/svgPath.js' ) === -1;
  } );
})();
