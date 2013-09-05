
(function(){
  'use strict';
  
  module( 'Kite: JSHint' );
  
  unitTestLintFilesMatching( function( src ) {
    return src.indexOf( 'kite/js' ) !== -1;
  } );
})();
