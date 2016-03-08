(function() {
  if ( !window.hasOwnProperty( '_' ) ) {
    throw new Error( 'Underscore/Lodash not found: _' );
  }

// Copyright 2013-2015, University of Colorado Boulder

/*
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

(function() {
  'use strict';

  window.assertions = window.assertions || {};
  window.assertions.assertFunction = window.assertions.assertFunction || function( predicate, message ) {
    var result = typeof predicate === 'function' ? predicate() : predicate;

    if ( !result ) {

      //Log the stack trace to IE.  Just creating an Error is not enough, it has to be caught to get a stack.
      if ( window.navigator && window.navigator.appName === 'Microsoft Internet Explorer' ) {
        try { throw new Error(); }
        catch( e ) { message = message + ', stack=\n' + e.stack; }
      }

      console && console.log && console.log( 'Assertion failed: ' + message );
      throw new Error( 'Assertion failed: ' + message );
    }
  };

  window.assert = window.assert || null;
  window.assertSlow = window.assertSlow || null;

  window.assertions.enableAssert = function() {
    window.assert = window.assertions.assertFunction;
    window.console && window.console.log && window.console.log( 'enabling assert' );
  };
  window.assertions.disableAssert = function() {
    window.assert = null;
    window.console && window.console.log && window.console.log( 'disabling assert' );
  };

  window.assertions.enableAssertSlow = function() {
    window.assertSlow = window.assertions.assertFunction;
    window.console && window.console.log && window.console.log( 'enabling assertSlow' );
  };
  window.assertions.disableAssertSlow = function() {
    window.assertSlow = null;
    window.console && window.console.log && window.console.log( 'disabling assertSlow' );
  };
})();
/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("almond", function(){});

// Copyright 2015, University of Colorado Boulder

/**
 * @author Jonathan Olson
 * @author Chris Malley (PixelZoom, Inc.)
 */
define( 'PHET_CORE/Namespace',['require'],function( require ) {
  'use strict';

  /**
   * @param {string} name
   * @constructor
   */
  function Namespace( name ) {

    this.name = name; // @public (read-only)

    if ( window.phet ) {
      assert && assert( !window.phet[ name ], 'namespace ' + name + ' already exists' );
      window.phet[ name ] = this;
    }
  }

  Namespace.prototype = {

    constructor: Namespace,

    /**
     * Registers a key-value pair with the namespace.
     *
     * If there are no dots ('.') in the key, it will be assigned to the namespace. For example:
     * - x.register( 'A', A );
     * will set x.A = A.
     *
     * If the key contains one or more dots ('.'), it's treated somewhat like a path expression. For instance, if the
     * following is called:
     * - x.register( 'A.B.C', C );
     * then the register function will navigate to the object x.A.B and add x.A.B.C = C.
     *
     * @param {string} key
     * @param {*} value
     * @public
     */
    register: function( key, value ) {

      // If the key isn't compound (doesn't contain '.'), we can just look it up on this namespace
      if ( key.indexOf( '.' ) < 0 ) {
        assert && assert( !this[ key ], key + ' is already registered for namespace ' + this.name );
        this[ key ] = value;
      }
      // Compound (contains '.' at least once). x.register( 'A.B.C', C ) should set x.A.B.C.
      else {
        var keys = key.split( '.' ); // e.g. [ 'A', 'B', 'C' ]

        // Walk into the namespace, verifying that each level exists. e.g. parent => x.A.B
        var parent = this;
        for ( var i = 0; i < keys.length - 1; i++ ) { // for all but the last key
          assert && assert( !!parent[ keys[ i ] ],
            [ this.name ].concat( keys.slice( 0, i + 1 ) ).join( '.' ) + ' needs to be defined to register ' + key );

          parent = parent[ keys[ i ] ];
        }

        // Write into the inner namespace, e.g. x.A.B[ 'C' ] = C
        var lastKey = keys[ keys.length - 1 ];
        assert && assert( !parent[ lastKey ], key + ' is already registered for namespace ' + this.name );
        parent[ lastKey ] = value;
      }

      return value;
    }
  };

  return Namespace;
} );

// Copyright 2013-2015, University of Colorado Boulder

define( 'PHET_CORE/phetCore',['require','PHET_CORE/Namespace'],function( require ) {
  'use strict';

  var Namespace = require( 'PHET_CORE/Namespace' );

  // no phetAllocation initialized, since we don't need it with just phet-core, and this file is required before that

  var phetCore = new Namespace( 'phetCore' );

  // Namespace can't require this file, so we register it as a special case.
  phetCore.register( 'Namespace', Namespace );

  return phetCore;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Object instance allocation tracking, so we can cut down on garbage collection.
 *
 * Sample usage:
 * 1. Run the sim and set up the scenario that you wish to profile
 * 2. In the JS console, type: window.alloc={}
 * 3. Wait until you have taken enough data
 * 4. Type x = window.alloc; delete window.alloc;
 *
 * Now you can inspect the x variable which contains the allocation information.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/phetAllocation',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  function phetAllocation( name ) {
    if ( window.alloc ) {
      var stack;
      try { throw new Error(); }
      catch( e ) { stack = e.stack; }

      if ( !window.alloc[ name ] ) {
        window.alloc[ name ] = { count: 0, stacks: {} };
      }
      var log = window.alloc[ name ];

      log.count++;
      if ( !log.stacks[ stack ] ) {
        log.stacks[ stack ] = 1;
      }
      else {
        log.stacks[ stack ] += 1;
      }
      log.report = function() {
        var stacks = Object.keys( log.stacks );
        stacks = _.sortBy( stacks, function( key ) { return log.stacks[ key ]; } );
        _.each( stacks, function( stack ) {
          console.log( log.stacks[ stack ] + ': ' + stack );
        } );
      };
    }
  }

  phetCore.register( 'phetAllocation', phetAllocation );

  return phetAllocation;
} );
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

define( 'KITE/kite',['require','PHET_CORE/Namespace','PHET_CORE/phetAllocation'],function( require ) {
  'use strict';

  var Namespace = require( 'PHET_CORE/Namespace' );

  // object allocation tracking
  window.phetAllocation = require( 'PHET_CORE/phetAllocation' );

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

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Like Underscore's _.extend, but with hardcoded support for ES5 getters/setters.
 *
 * See https://github.com/documentcloud/underscore/pull/986.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/extend',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  function extend( obj ) {
    _.each( Array.prototype.slice.call( arguments, 1 ), function( source ) {
      if ( source ) {
        for ( var prop in source ) {
          Object.defineProperty( obj, prop, Object.getOwnPropertyDescriptor( source, prop ) );
        }
      }
    } );
    return obj;
  }

  phetCore.register( 'extend', extend );

  return extend;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * Utility function for setting up prototypal inheritance.
 * Maintains supertype.prototype.constructor while properly copying ES5 getters and setters.
 * Supports adding functions to both the prototype itself and the constructor function.
 *
 * Usage:
 *
 * // Call the supertype constructor somewhere in the subtype's constructor.
 * function A() { scenery.Node.call( this ); };
 *
 * // Add prototype functions and/or 'static' functions
 * return inherit( scenery.Node, A, {
 *   customBehavior: function() { ... },
 *   isAnA: true
 * }, {
 *   someStaticFunction: function() { ...}
 * } );
 *
 * // client calls
 * new A().isAnA; // true
 * new scenery.Node().isAnA; // undefined
 * new A().constructor.name; // 'A'
 * A.someStaticFunction();
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
define( 'PHET_CORE/inherit',['require','PHET_CORE/phetCore','PHET_CORE/extend'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );
  var extend = require( 'PHET_CORE/extend' );

  /**
   * @param supertype           Constructor for the supertype.
   * @param subtype             Constructor for the subtype. Generally should contain supertype.call( this, ... )
   * @param prototypeProperties [optional] object containing properties that will be set on the prototype.
   * @param staticProperties [optional] object containing properties that will be set on the constructor function itself
   */
  function inherit( supertype, subtype, prototypeProperties, staticProperties ) {
    assert && assert( typeof supertype === 'function' );

    function F() {}

    F.prototype = supertype.prototype; // so new F().__proto__ === supertype.prototype

    subtype.prototype = extend( // extend will combine the properties and constructor into the new F copy
      new F(),                  // so new F().__proto__ === supertype.prototype, and the prototype chain is set up nicely
      { constructor: subtype }, // overrides the constructor properly
      prototypeProperties       // [optional] additional properties for the prototype, as an object.
    );

    //Copy the static properties onto the subtype constructor so they can be accessed 'statically'
    extend( subtype, staticProperties );

    return subtype; // pass back the subtype so it can be returned immediately as a module export
  }

  phetCore.register( 'inherit', inherit );

  return inherit;
} );
// Copyright 2013-2015, University of Colorado Boulder

define( 'AXON/axon',['require','PHET_CORE/Namespace'],function( require ) {
  'use strict';

  var Namespace = require( 'PHET_CORE/Namespace' );

  return new Namespace( 'axon' );
} );

// Copyright 2014-2015, University of Colorado Boulder

/**
 * If given an Array, removes all of its elements and returns it. Otherwise, if given a falsy value
 * (null/undefined/etc.), it will create and return a fresh Array.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/cleanArray',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  function cleanArray( arr ) {
    assert && assert( !arr || ( arr instanceof Array ), 'cleanArray either takes an Array' );

    if ( arr ) {
      // fastest way to clear an array (http://stackoverflow.com/questions/1232040/how-to-empty-an-array-in-javascript, http://jsperf.com/array-destroy/32)
      // also, better than length=0, since it doesn't create significant garbage collection (like length=0), tested on Chrome 34.
      while ( arr.length ) {
        arr.pop();
      }
      return arr;
    }
    else {
      return [];
    }
  }

  phetCore.register( 'cleanArray', cleanArray );

  return cleanArray;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * Lightweight event & listener abstraction.
 * @author Sam Reid
 */
define( 'AXON/Events',['require','AXON/axon','PHET_CORE/cleanArray'],function( require ) {
  'use strict';

  // modules
  var axon = require( 'AXON/axon' );
  var cleanArray = require( 'PHET_CORE/cleanArray' );

  /**
   * @class Events
   * @constructor
   */
  function Events( options ) {

    this._eventListeners = {}; // @private
    this._staticEventListeners = {}; // @private

    options && options.tandem && options.tandem.addInstance( this );
    this.disposeEvents = function() {
      options && options.tandem && options.tandem.removeInstance( this );
    };
  }

  axon.register( 'Events', Events );

  Events.prototype = {

    // @public
    dispose: function() {
      this.disposeEvents();
    },

    /////////////////////////////////////////////
    // Below this point are the functions for event handling, basically orthogonal to property value change notifications

    /**
     * Register a listener when the specified eventName is triggered. Use off() to remove.
     * Concurrent modification of listeners (on/off) from within the callback is acceptable.
     * @param {string} eventName the name for the event channel
     * @param {function} callback
     * @public
     */
    on: function( eventName, callback ) {
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );
      assert && assert( typeof callback === 'function', 'callback should be a function' );

      this._eventListeners[ eventName ] = this._eventListeners[ eventName ] || [];
      this._eventListeners[ eventName ].push( callback );
    },

    /**
     * Register a listener when the specified eventName is triggered. Listener should be "static", meaning:
     *   1. It shall not add/remove any "static" listeners (including itself) while it is being called (as any type of side-effect), and
     *   2. "static" listeners should not be added while a non-static listener (on the same object) is being called.
     * These restrictions allow us to guarantee that all listeners attached when an event is triggered are called.
     * Since static listeners are stored separately, use offStatic() to remove listeners added with onStatic()
     * @param {string} eventName the name for the event channel
     * @param {function} callback
     * @public
     */
    onStatic: function( eventName, callback ) {
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );
      assert && assert( typeof callback === 'function', 'callback should be a function' );

      this._staticEventListeners[ eventName ] = this._staticEventListeners[ eventName ] || [];
      this._staticEventListeners[ eventName ].push( callback );
    },

    /**
     * Adds a function which will only be called back once, after which it is removed as a listener.
     * If you need to remove a function added with 'once' you will have to remove its handle, which is returned by the function.
     * @param {string} eventName the name for the event channel
     * @param {function} callback function to be called back once (if at all)
     * @public
     */
    once: function( eventName, callback ) {
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );
      assert && assert( typeof callback === 'function', 'callback should be a function' );

      var events = this;
      var wrappedCallback = function() {
        events.off( eventName, wrappedCallback );

        //If no arguments being passed through, call back without processing arguments, for possible speed
        if ( arguments.length === 0 ) {
          callback();
        }
        else {

          //General case of passing events through to the wrapped callback function
          callback.apply( this, Array.prototype.slice.call( arguments, 0 ) );
        }
      };
      this.on( eventName, wrappedCallback );

      //Return the handle in case it needs to be removed.
      return wrappedCallback;
    },

    /**
     * Remove a listener added with on() from the specified event type.  Does nothing if the listener did not exist.
     * @param {string} eventName the name for the event channel
     * @param {function} callback
     * @public
     */
    off: function( eventName, callback ) {
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );
      assert && assert( typeof callback === 'function', 'callback should be a function' );

      var index = -1;
      if ( this._eventListeners[ eventName ] ) {
        index = this._eventListeners[ eventName ].indexOf( callback );
        if ( index !== -1 ) {
          this._eventListeners[ eventName ].splice( index, 1 );
        }
      }

      return index; // so we can tell if we actually removed a listener
    },

    /**
     * Remove a listener added with onStatic() from the specified event type.  Does nothing if the listener did not exist.
     * @param {string} eventName the name for the event channel
     * @param {function} callback
     * @public
     */
    offStatic: function( eventName, callback ) {
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );
      assert && assert( typeof callback === 'function', 'callback should be a function' );

      var index = -1;
      if ( this._staticEventListeners[ eventName ] ) {
        index = this._staticEventListeners[ eventName ].indexOf( callback );
        if ( index !== -1 ) {
          this._staticEventListeners[ eventName ].splice( index, 1 );
        }
      }

      return index; // so we can tell if we actually removed a listener
    },

    /**
     * Checks for the existence of a specific listener, attached to a specific event name. Doesn't check for static listeners
     * @param {string} eventName the name for the event channel
     * @param {function} callback
     * @returns {boolean}
     * @public
     */
    hasListener: function( eventName, callback ) {
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );
      assert && assert( typeof callback === 'function', 'callback should be a function' );

      var array = this._eventListeners[ eventName ];
      return !!array && array.indexOf( callback ) >= 0;
    },

    /**
     * Checks for the existence of a specific static listener, attached to a specific event name. Doesn't check for non-static listeners
     * @param {string} eventName the name for the event channel
     * @param {function} callback
     * @returns {boolean}
     * @public
     */
    hasStaticListener: function( eventName, callback ) {
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );
      assert && assert( typeof callback === 'function', 'callback should be a function' );

      var array = this._staticEventListeners[ eventName ];
      return !!array && array.indexOf( callback ) >= 0;
    },

    /**
     * Removes all listeners added with on() and onStatic().
     * @public
     */
    removeAllEventListeners: function() {
      var eventName;
      for ( eventName in this._eventListeners ) {
        cleanArray( this._eventListeners[ eventName ] );
      }
      for ( eventName in this._staticEventListeners ) {
        cleanArray( this._staticEventListeners[ eventName ] );
      }
    },

    /**
     * Trigger an event with the specified name and arguments.
     * @param {string} eventName the name for the event channel
     * @param args... optional arguments to pass to the listeners
     * @public
     */
    trigger: function( eventName ) {
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );

      var listeners = this._eventListeners[ eventName ];
      var staticListeners = this._staticEventListeners[ eventName ];

      // listener quantities for normal and static
      var count = listeners ? listeners.length : 0;
      var staticCount = staticListeners ? staticListeners.length : 0;

      // only compute our arguments suffix once, instead of in our inner loop
      var suffix;
      var hasNoArguments = arguments.length === 1;
      if ( !hasNoArguments && ( count > 0 || staticCount > 0 ) ) {
        phetAllocation && phetAllocation( 'Array' );
        suffix = Array.prototype.slice.call( arguments, 1 );
      }

      // make a copy of non-static listeners, in case callback removes listener
      if ( count > 0 ) {
        listeners = listeners.slice();
      }

      var i;

      for ( i = 0; i < count; i++ ) {
        var listener = listeners[ i ];

        //Simple case of no arguments, call it separately for improved performance in case it is faster (untested)
        if ( hasNoArguments ) {
          listener();
        }
        else {
          listener.apply( this, suffix );
        }

        assert && assert( !staticListeners || staticListeners.length === staticCount, 'Concurrent modifications of static listeners from within non-static listeners are forbidden' );
      }

      for ( i = 0; i < staticCount; i++ ) {
        var staticListener = staticListeners[ i ];

        //Simple case of no arguments, call it separately for improved performance in case it is faster (untested)
        if ( hasNoArguments ) {
          staticListener( arguments );
        }
        else {
          staticListener.apply( this, suffix );
        }

        assert && assert( staticListeners.length === staticCount, 'Concurrent modifications from static listeners are forbidden' );
      }
    },

    /**
     * Trigger an event with the specified name, with no arguments.  Since the number of arguments is known
     * no additional work is required to process and pass through the arguments (as opposed to trigger() itself).
     * @param {string} eventName the name for the event channel
     * @public
     */
    trigger0: function( eventName ) {
      assert && assert( arguments.length === 1 );
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );

      var listeners = this._eventListeners[ eventName ];
      var staticListeners = this._staticEventListeners[ eventName ];

      // listener quantities for normal and static
      var count = listeners ? listeners.length : 0;
      var staticCount = staticListeners ? staticListeners.length : 0;

      // make a copy of non-static listeners, in case callback removes listener
      if ( count > 0 ) {
        listeners = listeners.slice();
      }

      var i;

      for ( i = 0; i < count; i++ ) {
        listeners[ i ]();

        assert && assert( !staticListeners || staticListeners.length === staticCount, 'Concurrent modifications of static listeners from within non-static listeners are forbidden' );
      }

      for ( i = 0; i < staticCount; i++ ) {
        staticListeners[ i ]();

        assert && assert( staticListeners.length === staticCount, 'Concurrent modifications from static listeners are forbidden' );
      }
    },

    /**
     * Trigger an event with the specified name, with a single argument.  Since the number of arguments is known
     * no additional work is required to process and pass through the arguments (as opposed to trigger() itself).
     * @param {string} eventName the name for the event channel
     * @param {Object} param1 - the argument to pass through to the listeners
     * @public
     */
    trigger1: function( eventName, param1 ) {
      assert && assert( arguments.length === 2 );
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );

      var listeners = this._eventListeners[ eventName ];
      var staticListeners = this._staticEventListeners[ eventName ];

      // listener quantities for normal and static
      var count = listeners ? listeners.length : 0;
      var staticCount = staticListeners ? staticListeners.length : 0;

      // make a copy of non-static listeners, in case callback removes listener
      if ( count > 0 ) {
        listeners = listeners.slice();
      }

      var i;

      for ( i = 0; i < count; i++ ) {
        listeners[ i ]( param1 );

        assert && assert( !staticListeners || staticListeners.length === staticCount, 'Concurrent modifications of static listeners from within non-static listeners are forbidden' );
      }

      for ( i = 0; i < staticCount; i++ ) {
        staticListeners[ i ]( param1 );

        assert && assert( staticListeners.length === staticCount, 'Concurrent modifications from static listeners are forbidden' );
      }
    },

    /**
     * Trigger an event with the specified name, with two arguments.  Since the number of arguments is known
     * no additional work is required to process and pass through the arguments (as opposed to trigger() itself).
     * @param {string} eventName the name for the event channel
     * @param {Object} param1 - the first parameter
     * @param {Object} param2 - the second parameter
     * @public
     */
    trigger2: function( eventName, param1, param2 ) {
      assert && assert( arguments.length === 3 );
      assert && assert( typeof eventName === 'string', 'eventName should be a string' );

      var listeners = this._eventListeners[ eventName ];
      var staticListeners = this._staticEventListeners[ eventName ];

      // listener quantities for normal and static
      var count = listeners ? listeners.length : 0;
      var staticCount = staticListeners ? staticListeners.length : 0;

      // make a copy of non-static listeners, in case callback removes listener
      if ( count > 0 ) {
        listeners = listeners.slice();
      }

      var i;

      for ( i = 0; i < count; i++ ) {
        listeners[ i ]( param1, param2 );

        assert && assert( !staticListeners || staticListeners.length === staticCount, 'Concurrent modifications of static listeners from within non-static listeners are forbidden' );
      }

      for ( i = 0; i < staticCount; i++ ) {
        staticListeners[ i ]( param1, param2 );

        assert && assert( staticListeners.length === staticCount, 'Concurrent modifications from static listeners are forbidden' );
      }
    }
  };

  return Events;
} );

// Copyright 2013-2015, University of Colorado Boulder

define( 'DOT/dot',['require','PHET_CORE/Namespace','PHET_CORE/phetAllocation'],function( require ) {
  'use strict';

  var Namespace = require( 'PHET_CORE/Namespace' );

  // object allocation tracking
  window.phetAllocation = require( 'PHET_CORE/phetAllocation' );

  var dot = new Namespace( 'dot' );

  dot.register( 'v2', function( x, y ) { return new dot.Vector2( x, y ); } );
  dot.register( 'v3', function( x, y, z ) { return new dot.Vector3( x, y, z ); } );
  dot.register( 'v4', function( x, y, z, w ) { return new dot.Vector4( x, y, z, w ); } );

  // TODO: performance: check browser speed to compare how fast this is. We may need to add a 32 option for GL ES.
  dot.register( 'FastArray', window.Float64Array ? window.Float64Array : window.Array );

  // will be filled in by other modules
  return dot;
} );

// Copyright 2015, University of Colorado Boulder

/**
 * Object pooling mix-in, for cases where creating new objects is expensive, and we'd rather mark some objects as able
 * to be reused (i.e. 'in the pool'). This provides a pool of objects for each type it is invoked on. It allows for
 * getting "new" objects that can either be constructed OR pulled in from a pool, and requires that the objects are
 * essentially able to "re-run" the constructor.
 *
 * This is usually done by having an initialize() method on the objects with the same call signature as the constructor,
 * and the constructor basically forwards to initialize(). Thus most "construction" logic is in the initialize() call.
 * Then when putting the object back in the pool, references should be released, so memory isn't leaked. The initialize()
 * function needs to support being called multiple times, and generally shouldn't create additional objects on calls
 * after the first.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/Poolable',['require','PHET_CORE/phetCore','PHET_CORE/extend'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );
  var extend = require( 'PHET_CORE/extend' );

  var Poolable = {
    /**
     * Adds the pool and some static methods to the type, and adds the instance method freeToPool() to the type's
     * prototype.
     * @public
     *
     * Options available:
     * - maxPoolSize {number} - Maximum number of items that can be allowed in the pool
     * - initialSize {number} - If non-zero, that many fresh items will be constructed if there is a defaultFactory
     * - defaultFactory {function() => Type} - Factory function with no parameters that creates an instance of the type.
     *     Allows Type.dirtyFromPool() and Type.fillPool()
     * - constructorDuplicateFactory { function( pool ) => function( ... ) => Type}
     *     Creates a factory function that takes the same parameters as the type's constructors. Allows
     *     Type.createFromPool( ... )
     *
     * @param {function} type - The constructor for the type
     * @param {Object} [options] -
     */
    mixin: function( type, options ) {
      var proto = type.prototype;

      // defaults
      options = extend( {
        maxPoolSize: 50, // since we don't want to blow too much memory
        initialSize: 0
      }, options );

      var pool = type.pool = [];

      /*
       * For example: defaultFactory: function() { return new Vector2(); }
       */
      if ( options.defaultFactory ) {
        // @public
        type.dirtyFromPool = function() {
          if ( pool.length ) {
            // return an instance in an arbitrary (dirty) state
            return pool.pop();
          }
          else {
            // else return a new default instance
            return options.defaultFactory();
          }
        };

        // @public - fills the object pool up to n instances
        type.fillPool = function( n ) {
          // fill up the object pool to the initial size
          while ( pool.length < n ) {
            pool.push( options.defaultFactory() );
          }
        };

        // fill the pool initially to the initial size
        type.fillPool( options.initialSize );
      }

      /*
       * For example: constructorDuplicateFactory:
       *                function( pool ) {
       *                  return function( x, y ) {
       *                    if ( pool.length ) {
       *                      return pool.pop().set( x, y );
       *                    } else {
       *                      return new Vector2( x, y );
       *                    }
       *                  }
       *                }
       * It allows arbitrary creation (from the constructor / etc) or mutation (from the pooled instance).
       */
      if ( options.constructorDuplicateFactory ) {
        // @public
        type.createFromPool = options.constructorDuplicateFactory( pool );
      }

      /*
       * @public
       * Frees the object to the pool (instance.freeToPool())
       */
      proto.freeToPool = function() {
        if ( pool.length < options.maxPoolSize ) {
          pool.push( this );
        }
      };
    }
  };
  phetCore.register( 'Poolable', Poolable );

  return Poolable;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * Utility functions for Dot, placed into the dot.X namespace.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Util',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );
  // require( 'DOT/Vector2' ); // Require.js doesn't like the circular reference

  // constants
  var EPSILON = Number.MIN_VALUE;
  var TWO_PI = 2 * Math.PI;

  // "static" variables used in boxMullerTransform
  var generate;
  var z0;
  var z1;

  var Util = {
    /**
     * Returns the original value if it is inclusively within the [max,min] range. If it's below the range, min is
     * returned, and if it's above the range, max is returned.
     * @public
     *
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    clamp: function( value, min, max ) {
      if ( value < min ) {
        return min;
      }
      else if ( value > max ) {
        return max;
      }
      else {
        return value;
      }
    },

    /**
     * Returns a number in the range $n\in[\mathrm{min},\mathrm{max})$ with the same equivalence class as the input
     * value mod (max-min), i.e. for a value $m$, $m\equiv n\ (\mathrm{mod}\ \mathrm{max}-\mathrm{min})$.
     * @public
     *
     * The 'down' indicates that if the value is equal to min or max, the max is returned.
     *
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    moduloBetweenDown: function( value, min, max ) {
      assert && assert( max > min, 'max > min required for moduloBetween' );

      var divisor = max - min;

      // get a partial result of value-min between [0,divisor)
      var partial = ( value - min ) % divisor;
      if ( partial < 0 ) {
        // since if value-min < 0, the remainder will give us a negative number
        partial += divisor;
      }

      return partial + min; // add back in the minimum value
    },

    /**
     * Returns a number in the range $n\in(\mathrm{min},\mathrm{max}]$ with the same equivalence class as the input
     * value mod (max-min), i.e. for a value $m$, $m\equiv n\ (\mathrm{mod}\ \mathrm{max}-\mathrm{min})$.
     * @public
     *
     * The 'up' indicates that if the value is equal to min or max, the min is returned.
     *
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    moduloBetweenUp: function( value, min, max ) {
      return -Util.moduloBetweenDown( -value, -max, -min );
    },

    /**
     * Returns an array of integers from A to B (inclusive), e.g. rangeInclusive( 4, 7 ) maps to [ 4, 5, 6, 7 ].
     * @public
     *
     * @param {number} a
     * @param {number} b
     * @returns {Array.<number>}
     */
    rangeInclusive: function( a, b ) {
      if ( b < a ) {
        return [];
      }
      var result = new Array( b - a + 1 );
      for ( var i = a; i <= b; i++ ) {
        result[ i - a ] = i;
      }
      return result;
    },

    /**
     * Returns an array of integers from A to B (exclusive), e.g. rangeExclusive( 4, 7 ) maps to [ 5, 6 ].
     * @public
     *
     * @param {number} a
     * @param {number} b
     * @returns {Array.<number>}
     */
    rangeExclusive: function( a, b ) {
      return Util.rangeInclusive( a + 1, b - 1 );
    },

    /**
     * Converts degrees to radians.
     * @public
     *
     * @param {number} degrees
     * @returns {number}
     */
    toRadians: function( degrees ) {
      return Math.PI * degrees / 180;
    },

    /**
     * Converts radians to degrees.
     * @public
     *
     * @param {number} radians
     * @returns {number}
     */
    toDegrees: function( radians ) {
      return 180 * radians / Math.PI;
    },

    /**
     * Greatest Common Denominator, using https://en.wikipedia.org/wiki/Euclidean_algorithm
     * @public
     *
     * @param {number} a
     * @param {number} b
     */
    gcd: function( a, b ) {
      return b === 0 ? a : this.gcd( b, a % b );
    },

    /**
     * Intersection point between the lines defined by the line segments p1-2 and p3-p4. Currently does not handle
     * parallel lines.
     * @public
     *
     * @param {Vector2} p1
     * @param {Vector2} p2
     * @param {Vector2} p3
     * @param {Vector2} p4
     * @returns {Vector2}
     */
    lineLineIntersection: function( p1, p2, p3, p4 ) {
      // Taken from an answer in http://stackoverflow.com/questions/385305/efficient-maths-algorithm-to-calculate-intersections
      var x12 = p1.x - p2.x;
      var x34 = p3.x - p4.x;
      var y12 = p1.y - p2.y;
      var y34 = p3.y - p4.y;

      var denom = x12 * y34 - y12 * x34;

      var a = p1.x * p2.y - p1.y * p2.x;
      var b = p3.x * p4.y - p3.y * p4.x;

      return new dot.Vector2(
        ( a * x34 - x12 * b ) / denom,
        ( a * y34 - y12 * b ) / denom
      );
    },

    /**
     * Ray-sphere intersection, returning information about the closest intersection. Assumes the sphere is centered
     * at the origin (for ease of computation), transform the ray to compensate if needed.
     * @public
     *
     * If there is no intersection, null is returned. Otherwise an object will be returned like:
     * <pre class="brush: js">
     * {
     *   distance: {number}, // distance from the ray position to the intersection
     *   hitPoint: {Vector3}, // location of the intersection
     *   normal: {Vector3}, // the normal of the sphere's surface at the intersection
     *   fromOutside: {boolean}, // whether the ray intersected the sphere from outside the sphere first
     * }
     * </pre>
     *
     * @param {number} radius
     * @param {Ray3} ray
     * @param {number} epsilon
     * @returns {Object}
     */
    // assumes a sphere with the specified radius, centered at the origin
    sphereRayIntersection: function( radius, ray, epsilon ) {
      epsilon = epsilon === undefined ? 1e-5 : epsilon;

      // center is the origin for now, but leaving in computations so that we can change that in the future. optimize away if needed
      var center = new dot.Vector3();

      var rayDir = ray.direction;
      var pos = ray.position;
      var centerToRay = pos.minus( center );

      // basically, we can use the quadratic equation to solve for both possible hit points (both +- roots are the hit points)
      var tmp = rayDir.dot( centerToRay );
      var centerToRayDistSq = centerToRay.magnitudeSquared();
      var det = 4 * tmp * tmp - 4 * ( centerToRayDistSq - radius * radius );
      if ( det < epsilon ) {
        // ray misses sphere entirely
        return null;
      }

      var base = rayDir.dot( center ) - rayDir.dot( pos );
      var sqt = Math.sqrt( det ) / 2;

      // the "first" entry point distance into the sphere. if we are inside the sphere, it is behind us
      var ta = base - sqt;

      // the "second" entry point distance
      var tb = base + sqt;

      if ( tb < epsilon ) {
        // sphere is behind ray, so don't return an intersection
        return null;
      }

      var hitPositionB = ray.pointAtDistance( tb );
      var normalB = hitPositionB.minus( center ).normalized();

      if ( ta < epsilon ) {
        // we are inside the sphere
        // in => out
        return {
          distance: tb,
          hitPoint: hitPositionB,
          normal: normalB.negated(),
          fromOutside: false
        };
      }
      else {
        // two possible hits
        var hitPositionA = ray.pointAtDistance( ta );
        var normalA = hitPositionA.minus( center ).normalized();

        // close hit, we have out => in
        return {
          distance: ta,
          hitPoint: hitPositionA,
          normal: normalA,
          fromOutside: true
        };
      }
    },

    /**
     * Returns an array of the real roots of the quadratic equation $ax^2 + bx + c=0$ (there will be between 0 and 2 roots).
     * @public
     *
     * @param {number} a
     * @param {number} b
     * @param {number} c
     * @returns {Array.<number>}
     */
    solveQuadraticRootsReal: function( a, b, c ) {
      var epsilon = 1E7;

      //We need to test whether a is several orders of magnitude less than b or c. If so, return the result as a solution to the linear (easy) equation
      if ( a === 0 || Math.abs( b / a ) > epsilon || Math.abs( c / a ) > epsilon ) {
        return [ -c / b ];
      }

      var discriminant = b * b - 4 * a * c;
      if ( discriminant < 0 ) {
        return [];
      }
      var sqrt = Math.sqrt( discriminant );
      // TODO: how to handle if discriminant is 0? give unique root or double it?
      // TODO: probably just use Complex for the future
      return [
        ( -b - sqrt ) / ( 2 * a ),
        ( -b + sqrt ) / ( 2 * a )
      ];
    },

    /**
     * Returns an array of the real roots of the quadratic equation $ax^3 + bx^2 + cx + d=0$ (there will be between 0 and 3 roots).
     * @public
     *
     * @param {number} a
     * @param {number} b
     * @param {number} c
     * @param {number} d
     * @returns {Array.<number>}
     */
    solveCubicRootsReal: function( a, b, c, d ) {
      // TODO: a Complex type!

      //We need to test whether a is several orders of magnitude less than b, c, d
      var epsilon = 1E7;

      if ( a === 0 || Math.abs( b / a ) > epsilon || Math.abs( c / a ) > epsilon || Math.abs( d / a ) > epsilon ) {
        return Util.solveQuadraticRootsReal( b, c, d );
      }
      if ( d === 0 || Math.abs( a / d ) > epsilon || Math.abs( b / d ) > epsilon || Math.abs( c / d ) > epsilon ) {
        return Util.solveQuadraticRootsReal( a, b, c );
      }

      b /= a;
      c /= a;
      d /= a;

      var q = ( 3.0 * c - ( b * b ) ) / 9;
      var r = ( -(27 * d) + b * (9 * c - 2 * (b * b)) ) / 54;
      var discriminant = q * q * q + r * r;
      var b3 = b / 3;

      if ( discriminant > 0 ) {
        // a single real root
        var dsqrt = Math.sqrt( discriminant );
        return [ Util.cubeRoot( r + dsqrt ) + Util.cubeRoot( r - dsqrt ) - b3 ];
      }

      // three real roots
      if ( discriminant === 0 ) {
        // contains a double root
        var rsqrt = Util.cubeRoot( r );
        var doubleRoot = b3 - rsqrt;
        return [ -b3 + 2 * rsqrt, doubleRoot, doubleRoot ];
      }
      else {
        // all unique
        var qX = -q * q * q;
        qX = Math.acos( r / Math.sqrt( qX ) );
        var rr = 2 * Math.sqrt( -q );
        return [
          -b3 + rr * Math.cos( qX / 3 ),
          -b3 + rr * Math.cos( ( qX + 2 * Math.PI ) / 3 ),
          -b3 + rr * Math.cos( ( qX + 4 * Math.PI ) / 3 )
        ];
      }
    },

    /**
     * Returns the unique real cube root of x, such that $y^3=x$.
     * @public
     *
     * @param {number} x
     * @returns {number}
     */
    cubeRoot: function( x ) {
      return x >= 0 ? Math.pow( x, 1 / 3 ) : -Math.pow( -x, 1 / 3 );
    },

    /**
     * Defines and evaluates a linear mapping. The mapping is defined so that $f(a_1)=b_1$ and $f(a_2)=b_2$, and other
     * values are interpolated along the linear equation. The returned value is $f(a_3)$.
     * @public
     *
     * @param {number} a1
     * @param {number} a2
     * @param {number} b1
     * @param {number} b2
     * @param {number} a3
     * @returns {number}
     */
    linear: function( a1, a2, b1, b2, a3 ) {
      return ( b2 - b1 ) / ( a2 - a1 ) * ( a3 - a1 ) + b1;
    },

    /**
     * Rounds using "Round half away from zero" algorithm. See dot#35.
     * @public
     *
     * JavaScript's Math.round is not symmetric for positive and negative numbers, it uses IEEE 754 "Round half up".
     * See https://en.wikipedia.org/wiki/Rounding#Round_half_up.
     * For sims, we want to treat positive and negative values symmetrically, which is IEEE 754 "Round half away from zero",
     * See https://en.wikipedia.org/wiki/Rounding#Round_half_away_from_zero
     *
     * Note that -0 is rounded to 0, since we typically do not want to display -0 in sims.
     *
     * @param {number} value                               `
     * @returns {number}
     */
    roundSymmetric: function( value ) {
      return ( ( value < 0 ) ? -1 : 1 ) * Math.round( Math.abs( value ) );
    },

    /**
     * A predictable implementation of toFixed.
     * @public
     *
     * JavaScript's toFixed is notoriously buggy, behavior differs depending on browser,
     * because the spec doesn't specify whether to round or floor.
     * Rounding is symmetric for positive and negative values, see Util.roundSymmetric.
     *
     * @param {number} value
     * @param {number} decimalPlaces
     * @returns {string}
     */
    toFixed: function( value, decimalPlaces ) {
      var multiplier = Math.pow( 10, decimalPlaces );
      var newValue = Util.roundSymmetric( value * multiplier ) / multiplier;
      return newValue.toFixed( decimalPlaces );
    },

    /**
     * A predictable implementation of toFixed, where the result is returned as a number instead of a string.
     * @public
     *
     * JavaScript's toFixed is notoriously buggy, behavior differs depending on browser,
     * because the spec doesn't specify whether to round or floor.
     * Rounding is symmetric for positive and negative values, see Util.roundSymmetric.
     *
     * @param {number} value
     * @param {number} decimalPlaces
     * @returns {number}
     */
    toFixedNumber: function( value, decimalPlaces ) {
      return parseFloat( Util.toFixed( value, decimalPlaces ) );
    },

    /**
     * Returns whether the input is a number that is an integer (no fractional part).
     * @public
     *
     * @param {number} n
     * @returns {boolean}
     */
    isInteger: function( n ) {
      return ( typeof n === 'number' ) && ( n % 1 === 0 );
    },

    /**
     * Computes the intersection of the two line segments $(x_1,y_1)(x_2,y_2)$ and $(x_3,y_3)(x_4,y_4)$. If there is no
     * intersection, null is returned.
     * @public
     *
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} x3
     * @param {number} y3
     * @param {number} x4
     * @param {number} y4
     * @returns {Vector2|null}
     */
    lineSegmentIntersection: function( x1, y1, x2, y2, x3, y3, x4, y4 ) {
      /*
       * Algorithm taken from Paul Bourke, 1989:
       * http://paulbourke.net/geometry/pointlineplane/
       * http://paulbourke.net/geometry/pointlineplane/pdb.c
       * Ported from MathUtil.java on 9/20/2013 by @samreid
       */
      var numA = ( x4 - x3 ) * ( y1 - y3 ) - ( y4 - y3 ) * ( x1 - x3 );
      var numB = ( x2 - x1 ) * ( y1 - y3 ) - ( y2 - y1 ) * ( x1 - x3 );
      var denom = ( y4 - y3 ) * ( x2 - x1 ) - ( x4 - x3 ) * ( y2 - y1 );

      // If denominator is 0, the lines are parallel or coincident
      if ( denom === 0 ) {
        return null;
      }
      else {
        var ua = numA / denom;
        var ub = numB / denom;

        // ua and ub must both be in the range 0 to 1 for the segments to have an intersection pt.
        if ( !( ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1 ) ) {
          return null;
        }
        else {
          var x = x1 + ua * ( x2 - x1 );
          var y = y1 + ua * ( y2 - y1 );
          return new dot.Vector2( x, y );
        }
      }
    },

    /**
     * Squared distance from a point to a line segment squared.
     * See http://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment
     * @public
     *
     * @param {Vector2} point - The point
     * @param {Vector2} a - Starting point of the line segment
     * @param {Vector2} b - Ending point of the line segment
     * @returns {number}
     */
    distToSegmentSquared: function( point, a, b ) {
      var segmentLength = a.distanceSquared( b );
      if ( segmentLength === 0 ) { return point.distanceSquared( a ); }
      var t = ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / segmentLength;
      return t < 0 ? point.distanceSquared( a ) :
             t > 1 ? point.distanceSquared( b ) :
             point.distanceSquared( new dot.Vector2( a.x + t * (b.x - a.x), a.y + t * (b.y - a.y) ) );
    },

    /**
     * Squared distance from a point to a line segment squared.
     * @public
     *
     * @param {Vector2} point - The point
     * @param {Vector2} a - Starting point of the line segment
     * @param {Vector2} b - Ending point of the line segment
     * @returns {number}
     */
    distToSegment: function( point, a, b ) { return Math.sqrt( this.distToSegmentSquared( point, a, b ) ); },

    /**
     * Determines whether the three points are approximately collinear.
     * @public
     *
     * @param {Vector2} a
     * @param {Vector2} b
     * @param {Vector2} c
     * @param {number} epsilon
     * @returns {boolean}
     */
    arePointsCollinear: function( a, b, c, epsilon ) {
      if ( epsilon === undefined ) {
        epsilon = 0;
      }
      return Util.triangleArea( a, b, c ) <= epsilon;
    },

    /**
     * The area inside the triangle defined by the three vertices.
     * @public
     *
     * @param {Vector2} a
     * @param {Vector2} b
     * @param {Vector2} c
     * @returns {number}
     */
    triangleArea: function( a, b, c ) {
      return Math.abs( Util.triangleAreaSigned( a, b, c ) );
    },

    /**
     * The area inside the triangle defined by the three vertices, but with the sign determined by whether the vertices
     * provided are clockwise or counter-clockwise.
     * @public
     *
     * @param {Vector2} a
     * @param {Vector2} b
     * @param {Vector2} c
     * @returns {number}
     */
    triangleAreaSigned: function( a, b, c ) {
      // TODO: investigate which way we want the sign (Canvas or WebGL style)
      return a.x * ( b.y - c.y ) + b.x * ( c.y - a.y ) + c.x * ( a.y - b.y );
    },

    /**
     * Log base-10, since it wasn't included in every supported browser.
     * @public
     *
     * @param {number} val
     * @returns {number}
     */
    log10: function( val ) {
      return Math.log( val ) / Math.LN10;
    },

    /**
     * Generates a random Gaussian sample with the given mean and standard deviation.
     * This method relies on the "static" variables generate, z0, and z1 defined above.
     * Random.js is the primary client of this function, but it is defined here so it can be
     * used other places more easily if need be.
     * Code inspired by example here: https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform.
     * @public
     *
     * @param {number} mu - The mean of the Gaussian
     * @param {number} sigma - The standard deviation of the Gaussian
     * @returns {number}
     */
    boxMullerTransform: function( mu, sigma ) {
      generate = !generate;

      if ( !generate ) {
        return z1 * sigma + mu;
      }

      var u1;
      var u2;
      do {
        u1 = Math.random();
        u2 = Math.random();
      }
      while ( u1 <= EPSILON );

      z0 = Math.sqrt( -2.0 * Math.log( u1 ) ) * Math.cos( TWO_PI * u2 );
      z1 = Math.sqrt( -2.0 * Math.log( u1 ) ) * Math.sin( TWO_PI * u2 );
      return z0 * sigma + mu;
    }
  };
  dot.register( 'Util', Util );

  // make these available in the main namespace directly (for now)
  dot.clamp = Util.clamp;
  dot.moduloBetweenDown = Util.moduloBetweenDown;
  dot.moduloBetweenUp = Util.moduloBetweenUp;
  dot.rangeInclusive = Util.rangeInclusive;
  dot.rangeExclusive = Util.rangeExclusive;
  dot.toRadians = Util.toRadians;
  dot.toDegrees = Util.toDegrees;
  dot.lineLineIntersection = Util.lineLineIntersection;
  dot.sphereRayIntersection = Util.sphereRayIntersection;
  dot.solveQuadraticRootsReal = Util.solveQuadraticRootsReal;
  dot.solveCubicRootsReal = Util.solveCubicRootsReal;
  dot.cubeRoot = Util.cubeRoot;
  dot.linear = Util.linear;
  dot.boxMullerTransform = Util.boxMullerTransform;

  return Util;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Basic 2-dimensional vector, represented as (x,y).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Vector2',['require','DOT/dot','PHET_CORE/inherit','PHET_CORE/Poolable','DOT/Util'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  require( 'DOT/Util' );
  // require( 'DOT/Vector3' ); // commented out since Require.js complains about the circular dependency

  /**
   * Creates a 2-dimensional vector with the specified X and Y values.
   * @constructor
   * @public
   *
   * @param {number} [x] - X coordinate, defaults to 0 if not provided
   * @param {number} [y] - Y coordinate, defaults to 0 if not provided
   */
  function Vector2( x, y ) {
    // @public {number} - The X coordinate of the vector.
    this.x = x !== undefined ? x : 0;

    // @public {number} - The Y coordinate of the vector.
    this.y = y !== undefined ? y : 0;

    assert && assert( typeof this.x === 'number', 'x needs to be a number' );
    assert && assert( typeof this.y === 'number', 'y needs to be a number' );

    phetAllocation && phetAllocation( 'Vector2' );
  }

  dot.register( 'Vector2', Vector2 );

  inherit( Object, Vector2, {
    // @public (read-only) - Helps to identify the dimension of the vector
    isVector2: true,
    dimension: 2,

    /**
     * The magnitude (Euclidean/L2 Norm) of this vector, i.e. $\sqrt{x^2+y^2}$.
     * @public
     *
     * @returns {number}
     */
    magnitude: function() {
      return Math.sqrt( this.magnitudeSquared() );
    },

    /**
     * The squared magnitude (square of the Euclidean/L2 Norm) of this vector, i.e. $x^2+y^2$.
     * @public
     *
     * @returns {number}
     */
    magnitudeSquared: function() {
      return this.x * this.x + this.y * this.y;
    },

    /**
     * The Euclidean distance between this vector (treated as a point) and another point.
     * @public
     *
     * @param {Vector2} point
     * @returns {number}
     */
    distance: function( point ) {
      return Math.sqrt( this.distanceSquared( point ) );
    },

    /**
     * The Euclidean distance between this vector (treated as a point) and another point (x,y).
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    distanceXY: function( x, y ) {
      var dx = this.x - x;
      var dy = this.y - y;
      return Math.sqrt( dx * dx + dy * dy );
    },

    /**
     * The squared Euclidean distance between this vector (treated as a point) and another point.
     * @public
     *
     * @param {Vector2} point
     * @returns {number}
     */
    distanceSquared: function( point ) {
      var dx = this.x - point.x;
      var dy = this.y - point.y;
      return dx * dx + dy * dy;
    },

    /**
     * The squared Euclidean distance between this vector (treated as a point) and another point (x,y).
     * @public
     *
     * @param {Vector2} point
     * @returns {number}
     */
    distanceSquaredXY: function( x, y ) {
      var dx = this.x - x;
      var dy = this.y - y;
      return dx * dx + dy * dy;
    },

    /**
     * The dot-product (Euclidean inner product) between this vector and another vector v.
     * @public
     *
     * @param {Vector2} v
     * @returns {number}
     */
    dot: function( v ) {
      return this.x * v.x + this.y * v.y;
    },

    /**
     * The dot-product (Euclidean inner product) between this vector and another vector (x,y).
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    dotXY: function( x, y ) {
      return this.x * x + this.y * y;
    },

    /**
     * The angle $\theta$ of this vector, such that this vector is equal to
     * $$ u = \begin{bmatrix} r\cos\theta \\ r\sin\theta \end{bmatrix} $$
     * for the magnitude $r \ge 0$ of the vector, with $\theta\in(-\pi,\pi]$
     * @public
     *
     * @returns {number}
     */
    angle: function() {
      return Math.atan2( this.y, this.x );
    },

    /**
     * The angle between this vector and another vector, in the range $\theta\in[0, \pi]$.
     * @public
     *
     * Equal to $\theta = \cos^{-1}( \hat{u} \cdot \hat{v} )$ where $\hat{u}$ is this vector (normalized) and $\hat{v}$
     * is the input vector (normalized).
     *
     * @param {Vector2} v
     * @returns {number}
     */
    angleBetween: function( v ) {
      var thisMagnitude = this.magnitude();
      var vMagnitude = v.magnitude();
      return Math.acos( dot.clamp( ( this.x * v.x + this.y * v.y ) / ( thisMagnitude * vMagnitude ), -1, 1 ) );
    },

    /**
     * Exact equality comparison between this vector and another vector.
     * @public
     *
     * @param {Vector2} other
     * @returns {boolean} - Whether the two vectors have equal components
     */
    equals: function( other ) {
      return this.x === other.x && this.y === other.y;
    },

    /**
     * Approximate equality comparison between this vector and another vector.
     * @public
     *
     * @param {Vector2} other
     * @param {number} epsilon
     * @returns {boolean} - Whether difference between the two vectors has no component with an absolute value greater
     *                      than epsilon.
     */
    equalsEpsilon: function( other, epsilon ) {
      if ( !epsilon ) {
        epsilon = 0;
      }
      return Math.max( Math.abs( this.x - other.x ), Math.abs( this.y - other.y ) ) <= epsilon;
    },

    /**
     * Whether all of the components are numbers (not NaN) that are not infinity or -infinity.
     * @public
     *
     * @returns {boolean}
     */
    isFinite: function() {
      return isFinite( this.x ) && isFinite( this.y );
    },

    /*---------------------------------------------------------------------------*
     * Immutables
     *---------------------------------------------------------------------------*/

    /**
     * Creates a copy of this vector, or if a vector is passed in, set that vector's values to ours.
     * @public
     *
     * This is the immutable form of the function set(), if a vector is provided. This will return a new vector, and
     * will not modify this vector.
     *
     * @param {Vector2} [vector] - If not provided, creates a new Vector2 with filled in values. Otherwise, fills in the
     *                             values of the provided vector so that it equals this vector.
     * @returns {Vector2}
     */
    copy: function( vector ) {
      if ( vector ) {
        return vector.set( this );
      }
      else {
        return new Vector2( this.x, this.y );
      }
    },

    /**
     * The scalar value of the z-component of the equivalent 3-dimensional cross product:
     * $$ f( u, v ) = \left( \begin{bmatrix} u_x \\ u_y \\ 0 \end{bmatrix} \times \begin{bmatrix} v_x \\ v_y \\ 0 \end{bmatrix} \right)_z = u_x v_y - u_y v_x $$
     * @public
     *
     * @param {Vector2} v
     * @returns {number}
     */
    crossScalar: function( v ) {
      return this.x * v.y - this.y * v.x;
    },

    /**
     * Normalized (re-scaled) copy of this vector such that its magnitude is 1. If its initial magnitude is zero, an
     * error is thrown.
     * @public
     *
     * This is the immutable form of the function normalize(). This will return a new vector, and will not modify this
     * vector.
     *
     * @returns {Vector2}
     */
    normalized: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( 'Cannot normalize a zero-magnitude vector' );
      }
      else {
        return new Vector2( this.x / mag, this.y / mag );
      }
    },

    /**
     * Re-scaled copy of this vector such that it has the desired magnitude. If its initial magnitude is zero, an error
     * is thrown. If the passed-in magnitude is negative, the direction of the resulting vector will be reversed.
     * @public
     *
     * This is the immutable form of the function setMagnitude(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} magnitude
     * @returns {Vector2}
     */
    withMagnitude: function( magnitude ) {
      return this.copy().setMagnitude( magnitude );
    },

    /**
     * Copy of this vector, scaled by the desired scalar value.
     * @public
     *
     * This is the immutable form of the function multiplyScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    timesScalar: function( scalar ) {
      return new Vector2( this.x * scalar, this.y * scalar );
    },

    /**
     * Same as timesScalar.
     * @public
     *
     * This is the immutable form of the function multiply(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    times: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.timesScalar( scalar );
    },

    /**
     * Copy of this vector, multiplied component-wise by the passed-in vector v.
     * @public
     *
     * This is the immutable form of the function componentMultiply(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    componentTimes: function( v ) {
      return new Vector2( this.x * v.x, this.y * v.y );
    },

    /**
     * Addition of this vector and another vector, returning a copy.
     * @public
     *
     * This is the immutable form of the function add(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    plus: function( v ) {
      return new Vector2( this.x + v.x, this.y + v.y );
    },

    /**
     * Addition of this vector and another vector (x,y), returning a copy.
     * @public
     *
     * This is the immutable form of the function addXY(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Vector2}
     */
    plusXY: function( x, y ) {
      return new Vector2( this.x + x, this.y + y );
    },

    /**
     * Addition of this vector with a scalar (adds the scalar to every component), returning a copy.
     * @public
     *
     * This is the immutable form of the function addScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    plusScalar: function( scalar ) {
      return new Vector2( this.x + scalar, this.y + scalar );
    },

    /**
     * Subtraction of this vector by another vector v, returning a copy.
     * @public
     *
     * This is the immutable form of the function subtract(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    minus: function( v ) {
      return new Vector2( this.x - v.x, this.y - v.y );
    },

    /**
     * Subtraction of this vector by another vector (x,y), returning a copy.
     * @public
     *
     * This is the immutable form of the function subtractXY(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Vector2}
     */
    minusXY: function( x, y ) {
      return new Vector2( this.x - x, this.y - y );
    },

    /**
     * Subtraction of this vector by a scalar (subtracts the scalar from every component), returning a copy.
     * @public
     *
     * This is the immutable form of the function subtractScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    minusScalar: function( scalar ) {
      return new Vector2( this.x - scalar, this.y - scalar );
    },

    /**
     * Division of this vector by a scalar (divides every component by the scalar), returning a copy.
     * @public
     *
     * This is the immutable form of the function divideScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    dividedScalar: function( scalar ) {
      return new Vector2( this.x / scalar, this.y / scalar );
    },

    /**
     * Negated copy of this vector (multiplies every component by -1).
     * @public
     *
     * This is the immutable form of the function negate(). This will return a new vector, and will not modify
     * this vector.
     *
     * @returns {Vector2}
     */
    negated: function() {
      return new Vector2( -this.x, -this.y );
    },

    /**
     * Rotated by -pi/2 (perpendicular to this vector), returned as a copy.
     * @public
     *
     * @returns {Vector2}
     */
    perpendicular: function() {
      return new Vector2( this.y, -this.x );
    },

    /**
     * Rotated by an arbitrary angle, in radians. Returned as a copy.
     * @public
     *
     * This is the immutable form of the function rotate(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} angle - In radians
     * @returns {Vector2}
     */
    rotated: function( angle ) {
      var newAngle = this.angle() + angle;
      var mag = this.magnitude();
      return new Vector2( mag * Math.cos( newAngle ), mag * Math.sin( newAngle ) );
    },

    /**
     * A linear interpolation between this vector (ratio=0) and another vector (ratio=1).
     * @public
     *
     * @param {Vector2} vector
     * @param {number} ratio - Not necessarily constrained in [0, 1]
     * @returns {Vector2}
     */
    blend: function( vector, ratio ) {
      return new Vector2( this.x + (vector.x - this.x) * ratio, this.y + (vector.y - this.y) * ratio );
    },

    /**
     * The average (midpoint) between this vector and another vector.
     * @public
     *
     * @param {Vector2} vector
     * @returns {Vector2}
     */
    average: function( vector ) {
      return this.blend( vector, 0.5 );
    },

    /**
     * Debugging string for the vector.
     * @public
     *
     * @returns {string}
     */
    toString: function() {
      return 'Vector2(' + this.x + ', ' + this.y + ')';
    },

    /**
     * Converts this to a 3-dimensional vector, with the z-component equal to 0.
     * @public
     *
     * @returns {Vector3}
     */
    toVector3: function() {
      return new dot.Vector3( this.x, this.y, 0 );
    },

    /*---------------------------------------------------------------------------*
     * Mutables
     * - all mutation should go through setXY / setX / setY
     *---------------------------------------------------------------------------*/

    /**
     * Sets all of the components of this vector, returning this.
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @returns {Vector2}
     */
    setXY: function( x, y ) {
      this.x = x;
      this.y = y;
      return this;
    },

    /**
     * Sets the x-component of this vector, returning this.
     * @public
     *
     * @param {number} x
     * @returns {Vector2}
     */
    setX: function( x ) {
      this.x = x;
      return this;
    },

    /**
     * Sets the y-component of this vector, returning this.
     * @public
     *
     * @param {number} y
     * @returns {Vector2}
     */
    setY: function( y ) {
      this.y = y;
      return this;
    },

    /**
     * Sets this vector to be a copy of another vector.
     * @public
     *
     * This is the mutable form of the function copy(). This will mutate (change) this vector, in addition to returning
     * this vector itself.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    set: function( v ) {
      return this.setXY( v.x, v.y );
    },

    /**
     * Sets the magnitude of this vector. If the passed-in magnitude is negative, this flips the vector and sets its
     * magnitude to abs( magnitude ).
     * @public
     *
     * This is the mutable form of the function withMagnitude(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} magnitude
     * @returns {Vector2}
     */
    setMagnitude: function( magnitude ) {
      var scale = magnitude / this.magnitude();
      return this.multiplyScalar( scale );
    },

    /**
     * Adds another vector to this vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function plus(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    add: function( v ) {
      return this.setXY( this.x + v.x, this.y + v.y );
    },

    /**
     * Adds another vector (x,y) to this vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function plusXY(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Vector2}
     */
    addXY: function( x, y ) {
      return this.setXY( this.x + x, this.y + y );
    },

    /**
     * Adds a scalar to this vector (added to every component), changing this vector.
     * @public
     *
     * This is the mutable form of the function plusScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    addScalar: function( scalar ) {
      return this.setXY( this.x + scalar, this.y + scalar );
    },

    /**
     * Subtracts this vector by another vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function minus(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    subtract: function( v ) {
      return this.setXY( this.x - v.x, this.y - v.y );
    },

    /**
     * Subtracts this vector by another vector (x,y), changing this vector.
     * @public
     *
     * This is the mutable form of the function minusXY(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Vector2}
     */
    subtractXY: function( x, y ) {
      return this.setXY( this.x - x, this.y - y );
    },

    /**
     * Subtracts this vector by a scalar (subtracts each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function minusScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    subtractScalar: function( scalar ) {
      return this.setXY( this.x - scalar, this.y - scalar );
    },

    /**
     * Multiplies this vector by a scalar (multiplies each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function timesScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    multiplyScalar: function( scalar ) {
      return this.setXY( this.x * scalar, this.y * scalar );
    },

    /**
     * Multiplies this vector by a scalar (multiplies each component by the scalar), changing this vector.
     * Same as multiplyScalar.
     * @public
     *
     * This is the mutable form of the function times(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    multiply: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.multiplyScalar( scalar );
    },

    /**
     * Multiplies this vector by another vector component-wise, changing this vector.
     * @public
     *
     * This is the mutable form of the function componentTimes(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    componentMultiply: function( v ) {
      return this.setXY( this.x * v.x, this.y * v.y );
    },

    /**
     * Divides this vector by a scalar (divides each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function dividedScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector2}
     */
    divideScalar: function( scalar ) {
      return this.setXY( this.x / scalar, this.y / scalar );
    },

    /**
     * Negates this vector (multiplies each component by -1), changing this vector.
     * @public
     *
     * This is the mutable form of the function negated(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @returns {Vector2}
     */
    negate: function() {
      return this.setXY( -this.x, -this.y );
    },

    /**
     * Normalizes this vector (rescales to where the magnitude is 1), changing this vector.
     * @public
     *
     * This is the mutable form of the function normalized(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @returns {Vector2}
     */
    normalize: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( 'Cannot normalize a zero-magnitude vector' );
      }
      else {
        return this.divideScalar( mag );
      }
    },

    /**
     * Rotates this vector by the angle (in radians), changing this vector.
     * @public
     *
     * This is the mutable form of the function rotated(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} angle - In radians
     * @returns {Vector2}
     */
    rotate: function( angle ) {
      var newAngle = this.angle() + angle;
      var mag = this.magnitude();
      return this.setXY( mag * Math.cos( newAngle ), mag * Math.sin( newAngle ) );
    },

    /**
     * Sets this vector's value to be the x,y values matching the given magnitude and angle (in radians), changing
     * this vector, and returning itself.
     * @public
     *
     * @param {number} magnitude
     * @param {number} angle - In radians
     * @returns {Vector2}
     */
    setPolar: function( magnitude, angle ) {
      return this.setXY( magnitude * Math.cos( angle ), magnitude * Math.sin( angle ) );
    },

    /**
     * Returns a duck-typed object meant for use with tandem/phet-io serialization.
     *
     * @returns {Object}
     */
    toStateObject: function() {
      return { x: this.x, y: this.y };
    }
  }, { // static functions on Vector2 itself
    /**
     * Returns a Vector2 with the specified magnitude $r$ and angle $\theta$ (in radians), with the formula:
     * $$ f( r, \theta ) = \begin{bmatrix} r\cos\theta \\ r\sin\theta \end{bmatrix} $$
     * @public
     *
     * @param {number} magnitude
     * @param {number} angle
     * @returns {Vector2}
     */
    createPolar: function( magnitude, angle ) {
      return new Vector2().setPolar( magnitude, angle );
    },

    /**
     * Constructs a Vector2 from a duck-typed { x: {number}, y: {number} } object, meant for use with
     * tandem/phet-io deserialization.
     * @public
     *
     * @param {Object} stateObject - Like { x: {number}, y: {number} }
     * @returns {Vector2}
     */
    fromStateObject: function( stateObject ) {
      return new Vector2( stateObject.x, stateObject.y );
    }
  } );

  // Sets up pooling on Vector2
  Poolable.mixin( Vector2, {
    defaultFactory: function() { return new Vector2(); },
    constructorDuplicateFactory: function( pool ) {
      return function( x, y ) {
        if ( pool.length ) {
          return pool.pop().setXY( x, y );
        }
        else {
          return new Vector2( x, y );
        }
      };
    }
  } );

  /*---------------------------------------------------------------------------*
   * Immutable Vector form
   *---------------------------------------------------------------------------*/

  // @private
  Vector2.Immutable = function ImmutableVector2( x, y ) {
    Vector2.call( this, x, y );
  };
  var Immutable = Vector2.Immutable;

  inherit( Vector2, Immutable );

  // throw errors whenever a mutable method is called on our immutable vector
  Immutable.mutableOverrideHelper = function( mutableFunctionName ) {
    Immutable.prototype[ mutableFunctionName ] = function() {
      throw new Error( 'Cannot call mutable method \'' + mutableFunctionName + '\' on immutable Vector2' );
    };
  };

  // TODO: better way to handle this list?
  Immutable.mutableOverrideHelper( 'setXY' );
  Immutable.mutableOverrideHelper( 'setX' );
  Immutable.mutableOverrideHelper( 'setY' );

  /**
   * Immutable zero vector: $\begin{bmatrix} 0\\0 \end{bmatrix}$
   * @public
   *
   * @constant {Vector2} ZERO
   */
  Vector2.ZERO = assert ? new Immutable( 0, 0 ) : new Vector2( 0, 0 );

  /**
   * Immutable vector: $\begin{bmatrix} 1\\0 \end{bmatrix}$
   * @public
   *
   * @constant {Vector2} X_UNIT
   */
  Vector2.X_UNIT = assert ? new Immutable( 1, 0 ) : new Vector2( 1, 0 );

  /**
   * Immutable vector: $\begin{bmatrix} 0\\1 \end{bmatrix}$
   * @public
   *
   * @constant {Vector2} Y_UNIT
   */
  Vector2.Y_UNIT = assert ? new Immutable( 0, 1 ) : new Vector2( 0, 1 );

  return Vector2;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * A 2D rectangle-shaped bounded area (bounding box).
 *
 * There are a number of convenience functions to get locations and points on the Bounds. Currently we do not
 * store these with the Bounds2 instance, since we want to lower the memory footprint.
 *
 * minX, minY, maxX, and maxY are actually stored. We don't do x,y,width,height because this can't properly express
 * semi-infinite bounds (like a half-plane), or easily handle what Bounds2.NOTHING and Bounds2.EVERYTHING do with
 * the constructive solid areas.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Bounds2',['require','DOT/dot','DOT/Vector2','PHET_CORE/inherit','PHET_CORE/Poolable'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );
  var Vector2 = require( 'DOT/Vector2' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  // Temporary instances to be used in the transform method.
  var scratchVector2 = new dot.Vector2();

  /**
   * Creates a 2-dimensional bounds (bounding box).
   * @constructor
   * @public
   *
   * @param {number} minX - The intial minimum X coordinate of the bounds.
   * @param {number} minY - The intial minimum Y coordinate of the bounds.
   * @param {number} maxX - The intial maximum X coordinate of the bounds.
   * @param {number} maxY - The intial maximum Y coordinate of the bounds.
   */
  function Bounds2( minX, minY, maxX, maxY ) {
    assert && assert( maxY !== undefined, 'Bounds2 requires 4 parameters' );

    // @public {number} - The minimum X coordinate of the bounds.
    this.minX = minX;

    // @public {number} - The minimum Y coordinate of the bounds.
    this.minY = minY;

    // @public {number} - The maximum X coordinate of the bounds.
    this.maxX = maxX;

    // @public {number} - The maximum Y coordinate of the bounds.
    this.maxY = maxY;

    phetAllocation && phetAllocation( 'Bounds2' );
  }

  dot.register( 'Bounds2', Bounds2 );

  inherit( Object, Bounds2, {
    // @public (read-only) - Helps to identify the dimension of the bounds
    isBounds: true,
    dimension: 2,

    /*---------------------------------------------------------------------------*
     * Properties
     *---------------------------------------------------------------------------*/

    /**
     * The width of the bounds, defined as maxX - minX.
     * @public
     *
     * @returns {number}
     */
    getWidth: function() { return this.maxX - this.minX; },
    get width() { return this.getWidth(); },

    /**
     * The height of the bounds, defined as maxY - minY.
     * @public
     *
     * @returns {number}
     */
    getHeight: function() { return this.maxY - this.minY; },
    get height() { return this.getHeight(); },

    /*
     * Convenience locations
     * upper is in terms of the visual layout in Scenery and other programs, so the minY is the "upper", and minY is the "lower"
     *
     *             minX (x)     centerX        maxX
     *          ---------------------------------------
     * minY (y) | leftTop     centerTop     rightTop
     * centerY  | leftCenter  center        rightCenter
     * maxY     | leftBottom  centerBottom  rightBottom
     */

    /**
     * Alias for minX, when thinking of the bounds as an (x,y,width,height) rectangle.
     * @public
     *
     * @returns {number}
     */
    getX: function() { return this.minX; },
    get x() { return this.getX(); },

    /**
     * Alias for minY, when thinking of the bounds as an (x,y,width,height) rectangle.
     * @public
     *
     * @returns {number}
     */
    getY: function() { return this.minY; },
    get y() { return this.getY(); },

    /**
     * Alias for minX, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMinX: function() { return this.minX; },

    /**
     * Alias for minY, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMinY: function() { return this.minY; },

    /**
     * Alias for maxX, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMaxX: function() { return this.maxX; },

    /**
     * Alias for maxY, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMaxY: function() { return this.maxY; },

    /**
     * Alias for minX, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getLeft: function() { return this.minX; },
    get left() { return this.minX; },

    /**
     * Alias for minY, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getTop: function() { return this.minY; },
    get top() { return this.minY; },

    /**
     * Alias for maxX, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getRight: function() { return this.maxX; },
    get right() { return this.maxX; },

    /**
     * Alias for maxY, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getBottom: function() { return this.maxY; },
    get bottom() { return this.maxY; },

    /**
     * The horizontal (X-coordinate) center of the bounds, averaging the minX and maxX.
     * @public
     *
     * @returns {number}
     */
    getCenterX: function() { return ( this.maxX + this.minX ) / 2; },
    get centerX() { return this.getCenterX(); },

    /**
     * The vertical (Y-coordinate) center of the bounds, averaging the minY and maxY.
     * @public
     *
     * @returns {number}
     */
    getCenterY: function() { return ( this.maxY + this.minY ) / 2; },
    get centerY() { return this.getCenterY(); },

    /**
     * The point (minX, minY), in the UI-coordinate upper-left.
     * @public
     *
     * @returns {Vector2}
     */
    getLeftTop: function() { return new dot.Vector2( this.minX, this.minY ); },
    get leftTop() { return this.getLeftTop(); },

    /**
     * The point (centerX, minY), in the UI-coordinate upper-center.
     * @public
     *
     * @returns {Vector2}
     */
    getCenterTop: function() { return new dot.Vector2( this.getCenterX(), this.minY ); },
    get centerTop() { return this.getCenterTop(); },

    /**
     * The point (right, minY), in the UI-coordinate upper-right.
     * @public
     *
     * @returns {Vector2}
     */
    getRightTop: function() { return new dot.Vector2( this.maxX, this.minY ); },
    get rightTop() { return this.getRightTop(); },

    /**
     * The point (left, centerY), in the UI-coordinate center-left.
     * @public
     *
     * @returns {Vector2}
     */
    getLeftCenter: function() { return new dot.Vector2( this.minX, this.getCenterY() ); },
    get leftCenter() { return this.getLeftCenter(); },

    /**
     * The point (centerX, centerY), in the center of the bounds.
     * @public
     *
     * @returns {Vector2}
     */
    getCenter: function() { return new dot.Vector2( this.getCenterX(), this.getCenterY() ); },
    get center() { return this.getCenter(); },

    /**
     * The point (maxX, centerY), in the UI-coordinate center-right
     * @public
     *
     * @returns {Vector2}
     */
    getRightCenter: function() { return new dot.Vector2( this.maxX, this.getCenterY() ); },
    get rightCenter() { return this.getRightCenter(); },

    /**
     * The point (minX, maxY), in the UI-coordinate lower-left
     * @public
     *
     * @returns {Vector2}
     */
    getLeftBottom: function() { return new dot.Vector2( this.minX, this.maxY ); },
    get leftBottom() { return this.getLeftBottom(); },

    /**
     * The point (centerX, maxY), in the UI-coordinate lower-center
     * @public
     *
     * @returns {Vector2}
     */
    getCenterBottom: function() { return new dot.Vector2( this.getCenterX(), this.maxY ); },
    get centerBottom() { return this.getCenterBottom(); },

    /**
     * The point (maxX, maxY), in the UI-coordinate lower-right
     * @public
     *
     * @returns {Vector2}
     */
    getRightBottom: function() { return new dot.Vector2( this.maxX, this.maxY ); },
    get rightBottom() { return this.getRightBottom(); },

    /**
     * Whether we have negative width or height. Bounds2.NOTHING is a prime example of an empty Bounds2.
     * Bounds with width = height = 0 are considered not empty, since they include the single (0,0) point.
     * @public
     *
     * @returns {boolean}
     */
    isEmpty: function() { return this.getWidth() < 0 || this.getHeight() < 0; },

    /**
     * Whether our minimums and maximums are all finite numbers. This will exclude Bounds2.NOTHING and Bounds2.EVERYTHING.
     * @public
     *
     * @returns {boolean}
     */
    isFinite: function() {
      return isFinite( this.minX ) && isFinite( this.minY ) && isFinite( this.maxX ) && isFinite( this.maxY );
    },

    /**
     * Whether this bounds has a non-zero area (non-zero positive width and height).
     * @public
     *
     * @returns {boolean}
     */
    hasNonzeroArea: function() {
      return this.getWidth() > 0 && this.getHeight() > 0;
    },

    /**
     * Whether this bounds has a finite and non-negative width and height.
     * @public
     *
     * @returns {boolean}
     */
    isValid: function() {
      return !this.isEmpty() && this.isFinite();
    },

    /**
     * If the location is inside the bounds, the location will be returned. Otherwise, this will return a new location
     * on the edge of the bounds that is the closest to the provided location.
     * @public
     *
     * @param {Vector2} location
     * @returns {Vector2}
     */
    closestPointTo: function( location ) {
      if ( this.containsCoordinates( location.x, location.y ) ) {
        return location;
      }
      else {
        var xConstrained = Math.max( Math.min( location.x, this.maxX ), this.x );
        var yConstrained = Math.max( Math.min( location.y, this.maxY ), this.y );
        return new Vector2( xConstrained, yConstrained );
      }
    },

    /**
     * Whether the coordinates are contained inside the bounding box, or are on the boundary.
     * @public
     *
     * @param {number} x - X coordinate of the point to check
     * @param {number} y - Y coordinate of the point to check
     * @returns {boolean}
     */
    containsCoordinates: function( x, y ) {
      return this.minX <= x && x <= this.maxX && this.minY <= y && y <= this.maxY;
    },

    /**
     * Whether the point is contained inside the bounding box, or is on the boundary.
     * @public
     *
     * @param {Vector2} point
     * @returns {boolean}
     */
    containsPoint: function( point ) {
      return this.containsCoordinates( point.x, point.y );
    },

    /**
     * Whether this bounding box completely contains the bounding box passed as a parameter. The boundary of a box is
     * considered to be "contained".
     * @public
     *
     * @param {Bounds2} bounds
     * @returns {boolean}
     */
    containsBounds: function( bounds ) {
      return this.minX <= bounds.minX && this.maxX >= bounds.maxX && this.minY <= bounds.minY && this.maxY >= bounds.maxY;
    },

    /**
     * Whether this and another bounding box have any points of intersection (including touching boundaries).
     * @public
     *
     * @param {Bounds2} bounds
     * @returns {boolean}
     */
    intersectsBounds: function( bounds ) {
      var minX = Math.max( this.minX, bounds.minX );
      var minY = Math.max( this.minY, bounds.minY );
      var maxX = Math.min( this.maxX, bounds.maxX );
      var maxY = Math.min( this.maxY, bounds.maxY );
      return ( maxX - minX ) >= 0 && ( maxY - minY >= 0 );
    },

    /**
     * The squared distance from the input point to the point closest to it inside the bounding box.
     * @public
     *
     * @param {Vector2} point
     * @returns {number}
     */
    minimumDistanceToPointSquared: function( point ) {
      var closeX = point.x < this.minX ? this.minX : ( point.x > this.maxX ? this.maxX : null );
      var closeY = point.y < this.minY ? this.minY : ( point.y > this.maxY ? this.maxY : null );
      var d;
      if ( closeX === null && closeY === null ) {
        // inside, or on the boundary
        return 0;
      }
      else if ( closeX === null ) {
        // vertically directly above/below
        d = closeY - point.y;
        return d * d;
      }
      else if ( closeY === null ) {
        // horizontally directly to the left/right
        d = closeX - point.x;
        return d * d;
      }
      else {
        // corner case
        var dx = closeX - point.x;
        var dy = closeY - point.y;
        return dx * dx + dy * dy;
      }
    },

    /**
     * The squared distance from the input point to the point furthest from it inside the bounding box.
     * @public
     *
     * @param {Vector2} point
     * @returns {number}
     */
    maximumDistanceToPointSquared: function( point ) {
      var x = point.x > this.getCenterX() ? this.minX : this.maxX;
      var y = point.y > this.getCenterY() ? this.minY : this.maxY;
      x -= point.x;
      y -= point.y;
      return x * x + y * y;
    },

    /**
     * Debugging string for the bounds.
     * @public
     *
     * @returns {string}
     */
    toString: function() {
      return '[x:(' + this.minX + ',' + this.maxX + '),y:(' + this.minY + ',' + this.maxY + ')]';
    },

    /**
     * Exact equality comparison between this bounds and another bounds.
     * @public
     *
     * @param {Bounds2} other
     * @returns {boolean} - Whether the two bounds are equal
     */
    equals: function( other ) {
      return this.minX === other.minX && this.minY === other.minY && this.maxX === other.maxX && this.maxY === other.maxY;
    },

    /**
     * Approximate equality comparison between this bounds and another bounds.
     * @public
     *
     * @param {Bounds2} other
     * @param {number} epsilon
     * @returns {boolean} - Whether difference between the two bounds has no min/max with an absolute value greater
     *                      than epsilon.
     */
    equalsEpsilon: function( other, epsilon ) {
      epsilon = epsilon !== undefined ? epsilon : 0;
      var thisFinite = this.isFinite();
      var otherFinite = other.isFinite();
      if ( thisFinite && otherFinite ) {
        // both are finite, so we can use Math.abs() - it would fail with non-finite values like Infinity
        return Math.abs( this.minX - other.minX ) < epsilon &&
               Math.abs( this.minY - other.minY ) < epsilon &&
               Math.abs( this.maxX - other.maxX ) < epsilon &&
               Math.abs( this.maxY - other.maxY ) < epsilon;
      }
      else if ( thisFinite !== otherFinite ) {
        return false; // one is finite, the other is not. definitely not equal
      }
      else if ( this === other ) {
        return true; // exact same instance, must be equal
      }
      else {
        // epsilon only applies on finite dimensions. due to JS's handling of isFinite(), it's faster to check the sum of both
        return ( isFinite( this.minX + other.minX ) ? ( Math.abs( this.minX - other.minX ) < epsilon ) : ( this.minX === other.minX ) ) &&
               ( isFinite( this.minY + other.minY ) ? ( Math.abs( this.minY - other.minY ) < epsilon ) : ( this.minY === other.minY ) ) &&
               ( isFinite( this.maxX + other.maxX ) ? ( Math.abs( this.maxX - other.maxX ) < epsilon ) : ( this.maxX === other.maxX ) ) &&
               ( isFinite( this.maxY + other.maxY ) ? ( Math.abs( this.maxY - other.maxY ) < epsilon ) : ( this.maxY === other.maxY ) );
      }
    },

    /*---------------------------------------------------------------------------*
     * Immutable operations
     *---------------------------------------------------------------------------*/

    /**
     * Creates a copy of this bounds, or if a bounds is passed in, set that bounds's values to ours.
     * @public
     *
     * This is the immutable form of the function set(), if a bounds is provided. This will return a new bounds, and
     * will not modify this bounds.
     *
     * @param {Bounds2} [bounds] - If not provided, creates a new Bounds2 with filled in values. Otherwise, fills in the
     *                             values of the provided bounds so that it equals this bounds.
     * @returns {Bounds2}
     */
    copy: function( bounds ) {
      if ( bounds ) {
        return bounds.set( this );
      }
      else {
        return new Bounds2( this.minX, this.minY, this.maxX, this.maxY );
      }
    },

    /**
     * The smallest bounds that contains both this bounds and the input bounds, returned as a copy.
     * @public
     *
     * This is the immutable form of the function includeBounds(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {Bounds2} bounds
     * @returns {Bounds2}
     */
    union: function( bounds ) {
      return new Bounds2(
        Math.min( this.minX, bounds.minX ),
        Math.min( this.minY, bounds.minY ),
        Math.max( this.maxX, bounds.maxX ),
        Math.max( this.maxY, bounds.maxY )
      );
    },

    /**
     * The smallest bounds that is contained by both this bounds and the input bounds, returned as a copy.
     * @public
     *
     * This is the immutable form of the function constrainBounds(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {Bounds2} bounds
     * @returns {Bounds2}
     */
    intersection: function( bounds ) {
      return new Bounds2(
        Math.max( this.minX, bounds.minX ),
        Math.max( this.minY, bounds.minY ),
        Math.min( this.maxX, bounds.maxX ),
        Math.min( this.maxY, bounds.maxY )
      );
    },
    // TODO: difference should be well-defined, but more logic is needed to compute

    /**
     * The smallest bounds that contains this bounds and the point (x,y), returned as a copy.
     * @public
     *
     * This is the immutable form of the function addCoordinates(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Bounds2}
     */
    withCoordinates: function( x, y ) {
      return new Bounds2(
        Math.min( this.minX, x ),
        Math.min( this.minY, y ),
        Math.max( this.maxX, x ),
        Math.max( this.maxY, y )
      );
    },

    /**
     * The smallest bounds that contains this bounds and the input point, returned as a copy.
     * @public
     *
     * This is the immutable form of the function addPoint(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {Vector2} point
     * @returns {Bounds2}
     */
    withPoint: function( point ) {
      return this.withCoordinates( point.x, point.y );
    },

    /**
     * A copy of this bounds, with minX replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMinX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} minX
     * @returns {Bounds2}
     */
    withMinX: function( minX ) {
      return new Bounds2( minX, this.minY, this.maxX, this.maxY );
    },

    /**
     * A copy of this bounds, with minY replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMinY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} minY
     * @returns {Bounds2}
     */
    withMinY: function( minY ) {
      return new Bounds2( this.minX, minY, this.maxX, this.maxY );
    },

    /**
     * A copy of this bounds, with maxX replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMaxX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} maxX
     * @returns {Bounds2}
     */
    withMaxX: function( maxX ) {
      return new Bounds2( this.minX, this.minY, maxX, this.maxY );
    },

    /**
     * A copy of this bounds, with maxY replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMaxY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} maxY
     * @returns {Bounds2}
     */
    withMaxY: function( maxY ) {
      return new Bounds2( this.minX, this.minY, this.maxX, maxY );
    },

    /**
     * A copy of this bounds, with the minimum values rounded down to the nearest integer, and the maximum values
     * rounded up to the nearest integer. This causes the bounds to expand as necessary so that its boundaries
     * are integer-aligned.
     * @public
     *
     * This is the immutable form of the function roundOut(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @returns {Bounds2}
     */
    roundedOut: function() {
      return new Bounds2(
        Math.floor( this.minX ),
        Math.floor( this.minY ),
        Math.ceil( this.maxX ),
        Math.ceil( this.maxY )
      );
    },

    /**
     * A copy of this bounds, with the minimum values rounded up to the nearest integer, and the maximum values
     * rounded down to the nearest integer. This causes the bounds to contract as necessary so that its boundaries
     * are integer-aligned.
     * @public
     *
     * This is the immutable form of the function roundIn(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @returns {Bounds2}
     */
    roundedIn: function() {
      return new Bounds2(
        Math.ceil( this.minX ),
        Math.ceil( this.minY ),
        Math.floor( this.maxX ),
        Math.floor( this.maxY )
      );
    },

    /**
     * A bounding box (still axis-aligned) that contains the transformed shape of this bounds, applying the matrix as
     * an affine transformation.
     * @pubic
     *
     * NOTE: bounds.transformed( matrix ).transformed( inverse ) may be larger than the original box, if it includes
     * a rotation that isn't a multiple of $\pi/2$. This is because the returned bounds may expand in area to cover
     * ALL of the corners of the transformed bounding box.
     *
     * This is the immutable form of the function transform(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {Matrix3} matrix
     * @returns {Bounds2}
     */
    transformed: function( matrix ) {
      return this.copy().transform( matrix );
    },

    /**
     * A bounding box that is expanded on all sides by the specified amount.)
     * @public
     *
     * This is the immutable form of the function dilate(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} d
     * @returns {Bounds2}
     */
    dilated: function( d ) {
      return new Bounds2( this.minX - d, this.minY - d, this.maxX + d, this.maxY + d );
    },

    /**
     * A bounding box that is expanded horizontally (on the left and right) by the specified amount.
     * @public
     *
     * This is the immutable form of the function dilateX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @returns {Bounds2}
     */
    dilatedX: function( x ) {
      return new Bounds2( this.minX - x, this.minY, this.maxX + x, this.maxY );
    },

    /**
     * A bounding box that is expanded vertically (on the top and bottom) by the specified amount.
     * @public
     *
     * This is the immutable form of the function dilateY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} y
     * @returns {Bounds2}
     */
    dilatedY: function( y ) {
      return new Bounds2( this.minX, this.minY - y, this.maxX, this.maxY + y );
    },

    /**
     * A bounding box that is expanded on all sides, with different amounts of expansion horizontally and vertically.
     * Will be identical to the bounds returned by calling bounds.dilatedX( x ).dilatedY( y ).
     * @public
     *
     * This is the immutable form of the function dilateXY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x - Amount to dilate horizontally (for each side)
     * @param {number} y - Amount to dilate vertically (for each side)
     * @returns {Bounds2}
     */
    dilatedXY: function( x, y ) {
      return new Bounds2( this.minX - x, this.minY - y, this.maxX + x, this.maxY + y );
    },

    /**
     * A bounding box that is contracted on all sides by the specified amount.
     * @public
     *
     * This is the immutable form of the function erode(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} amount
     * @returns {Bounds2}
     */
    eroded: function( d ) { return this.dilated( -d ); },

    /**
     * A bounding box that is contracted horizontally (on the left and right) by the specified amount.
     * @public
     *
     * This is the immutable form of the function erodeX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @returns {Bounds2}
     */
    erodedX: function( x ) { return this.dilatedX( -x ); },

    /**
     * A bounding box that is contracted vertically (on the top and bottom) by the specified amount.
     * @public
     *
     * This is the immutable form of the function erodeY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} y
     * @returns {Bounds2}
     */
    erodedY: function( y ) { return this.dilatedY( -y ); },

    /**
     * A bounding box that is contracted on all sides, with different amounts of contraction horizontally and vertically.
     * @public
     *
     * This is the immutable form of the function erodeXY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x - Amount to erode horizontally (for each side)
     * @param {number} y - Amount to erode vertically (for each side)
     * @returns {Bounds2}
     */
    erodedXY: function( x, y ) { return this.dilatedXY( -x, -y ); },

    /**
     * A bounding box that is expanded by a specific amount on all sides (or if some offsets are negative, will contract
     * those sides).
     * @public
     *
     * This is the immutable form of the function offset(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} left - Amount to expand to the left (subtracts from minX)
     * @param {number} top - Amount to expand to the top (subtracts from minY)
     * @param {number} right - Amount to expand to the right (adds to maxX)
     * @param {number} bottom - Amount to expand to the bottom (adds to maxY)
     * @returns {Bounds2}
     */
    withOffsets: function( left, top, right, bottom ) {
      return new Bounds2( this.minX - left, this.minY - top, this.maxX + right, this.maxY + bottom );
    },

    /**
     * Our bounds, translated horizontally by x, returned as a copy.
     * @public
     *
     * This is the immutable form of the function shiftX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @returns {Bounds2}
     */
    shiftedX: function( x ) {
      return new Bounds2( this.minX + x, this.minY, this.maxX + x, this.maxY );
    },

    /**
     * Our bounds, translated vertically by y, returned as a copy.
     * @public
     *
     * This is the immutable form of the function shiftY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} y
     * @returns {Bounds2}
     */
    shiftedY: function( y ) {
      return new Bounds2( this.minX, this.minY + y, this.maxX, this.maxY + y );
    },

    /**
     * Our bounds, translated by (x,y), returned as a copy.
     * @public
     *
     * This is the immutable form of the function shift(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Bounds2}
     */
    shifted: function( x, y ) {
      return new Bounds2( this.minX + x, this.minY + y, this.maxX + x, this.maxY + y );
    },

    /*---------------------------------------------------------------------------*
     * Mutable operations
     *
     * All mutable operations should call one of the following:
     *   setMinMax, setMinX, setMinY, setMaxX, setMaxY
     *---------------------------------------------------------------------------*/

    /**
     * Sets each value for this bounds, and returns itself.
     * @public
     *
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @returns {Bounds2}
     */
    setMinMax: function( minX, minY, maxX, maxY ) {
      this.minX = minX;
      this.minY = minY;
      this.maxX = maxX;
      this.maxY = maxY;
      return this;
    },

    /**
     * Sets the value of minX.
     * @public
     *
     * This is the mutable form of the function withMinX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} minX
     * @returns {Bounds2}
     */
    setMinX: function( minX ) {
      this.minX = minX;
      return this;
    },

    /**
     * Sets the value of minY.
     * @public
     *
     * This is the mutable form of the function withMinY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} minY
     * @returns {Bounds2}
     */
    setMinY: function( minY ) {
      this.minY = minY;
      return this;
    },

    /**
     * Sets the value of maxX.
     * @public
     *
     * This is the mutable form of the function withMaxX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} maxX
     * @returns {Bounds2}
     */
    setMaxX: function( maxX ) {
      this.maxX = maxX;
      return this;
    },

    /**
     * Sets the value of maxY.
     * @public
     *
     * This is the mutable form of the function withMaxY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} maxY
     * @returns {Bounds2}
     */
    setMaxY: function( maxY ) {
      this.maxY = maxY;
      return this;
    },

    /**
     * Sets the values of this bounds to be equal to the input bounds.
     * @public
     *
     * This is the mutable form of the function copy(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Bounds2} bounds
     * @returns {Bounds2}
     */
    set: function( bounds ) {
      return this.setMinMax( bounds.minX, bounds.minY, bounds.maxX, bounds.maxY );
    },

    /**
     * Modifies this bounds so that it contains both its original bounds and the input bounds.
     * @public
     *
     * This is the mutable form of the function union(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Bounds2} bounds
     * @returns {Bounds2}
     */
    includeBounds: function( bounds ) {
      return this.setMinMax(
        Math.min( this.minX, bounds.minX ),
        Math.min( this.minY, bounds.minY ),
        Math.max( this.maxX, bounds.maxX ),
        Math.max( this.maxY, bounds.maxY )
      );
    },

    /**
     * Modifies this bounds so that it is the largest bounds contained both in its original bounds and in the input bounds.
     * @public
     *
     * This is the mutable form of the function intersection(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Bounds2} bounds
     * @returns {Bounds2}
     */
    constrainBounds: function( bounds ) {
      return this.setMinMax(
        Math.max( this.minX, bounds.minX ),
        Math.max( this.minY, bounds.minY ),
        Math.min( this.maxX, bounds.maxX ),
        Math.min( this.maxY, bounds.maxY )
      );
    },

    /**
     * Modifies this bounds so that it contains both its original bounds and the input point (x,y).
     * @public
     *
     * This is the mutable form of the function withCoordinates(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Bounds2}
     */
    addCoordinates: function( x, y ) {
      return this.setMinMax(
        Math.min( this.minX, x ),
        Math.min( this.minY, y ),
        Math.max( this.maxX, x ),
        Math.max( this.maxY, y )
      );
    },

    /**
     * Modifies this bounds so that it contains both its original bounds and the input point.
     * @public
     *
     * This is the mutable form of the function withPoint(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Vector2} point
     * @returns {Bounds2}
     */
    addPoint: function( point ) {
      return this.addCoordinates( point.x, point.y );
    },

    /**
     * Modifies this bounds so that its boundaries are integer-aligned, rounding the minimum boundaries down and the
     * maximum boundaries up (expanding as necessary).
     * @public
     *
     * This is the mutable form of the function roundedOut(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @returns {Bounds2}
     */
    roundOut: function() {
      return this.setMinMax(
        Math.floor( this.minX ),
        Math.floor( this.minY ),
        Math.ceil( this.maxX ),
        Math.ceil( this.maxY )
      );
    },

    /**
     * Modifies this bounds so that its boundaries are integer-aligned, rounding the minimum boundaries up and the
     * maximum boundaries down (contracting as necessary).
     * @public
     *
     * This is the mutable form of the function roundedIn(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @returns {Bounds2}
     */
    roundIn: function() {
      return this.setMinMax(
        Math.ceil( this.minX ),
        Math.ceil( this.minY ),
        Math.floor( this.maxX ),
        Math.floor( this.maxY )
      );
    },

    /**
     * Modifies this bounds so that it would fully contain a transformed version if its previous value, applying the
     * matrix as an affine transformation.
     * @pubic
     *
     * NOTE: bounds.transform( matrix ).transform( inverse ) may be larger than the original box, if it includes
     * a rotation that isn't a multiple of $\pi/2$. This is because the bounds may expand in area to cover
     * ALL of the corners of the transformed bounding box.
     *
     * This is the mutable form of the function transformed(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Matrix3} matrix
     * @returns {Bounds2}
     */
    transform: function( matrix ) {
      // if we contain no area, no change is needed
      if ( this.isEmpty() ) {
        return this;
      }

      // optimization to bail for identity matrices
      if ( matrix.isIdentity() ) {
        return this;
      }

      var minX = this.minX;
      var minY = this.minY;
      var maxX = this.maxX;
      var maxY = this.maxY;
      this.set( dot.Bounds2.NOTHING );

      // using mutable vector so we don't create excessive instances of Vector2 during this
      // make sure all 4 corners are inside this transformed bounding box

      this.addPoint( matrix.multiplyVector2( scratchVector2.setXY( minX, minY ) ) );
      this.addPoint( matrix.multiplyVector2( scratchVector2.setXY( minX, maxY ) ) );
      this.addPoint( matrix.multiplyVector2( scratchVector2.setXY( maxX, minY ) ) );
      this.addPoint( matrix.multiplyVector2( scratchVector2.setXY( maxX, maxY ) ) );
      return this;
    },

    /**
     * Expands this bounds on all sides by the specified amount.
     * @public
     *
     * This is the mutable form of the function dilated(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} d
     * @returns {Bounds2}
     */
    dilate: function( d ) {
      return this.setMinMax( this.minX - d, this.minY - d, this.maxX + d, this.maxY + d );
    },

    /**
     * Expands this bounds horizontally (left and right) by the specified amount.
     * @public
     *
     * This is the mutable form of the function dilatedX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @returns {Bounds2}
     */
    dilateX: function( x ) {
      return this.setMinMax( this.minX - x, this.minY, this.maxX + x, this.maxY );
    },

    /**
     * Expands this bounds vertically (top and bottom) by the specified amount.
     * @public
     *
     * This is the mutable form of the function dilatedY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} y
     * @returns {Bounds2}
     */
    dilateY: function( y ) {
      return this.setMinMax( this.minX, this.minY - y, this.maxX, this.maxY + y );
    },

    /**
     * Expands this bounds independently in the horizontal and vertical directions. Will be equal to calling
     * bounds.dilateX( x ).dilateY( y ).
     * @public
     *
     * This is the mutable form of the function dilatedXY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Bounds2}
     */
    dilateXY: function( x, y ) {
      return this.setMinMax( this.minX - x, this.minY - y, this.maxX + x, this.maxY + y );
    },

    /**
     * Contracts this bounds on all sides by the specified amount.
     * @public
     *
     * This is the mutable form of the function eroded(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} d
     * @returns {Bounds2}
     */
    erode: function( d ) { return this.dilate( -d ); },

    /**
     * Contracts this bounds horizontally (left and right) by the specified amount.
     * @public
     *
     * This is the mutable form of the function erodedX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @returns {Bounds2}
     */
    erodeX: function( x ) { return this.dilateX( -x ); },

    /**
     * Contracts this bounds vertically (top and bottom) by the specified amount.
     * @public
     *
     * This is the mutable form of the function erodedY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} y
     * @returns {Bounds2}
     */
    erodeY: function( y ) { return this.dilateY( -y ); },

    /**
     * Contracts this bounds independently in the horizontal and vertical directions. Will be equal to calling
     * bounds.erodeX( x ).erodeY( y ).
     * @public
     *
     * This is the mutable form of the function erodedXY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Bounds2}
     */
    erodeXY: function( x, y ) { return this.dilateXY( -x, -y ); },

    /**
     * Expands this bounds independently for each side (or if some offsets are negative, will contract those sides).
     * @public
     *
     * This is the mutable form of the function withOffsets(). This will mutate (change) this bounds, in addition to
     * returning this bounds itself.
     *
     * @param {number} left - Amount to expand to the left (subtracts from minX)
     * @param {number} top - Amount to expand to the top (subtracts from minY)
     * @param {number} right - Amount to expand to the right (adds to maxX)
     * @param {number} bottom - Amount to expand to the bottom (adds to maxY)
     * @returns {Bounds2}
     */
    offset: function( left, top, right, bottom ) {
      return new Bounds2( this.minX - left, this.minY - top, this.maxX + right, this.maxY + bottom );
    },

    /**
     * Translates our bounds horizontally by x.
     * @public
     *
     * This is the mutable form of the function shiftedX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @returns {Bounds2}
     */
    shiftX: function( x ) {
      return this.setMinMax( this.minX + x, this.minY, this.maxX + x, this.maxY );
    },

    /**
     * Translates our bounds vertically by y.
     * @public
     *
     * This is the mutable form of the function shiftedY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} y
     * @returns {Bounds2}
     */
    shiftY: function( y ) {
      return this.setMinMax( this.minX, this.minY + y, this.maxX, this.maxY + y );
    },

    /**
     * Translates our bounds by (x,y).
     * @public
     *
     * This is the mutable form of the function shifted(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Bounds2}
     */
    shift: function( x, y ) {
      return this.setMinMax( this.minX + x, this.minY + y, this.maxX + x, this.maxY + y );
    },

    /**
     * Find a point in the bounds closest to the specified point.
     * @public
     *
     * @param {number} x - X coordinate of the point to test.
     * @param {number} y - Y coordinate of the point to test.
     * @param {Vector2} [result] - Vector2 that can store the return value to avoid allocations.
     * @returns {Vector2}
     */
    getClosestPoint: function( x, y, result ) {
      if ( result ) {
        result.setXY( x, y );
      }
      else {
        result = new dot.Vector2( x, y );
      }
      if ( result.x < this.minX ) { result.x = this.minX; }
      if ( result.x > this.maxX ) { result.x = this.maxX; }
      if ( result.y < this.minY ) { result.y = this.minY; }
      if ( result.y > this.maxY ) { result.y = this.maxY; }
      return result;
    }
  }, {
    /**
     * Returns a new Bounds2 object, with the familiar rectangle construction with x, y, width, and height.
     * @public
     *
     * @param {number} x - The minimum value of X for the bounds.
     * @param {number} y - The minimum value of Y for the bounds.
     * @param {number} width - The width (maxX - minX) of the bounds.
     * @param {number} height - The height (maxY - minY) of the bounds.
     * @returns {Bounds2}
     */
    rect: function( x, y, width, height ) {
      return new Bounds2( x, y, x + width, y + height );
    },

    /**
     * Returns a new Bounds2 object that only contains the specified point (x,y). Useful for being dilated to form a
     * bounding box around a point. Note that the bounds will not be "empty" as it contains (x,y), but it will have
     * zero area.
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @returns {Bounds2}
     */
    point: function( x, y ) {
      if ( x instanceof dot.Vector2 ) {
        var p = x;
        return new Bounds2( p.x, p.y, p.x, p.y );
      }
      else {
        return new Bounds2( x, y, x, y );
      }
    }
  } );

  Poolable.mixin( Bounds2, {
    defaultFactory: function() { return Bounds2.NOTHING.copy(); },
    constructorDuplicateFactory: function( pool ) {
      return function( minX, minY, maxX, maxY ) {
        if ( pool.length ) {
          return pool.pop().setMinMax( minX, minY, maxX, maxY );
        }
        else {
          return new Bounds2( minX, minY, maxX, maxY );
        }
      };
    }
  } );

  /**
   * A contant Bounds2 with minimums = $\infty$, maximums = $-\infty$, so that it represents "no bounds whatsoever".
   * @public
   *
   * This allows us to take the union (union/includeBounds) of this and any other Bounds2 to get the other bounds back,
   * e.g. Bounds2.NOTHING.union( bounds ).equals( bounds ). This object naturally serves as the base case as a union of
   * zero bounds objects.
   *
   * Additionally, intersections with NOTHING will always return a Bounds2 equivalent to NOTHING.
   *
   * @constant {Bounds2} NOTHING
   */
  Bounds2.NOTHING = new Bounds2( Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY );

  /**
   * A contant Bounds2 with minimums = $-\infty$, maximums = $\infty$, so that it represents "all bounds".
   * @public
   *
   * This allows us to take the intersection (intersection/constrainBounds) of this and any other Bounds2 to get the
   * other bounds back, e.g. Bounds2.EVERYTHING.intersection( bounds ).equals( bounds ). This object naturally serves as
   * the base case as an intersection of zero bounds objects.
   *
   * Additionally, unions with EVERYTHING will always return a Bounds2 equivalent to EVERYTHING.
   *
   * @constant {Bounds2} EVERYTHING
   */
  Bounds2.EVERYTHING = new Bounds2( Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY );

  function catchImmutableSetterLowHangingFruit( bounds ) {
    bounds.setMinMax = function() { throw new Error( 'Attempt to set \"setMinMax\" of an immutable Bounds2 object' ); };
    bounds.set = function() { throw new Error( 'Attempt to set \"set\" of an immutable Bounds2 object' ); };
    bounds.includeBounds = function() { throw new Error( 'Attempt to set \"includeBounds\" of an immutable Bounds2 object' ); };
    bounds.constrainBounds = function() { throw new Error( 'Attempt to set \"constrainBounds\" of an immutable Bounds2 object' ); };
    bounds.addCoordinates = function() { throw new Error( 'Attempt to set \"addCoordinates\" of an immutable Bounds2 object' ); };
    bounds.transform = function() { throw new Error( 'Attempt to set \"transform\" of an immutable Bounds2 object' ); };
  }

  if ( assert ) {
    catchImmutableSetterLowHangingFruit( Bounds2.EVERYTHING );
    catchImmutableSetterLowHangingFruit( Bounds2.NOTHING );
  }

  return Bounds2;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * 2-dimensional ray
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Ray2',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  function Ray2( position, direction ) {
    this.position = position;
    this.direction = direction;

    assert && assert( Math.abs( direction.magnitude() - 1 ) < 0.01 );

    phetAllocation && phetAllocation( 'Ray2' );
  }

  dot.register( 'Ray2', Ray2 );

  Ray2.prototype = {
    constructor: Ray2,

    shifted: function( distance ) {
      return new Ray2( this.pointAtDistance( distance ), this.direction );
    },

    pointAtDistance: function( distance ) {
      return this.position.plus( this.direction.timesScalar( distance ) );
    },

    toString: function() {
      return this.position.toString() + ' => ' + this.direction.toString();
    }
  };

  return Ray2;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * A segment represents a specific curve with a start and end.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Segment',['require','KITE/kite','PHET_CORE/inherit','AXON/Events','DOT/Util','DOT/Bounds2'],function( require ) {
  'use strict';

  var kite = require( 'KITE/kite' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Events = require( 'AXON/Events' );
  var DotUtil = require( 'DOT/Util' ); // eslint-disable-line require-statement-match
  var Bounds2 = require( 'DOT/Bounds2' );

  /*
   * Will contain (for segments):
   * properties (backed by ES5 getters, created usually lazily):
   * start        - start point of this segment
   * end          - end point of this segment
   * startTangent - the tangent vector (normalized) to the segment at the start, pointing in the direction of motion (from start to end)
   * endTangent   - the tangent vector (normalized) to the segment at the end, pointing in the direction of motion (from start to end)
   * bounds       - the bounding box for the segment
   *
   * methods:
   * positionAt( t )          - returns the position parametrically, with 0 <= t <= 1. this does NOT guarantee a constant magnitude tangent... don't feel like adding elliptical functions yet!
   * tangentAt( t )           - returns the non-normalized tangent (dx/dt, dy/dt) parametrically, with 0 <= t <= 1.
   * curvatureAt( t )         - returns the signed curvature (positive for visual clockwise - mathematical counterclockwise)
   * subdivided( t )          - returns an array with 2 sub-segments, split at the parametric t value.
   * getSVGPathFragment()     - returns a string containing the SVG path. assumes that the start point is already provided, so anything that calls this needs to put the M calls first
   * strokeLeft( lineWidth )  - returns an array of segments that will draw an offset curve on the logical left side
   * strokeRight( lineWidth ) - returns an array of segments that will draw an offset curve on the logical right side
   * windingIntersection      - returns the winding number for intersection with a ray
   * getInteriorExtremaTs     - returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   *
   * writeToContext( context ) - draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   * transformed( matrix )     - returns a new segment that represents this segment after transformation by the matrix
   */
  function Segment() {
    Events.call( this );
  }

  kite.register( 'Segment', Segment );

  var identityFunction = function identityFunction( x ) { return x; };

  inherit( Events, Segment, {
    /**
     * Will return true if the start/end tangents are purely vertical or horizontal. If all of the segments of a shape
     * have this property, then the only line joins will be a multiple of pi/2 (90 degrees), and so all of the types of
     * line joins will have the same bounds. This means that the stroked bounds will just be a pure dilation of the
     * regular bounds, by lineWidth / 2.
     * @public
     *
     * @returns {boolean}
     */
    areStrokedBoundsDilated: function() {
      var epsilon = 0.0000001;

      // If the derivative at the start/end are pointing in a cardinal direction (north/south/east/west), then the
      // endpoints won't trigger non-dilated bounds, and the interior of the curve will not contribute.
      return Math.abs( this.startTangent.x * this.startTangent.y ) < epsilon && Math.abs( this.endTangent.x * this.endTangent.y ) < epsilon;
    },

    // TODO: override everywhere so this isn't necessary (it's not particularly efficient!)
    getBoundsWithTransform: function( matrix ) {
      var transformedSegment = this.transformed( matrix );
      return transformedSegment.getBounds();
    },

    // tList should be a list of sorted t values from 0 <= t <= 1
    subdivisions: function( tList ) {
      // this could be solved by recursion, but we don't plan on the JS engine doing tail-call optimization
      var right = this;
      var result = [];
      for ( var i = 0; i < tList.length; i++ ) {
        // assume binary subdivision
        var t = tList[ i ];
        var arr = right.subdivided( t );
        assert && assert( arr.length === 2 );
        result.push( arr[ 0 ] );
        right = arr[ 1 ];

        // scale up the remaining t values
        for ( var j = i + 1; j < tList.length; j++ ) {
          tList[ j ] = DotUtil.linear( t, 1, 0, 1, tList[ j ] );
        }
      }
      result.push( right );
      return result;
    },

    // return an array of segments from breaking this segment into monotone pieces
    subdividedIntoMonotone: function() {
      return this.subdivisions( this.getInteriorExtremaTs() );
    },

    /*
     * toPiecewiseLinearSegments( options ), with the following options provided:
     * - minLevels:                       how many levels to force subdivisions
     * - maxLevels:                       prevent subdivision past this level
     * - distanceEpsilon (optional null): controls level of subdivision by attempting to ensure a maximum (squared) deviation from the curve
     * - curveEpsilon (optional null):    controls level of subdivision by attempting to ensure a maximum curvature change between segments
     * - pointMap (optional):             function( Vector2 ) : Vector2, represents a (usually non-linear) transformation applied
     * - methodName (optional):           if the method name is found on the segment, it is called with the expected signature function( options ) : Array[Segment]
     *                                    instead of using our brute-force logic
     */
    toPiecewiseLinearSegments: function( options, minLevels, maxLevels, segments, start, end ) {
      // for the first call, initialize min/max levels from our options
      minLevels = minLevels === undefined ? options.minLevels : minLevels;
      maxLevels = maxLevels === undefined ? options.maxLevels : maxLevels;
      segments = segments || [];
      var pointMap = options.pointMap || identityFunction;

      // points mapped by the (possibly-nonlinear) pointMap.
      start = start || pointMap( this.start );
      end = end || pointMap( this.end );
      var middle = pointMap( this.positionAt( 0.5 ) );

      assert && assert( minLevels <= maxLevels );
      assert && assert( options.distanceEpsilon === null || typeof options.distanceEpsilon === 'number' );
      assert && assert( options.curveEpsilon === null || typeof options.curveEpsilon === 'number' );
      assert && assert( !pointMap || typeof pointMap === 'function' );

      // i.e. we will have finished = maxLevels === 0 || ( minLevels <= 0 && epsilonConstraints ), just didn't want to one-line it
      var finished = maxLevels === 0; // bail out once we reach our maximum number of subdivision levels
      if ( !finished && minLevels <= 0 ) { // force subdivision if minLevels hasn't been reached
        // flatness criterion: A=start, B=end, C=midpoint, d0=distance from AB, d1=||B-A||, subdivide if d0/d1 > sqrt(epsilon)
        finished = ( options.curveEpsilon === null || ( DotUtil.distToSegmentSquared( middle, start, end ) / start.distanceSquared( end ) < options.curveEpsilon ) ) &&
                   // deviation criterion
                   ( options.distanceEpsilon === null || ( DotUtil.distToSegmentSquared( middle, start, end ) < options.distanceEpsilon ) );
      }

      if ( finished ) {
        segments.push( new kite.Line( start, end ) );
      }
      else {
        var subdividedSegments = this.subdivided( 0.5 );
        subdividedSegments[ 0 ].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, start, middle );
        subdividedSegments[ 1 ].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, middle, end );
      }
      return segments;
    }
  } );

  /**
   * Adds getter/setter function pairs and ES5 pairs, e.g. addInvalidatingGetterSetter( Arc, 'radius' ) would add:
   * - segment.getRadius()
   * - segment.setRadius( value )
   * - segment.radius // getter and setter
   *
   * It assumes the following is the internal name: '_' + name
   *
   * @param {Function} type - Should be the constructor of the type. We will modify its prototype
   * @param {string} name - Name of the
   */
  Segment.addInvalidatingGetterSetter = function( type, name ) {
    var internalName = '_' + name;
    var capitalizedName = name.charAt( 0 ).toUpperCase() + name.slice( 1 );
    var getterName = 'get' + capitalizedName;
    var setterName = 'set' + capitalizedName;

    // e.g. getRadius()
    type.prototype[ getterName ] = function() {
      return this[ internalName ];
    };

    // e.g. setRadius( value )
    type.prototype[ setterName ] = function( value ) {
      if ( this[ internalName ] !== value ) {
        this[ internalName ] = value;
        this.invalidate();
      }
      return this; // allow chaining
    };

    Object.defineProperty( type.prototype, name, {
      set: type.prototype[ setterName ],
      get: type.prototype[ getterName ]
    } );
  };

  // list of { segment: ..., t: ..., closestPoint: ..., distanceSquared: ... } (since there can be duplicates), threshold is used for subdivision,
  // where it will exit if all of the segments are shorter than the threshold
  // TODO: solve segments to determine this analytically!
  Segment.closestToPoint = function( segments, point, threshold ) {
    var thresholdSquared = threshold * threshold;
    var items = [];
    var bestList = [];
    var bestDistanceSquared = Number.POSITIVE_INFINITY;
    var thresholdOk = false;

    _.each( segments, function( segment ) {
      // if we have an explicit computation for this segment, use it
      if ( segment.explicitClosestToPoint ) {
        var infos = segment.explicitClosestToPoint( point );
        _.each( infos, function( info ) {
          if ( info.distanceSquared < bestDistanceSquared ) {
            bestList = [ info ];
            bestDistanceSquared = info.distanceSquared;
          }
          else if ( info.distanceSquared === bestDistanceSquared ) {
            bestList.push( info );
          }
        } );
      }
      else {
        // otherwise, we will split based on monotonicity, so we can subdivide
        // separate, so we can map the subdivided segments
        var ts = [ 0 ].concat( segment.getInteriorExtremaTs() ).concat( [ 1 ] );
        for ( var i = 0; i < ts.length - 1; i++ ) {
          var ta = ts[ i ];
          var tb = ts[ i + 1 ];
          var pa = segment.positionAt( ta );
          var pb = segment.positionAt( tb );
          var bounds = Bounds2.point( pa ).addPoint( pb );
          var minDistanceSquared = bounds.minimumDistanceToPointSquared( point );
          if ( minDistanceSquared <= bestDistanceSquared ) {
            var maxDistanceSquared = bounds.maximumDistanceToPointSquared( point );
            if ( maxDistanceSquared < bestDistanceSquared ) {
              bestDistanceSquared = maxDistanceSquared;
              bestList = []; // clear it
            }
            items.push( {
              ta: ta,
              tb: tb,
              pa: pa,
              pb: pb,
              segment: segment,
              bounds: bounds,
              min: minDistanceSquared,
              max: maxDistanceSquared
            } );
          }
        }
      }
    } );

    while ( items.length && !thresholdOk ) {
      var curItems = items;
      items = [];

      // whether all of the segments processed are shorter than the threshold
      thresholdOk = true;

      _.each( curItems, function( item ) {
        if ( item.minDistanceSquared > bestDistanceSquared ) {
          return; // drop this item
        }
        if ( thresholdOk && item.pa.distanceSquared( item.pb ) > thresholdSquared ) {
          thresholdOk = false;
        }
        var tmid = ( item.ta + item.tb ) / 2;
        var pmid = item.segment.positionAt( tmid );
        var boundsA = Bounds2.point( item.pa ).addPoint( pmid );
        var boundsB = Bounds2.point( item.pb ).addPoint( pmid );
        var minA = boundsA.minimumDistanceToPointSquared( point );
        var minB = boundsB.minimumDistanceToPointSquared( point );
        if ( minA <= bestDistanceSquared ) {
          var maxA = boundsA.maximumDistanceToPointSquared( point );
          if ( maxA < bestDistanceSquared ) {
            bestDistanceSquared = maxA;
            bestList = []; // clear it
          }
          items.push( {
            ta: item.ta,
            tb: tmid,
            pa: item.pa,
            pb: pmid,
            segment: item.segment,
            bounds: boundsA,
            min: minA,
            max: maxA
          } );
        }
        if ( minB <= bestDistanceSquared ) {
          var maxB = boundsB.maximumDistanceToPointSquared( point );
          if ( maxB < bestDistanceSquared ) {
            bestDistanceSquared = maxB;
            bestList = []; // clear it
          }
          items.push( {
            ta: tmid,
            tb: item.tb,
            pa: pmid,
            pb: item.pb,
            segment: item.segment,
            bounds: boundsB,
            min: minB,
            max: maxB
          } );
        }
      } );
    }

    // if there are any closest regions, they are within the threshold, so we will add them all
    _.each( items, function( item ) {
      var t = ( item.ta + item.tb ) / 2;
      var closestPoint = item.segment.positionAt( t );
      bestList.push( {
        segment: item.segment,
        t: t,
        closestPoint: closestPoint,
        distanceSquared: point.distanceSquared( closestPoint )
      } );
    } );

    return bestList;
  };

  return Segment;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Linear segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Line',['require','PHET_CORE/inherit','DOT/Bounds2','DOT/Vector2','DOT/Util','KITE/kite','KITE/segments/Segment'],function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Vector2 = require( 'DOT/Vector2' );
  var Util = require( 'DOT/Util' );

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  var scratchVector2 = new Vector2();

  function Line( start, end ) {
    Segment.call( this );

    this._start = start;
    this._end = end;

    this.invalidate();
  }

  kite.register( 'Line', Line );

  inherit( Segment, Line, {

    // @public - Clears cached information, should be called when any of the 'constructor arguments' are mutated.
    invalidate: function() {
      // Lazily-computed derived information
      this._tangent = null; // {Vector2 | null}
      this._bounds = null; // {Bounds2 | null}

      this.trigger0( 'invalidated' );
    },

    getStartTangent: function() {
      if ( this._tangent === null ) {
        // TODO: allocation reduction
        this._tangent = this._end.minus( this._start ).normalized();
      }
      return this._tangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      return this.getStartTangent();
    },
    get endTangent() { return this.getEndTangent(); },

    getBounds: function() {
      // TODO: allocation reduction
      if ( this._bounds === null ) {
        this._bounds = Bounds2.NOTHING.copy().addPoint( this._start ).addPoint( this._end );
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    getBoundsWithTransform: function( matrix ) {
      // uses mutable calls
      var bounds = Bounds2.NOTHING.copy();
      bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._start ) ) );
      bounds.addPoint( matrix.multiplyVector2( scratchVector2.set( this._end ) ) );
      return bounds;
    },

    getNondegenerateSegments: function() {
      // if it is degenerate (0-length), just ignore it
      if ( this._start.equals( this._end ) ) {
        return [];
      }
      else {
        return [ this ];
      }
    },

    positionAt: function( t ) {
      return this._start.plus( this._end.minus( this._start ).times( t ) );
    },

    tangentAt: function( t ) {
      // tangent always the same, just use the start tanget
      return this.getStartTangent();
    },

    curvatureAt: function( t ) {
      return 0; // no curvature on a straight line segment
    },

    getSVGPathFragment: function() {
      return 'L ' + kite.svgNumber( this._end.x ) + ' ' + kite.svgNumber( this._end.y );
    },

    strokeLeft: function( lineWidth ) {
      var offset = this.getEndTangent().perpendicular().negated().times( lineWidth / 2 );
      return [ new kite.Line( this._start.plus( offset ), this._end.plus( offset ) ) ];
    },

    strokeRight: function( lineWidth ) {
      var offset = this.getStartTangent().perpendicular().times( lineWidth / 2 );
      return [ new kite.Line( this._end.plus( offset ), this._start.plus( offset ) ) ];
    },

    // lines are already monotone
    getInteriorExtremaTs: function() { return []; },

    subdivided: function( t ) {
      var pt = this.positionAt( t );
      return [
        new kite.Line( this._start, pt ),
        new kite.Line( pt, this._end )
      ];
    },

    intersection: function( ray ) {
      // We solve for the parametric line-line intersection, and then ensure the parameters are within both
      // the line segment and forwards from the ray.

      var result = [];

      var start = this._start;
      var end = this._end;

      var diff = end.minus( start );

      if ( diff.magnitudeSquared() === 0 ) {
        return result;
      }

      var denom = ray.direction.y * diff.x - ray.direction.x * diff.y;

      // If denominator is 0, the lines are parallel or coincident
      if ( denom === 0 ) {
        return result;
      }

      // linear parameter where start (0) to end (1)
      var t = ( ray.direction.x * ( start.y - ray.position.y ) - ray.direction.y * ( start.x - ray.position.x ) ) / denom;

      // check that the intersection point is between the line segment's endpoints
      if ( t < 0 || t >= 1 ) {
        return result;
      }

      // linear parameter where ray.position (0) to ray.position+ray.direction (1)
      var s = ( diff.x * ( start.y - ray.position.y ) - diff.y * ( start.x - ray.position.x ) ) / denom;

      // bail if it is behind our ray
      if ( s < 0.00000001 ) {
        return result;
      }

      // return the proper winding direction depending on what way our line intersection is "pointed"
      var perp = diff.perpendicular();
      result.push( {
        distance: s,
        point: start.plus( diff.times( t ) ),
        normal: perp.dot( ray.direction ) > 0 ? perp.negated() : perp,
        wind: ray.direction.perpendicular().dot( diff ) < 0 ? 1 : -1,
        segment: this
      } );
      return result;
    },

    // returns the resultant winding number of this ray intersecting this segment.
    windingIntersection: function( ray ) {
      var hits = this.intersection( ray );
      if ( hits.length ) {
        return hits[ 0 ].wind;
      }
      else {
        return 0;
      }
    },

    // assumes the current position is at start
    writeToContext: function( context ) {
      context.lineTo( this._end.x, this._end.y );
    },

    transformed: function( matrix ) {
      return new kite.Line( matrix.timesVector2( this._start ), matrix.timesVector2( this._end ) );
    },

    explicitClosestToPoint: function( point ) {
      var diff = this._end.minus( this._start );
      var t = point.minus( this._start ).dot( diff ) / diff.magnitudeSquared();
      t = Util.clamp( t, 0, 1 );
      var closestPoint = this.positionAt( t );
      return [
        {
          segment: this,
          t: t,
          closestPoint: closestPoint,
          distanceSquared: point.distanceSquared( closestPoint )
        }
      ];
    },

    // given the current curve parameterized by t, will return a curve parameterized by x where t = a * x + b
    reparameterized: function( a, b ) {
      return new kite.Line( this.positionAt( b ), this.positionAt( a + b ) );
    },

    polarToCartesian: function( options ) {
      if ( this._start.x === this._end.x ) {
        // angle is the same, we are still a line segment!
        return [ new kite.Line( Vector2.createPolar( this._start.y, this._start.x ), Vector2.createPolar( this._end.y, this._end.x ) ) ];
      }
      else if ( this._start.y === this._end.y ) {
        // we have a constant radius, so we are a circular arc
        return [ new kite.Arc( Vector2.ZERO, this._start.y, this._start.x, this._end.x, this._start.x > this._end.x ) ];
      }
      else {
        return this.toPiecewiseLinearSegments( options );
      }
    }
  } );

  Segment.addInvalidatingGetterSetter( Line, 'start' );
  Segment.addInvalidatingGetterSetter( Line, 'end' );

  return Line;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Arc segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Arc',['require','PHET_CORE/inherit','DOT/Vector2','DOT/Bounds2','DOT/Util','KITE/kite','KITE/segments/Segment'],function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var DotUtil = require( 'DOT/Util' ); // eslint-disable-line require-statement-match

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  /**
   * Creates a circular arc (or circle if the startAngle/endAngle difference is ~2pi).
   * See http://www.w3.org/TR/2dcontext/#dom-context-2d-arc for detailed information on the parameters.
   *
   * @param {Vector2} center - Center of the arc (every point on the arc is equally far from the center)
   * @param {number} radius - How far from the center the arc will be
   * @param {number} startAngle - Angle (radians) of the start of the arc
   * @param {number} endAngle - Angle (radians) of the end of the arc
   * @param {boolean} anticlockwise - Decides which direction the arc takes around the center
   * @constructor
   */
  function Arc( center, radius, startAngle, endAngle, anticlockwise ) {
    Segment.call( this );

    this._center = center;
    this._radius = radius;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;

    this.invalidate();
  }

  kite.register( 'Arc', Arc );

  inherit( Segment, Arc, {
    // @public - Clears cached information, should be called when any of the 'constructor arguments' are mutated.
    invalidate: function() {
      // Lazily-computed derived information
      this._start = null; // {Vector2 | null}
      this._end = null; // {Vector2 | null}
      this._startTangent = null; // {Vector2 | null}
      this._endTangent = null; // {Vector2 | null}
      this._actualEndAngle = null; // {number | null} - End angle in relation to our start angle (can get remapped)
      this._isFullPerimeter = null; // {boolean | null} - Whether it's a full circle (and not just an arc)
      this._angleDifference = null; // {number | null}
      this._bounds = null; // {Bounds2 | null}

      // Remap negative radius to a positive radius
      if ( this._radius < 0 ) {
        // support this case since we might actually need to handle it inside of strokes?
        this._radius = -this._radius;
        this._startAngle += Math.PI;
        this._endAngle += Math.PI;
      }

      // Constraints that should always be satisfied
      assert && assert( !( ( !this.anticlockwise && this.endAngle - this.startAngle <= -Math.PI * 2 ) ||
                           ( this.anticlockwise && this.startAngle - this.endAngle <= -Math.PI * 2 ) ),
        'Not handling arcs with start/end angles that show differences in-between browser handling' );
      assert && assert( !( ( !this.anticlockwise && this.endAngle - this.startAngle > Math.PI * 2 ) ||
                           ( this.anticlockwise && this.startAngle - this.endAngle > Math.PI * 2 ) ),
        'Not handling arcs with start/end angles that show differences in-between browser handling' );

      this.trigger0( 'invalidated' );
    },

    getStart: function() {
      if ( this._start === null ) {
        this._start = this.positionAtAngle( this._startAngle );
      }
      return this._start;
    },
    get start() { return this.getStart(); },

    getEnd: function() {
      if ( this._end === null ) {
        this._end = this.positionAtAngle( this._endAngle );
      }
      return this._end;
    },
    get end() { return this.getEnd(); },

    getStartTangent: function() {
      if ( this._startTangent === null ) {
        this._startTangent = this.tangentAtAngle( this._startAngle );
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      if ( this._endTangent === null ) {
        this._endTangent = this.tangentAtAngle( this._endAngle );
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    getActualEndAngle: function() {
      if ( this._actualEndAngle === null ) {
        // compute an actual end angle so that we can smoothly go from this._startAngle to this._actualEndAngle
        if ( this._anticlockwise ) {
          // angle is 'decreasing'
          // -2pi <= end - start < 2pi
          if ( this._startAngle > this._endAngle ) {
            this._actualEndAngle = this._endAngle;
          }
          else if ( this._startAngle < this._endAngle ) {
            this._actualEndAngle = this._endAngle - 2 * Math.PI;
          }
          else {
            // equal
            this._actualEndAngle = this._startAngle;
          }
        }
        else {
          // angle is 'increasing'
          // -2pi < end - start <= 2pi
          if ( this._startAngle < this._endAngle ) {
            this._actualEndAngle = this._endAngle;
          }
          else if ( this._startAngle > this._endAngle ) {
            this._actualEndAngle = this._endAngle + Math.PI * 2;
          }
          else {
            // equal
            this._actualEndAngle = this._startAngle;
          }
        }
      }
      return this._actualEndAngle;
    },
    get actualEndAngle() { return this.getActualEndAngle(); },

    getIsFullPerimeter: function() {
      if ( this._isFullPerimeter === null ) {
        this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
      }
      return this._isFullPerimeter;
    },
    get isFullPerimeter() { return this.getIsFullPerimeter(); },

    getAngleDifference: function() {
      if ( this._angleDifference === null ) {
        // compute an angle difference that represents how "much" of the circle our arc covers
        this._angleDifference = this._anticlockwise ? this._startAngle - this._endAngle : this._endAngle - this._startAngle;
        if ( this._angleDifference < 0 ) {
          this._angleDifference += Math.PI * 2;
        }
        assert && assert( this._angleDifference >= 0 ); // now it should always be zero or positive
      }
      return this._angleDifference;
    },
    get angleDifference() { return this.getAngleDifference(); },

    getBounds: function() {
      if ( this._bounds === null ) {
        // acceleration for intersection
        this._bounds = Bounds2.NOTHING.copy().withPoint( this.getStart() )
          .withPoint( this.getEnd() );

        // if the angles are different, check extrema points
        if ( this._startAngle !== this._endAngle ) {
          // check all of the extrema points
          this.includeBoundsAtAngle( 0 );
          this.includeBoundsAtAngle( Math.PI / 2 );
          this.includeBoundsAtAngle( Math.PI );
          this.includeBoundsAtAngle( 3 * Math.PI / 2 );
        }
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    getNondegenerateSegments: function() {
      if ( this._radius <= 0 || this._startAngle === this._endAngle ) {
        return [];
      }
      else {
        return [ this ]; // basically, Arcs aren't really degenerate that easily
      }
    },

    includeBoundsAtAngle: function( angle ) {
      if ( this.containsAngle( angle ) ) {
        // the boundary point is in the arc
        this._bounds = this._bounds.withPoint( this._center.plus( Vector2.createPolar( this._radius, angle ) ) );
      }
    },

    // maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
    mapAngle: function( angle ) {
      // consider an assert that we contain that angle?
      return ( this._startAngle > this.getActualEndAngle() ) ?
             DotUtil.moduloBetweenUp( angle, this._startAngle - 2 * Math.PI, this._startAngle ) :
             DotUtil.moduloBetweenDown( angle, this._startAngle, this._startAngle + 2 * Math.PI );
    },

    tAtAngle: function( angle ) {
      return ( this.mapAngle( angle ) - this._startAngle ) / ( this.getActualEndAngle() - this._startAngle );
    },

    angleAt: function( t ) {
      return this._startAngle + ( this.getActualEndAngle() - this._startAngle ) * t;
    },

    positionAt: function( t ) {
      return this.positionAtAngle( this.angleAt( t ) );
    },

    tangentAt: function( t ) {
      return this.tangentAtAngle( this.angleAt( t ) );
    },

    curvatureAt: function( t ) {
      return ( this._anticlockwise ? -1 : 1 ) / this._radius;
    },

    positionAtAngle: function( angle ) {
      return this._center.plus( Vector2.createPolar( this._radius, angle ) );
    },

    tangentAtAngle: function( angle ) {
      var normal = Vector2.createPolar( 1, angle );

      return this._anticlockwise ? normal.perpendicular() : normal.perpendicular().negated();
    },

    // TODO: refactor? shared with EllipticalArc (use this improved version)
    containsAngle: function( angle ) {
      // transform the angle into the appropriate coordinate form
      // TODO: check anticlockwise version!
      var normalizedAngle = this._anticlockwise ? angle - this._endAngle : angle - this._startAngle;

      // get the angle between 0 and 2pi
      var positiveMinAngle = DotUtil.moduloBetweenDown( normalizedAngle, 0, Math.PI * 2 );

      return positiveMinAngle <= this.angleDifference;
    },

    getSVGPathFragment: function() {
      // see http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands for more info
      // rx ry x-axis-rotation large-arc-flag sweep-flag x y

      var epsilon = 0.01; // allow some leeway to render things as 'almost circles'
      var sweepFlag = this._anticlockwise ? '0' : '1';
      var largeArcFlag;
      if ( this.angleDifference < Math.PI * 2 - epsilon ) {
        largeArcFlag = this.angleDifference < Math.PI ? '0' : '1';
        return 'A ' + kite.svgNumber( this._radius ) + ' ' + kite.svgNumber( this._radius ) + ' 0 ' + largeArcFlag +
               ' ' + sweepFlag + ' ' + kite.svgNumber( this.end.x ) + ' ' + kite.svgNumber( this.end.y );
      }
      else {
        // circle (or almost-circle) case needs to be handled differently
        // since SVG will not be able to draw (or know how to draw) the correct circle if we just have a start and end, we need to split it into two circular arcs

        // get the angle that is between and opposite of both of the points
        var splitOppositeAngle = ( this._startAngle + this._endAngle ) / 2; // this _should_ work for the modular case?
        var splitPoint = this._center.plus( Vector2.createPolar( this._radius, splitOppositeAngle ) );

        largeArcFlag = '0'; // since we split it in 2, it's always the small arc

        var firstArc = 'A ' + kite.svgNumber( this._radius ) + ' ' + kite.svgNumber( this._radius ) + ' 0 ' +
                       largeArcFlag + ' ' + sweepFlag + ' ' + kite.svgNumber( splitPoint.x ) + ' ' + kite.svgNumber( splitPoint.y );
        var secondArc = 'A ' + kite.svgNumber( this._radius ) + ' ' + kite.svgNumber( this._radius ) + ' 0 ' +
                        largeArcFlag + ' ' + sweepFlag + ' ' + kite.svgNumber( this.end.x ) + ' ' + kite.svgNumber( this.end.y );

        return firstArc + ' ' + secondArc;
      }
    },

    strokeLeft: function( lineWidth ) {
      return [ new kite.Arc( this._center, this._radius + ( this._anticlockwise ? 1 : -1 ) * lineWidth / 2, this._startAngle, this._endAngle, this._anticlockwise ) ];
    },

    strokeRight: function( lineWidth ) {
      return [ new kite.Arc( this._center, this._radius + ( this._anticlockwise ? -1 : 1 ) * lineWidth / 2, this._endAngle, this._startAngle, !this._anticlockwise ) ];
    },

    // not including 0 and 1
    getInteriorExtremaTs: function() {
      var that = this;
      var result = [];
      _.each( [ 0, Math.PI / 2, Math.PI, 3 * Math.PI / 2 ], function( angle ) {
        if ( that.containsAngle( angle ) ) {
          var t = that.tAtAngle( angle );
          var epsilon = 0.0000000001; // TODO: general kite epsilon?
          if ( t > epsilon && t < 1 - epsilon ) {
            result.push( t );
          }
        }
      } );
      return result.sort(); // modifies original, which is OK
    },

    subdivided: function( t ) {
      // TODO: verify that we don't need to switch anticlockwise here, or subtract 2pi off any angles
      var angle0 = this.angleAt( 0 );
      var angleT = this.angleAt( t );
      var angle1 = this.angleAt( 1 );
      return [
        new kite.Arc( this._center, this._radius, angle0, angleT, this._anticlockwise ),
        new kite.Arc( this._center, this._radius, angleT, angle1, this._anticlockwise )
      ];
    },

    intersection: function( ray ) {
      var result = []; // hits in order

      // left here, if in the future we want to better-handle boundary points
      var epsilon = 0;

      // Run a general circle-intersection routine, then we can test the angles later.
      // Solves for the two solutions t such that ray.position + ray.direction * t is on the circle.
      // Then we check whether the angle at each possible hit point is in our arc.
      var centerToRay = ray.position.minus( this._center );
      var tmp = ray.direction.dot( centerToRay );
      var centerToRayDistSq = centerToRay.magnitudeSquared();
      var discriminant = 4 * tmp * tmp - 4 * ( centerToRayDistSq - this._radius * this._radius );
      if ( discriminant < epsilon ) {
        // ray misses circle entirely
        return result;
      }
      var base = ray.direction.dot( this._center ) - ray.direction.dot( ray.position );
      var sqt = Math.sqrt( discriminant ) / 2;
      var ta = base - sqt;
      var tb = base + sqt;

      if ( tb < epsilon ) {
        // circle is behind ray
        return result;
      }

      var pointB = ray.pointAtDistance( tb );
      var normalB = pointB.minus( this._center ).normalized();

      if ( ta < epsilon ) {
        // we are inside the circle, so only one intersection is possible
        if ( this.containsAngle( normalB.angle() ) ) {
          result.push( {
            distance: tb,
            point: pointB,
            normal: normalB.negated(), // normal is towards the ray
            wind: this._anticlockwise ? -1 : 1 // since we are inside, wind this way
          } );
        }
      }
      else {
        // two possible hits (outside circle)
        var pointA = ray.pointAtDistance( ta );
        var normalA = pointA.minus( this._center ).normalized();

        if ( this.containsAngle( normalA.angle() ) ) {
          result.push( {
            distance: ta,
            point: pointA,
            normal: normalA,
            wind: this._anticlockwise ? 1 : -1 // hit from outside
          } );
        }
        if ( this.containsAngle( normalB.angle() ) ) {
          result.push( {
            distance: tb,
            point: pointB,
            normal: normalB.negated(),
            wind: this._anticlockwise ? -1 : 1 // this is the far hit, which winds the opposite way
          } );
        }
      }

      return result;
    },

    // returns the resultant winding number of this ray intersecting this segment.
    windingIntersection: function( ray ) {
      var wind = 0;
      var hits = this.intersection( ray );
      _.each( hits, function( hit ) {
        wind += hit.wind;
      } );
      return wind;
    },

    writeToContext: function( context ) {
      context.arc( this._center.x, this._center.y, this._radius, this._startAngle, this._endAngle, this._anticlockwise );
    },

    // TODO: test various transform types, especially rotations, scaling, shears, etc.
    transformed: function( matrix ) {
      // so we can handle reflections in the transform, we do the general case handling for start/end angles
      var startAngle = matrix.timesVector2( Vector2.createPolar( 1, this._startAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle();
      var endAngle = matrix.timesVector2( Vector2.createPolar( 1, this._endAngle ) ).minus( matrix.timesVector2( Vector2.ZERO ) ).angle();

      // reverse the 'clockwiseness' if our transform includes a reflection
      var anticlockwise = matrix.getDeterminant() >= 0 ? this._anticlockwise : !this._anticlockwise;

      if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
        endAngle = anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
      }

      var scaleVector = matrix.getScaleVector();
      if ( scaleVector.x !== scaleVector.y ) {
        var radiusX = scaleVector.x * this._radius;
        var radiusY = scaleVector.y * this._radius;
        return new kite.EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, 0, startAngle, endAngle, anticlockwise );
      }
      else {
        var radius = scaleVector.x * this._radius;
        return new kite.Arc( matrix.timesVector2( this._center ), radius, startAngle, endAngle, anticlockwise );
      }
    }
  } );

  Segment.addInvalidatingGetterSetter( Arc, 'center' );
  Segment.addInvalidatingGetterSetter( Arc, 'radius' );
  Segment.addInvalidatingGetterSetter( Arc, 'startAngle' );
  Segment.addInvalidatingGetterSetter( Arc, 'endAngle' );
  Segment.addInvalidatingGetterSetter( Arc, 'anticlockwise' );

  return Arc;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Styles needed to determine a stroked line shape.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/util/LineStyles',['require','KITE/kite','DOT/Util','PHET_CORE/inherit','KITE/segments/Arc','KITE/segments/Line'],function( require ) {
  'use strict';

  var kite = require( 'KITE/kite' );
  var lineLineIntersection = require( 'DOT/Util' ).lineLineIntersection;
  var inherit = require( 'PHET_CORE/inherit' );

  var Arc = require( 'KITE/segments/Arc' );
  var Line = require( 'KITE/segments/Line' );

  function LineStyles( args ) {
    if ( args === undefined ) {
      args = {};
    }
    this.lineWidth = args.lineWidth !== undefined ? args.lineWidth : 1;
    this.lineCap = args.lineCap !== undefined ? args.lineCap : 'butt'; // butt, round, square
    this.lineJoin = args.lineJoin !== undefined ? args.lineJoin : 'miter'; // miter, round, bevel
    this.lineDash = args.lineDash ? args.lineDash : []; // [] is default, otherwise an array of numbers
    this.lineDashOffset = args.lineDashOffset !== undefined ? args.lineDashOffset : 0; // 0 default, any number
    this.miterLimit = args.miterLimit !== undefined ? args.miterLimit : 10; // see https://svgwg.org/svg2-draft/painting.html for miterLimit computations

    assert && assert( Array.isArray( this.lineDash ) );
  }

  kite.register( 'LineStyles', LineStyles );

  inherit( Object, LineStyles, {

    equals: function( other ) {
      var typical = this.lineWidth === other.lineWidth &&
                    this.lineCap === other.lineCap &&
                    this.lineJoin === other.lineJoin &&
                    this.miterLimit === other.miterLimit &&
                    this.lineDashOffset === other.lineDashOffset;
      if ( !typical ) {
        return false;
      }

      if ( this.lineDash.length === other.lineDash.length ) {
        for ( var i = 0; i < this.lineDash.length; i++ ) {
          if ( this.lineDash[ i ] !== other.lineDash[ i ] ) {
            return false;
          }
        }
      }
      else {
        // line dashes must be different
        return false;
      }

      return true;
    },

    /*
     * Creates an array of Segments that make up a line join, to the left side.
     *
     * Joins two segments together on the logical "left" side, at 'center' (where they meet), and un-normalized tangent
     * vectors in the direction of the stroking. To join on the "right" side, switch the tangent order and negate them.
     */
    leftJoin: function( center, fromTangent, toTangent ) {
      fromTangent = fromTangent.normalized();
      toTangent = toTangent.normalized();

      // where our join path starts and ends
      var fromPoint = center.plus( fromTangent.perpendicular().negated().times( this.lineWidth / 2 ) );
      var toPoint = center.plus( toTangent.perpendicular().negated().times( this.lineWidth / 2 ) );

      var bevel = ( fromPoint.equals( toPoint ) ? [] : [ new Line( fromPoint, toPoint ) ] );

      // only insert a join on the non-acute-angle side
      if ( fromTangent.perpendicular().dot( toTangent ) > 0 ) {
        switch( this.lineJoin ) {
          case 'round':
            var fromAngle = fromTangent.angle() + Math.PI / 2;
            var toAngle = toTangent.angle() + Math.PI / 2;
            return [ new Arc( center, this.lineWidth / 2, fromAngle, toAngle, true ) ];
          case 'miter':
            var theta = fromTangent.angleBetween( toTangent.negated() );
            if ( 1 / Math.sin( theta / 2 ) <= this.miterLimit && theta < Math.PI - 0.00001 ) {
              // draw the miter
              var miterPoint = lineLineIntersection( fromPoint, fromPoint.plus( fromTangent ), toPoint, toPoint.plus( toTangent ) );
              return [
                new Line( fromPoint, miterPoint ),
                new Line( miterPoint, toPoint )
              ];
            }
            else {
              // angle too steep, use bevel instead. same as below, but copied for linter
              return bevel;
            }
            break;
          case 'bevel':
            return bevel;
        }
      }
      else {
        // no join necessary here since we have the acute angle. just simple lineTo for now so that the next segment starts from the right place
        // TODO: can we prevent self-intersection here?
        return bevel;
      }
    },

    /*
     * Creates an array of Segments that make up a line join, to the right side.
     *
     * Joins two segments together on the logical "right" side, at 'center' (where they meet), and normalized tangent
     * vectors in the direction of the stroking. To join on the "left" side, switch the tangent order and negate them.
     */
    rightJoin: function( center, fromTangent, toTangent ) {
      return this.leftJoin( center, toTangent.negated(), fromTangent.negated() );
    },

    /*
     * Creates an array of Segments that make up a line cap from the endpoint 'center' in the direction of the tangent
     */
    cap: function( center, tangent ) {
      tangent = tangent.normalized();

      var fromPoint = center.plus( tangent.perpendicular().times( -this.lineWidth / 2 ) );
      var toPoint = center.plus( tangent.perpendicular().times( this.lineWidth / 2 ) );

      switch( this.lineCap ) {
        case 'butt':
          return [ new Line( fromPoint, toPoint ) ];
        case 'round':
          var tangentAngle = tangent.angle();
          return [ new Arc( center, this.lineWidth / 2, tangentAngle + Math.PI / 2, tangentAngle - Math.PI / 2, true ) ];
        case 'square':
          var toLeft = tangent.perpendicular().negated().times( this.lineWidth / 2 );
          var toRight = tangent.perpendicular().times( this.lineWidth / 2 );
          var toFront = tangent.times( this.lineWidth / 2 );

          var left = center.plus( toLeft ).plus( toFront );
          var right = center.plus( toRight ).plus( toFront );
          return [
            new Line( fromPoint, left ),
            new Line( left, right ),
            new Line( right, toPoint )
          ];
      }
    }
  } );

  return kite.LineStyles;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * A Canvas-style stateful (mutable) subpath, which tracks segments in addition to the points.
 *
 * See http://www.w3.org/TR/2dcontext/#concept-path
 * for the path / subpath Canvas concept.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/util/Subpath',['require','DOT/Bounds2','PHET_CORE/inherit','AXON/Events','KITE/kite','KITE/segments/Line','KITE/segments/Arc','KITE/util/LineStyles'],function( require ) {
  'use strict';

  var Bounds2 = require( 'DOT/Bounds2' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Events = require( 'AXON/Events' );

  var kite = require( 'KITE/kite' );

  var Line = require( 'KITE/segments/Line' );
  var Arc = require( 'KITE/segments/Arc' );
  var LineStyles = require( 'KITE/util/LineStyles' );

  // all arguments optional (they are for the copy() method)
  function Subpath( segments, points, closed ) {
    Events.call( this );

    var self = this;

    this.segments = [];

    // recombine points if necessary, based off of start points of segments + the end point of the last segment
    this.points = points || ( ( segments && segments.length ) ? _.map( segments, function( segment ) { return segment.start; } ).concat( segments[ segments.length - 1 ].end ) : [] );
    this.closed = !!closed;

    // cached stroked shape (so hit testing can be done quickly on stroked shapes)
    this._strokedSubpaths = null;
    this._strokedSubpathsComputed = false;
    this._strokedStyles = null;

    this._bounds = null; // {Bounds2 | null} - If non-null, the bounds of the subpath

    this._invalidateListener = this.invalidate.bind( this );
    this._invalidatingPoints = false; // So we can invalidate all of the points without firing invalidation tons of times

    // Add all segments directly (hooks up invalidation listeners properly)
    if ( segments ) {
      for ( var i = 0; i < segments.length; i++ ) {
        _.each( segments[ i ].getNondegenerateSegments(), function( segment ) {
          self.addSegmentDirectly( segment );
        } );
      }
    }
  }

  kite.register( 'Subpath', Subpath );

  inherit( Events, Subpath, {
    getBounds: function() {
      if ( this._bounds === null ) {
        var bounds = Bounds2.NOTHING.copy();
        _.each( this.segments, function( segment ) {
          bounds.includeBounds( segment.getBounds() );
        } );
        this._bounds = bounds;
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    copy: function() {
      return new Subpath( this.segments.slice( 0 ), this.points.slice( 0 ), this.closed );
    },

    invalidatePoints: function() {
      this._invalidatingPoints = true;

      var numSegments = this.segments.length;
      for ( var i = 0; i < numSegments; i++ ) {
        this.segments[ i ].invalidate();
      }

      this._invalidatingPoints = false;
      this.invalidate();
    },

    invalidate: function() {
      if ( !this._invalidatingPoints ) {
        this._bounds = null;
        this._strokedSubpathsComputed = false;
        this.trigger0( 'invalidated' );
      }
    },

    addPoint: function( point ) {
      this.points.push( point );

      return this; // allow chaining
    },

    // @private - REALLY! Make sure we invalidate() after this is called
    addSegmentDirectly: function( segment ) {
      assert && assert( segment.start.isFinite(), 'Segment start is infinite' );
      assert && assert( segment.end.isFinite(), 'Segment end is infinite' );
      assert && assert( segment.startTangent.isFinite(), 'Segment startTangent is infinite' );
      assert && assert( segment.endTangent.isFinite(), 'Segment endTangent is infinite' );
      assert && assert( segment.bounds.isEmpty() || segment.bounds.isFinite(), 'Segment bounds is infinite and non-empty' );
      this.segments.push( segment );

      // Hook up an invalidation listener, so if this segment is invalidated, it will invalidate our subpath!
      // NOTE: if we add removal of segments, we'll need to remove these listeners, or we'll leak!
      segment.onStatic( 'invalidated', this._invalidateListener );

      return this; // allow chaining
    },

    addSegment: function( segment ) {
      var nondegenerateSegments = segment.getNondegenerateSegments();
      var numNondegenerateSegments = nondegenerateSegments.length;
      for ( var i = 0; i < numNondegenerateSegments; i++ ) {
        this.addSegmentDirectly( segment );
      }
      this.invalidate(); // need to invalidate after addSegmentDirectly

      return this; // allow chaining
    },

    // Adds a line segment from the start to end (if non-zero length) and marks the subpath as closed.
    // NOTE: normally you just want to mark the subpath as closed, and not generate the closing segment this way?
    addClosingSegment: function() {
      if ( this.hasClosingSegment() ) {
        var closingSegment = this.getClosingSegment();
        this.addSegmentDirectly( closingSegment );
        this.invalidate(); // need to invalidate after addSegmentDirectly
        this.addPoint( this.getFirstPoint() );
        this.closed = true;
      }
    },

    // TODO: consider always adding a closing segment into our segments list for easier processing!! see addClosingSegment()
    close: function() {
      this.closed = true;
    },

    getLength: function() {
      return this.points.length;
    },

    getFirstPoint: function() {
      return _.first( this.points );
    },

    getLastPoint: function() {
      return _.last( this.points );
    },

    getFirstSegment: function() {
      return _.first( this.segments );
    },

    getLastSegment: function() {
      return _.last( this.segments );
    },

    isDrawable: function() {
      return this.segments.length > 0;
    },

    isClosed: function() {
      return this.closed;
    },

    hasClosingSegment: function() {
      return !this.getFirstPoint().equalsEpsilon( this.getLastPoint(), 0.000000001 );
    },

    getClosingSegment: function() {
      assert && assert( this.hasClosingSegment(), 'Implicit closing segment unnecessary on a fully closed path' );
      return new Line( this.getLastPoint(), this.getFirstPoint() );
    },

    writeToContext: function( context ) {
      if ( this.isDrawable() ) {
        var startPoint = this.getFirstSegment().start;
        context.moveTo( startPoint.x, startPoint.y ); // the segments assume the current context position is at their start

        var len = this.segments.length;
        for ( var i = 0; i < len; i++ ) {
          this.segments[ i ].writeToContext( context );
        }

        if ( this.closed ) {
          context.closePath();
        }
      }
    },

    // see Segment.toPiecewiseLinearSegments for documentation
    toPiecewiseLinear: function( options ) {
      assert && assert( !options.pointMap, 'For use with pointMap, please use nonlinearTransformed' );
      return new Subpath( _.flatten( _.map( this.segments, function( segment ) {
        return segment.toPiecewiseLinearSegments( options );
      } ) ), null, this.closed );
    },

    transformed: function( matrix ) {
      return new Subpath(
        _.map( this.segments, function( segment ) { return segment.transformed( matrix ); } ),
        _.map( this.points, function( point ) { return matrix.timesVector2( point ); } ),
        this.closed
      );
    },

    // see Segment.toPiecewiseLinearSegments for documentation
    nonlinearTransformed: function( options ) {
      // specify an actual closing segment, so it can be mapped properly by any non-linear transforms
      // TODO: always create and add the closing segments when the subpath is closed!!!
      if ( this.closed && this.hasClosingSegment() ) {
        this.addClosingSegment();
      }

      return new Subpath( _.flatten( _.map( this.segments, function( segment ) {
        // check for this segment's support for the specific transform or discretization being applied
        if ( options.methodName && segment[ options.methodName ] ) {
          return segment[ options.methodName ]( options );
        }
        else {
          return segment.toPiecewiseLinearSegments( options );
        }
      } ) ), null, this.closed );
    },

    getBoundsWithTransform: function( matrix ) {
      var bounds = Bounds2.NOTHING.copy();
      var numSegments = this.segments.length;
      for ( var i = 0; i < numSegments; i++ ) {
        bounds.includeBounds( this.segments[ i ].getBoundsWithTransform( matrix ) );
      }
      return bounds;
    },

    // {experimental} returns a subpath
    offset: function( distance ) {
      if ( !this.isDrawable() ) {
        return new Subpath( [], null, this.closed );
      }
      if ( distance === 0 ) {
        return new Subpath( this.segments.slice(), null, this.closed );
      }

      var i;

      var regularSegments = this.segments.slice();
      if ( this.closed && this.hasClosingSegment() ) {
        regularSegments.push( this.getClosingSegment() );
      }
      var offsets = [];

      for ( i = 0; i < regularSegments.length; i++ ) {
        offsets.push( regularSegments[ i ].strokeLeft( 2 * distance ) );
      }

      var segments = [];
      for ( i = 0; i < regularSegments.length; i++ ) {
        if ( this.closed || i > 0 ) {
          var previousI = ( i > 0 ? i : regularSegments.length ) - 1;
          var center = regularSegments[ i ].start;
          var fromTangent = regularSegments[ previousI ].endTangent;
          var toTangent = regularSegments[ i ].startTangent;

          var startAngle = fromTangent.perpendicular().negated().times( distance ).angle();
          var endAngle = toTangent.perpendicular().negated().times( distance ).angle();
          var anticlockwise = fromTangent.perpendicular().dot( toTangent ) > 0;
          segments.push( new Arc( center, Math.abs( distance ), startAngle, endAngle, anticlockwise ) );
        }
        segments = segments.concat( offsets[ i ] );
      }

      return new Subpath( segments, null, this.closed );
    },

    // returns an array of subpaths (one if open, two if closed) that represent a stroked copy of this subpath.
    stroked: function( lineStyles ) {
      // non-drawable subpaths convert to empty subpaths
      if ( !this.isDrawable() ) {
        return [];
      }

      if ( lineStyles === undefined ) {
        lineStyles = new LineStyles();
      }

      // return a cached version if possible
      if ( this._strokedSubpathsComputed && this._strokedStyles.equals( lineStyles ) ) {
        return this._strokedSubpaths;
      }

      var lineWidth = lineStyles.lineWidth;

      var i;
      var leftSegments = [];
      var rightSegments = [];
      var firstSegment = this.getFirstSegment();
      var lastSegment = this.getLastSegment();

      function appendLeftSegments( segments ) {
        leftSegments = leftSegments.concat( segments );
      }

      function appendRightSegments( segments ) {
        rightSegments = rightSegments.concat( segments );
      }

      // we don't need to insert an implicit closing segment if the start and end points are the same
      var alreadyClosed = lastSegment.end.equals( firstSegment.start );
      // if there is an implicit closing segment
      var closingSegment = alreadyClosed ? null : new Line( this.segments[ this.segments.length - 1 ].end, this.segments[ 0 ].start );

      // stroke the logical "left" side of our path
      for ( i = 0; i < this.segments.length; i++ ) {
        if ( i > 0 ) {
          appendLeftSegments( lineStyles.leftJoin( this.segments[ i ].start, this.segments[ i - 1 ].endTangent, this.segments[ i ].startTangent ) );
        }
        appendLeftSegments( this.segments[ i ].strokeLeft( lineWidth ) );
      }

      // stroke the logical "right" side of our path
      for ( i = this.segments.length - 1; i >= 0; i-- ) {
        if ( i < this.segments.length - 1 ) {
          appendRightSegments( lineStyles.rightJoin( this.segments[ i ].end, this.segments[ i ].endTangent, this.segments[ i + 1 ].startTangent ) );
        }
        appendRightSegments( this.segments[ i ].strokeRight( lineWidth ) );
      }

      var subpaths;
      if ( this.closed ) {
        if ( alreadyClosed ) {
          // add the joins between the start and end
          appendLeftSegments( lineStyles.leftJoin( lastSegment.end, lastSegment.endTangent, firstSegment.startTangent ) );
          appendRightSegments( lineStyles.rightJoin( lastSegment.end, lastSegment.endTangent, firstSegment.startTangent ) );
        }
        else {
          // logical "left" stroke on the implicit closing segment
          appendLeftSegments( lineStyles.leftJoin( closingSegment.start, lastSegment.endTangent, closingSegment.startTangent ) );
          appendLeftSegments( closingSegment.strokeLeft( lineWidth ) );
          appendLeftSegments( lineStyles.leftJoin( closingSegment.end, closingSegment.endTangent, firstSegment.startTangent ) );

          // logical "right" stroke on the implicit closing segment
          appendRightSegments( lineStyles.rightJoin( closingSegment.end, closingSegment.endTangent, firstSegment.startTangent ) );
          appendRightSegments( closingSegment.strokeRight( lineWidth ) );
          appendRightSegments( lineStyles.rightJoin( closingSegment.start, lastSegment.endTangent, closingSegment.startTangent ) );
        }
        subpaths = [
          new Subpath( leftSegments, null, true ),
          new Subpath( rightSegments, null, true )
        ];
      }
      else {
        subpaths = [
          new Subpath( leftSegments.concat( lineStyles.cap( lastSegment.end, lastSegment.endTangent ) )
            .concat( rightSegments )
            .concat( lineStyles.cap( firstSegment.start, firstSegment.startTangent.negated() ) ),
            null, true )
        ];
      }

      this._strokedSubpaths = subpaths;
      this._strokedSubpathsComputed = true;
      this._strokedStyles = new LineStyles( lineStyles ); // shallow copy, since we consider linestyles to be mutable

      return subpaths;
    }
  } );

  return kite.Subpath;
} );

// NOTE: Generated from svgPath.pegjs using PEG.js, with added kite namespace and require.js compatibility.
// See svgPath.pegjs for more documentation, or run "grunt generate-svgPath-parser" to regenerate.

define( 'KITE/parser/svgPath',['require','KITE/kite'],function( require ) {
  var kite = require( 'KITE/kite' );

  /*
   * Generated by PEG.js 0.7.0.
   *
   * http://pegjs.majda.cz/
   */

  function quote( s ) {
    /*
     * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
     * string literal except for the closing quote character, backslash,
     * carriage return, line separator, paragraph separator, and line feed.
     * Any character may appear in the form of an escape sequence.
     *
     * For portability, we also escape escape all control and non-ASCII
     * characters. Note that "\0" and "\v" escape sequences are not used
     * because JSHint does not like the first and IE the second.
     */
    return '"' + s
        .replace( /\\/g, '\\\\' )  // backslash
        .replace( /"/g, '\\"' )    // closing quote character
        .replace( /\x08/g, '\\b' ) // backspace
        .replace( /\t/g, '\\t' )   // horizontal tab
        .replace( /\n/g, '\\n' )   // line feed
        .replace( /\f/g, '\\f' )   // form feed
        .replace( /\r/g, '\\r' )   // carriage return
        .replace( /[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape )
           + '"';
  }

  var result = {
    /*
     * Parses the input with a generated parser. If the parsing is successfull,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.parser.SyntaxError| describing the error.
     */
    parse: function( input, startRule ) {
      var parseFunctions = {
        "svgPath": parse_svgPath,
        "movetoDrawtoCommandGroups": parse_movetoDrawtoCommandGroups,
        "movetoDrawtoCommandGroup": parse_movetoDrawtoCommandGroup,
        "drawtoCommands": parse_drawtoCommands,
        "drawtoCommand": parse_drawtoCommand,
        "moveto": parse_moveto,
        "movetoArgumentSequence": parse_movetoArgumentSequence,
        "closepath": parse_closepath,
        "lineto": parse_lineto,
        "linetoArgumentSequence": parse_linetoArgumentSequence,
        "horizontalLineto": parse_horizontalLineto,
        "horizontalLinetoArgumentSequence": parse_horizontalLinetoArgumentSequence,
        "verticalLineto": parse_verticalLineto,
        "verticalLinetoArgumentSequence": parse_verticalLinetoArgumentSequence,
        "curveto": parse_curveto,
        "curvetoArgumentSequence": parse_curvetoArgumentSequence,
        "curvetoArgument": parse_curvetoArgument,
        "smoothCurveto": parse_smoothCurveto,
        "smoothCurvetoArgumentSequence": parse_smoothCurvetoArgumentSequence,
        "smoothCurvetoArgument": parse_smoothCurvetoArgument,
        "quadraticBezierCurveto": parse_quadraticBezierCurveto,
        "quadraticBezierCurvetoArgumentSequence": parse_quadraticBezierCurvetoArgumentSequence,
        "quadraticBezierCurvetoArgument": parse_quadraticBezierCurvetoArgument,
        "smoothQuadraticBezierCurveto": parse_smoothQuadraticBezierCurveto,
        "smoothQuadraticBezierCurvetoArgumentSequence": parse_smoothQuadraticBezierCurvetoArgumentSequence,
        "ellipticalArc": parse_ellipticalArc,
        "ellipticalArcArgumentSequence": parse_ellipticalArcArgumentSequence,
        "ellipticalArcArgument": parse_ellipticalArcArgument,
        "coordinatePair": parse_coordinatePair,
        "nonnegativeNumber": parse_nonnegativeNumber,
        "number": parse_number,
        "flag": parse_flag,
        "commaWsp": parse_commaWsp,
        "comma": parse_comma,
        "floatingPointConstant": parse_floatingPointConstant,
        "fractionalConstant": parse_fractionalConstant,
        "exponent": parse_exponent,
        "sign": parse_sign,
        "digitSequence": parse_digitSequence,
        "digit": parse_digit,
        "wsp": parse_wsp
      };

      if ( startRule !== undefined ) {
        if ( parseFunctions[ startRule ] === undefined ) {
          throw new Error( "Invalid rule name: " + quote( startRule ) + "." );
        }
      }
      else {
        startRule = "svgPath";
      }

      var pos = 0;
      var reportFailures = 0;
      var rightmostFailuresPos = 0;
      var rightmostFailuresExpected = [];

      function padLeft( input, padding, length ) {
        var result = input;

        var padLength = length - input.length;
        for ( var i = 0; i < padLength; i++ ) {
          result = padding + result;
        }

        return result;
      }

      function escape( ch ) {
        var charCode = ch.charCodeAt( 0 );
        var escapeChar;
        var length;

        if ( charCode <= 0xFF ) {
          escapeChar = 'x';
          length = 2;
        }
        else {
          escapeChar = 'u';
          length = 4;
        }

        return '\\' + escapeChar + padLeft( charCode.toString( 16 ).toUpperCase(), '0', length );
      }

      function matchFailed( failure ) {
        if ( pos < rightmostFailuresPos ) {
          return;
        }

        if ( pos > rightmostFailuresPos ) {
          rightmostFailuresPos = pos;
          rightmostFailuresExpected = [];
        }

        rightmostFailuresExpected.push( failure );
      }

      function parse_svgPath() {
        var result0, result1, result2, result3;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = [];
        result1 = parse_wsp();
        while ( result1 !== null ) {
          result0.push( result1 );
          result1 = parse_wsp();
        }
        if ( result0 !== null ) {
          result1 = parse_movetoDrawtoCommandGroups();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = [];
            result3 = parse_wsp();
            while ( result3 !== null ) {
              result2.push( result3 );
              result3 = parse_wsp();
            }
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, path ) { return path ? path : []; })( pos0, result0[ 1 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_movetoDrawtoCommandGroups() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_movetoDrawtoCommandGroup();
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_movetoDrawtoCommandGroups();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return a.concat( b ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_movetoDrawtoCommandGroup();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return a; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_movetoDrawtoCommandGroup() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_moveto();
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_drawtoCommands();
            result2 = result2 !== null ? result2 : "";
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, m, c ) { return c.length ? m.concat( c ) : m; })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_drawtoCommands() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_drawtoCommand();
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_drawtoCommands();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, cmd, cmds ) { return cmd.concat( cmds ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_drawtoCommand();
          if ( result0 !== null ) {
            result0 = (function( offset, cmd ) { return cmd; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_drawtoCommand() {
        var result0;

        result0 = parse_closepath();
        if ( result0 === null ) {
          result0 = parse_lineto();
          if ( result0 === null ) {
            result0 = parse_horizontalLineto();
            if ( result0 === null ) {
              result0 = parse_verticalLineto();
              if ( result0 === null ) {
                result0 = parse_curveto();
                if ( result0 === null ) {
                  result0 = parse_smoothCurveto();
                  if ( result0 === null ) {
                    result0 = parse_quadraticBezierCurveto();
                    if ( result0 === null ) {
                      result0 = parse_smoothQuadraticBezierCurveto();
                      if ( result0 === null ) {
                        result0 = parse_ellipticalArc();
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return result0;
      }

      function parse_moveto() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 77 ) {
          result0 = "M";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"M\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_movetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) { return createMoveTo( args, false ); })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 109 ) {
            result0 = "m";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"m\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_movetoArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) { return createMoveTo( args, true ); })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_movetoArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_coordinatePair();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_linetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, pair, list ) { return [ pair ].concat( list ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_coordinatePair();
          if ( result0 !== null ) {
            result0 = (function( offset, pair ) { return [ pair ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_closepath() {
        var result0;
        var pos0;

        pos0 = pos;
        if ( input.charCodeAt( pos ) === 90 ) {
          result0 = "Z";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"Z\"" );
          }
        }
        if ( result0 === null ) {
          if ( input.charCodeAt( pos ) === 122 ) {
            result0 = "z";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"z\"" );
            }
          }
        }
        if ( result0 !== null ) {
          result0 = (function( offset, command ) { return { cmd: 'close' }; })( pos0, result0 );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_lineto() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 76 ) {
          result0 = "L";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"L\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_linetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) {
            return args.map( function( arg ) {
              return {
                cmd: 'lineTo',
                args: [ arg.x, arg.y ]
              };
            } );
          })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 108 ) {
            result0 = "l";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"l\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_linetoArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) {
              return args.map( function( arg ) {
                return {
                  cmd: 'lineToRelative',
                  args: [ arg.x, arg.y ]
                };
              } );
            })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_linetoArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_coordinatePair();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_linetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return [ a ].concat( b ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_coordinatePair();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [ a ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_horizontalLineto() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 72 ) {
          result0 = "H";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"H\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_horizontalLinetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) {
            return args.map( function( arg ) {
              return {
                cmd: 'horizontalLineTo',
                args: [ arg ]
              }
            } );
          })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 104 ) {
            result0 = "h";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"h\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_horizontalLinetoArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) {
              return args.map( function( arg ) {
                return {
                  cmd: 'horizontalLineToRelative',
                  args: [ arg ]
                }
              } );
            })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_horizontalLinetoArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_number();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_horizontalLinetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return [ a ].concat( b ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_number();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [ a ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_verticalLineto() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 86 ) {
          result0 = "V";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"V\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_verticalLinetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) {
            return args.map( function( arg ) {
              return {
                cmd: 'verticalLineTo',
                args: [ arg ]
              }
            } );
          })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 118 ) {
            result0 = "v";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"v\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_verticalLinetoArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) {
              return args.map( function( arg ) {
                return {
                  cmd: 'verticalLineToRelative',
                  args: [ arg ]
                }
              } );
            })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_verticalLinetoArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_number();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_verticalLinetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return [ a ].concat( b ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_number();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [ a ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_curveto() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 67 ) {
          result0 = "C";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"C\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_curvetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) {
            return args.map( function( arg ) {
              return {
                cmd: 'cubicCurveTo',
                args: arg
              }
            } );
          })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 99 ) {
            result0 = "c";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"c\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_curvetoArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) {
              return args.map( function( arg ) {
                return {
                  cmd: 'cubicCurveToRelative',
                  args: arg
                }
              } );
            })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_curvetoArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_curvetoArgument();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_curvetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, list ) { return [ a ].concat( list ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_curvetoArgument();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [ a ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_curvetoArgument() {
        var result0, result1, result2, result3, result4;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_coordinatePair();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_coordinatePair();
            if ( result2 !== null ) {
              result3 = parse_commaWsp();
              result3 = result3 !== null ? result3 : "";
              if ( result3 !== null ) {
                result4 = parse_coordinatePair();
                if ( result4 !== null ) {
                  result0 = [ result0, result1, result2, result3, result4 ];
                }
                else {
                  result0 = null;
                  pos = pos1;
                }
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b, c ) { return [ a.x, a.y, b.x, b.y, c.x, c.y ]; })( pos0, result0[ 0 ], result0[ 2 ], result0[ 4 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_smoothCurveto() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 83 ) {
          result0 = "S";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"S\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_smoothCurvetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) {
            return args.map( function( arg ) {
              return {
                cmd: 'smoothCubicCurveTo',
                args: arg
              }
            } );
          })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 115 ) {
            result0 = "s";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"s\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_smoothCurvetoArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) {
              return args.map( function( arg ) {
                return {
                  cmd: 'smoothCubicCurveToRelative',
                  args: arg
                }
              } );
            })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_smoothCurvetoArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_smoothCurvetoArgument();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_smoothCurvetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, list ) { return [ a ].concat( list ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_smoothCurvetoArgument();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [ a ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_smoothCurvetoArgument() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_coordinatePair();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_coordinatePair();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return [ a.x, a.y, b.x, b.y ]; })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_quadraticBezierCurveto() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 81 ) {
          result0 = "Q";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"Q\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_quadraticBezierCurvetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) {
            return args.map( function( arg ) {
              return {
                cmd: 'quadraticCurveTo',
                args: arg
              }
            } );
          })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 113 ) {
            result0 = "q";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"q\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_quadraticBezierCurvetoArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) {
              return args.map( function( arg ) {
                return {
                  cmd: 'quadraticCurveToRelative',
                  args: arg
                }
              } );
            })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_quadraticBezierCurvetoArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_quadraticBezierCurvetoArgument();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_quadraticBezierCurvetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, list ) { return [ a ].concat( list ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_quadraticBezierCurvetoArgument();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [ a ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_quadraticBezierCurvetoArgument() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_coordinatePair();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_coordinatePair();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return [ a.x, a.y, b.x, b.y ]; })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_smoothQuadraticBezierCurveto() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 84 ) {
          result0 = "T";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"T\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_smoothQuadraticBezierCurvetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) {
            return args.map( function( arg ) {
              return {
                cmd: 'smoothQuadraticCurveTo',
                args: [ arg.x, arg.y ]
              }
            } );
          })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 116 ) {
            result0 = "t";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"t\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_smoothQuadraticBezierCurvetoArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) {
              return args.map( function( arg ) {
                return {
                  cmd: 'smoothQuadraticCurveToRelative',
                  args: [ arg.x, arg.y ]
                }
              } );
            })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_smoothQuadraticBezierCurvetoArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_coordinatePair();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_smoothQuadraticBezierCurvetoArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, list ) { return [ a ].concat( list ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_coordinatePair();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [ a ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_ellipticalArc() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 65 ) {
          result0 = "A";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"A\"" );
          }
        }
        if ( result0 !== null ) {
          result1 = [];
          result2 = parse_wsp();
          while ( result2 !== null ) {
            result1.push( result2 );
            result2 = parse_wsp();
          }
          if ( result1 !== null ) {
            result2 = parse_ellipticalArcArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, args ) {
            return args.map( function( arg ) {
              return {
                cmd: 'ellipticalArcTo',
                args: arg
              }
            } );
          })( pos0, result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          if ( input.charCodeAt( pos ) === 97 ) {
            result0 = "a";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"a\"" );
            }
          }
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result2 = parse_ellipticalArcArgumentSequence();
              if ( result2 !== null ) {
                result0 = [ result0, result1, result2 ];
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, args ) {
              return args.map( function( arg ) {
                return {
                  cmd: 'ellipticalArcToRelative',
                  args: arg
                }
              } );
            })( pos0, result0[ 2 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_ellipticalArcArgumentSequence() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_ellipticalArcArgument();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_ellipticalArcArgumentSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, list ) { return [ a ].concat( list ); })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_ellipticalArcArgument();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [ a ]; })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_ellipticalArcArgument() {
        var result0, result1, result2, result3, result4, result5, result6, result7, result8, result9, result10;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_nonnegativeNumber();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_nonnegativeNumber();
            if ( result2 !== null ) {
              result3 = parse_commaWsp();
              result3 = result3 !== null ? result3 : "";
              if ( result3 !== null ) {
                result4 = parse_number();
                if ( result4 !== null ) {
                  result5 = parse_commaWsp();
                  if ( result5 !== null ) {
                    result6 = parse_flag();
                    if ( result6 !== null ) {
                      result7 = parse_commaWsp();
                      result7 = result7 !== null ? result7 : "";
                      if ( result7 !== null ) {
                        result8 = parse_flag();
                        if ( result8 !== null ) {
                          result9 = parse_commaWsp();
                          result9 = result9 !== null ? result9 : "";
                          if ( result9 !== null ) {
                            result10 = parse_coordinatePair();
                            if ( result10 !== null ) {
                              result0 = [ result0, result1, result2, result3, result4, result5, result6, result7, result8, result9, result10 ];
                            }
                            else {
                              result0 = null;
                              pos = pos1;
                            }
                          }
                          else {
                            result0 = null;
                            pos = pos1;
                          }
                        }
                        else {
                          result0 = null;
                          pos = pos1;
                        }
                      }
                      else {
                        result0 = null;
                        pos = pos1;
                      }
                    }
                    else {
                      result0 = null;
                      pos = pos1;
                    }
                  }
                  else {
                    result0 = null;
                    pos = pos1;
                  }
                }
                else {
                  result0 = null;
                  pos = pos1;
                }
              }
              else {
                result0 = null;
                pos = pos1;
              }
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, rx, ry, rot, largeArc, sweep, to ) { return [ rx, ry, rot, largeArc, sweep, to.x, to.y ] })( pos0, result0[ 0 ], result0[ 2 ], result0[ 4 ], result0[ 6 ], result0[ 8 ], result0[ 10 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_coordinatePair() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_number();
        if ( result0 !== null ) {
          result1 = parse_commaWsp();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_number();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return { x: a, y: b }; })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_nonnegativeNumber() {
        var result0;
        var pos0;

        pos0 = pos;
        result0 = parse_floatingPointConstant();
        if ( result0 !== null ) {
          result0 = (function( offset, number ) { return parseFloat( number, 10 ); })( pos0, result0 );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_digitSequence();
          if ( result0 !== null ) {
            result0 = (function( offset, number ) { return parseInt( number, 10 ); })( pos0, result0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_number() {
        var result0, result1;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_sign();
        result0 = result0 !== null ? result0 : "";
        if ( result0 !== null ) {
          result1 = parse_floatingPointConstant();
          if ( result1 !== null ) {
            result0 = [ result0, result1 ];
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, sign, number ) { return parseFloat( sign + number, 10 ); })( pos0, result0[ 0 ], result0[ 1 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          result0 = parse_sign();
          result0 = result0 !== null ? result0 : "";
          if ( result0 !== null ) {
            result1 = parse_digitSequence();
            if ( result1 !== null ) {
              result0 = [ result0, result1 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, sign, number ) { return parseInt( sign + number, 10 ); })( pos0, result0[ 0 ], result0[ 1 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_flag() {
        var result0;
        var pos0;

        pos0 = pos;
        if ( input.charCodeAt( pos ) === 48 ) {
          result0 = "0";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"0\"" );
          }
        }
        if ( result0 !== null ) {
          result0 = (function( offset ) { return false; })( pos0 );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          if ( input.charCodeAt( pos ) === 49 ) {
            result0 = "1";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"1\"" );
            }
          }
          if ( result0 !== null ) {
            result0 = (function( offset ) { return true; })( pos0 );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_commaWsp() {
        var result0, result1, result2, result3;
        var pos0;

        pos0 = pos;
        result1 = parse_wsp();
        if ( result1 !== null ) {
          result0 = [];
          while ( result1 !== null ) {
            result0.push( result1 );
            result1 = parse_wsp();
          }
        }
        else {
          result0 = null;
        }
        if ( result0 !== null ) {
          result1 = parse_comma();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = [];
            result3 = parse_wsp();
            while ( result3 !== null ) {
              result2.push( result3 );
              result3 = parse_wsp();
            }
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos0;
            }
          }
          else {
            result0 = null;
            pos = pos0;
          }
        }
        else {
          result0 = null;
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_comma();
          if ( result0 !== null ) {
            result1 = [];
            result2 = parse_wsp();
            while ( result2 !== null ) {
              result1.push( result2 );
              result2 = parse_wsp();
            }
            if ( result1 !== null ) {
              result0 = [ result0, result1 ];
            }
            else {
              result0 = null;
              pos = pos0;
            }
          }
          else {
            result0 = null;
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_comma() {
        var result0;

        if ( input.charCodeAt( pos ) === 44 ) {
          result0 = ",";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\",\"" );
          }
        }
        return result0;
      }

      function parse_floatingPointConstant() {
        var result0, result1;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_fractionalConstant();
        if ( result0 !== null ) {
          result1 = parse_exponent();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result0 = [ result0, result1 ];
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return a + b; })( pos0, result0[ 0 ], result0[ 1 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          result0 = parse_digitSequence();
          if ( result0 !== null ) {
            result1 = parse_exponent();
            if ( result1 !== null ) {
              result0 = [ result0, result1 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, a, b ) { return a + b; })( pos0, result0[ 0 ], result0[ 1 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_fractionalConstant() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_digitSequence();
        result0 = result0 !== null ? result0 : "";
        if ( result0 !== null ) {
          if ( input.charCodeAt( pos ) === 46 ) {
            result1 = ".";
            pos++;
          }
          else {
            result1 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\".\"" );
            }
          }
          if ( result1 !== null ) {
            result2 = parse_digitSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return a + '.' + b; })( pos0, result0[ 0 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          pos1 = pos;
          result0 = parse_digitSequence();
          if ( result0 !== null ) {
            if ( input.charCodeAt( pos ) === 46 ) {
              result1 = ".";
              pos++;
            }
            else {
              result1 = null;
              if ( reportFailures === 0 ) {
                matchFailed( "\".\"" );
              }
            }
            if ( result1 !== null ) {
              result0 = [ result0, result1 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return a })( pos0, result0[ 0 ] );
          }
          if ( result0 === null ) {
            pos = pos0;
          }
        }
        return result0;
      }

      function parse_exponent() {
        var result0, result1, result2;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        if ( input.charCodeAt( pos ) === 101 ) {
          result0 = "e";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"e\"" );
          }
        }
        if ( result0 === null ) {
          if ( input.charCodeAt( pos ) === 69 ) {
            result0 = "E";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"E\"" );
            }
          }
        }
        if ( result0 !== null ) {
          result1 = parse_sign();
          result1 = result1 !== null ? result1 : "";
          if ( result1 !== null ) {
            result2 = parse_digitSequence();
            if ( result2 !== null ) {
              result0 = [ result0, result1, result2 ];
            }
            else {
              result0 = null;
              pos = pos1;
            }
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b, c ) { return a + b + c; })( pos0, result0[ 0 ], result0[ 1 ], result0[ 2 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        return result0;
      }

      function parse_sign() {
        var result0;

        if ( input.charCodeAt( pos ) === 43 ) {
          result0 = "+";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\"+\"" );
          }
        }
        if ( result0 === null ) {
          if ( input.charCodeAt( pos ) === 45 ) {
            result0 = "-";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"-\"" );
            }
          }
        }
        return result0;
      }

      function parse_digitSequence() {
        var result0, result1;
        var pos0, pos1;

        pos0 = pos;
        pos1 = pos;
        result0 = parse_digit();
        if ( result0 !== null ) {
          result1 = parse_digitSequence();
          if ( result1 !== null ) {
            result0 = [ result0, result1 ];
          }
          else {
            result0 = null;
            pos = pos1;
          }
        }
        else {
          result0 = null;
          pos = pos1;
        }
        if ( result0 !== null ) {
          result0 = (function( offset, a, b ) { return a + b; })( pos0, result0[ 0 ], result0[ 1 ] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          result0 = parse_digit();
        }
        return result0;
      }

      function parse_digit() {
        var result0;

        if ( /^[0-9]/.test( input.charAt( pos ) ) ) {
          result0 = input.charAt( pos );
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "[0-9]" );
          }
        }
        return result0;
      }

      function parse_wsp() {
        var result0;

        if ( input.charCodeAt( pos ) === 32 ) {
          result0 = " ";
          pos++;
        }
        else {
          result0 = null;
          if ( reportFailures === 0 ) {
            matchFailed( "\" \"" );
          }
        }
        if ( result0 === null ) {
          if ( input.charCodeAt( pos ) === 9 ) {
            result0 = "\t";
            pos++;
          }
          else {
            result0 = null;
            if ( reportFailures === 0 ) {
              matchFailed( "\"\\t\"" );
            }
          }
          if ( result0 === null ) {
            if ( input.charCodeAt( pos ) === 13 ) {
              result0 = "\r";
              pos++;
            }
            else {
              result0 = null;
              if ( reportFailures === 0 ) {
                matchFailed( "\"\\r\"" );
              }
            }
            if ( result0 === null ) {
              if ( input.charCodeAt( pos ) === 10 ) {
                result0 = "\n";
                pos++;
              }
              else {
                result0 = null;
                if ( reportFailures === 0 ) {
                  matchFailed( "\"\\n\"" );
                }
              }
            }
          }
        }
        return result0;
      }


      function cleanupExpected( expected ) {
        expected.sort();

        var lastExpected = null;
        var cleanExpected = [];
        for ( var i = 0; i < expected.length; i++ ) {
          if ( expected[ i ] !== lastExpected ) {
            cleanExpected.push( expected[ i ] );
            lastExpected = expected[ i ];
          }
        }
        return cleanExpected;
      }

      function computeErrorPosition() {
        /*
         * The first idea was to use |String.split| to break the input up to the
         * error position along newlines and derive the line and column from
         * there. However IE's |split| implementation is so broken that it was
         * enough to prevent it.
         */

        var line = 1;
        var column = 1;
        var seenCR = false;

        for ( var i = 0; i < Math.max( pos, rightmostFailuresPos ); i++ ) {
          var ch = input.charAt( i );
          if ( ch === "\n" ) {
            if ( !seenCR ) { line++; }
            column = 1;
            seenCR = false;
          }
          else if ( ch === "\r" || ch === "\u2028" || ch === "\u2029" ) {
            line++;
            column = 1;
            seenCR = true;
          }
          else {
            column++;
            seenCR = false;
          }
        }

        return { line: line, column: column };
      }


      function createMoveTo( args, isRelative ) {
        var result = [ {
          cmd: isRelative ? 'moveToRelative' : 'moveTo',
          args: [ args[ 0 ].x, args[ 0 ].y ]
        } ];

        // any other coordinate pairs are implicit lineTos
        if ( args.length > 1 ) {
          for ( var i = 1; i < args.length; i++ ) {
            result.push( {
              cmd: isRelative ? 'lineToRelative' : 'lineTo',
              args: [ args[ i ].x, args[ i ].y ]
            } );
          }
        }
        return result;
      }


      var result = parseFunctions[ startRule ]();

      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos === input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos < input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos === 0|
       *   - |rightmostFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if ( result === null || pos !== input.length ) {
        var offset = Math.max( pos, rightmostFailuresPos );
        var found = offset < input.length ? input.charAt( offset ) : null;
        var errorPosition = computeErrorPosition();

        throw new this.SyntaxError(
          cleanupExpected( rightmostFailuresExpected ),
          found,
          offset,
          errorPosition.line,
          errorPosition.column
        );
      }

      return result;
    },

    /* Returns the parser source code. */
    toSource: function() { return this._source; }
  };

  /* Thrown when a parser encounters a syntax error. */

  result.SyntaxError = function( expected, found, offset, line, column ) {
    function buildMessage( expected, found ) {
      var expectedHumanized, foundHumanized;

      switch( expected.length ) {
        case 0:
          expectedHumanized = "end of input";
          break;
        case 1:
          expectedHumanized = expected[ 0 ];
          break;
        default:
          expectedHumanized = expected.slice( 0, expected.length - 1 ).join( ", " )
                              + " or "
                              + expected[ expected.length - 1 ];
      }

      foundHumanized = found ? quote( found ) : "end of input";

      return "Expected " + expectedHumanized + " but " + foundHumanized + " found.";
    }

    this.name = "SyntaxError";
    this.expected = expected;
    this.found = found;
    this.message = buildMessage( expected, found );
    this.offset = offset;
    this.line = line;
    this.column = column;
  };

  result.SyntaxError.prototype = Error.prototype;

  kite.register( 'svgPath', result );
  return kite.svgPath;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Basic 4-dimensional vector, represented as (x,y).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Vector4',['require','DOT/dot','PHET_CORE/inherit','PHET_CORE/Poolable','DOT/Util'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  require( 'DOT/Util' );
  // require( 'DOT/Vector3' ); // commented out so Require.js doesn't complain about the circular dependency

  /**
   * Creates a 4-dimensional vector with the specified X, Y, Z and W values.
   * @constructor
   * @public
   *
   * @param {number} [x] - X coordinate, defaults to 0 if not provided
   * @param {number} [y] - Y coordinate, defaults to 0 if not provided
   * @param {number} [z] - Z coordinate, defaults to 0 if not provided
   * @param {number} [w] - W coordinate, defaults to 1 if not provided (convenience for homogeneous coordinates)
   */
  function Vector4( x, y, z, w ) {
    // @public {number} - The X coordinate of the vector.
    this.x = x !== undefined ? x : 0;

    // @public {number} - The Y coordinate of the vector.
    this.y = y !== undefined ? y : 0;

    // @public {number} - The Z coordinate of the vector.
    this.z = z !== undefined ? z : 0;

    // @public {number} - The W coordinate of the vector. Default is 1, for ease with homogeneous coordinates.
    this.w = w !== undefined ? w : 1;

    assert && assert( typeof this.x === 'number', 'x needs to be a number' );
    assert && assert( typeof this.y === 'number', 'y needs to be a number' );
    assert && assert( typeof this.z === 'number', 'z needs to be a number' );
    assert && assert( typeof this.w === 'number', 'w needs to be a number' );

    phetAllocation && phetAllocation( 'Vector4' );
  }

  dot.register( 'Vector4', Vector4 );

  inherit( Object, Vector4, {
    // @public (read-only) - Helps to identify the dimension of the vector
    isVector4: true,
    dimension: 4,

    /**
     * The magnitude (Euclidean/L2 Norm) of this vector, i.e. $\sqrt{x^2+y^2+z^2+w^2}$.
     * @public
     *
     * @returns {number}
     */
    magnitude: function() {
      return Math.sqrt( this.magnitudeSquared() );
    },

    /**
     * The squared magnitude (square of the Euclidean/L2 Norm) of this vector, i.e. $x^2+y^2+z^2+w^2$.
     * @public
     *
     * @returns {number}
     */
    magnitudeSquared: function() {
      this.dot( this );
    },

    /**
     * The Euclidean distance between this vector (treated as a point) and another point.
     * @public
     *
     * @param {Vector4} point
     * @returns {number}
     */
    distance: function( point ) {
      return this.minus( point ).magnitude();
    },

    /**
     * The Euclidean distance between this vector (treated as a point) and another point (x,y,z,w).
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {number}
     */
    distanceXYZW: function( x, y, z, w ) {
      var dx = this.x - x;
      var dy = this.y - y;
      var dz = this.z - z;
      var dw = this.w - w;
      return Math.sqrt( dx * dx + dy * dy + dz * dz + dw * dw );
    },

    /**
     * The squared Euclidean distance between this vector (treated as a point) and another point.
     * @public
     *
     * @param {Vector4} point
     * @returns {number}
     */
    distanceSquared: function( point ) {
      return this.minus( point ).magnitudeSquared();
    },

    /**
     * The squared Euclidean distance between this vector (treated as a point) and another point (x,y,z,w).
     * @public
     *
     * @param {Vector4} point
     * @returns {number}
     */
    distanceSquaredXYZW: function( x, y, z, w ) {
      var dx = this.x - x;
      var dy = this.y - y;
      var dz = this.z - z;
      var dw = this.w - w;
      return dx * dx + dy * dy + dz * dz + dw * dw;
    },

    /**
     * The dot-product (Euclidean inner product) between this vector and another vector v.
     * @public
     *
     * @param {Vector4} v
     * @returns {number}
     */
    dot: function( v ) {
      return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
    },

    /**
     * The dot-product (Euclidean inner product) between this vector and another vector (x,y,z,w).
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {number}
     */
    dotXYZW: function( x, y, z, w ) {
      return this.x * x + this.y * y + this.z * z + this.w * w;
    },

    /**
     * The angle between this vector and another vector, in the range $\theta\in[0, \pi]$.
     * @public
     *
     * Equal to $\theta = \cos^{-1}( \hat{u} \cdot \hat{v} )$ where $\hat{u}$ is this vector (normalized) and $\hat{v}$
     * is the input vector (normalized).
     *
     * @param {Vector4} v
     * @returns {number}
     */
    angleBetween: function( v ) {
      return Math.acos( dot.clamp( this.normalized().dot( v.normalized() ), -1, 1 ) );
    },

    /**
     * Exact equality comparison between this vector and another vector.
     * @public
     *
     * @param {Vector4} other
     * @returns {boolean} - Whether the two vectors have equal components
     */
    equals: function( other ) {
      return this.x === other.x && this.y === other.y && this.z === other.z && this.w === other.w;
    },

    /**
     * Approximate equality comparison between this vector and another vector.
     * @public
     *
     * @param {Vector4} other
     * @param {number} epsilon
     * @returns {boolean} - Whether difference between the two vectors has no component with an absolute value greater
     *                      than epsilon.
     */
    equalsEpsilon: function( other, epsilon ) {
      if ( !epsilon ) {
        epsilon = 0;
      }
      return Math.abs( this.x - other.x ) + Math.abs( this.y - other.y ) + Math.abs( this.z - other.z ) + Math.abs( this.w - other.w ) <= epsilon;
    },

    /**
     * Whether all of the components are numbers (not NaN) that are not infinity or -infinity.
     * @public
     *
     * @returns {boolean}
     */
    isFinite: function() {
      return isFinite( this.x ) && isFinite( this.y ) && isFinite( this.z ) && isFinite( this.w );
    },

    /*---------------------------------------------------------------------------*
     * Immutables
     *---------------------------------------------------------------------------*/

    /**
     * Creates a copy of this vector, or if a vector is passed in, set that vector's values to ours.
     * @public
     *
     * This is the immutable form of the function set(), if a vector is provided. This will return a new vector, and
     * will not modify this vector.
     *
     * @param {Vector4} [vector] - If not provided, creates a new Vector4 with filled in values. Otherwise, fills in the
     *                             values of the provided vector so that it equals this vector.
     * @returns {Vector4}
     */
    copy: function( vector ) {
      if ( vector ) {
        return vector.set( this );
      }
      else {
        return new Vector4( this.x, this.y, this.z, this.w );
      }
    },

    /**
     * Normalized (re-scaled) copy of this vector such that its magnitude is 1. If its initial magnitude is zero, an
     * error is thrown.
     * @public
     *
     * This is the immutable form of the function normalize(). This will return a new vector, and will not modify this
     * vector.
     *
     * @returns {Vector4}
     */
    normalized: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( 'Cannot normalize a zero-magnitude vector' );
      }
      else {
        return new Vector4( this.x / mag, this.y / mag, this.z / mag, this.w / mag );
      }
    },

    /**
     * Re-scaled copy of this vector such that it has the desired magnitude. If its initial magnitude is zero, an error
     * is thrown. If the passed-in magnitude is negative, the direction of the resulting vector will be reversed.
     * @public
     *
     * This is the immutable form of the function setMagnitude(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} magnitude
     * @returns {Vector4}
     */
    withMagnitude: function( magnitude ) {
      return this.copy().setMagnitude( magnitude );
    },

    /**
     * Copy of this vector, scaled by the desired scalar value.
     * @public
     *
     * This is the immutable form of the function multiplyScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    timesScalar: function( scalar ) {
      return new Vector4( this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar );
    },

    /**
     * Same as timesScalar.
     * @public
     *
     * This is the immutable form of the function multiply(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    times: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.timesScalar( scalar );
    },

    /**
     * Copy of this vector, multiplied component-wise by the passed-in vector v.
     * @public
     *
     * This is the immutable form of the function componentMultiply(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector4} v
     * @returns {Vector4}
     */
    componentTimes: function( v ) {
      return new Vector4( this.x * v.x, this.y * v.y, this.z * v.z, this.w * v.w );
    },

    /**
     * Addition of this vector and another vector, returning a copy.
     * @public
     *
     * This is the immutable form of the function add(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector4} v
     * @returns {Vector4}
     */
    plus: function( v ) {
      return new Vector4( this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w );
    },

    /**
     * Addition of this vector and another vector (x,y,z,w), returning a copy.
     * @public
     *
     * This is the immutable form of the function addXYZW(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {Vector4}
     */
    plusXYZW: function( x, y, z, w ) {
      return new Vector4( this.x + x, this.y + y, this.z + z, this.w + w );
    },

    /**
     * Addition of this vector with a scalar (adds the scalar to every component), returning a copy.
     * @public
     *
     * This is the immutable form of the function addScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    plusScalar: function( scalar ) {
      return new Vector4( this.x + scalar, this.y + scalar, this.z + scalar, this.w + scalar );
    },

    /**
     * Subtraction of this vector by another vector v, returning a copy.
     * @public
     *
     * This is the immutable form of the function subtract(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector4} v
     * @returns {Vector4}
     */
    minus: function( v ) {
      return new Vector4( this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w );
    },

    /**
     * Subtraction of this vector by another vector (x,y,z,w), returning a copy.
     * @public
     *
     * This is the immutable form of the function subtractXYZW(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {Vector4}
     */
    minusXYZW: function( x, y, z, w ) {
      return new Vector4( this.x - x, this.y - y, this.z - z, this.w - w );
    },

    /**
     * Subtraction of this vector by a scalar (subtracts the scalar from every component), returning a copy.
     * @public
     *
     * This is the immutable form of the function subtractScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    minusScalar: function( scalar ) {
      return new Vector4( this.x - scalar, this.y - scalar, this.z - scalar, this.w - scalar );
    },

    /**
     * Division of this vector by a scalar (divides every component by the scalar), returning a copy.
     * @public
     *
     * This is the immutable form of the function divideScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    dividedScalar: function( scalar ) {
      return new Vector4( this.x / scalar, this.y / scalar, this.z / scalar, this.w / scalar );
    },

    /**
     * Negated copy of this vector (multiplies every component by -1).
     * @public
     *
     * This is the immutable form of the function negate(). This will return a new vector, and will not modify
     * this vector.
     *
     * @returns {Vector4}
     */
    negated: function() {
      return new Vector4( -this.x, -this.y, -this.z, -this.w );
    },

    /**
     * A linear interpolation between this vector (ratio=0) and another vector (ratio=1).
     * @public
     *
     * @param {Vector4} vector
     * @param {number} ratio - Not necessarily constrained in [0, 1]
     * @returns {Vector4}
     */
    blend: function( vector, ratio ) {
      return this.plus( vector.minus( this ).times( ratio ) );
    },

    /**
     * The average (midpoint) between this vector and another vector.
     * @public
     *
     * @param {Vector4} vector
     * @returns {Vector4}
     */
    average: function( vector ) {
      return this.blend( vector, 0.5 );
    },

    /**
     * Debugging string for the vector.
     * @public
     *
     * @returns {string}
     */
    toString: function() {
      return 'Vector4(' + this.x + ', ' + this.y + ', ' + this.z + ', ' + this.w + ')';
    },

    /**
     * Converts this to a 3-dimensional vector, discarding the w-component.
     * @public
     *
     * @returns {Vector3}
     */
    toVector3: function() {
      return new dot.Vector3( this.x, this.y, this.z );
    },

    /*---------------------------------------------------------------------------*
     * Mutables
     * - all mutation should go through setXYZW / setX / setY / setZ / setW
     *---------------------------------------------------------------------------*/

    /**
     * Sets all of the components of this vector, returning this.
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {Vector4}
     */
    setXYZW: function( x, y, z, w ) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
      return this;
    },

    /**
     * Sets the x-component of this vector, returning this.
     * @public
     *
     * @param {number} x
     * @returns {Vector4}
     */
    setX: function( x ) {
      this.x = x;
      return this;
    },

    /**
     * Sets the y-component of this vector, returning this.
     * @public
     *
     * @param {number} y
     * @returns {Vector4}
     */
    setY: function( y ) {
      this.y = y;
      return this;
    },

    /**
     * Sets the z-component of this vector, returning this.
     * @public
     *
     * @param {number} z
     * @returns {Vector4}
     */
    setZ: function( z ) {
      this.z = z;
      return this;
    },

    /**
     * Sets the w-component of this vector, returning this.
     * @public
     *
     * @param {number} w
     * @returns {Vector4}
     */
    setW: function( w ) {
      this.w = w;
      return this;
    },

    /**
     * Sets this vector to be a copy of another vector.
     * @public
     *
     * This is the mutable form of the function copy(). This will mutate (change) this vector, in addition to returning
     * this vector itself.
     *
     * @param {Vector4} v
     * @returns {Vector4}
     */
    set: function( v ) {
      return this.setXYZW( v.x, v.y, v.z, v.w );
    },

    /**
     * Sets the magnitude of this vector. If the passed-in magnitude is negative, this flips the vector and sets its
     * magnitude to abs( magnitude ).
     * @public
     *
     * This is the mutable form of the function withMagnitude(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} magnitude
     * @returns {Vector4}
     */
    setMagnitude: function( magnitude ) {
      var scale = magnitude / this.magnitude();
      return this.multiplyScalar( scale );
    },

    /**
     * Adds another vector to this vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function plus(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector4} v
     * @returns {Vector4}
     */
    add: function( v ) {
      return this.setXYZW( this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w );
    },

    /**
     * Adds another vector (x,y,z,w) to this vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function plusXYZW(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {Vector4}
     */
    addXYZW: function( x, y, z, w ) {
      return this.setXYZW( this.x + x, this.y + y, this.z + z, this.w + w );
    },

    /**
     * Adds a scalar to this vector (added to every component), changing this vector.
     * @public
     *
     * This is the mutable form of the function plusScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    addScalar: function( scalar ) {
      return this.setXYZW( this.x + scalar, this.y + scalar, this.z + scalar, this.w + scalar );
    },

    /**
     * Subtracts this vector by another vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function minus(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector4} v
     * @returns {Vector4}
     */
    subtract: function( v ) {
      return this.setXYZW( this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w );
    },

    /**
     * Subtracts this vector by another vector (x,y,z,w), changing this vector.
     * @public
     *
     * This is the mutable form of the function minusXYZW(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {Vector4}
     */
    subtractXYZW: function( x, y, z, w ) {
      return this.setXYZW( this.x - x, this.y - y, this.z - z, this.w - w );
    },

    /**
     * Subtracts this vector by a scalar (subtracts each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function minusScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    subtractScalar: function( scalar ) {
      return this.setXYZW( this.x - scalar, this.y - scalar, this.z - scalar, this.w - scalar );
    },

    /**
     * Multiplies this vector by a scalar (multiplies each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function timesScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    multiplyScalar: function( scalar ) {
      return this.setXYZW( this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar );
    },

    /**
     * Multiplies this vector by a scalar (multiplies each component by the scalar), changing this vector.
     * Same as multiplyScalar.
     * @public
     *
     * This is the mutable form of the function times(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    multiply: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.multiplyScalar( scalar );
    },

    /**
     * Multiplies this vector by another vector component-wise, changing this vector.
     * @public
     *
     * This is the mutable form of the function componentTimes(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector4} v
     * @returns {Vector4}
     */
    componentMultiply: function( v ) {
      return this.setXYZW( this.x * v.x, this.y * v.y, this.z * v.z, this.w * v.w );
    },

    /**
     * Divides this vector by a scalar (divides each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function dividedScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector4}
     */
    divideScalar: function( scalar ) {
      return this.setXYZW( this.x / scalar, this.y / scalar, this.z / scalar, this.w / scalar );
    },

    /**
     * Negates this vector (multiplies each component by -1), changing this vector.
     * @public
     *
     * This is the mutable form of the function negated(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @returns {Vector4}
     */
    negate: function() {
      return this.setXYZW( -this.x, -this.y, -this.z, -this.w );
    },

    /**
     * Normalizes this vector (rescales to where the magnitude is 1), changing this vector.
     * @public
     *
     * This is the mutable form of the function normalized(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @returns {Vector4}
     */
    normalize: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( 'Cannot normalize a zero-magnitude vector' );
      }
      else {
        return this.divideScalar( mag );
      }
      return this;
    }
  } );

  // Sets up pooling on Vector4
  Poolable.mixin( Vector4, {
    defaultFactory: function() { return new Vector4(); },
    constructorDuplicateFactory: function( pool ) {
      return function( x, y, z, w ) {
        if ( pool.length ) {
          return pool.pop().setXY( x, y, z, w );
        }
        else {
          return new Vector4( x, y, z, w );
        }
      };
    }
  } );

  /*---------------------------------------------------------------------------*
   * Immutable Vector form
   *---------------------------------------------------------------------------*/

  // @private
  Vector4.Immutable = function( x, y, z, w ) {
    this.x = x !== undefined ? x : 0;
    this.y = y !== undefined ? y : 0;
    this.z = z !== undefined ? z : 0;
    this.w = w !== undefined ? w : 1;
  };
  var Immutable = Vector4.Immutable;

  inherit( Vector4, Immutable );

  // throw errors whenever a mutable method is called on our immutable vector
  Immutable.mutableOverrideHelper = function( mutableFunctionName ) {
    Immutable.prototype[ mutableFunctionName ] = function() {
      throw new Error( 'Cannot call mutable method \'' + mutableFunctionName + '\' on immutable Vector4' );
    };
  };

  // TODO: better way to handle this list?
  Immutable.mutableOverrideHelper( 'setXYZW' );
  Immutable.mutableOverrideHelper( 'setX' );
  Immutable.mutableOverrideHelper( 'setY' );
  Immutable.mutableOverrideHelper( 'setZ' );
  Immutable.mutableOverrideHelper( 'setW' );

  // @public {Vector4} - helpful immutable constants
  Vector4.ZERO = assert ? new Immutable( 0, 0, 0, 0 ) : new Vector4( 0, 0, 0, 0 );
  Vector4.X_UNIT = assert ? new Immutable( 1, 0, 0, 0 ) : new Vector4( 1, 0, 0, 0 );
  Vector4.Y_UNIT = assert ? new Immutable( 0, 1, 0, 0 ) : new Vector4( 0, 1, 0, 0 );
  Vector4.Z_UNIT = assert ? new Immutable( 0, 0, 1, 0 ) : new Vector4( 0, 0, 1, 0 );
  Vector4.W_UNIT = assert ? new Immutable( 0, 0, 0, 1 ) : new Vector4( 0, 0, 0, 1 );

  return Vector4;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Basic 3-dimensional vector, represented as (x,y).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Vector3',['require','DOT/dot','PHET_CORE/inherit','PHET_CORE/Poolable','DOT/Util','DOT/Vector2','DOT/Vector4'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  require( 'DOT/Util' );
  require( 'DOT/Vector2' );
  require( 'DOT/Vector4' );

  /**
   * Creates a 3-dimensional vector with the specified X, Y and Z values.
   * @constructor
   * @public
   *
   * @param {number} [x] - X coordinate, defaults to 0 if not provided
   * @param {number} [y] - Y coordinate, defaults to 0 if not provided
   * @param {number} [z] - Z coordinate, defaults to 0 if not provided
   */
  function Vector3( x, y, z ) {
    // @public {number} - The X coordinate of the vector.
    this.x = x !== undefined ? x : 0;

    // @public {number} - The Y coordinate of the vector.
    this.y = y !== undefined ? y : 0;

    // @public {number} - The Z coordinate of the vector.
    this.z = z !== undefined ? z : 0;

    assert && assert( typeof this.x === 'number', 'x needs to be a number' );
    assert && assert( typeof this.y === 'number', 'y needs to be a number' );
    assert && assert( typeof this.z === 'number', 'z needs to be a number' );

    phetAllocation && phetAllocation( 'Vector3' );
  }

  dot.register( 'Vector3', Vector3 );

  inherit( Object, Vector3, {
    // @public (read-only) - Helps to identify the dimension of the vector
    isVector3: true,
    dimension: 3,

    /**
     * The magnitude (Euclidean/L2 Norm) of this vector, i.e. $\sqrt{x^2+y^2+z^2}$.
     * @public
     *
     * @returns {number}
     */
    magnitude: function() {
      return Math.sqrt( this.magnitudeSquared() );
    },

    /**
     * T squared magnitude (square of the Euclidean/L2 Norm) of this vector, i.e. $x^2+y^2+z^2$.
     * @public
     *
     * @returns {number}
     */
    magnitudeSquared: function() {
      return this.dot( this );
    },

    /**
     * The Euclidean distance between this vector (treated as a point) and another point.
     * @public
     *
     * @param {Vector3} point
     * @returns {number}
     */
    distance: function( point ) {
      return Math.sqrt( this.distanceSquared( point ) );
    },

    /**
     * The Euclidean distance between this vector (treated as a point) and another point (x,y,z).
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number}
     */
    distanceXYZ: function( x, y, z ) {
      var dx = this.x - x;
      var dy = this.y - y;
      var dz = this.z - z;
      return Math.sqrt( dx * dx + dy * dy + dz * dz );
    },

    /**
     * The squared Euclidean distance between this vector (treated as a point) and another point.
     * @public
     *
     * @param {Vector3} point
     * @returns {number}
     */
    distanceSquared: function( point ) {
      var dx = this.x - point.x;
      var dy = this.y - point.y;
      var dz = this.z - point.z;
      return dx * dx + dy * dy + dz * dz;
    },

    /**
     * The squared Euclidean distance between this vector (treated as a point) and another point (x,y,z).
     * @public
     *
     * @param {Vector3} point
     * @returns {number}
     */
    distanceSquaredXYZ: function( x, y, z ) {
      var dx = this.x - x;
      var dy = this.y - y;
      var dz = this.z - z;
      return dx * dx + dy * dy + dz * dz;
    },

    /**
     * The dot-product (Euclidean inner product) between this vector and another vector v.
     * @public
     *
     * @param {Vector3} v
     * @returns {number}
     */
    dot: function( v ) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    },

    /**
     * The dot-product (Euclidean inner product) between this vector and another vector (x,y,z).
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number}
     */
    dotXYZ: function( x, y, z ) {
      return this.x * x + this.y * y + this.z * z;
    },

    /**
     * The angle between this vector and another vector, in the range $\theta\in[0, \pi]$.
     * @public
     *
     * Equal to $\theta = \cos^{-1}( \hat{u} \cdot \hat{v} )$ where $\hat{u}$ is this vector (normalized) and $\hat{v}$
     * is the input vector (normalized).
     *
     * @param {Vector3} v
     * @returns {number}
     */
    angleBetween: function( v ) {
      return Math.acos( dot.clamp( this.normalized().dot( v.normalized() ), -1, 1 ) );
    },

    /**
     * Exact equality comparison between this vector and another vector.
     * @public
     *
     * @param {Vector3} other
     * @returns {boolean} - Whether the two vectors have equal components
     */
    equals: function( other ) {
      return this.x === other.x && this.y === other.y && this.z === other.z;
    },

    /**
     * Approximate equality comparison between this vector and another vector.
     * @public
     *
     * @param {Vector3} other
     * @param {number} epsilon
     * @returns {boolean} - Whether difference between the two vectors has no component with an absolute value greater
     *                      than epsilon.
     */
    equalsEpsilon: function( other, epsilon ) {
      if ( !epsilon ) {
        epsilon = 0;
      }
      return Math.abs( this.x - other.x ) + Math.abs( this.y - other.y ) + Math.abs( this.z - other.z ) <= epsilon;
    },

    /**
     * Whether all of the components are numbers (not NaN) that are not infinity or -infinity.
     * @public
     *
     * @returns {boolean}
     */
    isFinite: function() {
      return isFinite( this.x ) && isFinite( this.y ) && isFinite( this.z );
    },

    /*---------------------------------------------------------------------------*
     * Immutables
     *---------------------------------------------------------------------------*/

    /**
     * Creates a copy of this vector, or if a vector is passed in, set that vector's values to ours.
     * @public
     *
     * This is the immutable form of the function set(), if a vector is provided. This will return a new vector, and
     * will not modify this vector.
     *
     * @param {Vector3} [vector] - If not provided, creates a new Vector3 with filled in values. Otherwise, fills in the
     *                             values of the provided vector so that it equals this vector.
     * @returns {Vector3}
     */
    copy: function( vector ) {
      if ( vector ) {
        return vector.set( this );
      }
      else {
        return new Vector3( this.x, this.y, this.z );
      }
    },

    /**
     * The Euclidean 3-dimensional cross-product of this vector by the passed-in vector.
     * @public
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    cross: function( v ) {
      return new Vector3(
        this.y * v.z - this.z * v.y,
        this.z * v.x - this.x * v.z,
        this.x * v.y - this.y * v.x
      );
    },

    /**
     * Normalized (re-scaled) copy of this vector such that its magnitude is 1. If its initial magnitude is zero, an
     * error is thrown.
     * @public
     *
     * This is the immutable form of the function normalize(). This will return a new vector, and will not modify this
     * vector.
     *
     * @returns {Vector3}
     */
    normalized: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( 'Cannot normalize a zero-magnitude vector' );
      }
      else {
        return new Vector3( this.x / mag, this.y / mag, this.z / mag );
      }
    },

    /**
     * Re-scaled copy of this vector such that it has the desired magnitude. If its initial magnitude is zero, an error
     * is thrown. If the passed-in magnitude is negative, the direction of the resulting vector will be reversed.
     * @public
     *
     * This is the immutable form of the function setMagnitude(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} magnitude
     * @returns {Vector3}
     */
    withMagnitude: function( magnitude ) {
      return this.copy().setMagnitude( magnitude );
    },

    /**
     * Copy of this vector, scaled by the desired scalar value.
     * @public
     *
     * This is the immutable form of the function multiplyScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    timesScalar: function( scalar ) {
      return new Vector3( this.x * scalar, this.y * scalar, this.z * scalar );
    },

    /**
     * Same as timesScalar.
     * @public
     *
     * This is the immutable form of the function multiply(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    times: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.timesScalar( scalar );
    },

    /**
     * Copy of this vector, multiplied component-wise by the passed-in vector v.
     * @public
     *
     * This is the immutable form of the function componentMultiply(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    componentTimes: function( v ) {
      return new Vector3( this.x * v.x, this.y * v.y, this.z * v.z );
    },

    /**
     * Addition of this vector and another vector, returning a copy.
     * @public
     *
     * This is the immutable form of the function add(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    plus: function( v ) {
      return new Vector3( this.x + v.x, this.y + v.y, this.z + v.z );
    },

    /**
     * Addition of this vector and another vector (x,y,z), returning a copy.
     * @public
     *
     * This is the immutable form of the function addXYZ(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Vector3}
     */
    plusXYZ: function( x, y, z ) {
      return new Vector3( this.x + x, this.y + y, this.z + z );
    },

    /**
     * Addition of this vector with a scalar (adds the scalar to every component), returning a copy.
     * @public
     *
     * This is the immutable form of the function addScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    plusScalar: function( scalar ) {
      return new Vector3( this.x + scalar, this.y + scalar, this.z + scalar );
    },

    /**
     * Subtraction of this vector by another vector v, returning a copy.
     * @public
     *
     * This is the immutable form of the function subtract(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    minus: function( v ) {
      return new Vector3( this.x - v.x, this.y - v.y, this.z - v.z );
    },

    /**
     * Subtraction of this vector by another vector (x,y,z), returning a copy.
     * @public
     *
     * This is the immutable form of the function subtractXYZ(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Vector3}
     */
    minusXYZ: function( x, y, z ) {
      return new Vector3( this.x - x, this.y - y, this.z - z );
    },

    /**
     * Subtraction of this vector by a scalar (subtracts the scalar from every component), returning a copy.
     * @public
     *
     * This is the immutable form of the function subtractScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    minusScalar: function( scalar ) {
      return new Vector3( this.x - scalar, this.y - scalar, this.z - scalar );
    },

    /**
     * Division of this vector by a scalar (divides every component by the scalar), returning a copy.
     * @public
     *
     * This is the immutable form of the function divideScalar(). This will return a new vector, and will not modify
     * this vector.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    dividedScalar: function( scalar ) {
      return new Vector3( this.x / scalar, this.y / scalar, this.z / scalar );
    },

    /**
     * Negated copy of this vector (multiplies every component by -1).
     * @public
     *
     * This is the immutable form of the function negate(). This will return a new vector, and will not modify
     * this vector.
     *
     * @returns {Vector3}
     */
    negated: function() {
      return new Vector3( -this.x, -this.y, -this.z );
    },

    /**
     * A linear interpolation between this vector (ratio=0) and another vector (ratio=1).
     * @public
     *
     * @param {Vector3} vector
     * @param {number} ratio - Not necessarily constrained in [0, 1]
     * @returns {Vector3}
     */
    blend: function( vector, ratio ) {
      return this.plus( vector.minus( this ).times( ratio ) );
    },

    /**
     * The average (midpoint) between this vector and another vector.
     * @public
     *
     * @param {Vector3} vector
     * @returns {Vector3}
     */
    average: function( vector ) {
      return this.blend( vector, 0.5 );
    },

    /**
     * Debugging string for the vector.
     * @public
     *
     * @returns {string}
     */
    toString: function() {
      return 'Vector3(' + this.x + ', ' + this.y + ', ' + this.z + ')';
    },

    /**
     * Converts this to a 2-dimensional vector, discarding the z-component.
     * @public
     *
     * @returns {Vector2}
     */
    toVector2: function() {
      return new dot.Vector2( this.x, this.y );
    },

    /**
     * Converts this to a 4-dimensional vector, with the z-component equal to 1 (useful for homogeneous coordinates).
     * @public
     *
     * @returns {Vector4}
     */
    toVector4: function() {
      return new dot.Vector4( this.x, this.y, this.z, 1 );
    },

    /*---------------------------------------------------------------------------*
     * Mutables
     * - all mutation should go through setXYZ / setX / setY / setZ
     *---------------------------------------------------------------------------*/

    /**
     * Sets all of the components of this vector, returning this.
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Vector3}
     */
    setXYZ: function( x, y, z ) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },

    /**
     * Sets the x-component of this vector, returning this.
     * @public
     *
     * @param {number} x
     * @returns {Vector3}
     */
    setX: function( x ) {
      this.x = x;
      return this;
    },

    /**
     * Sets the y-component of this vector, returning this.
     * @public
     *
     * @param {number} y
     * @returns {Vector3}
     */
    setY: function( y ) {
      this.y = y;
      return this;
    },

    /**
     * Sets the z-component of this vector, returning this.
     * @public
     *
     * @param {number} z
     * @returns {Vector3}
     */
    setZ: function( z ) {
      this.z = z;
      return this;
    },

    /**
     * Sets this vector to be a copy of another vector.
     * @public
     *
     * This is the mutable form of the function copy(). This will mutate (change) this vector, in addition to returning
     * this vector itself.
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    set: function( v ) {
      return this.setXYZ( v.x, v.y, v.z );
    },

    /**
     * Sets the magnitude of this vector. If the passed-in magnitude is negative, this flips the vector and sets its
     * magnitude to abs( magnitude ).
     * @public
     *
     * This is the mutable form of the function withMagnitude(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} magnitude
     * @returns {Vector3}
     */
    setMagnitude: function( magnitude ) {
      var scale = magnitude / this.magnitude();
      return this.multiplyScalar( scale );
    },

    /**
     * Adds another vector to this vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function plus(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    add: function( v ) {
      return this.setXYZ( this.x + v.x, this.y + v.y, this.z + v.z );
    },

    /**
     * Adds another vector (x,y,z) to this vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function plusXYZ(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Vector3}
     */
    addXYZ: function( x, y, z ) {
      return this.setXYZ( this.x + x, this.y + y, this.z + z );
    },

    /**
     * Adds a scalar to this vector (added to every component), changing this vector.
     * @public
     *
     * This is the mutable form of the function plusScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    addScalar: function( scalar ) {
      return this.setXYZ( this.x + scalar, this.y + scalar, this.z + scalar );
    },

    /**
     * Subtracts this vector by another vector, changing this vector.
     * @public
     *
     * This is the mutable form of the function minus(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    subtract: function( v ) {
      return this.setXYZ( this.x - v.x, this.y - v.y, this.z - v.z );
    },

    /**
     * Subtracts this vector by another vector (x,y,z), changing this vector.
     * @public
     *
     * This is the mutable form of the function minusXYZ(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Vector3}
     */
    subtractXYZ: function( x, y, z ) {
      return this.setXYZ( this.x - x, this.y - y, this.z - z );
    },

    /**
     * Subtracts this vector by a scalar (subtracts each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function minusScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    subtractScalar: function( scalar ) {
      return this.setXYZ( this.x - scalar, this.y - scalar, this.z - scalar );
    },

    /**
     * Multiplies this vector by a scalar (multiplies each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function timesScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    multiplyScalar: function( scalar ) {
      return this.setXYZ( this.x * scalar, this.y * scalar, this.z * scalar );
    },

    /**
     * Multiplies this vector by a scalar (multiplies each component by the scalar), changing this vector.
     * Same as multiplyScalar.
     * @public
     *
     * This is the mutable form of the function times(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    multiply: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.multiplyScalar( scalar );
    },

    /**
     * Multiplies this vector by another vector component-wise, changing this vector.
     * @public
     *
     * This is the mutable form of the function componentTimes(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    componentMultiply: function( v ) {
      return this.setXYZ( this.x * v.x, this.y * v.y, this.z * v.z );
    },

    /**
     * Divides this vector by a scalar (divides each component by the scalar), changing this vector.
     * @public
     *
     * This is the mutable form of the function dividedScalar(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @param {number} scalar
     * @returns {Vector3}
     */
    divideScalar: function( scalar ) {
      return this.setXYZ( this.x / scalar, this.y / scalar, this.z / scalar );
    },

    /**
     * Negates this vector (multiplies each component by -1), changing this vector.
     * @public
     *
     * This is the mutable form of the function negated(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @returns {Vector3}
     */
    negate: function() {
      return this.setXYZ( -this.x, -this.y, -this.z );
    },

    /**
     * Normalizes this vector (rescales to where the magnitude is 1), changing this vector.
     * @public
     *
     * This is the mutable form of the function normalized(). This will mutate (change) this vector, in addition to
     * returning this vector itself.
     *
     * @returns {Vector3}
     */
    normalize: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( 'Cannot normalize a zero-magnitude vector' );
      }
      else {
        return this.divideScalar( mag );
      }
    }
  }, {
    /**
     * Spherical linear interpolation between two unit vectors.
     * @public
     *
     * @param {Vector3} start - Start unit vector
     * @param {Vector3} end - End unit vector
     * @param {number} ratio  - Between 0 (at start vector) and 1 (at end vector)
     * @return Spherical linear interpolation between the start and end
     */
    slerp: function( start, end, ratio ) {
      // NOTE: we can't create a require() loop here
      return dot.Quaternion.slerp( new dot.Quaternion(), dot.Quaternion.getRotationQuaternion( start, end ), ratio ).timesVector3( start );
    }
  } );

  // Sets up pooling on Vector3
  Poolable.mixin( Vector3, {
    defaultFactory: function() { return new Vector3(); },
    constructorDuplicateFactory: function( pool ) {
      return function( x, y, z ) {
        if ( pool.length ) {
          return pool.pop().setXY( x, y, z );
        }
        else {
          return new Vector3( x, y, z );
        }
      };
    }
  } );

  /*---------------------------------------------------------------------------*
   * Immutable Vector form
   *---------------------------------------------------------------------------*/

  // @private
  Vector3.Immutable = function( x, y, z ) {
    this.x = x !== undefined ? x : 0;
    this.y = y !== undefined ? y : 0;
    this.z = z !== undefined ? z : 0;
  };
  var Immutable = Vector3.Immutable;

  inherit( Vector3, Immutable );

  // throw errors whenever a mutable method is called on our immutable vector
  Immutable.mutableOverrideHelper = function( mutableFunctionName ) {
    Immutable.prototype[ mutableFunctionName ] = function() {
      throw new Error( 'Cannot call mutable method \'' + mutableFunctionName + '\' on immutable Vector3' );
    };
  };

  // TODO: better way to handle this list?
  Immutable.mutableOverrideHelper( 'setXYZ' );
  Immutable.mutableOverrideHelper( 'setX' );
  Immutable.mutableOverrideHelper( 'setY' );
  Immutable.mutableOverrideHelper( 'setZ' );

  // @public {Vector3} - helpful immutable constants
  Vector3.ZERO = assert ? new Immutable( 0, 0, 0 ) : new Vector3( 0, 0, 0 );
  Vector3.X_UNIT = assert ? new Immutable( 1, 0, 0 ) : new Vector3( 1, 0, 0 );
  Vector3.Y_UNIT = assert ? new Immutable( 0, 1, 0 ) : new Vector3( 0, 1, 0 );
  Vector3.Z_UNIT = assert ? new Immutable( 0, 0, 1 ) : new Vector3( 0, 0, 1 );

  return Vector3;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * 4-dimensional Matrix
 *
 * TODO: consider adding affine flag if it will help performance (a la Matrix3)
 * TODO: get rotation angles
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Matrix4',['require','DOT/dot','DOT/Vector3','DOT/Vector4'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  require( 'DOT/Vector3' );
  require( 'DOT/Vector4' );

  var Float32Array = window.Float32Array || Array;

  function Matrix4( v00, v01, v02, v03, v10, v11, v12, v13, v20, v21, v22, v23, v30, v31, v32, v33, type ) {

    // entries stored in column-major format
    this.entries = new Float32Array( 16 );

    this.rowMajor(
      v00 !== undefined ? v00 : 1, v01 !== undefined ? v01 : 0, v02 !== undefined ? v02 : 0, v03 !== undefined ? v03 : 0,
      v10 !== undefined ? v10 : 0, v11 !== undefined ? v11 : 1, v12 !== undefined ? v12 : 0, v13 !== undefined ? v13 : 0,
      v20 !== undefined ? v20 : 0, v21 !== undefined ? v21 : 0, v22 !== undefined ? v22 : 1, v23 !== undefined ? v23 : 0,
      v30 !== undefined ? v30 : 0, v31 !== undefined ? v31 : 0, v32 !== undefined ? v32 : 0, v33 !== undefined ? v33 : 1,
      type );
  }

  dot.register( 'Matrix4', Matrix4 );

  Matrix4.Types = {
    OTHER: 0, // default
    IDENTITY: 1,
    TRANSLATION_3D: 2,
    SCALING: 3,
    AFFINE: 4

    // TODO: possibly add rotations
  };

  var Types = Matrix4.Types;

  Matrix4.identity = function() {
    return new Matrix4(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
      Types.IDENTITY );
  };

  Matrix4.translation = function( x, y, z ) {
    return new Matrix4(
      1, 0, 0, x,
      0, 1, 0, y,
      0, 0, 1, z,
      0, 0, 0, 1,
      Types.TRANSLATION_3D );
  };

  Matrix4.translationFromVector = function( v ) { return Matrix4.translation( v.x, v.y, v.z ); };

  Matrix4.scaling = function( x, y, z ) {
    // allow using one parameter to scale everything
    y = y === undefined ? x : y;
    z = z === undefined ? x : z;

    return new Matrix4(
      x, 0, 0, 0,
      0, y, 0, 0,
      0, 0, z, 0,
      0, 0, 0, 1,
      Types.SCALING );
  };

  // axis is a normalized Vector3, angle in radians.
  Matrix4.rotationAxisAngle = function( axis, angle ) {
    var c = Math.cos( angle );
    var s = Math.sin( angle );
    var C = 1 - c;

    return new Matrix4(
      axis.x * axis.x * C + c, axis.x * axis.y * C - axis.z * s, axis.x * axis.z * C + axis.y * s, 0,
      axis.y * axis.x * C + axis.z * s, axis.y * axis.y * C + c, axis.y * axis.z * C - axis.x * s, 0,
      axis.z * axis.x * C - axis.y * s, axis.z * axis.y * C + axis.x * s, axis.z * axis.z * C + c, 0,
      0, 0, 0, 1,
      Types.AFFINE );
  };

  // TODO: add in rotation from quaternion, and from quat + translation

  Matrix4.rotationX = function( angle ) {
    var c = Math.cos( angle );
    var s = Math.sin( angle );

    return new Matrix4(
      1, 0, 0, 0,
      0, c, -s, 0,
      0, s, c, 0,
      0, 0, 0, 1,
      Types.AFFINE );
  };

  Matrix4.rotationY = function( angle ) {
    var c = Math.cos( angle );
    var s = Math.sin( angle );

    return new Matrix4(
      c, 0, s, 0,
      0, 1, 0, 0,
      -s, 0, c, 0,
      0, 0, 0, 1,
      Types.AFFINE );
  };

  Matrix4.rotationZ = function( angle ) {
    var c = Math.cos( angle );
    var s = Math.sin( angle );

    return new Matrix4(
      c, -s, 0, 0,
      s, c, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
      Types.AFFINE );
  };

  // aspect === width / height
  Matrix4.gluPerspective = function( fovYRadians, aspect, zNear, zFar ) {
    var cotangent = Math.cos( fovYRadians ) / Math.sin( fovYRadians );

    return new Matrix4(
      cotangent / aspect, 0, 0, 0,
      0, cotangent, 0, 0,
      0, 0, ( zFar + zNear ) / ( zNear - zFar ), ( 2 * zFar * zNear ) / ( zNear - zFar ),
      0, 0, -1, 0 );
  };

  Matrix4.prototype = {
    constructor: Matrix4,

    rowMajor: function( v00, v01, v02, v03, v10, v11, v12, v13, v20, v21, v22, v23, v30, v31, v32, v33, type ) {
      this.entries[ 0 ] = v00;
      this.entries[ 1 ] = v10;
      this.entries[ 2 ] = v20;
      this.entries[ 3 ] = v30;
      this.entries[ 4 ] = v01;
      this.entries[ 5 ] = v11;
      this.entries[ 6 ] = v21;
      this.entries[ 7 ] = v31;
      this.entries[ 8 ] = v02;
      this.entries[ 9 ] = v12;
      this.entries[ 10 ] = v22;
      this.entries[ 11 ] = v32;
      this.entries[ 12 ] = v03;
      this.entries[ 13 ] = v13;
      this.entries[ 14 ] = v23;
      this.entries[ 15 ] = v33;

      // TODO: consider performance of the affine check here
      this.type = type === undefined ? ( ( v30 === 0 && v31 === 0 && v32 === 0 && v33 === 1 ) ? Types.AFFINE : Types.OTHER ) : type;
      return this;
    },

    columnMajor: function( v00, v10, v20, v30, v01, v11, v21, v31, v02, v12, v22, v32, v03, v13, v23, v33, type ) {
      return this.rowMajor( v00, v01, v02, v03, v10, v11, v12, v13, v20, v21, v22, v23, v30, v31, v32, v33, type );
    },

    set: function( matrix ) {
      return this.rowMajor(
        matrix.m00(), matrix.m01(), matrix.m02(), matrix.m03(),
        matrix.m10(), matrix.m11(), matrix.m12(), matrix.m13(),
        matrix.m20(), matrix.m21(), matrix.m22(), matrix.m23(),
        matrix.m30(), matrix.m31(), matrix.m32(), matrix.m33(),
        matrix.type );
    },

    // convenience getters. inline usages of these when performance is critical? TODO: test performance of inlining these, with / without closure compiler
    m00: function() { return this.entries[ 0 ]; },
    m01: function() { return this.entries[ 4 ]; },
    m02: function() { return this.entries[ 8 ]; },
    m03: function() { return this.entries[ 12 ]; },
    m10: function() { return this.entries[ 1 ]; },
    m11: function() { return this.entries[ 5 ]; },
    m12: function() { return this.entries[ 9 ]; },
    m13: function() { return this.entries[ 13 ]; },
    m20: function() { return this.entries[ 2 ]; },
    m21: function() { return this.entries[ 6 ]; },
    m22: function() { return this.entries[ 10 ]; },
    m23: function() { return this.entries[ 14 ]; },
    m30: function() { return this.entries[ 3 ]; },
    m31: function() { return this.entries[ 7 ]; },
    m32: function() { return this.entries[ 11 ]; },
    m33: function() { return this.entries[ 15 ]; },

    isFinite: function() {
      return isFinite( this.m00() ) &&
             isFinite( this.m01() ) &&
             isFinite( this.m02() ) &&
             isFinite( this.m03() ) &&
             isFinite( this.m10() ) &&
             isFinite( this.m11() ) &&
             isFinite( this.m12() ) &&
             isFinite( this.m13() ) &&
             isFinite( this.m20() ) &&
             isFinite( this.m21() ) &&
             isFinite( this.m22() ) &&
             isFinite( this.m23() ) &&
             isFinite( this.m30() ) &&
             isFinite( this.m31() ) &&
             isFinite( this.m32() ) &&
             isFinite( this.m33() );
    },

    // the 3D translation, assuming multiplication with a homogeneous vector
    getTranslation: function() {
      return new dot.Vector3( this.m03(), this.m13(), this.m23() );
    },
    get translation() { return this.getTranslation(); },

    // returns a vector that is equivalent to ( T(1,0,0).magnitude(), T(0,1,0).magnitude(), T(0,0,1).magnitude() )
    // where T is a relative transform
    getScaleVector: function() {
      var m0003 = this.m00() + this.m03();
      var m1013 = this.m10() + this.m13();
      var m2023 = this.m20() + this.m23();
      var m3033 = this.m30() + this.m33();
      var m0103 = this.m01() + this.m03();
      var m1113 = this.m11() + this.m13();
      var m2123 = this.m21() + this.m23();
      var m3133 = this.m31() + this.m33();
      var m0203 = this.m02() + this.m03();
      var m1213 = this.m12() + this.m13();
      var m2223 = this.m22() + this.m23();
      var m3233 = this.m32() + this.m33();
      return new dot.Vector3(
        Math.sqrt( m0003 * m0003 + m1013 * m1013 + m2023 * m2023 + m3033 * m3033 ),
        Math.sqrt( m0103 * m0103 + m1113 * m1113 + m2123 * m2123 + m3133 * m3133 ),
        Math.sqrt( m0203 * m0203 + m1213 * m1213 + m2223 * m2223 + m3233 * m3233 ) );
    },
    get scaleVector() { return this.getScaleVector(); },

    getCSSTransform: function() {
      // See http://www.w3.org/TR/css3-transforms/, particularly Section 13 that discusses the SVG compatibility

      // We need to prevent the numbers from being in an exponential toString form, since the CSS transform does not support that
      // 20 is the largest guaranteed number of digits according to https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toFixed
      // See https://github.com/phetsims/dot/issues/36

      // the inner part of a CSS3 transform, but remember to add the browser-specific parts!
      // NOTE: the toFixed calls are inlined for performance reasons
      return 'matrix3d(' +
             this.entries[ 0 ].toFixed( 20 ) + ',' +
             this.entries[ 1 ].toFixed( 20 ) + ',' +
             this.entries[ 2 ].toFixed( 20 ) + ',' +
             this.entries[ 3 ].toFixed( 20 ) + ',' +
             this.entries[ 4 ].toFixed( 20 ) + ',' +
             this.entries[ 5 ].toFixed( 20 ) + ',' +
             this.entries[ 6 ].toFixed( 20 ) + ',' +
             this.entries[ 7 ].toFixed( 20 ) + ',' +
             this.entries[ 8 ].toFixed( 20 ) + ',' +
             this.entries[ 9 ].toFixed( 20 ) + ',' +
             this.entries[ 10 ].toFixed( 20 ) + ',' +
             this.entries[ 11 ].toFixed( 20 ) + ',' +
             this.entries[ 12 ].toFixed( 20 ) + ',' +
             this.entries[ 13 ].toFixed( 20 ) + ',' +
             this.entries[ 14 ].toFixed( 20 ) + ',' +
             this.entries[ 15 ].toFixed( 20 ) + ')';
    },
    get cssTransform() { return this.getCSSTransform(); },

    // exact equality
    equals: function( m ) {
      return this.m00() === m.m00() && this.m01() === m.m01() && this.m02() === m.m02() && this.m03() === m.m03() &&
             this.m10() === m.m10() && this.m11() === m.m11() && this.m12() === m.m12() && this.m13() === m.m13() &&
             this.m20() === m.m20() && this.m21() === m.m21() && this.m22() === m.m22() && this.m23() === m.m23() &&
             this.m30() === m.m30() && this.m31() === m.m31() && this.m32() === m.m32() && this.m33() === m.m33();
    },

    // equality within a margin of error
    equalsEpsilon: function( m, epsilon ) {
      return Math.abs( this.m00() - m.m00() ) < epsilon &&
             Math.abs( this.m01() - m.m01() ) < epsilon &&
             Math.abs( this.m02() - m.m02() ) < epsilon &&
             Math.abs( this.m03() - m.m03() ) < epsilon &&
             Math.abs( this.m10() - m.m10() ) < epsilon &&
             Math.abs( this.m11() - m.m11() ) < epsilon &&
             Math.abs( this.m12() - m.m12() ) < epsilon &&
             Math.abs( this.m13() - m.m13() ) < epsilon &&
             Math.abs( this.m20() - m.m20() ) < epsilon &&
             Math.abs( this.m21() - m.m21() ) < epsilon &&
             Math.abs( this.m22() - m.m22() ) < epsilon &&
             Math.abs( this.m23() - m.m23() ) < epsilon &&
             Math.abs( this.m30() - m.m30() ) < epsilon &&
             Math.abs( this.m31() - m.m31() ) < epsilon &&
             Math.abs( this.m32() - m.m32() ) < epsilon &&
             Math.abs( this.m33() - m.m33() ) < epsilon;
    },

    /*---------------------------------------------------------------------------*
     * Immutable operations (returning a new matrix)
     *----------------------------------------------------------------------------*/

    copy: function() {
      return new Matrix4(
        this.m00(), this.m01(), this.m02(), this.m03(),
        this.m10(), this.m11(), this.m12(), this.m13(),
        this.m20(), this.m21(), this.m22(), this.m23(),
        this.m30(), this.m31(), this.m32(), this.m33(),
        this.type
      );
    },

    plus: function( m ) {
      return new Matrix4(
        this.m00() + m.m00(), this.m01() + m.m01(), this.m02() + m.m02(), this.m03() + m.m03(),
        this.m10() + m.m10(), this.m11() + m.m11(), this.m12() + m.m12(), this.m13() + m.m13(),
        this.m20() + m.m20(), this.m21() + m.m21(), this.m22() + m.m22(), this.m23() + m.m23(),
        this.m30() + m.m30(), this.m31() + m.m31(), this.m32() + m.m32(), this.m33() + m.m33()
      );
    },

    minus: function( m ) {
      return new Matrix4(
        this.m00() - m.m00(), this.m01() - m.m01(), this.m02() - m.m02(), this.m03() - m.m03(),
        this.m10() - m.m10(), this.m11() - m.m11(), this.m12() - m.m12(), this.m13() - m.m13(),
        this.m20() - m.m20(), this.m21() - m.m21(), this.m22() - m.m22(), this.m23() - m.m23(),
        this.m30() - m.m30(), this.m31() - m.m31(), this.m32() - m.m32(), this.m33() - m.m33()
      );
    },

    transposed: function() {
      return new Matrix4(
        this.m00(), this.m10(), this.m20(), this.m30(),
        this.m01(), this.m11(), this.m21(), this.m31(),
        this.m02(), this.m12(), this.m22(), this.m32(),
        this.m03(), this.m13(), this.m23(), this.m33() );
    },

    negated: function() {
      return new Matrix4(
        -this.m00(), -this.m01(), -this.m02(), -this.m03(),
        -this.m10(), -this.m11(), -this.m12(), -this.m13(),
        -this.m20(), -this.m21(), -this.m22(), -this.m23(),
        -this.m30(), -this.m31(), -this.m32(), -this.m33() );
    },

    inverted: function() {
      switch( this.type ) {
        case Types.IDENTITY:
          return this;
        case Types.TRANSLATION_3D:
          return new Matrix4(
            1, 0, 0, -this.m03(),
            0, 1, 0, -this.m13(),
            0, 0, 1, -this.m23(),
            0, 0, 0, 1, Types.TRANSLATION_3D );
        case Types.SCALING:
          return new Matrix4(
            1 / this.m00(), 0, 0, 0,
            0, 1 / this.m11(), 0, 0,
            0, 0, 1 / this.m22(), 0,
            0, 0, 0, 1 / this.m33(), Types.SCALING );
        case Types.AFFINE:
        case Types.OTHER:
          var det = this.getDeterminant();
          if ( det !== 0 ) {
            return new Matrix4(
              ( -this.m31() * this.m22() * this.m13() + this.m21() * this.m32() * this.m13() + this.m31() * this.m12() * this.m23() - this.m11() * this.m32() * this.m23() - this.m21() * this.m12() * this.m33() + this.m11() * this.m22() * this.m33() ) / det,
              ( this.m31() * this.m22() * this.m03() - this.m21() * this.m32() * this.m03() - this.m31() * this.m02() * this.m23() + this.m01() * this.m32() * this.m23() + this.m21() * this.m02() * this.m33() - this.m01() * this.m22() * this.m33() ) / det,
              ( -this.m31() * this.m12() * this.m03() + this.m11() * this.m32() * this.m03() + this.m31() * this.m02() * this.m13() - this.m01() * this.m32() * this.m13() - this.m11() * this.m02() * this.m33() + this.m01() * this.m12() * this.m33() ) / det,
              ( this.m21() * this.m12() * this.m03() - this.m11() * this.m22() * this.m03() - this.m21() * this.m02() * this.m13() + this.m01() * this.m22() * this.m13() + this.m11() * this.m02() * this.m23() - this.m01() * this.m12() * this.m23() ) / det,
              ( this.m30() * this.m22() * this.m13() - this.m20() * this.m32() * this.m13() - this.m30() * this.m12() * this.m23() + this.m10() * this.m32() * this.m23() + this.m20() * this.m12() * this.m33() - this.m10() * this.m22() * this.m33() ) / det,
              ( -this.m30() * this.m22() * this.m03() + this.m20() * this.m32() * this.m03() + this.m30() * this.m02() * this.m23() - this.m00() * this.m32() * this.m23() - this.m20() * this.m02() * this.m33() + this.m00() * this.m22() * this.m33() ) / det,
              ( this.m30() * this.m12() * this.m03() - this.m10() * this.m32() * this.m03() - this.m30() * this.m02() * this.m13() + this.m00() * this.m32() * this.m13() + this.m10() * this.m02() * this.m33() - this.m00() * this.m12() * this.m33() ) / det,
              ( -this.m20() * this.m12() * this.m03() + this.m10() * this.m22() * this.m03() + this.m20() * this.m02() * this.m13() - this.m00() * this.m22() * this.m13() - this.m10() * this.m02() * this.m23() + this.m00() * this.m12() * this.m23() ) / det,
              ( -this.m30() * this.m21() * this.m13() + this.m20() * this.m31() * this.m13() + this.m30() * this.m11() * this.m23() - this.m10() * this.m31() * this.m23() - this.m20() * this.m11() * this.m33() + this.m10() * this.m21() * this.m33() ) / det,
              ( this.m30() * this.m21() * this.m03() - this.m20() * this.m31() * this.m03() - this.m30() * this.m01() * this.m23() + this.m00() * this.m31() * this.m23() + this.m20() * this.m01() * this.m33() - this.m00() * this.m21() * this.m33() ) / det,
              ( -this.m30() * this.m11() * this.m03() + this.m10() * this.m31() * this.m03() + this.m30() * this.m01() * this.m13() - this.m00() * this.m31() * this.m13() - this.m10() * this.m01() * this.m33() + this.m00() * this.m11() * this.m33() ) / det,
              ( this.m20() * this.m11() * this.m03() - this.m10() * this.m21() * this.m03() - this.m20() * this.m01() * this.m13() + this.m00() * this.m21() * this.m13() + this.m10() * this.m01() * this.m23() - this.m00() * this.m11() * this.m23() ) / det,
              ( this.m30() * this.m21() * this.m12() - this.m20() * this.m31() * this.m12() - this.m30() * this.m11() * this.m22() + this.m10() * this.m31() * this.m22() + this.m20() * this.m11() * this.m32() - this.m10() * this.m21() * this.m32() ) / det,
              ( -this.m30() * this.m21() * this.m02() + this.m20() * this.m31() * this.m02() + this.m30() * this.m01() * this.m22() - this.m00() * this.m31() * this.m22() - this.m20() * this.m01() * this.m32() + this.m00() * this.m21() * this.m32() ) / det,
              ( this.m30() * this.m11() * this.m02() - this.m10() * this.m31() * this.m02() - this.m30() * this.m01() * this.m12() + this.m00() * this.m31() * this.m12() + this.m10() * this.m01() * this.m32() - this.m00() * this.m11() * this.m32() ) / det,
              ( -this.m20() * this.m11() * this.m02() + this.m10() * this.m21() * this.m02() + this.m20() * this.m01() * this.m12() - this.m00() * this.m21() * this.m12() - this.m10() * this.m01() * this.m22() + this.m00() * this.m11() * this.m22() ) / det
            );
          }
          else {
            throw new Error( 'Matrix could not be inverted, determinant === 0' );
          }
          break;
        default:
          throw new Error( 'Matrix3.inverted with unknown type: ' + this.type );
      }
    },

    timesMatrix: function( m ) {
      // I * M === M * I === I (the identity)
      if ( this.type === Types.IDENTITY || m.type === Types.IDENTITY ) {
        return this.type === Types.IDENTITY ? m : this;
      }

      if ( this.type === m.type ) {
        // currently two matrices of the same type will result in the same result type
        if ( this.type === Types.TRANSLATION_3D ) {
          // faster combination of translations
          return new Matrix4(
            1, 0, 0, this.m03() + m.m02(),
            0, 1, 0, this.m13() + m.m12(),
            0, 0, 1, this.m23() + m.m23(),
            0, 0, 0, 1, Types.TRANSLATION_3D );
        }
        else if ( this.type === Types.SCALING ) {
          // faster combination of scaling
          return new Matrix4(
            this.m00() * m.m00(), 0, 0, 0,
            0, this.m11() * m.m11(), 0, 0,
            0, 0, this.m22() * m.m22(), 0,
            0, 0, 0, 1, Types.SCALING );
        }
      }

      if ( this.type !== Types.OTHER && m.type !== Types.OTHER ) {
        // currently two matrices that are anything but "other" are technically affine, and the result will be affine

        // affine case
        return new Matrix4(
          this.m00() * m.m00() + this.m01() * m.m10() + this.m02() * m.m20(),
          this.m00() * m.m01() + this.m01() * m.m11() + this.m02() * m.m21(),
          this.m00() * m.m02() + this.m01() * m.m12() + this.m02() * m.m22(),
          this.m00() * m.m03() + this.m01() * m.m13() + this.m02() * m.m23() + this.m03(),
          this.m10() * m.m00() + this.m11() * m.m10() + this.m12() * m.m20(),
          this.m10() * m.m01() + this.m11() * m.m11() + this.m12() * m.m21(),
          this.m10() * m.m02() + this.m11() * m.m12() + this.m12() * m.m22(),
          this.m10() * m.m03() + this.m11() * m.m13() + this.m12() * m.m23() + this.m13(),
          this.m20() * m.m00() + this.m21() * m.m10() + this.m22() * m.m20(),
          this.m20() * m.m01() + this.m21() * m.m11() + this.m22() * m.m21(),
          this.m20() * m.m02() + this.m21() * m.m12() + this.m22() * m.m22(),
          this.m20() * m.m03() + this.m21() * m.m13() + this.m22() * m.m23() + this.m23(),
          0, 0, 0, 1, Types.AFFINE );
      }

      // general case
      return new Matrix4(
        this.m00() * m.m00() + this.m01() * m.m10() + this.m02() * m.m20() + this.m03() * m.m30(),
        this.m00() * m.m01() + this.m01() * m.m11() + this.m02() * m.m21() + this.m03() * m.m31(),
        this.m00() * m.m02() + this.m01() * m.m12() + this.m02() * m.m22() + this.m03() * m.m32(),
        this.m00() * m.m03() + this.m01() * m.m13() + this.m02() * m.m23() + this.m03() * m.m33(),
        this.m10() * m.m00() + this.m11() * m.m10() + this.m12() * m.m20() + this.m13() * m.m30(),
        this.m10() * m.m01() + this.m11() * m.m11() + this.m12() * m.m21() + this.m13() * m.m31(),
        this.m10() * m.m02() + this.m11() * m.m12() + this.m12() * m.m22() + this.m13() * m.m32(),
        this.m10() * m.m03() + this.m11() * m.m13() + this.m12() * m.m23() + this.m13() * m.m33(),
        this.m20() * m.m00() + this.m21() * m.m10() + this.m22() * m.m20() + this.m23() * m.m30(),
        this.m20() * m.m01() + this.m21() * m.m11() + this.m22() * m.m21() + this.m23() * m.m31(),
        this.m20() * m.m02() + this.m21() * m.m12() + this.m22() * m.m22() + this.m23() * m.m32(),
        this.m20() * m.m03() + this.m21() * m.m13() + this.m22() * m.m23() + this.m23() * m.m33(),
        this.m30() * m.m00() + this.m31() * m.m10() + this.m32() * m.m20() + this.m33() * m.m30(),
        this.m30() * m.m01() + this.m31() * m.m11() + this.m32() * m.m21() + this.m33() * m.m31(),
        this.m30() * m.m02() + this.m31() * m.m12() + this.m32() * m.m22() + this.m33() * m.m32(),
        this.m30() * m.m03() + this.m31() * m.m13() + this.m32() * m.m23() + this.m33() * m.m33() );
    },

    timesVector4: function( v ) {
      var x = this.m00() * v.x + this.m01() * v.y + this.m02() * v.z + this.m03() * v.w;
      var y = this.m10() * v.x + this.m11() * v.y + this.m12() * v.z + this.m13() * v.w;
      var z = this.m20() * v.x + this.m21() * v.y + this.m22() * v.z + this.m23() * v.w;
      var w = this.m30() * v.x + this.m31() * v.y + this.m32() * v.z + this.m33() * v.w;
      return new dot.Vector4( x, y, z, w );
    },

    timesVector3: function( v ) {
      return this.timesVector4( v.toVector4() ).toVector3();
    },

    timesTransposeVector4: function( v ) {
      var x = this.m00() * v.x + this.m10() * v.y + this.m20() * v.z + this.m30() * v.w;
      var y = this.m01() * v.x + this.m11() * v.y + this.m21() * v.z + this.m31() * v.w;
      var z = this.m02() * v.x + this.m12() * v.y + this.m22() * v.z + this.m32() * v.w;
      var w = this.m03() * v.x + this.m13() * v.y + this.m23() * v.z + this.m33() * v.w;
      return new dot.Vector4( x, y, z, w );
    },

    timesTransposeVector3: function( v ) {
      return this.timesTransposeVector4( v.toVector4() ).toVector3();
    },

    timesRelativeVector3: function( v ) {
      var x = this.m00() * v.x + this.m10() * v.y + this.m20() * v.z;
      var y = this.m01() * v.y + this.m11() * v.y + this.m21() * v.z;
      var z = this.m02() * v.z + this.m12() * v.y + this.m22() * v.z;
      return new dot.Vector3( x, y, z );
    },

    getDeterminant: function() {
      return this.m03() * this.m12() * this.m21() * this.m30() -
             this.m02() * this.m13() * this.m21() * this.m30() -
             this.m03() * this.m11() * this.m22() * this.m30() +
             this.m01() * this.m13() * this.m22() * this.m30() +
             this.m02() * this.m11() * this.m23() * this.m30() -
             this.m01() * this.m12() * this.m23() * this.m30() -
             this.m03() * this.m12() * this.m20() * this.m31() +
             this.m02() * this.m13() * this.m20() * this.m31() +
             this.m03() * this.m10() * this.m22() * this.m31() -
             this.m00() * this.m13() * this.m22() * this.m31() -
             this.m02() * this.m10() * this.m23() * this.m31() +
             this.m00() * this.m12() * this.m23() * this.m31() +
             this.m03() * this.m11() * this.m20() * this.m32() -
             this.m01() * this.m13() * this.m20() * this.m32() -
             this.m03() * this.m10() * this.m21() * this.m32() +
             this.m00() * this.m13() * this.m21() * this.m32() +
             this.m01() * this.m10() * this.m23() * this.m32() -
             this.m00() * this.m11() * this.m23() * this.m32() -
             this.m02() * this.m11() * this.m20() * this.m33() +
             this.m01() * this.m12() * this.m20() * this.m33() +
             this.m02() * this.m10() * this.m21() * this.m33() -
             this.m00() * this.m12() * this.m21() * this.m33() -
             this.m01() * this.m10() * this.m22() * this.m33() +
             this.m00() * this.m11() * this.m22() * this.m33();
    },
    get determinant() { return this.getDeterminant(); },

    toString: function() {
      return this.m00() + ' ' + this.m01() + ' ' + this.m02() + ' ' + this.m03() + '\n' +
             this.m10() + ' ' + this.m11() + ' ' + this.m12() + ' ' + this.m13() + '\n' +
             this.m20() + ' ' + this.m21() + ' ' + this.m22() + ' ' + this.m23() + '\n' +
             this.m30() + ' ' + this.m31() + ' ' + this.m32() + ' ' + this.m33();
    },

    makeImmutable: function() {
      this.rowMajor = function() {
        throw new Error( 'Cannot modify immutable matrix' );
      };
    }
  };

  // create an immutable
  Matrix4.IDENTITY = new Matrix4();
  Matrix4.IDENTITY.makeImmutable();

  return Matrix4;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * 3-dimensional Matrix
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Matrix3',['require','DOT/dot','PHET_CORE/Poolable','DOT/Vector2','DOT/Vector3','DOT/Matrix4'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  var FastArray = dot.FastArray;

  require( 'DOT/Vector2' );
  require( 'DOT/Vector3' );
  require( 'DOT/Matrix4' );

  var identityFastArray = new FastArray( 9 );
  identityFastArray[ 0 ] = 1;
  identityFastArray[ 4 ] = 1;
  identityFastArray[ 8 ] = 1;

  var createIdentityArray = FastArray === Array ?
                            function() {
                              return [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ];
                            } :
                            function() {
                              return new FastArray( identityFastArray );
                            };

  // Create an identity matrix
  function Matrix3( argumentsShouldNotExist ) {

    //Make sure no clients are expecting to create a matrix with non-identity values
    assert && assert( !argumentsShouldNotExist, 'Matrix3 constructor should not be called with any arguments.  Use Matrix3.createFromPool()/Matrix3.identity()/etc.' );

    // entries stored in column-major format
    this.entries = createIdentityArray();

    phetAllocation && phetAllocation( 'Matrix3' );
    this.type = Types.IDENTITY;
  }

  dot.register( 'Matrix3', Matrix3 );

  Matrix3.Types = {
    // NOTE: if an inverted matrix of a type is not that type, change inverted()!
    // NOTE: if two matrices with identical types are multiplied, the result should have the same type. if not, changed timesMatrix()!
    // NOTE: on adding a type, exaustively check all type usage
    OTHER: 0, // default
    IDENTITY: 1,
    TRANSLATION_2D: 2,
    SCALING: 3,
    AFFINE: 4

    // TODO: possibly add rotations
  };

  var Types = Matrix3.Types;

  Matrix3.identity = function() { return Matrix3.dirtyFromPool().setToIdentity(); };
  Matrix3.translation = function( x, y ) { return Matrix3.dirtyFromPool().setToTranslation( x, y ); };
  Matrix3.translationFromVector = function( v ) { return Matrix3.translation( v.x, v.y ); };
  Matrix3.scaling = function( x, y ) { return Matrix3.dirtyFromPool().setToScale( x, y ); };
  Matrix3.scale = Matrix3.scaling;
  Matrix3.affine = function( m00, m10, m01, m11, m02, m12 ) { return Matrix3.dirtyFromPool().setToAffine( m00, m01, m02, m10, m11, m12 ); };
  Matrix3.rowMajor = function( v00, v01, v02, v10, v11, v12, v20, v21, v22, type ) { return Matrix3.dirtyFromPool().rowMajor( v00, v01, v02, v10, v11, v12, v20, v21, v22, type ); };

  // axis is a normalized Vector3, angle in radians.
  Matrix3.rotationAxisAngle = function( axis, angle ) { return Matrix3.dirtyFromPool().setToRotationAxisAngle( axis, angle ); };

  Matrix3.rotationX = function( angle ) { return Matrix3.dirtyFromPool().setToRotationX( angle ); };
  Matrix3.rotationY = function( angle ) { return Matrix3.dirtyFromPool().setToRotationY( angle ); };
  Matrix3.rotationZ = function( angle ) { return Matrix3.dirtyFromPool().setToRotationZ( angle ); };

  // standard 2d rotation
  Matrix3.rotation2 = Matrix3.rotationZ;

  Matrix3.rotationAround = function( angle, x, y ) {
    return Matrix3.translation( x, y ).timesMatrix( Matrix3.rotation2( angle ) ).timesMatrix( Matrix3.translation( -x, -y ) );
  };

  Matrix3.rotationAroundPoint = function( angle, point ) {
    return Matrix3.rotationAround( angle, point.x, point.y );
  };

  Matrix3.fromSVGMatrix = function( svgMatrix ) { return Matrix3.dirtyFromPool().setToSVGMatrix( svgMatrix ); };

  // a rotation matrix that rotates A to B, by rotating about the axis A.cross( B ) -- Shortest path. ideally should be unit vectors
  Matrix3.rotateAToB = function( a, b ) { return Matrix3.dirtyFromPool().setRotationAToB( a, b ); };

  Matrix3.prototype = {
    constructor: Matrix3,

    /*---------------------------------------------------------------------------*
     * "Properties"
     *----------------------------------------------------------------------------*/

    // convenience getters. inline usages of these when performance is critical? TODO: test performance of inlining these, with / without closure compiler
    m00: function() { return this.entries[ 0 ]; },
    m01: function() { return this.entries[ 3 ]; },
    m02: function() { return this.entries[ 6 ]; },
    m10: function() { return this.entries[ 1 ]; },
    m11: function() { return this.entries[ 4 ]; },
    m12: function() { return this.entries[ 7 ]; },
    m20: function() { return this.entries[ 2 ]; },
    m21: function() { return this.entries[ 5 ]; },
    m22: function() { return this.entries[ 8 ]; },

    isIdentity: function() {
      return this.type === Types.IDENTITY || this.equals( Matrix3.IDENTITY );
    },

    // returning false means "inconclusive, may be identity or not"
    isFastIdentity: function() {
      return this.type === Types.IDENTITY;
    },

    isAffine: function() {
      return this.type === Types.AFFINE || ( this.m20() === 0 && this.m21() === 0 && this.m22() === 1 );
    },

    // if it's an affine matrix where the components of transforms are independent
    // i.e. constructed from arbitrary component scaling and translation.
    isAligned: function() {
      // non-diagonal non-translation entries should all be zero.
      return this.isAffine() && this.m01() === 0 && this.m10() === 0;
    },

    // if it's an affine matrix where the components of transforms are independent, but may be switched (unlike isAligned)
    // i.e. the 2x2 rotational sub-matrix is of one of the two forms:
    // A 0  or  0  A
    // 0 B      B  0
    // This means that moving a transformed point by (x,0) or (0,y) will result in a motion along one of the axes.
    isAxisAligned: function() {
      return this.isAffine() && ( ( this.m01() === 0 && this.m10() === 0 ) || ( this.m00() === 0 && this.m11() === 0 ) );
    },

    isFinite: function() {
      return isFinite( this.m00() ) &&
             isFinite( this.m01() ) &&
             isFinite( this.m02() ) &&
             isFinite( this.m10() ) &&
             isFinite( this.m11() ) &&
             isFinite( this.m12() ) &&
             isFinite( this.m20() ) &&
             isFinite( this.m21() ) &&
             isFinite( this.m22() );
    },

    getDeterminant: function() {
      return this.m00() * this.m11() * this.m22() + this.m01() * this.m12() * this.m20() + this.m02() * this.m10() * this.m21() - this.m02() * this.m11() * this.m20() - this.m01() * this.m10() * this.m22() - this.m00() * this.m12() * this.m21();
    },
    get determinant() { return this.getDeterminant(); },

    // the 2D translation, assuming multiplication with a homogeneous vector
    getTranslation: function() {
      return new dot.Vector2( this.m02(), this.m12() );
    },
    get translation() { return this.getTranslation(); },

    // returns a vector that is equivalent to ( T(1,0).magnitude(), T(0,1).magnitude() ) where T is a relative transform
    getScaleVector: function() {
      return new dot.Vector2(
        Math.sqrt( this.m00() * this.m00() + this.m10() * this.m10() ),
        Math.sqrt( this.m01() * this.m01() + this.m11() * this.m11() ) );
    },
    get scaleVector() { return this.getScaleVector(); },

    // angle in radians for the 2d rotation from this matrix, between pi, -pi
    getRotation: function() {
      return Math.atan2( this.m10(), this.m00() );
    },
    get rotation() { return this.getRotation(); },

    toMatrix4: function() {
      return new dot.Matrix4(
        this.m00(), this.m01(), this.m02(), 0,
        this.m10(), this.m11(), this.m12(), 0,
        this.m20(), this.m21(), this.m22(), 0,
        0, 0, 0, 1 );
    },

    toAffineMatrix4: function() {
      return new dot.Matrix4(
        this.m00(), this.m01(), 0, this.m02(),
        this.m10(), this.m11(), 0, this.m12(),
        0, 0, 1, 0,
        0, 0, 0, 1 );
    },

    toString: function() {
      return this.m00() + ' ' + this.m01() + ' ' + this.m02() + '\n' +
             this.m10() + ' ' + this.m11() + ' ' + this.m12() + '\n' +
             this.m20() + ' ' + this.m21() + ' ' + this.m22();
    },

    toSVGMatrix: function() {
      var result = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' ).createSVGMatrix();

      // top two rows
      result.a = this.m00();
      result.b = this.m10();
      result.c = this.m01();
      result.d = this.m11();
      result.e = this.m02();
      result.f = this.m12();

      return result;
    },

    getCSSTransform: function() {
      // See http://www.w3.org/TR/css3-transforms/, particularly Section 13 that discusses the SVG compatibility

      // We need to prevent the numbers from being in an exponential toString form, since the CSS transform does not support that
      // 20 is the largest guaranteed number of digits according to https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toFixed
      // See https://github.com/phetsims/dot/issues/36

      // the inner part of a CSS3 transform, but remember to add the browser-specific parts!
      // NOTE: the toFixed calls are inlined for performance reasons
      return 'matrix(' + this.entries[ 0 ].toFixed( 20 ) + ',' + this.entries[ 1 ].toFixed( 20 ) + ',' + this.entries[ 3 ].toFixed( 20 ) + ',' + this.entries[ 4 ].toFixed( 20 ) + ',' + this.entries[ 6 ].toFixed( 20 ) + ',' + this.entries[ 7 ].toFixed( 20 ) + ')';
    },
    get cssTransform() { return this.getCSSTransform(); },

    getSVGTransform: function() {
      // SVG transform presentation attribute. See http://www.w3.org/TR/SVG/coords.html#TransformAttribute

      // we need to prevent the numbers from being in an exponential toString form, since the CSS transform does not support that
      function svgNumber( number ) {
        // Largest guaranteed number of digits according to https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toFixed
        // See https://github.com/phetsims/dot/issues/36
        return number.toFixed( 20 );
      }

      switch( this.type ) {
        case Types.IDENTITY:
          return '';
        case Types.TRANSLATION_2D:
          return 'translate(' + svgNumber( this.entries[ 6 ] ) + ',' + svgNumber( this.entries[ 7 ] ) + ')';
        case Types.SCALING:
          return 'scale(' + svgNumber( this.entries[ 0 ] ) + ( this.entries[ 0 ] === this.entries[ 4 ] ? '' : ',' + svgNumber( this.entries[ 4 ] ) ) + ')';
        default:
          return 'matrix(' + svgNumber( this.entries[ 0 ] ) + ',' + svgNumber( this.entries[ 1 ] ) + ',' + svgNumber( this.entries[ 3 ] ) + ',' + svgNumber( this.entries[ 4 ] ) + ',' + svgNumber( this.entries[ 6 ] ) + ',' + svgNumber( this.entries[ 7 ] ) + ')';
      }
    },
    get svgTransform() { return this.getSVGTransform(); },

    // returns a parameter object suitable for use with jQuery's .css()
    getCSSTransformStyles: function() {
      var transformCSS = this.getCSSTransform();

      // notes on triggering hardware acceleration: http://creativejs.com/2011/12/day-2-gpu-accelerate-your-dom-elements/
      return {
        // force iOS hardware acceleration
        '-webkit-perspective': 1000,
        '-webkit-backface-visibility': 'hidden',

        '-webkit-transform': transformCSS + ' translateZ(0)', // trigger hardware acceleration if possible
        '-moz-transform': transformCSS + ' translateZ(0)', // trigger hardware acceleration if possible
        '-ms-transform': transformCSS,
        '-o-transform': transformCSS,
        'transform': transformCSS,
        'transform-origin': 'top left', // at the origin of the component. consider 0px 0px instead. Critical, since otherwise this defaults to 50% 50%!!! see https://developer.mozilla.org/en-US/docs/CSS/transform-origin
        '-ms-transform-origin': 'top left' // TODO: do we need other platform-specific transform-origin styles?
      };
    },
    get cssTransformStyles() { return this.getCSSTransformStyles(); },

    // exact equality
    equals: function( m ) {
      return this.m00() === m.m00() && this.m01() === m.m01() && this.m02() === m.m02() &&
             this.m10() === m.m10() && this.m11() === m.m11() && this.m12() === m.m12() &&
             this.m20() === m.m20() && this.m21() === m.m21() && this.m22() === m.m22();
    },

    // equality within a margin of error
    equalsEpsilon: function( m, epsilon ) {
      return Math.abs( this.m00() - m.m00() ) < epsilon && Math.abs( this.m01() - m.m01() ) < epsilon && Math.abs( this.m02() - m.m02() ) < epsilon &&
             Math.abs( this.m10() - m.m10() ) < epsilon && Math.abs( this.m11() - m.m11() ) < epsilon && Math.abs( this.m12() - m.m12() ) < epsilon &&
             Math.abs( this.m20() - m.m20() ) < epsilon && Math.abs( this.m21() - m.m21() ) < epsilon && Math.abs( this.m22() - m.m22() ) < epsilon;
    },

    /*---------------------------------------------------------------------------*
     * Immutable operations (returns a new matrix)
     *----------------------------------------------------------------------------*/

    copy: function() {
      return Matrix3.createFromPool(
        this.m00(), this.m01(), this.m02(),
        this.m10(), this.m11(), this.m12(),
        this.m20(), this.m21(), this.m22(),
        this.type
      );
    },

    plus: function( m ) {
      return Matrix3.createFromPool(
        this.m00() + m.m00(), this.m01() + m.m01(), this.m02() + m.m02(),
        this.m10() + m.m10(), this.m11() + m.m11(), this.m12() + m.m12(),
        this.m20() + m.m20(), this.m21() + m.m21(), this.m22() + m.m22()
      );
    },

    minus: function( m ) {
      return Matrix3.createFromPool(
        this.m00() - m.m00(), this.m01() - m.m01(), this.m02() - m.m02(),
        this.m10() - m.m10(), this.m11() - m.m11(), this.m12() - m.m12(),
        this.m20() - m.m20(), this.m21() - m.m21(), this.m22() - m.m22()
      );
    },

    transposed: function() {
      return Matrix3.createFromPool(
        this.m00(), this.m10(), this.m20(),
        this.m01(), this.m11(), this.m21(),
        this.m02(), this.m12(), this.m22(), ( this.type === Types.IDENTITY || this.type === Types.SCALING ) ? this.type : undefined
      );
    },

    negated: function() {
      return Matrix3.createFromPool(
        -this.m00(), -this.m01(), -this.m02(),
        -this.m10(), -this.m11(), -this.m12(),
        -this.m20(), -this.m21(), -this.m22()
      );
    },

    inverted: function() {
      var det;

      switch( this.type ) {
        case Types.IDENTITY:
          return this;
        case Types.TRANSLATION_2D:
          return Matrix3.createFromPool(
            1, 0, -this.m02(),
            0, 1, -this.m12(),
            0, 0, 1, Types.TRANSLATION_2D );
        case Types.SCALING:
          return Matrix3.createFromPool(
            1 / this.m00(), 0, 0,
            0, 1 / this.m11(), 0,
            0, 0, 1 / this.m22(), Types.SCALING );
        case Types.AFFINE:
          det = this.getDeterminant();
          if ( det !== 0 ) {
            return Matrix3.createFromPool(
              ( -this.m12() * this.m21() + this.m11() * this.m22() ) / det,
              ( this.m02() * this.m21() - this.m01() * this.m22() ) / det,
              ( -this.m02() * this.m11() + this.m01() * this.m12() ) / det,
              ( this.m12() * this.m20() - this.m10() * this.m22() ) / det,
              ( -this.m02() * this.m20() + this.m00() * this.m22() ) / det,
              ( this.m02() * this.m10() - this.m00() * this.m12() ) / det,
              0, 0, 1, Types.AFFINE
            );
          }
          else {
            throw new Error( 'Matrix could not be inverted, determinant === 0' );
          }
          break;
        case Types.OTHER:
          det = this.getDeterminant();
          if ( det !== 0 ) {
            return Matrix3.createFromPool(
              ( -this.m12() * this.m21() + this.m11() * this.m22() ) / det,
              ( this.m02() * this.m21() - this.m01() * this.m22() ) / det,
              ( -this.m02() * this.m11() + this.m01() * this.m12() ) / det,
              ( this.m12() * this.m20() - this.m10() * this.m22() ) / det,
              ( -this.m02() * this.m20() + this.m00() * this.m22() ) / det,
              ( this.m02() * this.m10() - this.m00() * this.m12() ) / det,
              ( -this.m11() * this.m20() + this.m10() * this.m21() ) / det,
              ( this.m01() * this.m20() - this.m00() * this.m21() ) / det,
              ( -this.m01() * this.m10() + this.m00() * this.m11() ) / det,
              Types.OTHER
            );
          }
          else {
            throw new Error( 'Matrix could not be inverted, determinant === 0' );
          }
          break;
        default:
          throw new Error( 'Matrix3.inverted with unknown type: ' + this.type );
      }
    },

    timesMatrix: function( m ) {
      // I * M === M * I === M (the identity)
      if ( this.type === Types.IDENTITY || m.type === Types.IDENTITY ) {
        return this.type === Types.IDENTITY ? m : this;
      }

      if ( this.type === m.type ) {
        // currently two matrices of the same type will result in the same result type
        if ( this.type === Types.TRANSLATION_2D ) {
          // faster combination of translations
          return Matrix3.createFromPool(
            1, 0, this.m02() + m.m02(),
            0, 1, this.m12() + m.m12(),
            0, 0, 1, Types.TRANSLATION_2D );
        }
        else if ( this.type === Types.SCALING ) {
          // faster combination of scaling
          return Matrix3.createFromPool(
            this.m00() * m.m00(), 0, 0,
            0, this.m11() * m.m11(), 0,
            0, 0, 1, Types.SCALING );
        }
      }

      if ( this.type !== Types.OTHER && m.type !== Types.OTHER ) {
        // currently two matrices that are anything but "other" are technically affine, and the result will be affine

        // affine case
        return Matrix3.createFromPool(
          this.m00() * m.m00() + this.m01() * m.m10(),
          this.m00() * m.m01() + this.m01() * m.m11(),
          this.m00() * m.m02() + this.m01() * m.m12() + this.m02(),
          this.m10() * m.m00() + this.m11() * m.m10(),
          this.m10() * m.m01() + this.m11() * m.m11(),
          this.m10() * m.m02() + this.m11() * m.m12() + this.m12(),
          0, 0, 1, Types.AFFINE );
      }

      // general case
      return Matrix3.createFromPool(
        this.m00() * m.m00() + this.m01() * m.m10() + this.m02() * m.m20(),
        this.m00() * m.m01() + this.m01() * m.m11() + this.m02() * m.m21(),
        this.m00() * m.m02() + this.m01() * m.m12() + this.m02() * m.m22(),
        this.m10() * m.m00() + this.m11() * m.m10() + this.m12() * m.m20(),
        this.m10() * m.m01() + this.m11() * m.m11() + this.m12() * m.m21(),
        this.m10() * m.m02() + this.m11() * m.m12() + this.m12() * m.m22(),
        this.m20() * m.m00() + this.m21() * m.m10() + this.m22() * m.m20(),
        this.m20() * m.m01() + this.m21() * m.m11() + this.m22() * m.m21(),
        this.m20() * m.m02() + this.m21() * m.m12() + this.m22() * m.m22() );
    },

    /*---------------------------------------------------------------------------*
     * Immutable operations (returns new form of a parameter)
     *----------------------------------------------------------------------------*/

    timesVector2: function( v ) {
      var x = this.m00() * v.x + this.m01() * v.y + this.m02();
      var y = this.m10() * v.x + this.m11() * v.y + this.m12();
      return new dot.Vector2( x, y );
    },

    timesVector3: function( v ) {
      var x = this.m00() * v.x + this.m01() * v.y + this.m02() * v.z;
      var y = this.m10() * v.x + this.m11() * v.y + this.m12() * v.z;
      var z = this.m20() * v.x + this.m21() * v.y + this.m22() * v.z;
      return new dot.Vector3( x, y, z );
    },

    timesTransposeVector2: function( v ) {
      var x = this.m00() * v.x + this.m10() * v.y;
      var y = this.m01() * v.x + this.m11() * v.y;
      return new dot.Vector2( x, y );
    },

    // TODO: this operation seems to not work for transformDelta2, should be vetted
    timesRelativeVector2: function( v ) {
      var x = this.m00() * v.x + this.m01() * v.y;
      var y = this.m10() * v.y + this.m11() * v.y;
      return new dot.Vector2( x, y );
    },

    /*---------------------------------------------------------------------------*
     * Mutable operations (changes this matrix)
     *----------------------------------------------------------------------------*/

    // every mutable method goes through rowMajor
    rowMajor: function( v00, v01, v02, v10, v11, v12, v20, v21, v22, type ) {
      this.entries[ 0 ] = v00;
      this.entries[ 1 ] = v10;
      this.entries[ 2 ] = v20;
      this.entries[ 3 ] = v01;
      this.entries[ 4 ] = v11;
      this.entries[ 5 ] = v21;
      this.entries[ 6 ] = v02;
      this.entries[ 7 ] = v12;
      this.entries[ 8 ] = v22;

      // TODO: consider performance of the affine check here
      this.type = type === undefined ? ( ( v20 === 0 && v21 === 0 && v22 === 1 ) ? Types.AFFINE : Types.OTHER ) : type;
      return this;
    },

    set: function( matrix ) {
      return this.rowMajor(
        matrix.m00(), matrix.m01(), matrix.m02(),
        matrix.m10(), matrix.m11(), matrix.m12(),
        matrix.m20(), matrix.m21(), matrix.m22(),
        matrix.type );
    },

    setArray: function( array ) {
      return this.rowMajor(
        array[ 0 ], array[ 3 ], array[ 6 ],
        array[ 1 ], array[ 4 ], array[ 7 ],
        array[ 2 ], array[ 5 ], array[ 8 ] );
    },

    // component setters
    set00: function( value ) {
      this.entries[ 0 ] = value;
      return this;
    },
    set01: function( value ) {
      this.entries[ 3 ] = value;
      return this;
    },
    set02: function( value ) {
      this.entries[ 6 ] = value;
      return this;
    },
    set10: function( value ) {
      this.entries[ 1 ] = value;
      return this;
    },
    set11: function( value ) {
      this.entries[ 4 ] = value;
      return this;
    },
    set12: function( value ) {
      this.entries[ 7 ] = value;
      return this;
    },
    set20: function( value ) {
      this.entries[ 2 ] = value;
      return this;
    },
    set21: function( value ) {
      this.entries[ 5 ] = value;
      return this;
    },
    set22: function( value ) {
      this.entries[ 8 ] = value;
      return this;
    },

    makeImmutable: function() {
      this.rowMajor = function() {
        throw new Error( 'Cannot modify immutable matrix' );
      };
      return this;
    },

    columnMajor: function( v00, v10, v20, v01, v11, v21, v02, v12, v22, type ) {
      return this.rowMajor( v00, v01, v02, v10, v11, v12, v20, v21, v22, type );
    },

    add: function( m ) {
      return this.rowMajor(
        this.m00() + m.m00(), this.m01() + m.m01(), this.m02() + m.m02(),
        this.m10() + m.m10(), this.m11() + m.m11(), this.m12() + m.m12(),
        this.m20() + m.m20(), this.m21() + m.m21(), this.m22() + m.m22()
      );
    },

    subtract: function( m ) {
      return this.rowMajor(
        this.m00() - m.m00(), this.m01() - m.m01(), this.m02() - m.m02(),
        this.m10() - m.m10(), this.m11() - m.m11(), this.m12() - m.m12(),
        this.m20() - m.m20(), this.m21() - m.m21(), this.m22() - m.m22()
      );
    },

    transpose: function() {
      return this.rowMajor(
        this.m00(), this.m10(), this.m20(),
        this.m01(), this.m11(), this.m21(),
        this.m02(), this.m12(), this.m22(),
        ( this.type === Types.IDENTITY || this.type === Types.SCALING ) ? this.type : undefined
      );
    },

    negate: function() {
      return this.rowMajor(
        -this.m00(), -this.m01(), -this.m02(),
        -this.m10(), -this.m11(), -this.m12(),
        -this.m20(), -this.m21(), -this.m22()
      );
    },

    invert: function() {
      var det;

      switch( this.type ) {
        case Types.IDENTITY:
          return this;
        case Types.TRANSLATION_2D:
          return this.rowMajor(
            1, 0, -this.m02(),
            0, 1, -this.m12(),
            0, 0, 1, Types.TRANSLATION_2D );
        case Types.SCALING:
          return this.rowMajor(
            1 / this.m00(), 0, 0,
            0, 1 / this.m11(), 0,
            0, 0, 1 / this.m22(), Types.SCALING );
        case Types.AFFINE:
          det = this.getDeterminant();
          if ( det !== 0 ) {
            return this.rowMajor(
              ( -this.m12() * this.m21() + this.m11() * this.m22() ) / det,
              ( this.m02() * this.m21() - this.m01() * this.m22() ) / det,
              ( -this.m02() * this.m11() + this.m01() * this.m12() ) / det,
              ( this.m12() * this.m20() - this.m10() * this.m22() ) / det,
              ( -this.m02() * this.m20() + this.m00() * this.m22() ) / det,
              ( this.m02() * this.m10() - this.m00() * this.m12() ) / det,
              0, 0, 1, Types.AFFINE
            );
          }
          else {
            throw new Error( 'Matrix could not be inverted, determinant === 0' );
          }
          break;
        case Types.OTHER:
          det = this.getDeterminant();
          if ( det !== 0 ) {
            return this.rowMajor(
              ( -this.m12() * this.m21() + this.m11() * this.m22() ) / det,
              ( this.m02() * this.m21() - this.m01() * this.m22() ) / det,
              ( -this.m02() * this.m11() + this.m01() * this.m12() ) / det,
              ( this.m12() * this.m20() - this.m10() * this.m22() ) / det,
              ( -this.m02() * this.m20() + this.m00() * this.m22() ) / det,
              ( this.m02() * this.m10() - this.m00() * this.m12() ) / det,
              ( -this.m11() * this.m20() + this.m10() * this.m21() ) / det,
              ( this.m01() * this.m20() - this.m00() * this.m21() ) / det,
              ( -this.m01() * this.m10() + this.m00() * this.m11() ) / det,
              Types.OTHER
            );
          }
          else {
            throw new Error( 'Matrix could not be inverted, determinant === 0' );
          }
          break;
        default:
          throw new Error( 'Matrix3.inverted with unknown type: ' + this.type );
      }
    },

    multiplyMatrix: function( m ) {
      // M * I === M (the identity)
      if ( m.type === Types.IDENTITY ) {
        // no change needed
        return this;
      }

      // I * M === M (the identity)
      if ( this.type === Types.IDENTITY ) {
        // copy the other matrix to us
        return this.set( m );
      }

      if ( this.type === m.type ) {
        // currently two matrices of the same type will result in the same result type
        if ( this.type === Types.TRANSLATION_2D ) {
          // faster combination of translations
          return this.rowMajor(
            1, 0, this.m02() + m.m02(),
            0, 1, this.m12() + m.m12(),
            0, 0, 1, Types.TRANSLATION_2D );
        }
        else if ( this.type === Types.SCALING ) {
          // faster combination of scaling
          return this.rowMajor(
            this.m00() * m.m00(), 0, 0,
            0, this.m11() * m.m11(), 0,
            0, 0, 1, Types.SCALING );
        }
      }

      if ( this.type !== Types.OTHER && m.type !== Types.OTHER ) {
        // currently two matrices that are anything but "other" are technically affine, and the result will be affine

        // affine case
        return this.rowMajor(
          this.m00() * m.m00() + this.m01() * m.m10(),
          this.m00() * m.m01() + this.m01() * m.m11(),
          this.m00() * m.m02() + this.m01() * m.m12() + this.m02(),
          this.m10() * m.m00() + this.m11() * m.m10(),
          this.m10() * m.m01() + this.m11() * m.m11(),
          this.m10() * m.m02() + this.m11() * m.m12() + this.m12(),
          0, 0, 1, Types.AFFINE );
      }

      // general case
      return this.rowMajor(
        this.m00() * m.m00() + this.m01() * m.m10() + this.m02() * m.m20(),
        this.m00() * m.m01() + this.m01() * m.m11() + this.m02() * m.m21(),
        this.m00() * m.m02() + this.m01() * m.m12() + this.m02() * m.m22(),
        this.m10() * m.m00() + this.m11() * m.m10() + this.m12() * m.m20(),
        this.m10() * m.m01() + this.m11() * m.m11() + this.m12() * m.m21(),
        this.m10() * m.m02() + this.m11() * m.m12() + this.m12() * m.m22(),
        this.m20() * m.m00() + this.m21() * m.m10() + this.m22() * m.m20(),
        this.m20() * m.m01() + this.m21() * m.m11() + this.m22() * m.m21(),
        this.m20() * m.m02() + this.m21() * m.m12() + this.m22() * m.m22() );
    },

    prependTranslation: function( x, y ) {
      this.set02( this.m02() + x );
      this.set12( this.m12() + y );

      if ( this.type === Types.IDENTITY || this.type === Types.TRANSLATION_2D ) {
        this.type = Types.TRANSLATION_2D;
      }
      else if ( this.type === Types.OTHER ) {
        this.type = Types.OTHER;
      }
      else {
        this.type = Types.AFFINE;
      }
      return this; // for chaining
    },

    setToIdentity: function() {
      return this.rowMajor(
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
        Types.IDENTITY );
    },

    setToTranslation: function( x, y ) {
      return this.rowMajor(
        1, 0, x,
        0, 1, y,
        0, 0, 1,
        Types.TRANSLATION_2D );
    },

    setToScale: function( x, y ) {
      // allow using one parameter to scale everything
      y = y === undefined ? x : y;

      return this.rowMajor(
        x, 0, 0,
        0, y, 0,
        0, 0, 1,
        Types.SCALING );
    },

    // row major
    setToAffine: function( m00, m01, m02, m10, m11, m12 ) {
      return this.rowMajor( m00, m01, m02, m10, m11, m12, 0, 0, 1, Types.AFFINE );
    },

    // axis is a normalized Vector3, angle in radians.
    setToRotationAxisAngle: function( axis, angle ) {
      var c = Math.cos( angle );
      var s = Math.sin( angle );
      var C = 1 - c;

      return this.rowMajor(
        axis.x * axis.x * C + c, axis.x * axis.y * C - axis.z * s, axis.x * axis.z * C + axis.y * s,
        axis.y * axis.x * C + axis.z * s, axis.y * axis.y * C + c, axis.y * axis.z * C - axis.x * s,
        axis.z * axis.x * C - axis.y * s, axis.z * axis.y * C + axis.x * s, axis.z * axis.z * C + c,
        Types.OTHER );
    },

    setToRotationX: function( angle ) {
      var c = Math.cos( angle );
      var s = Math.sin( angle );

      return this.rowMajor(
        1, 0, 0,
        0, c, -s,
        0, s, c,
        Types.OTHER );
    },

    setToRotationY: function( angle ) {
      var c = Math.cos( angle );
      var s = Math.sin( angle );

      return this.rowMajor(
        c, 0, s,
        0, 1, 0,
        -s, 0, c,
        Types.OTHER );
    },

    setToRotationZ: function( angle ) {
      var c = Math.cos( angle );
      var s = Math.sin( angle );

      return this.rowMajor(
        c, -s, 0,
        s, c, 0,
        0, 0, 1,
        Types.AFFINE );
    },

    setToSVGMatrix: function( svgMatrix ) {
      return this.rowMajor(
        svgMatrix.a, svgMatrix.c, svgMatrix.e,
        svgMatrix.b, svgMatrix.d, svgMatrix.f,
        0, 0, 1,
        Types.AFFINE );
    },

    // a rotation matrix that rotates A to B (Vector3 instances), by rotating about the axis A.cross( B ) -- Shortest path. ideally should be unit vectors
    setRotationAToB: function( a, b ) {
      // see http://graphics.cs.brown.edu/~jfh/papers/Moller-EBA-1999/paper.pdf for information on this implementation
      var start = a;
      var end = b;

      var epsilon = 0.0001;

      var e;
      var h;
      var f;

      var v = start.cross( end );
      e = start.dot( end );
      f = ( e < 0 ) ? -e : e;

      // if "from" and "to" vectors are nearly parallel
      if ( f > 1.0 - epsilon ) {
        var c1;
        var c2;
        var c3;

        var x = new dot.Vector3(
          ( start.x > 0.0 ) ? start.x : -start.x,
          ( start.y > 0.0 ) ? start.y : -start.y,
          ( start.z > 0.0 ) ? start.z : -start.z
        );

        if ( x.x < x.y ) {
          if ( x.x < x.z ) {
            x = dot.Vector3.X_UNIT;
          }
          else {
            x = dot.Vector3.Z_UNIT;
          }
        }
        else {
          if ( x.y < x.z ) {
            x = dot.Vector3.Y_UNIT;
          }
          else {
            x = dot.Vector3.Z_UNIT;
          }
        }

        var u = x.minus( start );
        v = x.minus( end );

        c1 = 2.0 / u.dot( u );
        c2 = 2.0 / v.dot( v );
        c3 = c1 * c2 * u.dot( v );

        return this.rowMajor(
          -c1 * u.x * u.x - c2 * v.x * v.x + c3 * v.x * u.x + 1,
          -c1 * u.x * u.y - c2 * v.x * v.y + c3 * v.x * u.y,
          -c1 * u.x * u.z - c2 * v.x * v.z + c3 * v.x * u.z,
          -c1 * u.y * u.x - c2 * v.y * v.x + c3 * v.y * u.x,
          -c1 * u.y * u.y - c2 * v.y * v.y + c3 * v.y * u.y + 1,
          -c1 * u.y * u.z - c2 * v.y * v.z + c3 * v.y * u.z,
          -c1 * u.z * u.x - c2 * v.z * v.x + c3 * v.z * u.x,
          -c1 * u.z * u.y - c2 * v.z * v.y + c3 * v.z * u.y,
          -c1 * u.z * u.z - c2 * v.z * v.z + c3 * v.z * u.z + 1
        );
      }
      else {
        // the most common case, unless "start"="end", or "start"=-"end"
        var hvx;
        var hvz;
        var hvxy;
        var hvxz;
        var hvyz;
        h = 1.0 / ( 1.0 + e );
        hvx = h * v.x;
        hvz = h * v.z;
        hvxy = hvx * v.y;
        hvxz = hvx * v.z;
        hvyz = hvz * v.y;

        return this.rowMajor(
          e + hvx * v.x, hvxy - v.z, hvxz + v.y,
          hvxy + v.z, e + h * v.y * v.y, hvyz - v.x,
          hvxz - v.y, hvyz + v.x, e + hvz * v.z
        );
      }
    },

    setTo32Bit: function() {
      if ( window.Float32Array ) {
        this.entries = new window.Float32Array( this.entries );
      }
      return this;
    },

    setTo64Bit: function() {
      if ( window.Float64Array ) {
        this.entries = new window.Float64Array( this.entries );
      }
      return this;
    },

    /*---------------------------------------------------------------------------*
     * Mutable operations (changes the parameter)
     *----------------------------------------------------------------------------*/

    multiplyVector2: function( v ) {
      return v.setXY(
        this.m00() * v.x + this.m01() * v.y + this.m02(),
        this.m10() * v.x + this.m11() * v.y + this.m12() );
    },

    multiplyVector3: function( v ) {
      return v.setXYZ(
        this.m00() * v.x + this.m01() * v.y + this.m02() * v.z,
        this.m10() * v.x + this.m11() * v.y + this.m12() * v.z,
        this.m20() * v.x + this.m21() * v.y + this.m22() * v.z );
    },

    multiplyTransposeVector2: function( v ) {
      return v.setXY(
        this.m00() * v.x + this.m10() * v.y,
        this.m01() * v.x + this.m11() * v.y );
    },

    multiplyRelativeVector2: function( v ) {
      return v.setXY(
        this.m00() * v.x + this.m01() * v.y,
        this.m10() * v.y + this.m11() * v.y );
    },

    // sets the transform of a Canvas 2D rendering context to the affine part of this matrix
    canvasSetTransform: function( context ) {
      context.setTransform(
        // inlined array entries
        this.entries[ 0 ],
        this.entries[ 1 ],
        this.entries[ 3 ],
        this.entries[ 4 ],
        this.entries[ 6 ],
        this.entries[ 7 ]
      );
    },

    // appends the affine part of this matrix to the Canvas 2D rendering context
    canvasAppendTransform: function( context ) {
      if ( this.type !== Types.IDENTITY ) {
        context.transform(
          // inlined array entries
          this.entries[ 0 ],
          this.entries[ 1 ],
          this.entries[ 3 ],
          this.entries[ 4 ],
          this.entries[ 6 ],
          this.entries[ 7 ]
        );
      }
    }
  };

  Poolable.mixin( Matrix3, {

    //The default factory creates an identity matrix
    defaultFactory: function() { return new Matrix3(); },

    constructorDuplicateFactory: function( pool ) {
      return function( v00, v01, v02, v10, v11, v12, v20, v21, v22, type ) {
        var instance = pool.length ? pool.pop() : new Matrix3();
        return instance.rowMajor( v00, v01, v02, v10, v11, v12, v20, v21, v22, type );
      };
    }
  } );

  // create an immutable
  Matrix3.IDENTITY = Matrix3.identity();
  Matrix3.IDENTITY.makeImmutable();

  Matrix3.X_REFLECTION = Matrix3.createFromPool(
    -1, 0, 0,
    0, 1, 0,
    0, 0, 1,
    Types.AFFINE );
  Matrix3.X_REFLECTION.makeImmutable();

  Matrix3.Y_REFLECTION = Matrix3.createFromPool(
    1, 0, 0,
    0, -1, 0,
    0, 0, 1,
    Types.AFFINE );
  Matrix3.Y_REFLECTION.makeImmutable();

  //Shortcut for translation times a matrix (without allocating a translation matrix), see scenery#119
  Matrix3.translationTimesMatrix = function( x, y, m ) {
    var type;
    if ( m.type === Types.IDENTITY || m.type === Types.TRANSLATION_2D ) {
      return Matrix3.createFromPool(
        1, 0, m.m02() + x,
        0, 1, m.m12() + y,
        0, 0, 1,
        Types.TRANSLATION_2D );
    }
    else if ( m.type === Types.OTHER ) {
      type = Types.OTHER;
    }
    else {
      type = Types.AFFINE;
    }
    return Matrix3.createFromPool(
      m.m00(), m.m01(), m.m02() + x,
      m.m10(), m.m11(), m.m12() + y,
      m.m20(), m.m21(), m.m22(),
      type );
  };

  Matrix3.printer = {
    print: function( matrix ) {
      console.log( matrix.toString() );
    }
  };

  return Matrix3;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Quadratic Bezier segment
 *
 * Good reference: http://cagd.cs.byu.edu/~557/text/ch2.pdf
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Quadratic',['require','PHET_CORE/inherit','DOT/Bounds2','DOT/Matrix3','DOT/Util','DOT/Util','KITE/kite','KITE/segments/Segment'],function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var solveQuadraticRootsReal = require( 'DOT/Util' ).solveQuadraticRootsReal;
  var arePointsCollinear = require( 'DOT/Util' ).arePointsCollinear;

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  function Quadratic( start, control, end ) {
    Segment.call( this );

    this._start = start;
    this._control = control;
    this._end = end;

    this.invalidate();
  }

  kite.register( 'Quadratic', Quadratic );

  inherit( Segment, Quadratic, {

    degree: 2,

    // @public - Clears cached information, should be called when any of the 'constructor arguments' are mutated.
    invalidate: function() {
      // Lazily-computed derived information
      this._startTangent = null; // {Vector2 | null}
      this._endTangent = null; // {Vector2 | null}
      this._tCriticalX = null; // {number | null} T where x-derivative is 0 (replaced with NaN if not in range)
      this._tCriticalY = null; // {number | null} T where y-derivative is 0 (replaced with NaN if not in range)

      this._bounds = null; // {Bounds2 | null}

      this.trigger0( 'invalidated' );
    },

    getStartTangent: function() {
      if ( this._startTangent === null ) {
        var controlIsStart = this._start.equals( this._control );
        // TODO: allocation reduction
        this._startTangent = controlIsStart ?
                             this._end.minus( this._start ).normalized() :
                             this._control.minus( this._start ).normalized();
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      if ( this._endTangent === null ) {
        var controlIsEnd = this._end.equals( this._control );
        // TODO: allocation reduction
        this._endTangent = controlIsEnd ?
                           this._end.minus( this._start ).normalized() :
                           this._end.minus( this._control ).normalized();
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    getTCriticalX: function() {
      // compute x where the derivative is 0 (used for bounds and other things)
      if ( this._tCriticalX === null ) {
        this._tCriticalX = Quadratic.extremaT( this._start.x, this._control.x, this._end.x );
      }
      return this._tCriticalX;
    },
    get tCriticalX() { return this.getTCriticalX(); },

    getTCriticalY: function() {
      // compute y where the derivative is 0 (used for bounds and other things)
      if ( this._tCriticalY === null ) {
        this._tCriticalY = Quadratic.extremaT( this._start.y, this._control.y, this._end.y );
      }
      return this._tCriticalY;
    },
    get tCriticalY() { return this.getTCriticalY(); },

    getNondegenerateSegments: function() {
      var start = this._start;
      var control = this._control;
      var end = this._end;

      var startIsEnd = start.equals( end );
      var startIsControl = start.equals( control );
      var endIsControl = start.equals( control );

      if ( startIsEnd && startIsControl ) {
        // all same points
        return [];
      }
      else if ( startIsEnd ) {
        // this is a special collinear case, we basically line out to the farthest point and back
        var halfPoint = this.positionAt( 0.5 );
        return [
          new kite.Line( start, halfPoint ),
          new kite.Line( halfPoint, end )
        ];
      }
      else if ( arePointsCollinear( start, control, end ) ) {
        // if they are collinear, we can reduce to start->control and control->end, or if control is between, just one line segment
        // also, start !== end (handled earlier)
        if ( startIsControl || endIsControl ) {
          // just a line segment!
          return [ new kite.Line( start, end ) ]; // no extra nondegenerate check since start !== end
        }
        // now control point must be unique. we check to see if our rendered path will be outside of the start->end line segment
        var delta = end.minus( start );
        var p1d = control.minus( start ).dot( delta.normalized ) / delta.magnitude();
        var t = Quadratic.extremaT( 0, p1d, 1 );
        if ( !isNaN( t ) && t > 0 && t < 1 ) {
          // we have a local max inside the range, indicating that our extrema point is outside of start->end
          // we'll line to and from it
          var pt = this.positionAt( t );
          return _.flatten( [
            new kite.Line( start, pt ).getNondegenerateSegments(),
            new kite.Line( pt, end ).getNondegenerateSegments()
          ] );
        }
        else {
          // just provide a line segment, our rendered path doesn't go outside of this
          return [ new kite.Line( start, end ) ]; // no extra nondegenerate check since start !== end
        }
      }
      else {
        return [ this ];
      }
    },

    getBounds: function() {
      // calculate our temporary guaranteed lower bounds based on the end points
      if ( this._bounds === null ) {
        this._bounds = new Bounds2( Math.min( this._start.x, this._end.x ), Math.min( this._start.y, this._end.y ), Math.max( this._start.x, this._end.x ), Math.max( this._start.y, this._end.y ) );

        // compute x and y where the derivative is 0, so we can include this in the bounds
        var tCriticalX = this.getTCriticalX();
        var tCriticalY = this.getTCriticalY();

        if ( !isNaN( tCriticalX ) && tCriticalX > 0 && tCriticalX < 1 ) {
          this._bounds = this._bounds.withPoint( this.positionAt( tCriticalX ) );
        }
        if ( !isNaN( tCriticalY ) && tCriticalY > 0 && tCriticalY < 1 ) {
          this._bounds = this._bounds.withPoint( this.positionAt( tCriticalY ) );
        }
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    // can be described from t=[0,1] as: (1-t)^2 start + 2(1-t)t control + t^2 end
    positionAt: function( t ) {
      var mt = 1 - t;
      // TODO: allocation reduction
      return this._start.times( mt * mt ).plus( this._control.times( 2 * mt * t ) ).plus( this._end.times( t * t ) );
    },

    // derivative: 2(1-t)( control - start ) + 2t( end - control )
    tangentAt: function( t ) {
      // TODO: allocation reduction
      return this._control.minus( this._start ).times( 2 * ( 1 - t ) ).plus( this._end.minus( this._control ).times( 2 * t ) );
    },

    curvatureAt: function( t ) {
      // see http://cagd.cs.byu.edu/~557/text/ch2.pdf p31
      // TODO: remove code duplication with Cubic
      var epsilon = 0.0000001;
      if ( Math.abs( t - 0.5 ) > 0.5 - epsilon ) {
        var isZero = t < 0.5;
        var p0 = isZero ? this._start : this._end;
        var p1 = this._control;
        var p2 = isZero ? this._end : this._start;
        var d10 = p1.minus( p0 );
        var a = d10.magnitude();
        var h = ( isZero ? -1 : 1 ) * d10.perpendicular().normalized().dot( p2.minus( p1 ) );
        return ( h * ( this.degree - 1 ) ) / ( this.degree * a * a );
      }
      else {
        return this.subdivided( t, true )[ 0 ].curvatureAt( 1 );
      }
    },

    // see http://www.visgraf.impa.br/sibgrapi96/trabs/pdf/a14.pdf
    // and http://math.stackexchange.com/questions/12186/arc-length-of-bezier-curves for curvature / arc length

    offsetTo: function( r, reverse ) {
      // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html
      // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      var curves = [ this ];

      // subdivide this curve
      var depth = 5; // generates 2^depth curves
      for ( var i = 0; i < depth; i++ ) {
        curves = _.flatten( _.map( curves, function( curve ) {
          return curve.subdivided( 0.5, true );
        } ) );
      }

      var offsetCurves = _.map( curves, function( curve ) { return curve.approximateOffset( r ); } );

      if ( reverse ) {
        offsetCurves.reverse();
        offsetCurves = _.map( offsetCurves, function( curve ) { return curve.reversed( true ); } );
      }

      return offsetCurves;
    },

    subdivided: function( t ) {
      // de Casteljau method
      var leftMid = this._start.blend( this._control, t );
      var rightMid = this._control.blend( this._end, t );
      var mid = leftMid.blend( rightMid, t );
      return [
        new kite.Quadratic( this._start, leftMid, mid ),
        new kite.Quadratic( mid, rightMid, this._end )
      ];
    },

    // elevation of this quadratic Bezier curve to a cubic Bezier curve
    degreeElevated: function() {
      // TODO: allocation reduction
      return new kite.Cubic(
        this._start,
        this._start.plus( this._control.timesScalar( 2 ) ).dividedScalar( 3 ),
        this._end.plus( this._control.timesScalar( 2 ) ).dividedScalar( 3 ),
        this._end
      );
    },

    reversed: function() {
      return new kite.Quadratic( this._end, this._control, this._start );
    },

    approximateOffset: function( r ) {
      return new kite.Quadratic(
        this._start.plus( ( this._start.equals( this._control ) ? this._end.minus( this._start ) : this._control.minus( this._start ) ).perpendicular().normalized().times( r ) ),
        this._control.plus( this._end.minus( this._start ).perpendicular().normalized().times( r ) ),
        this._end.plus( ( this._end.equals( this._control ) ? this._end.minus( this._start ) : this._end.minus( this._control ) ).perpendicular().normalized().times( r ) )
      );
    },

    getSVGPathFragment: function() {
      return 'Q ' + kite.svgNumber( this._control.x ) + ' ' + kite.svgNumber( this._control.y ) + ' ' +
             kite.svgNumber( this._end.x ) + ' ' + kite.svgNumber( this._end.y );
    },

    strokeLeft: function( lineWidth ) {
      return this.offsetTo( -lineWidth / 2, false );
    },

    strokeRight: function( lineWidth ) {
      return this.offsetTo( lineWidth / 2, true );
    },

    getInteriorExtremaTs: function() {
      // TODO: we assume here we are reduce, so that a criticalX doesn't equal a criticalY?
      var result = [];
      var epsilon = 0.0000000001; // TODO: general kite epsilon?

      var criticalX = this.getTCriticalX();
      var criticalY = this.getTCriticalY();

      if ( !isNaN( criticalX ) && criticalX > epsilon && criticalX < 1 - epsilon ) {
        result.push( this.tCriticalX );
      }
      if ( !isNaN( criticalY ) && criticalY > epsilon && criticalY < 1 - epsilon ) {
        result.push( this.tCriticalY );
      }
      return result.sort();
    },

    // returns the resultant winding number of this ray intersecting this segment.
    intersection: function( ray ) {
      var self = this;
      var result = [];

      // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
      var inverseMatrix = Matrix3.rotation2( -ray.direction.angle() ).timesMatrix( Matrix3.translation( -ray.position.x, -ray.position.y ) );

      var p0 = inverseMatrix.timesVector2( this._start );
      var p1 = inverseMatrix.timesVector2( this._control );
      var p2 = inverseMatrix.timesVector2( this._end );

      //(1-t)^2 start + 2(1-t)t control + t^2 end
      var a = p0.y - 2 * p1.y + p2.y;
      var b = -2 * p0.y + 2 * p1.y;
      var c = p0.y;

      var ts = solveQuadraticRootsReal( a, b, c );

      _.each( ts, function( t ) {
        if ( t >= 0 && t <= 1 ) {
          var hitPoint = self.positionAt( t );
          var unitTangent = self.tangentAt( t ).normalized();
          var perp = unitTangent.perpendicular();
          var toHit = hitPoint.minus( ray.position );

          // make sure it's not behind the ray
          if ( toHit.dot( ray.direction ) > 0 ) {
            result.push( {
              distance: toHit.magnitude(),
              point: hitPoint,
              normal: perp.dot( ray.direction ) > 0 ? perp.negated() : perp,
              wind: ray.direction.perpendicular().dot( unitTangent ) < 0 ? 1 : -1
            } );
          }
        }
      } );
      return result;
    },

    windingIntersection: function( ray ) {
      var wind = 0;
      var hits = this.intersection( ray );
      _.each( hits, function( hit ) {
        wind += hit.wind;
      } );
      return wind;
    },

    // assumes the current position is at start
    writeToContext: function( context ) {
      context.quadraticCurveTo( this._control.x, this._control.y, this._end.x, this._end.y );
    },

    transformed: function( matrix ) {
      return new kite.Quadratic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control ), matrix.timesVector2( this._end ) );
    },

    // given the current curve parameterized by t, will return a curve parameterized by x where t = a * x + b
    reparameterized: function( a, b ) {
      // to the polynomial pt^2 + qt + r:
      var p = this._start.plus( this._end.plus( this._control.timesScalar( -2 ) ) );
      var q = this._control.minus( this._start ).timesScalar( 2 );
      var r = this._start;

      // to the polynomial alpha*x^2 + beta*x + gamma:
      var alpha = p.timesScalar( a * a );
      var beta = p.timesScalar( a * b ).timesScalar( 2 ).plus( q.timesScalar( a ) );
      var gamma = p.timesScalar( b * b ).plus( q.timesScalar( b ) ).plus( r );

      // back to the form start,control,end
      return new kite.Quadratic( gamma, beta.timesScalar( 0.5 ).plus( gamma ), alpha.plus( beta ).plus( gamma ) );
    }
  } );

  Segment.addInvalidatingGetterSetter( Quadratic, 'start' );
  Segment.addInvalidatingGetterSetter( Quadratic, 'control' );
  Segment.addInvalidatingGetterSetter( Quadratic, 'end' );

  // one-dimensional solution to extrema
  Quadratic.extremaT = function( start, control, end ) {
    // compute t where the derivative is 0 (used for bounds and other things)
    var divisorX = 2 * ( end - 2 * control + start );
    if ( divisorX !== 0 ) {
      return -2 * ( control - start ) / divisorX;
    }
    else {
      return NaN;
    }
  };

  return Quadratic;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Cubic Bezier segment.
 *
 * See http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf for info
 *
 * Good reference: http://cagd.cs.byu.edu/~557/text/ch2.pdf
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Cubic',['require','PHET_CORE/inherit','DOT/Bounds2','DOT/Vector2','DOT/Matrix3','DOT/Util','DOT/Util','DOT/Util','KITE/kite','KITE/segments/Segment','KITE/segments/Quadratic'],function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Vector2 = require( 'DOT/Vector2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var solveQuadraticRootsReal = require( 'DOT/Util' ).solveQuadraticRootsReal;
  var solveCubicRootsReal = require( 'DOT/Util' ).solveCubicRootsReal;
  var arePointsCollinear = require( 'DOT/Util' ).arePointsCollinear;

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );
  require( 'KITE/segments/Quadratic' );

  var scratchVector1 = new Vector2();
  var scratchVector2 = new Vector2();
  var scratchVector3 = new Vector2();

  /**
   * @param {Vector2} start - Start point of the cubic bezier
   * @param {Vector2} control1 - First control point
   * @param {Vector2} control2 - Second control point
   * @param {Vector2} end - End point of the cubic bezier
   * @constructor
   */
  function Cubic( start, control1, control2, end ) {
    Segment.call( this );

    this._start = start;
    this._control1 = control1;
    this._control2 = control2;
    this._end = end;

    this.invalidate();
  }

  kite.register( 'Cubic', Cubic );

  inherit( Segment, Cubic, {

    degree: 3,

    // @public - Clears cached information, should be called when any of the 'constructor arguments' are mutated.
    invalidate: function() {
      // Lazily-computed derived information
      this._startTangent = null; // {Vector2 | null}
      this._endTangent = null; // {Vector2 | null}
      this._r = null; // {number | null}
      this._s = null; // {number | null}

      // Cusp-specific information
      this._tCusp = null; // {number | null} - T value for a potential cusp
      this._tDeterminant = null; // {number | null}
      this._tInflection1 = null; // {number | null} - NaN if not applicable
      this._tInflection2 = null; // {number | null} - NaN if not applicable
      this._startQuadratic = null; // {Quadratic | null}
      this._endQuadratic = null; // {Quadratic | null}

      // T-values where X and Y (respectively) reach an extrema (not necessarily including 0 and 1)
      this._xExtremaT = null; // {Array.<number> | null}
      this._yExtremaT = null; // {Array.<number> | null}

      this._bounds = null; // {Bounds2 | null}

      this.trigger0( 'invalidated' );
    },

    getStartTangent: function() {
      if ( this._startTangent === null ) {
        this._startTangent = this.tangentAt( 0 ).normalized();
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      if ( this._endTangent === null ) {
        this._endTangent = this.tangentAt( 1 ).normalized();
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    getR: function() {
      // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      if ( this._r === null ) {
        this._r = this._control1.minus( this._start ).normalized();
      }
      return this._r;
    },
    get r() { return this.getR(); },

    getS: function() {
      // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      if ( this._s === null ) {
        this._s = this.getR().perpendicular();
      }
      return this._s;
    },
    get s() { return this.getS(); },

    getTCusp: function() {
      if ( this._tCusp === null ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tCusp !== null );
      return this._tCusp;
    },
    get tCusp() { return this.getTCusp(); },

    getTDeterminant: function() {
      if ( this._tDeterminant === null ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tDeterminant !== null );
      return this._tDeterminant;
    },
    get tDeterminant() { return this.getTDeterminant(); },

    getTInflection1: function() {
      if ( this._tInflection1 === null ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tInflection1 !== null );
      return this._tInflection1;
    },
    get tInflection1() { return this.getTInflection1(); },

    getTInflection2: function() {
      if ( this._tInflection2 === null ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tInflection2 !== null );
      return this._tInflection2;
    },
    get tInflection2() { return this.getTInflection2(); },

    getStartQuadratic: function() {
      if ( this._startQuadratic === null ) {
        this.computeCuspSegments();
      }
      assert && assert( this._startQuadratic !== null );
      return this._startQuadratic;
    },
    get startQuadratic() { return this.getStartQuadratic(); },

    getEndQuadratic: function() {
      if ( this._endQuadratic === null ) {
        this.computeCuspSegments();
      }
      assert && assert( this._endQuadratic !== null );
      return this._endQuadratic;
    },
    get endQuadratic() { return this.getEndQuadratic(); },

    getXExtremaT: function() {
      if ( this._xExtremaT === null ) {
        this._xExtremaT = Cubic.extremaT( this._start.x, this._control1.x, this._control2.x, this._end.x );
      }
      return this._xExtremaT;
    },
    get xExtremaT() { return this.getXExtremaT(); },

    getYExtremaT: function() {
      if ( this._yExtremaT === null ) {
        this._yExtremaT = Cubic.extremaT( this._start.y, this._control1.y, this._control2.y, this._end.y );
      }
      return this._yExtremaT;
    },
    get yExtremaT() { return this.getYExtremaT(); },

    getBounds: function() {
      if ( this._bounds === null ) {
        this._bounds = Bounds2.NOTHING;
        this._bounds = this._bounds.withPoint( this._start );
        this._bounds = this._bounds.withPoint( this._end );

        var cubic = this;
        _.each( this.getXExtremaT(), function( t ) {
          if ( t >= 0 && t <= 1 ) {
            cubic._bounds = cubic._bounds.withPoint( cubic.positionAt( t ) );
          }
        } );
        _.each( this.getYExtremaT(), function( t ) {
          if ( t >= 0 && t <= 1 ) {
            cubic._bounds = cubic._bounds.withPoint( cubic.positionAt( t ) );
          }
        } );

        if ( this.hasCusp() ) {
          this._bounds = this._bounds.withPoint( this.positionAt( this.getTCusp() ) );
        }
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    // t value for the cusp, and the related determinant and inflection points
    computeCuspInfo: function() {
      // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      // TODO: allocation reduction
      var a = this._start.times( -1 ).plus( this._control1.times( 3 ) ).plus( this._control2.times( -3 ) ).plus( this._end );
      var b = this._start.times( 3 ).plus( this._control1.times( -6 ) ).plus( this._control2.times( 3 ) );
      var c = this._start.times( -3 ).plus( this._control1.times( 3 ) );

      var aPerp = a.perpendicular();
      var bPerp = b.perpendicular();
      var aPerpDotB = aPerp.dot( b );

      this._tCusp = -0.5 * ( aPerp.dot( c ) / aPerpDotB );
      this._tDeterminant = this._tCusp * this._tCusp - ( 1 / 3 ) * ( bPerp.dot( c ) / aPerpDotB );
      if ( this._tDeterminant >= 0 ) {
        var sqrtDet = Math.sqrt( this._tDeterminant );
        this._tInflection1 = this._tCusp - sqrtDet;
        this._tInflection2 = this._tCusp + sqrtDet;
      }
      else {
        this._tInflection1 = NaN;
        this._tInflection2 = NaN;
      }
    },

    // the cusp allows us to split into 2 quadratic Bezier curves
    computeCuspSegments: function() {
      if ( this.hasCusp() ) {
        // if there is a cusp, we'll split at the cusp into two quadratic bezier curves.
        // see http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.94.8088&rep=rep1&type=pdf (Singularities of rational Bezier curves - J Monterde, 2001)
        var subdividedAtCusp = this.subdivided( this.getTCusp );
        this._startQuadratic = new kite.Quadratic( subdividedAtCusp[ 0 ].start, subdividedAtCusp[ 0 ].control1, subdividedAtCusp[ 0 ].end, false );
        this._endQuadratic = new kite.Quadratic( subdividedAtCusp[ 1 ].start, subdividedAtCusp[ 1 ].control2, subdividedAtCusp[ 1 ].end, false );
      }
      else {
        this._startQuadratic = null;
        this._endQuadratic = null;
      }
    },

    getNondegenerateSegments: function() {
      var self = this;

      var start = this._start;
      var control1 = this._control1;
      var control2 = this._control2;
      var end = this._end;

      var reduced = this.degreeReduced( 1e-9 );

      if ( start.equals( end ) && start.equals( control1 ) && start.equals( control2 ) ) {
        // degenerate point
        return [];
      }
      else if ( this.hasCusp() ) {
        return _.flatten( [
          this._startQuadratic.getNondegenerateSegments(),
          this._endQuadratic.getNondegenerateSegments()
        ] );
      }
      else if ( reduced ) {
        // if we can reduce to a quadratic Bezier, always do this (and make sure it is non-degenerate)
        return reduced.getNondegenerateSegments();
      }
      else if ( arePointsCollinear( start, control1, end ) && arePointsCollinear( start, control2, end ) ) {
        var extremaPoints = this.getXExtremaT().concat( this.getYExtremaT() ).sort().map( function( t ) {
          return self.positionAt( t );
        } );

        var segments = [];
        var lastPoint = start;
        if ( extremaPoints.length ) {
          segments.push( new kite.Line( start, extremaPoints[ 0 ] ) );
          lastPoint = extremaPoints[ 0 ];
        }
        for ( var i = 1; i < extremaPoints.length; i++ ) {
          segments.push( new kite.Line( extremaPoints[ i - 1 ], extremaPoints[ i ] ) );
          lastPoint = extremaPoints[ i ];
        }
        segments.push( new kite.Line( lastPoint, end ) );

        return _.flatten( segments.map( function( segment ) { return segment.getNondegenerateSegments(); } ), true );
      }
      else {
        return [ this ];
      }
    },

    hasCusp: function() {
      var tCusp = this.getTCusp();

      var epsilon = 1e-7; // TODO: make this available to change?
      return this.tangentAt( tCusp ).magnitude() < epsilon && tCusp >= 0 && tCusp <= 1;
    },

    // position: (1 - t)^3*start + 3*(1 - t)^2*t*control1 + 3*(1 - t) t^2*control2 + t^3*end
    positionAt: function( t ) {
      var mt = 1 - t;
      return this._start.times( mt * mt * mt ).plus( this._control1.times( 3 * mt * mt * t ) ).plus( this._control2.times( 3 * mt * t * t ) ).plus( this._end.times( t * t * t ) );
    },

    // derivative: -3 p0 (1 - t)^2 + 3 p1 (1 - t)^2 - 6 p1 (1 - t) t + 6 p2 (1 - t) t - 3 p2 t^2 + 3 p3 t^2
    tangentAt: function( t ) {
      var mt = 1 - t;
      var result = new Vector2();
      return result.set( this._start ).multiplyScalar( -3 * mt * mt )
        .add( scratchVector1.set( this._control1 ).multiplyScalar( 3 * mt * mt - 6 * mt * t ) )
        .add( scratchVector1.set( this._control2 ).multiplyScalar( 6 * mt * t - 3 * t * t ) )
        .add( scratchVector1.set( this._end ).multiplyScalar( 3 * t * t ) );
    },

    curvatureAt: function( t ) {
      // see http://cagd.cs.byu.edu/~557/text/ch2.pdf p31
      // TODO: remove code duplication with Quadratic
      var epsilon = 0.0000001;
      if ( Math.abs( t - 0.5 ) > 0.5 - epsilon ) {
        var isZero = t < 0.5;
        var p0 = isZero ? this._start : this._end;
        var p1 = isZero ? this._control1 : this._control2;
        var p2 = isZero ? this._control2 : this._control1;
        var d10 = p1.minus( p0 );
        var a = d10.magnitude();
        var h = ( isZero ? -1 : 1 ) * d10.perpendicular().normalized().dot( p2.minus( p1 ) );
        return ( h * ( this.degree - 1 ) ) / ( this.degree * a * a );
      }
      else {
        return this.subdivided( t )[ 0 ].curvatureAt( 1 );
      }
    },

    toRS: function( point ) {
      var firstVector = point.minus( this._start );
      return new Vector2( firstVector.dot( this.getR() ), firstVector.dot( this.getS() ) );
    },

    subdivided: function( t ) {
      // de Casteljau method
      // TODO: add a 'bisect' or 'between' method for vectors?
      var left = this._start.blend( this._control1, t );
      var right = this._control2.blend( this._end, t );
      var middle = this._control1.blend( this._control2, t );
      var leftMid = left.blend( middle, t );
      var rightMid = middle.blend( right, t );
      var mid = leftMid.blend( rightMid, t );
      return [
        new kite.Cubic( this._start, left, leftMid, mid ),
        new kite.Cubic( mid, rightMid, right, this._end )
      ];
    },

    offsetTo: function( r, reverse ) {
      // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html
      // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf

      // how many segments to create (possibly make this more adaptive?)
      var quantity = 32;

      var points = [];
      var result = [];
      for ( var i = 0; i < quantity; i++ ) {
        var t = i / ( quantity - 1 );
        if ( reverse ) {
          t = 1 - t;
        }

        points.push( this.positionAt( t ).plus( this.tangentAt( t ).perpendicular().normalized().times( r ) ) );
        if ( i > 0 ) {
          result.push( new kite.Line( points[ i - 1 ], points[ i ] ) );
        }
      }

      return result;
    },

    getSVGPathFragment: function() {
      return 'C ' + kite.svgNumber( this._control1.x ) + ' ' + kite.svgNumber( this._control1.y ) + ' ' +
             kite.svgNumber( this._control2.x ) + ' ' + kite.svgNumber( this._control2.y ) + ' ' +
             kite.svgNumber( this._end.x ) + ' ' + kite.svgNumber( this._end.y );
    },

    strokeLeft: function( lineWidth ) {
      return this.offsetTo( -lineWidth / 2, false );
    },

    strokeRight: function( lineWidth ) {
      return this.offsetTo( lineWidth / 2, true );
    },

    getInteriorExtremaTs: function() {
      var ts = this.getXExtremaT().concat( this.getYExtremaT() );
      var result = [];
      _.each( ts, function( t ) {
        var epsilon = 0.0000000001; // TODO: general kite epsilon?
        if ( t > epsilon && t < 1 - epsilon ) {
          // don't add duplicate t values
          if ( _.every( result, function( otherT ) { return Math.abs( t - otherT ) > epsilon; } ) ) {
            result.push( t );
          }
        }
      } );
      return result.sort();
    },

    // returns the resultant winding number of this ray intersecting this segment.
    intersection: function( ray ) {
      var self = this;
      var result = [];

      // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
      var inverseMatrix = Matrix3.rotation2( -ray.direction.angle() ).timesMatrix( Matrix3.translation( -ray.position.x, -ray.position.y ) );

      var p0 = inverseMatrix.timesVector2( this._start );
      var p1 = inverseMatrix.timesVector2( this._control1 );
      var p2 = inverseMatrix.timesVector2( this._control2 );
      var p3 = inverseMatrix.timesVector2( this._end );

      // polynomial form of cubic: start + (3 control1 - 3 start) t + (-6 control1 + 3 control2 + 3 start) t^2 + (3 control1 - 3 control2 + end - start) t^3
      var a = -p0.y + 3 * p1.y - 3 * p2.y + p3.y;
      var b = 3 * p0.y - 6 * p1.y + 3 * p2.y;
      var c = -3 * p0.y + 3 * p1.y;
      var d = p0.y;

      var ts = solveCubicRootsReal( a, b, c, d );

      _.each( ts, function( t ) {
        if ( t >= 0 && t <= 1 ) {
          var hitPoint = self.positionAt( t );
          var unitTangent = self.tangentAt( t ).normalized();
          var perp = unitTangent.perpendicular();
          var toHit = hitPoint.minus( ray.position );

          // make sure it's not behind the ray
          if ( toHit.dot( ray.direction ) > 0 ) {
            result.push( {
              distance: toHit.magnitude(),
              point: hitPoint,
              normal: perp.dot( ray.direction ) > 0 ? perp.negated() : perp,
              wind: ray.direction.perpendicular().dot( unitTangent ) < 0 ? 1 : -1
            } );
          }
        }
      } );
      return result;
    },

    windingIntersection: function( ray ) {
      var wind = 0;
      var hits = this.intersection( ray );
      _.each( hits, function( hit ) {
        wind += hit.wind;
      } );
      return wind;
    },

    // assumes the current position is at start
    writeToContext: function( context ) {
      context.bezierCurveTo( this._control1.x, this._control1.y, this._control2.x, this._control2.y, this._end.x, this._end.y );
    },

    transformed: function( matrix ) {
      return new kite.Cubic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control1 ), matrix.timesVector2( this._control2 ), matrix.timesVector2( this._end ) );
    },

    // returns a degree-reduced quadratic Bezier if possible, otherwise it returns null
    degreeReduced: function( epsilon ) {
      epsilon = epsilon || 0; // if not provided, use an exact version
      var controlA = scratchVector1.set( this._control1 ).multiplyScalar( 3 ).subtract( this._start ).divideScalar( 2 );
      var controlB = scratchVector2.set( this._control2 ).multiplyScalar( 3 ).subtract( this._end ).divideScalar( 2 );
      var difference = scratchVector3.set( controlA ).subtract( controlB );
      if ( difference.magnitude() <= epsilon ) {
        return new kite.Quadratic(
          this._start,
          controlA.average( controlB ), // average the control points for stability. they should be almost identical
          this._end
        );
      }
      else {
        // the two options for control points are too far away, this curve isn't easily reducible.
        return null;
      }
    }

    // returns the resultant winding number of this ray intersecting this segment.
    // windingIntersection: function( ray ) {
    //   // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
    //   var inverseMatrix = Matrix3.rotation2( -ray.direction.angle() );
    //   assert && assert( inverseMatrix.timesVector2( ray.direction ).x > 0.99 ); // verify that we transform the unit vector to the x-unit

    //   var y0 = inverseMatrix.timesVector2( this._start ).y;
    //   var y1 = inverseMatrix.timesVector2( this._control1 ).y;
    //   var y2 = inverseMatrix.timesVector2( this._control2 ).y;
    //   var y3 = inverseMatrix.timesVector2( this._end ).y;

    //   // polynomial form of cubic: start + (3 control1 - 3 start) t + (-6 control1 + 3 control2 + 3 start) t^2 + (3 control1 - 3 control2 + end - start) t^3
    //   var a = -y0 + 3 * y1 - 3 * y2 + y3;
    //   var b = 3 * y0 - 6 * y1 + 3 * y2;
    //   var c = -3 * y0 + 3 * y1;
    //   var d = y0;

    //   // solve cubic roots
    //   var ts = solveCubicRootsReal( a, b, c, d );

    //   var result = 0;

    //   // for each hit
    //   _.each( ts, function( t ) {
    //     if ( t >= 0 && t <= 1 ) {
    //       result += ray.direction.perpendicular().dot( this.tangentAt( t ) ) < 0 ? 1 : -1;
    //     }
    //   } );

    //   return result;
    // }
  } );

  Segment.addInvalidatingGetterSetter( Cubic, 'start' );
  Segment.addInvalidatingGetterSetter( Cubic, 'control1' );
  Segment.addInvalidatingGetterSetter( Cubic, 'control2' );
  Segment.addInvalidatingGetterSetter( Cubic, 'end' );

  // finds what t values the cubic extrema are at (if any). This is just the 1-dimensional case, used for multiple purposes
  Cubic.extremaT = function( v0, v1, v2, v3 ) {
    if ( v0 === v1 && v0 === v2 && v0 === v3 ) {
      return [];
    }

    // coefficients of derivative
    var a = -3 * v0 + 9 * v1 - 9 * v2 + 3 * v3;
    var b = 6 * v0 - 12 * v1 + 6 * v2;
    var c = -3 * v0 + 3 * v1;

    return solveQuadraticRootsReal( a, b, c );
  };

  return Cubic;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Forward and inverse transforms with 3x3 matrices. Methods starting with 'transform' will apply the transform from our
 * primary matrix, while methods starting with 'inverse' will apply the transform from the inverse of our matrix.
 *
 * Generally, this means transform.inverseThing( transform.transformThing( thing ) ).equals( thing ).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Transform3',['require','PHET_CORE/inherit','AXON/Events','DOT/dot','DOT/Matrix3','DOT/Vector2','DOT/Ray2'],function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Events = require( 'AXON/Events' );
  var dot = require( 'DOT/dot' );

  require( 'DOT/Matrix3' );
  require( 'DOT/Vector2' );
  require( 'DOT/Ray2' );

  var scratchMatrix = new dot.Matrix3();

  function checkMatrix( matrix ) {
    return ( matrix instanceof dot.Matrix3 ) && matrix.isFinite();
  }

  /**
   * Creates a transform based around an initial matrix.
   * @constructor
   * @public
   *
   * @param {Matrix3} matrix
   */
  function Transform3( matrix ) {
    Events.call( this );

    // @private {Matrix3} - The primary matrix used for the transform
    this.matrix = dot.Matrix3.IDENTITY.copy();

    // @private {Matrix3} - The inverse of the primary matrix, computed lazily
    this.inverse = dot.Matrix3.IDENTITY.copy();

    // @private {Matrix3} - The transpose of the primary matrix, computed lazily
    this.matrixTransposed = dot.Matrix3.IDENTITY.copy();

    // @private {Matrix3} - The inverse of the transposed primary matrix, computed lazily
    this.inverseTransposed = dot.Matrix3.IDENTITY.copy();


    // @private {boolean} - Whether this.inverse has been computed based on the latest primary matrix
    this.inverseValid = true;

    // @private {boolean} - Whether this.matrixTransposed has been computed based on the latest primary matrix
    this.transposeValid = true;

    // @private {boolean} - Whether this.inverseTransposed has been computed based on the latest primary matrix
    this.inverseTransposeValid = true;

    if ( matrix ) {
      this.setMatrix( matrix );
    }

    phetAllocation && phetAllocation( 'Transform3' );
  }

  dot.register( 'Transform3', Transform3 );

  inherit( Events, Transform3, {
    /*---------------------------------------------------------------------------*
     * mutators
     *---------------------------------------------------------------------------*/

    /**
     * Sets the value of the primary matrix directly from a Matrix3. Does not change the Matrix3 instance of this
     * Transform3.
     * @public
     *
     * @param {Matrix3} matrix
     */
    setMatrix: function( matrix ) {
      assert && assert( checkMatrix( matrix ), 'Matrix has NaNs, non-finite values, or isn\'t a matrix!' );

      // copy the matrix over to our matrix
      this.matrix.set( matrix );

      // set flags and notify
      this.invalidate();
    },

    /**
     * This should be called after our internal matrix is changed. It marks the other dependent matrices as invalid,
     * and sends out notifications of the change.
     * @private
     */
    invalidate: function() {
      // sanity check
      assert && assert( this.matrix.isFinite() );

      // dependent matrices now invalid
      this.inverseValid = false;
      this.transposeValid = false;
      this.inverseTransposeValid = false;

      this.trigger0( 'change' );
    },

    /**
     * Modifies the primary matrix such that: this.matrix = matrix * this.matrix.
     * @public
     *
     * @param {Matrix3} matrix
     */
    prepend: function( matrix ) {
      assert && assert( checkMatrix( matrix ), 'Matrix has NaNs, non-finite values, or isn\'t a matrix!' );

      // In the absence of a prepend-multiply function in Matrix3, copy over to a scratch matrix instead
      // TODO: implement a prepend-multiply directly in Matrix3 for a performance increase
      scratchMatrix.set( this.matrix );
      this.matrix.set( matrix );
      this.matrix.multiplyMatrix( scratchMatrix );

      // set flags and notify
      this.invalidate();
    },

    /**
     * Optimized prepended translation such that: this.matrix = translation( x, y ) * this.matrix.
     * @public
     *
     * @param {Matrix3} matrix
     */
    prependTranslation: function( x, y ) {
      // See scenery#119 for more details on the need.

      assert && assert( typeof x === 'number' && typeof y === 'number' && isFinite( x ) && isFinite( y ),
        'Attempted to prepend non-finite or non-number (x,y) to the transform' );

      this.matrix.prependTranslation( x, y );

      // set flags and notify
      this.invalidate();
    },

    /**
     * Modifies the primary matrix such that: this.matrix = this.matrix * matrix
     * @public
     *
     * @param {Matrix3} matrix
     */
    append: function( matrix ) {
      assert && assert( checkMatrix( matrix ), 'Matrix has NaNs, non-finite values, or isn\'t a matrix!' );

      this.matrix.multiplyMatrix( matrix );

      // set flags and notify
      this.invalidate();
    },

    /**
     * Like prepend(), but prepends the other transform's matrix.
     * @public
     *
     * @param {Transform3} transform
     */
    prependTransform: function( transform ) {
      this.prepend( transform.matrix );
    },

    /**
     * Like append(), but appends the other transform's matrix.
     * @public
     *
     * @param {Transform3} transform
     */
    appendTransform: function( transform ) {
      this.append( transform.matrix );
    },

    /**
     * Sets the transform of a Canvas context to be equivalent to this transform.
     * @public
     *
     * @param {CanvasRenderingContext2D} context
     */
    applyToCanvasContext: function( context ) {
      context.setTransform( this.matrix.m00(), this.matrix.m10(), this.matrix.m01(), this.matrix.m11(), this.matrix.m02(), this.matrix.m12() );
    },

    /*---------------------------------------------------------------------------*
     * getters
     *---------------------------------------------------------------------------*/

    /**
     * Creates a copy of this transform.
     * @public
     *
     * @returns {Transform3}
     */
    copy: function() {
      var transform = new Transform3( this.matrix );

      transform.inverse = this.inverse;
      transform.matrixTransposed = this.matrixTransposed;
      transform.inverseTransposed = this.inverseTransposed;

      transform.inverseValid = this.inverseValid;
      transform.transposeValid = this.transposeValid;
      transform.inverseTransposeValid = this.inverseTransposeValid;
    },

    /**
     * Returns the primary matrix of this transform.
     * @public
     *
     * @returns {Matrix3}
     */
    getMatrix: function() {
      return this.matrix;
    },

    /**
     * Returns the inverse of the primary matrix of this transform.
     * @public
     *
     * @returns {Matrix3}
     */
    getInverse: function() {
      if ( !this.inverseValid ) {
        this.inverseValid = true;

        this.inverse.set( this.matrix );
        this.inverse.invert();
      }
      return this.inverse;
    },

    /**
     * Returns the transpose of the primary matrix of this transform.
     * @public
     *
     * @returns {Matrix3}
     */
    getMatrixTransposed: function() {
      if ( !this.transposeValid ) {
        this.transposeValid = true;

        this.matrixTransposed.set( this.matrix );
        this.matrixTransposed.transpose();
      }
      return this.matrixTransposed;
    },

    /**
     * Returns the inverse of the transpose of matrix of this transform.
     * @public
     *
     * @returns {Matrix3}
     */
    getInverseTransposed: function() {
      if ( !this.inverseTransposeValid ) {
        this.inverseTransposeValid = true;

        this.inverseTransposed.set( this.getInverse() ); // triggers inverse to be valid
        this.inverseTransposed.transpose();
      }
      return this.inverseTransposed;
    },

    /**
     * Returns whether our primary matrix is known to be an identity matrix. If false is returned, it doesn't necessarily
     * mean our matrix isn't an identity matrix, just that it is unlikely in normal usage.
     * @public
     *
     * @returns {boolean}
     */
    isIdentity: function() {
      return this.matrix.type === dot.Matrix3.Types.IDENTITY;
    },

    /**
     * Returns whether any components of our primary matrix are either infinite or NaN.
     * @public
     *
     * @returns {boolean}
     */
    isFinite: function() {
      return this.matrix.isFinite();
    },

    /*---------------------------------------------------------------------------*
     * forward transforms (for Vector2 or scalar)
     *---------------------------------------------------------------------------*/

    /**
     * Transforms a 2-dimensional vector like it is a point with a position (translation is applied).
     * @public
     *
     * For an affine matrix $M$, the result is the homogeneous multiplication $M\begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    transformPosition2: function( v ) {
      return this.matrix.timesVector2( v );
    },

    /**
     * Transforms a 2-dimensional vector like position is irrelevant (translation is not applied).
     * @public
     *
     * For an affine matrix $\begin{bmatrix} a & b & c \\ d & e & f \\ 0 & 0 & 1 \end{bmatrix}$,
     * the result is $\begin{bmatrix} a & b & 0 \\ d & e & 0 \\ 0 & 0 & 1 \end{bmatrix} \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    transformDelta2: function( v ) {
      var m = this.getMatrix();
      // m . v - m . Vector2.ZERO
      return new dot.Vector2( m.m00() * v.x + m.m01() * v.y, m.m10() * v.x + m.m11() * v.y );
    },

    /**
     * Transforms a 2-dimensional vector like it is a normal to a curve (so that the curve is transformed, and the new
     * normal to the curve at the transformed point is returned).
     * @public
     *
     * For an affine matrix $\begin{bmatrix} a & b & c \\ d & e & f \\ 0 & 0 & 1 \end{bmatrix}$,
     * the result is $\begin{bmatrix} a & e & 0 \\ d & b & 0 \\ 0 & 0 & 1 \end{bmatrix}^{-1} \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$.
     * This is essentially the transposed inverse with translation removed.
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    transformNormal2: function( v ) {
      return this.getInverse().timesTransposeVector2( v ).normalize();
    },

    /**
     * Returns the resulting x-coordinate of the transformation of all vectors with the initial input x-coordinate. If
     * this is not well-defined (the x value depends on y), an assertion is thrown (and y is assumed to be 0).
     * @public
     *
     * @param {number} x
     * @returns {number}
     */
    transformX: function( x ) {
      var m = this.getMatrix();
      assert && assert( !m.m01(), 'Transforming an X value with a rotation/shear is ill-defined' );
      return m.m00() * x + m.m02();
    },

    /**
     * Returns the resulting y-coordinate of the transformation of all vectors with the initial input y-coordinate. If
     * this is not well-defined (the y value depends on x), an assertion is thrown (and x is assumed to be 0).
     * @public
     *
     * @param {number} y
     * @returns {number}
     */
    transformY: function( y ) {
      var m = this.getMatrix();
      assert && assert( !m.m10(), 'Transforming a Y value with a rotation/shear is ill-defined' );
      return m.m11() * y + m.m12();
    },

    /**
     * Returns the x-coordinate difference for two transformed vectors, which add the x-coordinate difference of the input
     * x (and same y values) beforehand.
     * @public
     *
     * @param {number} x
     * @returns {number}
     */
    transformDeltaX: function( x ) {
      var m = this.getMatrix();
      // same as this.transformDelta2( new dot.Vector2( x, 0 ) ).x;
      return m.m00() * x;
    },

    /**
     * Returns the y-coordinate difference for two transformed vectors, which add the y-coordinate difference of the input
     * y (and same x values) beforehand.
     * @public
     *
     * @param {number} y
     * @returns {number}
     */
    transformDeltaY: function( y ) {
      var m = this.getMatrix();
      // same as this.transformDelta2( new dot.Vector2( 0, y ) ).y;
      return m.m11() * y;
    },

    /**
     * Returns bounds (axis-aligned) that contains the transformed bounds rectangle.
     * @pubic
     *
     * NOTE: transform.inverseBounds2( transform.transformBounds2( bounds ) ) may be larger than the original box,
     * if it includes a rotation that isn't a multiple of $\pi/2$. This is because the returned bounds may expand in
     * area to cover ALL of the corners of the transformed bounding box.
     *
     * @param {Bounds2} bounds
     * @returns {Bounds2}
     */
    transformBounds2: function( bounds ) {
      return bounds.transformed( this.matrix );
    },

    /**
     * Returns a transformed kite.Shape.
     * @pubic
     *
     * @param {Shape} shape
     * @returns {Shape}
     */
    transformShape: function( shape ) {
      return shape.transformed( this.matrix );
    },

    /**
     * Returns a transformed ray.
     * @pubic
     *
     * @param {Ray2} ray
     * @returns {Ray2}
     */
    transformRay2: function( ray ) {
      return new dot.Ray2( this.transformPosition2( ray.position ), this.transformDelta2( ray.direction ).normalized() );
    },

    /*---------------------------------------------------------------------------*
     * inverse transforms (for Vector2 or scalar)
     *---------------------------------------------------------------------------*/

    /**
     * Transforms a 2-dimensional vector by the inverse of our transform like it is a point with a position (translation is applied).
     * @public
     *
     * For an affine matrix $M$, the result is the homogeneous multiplication $M^{-1}\begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$.
     *
     * This is the inverse of transformPosition2().
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    inversePosition2: function( v ) {
      return this.getInverse().timesVector2( v );
    },

    /**
     * Transforms a 2-dimensional vector by the inverse of our transform like position is irrelevant (translation is not applied).
     * @public
     *
     * For an affine matrix $\begin{bmatrix} a & b & c \\ d & e & f \\ 0 & 0 & 1 \end{bmatrix}$,
     * the result is $\begin{bmatrix} a & b & 0 \\ d & e & 0 \\ 0 & 0 & 1 \end{bmatrix}^{-1} \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$.
     *
     * This is the inverse of transformDelta2().
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    inverseDelta2: function( v ) {
      var m = this.getInverse();
      // m . v - m . Vector2.ZERO
      return new dot.Vector2( m.m00() * v.x + m.m01() * v.y, m.m10() * v.x + m.m11() * v.y );
    },

    /**
     * Transforms a 2-dimensional vector by the inverse of our transform like it is a normal to a curve (so that the
     * curve is transformed, and the new normal to the curve at the transformed point is returned).
     * @public
     *
     * For an affine matrix $\begin{bmatrix} a & b & c \\ d & e & f \\ 0 & 0 & 1 \end{bmatrix}$,
     * the result is $\begin{bmatrix} a & e & 0 \\ d & b & 0 \\ 0 & 0 & 1 \end{bmatrix} \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$.
     * This is essentially the transposed transform with translation removed.
     *
     * This is the inverse of transformNormal2().
     *
     * @param {Vector2} v
     * @returns {Vector2}
     */
    inverseNormal2: function( v ) {
      return this.matrix.timesTransposeVector2( v ).normalize();
    },

    /**
     * Returns the resulting x-coordinate of the inverse transformation of all vectors with the initial input x-coordinate. If
     * this is not well-defined (the x value depends on y), an assertion is thrown (and y is assumed to be 0).
     * @public
     *
     * This is the inverse of transformX().
     *
     * @param {number} x
     * @returns {number}
     */
    inverseX: function( x ) {
      var m = this.getInverse();
      assert && assert( !m.m01(), 'Inverting an X value with a rotation/shear is ill-defined' );
      return m.m00() * x + m.m02();
    },

    /**
     * Returns the resulting y-coordinate of the inverse transformation of all vectors with the initial input y-coordinate. If
     * this is not well-defined (the y value depends on x), an assertion is thrown (and x is assumed to be 0).
     * @public
     *
     * This is the inverse of transformY().
     *
     * @param {number} y
     * @returns {number}
     */
    inverseY: function( y ) {
      var m = this.getInverse();
      assert && assert( !m.m10(), 'Inverting a Y value with a rotation/shear is ill-defined' );
      return m.m11() * y + m.m12();
    },

    /**
     * Returns the x-coordinate difference for two inverse-transformed vectors, which add the x-coordinate difference of the input
     * x (and same y values) beforehand.
     * @public
     *
     * This is the inverse of transformDeltaX().
     *
     * @param {number} x
     * @returns {number}
     */
    inverseDeltaX: function( x ) {
      var m = this.getInverse();
      assert && assert( !m.m01(), 'Inverting an X value with a rotation/shear is ill-defined' );
      // same as this.inverseDelta2( new dot.Vector2( x, 0 ) ).x;
      return m.m00() * x;
    },

    /**
     * Returns the y-coordinate difference for two inverse-transformed vectors, which add the y-coordinate difference of the input
     * y (and same x values) beforehand.
     * @public
     *
     * This is the inverse of transformDeltaY().
     *
     * @param {number} y
     * @returns {number}
     */
    inverseDeltaY: function( y ) {
      var m = this.getInverse();
      assert && assert( !m.m10(), 'Inverting a Y value with a rotation/shear is ill-defined' );
      // same as this.inverseDelta2( new dot.Vector2( 0, y ) ).y;
      return m.m11() * y;
    },

    /**
     * Returns bounds (axis-aligned) that contains the inverse-transformed bounds rectangle.
     * @pubic
     *
     * NOTE: transform.inverseBounds2( transform.transformBounds2( bounds ) ) may be larger than the original box,
     * if it includes a rotation that isn't a multiple of $\pi/2$. This is because the returned bounds may expand in
     * area to cover ALL of the corners of the transformed bounding box.
     *
     * @param {Bounds2} bounds
     * @returns {Bounds2}
     */
    inverseBounds2: function( bounds2 ) {
      return bounds2.transformed( this.getInverse() );
    },

    /**
     * Returns an inverse-transformed kite.Shape.
     * @pubic
     *
     * This is the inverse of transformShape()
     *
     * @param {Shape} shape
     * @returns {Shape}
     */
    inverseShape: function( shape ) {
      return shape.transformed( this.getInverse() );
    },

    /**
     * Returns an inverse-transformed ray.
     * @pubic
     *
     * This is the inverse of transformRay2()
     *
     * @param {Ray2} ray
     * @returns {Ray2}
     */
    inverseRay2: function( ray ) {
      return new dot.Ray2( this.inversePosition2( ray.position ), this.inverseDelta2( ray.direction ).normalized() );
    }
  } );

  return Transform3;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Elliptical arc segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/EllipticalArc',['require','PHET_CORE/inherit','DOT/Vector2','DOT/Bounds2','DOT/Matrix3','DOT/Transform3','DOT/Util','DOT/Util','KITE/kite','KITE/segments/Segment'],function( require ) {
  'use strict';

  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Transform3 = require( 'DOT/Transform3' );
  var toDegrees = require( 'DOT/Util' ).toDegrees;
  var DotUtil = require( 'DOT/Util' ); // eslint-disable-line require-statement-match

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  // TODO: notes at http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
  // Canvas notes were at http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-ellipse
  // context.ellipse was removed from the Canvas spec
  function EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
    Segment.call( this );

    this._center = center;
    this._radiusX = radiusX;
    this._radiusY = radiusY;
    this._rotation = rotation;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;

    this.invalidate();
  }

  kite.register( 'EllipticalArc', EllipticalArc );

  inherit( Segment, EllipticalArc, {

    // @public - Clears cached information, should be called when any of the 'constructor arguments' are mutated.
    invalidate: function() {
      // Lazily-computed derived information
      this._unitTransform = null; // {Transform3 | null} - Mapping between our ellipse and a unit circle
      this._start = null; // {Vector2 | null}
      this._end = null; // {Vector2 | null}
      this._startTangent = null; // {Vector2 | null}
      this._endTangent = null; // {Vector2 | null}
      this._actualEndAngle = null; // {number | null} - End angle in relation to our start angle (can get remapped)
      this._isFullPerimeter = null; // {boolean | null} - Whether it's a full ellipse (and not just an arc)
      this._angleDifference = null; // {number | null}
      this._unitArcSegment = null; // {Arc | null} - Corresponding circular arc for our unit transform.
      this._bounds = null; // {Bounds2 | null}

      // remapping of negative radii
      if ( this._radiusX < 0 ) {
        // support this case since we might actually need to handle it inside of strokes?
        this._radiusX = -this._radiusX;
        this._startAngle = Math.PI - this._startAngle;
        this._endAngle = Math.PI - this._endAngle;
        this._anticlockwise = !this._anticlockwise;
      }
      if ( this._radiusY < 0 ) {
        // support this case since we might actually need to handle it inside of strokes?
        this._radiusY = -this._radiusY;
        this._startAngle = -this._startAngle;
        this._endAngle = -this._endAngle;
        this._anticlockwise = !this._anticlockwise;
      }
      if ( this._radiusX < this._radiusY ) {
        // swap radiusX and radiusY internally for consistent Canvas / SVG output
        this._rotation += Math.PI / 2;
        this._startAngle -= Math.PI / 2;
        this._endAngle -= Math.PI / 2;

        // swap radiusX and radiusY
        var tmpR = this._radiusX;
        this._radiusX = this._radiusY;
        this._radiusY = tmpR;
      }

      if ( this._radiusX < this._radiusY ) {
        // TODO: check this
        throw new Error( 'Not verified to work if radiusX < radiusY' );
      }

      // constraints shared with Arc
      assert && assert( !( ( !this.anticlockwise && this.endAngle - this.startAngle <= -Math.PI * 2 ) ||
                           ( this.anticlockwise && this.startAngle - this.endAngle <= -Math.PI * 2 ) ),
        'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
      assert && assert( !( ( !this.anticlockwise && this.endAngle - this.startAngle > Math.PI * 2 ) ||
                           ( this.anticlockwise && this.startAngle - this.endAngle > Math.PI * 2 ) ),
        'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
    },

    getUnitTransform: function() {
      if ( this._unitTransform === null ) {
        this._unitTransform = EllipticalArc.computeUnitTransform( this._center, this._radiusX, this._radiusY, this._rotation );
      }
      return this._unitTransform;
    },
    get unitTransform() { return this.getUnitTransform(); },

    getStart: function() {
      if ( this._start === null ) {
        this._start = this.positionAtAngle( this._startAngle );
      }
      return this._start;
    },
    get start() { return this.getStart(); },

    getEnd: function() {
      if ( this._end === null ) {
        this._end = this.positionAtAngle( this._endAngle );
      }
      return this._end;
    },
    get end() { return this.getEnd(); },

    getStartTangent: function() {
      if ( this._startTangent === null ) {
        this._startTangent = this.tangentAtAngle( this._startAngle );
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      if ( this._endTangent === null ) {
        this._endTangent = this.tangentAtAngle( this._endAngle );
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    getActualEndAngle: function() {
      if ( this._actualEndAngle === null ) {
        // compute an actual end angle so that we can smoothly go from this._startAngle to this._actualEndAngle
        if ( this._anticlockwise ) {
          // angle is 'decreasing'
          // -2pi <= end - start < 2pi
          if ( this._startAngle > this._endAngle ) {
            this._actualEndAngle = this._endAngle;
          }
          else if ( this._startAngle < this._endAngle ) {
            this._actualEndAngle = this._endAngle - 2 * Math.PI;
          }
          else {
            // equal
            this._actualEndAngle = this._startAngle;
          }
        }
        else {
          // angle is 'increasing'
          // -2pi < end - start <= 2pi
          if ( this._startAngle < this._endAngle ) {
            this._actualEndAngle = this._endAngle;
          }
          else if ( this._startAngle > this._endAngle ) {
            this._actualEndAngle = this._endAngle + Math.PI * 2;
          }
          else {
            // equal
            this._actualEndAngle = this._startAngle;
          }
        }
      }
      return this._actualEndAngle;
    },
    get actualEndAngle() { return this.getActualEndAngle(); },

    getIsFullPerimeter: function() {
      if ( this._isFullPerimeter === null ) {
        this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
      }
      return this._isFullPerimeter;
    },
    get isFullPerimeter() { return this.getIsFullPerimeter(); },

    getAngleDifference: function() {
      if ( this._angleDifference === null ) {
        // compute an angle difference that represents how "much" of the circle our arc covers
        this._angleDifference = this._anticlockwise ? this._startAngle - this._endAngle : this._endAngle - this._startAngle;
        if ( this._angleDifference < 0 ) {
          this._angleDifference += Math.PI * 2;
        }
        assert && assert( this._angleDifference >= 0 ); // now it should always be zero or positive
      }
      return this._angleDifference;
    },
    get angleDifference() { return this.getAngleDifference(); },

    // a unit arg segment that we can map to our ellipse. useful for hit testing and such.
    getUnitArcSegment: function() {
      if ( this._unitArcSegment === null ) {
        this._unitArcSegment = new kite.Arc( Vector2.ZERO, 1, this._startAngle, this._endAngle, this._anticlockwise );
      }
      return this._unitArcSegment;
    },

    // temporary shims
    getBounds: function() {
      if ( this._bounds === null ) {
        this._bounds = Bounds2.NOTHING.withPoint( this.getStart() )
          .withPoint( this.getEnd() );

        // if the angles are different, check extrema points
        if ( this._startAngle !== this._endAngle ) {
          // solve the mapping from the unit circle, find locations where a coordinate of the gradient is zero.
          // we find one extrema point for both x and y, since the other two are just rotated by pi from them.
          var xAngle = Math.atan( -( this._radiusY / this._radiusX ) * Math.tan( this._rotation ) );
          var yAngle = Math.atan( ( this._radiusY / this._radiusX ) / Math.tan( this._rotation ) );

          // check all of the extrema points
          this.possibleExtremaAngles = [
            xAngle,
            xAngle + Math.PI,
            yAngle,
            yAngle + Math.PI
          ];

          _.each( this.possibleExtremaAngles, this.includeBoundsAtAngle.bind( this ) );
        }
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    getNondegenerateSegments: function() {
      if ( this._radiusX <= 0 || this._radiusY <= 0 || this._startAngle === this._endAngle ) {
        return [];
      }
      else if ( this._radiusX === this._radiusY ) {
        // reduce to an Arc
        var startAngle = this._startAngle - this._rotation;
        var endAngle = this._endAngle - this._rotation;

        // preserve full circles
        if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
          endAngle = this._anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
        }
        return [ new kite.Arc( this._center, this._radiusX, startAngle, endAngle, this._anticlockwise ) ];
      }
      else {
        return [ this ];
      }
    },

    includeBoundsAtAngle: function( angle ) {
      if ( this.containsAngle( angle ) ) {
        // the boundary point is in the arc
        this._bounds = this._bounds.withPoint( this.positionAtAngle( angle ) );
      }
    },

    // maps a contained angle to between [startAngle,actualEndAngle), even if the end angle is lower.
    mapAngle: function( angle ) {
      // consider an assert that we contain that angle?
      return ( this._startAngle > this.getActualEndAngle() ) ?
             DotUtil.moduloBetweenUp( angle, this._startAngle - 2 * Math.PI, this._startAngle ) :
             DotUtil.moduloBetweenDown( angle, this._startAngle, this._startAngle + 2 * Math.PI );
    },

    tAtAngle: function( angle ) {
      return ( this.mapAngle( angle ) - this._startAngle ) / ( this.getActualEndAngle() - this._startAngle );
    },

    angleAt: function( t ) {
      return this._startAngle + ( this.getActualEndAngle() - this._startAngle ) * t;
    },

    positionAt: function( t ) {
      return this.positionAtAngle( this.angleAt( t ) );
    },

    tangentAt: function( t ) {
      return this.tangentAtAngle( this.angleAt( t ) );
    },

    curvatureAt: function( t ) {
      // see http://mathworld.wolfram.com/Ellipse.html (59)
      var angle = this.angleAt( t );
      var aq = this._radiusX * Math.sin( angle );
      var bq = this._radiusY * Math.cos( angle );
      var denominator = Math.pow( bq * bq + aq * aq, 3 / 2 );
      return ( this._anticlockwise ? -1 : 1 ) * this._radiusX * this._radiusY / denominator;
    },

    positionAtAngle: function( angle ) {
      return this.getUnitTransform().transformPosition2( Vector2.createPolar( 1, angle ) );
    },

    tangentAtAngle: function( angle ) {
      var normal = this.getUnitTransform().transformNormal2( Vector2.createPolar( 1, angle ) );

      return this._anticlockwise ? normal.perpendicular() : normal.perpendicular().negated();
    },

    // TODO: refactor? exact same as Arc
    containsAngle: function( angle ) {
      // transform the angle into the appropriate coordinate form
      // TODO: check anticlockwise version!
      var normalizedAngle = this._anticlockwise ? angle - this._endAngle : angle - this._startAngle;

      // get the angle between 0 and 2pi
      var positiveMinAngle = normalizedAngle % ( Math.PI * 2 );
      // check this because modular arithmetic with negative numbers reveal a negative number
      if ( positiveMinAngle < 0 ) {
        positiveMinAngle += Math.PI * 2;
      }

      return positiveMinAngle <= this.getAngleDifference();
    },

    // discretizes the elliptical arc and returns an offset curve as a list of lineTos
    offsetTo: function( r, reverse ) {
      // how many segments to create (possibly make this more adaptive?)
      var quantity = 32;

      var points = [];
      var result = [];
      for ( var i = 0; i < quantity; i++ ) {
        var ratio = i / ( quantity - 1 );
        if ( reverse ) {
          ratio = 1 - ratio;
        }
        var angle = this.angleAt( ratio );

        points.push( this.positionAtAngle( angle ).plus( this.tangentAtAngle( angle ).perpendicular().normalized().times( r ) ) );
        if ( i > 0 ) {
          result.push( new kite.Line( points[ i - 1 ], points[ i ] ) );
        }
      }

      return result;
    },

    getSVGPathFragment: function() {
      // see http://www.w3.org/TR/SVG/paths.html#PathDataEllipticalArcCommands for more info
      // rx ry x-axis-rotation large-arc-flag sweep-flag x y
      var epsilon = 0.01; // allow some leeway to render things as 'almost circles'
      var sweepFlag = this._anticlockwise ? '0' : '1';
      var largeArcFlag;
      var degreesRotation = toDegrees( this._rotation ); // bleh, degrees?
      if ( this.getAngleDifference() < Math.PI * 2 - epsilon ) {
        largeArcFlag = this.getAngleDifference() < Math.PI ? '0' : '1';
        return 'A ' + kite.svgNumber( this._radiusX ) + ' ' + kite.svgNumber( this._radiusY ) + ' ' + degreesRotation +
               ' ' + largeArcFlag + ' ' + sweepFlag + ' ' + kite.svgNumber( this.getEnd().x ) + ' ' + kite.svgNumber( this.getEnd().y );
      }
      else {
        // ellipse (or almost-ellipse) case needs to be handled differently
        // since SVG will not be able to draw (or know how to draw) the correct circle if we just have a start and end, we need to split it into two circular arcs

        // get the angle that is between and opposite of both of the points
        var splitOppositeAngle = ( this._startAngle + this._endAngle ) / 2; // this _should_ work for the modular case?
        var splitPoint = this.positionAtAngle( splitOppositeAngle );

        largeArcFlag = '0'; // since we split it in 2, it's always the small arc

        var firstArc = 'A ' + kite.svgNumber( this._radiusX ) + ' ' + kite.svgNumber( this._radiusY ) + ' ' +
                       degreesRotation + ' ' + largeArcFlag + ' ' + sweepFlag + ' ' +
                       kite.svgNumber( splitPoint.x ) + ' ' + kite.svgNumber( splitPoint.y );
        var secondArc = 'A ' + kite.svgNumber( this._radiusX ) + ' ' + kite.svgNumber( this._radiusY ) + ' ' +
                        degreesRotation + ' ' + largeArcFlag + ' ' + sweepFlag + ' ' +
                        kite.svgNumber( this.getEnd().x ) + ' ' + kite.svgNumber( this.getEnd().y );

        return firstArc + ' ' + secondArc;
      }
    },

    strokeLeft: function( lineWidth ) {
      return this.offsetTo( -lineWidth / 2, false );
    },

    strokeRight: function( lineWidth ) {
      return this.offsetTo( lineWidth / 2, true );
    },

    // not including 0 and 1
    getInteriorExtremaTs: function() {
      var that = this;
      var result = [];
      _.each( this.possibleExtremaAngles, function( angle ) {
        if ( that.containsAngle( angle ) ) {
          var t = that.tAtAngle( angle );
          var epsilon = 0.0000000001; // TODO: general kite epsilon?
          if ( t > epsilon && t < 1 - epsilon ) {
            result.push( t );
          }
        }
      } );
      return result.sort(); // modifies original, which is OK
    },

    subdivided: function( t ) {
      // TODO: verify that we don't need to switch anticlockwise here, or subtract 2pi off any angles
      var angle0 = this.angleAt( 0 );
      var angleT = this.angleAt( t );
      var angle1 = this.angleAt( 1 );
      return [
        new kite.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angle0, angleT, this._anticlockwise ),
        new kite.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angleT, angle1, this._anticlockwise )
      ];
    },

    intersection: function( ray ) {
      // be lazy. transform it into the space of a non-elliptical arc.
      var unitTransform = this.getUnitTransform();
      var rayInUnitCircleSpace = unitTransform.inverseRay2( ray );
      var hits = this.getUnitArcSegment().intersection( rayInUnitCircleSpace );

      return _.map( hits, function( hit ) {
        var transformedPoint = unitTransform.transformPosition2( hit.point );
        return {
          distance: ray.position.distance( transformedPoint ),
          point: transformedPoint,
          normal: unitTransform.inverseNormal2( hit.normal ),
          wind: hit.wind
        };
      } );
    },

    // returns the resultant winding number of this ray intersecting this segment.
    windingIntersection: function( ray ) {
      // be lazy. transform it into the space of a non-elliptical arc.
      var rayInUnitCircleSpace = this.getUnitTransform().inverseRay2( ray );
      return this.getUnitArcSegment().windingIntersection( rayInUnitCircleSpace );
    },

    // assumes the current position is at start
    writeToContext: function( context ) {
      if ( context.ellipse ) {
        context.ellipse( this._center.x, this._center.y, this._radiusX, this._radiusY, this._rotation, this._startAngle, this._endAngle, this._anticlockwise );
      }
      else {
        // fake the ellipse call by using transforms
        this.getUnitTransform().getMatrix().canvasAppendTransform( context );
        context.arc( 0, 0, 1, this._startAngle, this._endAngle, this._anticlockwise );
        this.getUnitTransform().getInverse().canvasAppendTransform( context );
      }
    },

    transformed: function( matrix ) {
      var transformedSemiMajorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusX, this._rotation ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
      var transformedSemiMinorAxis = matrix.timesVector2( Vector2.createPolar( this._radiusY, this._rotation + Math.PI / 2 ) ).minus( matrix.timesVector2( Vector2.ZERO ) );
      var rotation = transformedSemiMajorAxis.angle();
      var radiusX = transformedSemiMajorAxis.magnitude();
      var radiusY = transformedSemiMinorAxis.magnitude();

      var reflected = matrix.getDeterminant() < 0;

      // reverse the 'clockwiseness' if our transform includes a reflection
      // TODO: check reflections. swapping angle signs should fix clockwiseness
      var anticlockwise = reflected ? !this._anticlockwise : this._anticlockwise;
      var startAngle = reflected ? -this._startAngle : this._startAngle;
      var endAngle = reflected ? -this._endAngle : this._endAngle;

      if ( Math.abs( this._endAngle - this._startAngle ) === Math.PI * 2 ) {
        endAngle = anticlockwise ? startAngle - Math.PI * 2 : startAngle + Math.PI * 2;
      }

      return new kite.EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );
    }
  } );

  Segment.addInvalidatingGetterSetter( EllipticalArc, 'center' );
  Segment.addInvalidatingGetterSetter( EllipticalArc, 'radiusX' );
  Segment.addInvalidatingGetterSetter( EllipticalArc, 'radiusY' );
  Segment.addInvalidatingGetterSetter( EllipticalArc, 'rotation' );
  Segment.addInvalidatingGetterSetter( EllipticalArc, 'startAngle' );
  Segment.addInvalidatingGetterSetter( EllipticalArc, 'endAngle' );
  Segment.addInvalidatingGetterSetter( EllipticalArc, 'anticlockwise' );

  // adapted from http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
  // transforms the unit circle onto our ellipse
  EllipticalArc.computeUnitTransform = function( center, radiusX, radiusY, rotation ) {
    return new Transform3( Matrix3.translation( center.x, center.y ) // TODO: convert to Matrix3.translation( this._center) when available
      .timesMatrix( Matrix3.rotation2( rotation ) )
      .timesMatrix( Matrix3.scaling( radiusX, radiusY ) ) );
  };

  return EllipticalArc;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Shape handling
 *
 * Shapes are internally made up of Subpaths, which contain a series of segments, and are optionally closed.
 * Familiarity with how Canvas handles subpaths is helpful for understanding this code.
 *
 * Canvas spec: http://www.w3.org/TR/2dcontext/
 * SVG spec: http://www.w3.org/TR/SVG/expanded-toc.html
 *           http://www.w3.org/TR/SVG/paths.html#PathData (for paths)
 * Notes for elliptical arcs: http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
 * Notes for painting strokes: https://svgwg.org/svg2-draft/painting.html
 *
 * TODO: add nonzero / evenodd support when browsers support it
 * TODO: docs
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/Shape',['require','KITE/kite','PHET_CORE/inherit','AXON/Events','DOT/Vector2','DOT/Bounds2','DOT/Ray2','KITE/util/Subpath','KITE/parser/svgPath','KITE/segments/Arc','KITE/segments/Cubic','KITE/segments/EllipticalArc','KITE/segments/Line','KITE/segments/Quadratic'],function( require ) {
  'use strict';

  var kite = require( 'KITE/kite' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Events = require( 'AXON/Events' );

  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Ray2 = require( 'DOT/Ray2' );

  var Subpath = require( 'KITE/util/Subpath' );
  var svgPath = require( 'KITE/parser/svgPath' );
  var Arc = require( 'KITE/segments/Arc' );
  var Cubic = require( 'KITE/segments/Cubic' );
  var EllipticalArc = require( 'KITE/segments/EllipticalArc' );
  var Line = require( 'KITE/segments/Line' );
  var Quadratic = require( 'KITE/segments/Quadratic' );

  // for brevity
  function p( x, y ) { return new Vector2( x, y ); }

  function v( x, y ) { return new Vector2( x, y ); } // TODO: use this version in general, it makes more sense and is easier to type

  // The tension parameter controls how smoothly the curve turns through its control points. For a Catmull-Rom
  // curve, the tension is zero. The tension should range from -1 to 1.
  function weightedSplineVector( beforeVector, currentVector, afterVector, tension ) {
    return afterVector.copy()
      .subtract( beforeVector )
      .multiplyScalar( ( 1 - tension ) / 6 )
      .add( currentVector );
  }

  // a normalized vector for non-zero winding checks
  // var weirdDir = p( Math.PI, 22 / 7 );

  // all arguments optional, they are for the copy() method. if used, ensure that 'bounds' is consistent with 'subpaths'
  function Shape( subpaths, bounds ) {
    var self = this;

    Events.call( this );

    // @public Lower-level piecewise mathematical description using segments, also individually immutable
    this.subpaths = [];

    // If non-null, computed bounds for all pieces added so far. Lazily computed with getBounds/bounds ES5 getter
    this._bounds = bounds ? bounds.copy() : null; // {Bounds2 | null}

    this.resetControlPoints();

    this._invalidateListener = this.invalidate.bind( this );
    this._invalidatingPoints = false; // So we can invalidate all of the points without firing invalidation tons of times

    // Add in subpaths from the constructor (if applicable)
    if ( typeof subpaths === 'object' ) {
      // assume it's an array
      for ( var i = 0; i < subpaths.length; i++ ) {
        this.addSubpath( subpaths[ i ] );
      }
    }

    if ( subpaths && typeof subpaths !== 'object' ) {
      assert && assert( typeof subpaths === 'string', 'if subpaths is not an object, it must be a string' );
      // parse the SVG path
      _.each( svgPath.parse( subpaths ), function( item ) {
        assert && assert( Shape.prototype[ item.cmd ] !== undefined, 'method ' + item.cmd + ' from parsed SVG does not exist' );
        self[ item.cmd ].apply( self, item.args );
      } );
    }

    // defines _bounds if not already defined (among other things)
    this.invalidate();

    phetAllocation && phetAllocation( 'Shape' );
  }

  kite.register( 'Shape', Shape );

  inherit( Events, Shape, {

    // for tracking the last quadratic/cubic control point for smooth* functions
    // see https://github.com/phetsims/kite/issues/38
    resetControlPoints: function() {
      this.lastQuadraticControlPoint = null;
      this.lastCubicControlPoint = null;
    },
    setQuadraticControlPoint: function( point ) {
      this.lastQuadraticControlPoint = point;
      this.lastCubicControlPoint = null;
    },
    setCubicControlPoint: function( point ) {
      this.lastQuadraticControlPoint = null;
      this.lastCubicControlPoint = point;
    },

    // Adds a new subpath if there have already been draw calls made. Will prevent any line or connection from the last
    // draw call to future draw calls.
    subpath: function() {
      if ( this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
      }

      return this; // for chaining
    },

    moveTo: function( x, y ) { return this.moveToPoint( v( x, y ) ); },
    moveToRelative: function( x, y ) { return this.moveToPointRelative( v( x, y ) ); },
    moveToPointRelative: function( point ) { return this.moveToPoint( this.getRelativePoint().plus( point ) ); },
    moveToPoint: function( point ) {
      this.addSubpath( new Subpath().addPoint( point ) );
      this.resetControlPoints();

      return this;
    },

    lineTo: function( x, y ) { return this.lineToPoint( v( x, y ) ); },
    lineToRelative: function( x, y ) { return this.lineToPointRelative( v( x, y ) ); },
    lineToPointRelative: function( point ) { return this.lineToPoint( this.getRelativePoint().plus( point ) ); },
    lineToPoint: function( point ) {
      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-lineto
      if ( this.hasSubpaths() ) {
        var start = this.getLastSubpath().getLastPoint();
        var end = point;
        var line = new Line( start, end );
        this.getLastSubpath().addPoint( end );
        this.addSegmentAndBounds( line );
      }
      else {
        this.ensure( point );
      }
      this.resetControlPoints();

      return this;
    },

    horizontalLineTo: function( x ) { return this.lineTo( x, this.getRelativePoint().y ); },
    horizontalLineToRelative: function( x ) { return this.lineToRelative( x, 0 ); },

    verticalLineTo: function( y ) { return this.lineTo( this.getRelativePoint().x, y ); },
    verticalLineToRelative: function( y ) { return this.lineToRelative( 0, y ); },

    quadraticCurveTo: function( cpx, cpy, x, y ) { return this.quadraticCurveToPoint( v( cpx, cpy ), v( x, y ) ); },
    quadraticCurveToRelative: function( cpx, cpy, x, y ) { return this.quadraticCurveToPointRelative( v( cpx, cpy ), v( x, y ) ); },
    quadraticCurveToPointRelative: function( controlPoint, point ) {
      var relativePoint = this.getRelativePoint();
      return this.quadraticCurveToPoint( relativePoint.plus( controlPoint ), relativePoint.plus( point ) );
    },
    // TODO: consider a rename to put 'smooth' farther back?
    smoothQuadraticCurveTo: function( x, y ) { return this.quadraticCurveToPoint( this.getSmoothQuadraticControlPoint(), v( x, y ) ); },
    smoothQuadraticCurveToRelative: function( x, y ) { return this.quadraticCurveToPoint( this.getSmoothQuadraticControlPoint(), v( x, y ).plus( this.getRelativePoint() ) ); },
    quadraticCurveToPoint: function( controlPoint, point ) {
      var shape = this;

      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-quadraticcurveto
      this.ensure( controlPoint );
      var start = this.getLastSubpath().getLastPoint();
      var quadratic = new Quadratic( start, controlPoint, point );
      this.getLastSubpath().addPoint( point );
      var nondegenerateSegments = quadratic.getNondegenerateSegments();
      _.each( nondegenerateSegments, function( segment ) {
        // TODO: optimization
        shape.addSegmentAndBounds( segment );
      } );
      this.setQuadraticControlPoint( controlPoint );

      return this;
    },

    cubicCurveTo: function( cp1x, cp1y, cp2x, cp2y, x, y ) { return this.cubicCurveToPoint( v( cp1x, cp1y ), v( cp2x, cp2y ), v( x, y ) ); },
    cubicCurveToRelative: function( cp1x, cp1y, cp2x, cp2y, x, y ) { return this.cubicCurveToPointRelative( v( cp1x, cp1y ), v( cp2x, cp2y ), v( x, y ) ); },
    cubicCurveToPointRelative: function( control1, control2, point ) {
      var relativePoint = this.getRelativePoint();
      return this.cubicCurveToPoint( relativePoint.plus( control1 ), relativePoint.plus( control2 ), relativePoint.plus( point ) );
    },
    smoothCubicCurveTo: function( cp2x, cp2y, x, y ) { return this.cubicCurveToPoint( this.getSmoothCubicControlPoint(), v( cp2x, cp2y ), v( x, y ) ); },
    smoothCubicCurveToRelative: function( cp2x, cp2y, x, y ) { return this.cubicCurveToPoint( this.getSmoothCubicControlPoint(), v( cp2x, cp2y ).plus( this.getRelativePoint() ), v( x, y ).plus( this.getRelativePoint() ) ); },
    cubicCurveToPoint: function( control1, control2, point ) {
      var shape = this;
      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-quadraticcurveto
      this.ensure( control1 );
      var start = this.getLastSubpath().getLastPoint();
      var cubic = new Cubic( start, control1, control2, point );

      var nondegenerateSegments = cubic.getNondegenerateSegments();
      _.each( nondegenerateSegments, function( segment ) {
        shape.addSegmentAndBounds( segment );
      } );
      this.getLastSubpath().addPoint( point );

      this.setCubicControlPoint( control2 );

      return this;
    },

    arc: function( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) { return this.arcPoint( v( centerX, centerY ), radius, startAngle, endAngle, anticlockwise ); },
    arcPoint: function( center, radius, startAngle, endAngle, anticlockwise ) {
      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-arc

      var arc = new Arc( center, radius, startAngle, endAngle, anticlockwise );

      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = arc.getStart();
      var endPoint = arc.getEnd();

      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint(), 0 ) ) {
        this.addSegmentAndBounds( new Line( this.getLastSubpath().getLastPoint(), startPoint ) );
      }

      if ( !this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
      }

      // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
      this.getLastSubpath().addPoint( startPoint );
      this.getLastSubpath().addPoint( endPoint );

      this.addSegmentAndBounds( arc );
      this.resetControlPoints();

      return this;
    },

    ellipticalArc: function( centerX, centerY, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) { return this.ellipticalArcPoint( v( centerX, centerY ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ); },
    ellipticalArcPoint: function( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
      // see http://www.w3.org/TR/2dcontext/#dom-context-2d-arc

      var ellipticalArc = new EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );

      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = ellipticalArc.start;
      var endPoint = ellipticalArc.end;

      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint(), 0 ) ) {
        this.addSegmentAndBounds( new Line( this.getLastSubpath().getLastPoint(), startPoint ) );
      }

      if ( !this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
      }

      // technically the Canvas spec says to add the start point, so we do this even though it is probably completely unnecessary (there is no conditional)
      this.getLastSubpath().addPoint( startPoint );
      this.getLastSubpath().addPoint( endPoint );

      this.addSegmentAndBounds( ellipticalArc );
      this.resetControlPoints();

      return this;
    },

    close: function() {
      if ( this.hasSubpaths() ) {
        var previousPath = this.getLastSubpath();
        var nextPath = new Subpath();

        previousPath.close();
        this.addSubpath( nextPath );
        nextPath.addPoint( previousPath.getFirstPoint() );
      }
      this.resetControlPoints();
      return this;
    },

    // matches SVG's elliptical arc from http://www.w3.org/TR/SVG/paths.html
    ellipticalArcToRelative: function( radiusX, radiusY, rotation, largeArc, sweep, x, y ) {
      var relativePoint = this.getRelativePoint();
      return this.ellipticalArcTo( radiusX, radiusY, rotation, largeArc, sweep, x + relativePoint.x, y + relativePoint.y );
    },
    ellipticalArcTo: function( radiusX, radiusY, rotation, largeArc, sweep, x, y ) {
      throw new Error( 'ellipticalArcTo unimplemented' );
    },

    /*
     * Draws a circle using the arc() call with the following parameters:
     * circle( center, radius ) // center is a Vector2
     * circle( centerX, centerY, radius )
     */
    circle: function( centerX, centerY, radius ) {
      if ( typeof centerX === 'object' ) {
        // circle( center, radius )
        var center = centerX;
        radius = centerY;
        return this.arcPoint( center, radius, 0, Math.PI * 2, false );
      }
      else {
        // circle( centerX, centerY, radius )
        return this.arcPoint( p( centerX, centerY ), radius, 0, Math.PI * 2, false );
      }
    },

    /*
     * Draws an ellipse using the ellipticalArc() call with the following parameters:
     * ellipse( center, radiusX, radiusY, rotation ) // center is a Vector2
     * ellipse( centerX, centerY, radiusX, radiusY, rotation )
     *
     * The rotation is about the centerX, centerY.
     */
    ellipse: function( centerX, centerY, radiusX, radiusY, rotation ) {
      // TODO: separate into ellipse() and ellipsePoint()?
      // TODO: Ellipse/EllipticalArc has a mess of parameters. Consider parameter object, or double-check parameter handling
      if ( typeof centerX === 'object' ) {
        // ellipse( center, radiusX, radiusY, rotation )
        var center = centerX;
        rotation = radiusY;
        radiusY = radiusX;
        radiusX = centerY;
        return this.ellipticalArcPoint( center, radiusX, radiusY, rotation || 0, 0, Math.PI * 2, false );
      }
      else {
        // ellipse( centerX, centerY, radiusX, radiusY, rotation )
        return this.ellipticalArcPoint( v( centerX, centerY ), radiusX, radiusY, rotation || 0, 0, Math.PI * 2, false );
      }
    },

    rect: function( x, y, width, height ) {
      var subpath = new Subpath();
      this.addSubpath( subpath );
      subpath.addPoint( v( x, y ) );
      subpath.addPoint( v( x + width, y ) );
      subpath.addPoint( v( x + width, y + height ) );
      subpath.addPoint( v( x, y + height ) );
      this.addSegmentAndBounds( new Line( subpath.points[ 0 ], subpath.points[ 1 ] ) );
      this.addSegmentAndBounds( new Line( subpath.points[ 1 ], subpath.points[ 2 ] ) );
      this.addSegmentAndBounds( new Line( subpath.points[ 2 ], subpath.points[ 3 ] ) );
      subpath.close();
      this.addSubpath( new Subpath() );
      this.getLastSubpath().addPoint( v( x, y ) );
      assert && assert( !isNaN( this.bounds.getX() ) );
      this.resetControlPoints();

      return this;
    },

    //Create a round rectangle. All arguments are number.
    roundRect: function( x, y, width, height, arcw, arch ) {
      var lowX = x + arcw;
      var highX = x + width - arcw;
      var lowY = y + arch;
      var highY = y + height - arch;
      // if ( true ) {
      if ( arcw === arch ) {
        // we can use circular arcs, which have well defined stroked offsets
        this
          .arc( highX, lowY, arcw, -Math.PI / 2, 0, false )
          .arc( highX, highY, arcw, 0, Math.PI / 2, false )
          .arc( lowX, highY, arcw, Math.PI / 2, Math.PI, false )
          .arc( lowX, lowY, arcw, Math.PI, Math.PI * 3 / 2, false )
          .close();
      }
      else {
        // we have to resort to elliptical arcs
        this
          .ellipticalArc( highX, lowY, arcw, arch, 0, -Math.PI / 2, 0, false )
          .ellipticalArc( highX, highY, arcw, arch, 0, 0, Math.PI / 2, false )
          .ellipticalArc( lowX, highY, arcw, arch, 0, Math.PI / 2, Math.PI, false )
          .ellipticalArc( lowX, lowY, arcw, arch, 0, Math.PI, Math.PI * 3 / 2, false )
          .close();
      }
      return this;
    },

    polygon: function( vertices ) {
      var length = vertices.length;
      if ( length > 0 ) {
        this.moveToPoint( vertices[ 0 ] );
        for ( var i = 1; i < length; i++ ) {
          this.lineToPoint( vertices[ i ] );
        }
      }
      return this.close();
    },

    /**
     * This is a convenience function that allows to generate Cardinal splines
     * from a position array. Cardinal spline differs from Bezier curves in that all
     * defined points on a Cardinal spline are on the path itself.
     *
     * It includes a tension parameter to allow the client to specify how tightly
     * the path interpolates between points. One can think of the tension as the tension in
     * a rubber band around pegs. however unlike a rubber band the tension can be negative.
     * the tension ranges from -1 to 1
     *
     * @param {Array.<Vector2>} positions
     * @param {Object} [options] - see documentation below
     * @returns {Shape}
     */
    cardinalSpline: function( positions, options ) {
      options = _.extend( {
        // the tension parameter controls how smoothly the curve turns through its
        // control points. For a Catmull-Rom curve the tension is zero.
        // the tension should range from  -1 to 1
        tension: 0,

        // is the resulting shape forming a closed line?
        isClosedLineSegments: false
      }, options );

      assert && assert( options.tension < 1 && options.tension > -1, ' the tension goes from -1 to 1 ' );

      var pointNumber = positions.length; // number of points in the array

      // if the line is open, there is one less segments than point vectors
      var segmentNumber = ( options.isClosedLineSegments ) ? pointNumber : pointNumber - 1;

      for ( var i = 0; i < segmentNumber; i++ ) {
        var cardinalPoints; // {Array.<Vector2>} cardinal points Array
        if ( i === 0 && !options.isClosedLineSegments ) {
          cardinalPoints = [
            positions[ 0 ],
            positions[ 0 ],
            positions[ 1 ],
            positions[ 2 ] ];
        }
        else if ( (i === segmentNumber - 1) && !options.isClosedLineSegments ) {
          cardinalPoints = [
            positions[ i - 1 ],
            positions[ i ],
            positions[ i + 1 ],
            positions[ i + 1 ] ];
        }
        else {
          cardinalPoints = [
            positions[ ( i - 1 + pointNumber ) % pointNumber ],
            positions[ i % pointNumber ],
            positions[ ( i + 1 ) % pointNumber ],
            positions[ ( i + 2 ) % pointNumber ] ];
        }

        // Cardinal Spline to Cubic Bezier conversion matrix
        //    0                 1             0            0
        //  (-1+tension)/6      1      (1-tension)/6       0
        //    0            (1-tension)/6      1       (-1+tension)/6
        //    0                 0             1           0

        // {Array.<Vector2>} bezier points Array
        var bezierPoints = [
          cardinalPoints[ 1 ],
          weightedSplineVector( cardinalPoints[ 0 ], cardinalPoints[ 1 ], cardinalPoints[ 2 ], options.tension ),
          weightedSplineVector( cardinalPoints[ 3 ], cardinalPoints[ 2 ], cardinalPoints[ 1 ], options.tension ),
          cardinalPoints[ 2 ]
        ];

        // special operations on the first point
        if ( i === 0 ) {
          this.ensure( bezierPoints[ 0 ] );
          this.getLastSubpath().addPoint( bezierPoints[ 0 ] );
        }

        this.cubicCurveToPoint( bezierPoints[ 1 ], bezierPoints[ 2 ], bezierPoints[ 3 ] );
      }

      return this;
    },

    copy: function() {
      // copy each individual subpath, so future modifications to either Shape doesn't affect the other one
      return new Shape( _.map( this.subpaths, function( subpath ) { return subpath.copy(); } ), this.bounds );
    },

    // write out this shape's path to a canvas 2d context. does NOT include the beginPath()!
    writeToContext: function( context ) {
      var len = this.subpaths.length;
      for ( var i = 0; i < len; i++ ) {
        this.subpaths[ i ].writeToContext( context );
      }
    },

    // returns something like "M150 0 L75 200 L225 200 Z" for a triangle
    getSVGPath: function() {
      var string = '';
      var len = this.subpaths.length;
      for ( var i = 0; i < len; i++ ) {
        var subpath = this.subpaths[ i ];
        if ( subpath.isDrawable() ) {
          // since the commands after this are relative to the previous 'point', we need to specify a move to the initial point
          var startPoint = subpath.segments[ 0 ].start;
          assert && assert( startPoint.equalsEpsilon( subpath.getFirstPoint(), 0.00001 ) ); // sanity check
          string += 'M ' + kite.svgNumber( startPoint.x ) + ' ' + kite.svgNumber( startPoint.y ) + ' ';

          for ( var k = 0; k < subpath.segments.length; k++ ) {
            string += subpath.segments[ k ].getSVGPathFragment() + ' ';
          }

          if ( subpath.isClosed() ) {
            string += 'Z ';
          }
        }
      }
      return string;
    },

    // return a new Shape that is transformed by the associated matrix
    transformed: function( matrix ) {
      // TODO: allocation reduction
      var subpaths = _.map( this.subpaths, function( subpath ) { return subpath.transformed( matrix ); } );
      var bounds = _.reduce( subpaths, function( bounds, subpath ) { return bounds.union( subpath.bounds ); }, Bounds2.NOTHING );
      return new Shape( subpaths, bounds );
    },

    /*
     * Provided options (see Segment.nonlinearTransformed)
     * - minLevels:                       how many levels to force subdivisions
     * - maxLevels:                       prevent subdivision past this level
     * - distanceEpsilon (optional null): controls level of subdivision by attempting to ensure a maximum (squared) deviation from the curve. smaller => more subdivision
     * - curveEpsilon (optional null):    controls level of subdivision by attempting to ensure a maximum curvature change between segments. smaller => more subdivision
     * -   OR includeCurvature:           {Boolean}, whether to include a default curveEpsilon (usually off by default)
     * - pointMap (optional):             function( Vector2 ) : Vector2, represents a (usually non-linear) transformation applied
     * - methodName (optional):           if the method name is found on the segment, it is called with the expected signature function( options ) : Array[Segment]
     *                                    instead of using our brute-force logic. Supports optimizations for custom non-linear transforms (like polar coordinates)
     */
    nonlinearTransformed: function( options ) {
      // defaults
      options = _.extend( {
        minLevels: 0,
        maxLevels: 7,
        distanceEpsilon: 0.16, // NOTE: this will change when the Shape is scaled, since this is a threshold for the square of a distance value
        curveEpsilon: ( options && options.includeCurvature ) ? 0.002 : null
      }, options );

      // TODO: allocation reduction
      var subpaths = _.map( this.subpaths, function( subpath ) { return subpath.nonlinearTransformed( options ); } );
      var bounds = _.reduce( subpaths, function( bounds, subpath ) { return bounds.union( subpath.bounds ); }, Bounds2.NOTHING );
      return new Shape( subpaths, bounds );
    },

    /*
     * Maps points by treating their x coordinate as polar angle, and y coordinate as polar magnitude.
     * See http://en.wikipedia.org/wiki/Polar_coordinate_system
     *
     * Please see Shape.nonlinearTransformed for more documentation on adaptive discretization options (minLevels, maxLevels, distanceEpsilon, curveEpsilon)
     *
     * Example: A line from (0,10) to (pi,10) will be transformed to a circular arc from (10,0) to (-10,0) passing through (0,10).
     */
    polarToCartesian: function( options ) {
      return this.nonlinearTransformed( _.extend( {
        pointMap: function( p ) {
          return Vector2.createPolar( p.y, p.x );
          // return new Vector2( p.y * Math.cos( p.x ), p.y * Math.sin( p.x ) );
        },
        methodName: 'polarToCartesian' // this will be called on Segments if it exists to do more optimized conversion (see Line)
      }, options ) );
    },

    /*
     * Converts each segment into lines, using an adaptive (midpoint distance subdivision) method.
     *
     * NOTE: uses nonlinearTransformed method internally, but since we don't provide a pointMap or methodName, it won't create anything but line segments.
     * See nonlinearTransformed for documentation of options
     */
    toPiecewiseLinear: function( options ) {
      assert && assert( !options.pointMap, 'No pointMap for toPiecewiseLinear allowed, since it could create non-linear segments' );
      assert && assert( !options.methodName, 'No methodName for toPiecewiseLinear allowed, since it could create non-linear segments' );
      return this.nonlinearTransformed( options );
    },

    containsPoint: function( point ) {
      // we pick a ray, and determine the winding number over that ray. if the number of segments crossing it CCW == number of segments crossing it CW, then the point is contained in the shape
      var ray = new Ray2( point, Vector2.X_UNIT );

      return this.windingIntersection( ray ) !== 0;
    },

    intersection: function( ray ) {
      var hits = [];
      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[ i ];

        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            var segment = subpath.segments[ k ];
            hits = hits.concat( segment.intersection( ray ) );
          }

          if ( subpath.hasClosingSegment() ) {
            hits = hits.concat( subpath.getClosingSegment().intersection( ray ) );
          }
        }
      }
      return _.sortBy( hits, function( hit ) { return hit.distance; } );
    },

    windingIntersection: function( ray ) {
      var wind = 0;

      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[ i ];

        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            wind += subpath.segments[ k ].windingIntersection( ray );
          }

          // handle the implicit closing line segment
          if ( subpath.hasClosingSegment() ) {
            wind += subpath.getClosingSegment().windingIntersection( ray );
          }
        }
      }

      return wind;
    },

    /**
     * Whether the path of the Shape intersects (or is contained in) the provided bounding box.
     * Computed by checking intersections with all four edges of the bounding box, or whether the Shape is totally
     * contained within the bounding box.
     *
     * @param {Bounds2} bounds
     */
    intersectsBounds: function( bounds ) {
      // If the bounding box completely surrounds our shape, it intersects the bounds
      if ( this.bounds.intersection( bounds ).equals( this.bounds ) ) {
        return true;
      }

      // rays for hit testing along the bounding box edges
      var minHorizontalRay = new Ray2( new Vector2( bounds.minX, bounds.minY ), new Vector2( 1, 0 ) );
      var minVerticalRay = new Ray2( new Vector2( bounds.minX, bounds.minY ), new Vector2( 0, 1 ) );
      var maxHorizontalRay = new Ray2( new Vector2( bounds.maxX, bounds.maxY ), new Vector2( -1, 0 ) );
      var maxVerticalRay = new Ray2( new Vector2( bounds.maxX, bounds.maxY ), new Vector2( 0, -1 ) );

      var hitPoint;
      var i;
      // TODO: could optimize to intersect differently so we bail sooner
      var horizontalRayIntersections = this.intersection( minHorizontalRay ).concat( this.intersection( maxHorizontalRay ) );
      for ( i = 0; i < horizontalRayIntersections.length; i++ ) {
        hitPoint = horizontalRayIntersections[ i ].point;
        if ( hitPoint.x >= bounds.minX && hitPoint.x <= bounds.maxX ) {
          return true;
        }
      }

      var verticalRayIntersections = this.intersection( minVerticalRay ).concat( this.intersection( maxVerticalRay ) );
      for ( i = 0; i < verticalRayIntersections.length; i++ ) {
        hitPoint = verticalRayIntersections[ i ].point;
        if ( hitPoint.y >= bounds.minY && hitPoint.y <= bounds.maxY ) {
          return true;
        }
      }

      // not contained, and no intersections with the sides of the bounding box
      return false;
    },

    // returns a new Shape that is an outline of the stroked path of this current Shape. currently not intended to be nested (doesn't do intersection computations yet)
    // TODO: rename stroked( lineStyles )
    getStrokedShape: function( lineStyles ) {
      var subpaths = [];
      var bounds = Bounds2.NOTHING.copy();
      var subLen = this.subpaths.length;
      for ( var i = 0; i < subLen; i++ ) {
        var subpath = this.subpaths[ i ];
        var strokedSubpath = subpath.stroked( lineStyles );
        subpaths = subpaths.concat( strokedSubpath );
      }
      subLen = subpaths.length;
      for ( i = 0; i < subLen; i++ ) {
        bounds.includeBounds( subpaths[ i ].bounds );
      }
      return new Shape( subpaths, bounds );
    },

    // {experimental!}
    getOffsetShape: function( distance ) {
      // TODO: abstract away this type of behavior
      var subpaths = [];
      var bounds = Bounds2.NOTHING.copy();
      var subLen = this.subpaths.length;
      for ( var i = 0; i < subLen; i++ ) {
        subpaths.push( this.subpaths[ i ].offset( distance ) );
      }
      subLen = subpaths.length;
      for ( i = 0; i < subLen; i++ ) {
        bounds.includeBounds( subpaths[ i ].bounds );
      }
      return new Shape( subpaths, bounds );
    },

    getBounds: function() {
      if ( this._bounds === null ) {
        var bounds = Bounds2.NOTHING.copy();
        _.each( this.subpaths, function( subpath ) {
          bounds.includeBounds( subpath.getBounds() );
        } );
        this._bounds = bounds;
      }
      return this._bounds;
    },
    get bounds() { return this.getBounds(); },

    getStrokedBounds: function( lineStyles ) {
      // Check if all of our segments end vertically or horizontally AND our drawable subpaths are all closed. If so,
      // we can apply a bounds dilation.
      var areStrokedBoundsDilated = true;
      for ( var i = 0; i < this.subpaths.length; i++ ) {
        var subpath = this.subpaths[ i ];

        // If a subpath with any segments is NOT closed, line-caps will apply. We can't make the simplification in this
        // case.
        if ( subpath.isDrawable() && !subpath.isClosed() ) {
          areStrokedBoundsDilated = false;
          break;
        }
        for ( var j = 0; j < subpath.segments.length; j++ ) {
          var segment = subpath.segments[ j ];
          if ( !segment.areStrokedBoundsDilated() ) {
            areStrokedBoundsDilated = false;
            break;
          }
        }
      }

      if ( areStrokedBoundsDilated ) {
        return this.bounds.dilated( lineStyles.lineWidth / 2 );
      }
      else {
        return this.bounds.union( this.getStrokedShape( lineStyles ).bounds );
      }
    },

    getBoundsWithTransform: function( matrix, lineStyles ) {
      // if we don't need to handle rotation/shear, don't use the extra effort!
      if ( matrix.isAxisAligned() ) {
        return this.getStrokedBounds( lineStyles );
      }

      var bounds = Bounds2.NOTHING.copy();

      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[ i ];
        bounds.includeBounds( subpath.getBoundsWithTransform( matrix ) );
      }

      if ( lineStyles ) {
        bounds.includeBounds( this.getStrokedShape( lineStyles ).getBoundsWithTransform( matrix ) );
      }

      return bounds;
    },

    /**
     * Should be called after mutating the x/y of Vector2 points that were passed in to various Shape calls, so that
     * derived information computed (bounds, etc.) will be correct, and any clients (e.g. Scenery Paths) will be
     * notified of the updates.
     */
    invalidatePoints: function() {
      this._invalidatingPoints = true;

      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        this.subpaths[ i ].invalidatePoints();
      }

      this._invalidatingPoints = false;
      this.invalidate();
    },

    toString: function() {
      // TODO: consider a more verbose but safer way?
      return 'new kite.Shape( \'' + this.getSVGPath() + '\' )';
    },

    /*---------------------------------------------------------------------------*
     * Internal subpath computations
     *----------------------------------------------------------------------------*/

    // @private
    invalidate: function() {
      if ( !this._invalidatingPoints ) {
        this._bounds = null;

        this.trigger0( 'invalidated' );
      }
    },

    // @private
    addSegmentAndBounds: function( segment ) {
      this.getLastSubpath().addSegment( segment );
      this.invalidate();
    },

    // @private
    ensure: function( point ) {
      if ( !this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
        this.getLastSubpath().addPoint( point );
      }
    },

    // @private
    addSubpath: function( subpath ) {
      this.subpaths.push( subpath );

      // listen to when the subpath is invalidated (will cause bounds recomputation here)
      subpath.onStatic( 'invalidated', this._invalidateListener );

      this.invalidate();

      return this; // allow chaining
    },

    // @private
    hasSubpaths: function() {
      return this.subpaths.length > 0;
    },

    // @private
    getLastSubpath: function() {
      return _.last( this.subpaths );
    },

    // @private - gets the last point in the last subpath, or null if it doesn't exist
    getLastPoint: function() {
      return this.hasSubpaths() ? this.getLastSubpath().getLastPoint() : null;
    },

    // @private
    getLastSegment: function() {
      if ( !this.hasSubpaths() ) { return null; }

      var subpath = this.getLastSubpath();
      if ( !subpath.isDrawable() ) { return null; }

      return subpath.getLastSegment();
    },

    // @private - returns the point to be used for smooth quadratic segments
    getSmoothQuadraticControlPoint: function() {
      var lastPoint = this.getLastPoint();

      if ( this.lastQuadraticControlPoint ) {
        return lastPoint.plus( lastPoint.minus( this.lastQuadraticControlPoint ) );
      }
      else {
        return lastPoint;
      }
    },

    // @private - returns the point to be used for smooth cubic segments
    getSmoothCubicControlPoint: function() {
      var lastPoint = this.getLastPoint();

      if ( this.lastCubicControlPoint ) {
        return lastPoint.plus( lastPoint.minus( this.lastCubicControlPoint ) );
      }
      else {
        return lastPoint;
      }
    },

    // @private
    getRelativePoint: function() {
      var lastPoint = this.getLastPoint();
      return lastPoint ? lastPoint : Vector2.ZERO;
    }
  } );

  /*---------------------------------------------------------------------------*
   * Shape shortcuts
   *----------------------------------------------------------------------------*/

  Shape.rectangle = function( x, y, width, height ) {
    return new Shape().rect( x, y, width, height );
  };
  Shape.rect = Shape.rectangle;

  // Create a round rectangle {Shape}, with {Number} arguments. Uses circular or elliptical arcs if given.
  Shape.roundRect = function( x, y, width, height, arcw, arch ) {
    return new Shape().roundRect( x, y, width, height, arcw, arch );
  };
  Shape.roundRectangle = Shape.roundRect;

  /**
   * Creates a rounded rectangle, where each corner can have a different radius. The radii default to 0, and may be set
   * using topLeft, topRight, bottomLeft and bottomRight in the options.
   * @public

   * E.g.:
   *
   * var cornerRadius = 20;
   * var rect = Shape.roundedRectangleWithRadii( 0, 0, 200, 100, {
   *   topLeft: cornerRadius,
   *   topRight: cornerRadius
   * } );
   *
   * @param {number} x - Left edge location
   * @param {number} y - Top edge location
   * @param {number} width - Width of rectangle
   * @param {number} height - Height of rectangle
   * @param {Object] [cornerRadii] - Optional object with potential radii for each corner.
   */
  Shape.roundedRectangleWithRadii = function( x, y, width, height, cornerRadii ) {
    // defaults to 0 (not using _.extends, since we reference each multiple times)
    var topLeftRadius = cornerRadii && cornerRadii.topLeft || 0;
    var topRightRadius = cornerRadii && cornerRadii.topRight || 0;
    var bottomLeftRadius = cornerRadii && cornerRadii.bottomLeft || 0;
    var bottomRightRadius = cornerRadii && cornerRadii.bottomRight || 0;

    // type and constraint assertions
    assert && assert( typeof x === 'number' && isFinite( x ), 'Non-finite x' );
    assert && assert( typeof y === 'number' && isFinite( y ), 'Non-finite y' );
    assert && assert( typeof width === 'number' && width >= 0 && isFinite( width ), 'Negative or non-finite width' );
    assert && assert( typeof height === 'number' && height >= 0 && isFinite( height ), 'Negative or non-finite height' );
    assert && assert( typeof topLeftRadius === 'number' && topLeftRadius >= 0 && isFinite( topLeftRadius ),
      'Invalid topLeft' );
    assert && assert( typeof topRightRadius === 'number' && topRightRadius >= 0 && isFinite( topRightRadius ),
      'Invalid topRight' );
    assert && assert( typeof bottomLeftRadius === 'number' && bottomLeftRadius >= 0 && isFinite( bottomLeftRadius ),
      'Invalid bottomLeft' );
    assert && assert( typeof bottomRightRadius === 'number' && bottomRightRadius >= 0 && isFinite( bottomRightRadius ),
      'Invalid bottomRight' );

    // verify there is no overlap between corners
    assert && assert( topLeftRadius + topRightRadius <= width, 'Corner overlap on top edge' );
    assert && assert( bottomLeftRadius + bottomRightRadius <= width, 'Corner overlap on bottom edge' );
    assert && assert( topLeftRadius + bottomLeftRadius <= height, 'Corner overlap on left edge' );
    assert && assert( topRightRadius + bottomRightRadius <= height, 'Corner overlap on right edge' );

    var shape = new kite.Shape();
    var right = x + width;
    var bottom = y + height;

    // To draw the rounded rectangle, we use the implicit "line from last segment to next segment" and the close() for
    // all of the straight line edges between arcs, or lineTo the corner.

    if ( bottomRightRadius > 0 ) {
      shape.arc( right - bottomRightRadius, bottom - bottomRightRadius, bottomRightRadius, 0, Math.PI / 2, false );
    }
    else {
      shape.moveTo( right, bottom );
    }

    if ( bottomLeftRadius > 0 ) {
      shape.arc( x + bottomLeftRadius, bottom - bottomLeftRadius, bottomLeftRadius, Math.PI / 2, Math.PI, false );
    }
    else {
      shape.lineTo( x, bottom );
    }

    if ( topLeftRadius > 0 ) {
      shape.arc( x + topLeftRadius, y + topLeftRadius, topLeftRadius, Math.PI, 3 * Math.PI / 2, false );
    }
    else {
      shape.lineTo( x, y );
    }

    if ( topRightRadius > 0 ) {
      shape.arc( right - topRightRadius, y + topRightRadius, topRightRadius, 3 * Math.PI / 2, 2 * Math.PI, false );
    }
    else {
      shape.lineTo( right, y );
    }

    shape.close();

    return shape;
  };

  Shape.polygon = function( vertices ) {
    return new Shape().polygon( vertices );
  };

  Shape.bounds = function( bounds ) {
    return new Shape().rect( bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY );
  };

  //Create a line segment, using either (x1,y1,x2,y2) or ({x1,y1},{x2,y2}) arguments
  Shape.lineSegment = function( a, b, c, d ) {
    // TODO: add type assertions?
    if ( typeof a === 'number' ) {
      return new Shape().moveTo( a, b ).lineTo( c, d );
    }
    else {
      return new Shape().moveToPoint( a ).lineToPoint( b );
    }
  };

  Shape.regularPolygon = function( sides, radius ) {
    var shape = new Shape();
    _.each( _.range( sides ), function( k ) {
      var point = Vector2.createPolar( radius, 2 * Math.PI * k / sides );
      ( k === 0 ) ? shape.moveToPoint( point ) : shape.lineToPoint( point );
    } );
    return shape.close();
  };

  // supports both circle( centerX, centerY, radius ), circle( center, radius ), and circle( radius ) with the center default to 0,0
  Shape.circle = function( centerX, centerY, radius ) {
    if ( centerY === undefined ) {
      // circle( radius ), center = 0,0
      return new Shape().circle( 0, 0, centerX );
    }
    return new Shape().circle( centerX, centerY, radius ).close();
  };

  /*
   * Supports ellipse( centerX, centerY, radiusX, radiusY, rotation ), ellipse( center, radiusX, radiusY, rotation ), and ellipse( radiusX, radiusY, rotation )
   * with the center default to 0,0 and rotation of 0.  The rotation is about the centerX, centerY.
   */
  Shape.ellipse = function( centerX, centerY, radiusX, radiusY, rotation ) {
    // TODO: Ellipse/EllipticalArc has a mess of parameters. Consider parameter object, or double-check parameter handling
    if ( radiusY === undefined ) {
      // ellipse( radiusX, radiusY ), center = 0,0
      return new Shape().ellipse( 0, 0, centerX, centerY, radiusX );
    }
    return new Shape().ellipse( centerX, centerY, radiusX, radiusY, rotation ).close();
  };

  // supports both arc( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) and arc( center, radius, startAngle, endAngle, anticlockwise )
  Shape.arc = function( centerX, centerY, radius, startAngle, endAngle, anticlockwise ) {
    return new Shape().arc( centerX, centerY, radius, startAngle, endAngle, anticlockwise );
  };

  return Shape;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Module that includes all Kite dependencies, so that requiring this module will return an object
 * that consists of the entire exported 'kite' namespace API.
 *
 * The API is actually generated by the 'kite' module, so if this module (or all other modules) are
 * not included, the 'kite' namespace may not be complete.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'main',[
  'KITE/kite',

  'KITE/Shape',
  'KITE/segments/Arc',
  'KITE/segments/Cubic',
  'KITE/segments/EllipticalArc',
  'KITE/segments/Line',
  'KITE/segments/Quadratic',
  'KITE/segments/Segment',
  'KITE/util/LineStyles',
  'KITE/util/Subpath',

  'KITE/parser/svgPath'
], function( kite // note: we don't need any of the other parts, we just need to specify them as dependencies so they fill in the kite namespace
) {
  'use strict';

  return kite;
} );

// Copyright 2015, University of Colorado Boulder

/**
 * Lightweight event & listener abstraction for a single event type.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 */
define( 'AXON/Emitter',['require','PHET_CORE/inherit','AXON/axon'],function( require ) {
  'use strict';

  // modules
  var inherit = require( 'PHET_CORE/inherit' );
  var axon = require( 'AXON/axon' );

  /**
   *
   * @constructor
   */
  function Emitter() {
    this.listeners = [];

    // @private - during emit() keep track of which listeners should receive events
    //            in order to manage removal of listeners during emit()
    this.listenersToEmitTo = [];
  }

  axon.register( 'Emitter', Emitter );

  return inherit( Object, Emitter, {

    /**
     * Adds a listener
     * @param {function} listener
     * @public
     */
    addListener: function( listener ) {

      // If callbacks are in progress, make a copy of the current list of listeners--the newly added listener
      // will be available for the next emit() but not the one in progress.  This is to match behavior with removeListener
      this.defendCallbacks();

      this.listeners.push( listener );
    },

    /**
     * Removes a listener
     * @param {function} listener
     * @public
     */
    removeListener: function( listener ) {

      var index = this.listeners.indexOf( listener );
      assert && assert( index >= 0, 'tried to removeListener on something that wasnt a listener' );

      // If callbacks are in progress, make a copy of the current list of listeners--the removed listener
      // will remain in the list and receive a callback for this emit call, see #72
      this.defendCallbacks();

      this.listeners.splice( index, 1 );
    },

    /**
     * Removes all the listeners
     * @public
     */
    removeAllListeners: function() {
      while ( this.listeners.length > 0 ) {
        this.removeListener( this.listeners[ 0 ] );
      }
    },

    /**
     * If processing callbacks during an emit() call and addListener/removeListener() is called,
     * make a defensive copy of the array of listener before changing the array, and use it for
     * the rest of the callbacks until the emit call has completed.
     * @private
     */
    defendCallbacks: function() {

      for ( var i = this.listenersToEmitTo.length - 1; i >= 0; i-- ) {

        // Once we meet a level that was already defended, we can stop, since all previous levels are also defended
        if ( this.listenersToEmitTo[ i ].defended ) {
          break;
        }
        else {
          var defendedListeners = this.listeners.slice();

          // Mark copies as 'defended' so that it will use the original listeners when emit started and not the modified list.
          defendedListeners.defended = true;
          this.listenersToEmitTo[ i ] = defendedListeners;
        }
      }
    },

    /**
     * Emits a single event.
     * This method is called many times in a simulation and must be well-optimized.
     * @public
     */
    emit: function() {
      this.listenersToEmitTo.push( this.listeners );
      var lastEntry = this.listenersToEmitTo.length - 1;

      for ( var i = 0; i < this.listenersToEmitTo[ lastEntry ].length; i++ ) {
        this.listenersToEmitTo[ lastEntry ][ i ]();
      }

      this.listenersToEmitTo.pop();
    },

    /**
     * Emits a single event with one argument.  This is a copy-paste of emit() for performance reasons.
     * @param {*} arg1
     * @public
     */
    emit1: function( arg1 ) {
      this.listenersToEmitTo.push( this.listeners );
      var lastEntry = this.listenersToEmitTo.length - 1;

      for ( var i = 0; i < this.listenersToEmitTo[ lastEntry ].length; i++ ) {
        this.listenersToEmitTo[ lastEntry ][ i ]( arg1 );
      }

      this.listenersToEmitTo.pop();
    },

    /**
     * Emits a single event with two arguments.  This is a copy-paste of emit() for performance reasons.
     * @param {*} arg1
     * @param {*} arg2
     * @public
     */
    emit2: function( arg1, arg2 ) {
      this.listenersToEmitTo.push( this.listeners );
      var lastEntry = this.listenersToEmitTo.length - 1;

      for ( var i = 0; i < this.listenersToEmitTo[ lastEntry ].length; i++ ) {
        this.listenersToEmitTo[ lastEntry ][ i ]( arg1, arg2 );
      }

      this.listenersToEmitTo.pop();
    },

    /**
     * Checks whether a listener is registered with this Emitter
     * @param {function} listener
     * @returns {boolean}
     * @public
     */
    hasListener: function( listener ) {
      assert && assert( arguments.length === 1, 'Emitter.hasListener should be called with 1 argument' );
      return this.listeners.indexOf( listener ) >= 0;
    },

    /**
     * Returns true if there are any listeners.
     * @returns {boolean}
     * @public
     */
    hasListeners: function() {
      assert && assert( arguments.length === 0, 'Emitter.hasListeners should be called without arguments' );
      return this.listeners.length > 0;
    }
  } );
} );
// Copyright 2014-2015, University of Colorado Boulder

/**
 * A Multilink is an instance that can be used to link to multiple properties.  It is very similar to a DerivedProperty,
 * but has no value and does not conform to the Property API because it is intended for use with callbacks that do not
 * compute a value.  Multilink should not be created through calling its constructor directly, but through the
 * Property.multilink and Property.lazyMultilink functions.
 *
 * @author Sam Reid
 */
define( 'AXON/Multilink',['require','AXON/axon','PHET_CORE/inherit'],function( require ) {
  'use strict';

  // modules
  var axon = require( 'AXON/axon' );
  var inherit = require( 'PHET_CORE/inherit' );

  /**
   * @param {Property[]} dependencies
   * @param {function} callback function that expects args in the same order as dependencies
   * @param {boolean} [lazy] Optional parameter that can be set to true if this should be a lazy multilink (no immediate callback)
   * @constructor
   */
  function Multilink( dependencies, callback, lazy ) {

    this.dependencies = dependencies; // @private

    // @private Keep track of each dependency and only update the changed value, for speed
    this.dependencyValues = dependencies.map( function( property ) {return property.get();} );

    var multilink = this;

    // @private Keep track of listeners so they can be detached
    this.dependencyListeners = [];

    //When a dependency value changes, update the list of dependencies and call back to the callback
    for ( var i = 0; i < dependencies.length; i++ ) {
      var dependency = dependencies[ i ];
      (function( dependency, i ) {
        var listener = function( newValue ) {
          multilink.dependencyValues[ i ] = newValue;
          callback.apply( null, multilink.dependencyValues );
        };
        multilink.dependencyListeners.push( listener );
        dependency.lazyLink( listener );
      })( dependency, i );
    }

    //Send initial call back but only if we are non-lazy
    if ( !lazy ) {
      callback.apply( null, this.dependencyValues );
    }
  }

  axon.register( 'Multilink', Multilink );

  return inherit( Object, Multilink, {

    // @public
    dispose: function() {
      // Unlink from dependent properties
      for ( var i = 0; i < this.dependencies.length; i++ ) {
        var dependency = this.dependencies[ i ];
        dependency.unlink( this.dependencyListeners[ i ] );
      }
      this.dependencies = null;
      this.dependencyListeners = null;
      this.dependencyValues = null;
    }
  } );
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * An observable property which notifies registered observers when the value changes.
 *
 * @author Sam Reid
 * @author Chris Malley (PixelZoom, Inc.)
 */
define( 'AXON/Property',['require','AXON/axon','PHET_CORE/inherit','AXON/Events','AXON/Emitter','AXON/Multilink'],function( require ) {
  'use strict';

  // modules
  var axon = require( 'AXON/axon' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Events = require( 'AXON/Events' );
  var Emitter = require( 'AXON/Emitter' );
  var Multilink = require( 'AXON/Multilink' );

  /**
   * @param {*} value - the initial value of the property
   * @param {Object} [options] - options
   * @constructor
   */
  function Property( value, options ) {

    var property = this;

    // Check duck type for incorrect Tandem argument
    if ( options && options.isTandem ) {
      assert && assert( false, 'Options should be an Object, not a Tandem' );
    }

    options = _.extend( { tandem: null }, options );

    // @private Internal Events for sending startedCallbacksForChanged & endedCallbacksForChanged
    this.events = new Events();

    // @private - Store the internal value and the initial value
    this._value = value;

    // @private - Initial value
    this._initialValue = value;

    // @private (unit-tests) - emit1 is called when the value changes (or on link)
    // Also used in ShapePlacementBoard.js at the moment
    this.changedEmitter = new Emitter();

    options.tandem && options.tandem.addInstance( this );

    // @private
    this.disposeProperty = function() {

      // Make sure there were no remaining observers.  If there are observers at disposal time, there may be a latent
      // memory leak, see #77
      assert && assert(
        property.changedEmitter.listeners.length === 0,
        'during disposal, expected 0 observers, actual = ' + property.changedEmitter.listeners.length
      );
      options.tandem && options.tandem.removeInstance( this );
    };
  }

  axon.register( 'Property', Property );

  return inherit( Object, Property, {

      /**
       * Gets the value.  You can also use the es5 getter (property.value) but this means is provided for inner loops or internal code that must be fast.
       * @return {*}
       * @public
       */
      get: function() {
        return this._value;
      },

      /**
       * Sets the value and notifies registered observers.  You can also use the es5 getter (property.value) but this means is provided for inner loops or internal code that must be fast.
       * If the value hasn't changed, this is a no-op.
       *
       * @param {*} value
       * @public
       */
      set: function( value ) {
        if ( !this.equalsValue( value ) ) {
          this._setAndNotifyObservers( value );
        }
        return this;
      },

      // @public returns true iff the specified value equals the value of this property
      equalsValue: function( value ) {
        return this.areValuesEqual( value, this._value );
      },

      /**
       * Determines equality semantics for the wrapped type, including whether notifications are sent out when the
       * wrapped value changes, and whether onValue is triggered.  A different implementation can be provided by
       * subclasses or instances to change the equals definition. See #10 and #73
       * @param {Object} a - should have the same type as Property element type
       * @param {Object} b - should have the same type as Property element type
       * @returns {boolean}
       * @public
       */
      areValuesEqual: function( a, b ) {
        return a === b;
      },

      // @public
      get initialValue() {
        return this._initialValue;
      },

      // @private
      _setAndNotifyObservers: function( value ) {
        var oldValue = this.get();
        this._value = value;
        this._notifyObservers( oldValue );
      },

      // @private
      _notifyObservers: function( oldValue ) {

        // Note the current value, since it will be sent to possibly multiple observers.
        var value = this.get();

        // TODO: Should Property extend or compose Events?  Would extending Events broaden its interface too much?
        this.events.trigger2( 'startedCallbacksForChanged', value, oldValue );

        this.changedEmitter.emit2( value, oldValue );

        this.events.trigger0( 'endedCallbacksForChanged' );
      },

      /**
       * Use this method when mutating a value (not replacing with a new instance) and you want to send notifications about the change.
       * This is different from the normal axon strategy, but may be necessary to prevent memory allocations.
       * This method is unsafe for removing observers because it assumes the observer list not modified, to save another allocation
       * Only provides the new reference as a callback (no oldvalue)
       * See https://github.com/phetsims/axon/issues/6
       * @public
       */
      notifyObserversStatic: function() {
        this.changedEmitter.emit1( this.get() );
      },

      /**
       * Resets the value to the initial value.
       * @public
       */
      reset: function() {
        this.set( this._initialValue );
      },

      // @public
      get value() { return this.get(); },

      // @public
      set value( newValue ) { this.set( newValue ); },

      /**
       * Adds an observer and notifies it immediately.
       * If observer is already registered, this is a no-op.
       * The initial notification provides the current value for newValue and null for oldValue.
       *
       * @param {function} observer a function of the form observer(newValue,oldValue)
       * @public
       */
      link: function( observer ) {
        if ( !this.changedEmitter.hasListener( observer ) ) {
          this.changedEmitter.addListener( observer );
          observer( this.get(), null ); // null should be used when an object is expected but unavailable
        }
      },

      /**
       * Add an observer to the Property, without calling it back right away.
       * This is used when you need to register a observer without an immediate callback.
       *
       * @param {function} observer - a function with a single argument, which is the value of the property at the time the function is called.
       * @public
       */
      lazyLink: function( observer ) {
        this.changedEmitter.addListener( observer );
      },

      /**
       * Removes an observer.
       * If observer is not registered, this is a no-op.
       *
       * @param {function} observer
       * @public
       */
      unlink: function( observer ) {
        if ( this.changedEmitter.hasListener( observer ) ) {
          this.changedEmitter.removeListener( observer );
        }
      },

      /**
       * Removes all observers.
       * If no observers are registered, this is a no-op.
       */
      unlinkAll: function() {
        this.changedEmitter.removeAllListeners();
      },

      /**
       * Links an object's named attribute to this property.  Returns a handle so it can be removed using Property.unlink();
       * Example: modelVisibleProperty.linkAttribute(view,'visible');
       *
       * @param object
       * @param attributeName
       * @public
       */
      linkAttribute: function( object, attributeName ) {
        var handle = function( value ) {object[ attributeName ] = value;};
        this.link( handle );
        return handle;
      },

      /**
       * Unlink an observer added with linkAttribute.  Note: the args of linkAttribute do not match the args of
       * unlinkAttribute: here, you must pass the observer handle returned by linkAttribute rather than object and attributeName
       *
       * @param observer
       * @public
       */
      unlinkAttribute: function( observer ) {
        this.unlink( observer );
      },

      // @public Provide toString for console debugging, see http://stackoverflow.com/questions/2485632/valueof-vs-tostring-in-javascript
      toString: function() {return 'Property{' + this.get() + '}'; },

      // @public
      valueOf: function() {return this.toString();},

      /**
       * Add an observer so that it will only fire once (and not on registration)
       *
       * I can see two ways to implement this:
       * (a) add a field to the observer so after notifications it can be checked and possibly removed. Disadvantage: will make everything slower even if not using 'once'
       * (b) wrap the observer in a new function which will call the observer and then remove itself.  Disadvantage: cannot remove an observer added using 'once'
       * To avoid possible performance problems, use a wrapper function, and return it as a handle in case the 'once' observer must be removed before it is called once
       *
       * @param observer the observer which should be called back only for one property change (and not on registration)
       * @returns {function} the wrapper handle in case the wrapped function needs to be removed with 'unlink' before it is called once
       * @public
       */
      once: function( observer ) {
        var property = this;
        var wrapper = function( newValue, oldValue ) {
          property.unlink( wrapper );
          observer( newValue, oldValue );
        };
        this.lazyLink( wrapper );
        return wrapper;
      },

      /**
       * Convenience function for debugging a property values.  It prints the new value on registration and when changed.
       * @param name debug name to be printed on the console
       * @returns {function} the handle to the linked observer in case it needs to be removed later
       * @public
       */
      debug: function( name ) {
        var observer = function( value ) { console.log( name, value ); };
        this.link( observer );
        return observer;
      },

      /**
       * Returns a function that can be used to toggle the property (using !)
       * @returns {function}
       * @public
       */
      get toggleFunction() {
        return this.toggle.bind( this );
      },

      /**
       * Modifies the value of this Property with the ! operator.  Works for booleans and non-booleans.
       * @public
       */
      toggle: function() {
        this.value = !this.value;
      },

      /**
       * Adds an observer that is fired when the property takes the specified value.  If the property has the value already,
       * the observer is called back immediately.  A reference to the observer is returned so that it can be removed.
       *
       * @param value the value to match
       * @param observer the observer that is called when this Property
       * @public
       */
      onValue: function( value, observer ) {
        var property = this;
        var onValueObserver = function( v ) {
          if ( property.areValuesEqual( v, value ) ) {
            observer();
          }
        };
        this.link( onValueObserver );
        return onValueObserver;
      },

      // @public Ensures that the Property is eligible for GC
      dispose: function() {
        this.disposeProperty();
      },

      /**
       * Returns true if there are any listeners.
       * @returns {boolean}
       * @public
       */
      hasListeners: function() {
        assert && assert( arguments.length === 0, 'Property.hasListeners should be called without arguments' );
        return this.changedEmitter.hasListeners();
      }
    },

    //statics
    {

      /**
       * Registers an observer with multiple properties, then notifies the observer immediately.
       * @param {Property[]} properties
       * @param {function} observer no params, returns nothing
       * @static
       */
      multilink: function( properties, observer ) {
        return new Multilink( properties, observer, false );
      },

      lazyMultilink: function( properties, observer ) {
        return new Multilink( properties, observer, true );
      },

      /**
       * Removes the multilinked observer from this Property.
       * Same as calling dispose() on the handle (which happens to be a DerivedProperty instance)
       * @param {DerivedProperty} derivedProperty
       */
      unmultilink: function( derivedProperty ) {
        derivedProperty.dispose();
      },

      /**
       * Set up a PropertySet-like property on any object (see https://github.com/phetsims/axon/issues/42).
       *
       * @param {Object} object - The object that the property will be placed on
       * @param {string} propertyName - Name of the property
       * @param {*} initialValue - The initial value of the property
       */
      addProperty: function( object, propertyName, initialValue ) {
        // defines the property
        var property = object[ propertyName + 'Property' ] = new Property( initialValue );

        // defines ES5 getter/setter
        Object.defineProperty( object, propertyName, {
          get: function() { return property.get(); },
          set: function( value ) { property.set( value ); },

          // Make it configurable and enumerable so it's easy to override...
          configurable: true,
          enumerable: true
        } );
      }
    } );
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * A DerivedProperty is computed based on other properties.  This implementation inherits from Property to (a) simplify
 * implementation and (b) ensure it remains consistent. Note that the setters should not be called directly, so the
 * setters (set, reset and es5 setter) throw an error if used directly.
 *
 * @author Sam Reid
 */

define( 'AXON/DerivedProperty',['require','AXON/Property','AXON/axon','PHET_CORE/inherit'],function( require ) {
  'use strict';

  // modules
  var Property = require( 'AXON/Property' );
  var axon = require( 'AXON/axon' );
  var inherit = require( 'PHET_CORE/inherit' );

  function equalsFunction( a, b ) {
    return a === b;
  }

  function notFunction( a ) {
    return !a;
  }

  function conjunctionWithProperty( value, property ) {
    return value && property.value;
  }

  function disjunctionWithProperty( value, property ) {
    return value || property.value;
  }

  function addWithProperty( value, property ) {
    return value + property.value;
  }

  function multiplyWithProperty( value, property ) {
    return value * property.value;
  }

  /**
   * @param {Property[]} dependencies - properties that this property's value is derived from
   * @param {function} derivation - function that derives this property's value, expects args in the same order as dependencies
   * @param {Object} [options] - see Property
   * @constructor
   */
  function DerivedProperty( dependencies, derivation, options ) {

    this.dependencies = dependencies; // @private

    // @private Keep track of each dependency and only update the changed value, for speed
    this.dependencyValues = dependencies.map( function( property ) {return property.get();} );

    var initialValue = derivation.apply( null, this.dependencyValues );
    Property.call( this, initialValue, options );

    var derivedProperty = this;

    // @private Keep track of listeners so they can be detached
    this.dependencyListeners = [];

    for ( var i = 0; i < dependencies.length; i++ ) {
      var dependency = dependencies[ i ];
      (function( dependency, i ) {
        var listener = function( newValue ) {
          derivedProperty.dependencyValues[ i ] = newValue;
          Property.prototype.set.call( derivedProperty, derivation.apply( null, derivedProperty.dependencyValues ) );
        };
        derivedProperty.dependencyListeners.push( listener );
        dependency.lazyLink( listener );
      })( dependency, i );
    }
  }

  axon.register( 'DerivedProperty', DerivedProperty );

  return inherit( Property, DerivedProperty, {

    // @public
    dispose: function() {

      Property.prototype.dispose.call( this );

      // Unlink from dependent properties
      for ( var i = 0; i < this.dependencies.length; i++ ) {
        var dependency = this.dependencies[ i ];
        dependency.unlink( this.dependencyListeners[ i ] );
      }
      this.dependencies = null;
      this.dependencyListeners = null;
      this.dependencyValues = null;
    },

    /**
     * Override the mutators to provide an error message.  These should not be called directly,
     * the value should only be modified when the dependencies change.
     * @param value
     * @override
     * @public
     */
    set: function( value ) { throw new Error( 'Cannot set values directly to a derived property, tried to set: ' + value ); },

    /**
     * Override the mutators to provide an error message.  These should not be called directly, the value should only be modified
     * when the dependencies change. Keep the newValue output in the string so the argument won't be stripped by minifier
     * (which would cause crashes like https://github.com/phetsims/axon/issues/15)
     * @param newValue
     * @override
     * @public
     */
    set value( newValue ) { throw new Error( 'Cannot es5-set values directly to a derived property, tried to set: ' + newValue ); },

    /**
     * Override get value as well to satisfy the linter which wants get/set pairs (even though it just uses the same code as the superclass).
     * @returns {*}
     * @override
     * @public
     */
    get value() {return Property.prototype.get.call( this );},

    /**
     * Override the mutators to provide an error message.  These should not be called directly,
     * the value should only be modified when the dependencies change.
     * @override
     * @public
     */
    reset: function() { throw new Error( 'Cannot reset a derived property directly' ); }
  }, {

    /**
     * Creates a derived boolean property whose value is true iff firstProperty's value is equal to secondPropert's
     * value.
     * @public
     *
     * @param {Property.<*>} firstProperty
     * @param {Property.<*>} secondProperty
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<boolean>}
     */
    valueEquals: function( firstProperty, secondProperty, options ) {
      return new DerivedProperty( [ firstProperty, secondProperty ], equalsFunction, options );
    },

    /**
     * Creates a derived boolean property whose value is true iff every input property value is true.
     * @public
     *
     * @param {Array.<Property.<boolean>>} properties
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<boolean>}
     */
    and: function( properties, options ) {
      return new DerivedProperty( properties, _.reduce.bind( null, properties, conjunctionWithProperty, true ), options ); // TODO: fix
    },

    /**
     * Creates a derived boolean property whose value is true iff any input property value is true.
     * @public
     *
     * @param {Array.<Property.<boolean>>} properties
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<boolean>}
     */
    or: function( properties, options ) {
      return new DerivedProperty( properties, _.reduce.bind( null, properties, disjunctionWithProperty, false ), options );
    },

    /**
     * Creates a derived number property whose value is the sum of all input property values (or 0 if no properties
     * are specified).
     * @public
     *
     * @param {Array.<Property.<number>>}
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<number>}
     */
    sum: function( properties, options ) {
      return new DerivedProperty( properties, _.reduce.bind( null, properties, addWithProperty, 0 ), options );
    },

    /**
     * Creates a derived number property whose value is the sum of both input property values.
     * @public
     *
     * @param {Property.<number>} firstProperty
     * @param {Property.<number>} secondProperty
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<number>}
     */
    plus: function( firstProperty, secondProperty, options ) {
      return DerivedProperty.sum( [ firstProperty, secondProperty ], options );
    },

    /**
     * Creates a derived number property whose value is the product of all input property values (or 1 if no properties
     * are specified).
     * @public
     *
     * @param {Array.<Property.<number>>}
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<number>}
     */
    product: function( properties, options ) {
      return new DerivedProperty( properties, _.reduce.bind( null, properties, multiplyWithProperty, 1 ), options );
    },

    /**
     * Creates a derived number property whose value is the product of both input property values.
     * @public
     *
     * @param {Property.<number>} firstProperty
     * @param {Property.<number>} secondProperty
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<number>}
     */
    times: function( firstProperty, secondProperty, options ) {
      return DerivedProperty.product( [ firstProperty, secondProperty ], options );
    },

    /**
     * Creates a derived boolean property whose value is true iff firstProperty's value is strictly less than the input
     * numeric value.
     * @public
     *
     * @param {Property.<number>} property
     * @param {number} number
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<boolean>}
     */
    lessThanNumber: function( property, number, options ) {
      return new DerivedProperty( [ property ], function( value ) { return value < number; }, options );
    },

    /**
     * Creates a derived boolean property whose value is true iff firstProperty's value is less than or equal to the
     * input numeric value.
     * @public
     *
     * @param {Property.<number>} property
     * @param {number} number
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<boolean>}
     */
    lessThanEqualNumber: function( property, number, options ) {
      return new DerivedProperty( [ property ], function( value ) { return value <= number; }, options );
    },

    /**
     * Creates a derived boolean property whose value is true iff firstProperty's value is strictly greater than the
     * input numeric value.
     * @public
     *
     * @param {Property.<number>} property
     * @param {number} number
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<boolean>}
     */
    greaterThanNumber: function( property, number, options ) {
      return new DerivedProperty( [ property ], function( value ) { return value > number; }, options );
    },

    /**
     * Creates a derived boolean property whose value is true iff firstProperty's value is greater than or equal to the
     * input numeric value.
     * @public
     *
     * @param {Property.<number>} property
     * @param {number} number
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<boolean>}
     */
    greaterThanEqualNumber: function( property, number, options ) {
      return new DerivedProperty( [ property ], function( value ) { return value >= number; }, options );
    },

    /**
     * Creates a derived boolean property whose value is true iff the property's value is falsy.
     * @public
     *
     * @param {Property.<*>} property
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<boolean>}
     */
    derivedNot: function( property, options ) {
      return new DerivedProperty( [ property ], notFunction, options );
    },

    /**
     * Creates a derived property whose value is values[ property.value ].
     * @public
     *
     * @param {Property.<*>} property
     * @param {Object} values
     * @param {Object} [options] - Forwarded to the DerivedProperty
     * @returns {Property.<*>}
     */
    mapValues: function( property, values, options ) {
      return new DerivedProperty( [ property ], function( value ) { return values[ value ]; }, options );
    }
  } );
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * An observable array of items.
 * <p>
 * Because the array is observable, we must be careful about the possibility of concurrent-modification errors.
 * Any time we iterate over the array, we must iterate over a copy, because callback may be modifying the array.
 *
 * @author Sam Reid
 * @author Chris Malley
 */
define( 'AXON/ObservableArray',['require','AXON/Property','AXON/axon','PHET_CORE/inherit','AXON/Emitter'],function( require ) {
  'use strict';

  // modules
  var Property = require( 'AXON/Property' );
  var axon = require( 'AXON/axon' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Emitter = require( 'AXON/Emitter' );

  /**
   * @param {[]} array
   * @param {Object} [options]
   * @constructor
   */
  function ObservableArray( array, options ) {

    // Special case that the user supplied options but no array
    if ( array instanceof Object && !(array instanceof Array) ) {
      options = array;
      array = null;
    }

    this._options = _.extend( {
      allowDuplicates: false, // are duplicate items allowed in the array?
      tandem: null            // Tandem is supported here.  This line doesn't do anything different than leaving tandem as undefined
                              // but this entry serves as an indicator that tandem is supported here.
    }, options );

    this._array = array || []; // @private internal, do not access directly
    this._addedListeners = []; // @private listeners called when an item is added
    this._removedListeners = []; // @private listeners called when an item is removed

    this.lengthProperty = new Property( this._array.length ); // @public (read-only) observe this, but don't set it

    // @private Store the initial array, if any, for resetting, see #4
    this.initialArray = array ? array.slice() : [];

    // @private Event stream for signifying begin/end of callbacks
    this.startedCallbacksForItemAddedEmitter = new Emitter();
    this.endedCallbacksForItemAddedEmitter = new Emitter();
    this.startedCallbacksForItemRemovedEmitter = new Emitter();
    this.endedCallbacksForItemRemovedEmitter = new Emitter();

    options && options.tandem && options.tandem.addInstance( this );
    this.disposeObservableArray = function() {
      options && options.tandem && options.tandem.removeInstance( this );
    };
  }

  axon.register( 'ObservableArray', ObservableArray );

  return inherit( Object, ObservableArray, {

    // @public
    dispose: function() {
      this.disposeObservableArray();
    },

    /**
     * Restore the array back to its initial state
     * Note: if an item is in the current array and original array, it is removed and added back
     * This may or may not change in the future, see #4
     * @public
     */
    reset: function() {
      for ( var i = 0; i < this._array.length; i++ ) {
        this._fireItemRemoved( this._array[ i ] );
      }
      this._array = this.initialArray.slice();
      for ( i = 0; i < this._array.length; i++ ) {
        this._fireItemAdded( this._array[ i ] );
      }
    },

    // @public
    get length() { return this._array.length; },

    /**
     * Adds a listener that will be notified when an item is added to the list.
     * @param listener function( item, observableArray )
     * @public
     */
    addItemAddedListener: function( listener ) {
      assert && assert( this._addedListeners.indexOf( listener ) === -1 ); // listener is not already registered
      this._addedListeners.push( listener );
    },

    /**
     * Removes a listener that was added via addItemAddedListener.
     * @param listener
     * @public
     */
    removeItemAddedListener: function( listener ) {
      var index = this._addedListeners.indexOf( listener );
      assert && assert( index !== -1 ); // listener is registered
      this._addedListeners.splice( index, 1 );
    },

    /**
     * Adds a listener that will be notified when an item is removed from the list.
     * @param listener function( item, observableArray )
     * @public
     */
    addItemRemovedListener: function( listener ) {
      assert && assert( this._removedListeners.indexOf( listener ) === -1 ); // listener is not already registered
      this._removedListeners.push( listener );
    },

    /**
     * Removes a listener that was added via addItemRemovedListener.
     * @param listener
     * @public
     */
    removeItemRemovedListener: function( listener ) {
      var index = this._removedListeners.indexOf( listener );
      assert && assert( index !== -1 ); // listener is registered
      this._removedListeners.splice( index, 1 );
    },

    /**
     * Convenience function for adding both types of listeners in one shot.
     * @param itemAddedListener
     * @param itemRemovedListener
     * @public
     */
    addListeners: function( itemAddedListener, itemRemovedListener ) {
      this.addItemAddedListener( itemAddedListener );
      this.addItemRemovedListener( itemRemovedListener );
    },

    // @private Internal: called when an item is added.
    _fireItemAdded: function( item ) {
      this.startedCallbacksForItemAddedEmitter.emit1( item );

      //Signify that an item was added to the list
      var copy = this._addedListeners.slice( 0 ); // operate on a copy, firing could result in the listeners changing
      for ( var i = 0; i < copy.length; i++ ) {
        copy[ i ]( item, this );
      }

      this.endedCallbacksForItemAddedEmitter.emit();
    },

    // Internal: called when an item is removed.
    _fireItemRemoved: function( item ) {

      this.startedCallbacksForItemRemovedEmitter.emit1( item );

      //Signify that an item was removed from the list
      var copy = this._removedListeners.slice( 0 ); // operate on a copy, firing could result in the listeners changing
      for ( var i = 0; i < copy.length; i++ ) {
        copy[ i ]( item, this );
      }

      this.endedCallbacksForItemRemovedEmitter.emit();
    },

    /**
     * Adds an item to the end of the array.
     * This is a convenience function, and is the same as push.
     * @param item
     * @public
     */
    add: function( item ) {
      this.push( item );
    },

    /**
     * Add items to the end of the array.
     * This is a convenience function, and is the same as push.
     * @param {Array} items
     * @public
     */
    addAll: function( items ) {
      for ( var i = 0; i < items.length; i++ ) {
        this.add( items[ i ] );
      }
    },

    /**
     * Removes the first occurrence of an item from the array.
     * If duplicates are allowed (see options.allowDuplicates) you may need to call this multiple
     * times to totally purge item from the array.
     * @param item
     * @public
     */
    remove: function( item ) {
      var index = this._array.indexOf( item );
      if ( index !== -1 ) {
        this._array.splice( index, 1 );
        this.lengthProperty.set( this._array.length );
        this._fireItemRemoved( item );
      }
    },

    /**
     * Removes the first occurrence of each item in the specified array.
     * @param {Array} list a list of items to remove
     * @see ObservableArray.remove
     * @public
     */
    removeAll: function( list ) {
      for ( var i = 0; i < list.length; i++ ) {
        var item = list[ i ];
        this.remove( item );
      }
    },

    /**
     * Pushes an item onto the end of the array.
     * @param item
     * @throws Error if duplicates are not allowed (see options.allowDuplicates) and item is already in the array
     * @public
     */
    push: function( item ) {
      if ( !this._options.allowDuplicates && this.contains( item ) ) {
        throw new Error( 'duplicates are not allowed' );
      }
      this._array.push( item );
      this.lengthProperty.set( this._array.length );
      this._fireItemAdded( item );
    },

    /**
     * Removes an item from the end of the array and returns it.
     * @returns {*}
     * @public
     */
    pop: function() {
      var item = this._array.pop();
      if ( item !== undefined ) {
        this.lengthProperty.set( this._array.length );
        this._fireItemRemoved( item );
      }
      return item;
    },

    /**
     * Removes an item from the beginning of the array and returns it.
     * @returns {*}
     * @public
     */
    shift: function() {
      var item = this._array.shift();
      if ( item !== undefined ) {
        this.lengthProperty.set( this._array.length );
        this._fireItemRemoved( item );
      }
      return item;
    },

    /**
     * Does the array contain the specified item?
     * @param item
     * @returns {boolean}
     * @public
     */
    contains: function( item ) {
      return this.indexOf( item ) !== -1;
    },

    /**
     * Gets an item at the specified index.
     * @param index
     * @returns {*} the item, or undefined if there is no item at the specified index
     * @public
     */
    get: function( index ) {
      return this._array[ index ];
    },

    /**
     * Gets the index of a specified item.
     * @param item
     * @returns {*} -1 if item is not in the array
     * @public
     */
    indexOf: function( item ) {
      return this._array.indexOf( item );
    },

    /**
     * Removes all items from the array.
     * @public
     */
    clear: function() {
      var copy = this._array.slice( 0 );
      for ( var i = 0; i < copy.length; i++ ) {
        this.remove( copy[ i ] );
      }
    },

    /**
     * Applies a callback function to each item in the array
     * @param callback function(item)
     * @public
     */
    forEach: function( callback ) {
      this._array.slice().forEach( callback ); // do this on a copy of the array, in case callbacks involve array modification
    },

    /**
     * Maps the values in this ObservableArray using the specified function, and returns a new ObservableArray for chaining.
     * @param mapFunction
     * @returns {axon.ObservableArray}
     * @public
     */
    map: function( mapFunction ) {
      return new axon.ObservableArray( this._array.map( mapFunction ) );
    },

    /**
     * Filters the values in this ObservableArray using the predicate function, and returns a new ObservableArray for chaining.
     * @param predicate
     * @returns {axon.ObservableArray}
     * @public
     */
    filter: function( predicate ) {
      return new axon.ObservableArray( this._array.filter( predicate ) );
    },

    /**
     * Starting with the initial value, combine values from this ObservableArray to come up with a composite result.
     * Same as foldLeft.  In underscore this is called _.reduce aka _.foldl or _.inject
     * @param value
     * @param combiner
     * @returns {*}
     * @public
     */
    reduce: function( value, combiner ) {
      for ( var i = 0; i < this._array.length; i++ ) {
        value = combiner( value, this._array[ i ] );
      }
      return value;
    },

    /**
     * Return the underlying array
     * @returns {*|Array}
     * @public
     */
    getArray: function() {
      return this._array;
    }
  } );
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * PropertySet facilitates creation and use of multiple named Property instances.  There are still several API design issues in question, but this
 * class is ready for use.
 *
 * A PropertySet is a set of Property instances that provides support for:
 * -Easily creating several properties using an object literal (hash)
 * -Resetting them as a group
 * -Set multiple values at once, using propertySet.set({x:100,y:200,name:'alice'});
 * -Support for derived properties, which appear with the same interface as basic properties
 * -Convenient toString that prints e.g., PropertySet{name:'larry',age:101,kids:['alice','bob']}
 * -Wiring up to listen to multiple properties simultaneously
 * -Add properties after the PropertySet is created?  Don't forget to add to the key list as well.
 * -Remove properties that were added using addProperty or the constructor
 *
 * Sample usage:
 * var p = new PropertySet( {name: 'larry', age: 100, kids: ['alice', 'bob']} );
 * p.nameProperty.link( function( n ) {console.log( 'hello ' + n );} );
 * p.name = 'jensen';
 * p.age = 101;//Happy Birthday!
 * console.log( p );
 * p.reset();
 * console.log( p );
 * p.set({name:'clark',age:102,kids:['alice','bob','charlie']});
 *
 * How would this be done without PropertySet (for comparison)?
 * //Normally would be created in a class but that is omitted here for brevity.
 * var p ={name: new Property('larry'), age: new Property('age'), kids: new Property(['alice','bob'])}
 * p.reset = function(){
 *   this.name.reset();
 *   this.age.reset();
 *   this.kids.reset();
 * }
 * p.name.set('clark');
 * p.age.set('102');
 * p.kids.set(['alice','bob','charlie']);
 *
 * Note: If a subclass ever substitutes a property like this: person.ageProperty = new Property(person.age), then it would break the getter/setter
 * @author Sam Reid
 */

define( 'AXON/PropertySet',['require','AXON/Property','AXON/DerivedProperty','AXON/Multilink','AXON/Events','AXON/axon','PHET_CORE/inherit'],function( require ) {
  'use strict';

  // modules
  var Property = require( 'AXON/Property' );
  var DerivedProperty = require( 'AXON/DerivedProperty' );
  var Multilink = require( 'AXON/Multilink' );
  var Events = require( 'AXON/Events' );
  var axon = require( 'AXON/axon' );
  var inherit = require( 'PHET_CORE/inherit' );

  // constants
  var SUFFIX = 'Property';

  /**
   * PropertySet main constructor
   * @param {Object} values - a hash: keys are the names of properties, values are initial property values. Eg { name: 'Curly', age: 40 }
   * @param {Object} [options]
   * @constructor
   */
  function PropertySet( values, options ) {

    options = _.extend( {
      tandemSet: {} // a hash, keys are a subset of the keys in values, and the value associated with each key is a {Tandem} tandem
    }, options );

    // Verify that the tandemSet doesn't contain bogus keys. filter should return 0 tandemSet keys that are not in values.
    assert && assert( _.filter( _.keys( options.tandemSet ), function( key ) {
        var isBad = !values.hasOwnProperty( key );
        if ( isBad ) { console.error( 'bad tandem key: ' + key ); }
        return isBad;
      } ).length === 0, 'Some tandem keys do not appear in the PropertySet' );

    var propertySet = this;

    Events.call( this );

    // @private Keep track of the keys so we know which to reset
    this.keys = [];

    Object.getOwnPropertyNames( values ).forEach( function( value ) {
      propertySet.addProperty( value, values[ value ], options.tandemSet[ value ] );
    } );
  }

  axon.register( 'PropertySet', PropertySet );

  return inherit( Events, PropertySet, {

    /**
     * Adds a new property to this PropertySet
     * @param {string} propertyName
     * @param {*} value the property's initial value
     * @param {Tandem} [tandem]
     * @public
     */
    addProperty: function( propertyName, value, tandem ) {
      this[ propertyName + SUFFIX ] = new Property( value, { tandem: tandem } );
      this.addGetterAndSetter( propertyName );
      this.keys.push( propertyName );
    },

    /**
     * Remove any property (whether a derived property or not) that was added to this PropertySet
     * @param {String} propertyName
     * @public
     */
    removeProperty: function( propertyName ) {

      //Remove from the keys (only for non-derived properties)
      var index = this.keys.indexOf( propertyName );
      if ( index !== -1 ) {
        this.keys.splice( index, 1 );
      }

      this[ propertyName + SUFFIX ].dispose();

      //Unregister the Property instance from the PropertySet
      delete this[ propertyName + SUFFIX ];

      //Unregister the getter/setter, if they exist
      delete this[ propertyName ];
    },

    /**
     * Adds a getter and setter using ES5 get/set syntax, similar to https://gist.github.com/dandean/1292057, same as in github/Atlas
     * @param {string} propertyName
     * @public
     */
    addGetterAndSetter: function( propertyName ) {
      var property = this[ propertyName + SUFFIX ];

      Object.defineProperty( this, propertyName, {

        // Getter proxies to Model#get()...
        get: function() { return property.get();},

        // Setter proxies to Model#set(attributes)
        set: function( value ) { property.set( value );},

        // Make it configurable and enumerable so it's easy to override...
        configurable: true,
        enumerable: true
      } );
    },

    /**
     * Adds an ES5 getter to a property.
     * @param {string} propertyName
     * @public
     */
    addGetter: function( propertyName ) {
      var property = this[ propertyName + SUFFIX ];

      Object.defineProperty( this, propertyName, {

        get: function() { return property.get();},

        // Make it configurable and enumerable so it's easy to override...
        configurable: true,
        enumerable: true
      } );
    },

    // @public Resets all of the properties associated with this PropertySet
    reset: function() {
      var propertySet = this;
      this.keys.forEach( function( key ) {
        propertySet[ key + SUFFIX ].reset();
      } );
    },

    /**
     * Creates a DerivedProperty from the given property property names and derivation.
     * @param {string[]} propertyNames
     * @param {function} derivation
     * @param {Tandem} [tandem]
     * @returns {DerivedProperty}
     * @public
     */
    toDerivedProperty: function( propertyNames, derivation, tandem ) {
      return new DerivedProperty( this.getProperties( propertyNames ), derivation, { tandem: tandem } );
    },

    /**
     * Adds a derived property to the property set.
     * @param {string} propertyName name for the derived property
     * @param {string[]} dependencyNames names of the properties that it depends on
     * @param {function} derivation function that expects args in the same order as dependencies
     * @param {Tandem} [tandem]
     * @public
     */
    addDerivedProperty: function( propertyName, dependencyNames, derivation, tandem ) {
      this[ propertyName + SUFFIX ] = this.toDerivedProperty( dependencyNames, derivation, tandem );
      this.addGetter( propertyName );
    },

    /**
     * Returns an array of the requested properties.
     * @param propertyNames
     * @returns {*}
     * @private
     */
    getProperties: function( propertyNames ) {
      var propertySet = this;
      return propertyNames.map( function( propertyName ) {
        var propertyKey = propertyName + SUFFIX;
        assert && assert( propertySet.hasOwnProperty( propertyKey ) );
        return propertySet[ propertyKey ];
      } );
    },

    /**
     * Set all of the values specified in the object hash
     * Allows you to use this form:
     * puller.set( {x: knot.x, y: knot.y, knot: knot} );
     *
     * instead of this:
     * puller.x.value = knot.x;
     * puller.y.value = knot.y;
     * puller.knot.value = knot;
     *
     * Throws an error if you try to set a value for which there is no property.
     *
     * @param {Object} values - see example above
     * @public
     */
    setValues: function( values ) {
      var propertySet = this;
      Object.getOwnPropertyNames( values ).forEach( function( propertyName ) {
        if ( typeof(propertySet[ propertyName + SUFFIX ] === 'Property') ) {
          propertySet[ propertyName + SUFFIX ].set( values[ propertyName ] );
        }
        else {
          throw new Error( 'property not found: ' + propertyName );
        }
      } );
    },

    /**
     * Get a JS object literal with all the current values of the properties in this property set, say for serialization.
     * @see set
     * @public
     * TODO: this works well to serialize numbers, strings, booleans.  How to handle complex state values such as Vector2 or nested Property?  Maybe that must be up to the client code.
     * TODO: This was named 'get' to mirror the 'set' method above, but I'm concerned this will make them difficult to find/replace and may confuse with real getters & setters.  Maybe setState/getState would be better?
     */
    getValues: function() {
      var state = {};
      for ( var i = 0; i < this.keys.length; i++ ) {
        var key = this.keys[ i ];
        state[ key ] = this.property( key ).value;
      }
      return state;
    },

    /**
     * Link to a property by name, see https://github.com/phetsims/axon/issues/16
     * @param {string} propertyName the name of the property to link to
     * @param {function }observer the callback to link to the property
     * @public
     */
    link: function( propertyName, observer ) {
      this[ propertyName + SUFFIX ].link( observer );
    },

    /**
     * Unlink for a property by name, see https://github.com/phetsims/axon/issues/16
     * @param {string} propertyName the name of the property to link to
     * @param {function} observer the callback to link to the property
     * @public
     */
    unlink: function( propertyName, observer ) {
      this[ propertyName + SUFFIX ].unlink( observer );
    },

    /**
     * Link an attribute to a property by name.  Return a handle to the observer so it can be removed using unlink().
     * @param {string} propertyName the property to link to
     * @param {Object} object the object for which the attribute will be set
     * @param {string} attributeName the name of the attribute to set on the object
     * @public
     */
    linkAttribute: function( propertyName, object, attributeName ) {
      return this.property( propertyName ).linkAttribute( object, attributeName );
    },

    /**
     * Unlink an observer added with linkAttribute.  Note: the args of linkAttribute do not match the args of
     * unlinkAttribute: here, you must pass the observer handle returned by linkAttribute rather than object and attributeName
     * @param {string} propertyName - the name of the property that the observer will be removed from
     * @param {function} observer
     * @public
     */
    unlinkAttribute: function( propertyName, observer ) {
      this.property( propertyName ).unlink( observer );
    },

    /**
     * Registers an observer with multiple properties, then notifies the observer immediately.
     * @param {string[]} propertyNames
     * @param {function} observer no params, returns nothing
     * @public
     */
    multilink: function( propertyNames, observer ) {
      return new Multilink( this.getProperties( propertyNames ), observer, false );
    },

    // @public
    lazyMultilink: function( propertyNames, observer ) {
      return new Multilink( this.getProperties( propertyNames ), observer, true );
    },

    /**
     * Removes the multilink from this PropertySet.
     * Same as calling dispose() on the multilink
     * @param {Multilink} multilink
     * @public
     */
    unmultilink: function( multilink ) {
      multilink.dispose();
    },

    // @public
    toString: function() {
      var text = 'PropertySet{';
      var propertySet = this;
      for ( var i = 0; i < this.keys.length; i++ ) {
        var key = this.keys[ i ];
        text = text + key + ':' + propertySet[ key ].toString();
        if ( i < this.keys.length - 1 ) {
          text = text + ',';
        }
      }
      return text + '}';
    },

    /**
     * Unlinks all observers from all Property instances.
     * @public
     */
    unlinkAll: function() {
      var propertySet = this;
      this.keys.forEach( function( key ) {
        propertySet[ key + SUFFIX ].unlinkAll();
      } );
    },

    /**
     * Get a property by name, see https://github.com/phetsims/axon/issues/16
     * @param {string} propertyName the name of the property to get
     * @deprecated see https://github.com/phetsims/axon/issues/43
     * @public
     */
    property: function( propertyName ) {
      return this[ propertyName + SUFFIX ];
    },

    /**
     * When the PropertySet is no longer used by the sim, it can be eliminated.  All Properties are disposed.
     * @public
     */
    dispose: function() {
      for ( var i = 0; i < this.keys.length; i++ ) {
        this[ this.keys[ i ] + SUFFIX ].dispose();
      }
    }
  } );
} );

// Copyright 2013-2015, University of Colorado Boulder

define( 'AXON/main',[
  'AXON/axon',
  'AXON/Property',
  'AXON/DerivedProperty',
  'AXON/Emitter',
  'AXON/Events',
  'AXON/ObservableArray',
  'AXON/PropertySet',
  'AXON/Multilink'
], function( axon ) {
  'use strict';
  return axon;
} );
// Copyright 2015, University of Colorado Boulder

/**
 * Given a rectangular containing area, takes care of allocating and deallocating smaller rectangular "bins" that fit
 * together inside the area and do not overlap. Optimized more for runtime CPU usage than space currently.
 *
 * For example:
 * #begin canvasExample binPacker 256x256
 * #on
 * var binPacker = new dot.BinPacker( new dot.Bounds2( 0, 0, 256, 256 ) );
 * var bins = [];
 * for ( var i = 0; i < 100; i++ ) {
 *   var bin = binPacker.allocate( Math.random() * 64, Math.random() * 64 );
 *   if ( bin ) {
 *     bins.push( bin );
 *   }
 * }
 * #off
 *
 * context.strokeStyle = '#000';
 * bins.forEach( function( bin ) {
 *   var bounds = bin.bounds;
 *   context.strokeRect( bounds.x, bounds.y, bounds.width, bounds.height );
 * } );
 * #end canvasExample
 *
 * @author Sharfudeen Ashraf
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
define( 'DOT/BinPacker',['require','DOT/dot','PHET_CORE/inherit','DOT/Bounds2'],function( require ) {
  'use strict';

  // modules
  var dot = require( 'DOT/dot' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );

  /**
   * Creates a BinPacker with the specified containing bounds.
   * @public
   * @constructor
   *
   * @param {Bounds2} bounds - The available bounds to pack bins inside.
   */
  function BinPacker( bounds ) {
    this.rootBin = new dot.BinPacker.Bin( bounds, null );
  }

  dot.register( 'BinPacker', BinPacker );

  inherit( Object, BinPacker, {
    /**
     * Allocates a bin with the specified width and height if possible (returning a {Bin}), otherwise returns null.
     * @public
     *
     * @param {number} width
     * @param {number} height
     * @returns {Bin|null}
     */
    allocate: function( width, height ) {
      // find a leaf bin that has available room (or null)
      var bin = this.rootBin.findAvailableBin( width, height );

      if ( bin ) {
        // split it into a sized sub-bin for our purpose that we will use, and other bins for future allocations
        var sizedBin = bin.split( width, height );

        // mark our bin as used
        sizedBin.use();

        return sizedBin;
      }
      else {
        return null;
      }
    },

    /**
     * Deallocates a bin, so that its area can be reused by future allocations.
     * @public
     *
     * @param {Bin} bin - The bin that was returned from allocate().
     */
    deallocate: function( bin ) {
      bin.unuse();
    },

    // @private, for debugging purposes
    toString: function() {
      var result = '';

      var padding = '';

      function binTree( bin ) {
        result += padding + bin.toString() + '\n';
        padding = padding + '  ';
        _.each( bin.children, binTree );
        padding = padding.substring( 2 );
      }

      binTree( this.rootBin );

      return result;
    }
  } );

  /**
   * A rectangular bin that can be used itself or split into sub-bins.
   * @public
   * @constructor
   *
   * @param {Bounds2} bounds
   * @param {Bin|null} parent
   */
  BinPacker.Bin = function Bin( bounds, parent ) {
    // @public {Bounds2} - Our containing bounds
    this.bounds = bounds;

    // @private {Bin|null} - Parent bin, if applicable
    this.parent = parent;

    // @private {boolean} - Whether our children are responsible for our area
    this.isSplit = false;

    // @private {boolean} - Whether we are marked as a bin that is used
    this.isUsed = false;

    // @private {Array.<Bin>}
    this.children = [];
  };
  inherit( Object, BinPacker.Bin, {

    /**
     * Finds an unused bin with open area that is at least width-x-height in size.
     * @private
     *
     * @param {number} width
     * @param {number} height
     * @returns {Bin|null}
     */
    findAvailableBin: function( width, height ) {
      assert && assert( width > 0 && height > 0, 'Empty bin requested?' );

      // If we are marked as used ourself, we can't be used
      if ( this.isUsed ) {
        return null;
      }
      // If our bounds can't fit it, skip this entire sub-tree
      else if ( this.bounds.width < width || this.bounds.height < height ) {
        return null;
      }
      // If we have been split, check our children
      else if ( this.isSplit ) {
        for ( var i = 0; i < this.children.length; i++ ) {
          var result = this.children[ i ].findAvailableBin( width, height );
          if ( result ) {
            return result;
          }
        }
        // No child can fit the area
        return null;
      }
      // Otherwise we are free and our dimensions are compatible (checked above)
      else {
        return this;
      }
    },

    /**
     * Splits this bin into multiple child bins, and returns the child with the dimensions (width,height).
     * @private
     *
     * @param {number} width
     * @param {number} height
     */
    split: function( width, height ) {
      assert && assert( this.bounds.width >= width && this.bounds.height >= height,
        'Bin does not have space' );
      assert && assert( !this.isSplit, 'Bin should not be re-split' );
      assert && assert( !this.isUsed, 'Bin should not be split when used' );
      assert && assert( width > 0 && height > 0, 'Empty bin requested?' );

      // if our dimensions match exactly, don't split (return ourself)
      if ( width === this.bounds.width && height === this.bounds.height ) {
        return this;
      }

      // mark as split
      this.isSplit = true;

      // locations of the split
      var splitX = this.bounds.minX + width;
      var splitY = this.bounds.minY + height;

      /*
       * How an area is split (for now). In the future, splitting more after determining what we need to fit next would
       * potentially be better, but this preserves the width better (which many times we need).
       *
       *   ************************************
       *   *                  *               *
       *   *                  *               *
       *   *       main       *     right     *
       *   * (width x height) *               *
       *   *                  *               *
       *   ************************************
       *   *                                  *
       *   *              bottom              *
       *   *                                  *
       *   ************************************
       */
      var mainBounds = new Bounds2( this.bounds.minX, this.bounds.minY, splitX, splitY );
      var rightBounds = new Bounds2( splitX, this.bounds.minY, this.bounds.maxX, splitY );
      var bottomBounds = new Bounds2( this.bounds.minX, splitY, this.bounds.maxX, this.bounds.maxY );

      var mainBin = new dot.BinPacker.Bin( mainBounds, this );
      this.children.push( mainBin );

      // only add right/bottom if they take up area
      if ( rightBounds.hasNonzeroArea() ) {
        this.children.push( new dot.BinPacker.Bin( rightBounds, this ) );
      }
      if ( bottomBounds.hasNonzeroArea() ) {
        this.children.push( new dot.BinPacker.Bin( bottomBounds, this ) );
      }

      return mainBin;
    },

    /**
     * Mark this bin as used.
     * @private
     */
    use: function() {
      assert && assert( !this.isSplit, 'Should not mark a split bin as used' );
      assert && assert( !this.isUsed, 'Should not mark a used bin as used' );

      this.isUsed = true;
    },

    /**
     * Mark this bin as not used, and attempt to collapse split parents if all children are unused.
     * @private
     */
    unuse: function() {
      assert && assert( this.isUsed, 'Can only unuse a used instance' );

      this.isUsed = false;

      this.parent && this.parent.attemptToCollapse();
    },

    /**
     * If our bin can be collapsed (it is split and has children that are not used AND not split), then we will become
     * not split, and will remove our children. If successful, it will also call this on our parent, fully attempting
     * to clean up unused data structures.
     * @private
     */
    attemptToCollapse: function() {
      assert && assert( this.isSplit, 'Should only attempt to collapse split bins' );

      // Bail out if a single child isn't able to be collapsed. If it is not split or used, it won't have any children
      // or needs.
      for ( var i = 0; i < this.children.length; i++ ) {
        var child = this.children[ i ];

        if ( child.isSplit || child.isUsed ) {
          return;
        }
      }

      // We can now collapse ourselves neatly
      this.children = [];
      this.isSplit = false;

      // And attempt to collapse our parent
      this.parent && this.parent.attemptToCollapse();
    },

    // @private for debugging purposes
    toString: function() {
      return this.bounds.toString() + ( this.isUsed ? ' used' : '' );
    }
  } );

  return BinPacker;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * A 3D cuboid-shaped bounded area (bounding box).
 *
 * There are a number of convenience functions to get locations and points on the Bounds. Currently we do not
 * store these with the Bounds3 instance, since we want to lower the memory footprint.
 *
 * minX, minY, minZ, maxX, maxY, and maxZ are actually stored. We don't do x,y,z,width,height,depth because this can't properly express
 * semi-infinite bounds (like a half-plane), or easily handle what Bounds3.NOTHING and Bounds3.EVERYTHING do with
 * the constructive solid areas.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Bounds3',['require','DOT/dot','PHET_CORE/inherit','PHET_CORE/Poolable','DOT/Vector3'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  require( 'DOT/Vector3' );

  /**
   * Creates a 3-dimensional bounds (bounding box).
   * @constructor
   * @public
   *
   * @param {number} minX - The intial minimum X coordinate of the bounds.
   * @param {number} minY - The intial minimum Y coordinate of the bounds.
   * @param {number} minZ - The intial minimum Z coordinate of the bounds.
   * @param {number} maxX - The intial maximum X coordinate of the bounds.
   * @param {number} maxY - The intial maximum Y coordinate of the bounds.
   * @param {number} maxZ - The intial maximum Z coordinate of the bounds.
   */
  function Bounds3( minX, minY, minZ, maxX, maxY, maxZ ) {
    assert && assert( maxY !== undefined, 'Bounds3 requires 4 parameters' );

    // @public {number} - The minimum X coordinate of the bounds.
    this.minX = minX;

    // @public {number} - The minimum Y coordinate of the bounds.
    this.minY = minY;

    // @public {number} - The minimum Z coordinate of the bounds.
    this.minZ = minZ;

    // @public {number} - The maximum X coordinate of the bounds.
    this.maxX = maxX;

    // @public {number} - The maximum Y coordinate of the bounds.
    this.maxY = maxY;

    // @public {number} - The maximum Z coordinate of the bounds.
    this.maxZ = maxZ;

    phetAllocation && phetAllocation( 'Bounds3' );
  }

  dot.register( 'Bounds3', Bounds3 );

  inherit( Object, Bounds3, {
    // @public (read-only) - Helps to identify the dimension of the bounds
    isBounds: true,
    dimension: 3,

    /*---------------------------------------------------------------------------*
     * Properties
     *---------------------------------------------------------------------------*/

    /**
     * The width of the bounds, defined as maxX - minX.
     * @public
     *
     * @returns {number}
     */
    getWidth: function() { return this.maxX - this.minX; },
    get width() { return this.getWidth(); },

    /**
     * The height of the bounds, defined as maxY - minY.
     * @public
     *
     * @returns {number}
     */
    getHeight: function() { return this.maxY - this.minY; },
    get height() { return this.getHeight(); },

    /**
     * The depth of the bounds, defined as maxZ - minZ.
     * @public
     *
     * @returns {number}
     */
    getDepth: function() { return this.maxZ - this.minZ; },
    get depth() { return this.getDepth(); },

    /*
     * Convenience locations
     * upper is in terms of the visual layout in Scenery and other programs, so the minY is the "upper", and minY is the "lower"
     *
     *             minX (x)     centerX        maxX
     *          ---------------------------------------
     * minY (y) | upperLeft   upperCenter   upperRight
     * centerY  | centerLeft    center      centerRight
     * maxY     | lowerLeft   lowerCenter   lowerRight
     */

    /**
     * Alias for minX, when thinking of the bounds as an (x,y,z,width,height,depth) cuboid.
     * @public
     *
     * @returns {number}
     */
    getX: function() { return this.minX; },
    get x() { return this.getX(); },

    /**
     * Alias for minY, when thinking of the bounds as an (x,y,z,width,height,depth) cuboid.
     * @public
     *
     * @returns {number}
     */
    getY: function() { return this.minY; },
    get y() { return this.getY(); },

    /**
     * Alias for minZ, when thinking of the bounds as an (x,y,z,width,height,depth) cuboid.
     * @public
     *
     * @returns {number}
     */
    getZ: function() { return this.minZ; },
    get z() { return this.getZ(); },

    /**
     * Alias for minX, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMinX: function() { return this.minX; },

    /**
     * Alias for minY, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMinY: function() { return this.minY; },

    /**
     * Alias for minZ, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMinZ: function() { return this.minZ; },

    /**
     * Alias for maxX, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMaxX: function() { return this.maxX; },

    /**
     * Alias for maxY, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMaxY: function() { return this.maxY; },

    /**
     * Alias for maxZ, supporting the explicit getter function style.
     * @public
     *
     * @returns {number}
     */
    getMaxZ: function() { return this.maxZ; },

    /**
     * Alias for minX, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getLeft: function() { return this.minX; },
    get left() { return this.minX; },

    /**
     * Alias for minY, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getTop: function() { return this.minY; },
    get top() { return this.minY; },

    /**
     * Alias for minZ, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getBack: function() { return this.minZ; },
    get back() { return this.minZ; },

    /**
     * Alias for maxX, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getRight: function() { return this.maxX; },
    get right() { return this.maxX; },

    /**
     * Alias for maxY, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getBottom: function() { return this.maxY; },
    get bottom() { return this.maxY; },

    /**
     * Alias for maxZ, when thinking in the UI-layout manner.
     * @public
     *
     * @returns {number}
     */
    getFront: function() { return this.maxZ; },
    get front() { return this.maxZ; },

    /**
     * The horizontal (X-coordinate) center of the bounds, averaging the minX and maxX.
     * @public
     *
     * @returns {number}
     */
    getCenterX: function() { return ( this.maxX + this.minX ) / 2; },
    get centerX() { return this.getCenterX(); },

    /**
     * The vertical (Y-coordinate) center of the bounds, averaging the minY and maxY.
     * @public
     *
     * @returns {number}
     */
    getCenterY: function() { return ( this.maxY + this.minY ) / 2; },
    get centerY() { return this.getCenterY(); },

    /**
     * The depthwise (Z-coordinate) center of the bounds, averaging the minZ and maxZ.
     * @public
     *
     * @returns {number}
     */
    getCenterZ: function() { return ( this.maxZ + this.minZ ) / 2; },
    get centerZ() { return this.getCenterZ(); },

    /**
     * The point (centerX, centerY, centerZ), in the center of the bounds.
     * @public
     *
     * @returns {Vector3}
     */
    getCenter: function() { return new dot.Vector3( this.getCenterX(), this.getCenterY(), this.getCenterZ() ); },
    get center() { return this.getCenter(); },

    /**
     * Whether we have negative width, height or depth. Bounds3.NOTHING is a prime example of an empty Bounds3.
     * Bounds with width = height = depth = 0 are considered not empty, since they include the single (0,0,0) point.
     * @public
     *
     * @returns {boolean}
     */
    isEmpty: function() { return this.getWidth() < 0 || this.getHeight() < 0 || this.getDepth() < 0; },

    /**
     * Whether our minimums and maximums are all finite numbers. This will exclude Bounds3.NOTHING and Bounds3.EVERYTHING.
     * @public
     *
     * @returns {boolean}
     */
    isFinite: function() {
      return isFinite( this.minX ) && isFinite( this.minY ) && isFinite( this.minZ ) && isFinite( this.maxX ) && isFinite( this.maxY ) && isFinite( this.maxZ );
    },

    /**
     * Whether this bounds has a non-zero area (non-zero positive width, height and depth).
     * @public
     *
     * @returns {boolean}
     */
    hasNonzeroArea: function() {
      return this.getWidth() > 0 && this.getHeight() > 0 && this.getDepth() > 0;
    },

    /**
     * Whether this bounds has a finite and non-negative width, height and depth.
     * @public
     *
     * @returns {boolean}
     */
    isValid: function() {
      return !this.isEmpty() && this.isFinite();
    },

    /**
     * Whether the coordinates are contained inside the bounding box, or are on the boundary.
     * @public
     *
     * @param {number} x - X coordinate of the point to check
     * @param {number} y - Y coordinate of the point to check
     * @param {number} z - Z coordinate of the point to check
     * @returns {boolean}
     */
    containsCoordinates: function( x, y, z ) {
      return this.minX <= x && x <= this.maxX && this.minY <= y && y <= this.maxY && this.minZ <= z && z <= this.maxZ;
    },

    /**
     * Whether the point is contained inside the bounding box, or is on the boundary.
     * @public
     *
     * @param {Vector3} point
     * @returns {boolean}
     */
    containsPoint: function( point ) {
      return this.containsCoordinates( point.x, point.y, point.z );
    },

    /**
     * Whether this bounding box completely contains the bounding box passed as a parameter. The boundary of a box is
     * considered to be "contained".
     * @public
     *
     * @param {Bounds3} bounds
     * @returns {boolean}
     */
    containsBounds: function( bounds ) {
      return this.minX <= bounds.minX && this.maxX >= bounds.maxX && this.minY <= bounds.minY && this.maxY >= bounds.maxY && this.minZ <= bounds.minZ && this.maxZ >= bounds.maxZ;
    },

    /**
     * Whether this and another bounding box have any points of intersection (including touching boundaries).
     * @public
     *
     * @param {Bounds3} bounds
     * @returns {boolean}
     */
    intersectsBounds: function( bounds ) {
      // TODO: more efficient way of doing this?
      return !this.intersection( bounds ).isEmpty();
    },

    /**
     * Debugging string for the bounds.
     * @public
     *
     * @returns {string}
     */
    toString: function() {
      return '[x:(' + this.minX + ',' + this.maxX + '),y:(' + this.minY + ',' + this.maxY + '),z:(' + this.minZ + ',' + this.maxZ + ')]';
    },

    /**
     * Exact equality comparison between this bounds and another bounds.
     * @public
     *
     * @param {Bounds3} other
     * @returns {boolean} - Whether the two bounds are equal
     */
    equals: function( other ) {
      return this.minX === other.minX && this.minY === other.minY && this.minZ === other.minZ && this.maxX === other.maxX && this.maxY === other.maxY && this.maxZ === other.maxZ;
    },

    /**
     * Approximate equality comparison between this bounds and another bounds.
     * @public
     *
     * @param {Bounds3} other
     * @param {number} epsilon
     * @returns {boolean} - Whether difference between the two bounds has no min/max with an absolute value greater
     *                      than epsilon.
     */
    equalsEpsilon: function( other, epsilon ) {
      epsilon = epsilon !== undefined ? epsilon : 0;
      var thisFinite = this.isFinite();
      var otherFinite = other.isFinite();
      if ( thisFinite && otherFinite ) {
        // both are finite, so we can use Math.abs() - it would fail with non-finite values like Infinity
        return Math.abs( this.minX - other.minX ) < epsilon &&
               Math.abs( this.minY - other.minY ) < epsilon &&
               Math.abs( this.minZ - other.minZ ) < epsilon &&
               Math.abs( this.maxX - other.maxX ) < epsilon &&
               Math.abs( this.maxY - other.maxY ) < epsilon &&
               Math.abs( this.maxZ - other.maxZ ) < epsilon;
      }
      else if ( thisFinite !== otherFinite ) {
        return false; // one is finite, the other is not. definitely not equal
      }
      else if ( this === other ) {
        return true; // exact same instance, must be equal
      }
      else {
        // epsilon only applies on finite dimensions. due to JS's handling of isFinite(), it's faster to check the sum of both
        return ( isFinite( this.minX + other.minX ) ? ( Math.abs( this.minX - other.minX ) < epsilon ) : ( this.minX === other.minX ) ) &&
               ( isFinite( this.minY + other.minY ) ? ( Math.abs( this.minY - other.minY ) < epsilon ) : ( this.minY === other.minY ) ) &&
               ( isFinite( this.minZ + other.minZ ) ? ( Math.abs( this.minZ - other.minZ ) < epsilon ) : ( this.minZ === other.minZ ) ) &&
               ( isFinite( this.maxX + other.maxX ) ? ( Math.abs( this.maxX - other.maxX ) < epsilon ) : ( this.maxX === other.maxX ) ) &&
               ( isFinite( this.maxY + other.maxY ) ? ( Math.abs( this.maxY - other.maxY ) < epsilon ) : ( this.maxY === other.maxY ) ) &&
               ( isFinite( this.maxZ + other.maxZ ) ? ( Math.abs( this.maxZ - other.maxZ ) < epsilon ) : ( this.maxZ === other.maxZ ) );
      }
    },

    /*---------------------------------------------------------------------------*
     * Immutable operations
     *---------------------------------------------------------------------------*/

    /**
     * Creates a copy of this bounds, or if a bounds is passed in, set that bounds's values to ours.
     * @public
     *
     * This is the immutable form of the function set(), if a bounds is provided. This will return a new bounds, and
     * will not modify this bounds.
     *
     * @param {Bounds3} [bounds] - If not provided, creates a new Bounds3 with filled in values. Otherwise, fills in the
     *                             values of the provided bounds so that it equals this bounds.
     * @returns {Bounds3}
     */
    copy: function( bounds ) {
      if ( bounds ) {
        return bounds.set( this );
      }
      else {
        return new Bounds3( this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ );
      }
    },

    /**
     * The smallest bounds that contains both this bounds and the input bounds, returned as a copy.
     * @public
     *
     * This is the immutable form of the function includeBounds(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {Bounds3} bounds
     * @returns {Bounds3}
     */
    union: function( bounds ) {
      return new Bounds3(
        Math.min( this.minX, bounds.minX ),
        Math.min( this.minY, bounds.minY ),
        Math.min( this.minZ, bounds.minZ ),
        Math.max( this.maxX, bounds.maxX ),
        Math.max( this.maxY, bounds.maxY ),
        Math.max( this.maxZ, bounds.maxZ )
      );
    },

    /**
     * The smallest bounds that is contained by both this bounds and the input bounds, returned as a copy.
     * @public
     *
     * This is the immutable form of the function constrainBounds(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {Bounds3} bounds
     * @returns {Bounds3}
     */
    intersection: function( bounds ) {
      return new Bounds3(
        Math.max( this.minX, bounds.minX ),
        Math.max( this.minY, bounds.minY ),
        Math.max( this.minZ, bounds.minZ ),
        Math.min( this.maxX, bounds.maxX ),
        Math.min( this.maxY, bounds.maxY ),
        Math.min( this.maxZ, bounds.maxZ )
      );
    },
    // TODO: difference should be well-defined, but more logic is needed to compute

    /**
     * The smallest bounds that contains this bounds and the point (x,y,z), returned as a copy.
     * @public
     *
     * This is the immutable form of the function addCoordinates(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Bounds3}
     */
    withCoordinates: function( x, y, z ) {
      return new Bounds3(
        Math.min( this.minX, x ),
        Math.min( this.minY, y ),
        Math.min( this.minZ, z ),
        Math.max( this.maxX, x ),
        Math.max( this.maxY, y ),
        Math.max( this.maxZ, z )
      );
    },

    /**
     * The smallest bounds that contains this bounds and the input point, returned as a copy.
     * @public
     *
     * This is the immutable form of the function addPoint(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {Vector3} point
     * @returns {Bounds3}
     */
    withPoint: function( point ) {
      return this.withCoordinates( point.x, point.y, point.z );
    },

    /**
     * A copy of this bounds, with minX replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMinX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} minX
     * @returns {Bounds3}
     */
    withMinX: function( minX ) {
      return new Bounds3( minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ );
    },

    /**
     * A copy of this bounds, with minY replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMinY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} minY
     * @returns {Bounds3}
     */
    withMinY: function( minY ) {
      return new Bounds3( this.minX, minY, this.minZ, this.maxX, this.maxY, this.maxZ );
    },

    /**
     * A copy of this bounds, with minZ replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMinZ(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} minZ
     * @returns {Bounds3}
     */
    withMinZ: function( minZ ) {
      return new Bounds3( this.minX, this.minY, minZ, this.maxX, this.maxY, this.maxZ );
    },

    /**
     * A copy of this bounds, with maxX replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMaxX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} maxX
     * @returns {Bounds3}
     */
    withMaxX: function( maxX ) {
      return new Bounds3( this.minX, this.minY, this.minZ, maxX, this.maxY, this.maxZ );
    },

    /**
     * A copy of this bounds, with maxY replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMaxY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} maxY
     * @returns {Bounds3}
     */
    withMaxY: function( maxY ) {
      return new Bounds3( this.minX, this.minY, this.minZ, this.maxX, maxY, this.maxZ );
    },

    /**
     * A copy of this bounds, with maxZ replaced with the input.
     * @public
     *
     * This is the immutable form of the function setMaxZ(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} maxZ
     * @returns {Bounds3}
     */
    withMaxZ: function( maxZ ) {
      return new Bounds3( this.minX, this.minY, this.minZ, this.maxX, this.maxY, maxZ );
    },

    /**
     * A copy of this bounds, with the minimum values rounded down to the nearest integer, and the maximum values
     * rounded up to the nearest integer. This causes the bounds to expand as necessary so that its boundaries
     * are integer-aligned.
     * @public
     *
     * This is the immutable form of the function roundOut(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @returns {Bounds3}
     */
    roundedOut: function() {
      return new Bounds3(
        Math.floor( this.minX ),
        Math.floor( this.minY ),
        Math.floor( this.minZ ),
        Math.ceil( this.maxX ),
        Math.ceil( this.maxY ),
        Math.ceil( this.maxZ )
      );
    },

    /**
     * A copy of this bounds, with the minimum values rounded up to the nearest integer, and the maximum values
     * rounded down to the nearest integer. This causes the bounds to contract as necessary so that its boundaries
     * are integer-aligned.
     * @public
     *
     * This is the immutable form of the function roundIn(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @returns {Bounds3}
     */
    roundedIn: function() {
      return new Bounds3(
        Math.ceil( this.minX ),
        Math.ceil( this.minY ),
        Math.ceil( this.minZ ),
        Math.floor( this.maxX ),
        Math.floor( this.maxY ),
        Math.floor( this.maxZ )
      );
    },

    /**
     * A bounding box (still axis-aligned) that contains the transformed shape of this bounds, applying the matrix as
     * an affine transformation.
     * @pubic
     *
     * NOTE: bounds.transformed( matrix ).transformed( inverse ) may be larger than the original box, if it includes
     * a rotation that isn't a multiple of $\pi/2$. This is because the returned bounds may expand in area to cover
     * ALL of the corners of the transformed bounding box.
     *
     * This is the immutable form of the function transform(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {Matrix4} matrix
     * @returns {Bounds3}
     */
    transformed: function( matrix ) {
      return this.copy().transform( matrix );
    },

    /**
     * A bounding box that is expanded on all sides by the specified amount.)
     * @public
     *
     * This is the immutable form of the function dilate(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} d
     * @returns {Bounds3}
     */
    dilated: function( d ) {
      return new Bounds3( this.minX - d, this.minY - d, this.minZ - d, this.maxX + d, this.maxY + d, this.maxZ + d );
    },

    /**
     * A bounding box that is expanded horizontally (on the left and right) by the specified amount.
     * @public
     *
     * This is the immutable form of the function dilateX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @returns {Bounds3}
     */
    dilatedX: function( x ) {
      return new Bounds3( this.minX - x, this.minY, this.minZ, this.maxX + x, this.maxY, this.maxZ );
    },

    /**
     * A bounding box that is expanded vertically (on the top and bottom) by the specified amount.
     * @public
     *
     * This is the immutable form of the function dilateY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} y
     * @returns {Bounds3}
     */
    dilatedY: function( y ) {
      return new Bounds3( this.minX, this.minY - y, this.minZ, this.maxX, this.maxY + y, this.maxZ );
    },

    /**
     * A bounding box that is expanded depth-wise (on the front and back) by the specified amount.
     * @public
     *
     * This is the immutable form of the function dilateZ(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} z
     * @returns {Bounds3}
     */
    dilatedZ: function( z ) {
      return new Bounds3( this.minX, this.minY, this.minZ - z, this.maxX, this.maxY, this.maxZ + z );
    },

    /**
     * A bounding box that is expanded on all sides, with different amounts of expansion along each axis.
     * Will be identical to the bounds returned by calling bounds.dilatedX( x ).dilatedY( y ).dilatedZ( z ).
     * @public
     *
     * This is the immutable form of the function dilateXYZ(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x - Amount to dilate horizontally (for each side)
     * @param {number} y - Amount to dilate vertically (for each side)
     * @param {number} z - Amount to dilate depth-wise (for each side)
     * @returns {Bounds3}
     */
    dilatedXYZ: function( x, y, z ) {
      return new Bounds3( this.minX - x, this.minY - y, this.minZ - z, this.maxX + x, this.maxY + y, this.maxZ + z );
    },

    /**
     * A bounding box that is contracted on all sides by the specified amount.
     * @public
     *
     * This is the immutable form of the function erode(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} amount
     * @returns {Bounds3}
     */
    eroded: function( d ) { return this.dilated( -d ); },

    /**
     * A bounding box that is contracted horizontally (on the left and right) by the specified amount.
     * @public
     *
     * This is the immutable form of the function erodeX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @returns {Bounds3}
     */
    erodedX: function( x ) { return this.dilatedX( -x ); },

    /**
     * A bounding box that is contracted vertically (on the top and bottom) by the specified amount.
     * @public
     *
     * This is the immutable form of the function erodeY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} y
     * @returns {Bounds3}
     */
    erodedY: function( y ) { return this.dilatedY( -y ); },

    /**
     * A bounding box that is contracted depth-wise (on the front and back) by the specified amount.
     * @public
     *
     * This is the immutable form of the function erodeZ(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} z
     * @returns {Bounds3}
     */
    erodedZ: function( z ) { return this.dilatedZ( -z ); },

    /**
     * A bounding box that is contracted on all sides, with different amounts of contraction along each axis.
     * @public
     *
     * This is the immutable form of the function erodeXYZ(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x - Amount to erode horizontally (for each side)
     * @param {number} y - Amount to erode vertically (for each side)
     * @param {number} z - Amount to erode depth-wise (for each side)
     * @returns {Bounds3}
     */
    erodedXYZ: function( x, y, z ) { return this.dilatedXYZ( -x, -y, -z ); },

    /**
     * Our bounds, translated horizontally by x, returned as a copy.
     * @public
     *
     * This is the immutable form of the function shiftX(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @returns {Bounds3}
     */
    shiftedX: function( x ) {
      return new Bounds3( this.minX + x, this.minY, this.minZ, this.maxX + x, this.maxY, this.maxZ );
    },

    /**
     * Our bounds, translated vertically by y, returned as a copy.
     * @public
     *
     * This is the immutable form of the function shiftY(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} y
     * @returns {Bounds3}
     */
    shiftedY: function( y ) {
      return new Bounds3( this.minX, this.minY + y, this.minZ, this.maxX, this.maxY + y, this.maxZ );
    },

    /**
     * Our bounds, translated depth-wise by z, returned as a copy.
     * @public
     *
     * This is the immutable form of the function shiftZ(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} z
     * @returns {Bounds3}
     */
    shiftedZ: function( z ) {
      return new Bounds3( this.minX, this.minY, this.minZ + z, this.maxX, this.maxY, this.maxZ + z );
    },

    /**
     * Our bounds, translated by (x,y,z), returned as a copy.
     * @public
     *
     * This is the immutable form of the function shift(). This will return a new bounds, and will not modify
     * this bounds.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Bounds3}
     */
    shifted: function( x, y, z ) {
      return new Bounds3( this.minX + x, this.minY + y, this.minZ + z, this.maxX + x, this.maxY + y, this.maxZ + z );
    },

    /*---------------------------------------------------------------------------*
     * Mutable operations
     *
     * All mutable operations should call one of the following:
     *   setMinMax, setMinX, setMinY, setMinZ, setMaxX, setMaxY, setMaxZ
     *---------------------------------------------------------------------------*/

    /**
     * Sets each value for this bounds, and returns itself.
     * @public
     *
     * @param {number} minX
     * @param {number} minY
     * @param {number} minZ
     * @param {number} maxX
     * @param {number} maxY
     * @param {number} maxZ
     * @returns {Bounds3}
     */
    setMinMax: function( minX, minY, minZ, maxX, maxY, maxZ ) {
      this.minX = minX;
      this.minY = minY;
      this.minZ = minZ;
      this.maxX = maxX;
      this.maxY = maxY;
      this.maxZ = maxZ;
      return this;
    },

    /**
     * Sets the value of minX.
     * @public
     *
     * This is the mutable form of the function withMinX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} minX
     * @returns {Bounds3}
     */
    setMinX: function( minX ) {
      this.minX = minX;
      return this;
    },

    /**
     * Sets the value of minY.
     * @public
     *
     * This is the mutable form of the function withMinY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} minY
     * @returns {Bounds3}
     */
    setMinY: function( minY ) {
      this.minY = minY;
      return this;
    },

    /**
     * Sets the value of minZ.
     * @public
     *
     * This is the mutable form of the function withMinZ(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} minZ
     * @returns {Bounds3}
     */
    setMinZ: function( minZ ) {
      this.minZ = minZ;
      return this;
    },

    /**
     * Sets the value of maxX.
     * @public
     *
     * This is the mutable form of the function withMaxX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} maxX
     * @returns {Bounds3}
     */
    setMaxX: function( maxX ) {
      this.maxX = maxX;
      return this;
    },

    /**
     * Sets the value of maxY.
     * @public
     *
     * This is the mutable form of the function withMaxY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} maxY
     * @returns {Bounds3}
     */
    setMaxY: function( maxY ) {
      this.maxY = maxY;
      return this;
    },

    /**
     * Sets the value of maxZ.
     * @public
     *
     * This is the mutable form of the function withMaxZ(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} maxZ
     * @returns {Bounds3}
     */
    setMaxZ: function( maxZ ) {
      this.maxZ = maxZ;
      return this;
    },

    /**
     * Sets the values of this bounds to be equal to the input bounds.
     * @public
     *
     * This is the mutable form of the function copy(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Bounds3} bounds
     * @returns {Bounds3}
     */
    set: function( bounds ) {
      return this.setMinMax( bounds.minX, bounds.minY, bounds.minZ, bounds.maxX, bounds.maxY, bounds.maxZ );
    },

    /**
     * Modifies this bounds so that it contains both its original bounds and the input bounds.
     * @public
     *
     * This is the mutable form of the function union(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Bounds3} bounds
     * @returns {Bounds3}
     */
    includeBounds: function( bounds ) {
      return this.setMinMax(
        Math.min( this.minX, bounds.minX ),
        Math.min( this.minY, bounds.minY ),
        Math.min( this.minZ, bounds.minZ ),
        Math.max( this.maxX, bounds.maxX ),
        Math.max( this.maxY, bounds.maxY ),
        Math.max( this.maxZ, bounds.maxZ )
      );
    },

    /**
     * Modifies this bounds so that it is the largest bounds contained both in its original bounds and in the input bounds.
     * @public
     *
     * This is the mutable form of the function intersection(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Bounds3} bounds
     * @returns {Bounds3}
     */
    constrainBounds: function( bounds ) {
      return this.setMinMax(
        Math.max( this.minX, bounds.minX ),
        Math.max( this.minY, bounds.minY ),
        Math.max( this.minZ, bounds.minZ ),
        Math.min( this.maxX, bounds.maxX ),
        Math.min( this.maxY, bounds.maxY ),
        Math.min( this.maxZ, bounds.maxZ )
      );
    },

    /**
     * Modifies this bounds so that it contains both its original bounds and the input point (x,y,z).
     * @public
     *
     * This is the mutable form of the function withCoordinates(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Bounds3}
     */
    addCoordinates: function( x, y, z ) {
      return this.setMinMax(
        Math.min( this.minX, x ),
        Math.min( this.minY, y ),
        Math.min( this.minZ, z ),
        Math.max( this.maxX, x ),
        Math.max( this.maxY, y ),
        Math.max( this.maxZ, z )
      );
    },

    /**
     * Modifies this bounds so that it contains both its original bounds and the input point.
     * @public
     *
     * This is the mutable form of the function withPoint(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Vector3} point
     * @returns {Bounds3}
     */
    addPoint: function( point ) {
      return this.addCoordinates( point.x, point.y, point.z );
    },

    /**
     * Modifies this bounds so that its boundaries are integer-aligned, rounding the minimum boundaries down and the
     * maximum boundaries up (expanding as necessary).
     * @public
     *
     * This is the mutable form of the function roundedOut(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @returns {Bounds3}
     */
    roundOut: function() {
      return this.setMinMax(
        Math.floor( this.minX ),
        Math.floor( this.minY ),
        Math.floor( this.minZ ),
        Math.ceil( this.maxX ),
        Math.ceil( this.maxY ),
        Math.ceil( this.maxZ )
      );
    },

    /**
     * Modifies this bounds so that its boundaries are integer-aligned, rounding the minimum boundaries up and the
     * maximum boundaries down (contracting as necessary).
     * @public
     *
     * This is the mutable form of the function roundedIn(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @returns {Bounds3}
     */
    roundIn: function() {
      return this.setMinMax(
        Math.ceil( this.minX ),
        Math.ceil( this.minY ),
        Math.ceil( this.minZ ),
        Math.floor( this.maxX ),
        Math.floor( this.maxY ),
        Math.floor( this.maxZ )
      );
    },

    /**
     * Modifies this bounds so that it would fully contain a transformed version if its previous value, applying the
     * matrix as an affine transformation.
     * @pubic
     *
     * NOTE: bounds.transform( matrix ).transform( inverse ) may be larger than the original box, if it includes
     * a rotation that isn't a multiple of $\pi/2$. This is because the bounds may expand in area to cover
     * ALL of the corners of the transformed bounding box.
     *
     * This is the mutable form of the function transformed(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {Matrix4} matrix
     * @returns {Bounds3}
     */
    transform: function( matrix ) {
      // do nothing
      if ( this.isEmpty() ) {
        return this;
      }

      // optimization to bail for identity matrices
      if ( matrix.isIdentity() ) {
        return this;
      }

      var minX = Number.POSITIVE_INFINITY;
      var minY = Number.POSITIVE_INFINITY;
      var minZ = Number.POSITIVE_INFINITY;
      var maxX = Number.NEGATIVE_INFINITY;
      var maxY = Number.NEGATIVE_INFINITY;
      var maxZ = Number.NEGATIVE_INFINITY;

      // using mutable vector so we don't create excessive instances of Vector2 during this
      // make sure all 4 corners are inside this transformed bounding box
      var vector = new dot.Vector3();

      function withIt( vector ) {
        minX = Math.min( minX, vector.x );
        minY = Math.min( minY, vector.y );
        minZ = Math.min( minZ, vector.z );
        maxX = Math.max( maxX, vector.x );
        maxY = Math.max( maxY, vector.y );
        maxZ = Math.max( maxZ, vector.z );
      }

      withIt( matrix.multiplyVector3( vector.setXYZ( this.minX, this.minY, this.minZ ) ) );
      withIt( matrix.multiplyVector3( vector.setXYZ( this.minX, this.maxY, this.minZ ) ) );
      withIt( matrix.multiplyVector3( vector.setXYZ( this.maxX, this.minY, this.minZ ) ) );
      withIt( matrix.multiplyVector3( vector.setXYZ( this.maxX, this.maxY, this.minZ ) ) );
      withIt( matrix.multiplyVector3( vector.setXYZ( this.minX, this.minY, this.maxZ ) ) );
      withIt( matrix.multiplyVector3( vector.setXYZ( this.minX, this.maxY, this.maxZ ) ) );
      withIt( matrix.multiplyVector3( vector.setXYZ( this.maxX, this.minY, this.maxZ ) ) );
      withIt( matrix.multiplyVector3( vector.setXYZ( this.maxX, this.maxY, this.maxZ ) ) );
      return this.setMinMax( minX, minY, minZ, maxX, maxY, maxZ );
    },

    /**
     * Expands this bounds on all sides by the specified amount.
     * @public
     *
     * This is the mutable form of the function dilated(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} d
     * @returns {Bounds3}
     */
    dilate: function( d ) {
      return this.setMinMax( this.minX - d, this.minY - d, this.minZ - d, this.maxX + d, this.maxY + d, this.maxZ + d );
    },

    /**
     * Expands this bounds horizontally (left and right) by the specified amount.
     * @public
     *
     * This is the mutable form of the function dilatedX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @returns {Bounds3}
     */
    dilateX: function( x ) {
      return this.setMinMax( this.minX - x, this.minY, this.minZ, this.maxX + x, this.maxY, this.maxZ );
    },

    /**
     * Expands this bounds vertically (top and bottom) by the specified amount.
     * @public
     *
     * This is the mutable form of the function dilatedY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} y
     * @returns {Bounds3}
     */
    dilateY: function( y ) {
      return this.setMinMax( this.minX, this.minY - y, this.minZ, this.maxX, this.maxY + y, this.maxZ );
    },

    /**
     * Expands this bounds depth-wise (front and back) by the specified amount.
     * @public
     *
     * This is the mutable form of the function dilatedZ(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} z
     * @returns {Bounds3}
     */
    dilateZ: function( z ) {
      return this.setMinMax( this.minX, this.minY, this.minZ - z, this.maxX, this.maxY, this.maxZ + z );
    },

    /**
     * Expands this bounds independently along each axis. Will be equal to calling
     * bounds.dilateX( x ).dilateY( y ).dilateZ( z ).
     * @public
     *
     * This is the mutable form of the function dilatedXYZ(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Bounds3}
     */
    dilateXYZ: function( x, y, z ) {
      return this.setMinMax( this.minX - x, this.minY - y, this.minZ - z, this.maxX + x, this.maxY + y, this.maxZ + z );
    },

    /**
     * Contracts this bounds on all sides by the specified amount.
     * @public
     *
     * This is the mutable form of the function eroded(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} d
     * @returns {Bounds3}
     */
    erode: function( d ) { return this.dilate( -d ); },

    /**
     * Contracts this bounds horizontally (left and right) by the specified amount.
     * @public
     *
     * This is the mutable form of the function erodedX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @returns {Bounds3}
     */
    erodeX: function( x ) { return this.dilateX( -x ); },

    /**
     * Contracts this bounds vertically (top and bottom) by the specified amount.
     * @public
     *
     * This is the mutable form of the function erodedY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} y
     * @returns {Bounds3}
     */
    erodeY: function( y ) { return this.dilateY( -y ); },

    /**
     * Contracts this bounds depth-wise (front and back) by the specified amount.
     * @public
     *
     * This is the mutable form of the function erodedZ(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} z
     * @returns {Bounds3}
     */
    erodeZ: function( z ) { return this.dilateZ( -z ); },

    /**
     * Contracts this bounds independently along each axis. Will be equal to calling
     * bounds.erodeX( x ).erodeY( y ).erodeZ( z ).
     * @public
     *
     * This is the mutable form of the function erodedXYZ(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Bounds3}
     */
    erodeXYZ: function( x, y, z ) { return this.dilateXYZ( -x, -y, -z ); },

    /**
     * Translates our bounds horizontally by x.
     * @public
     *
     * This is the mutable form of the function shiftedX(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @returns {Bounds3}
     */
    shiftX: function( x ) {
      return this.setMinMax( this.minX + x, this.minY, this.minZ, this.maxX + x, this.maxY, this.maxZ );
    },

    /**
     * Translates our bounds vertically by y.
     * @public
     *
     * This is the mutable form of the function shiftedY(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} y
     * @returns {Bounds3}
     */
    shiftY: function( y ) {
      return this.setMinMax( this.minX, this.minY + y, this.minZ, this.maxX, this.maxY + y, this.maxZ );
    },

    /**
     * Translates our bounds depth-wise by z.
     * @public
     *
     * This is the mutable form of the function shiftedZ(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} z
     * @returns {Bounds3}
     */
    shiftZ: function( z ) {
      return this.setMinMax( this.minX, this.minY, this.minZ + z, this.maxX, this.maxY, this.maxZ + z );
    },

    /**
     * Translates our bounds by (x,y,z).
     * @public
     *
     * This is the mutable form of the function shifted(). This will mutate (change) this bounds, in addition to returning
     * this bounds itself.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Bounds3}
     */
    shift: function( x, y, z ) {
      return this.setMinMax( this.minX + x, this.minY + y, this.minZ + z, this.maxX + x, this.maxY + y, this.maxZ + z );
    }
  }, {
    /**
     * Returns a new Bounds3 object, with the cuboid (3d rectangle) construction with x, y, z, width, height and depth.
     * @public
     *
     * @param {number} x - The minimum value of X for the bounds.
     * @param {number} y - The minimum value of Y for the bounds.
     * @param {number} z - The minimum value of Z for the bounds.
     * @param {number} width - The width (maxX - minX) of the bounds.
     * @param {number} height - The height (maxY - minY) of the bounds.
     * @param {number} depth - The depth (maxZ - minZ) of the bounds.
     * @returns {Bounds3}
     */
    cuboid: function( x, y, z, width, height, depth ) {
      return new Bounds3( x, y, z, x + width, y + height, z + depth );
    },

    /**
     * Returns a new Bounds3 object that only contains the specified point (x,y,z). Useful for being dilated to form a
     * bounding box around a point. Note that the bounds will not be "empty" as it contains (x,y,z), but it will have
     * zero area.
     * @public
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Bounds3}
     */
    point: function( x, y, z ) {
      return new Bounds3( x, y, z, x, y, z );
    }
  } );

  Poolable.mixin( Bounds3, {
    defaultFactory: function() { return Bounds3.NOTHING.copy(); },
    constructorDuplicateFactory: function( pool ) {
      return function( minX, minY, minZ, maxX, maxY, maxZ ) {
        if ( pool.length ) {
          return pool.pop().setMinMax( minX, minY, minZ, maxX, maxY, maxZ );
        }
        else {
          return new Bounds3( minX, minY, minZ, maxX, maxY, maxZ );
        }
      };
    }
  } );

  /**
   * A contant Bounds3 with minimums = $\infty$, maximums = $-\infty$, so that it represents "no bounds whatsoever".
   * @public
   *
   * This allows us to take the union (union/includeBounds) of this and any other Bounds3 to get the other bounds back,
   * e.g. Bounds3.NOTHING.union( bounds ).equals( bounds ). This object naturally serves as the base case as a union of
   * zero bounds objects.
   *
   * Additionally, intersections with NOTHING will always return a Bounds3 equivalent to NOTHING.
   *
   * @constant {Bounds3} NOTHING
   */
  Bounds3.NOTHING = new Bounds3( Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY );

  /**
   * A contant Bounds3 with minimums = $-\infty$, maximums = $\infty$, so that it represents "all bounds".
   * @public
   *
   * This allows us to take the intersection (intersection/constrainBounds) of this and any other Bounds3 to get the
   * other bounds back, e.g. Bounds3.EVERYTHING.intersection( bounds ).equals( bounds ). This object naturally serves as
   * the base case as an intersection of zero bounds objects.
   *
   * Additionally, unions with EVERYTHING will always return a Bounds3 equivalent to EVERYTHING.
   *
   * @constant {Bounds3} EVERYTHING
   */
  Bounds3.EVERYTHING = new Bounds3( Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY );

  return Bounds3;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * A complex number fhat is immutable. Extends Vector2 for many common operations that need to treat the complex number
 * as a vector $\begin{bmatrix} a \\ b \end{bmatrix}$ for the real number $a+bi$.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Chris Malley
 */

define( 'DOT/Complex',['require','DOT/dot','PHET_CORE/inherit','DOT/Vector2'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );

  /**
   * Creates a complex number, that has both a real and imaginary part.
   * @constructor
   * @public
   *
   * @param {number} real - The real part. For a complex number $a+bi$, this should be $a$.
   * @param {number} imaginary - The imaginary part. For a complex number $a+bi$, this should be $b$.
   */
  function Complex( real, imaginary ) {
    Vector2.call( this, real, imaginary );

    // @public {number} - The real part. For a complex number $a+bi$, this is $a$.
    this.real = real;

    // @public {number} - The imaginary part. For a complex number $a+bi$, this is $b$.
    this.imaginary = imaginary;
  }

  dot.register( 'Complex', Complex );

  // Inheriting Vector2 for now since many times we may want to treat the complex number as a vector
  // ideally, we should have Vector2-likeness be a mixin?
  // we also inherit the immutable form since we add 'real' and 'imaginary' properties,
  // without adding extra logic to mutators in Vector2
  inherit( Vector2.Immutable, Complex, {
    /**
     * The phase / argument of the complex number.
     * @public
     *
     * @returns {number}
     */
    phase: Vector2.prototype.angle,

    /**
     * Complex multiplication.
     * @public
     *
     * @param {Complex} c
     * @returns {Complex}
     */
    times: function( c ) {
      return new Complex( this.real * c.real - this.imaginary * c.imaginary, this.real * c.imaginary + this.imaginary * c.real );
    },

    /**
     * Complex division.
     * @public
     *
     * @param {Complex} c
     * @returns {Complex}
     */
    dividedBy: function( c ) {
      var cMag = c.magnitudeSquared();
      return new Complex(
        ( this.real * c.real + this.imaginary * c.imaginary ) / cMag,
        ( this.imaginary * c.real - this.real * c.imaginary ) / cMag
      );
    },

    /**
     * Square root.
     * @public
     *
     * @returns {Complex}
     */
    sqrt: function() {
      var mag = this.magnitude();
      return new Complex( Math.sqrt( ( mag + this.real ) / 2 ),
        ( this.imaginary >= 0 ? 1 : -1 ) * Math.sqrt( ( mag - this.real ) / 2 ) );
    },

    /**
     * Complex conjugate.
     * @public
     *
     * @returns {Complex}
     */
    conjugate: function() {
      return new Complex( this.real, -this.imaginary );
    },

    /**
     * Takes e to the power of this complex number. $e^{a+bi}=e^a\cos b + i\sin b$.
     * @public
     *
     * @returns {Complex}
     */
    exponentiated: function() {
      return Complex.createPolar( Math.exp( this.real ), this.imaginary );
    },

    /**
     * Debugging string for the complex number (provides real and imaginary parts).
     * @public
     *
     * @returns {string}
     */
    toString: function() {
      return 'Complex(' + this.x + ', ' + this.y + ')';
    }
  }, {
    /**
     * Constructs a complex number from just the real part (assuming the imaginary part is 0).
     * @public
     *
     * @param {number} real
     * @returns {Complex}
     */
    real: function( real ) {
      return new Complex( real, 0 );
    },

    /**
     * Constructs a complex number from just the imaginary part (assuming the real part is 0).
     * @public
     *
     * @param {number} imaginary
     * @returns {Complex}
     */
    imaginary: function( imaginary ) {
      return new Complex( 0, imaginary );
    },

    /**
     * Constructs a complex number from the polar form. For a magnitude $r$ and phase $\varphi$, this will be
     * $\cos\varphi+i r\sin\varphi$.
     * @public
     *
     * @param {number} magnitude
     * @param {number} phase
     * @returns {Complex}
     */
    createPolar: function( magnitude, phase ) {
      return new Complex( magnitude * Math.cos( phase ), magnitude * Math.sin( phase ) );
    }
  } );

  /**
   * Immutable constant $0$.
   * @public
   *
   * @constant {Complex} ZERO
   */
  Complex.ZERO = new Complex( 0, 0 );

  /**
   * Immutable constant $1$.
   * @public
   *
   * @constant {Complex} ONE
   */
  Complex.ONE = new Complex( 1, 0 );

  /**
   * Immutable constant $i$, the imaginary unit.
   * @public
   *
   * @constant {Complex} ONE
   */
  Complex.I = new Complex( 0, 1 );

  return Complex;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Construction of 2D convex hulls from a list of points.
 *
 * For example:
 * #begin canvasExample grahamScan 256x128
 * #on
 * var points = _.range( 50 ).map( function() {
 *   return new dot.Vector2( 5 + ( 256 - 10 ) * Math.random(), 5 + ( 128 - 10 ) * Math.random() );
 * } );
 * var hullPoints = dot.ConvexHull2.grahamScan( points, false );
 * #off
 * context.beginPath();
 * hullPoints.forEach( function( point ) {
 *   context.lineTo( point.x, point.y );
 * } );
 * context.closePath();
 * context.fillStyle = '#eee';
 * context.fill();
 * context.strokeStyle = '#f00';
 * context.stroke();
 *
 * context.beginPath();
 * points.forEach( function( point ) {
 *   context.arc( point.x, point.y, 2, 0, Math.PI * 2, false );
 *   context.closePath();
 * } );
 * context.fillStyle = '#00f';
 * context.fill();
 * #end canvasExample
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/ConvexHull2',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  // counter-clockwise turn if > 0, clockwise turn if < 0, collinear if === 0.
  function ccw( p1, p2, p3 ) {
    return p2.minus( p1 ).crossScalar( p3.minus( p1 ) );
  }

  var ConvexHull2 = {
    // TODO testing: all collinear, multiple ways of having same angle, etc.

    /**
     * Given multiple points, this performs a Graham Scan (http://en.wikipedia.org/wiki/Graham_scan) to identify an
     * ordered list of points which define the minimal polygon that contains all of the points.
     * @public
     *
     * @param {Array.<Vector2>} points
     * @param {boolean} includeCollinear - If a point is along an edge of the convex hull (not at one of its vertices),
     *                                     should it be included?
     * @returns {Array.<Vector2>}
     */
    grahamScan: function( points, includeCollinear ) {
      if ( points.length <= 2 ) {
        return points;
      }

      // find the point 'p' with the lowest y value
      var minY = Number.POSITIVE_INFINITY;
      var p = null;
      _.each( points, function( point ) {
        if ( point.y <= minY ) {
          // if two points have the same y value, take the one with the lowest x
          if ( point.y === minY && p ) {
            if ( point.x < p.x ) {
              p = point;
            }
          }
          else {
            minY = point.y;
            p = point;
          }
        }
      } );

      // sorts the points by their angle. Between 0 and PI
      points = _.sortBy( points, function( point ) {
        return point.minus( p ).angle();
      } );

      // remove p from points (relies on the above statement making a defensive copy)
      points.splice( _.indexOf( points, p ), 1 );

      // our result array
      var result = [ p ];

      _.each( points, function( point ) {
        // ignore points equal to our starting point
        if ( p.x === point.x && p.y === point.y ) { return; }

        function isRightTurn() {
          if ( result.length < 2 ) {
            return false;
          }
          var cross = ccw( result[ result.length - 2 ], result[ result.length - 1 ], point );
          return includeCollinear ? ( cross < 0 ) : ( cross <= 0 );
        }

        while ( isRightTurn() ) {
          result.pop();
        }
        result.push( point );
      } );

      return result;
    }
  };

  dot.register( 'ConvexHull2', ConvexHull2 );

  return ConvexHull2;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Basic width and height, like a Bounds2 but without the location defined.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Dimension2',['require','DOT/dot','PHET_CORE/inherit','DOT/Bounds2'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );
  var inherit = require( 'PHET_CORE/inherit' );
  require( 'DOT/Bounds2' );

  /**
   * Creates a 2-dimensional size with a width and height
   * @constructor
   * @public
   *
   * @param {number} width
   * @param {number} height
   */
  function Dimension2( width, height ) {
    // @public {number} - Width of the dimension
    this.width = width;

    // @public {number} - Height of the dimension
    this.height = height;
  }

  dot.register( 'Dimension2', Dimension2 );

  inherit( Object, Dimension2, {
    /**
     * Debugging string for the dimension.
     * @public
     *
     * @returns {string}
     */
    toString: function() {
      return '[' + this.width + 'w, ' + this.height + 'h]';
    },

    /**
     * Sets this dimension to be a copy of another dimension.
     * @public
     *
     * This is the mutable form of the function copy(). This will mutate (change) this dimension, in addition to returning
     * this dimension itself.
     *
     * @param {Dimension2} dimension
     * @returns {Dimension2}
     */
    set: function( dimension ) {
      this.width = dimension.width;
      this.height = dimension.height;
      return this;
    },

    /**
     * Sets the width of the dimension, returning this.
     * @public
     *
     * @param {number} width
     * @returns {Dimension2}
     */
    setWidth: function( width ) {
      this.width = width;
      return this;
    },

    /**
     * Sets the height of the dimension, returning this.
     * @public
     *
     * @param {number} height
     * @returns {Dimension2}
     */
    setHeight: function( height ) {
      this.height = height;
      return this;
    },

    /**
     * Creates a copy of this dimension, or if a dimension is passed in, set that dimension's values to ours.
     * @public
     *
     * This is the immutable form of the function set(), if a dimension is provided. This will return a new dimension,
     * and will not modify this dimension.
     *
     * @param {Dimension2} [dimension] - If not provided, creates a new Vector2 with filled in values. Otherwise, fills
     *                                   in the values of the provided dimension so that it equals this dimension.
     * @returns {Dimension2}
     */
    copy: function( dimension ) {
      if ( dimension ) {
        return dimension.set( this );
      }
      else {
        return new Dimension2( this.width, this.height );
      }
    },

    /**
     * Creates a Bounds2 from this dimension based on passing in the minimum (top-left) corner as (x,y).
     * @public
     *
     * @param {number} [x] - Minimum x coordinate of the bounds, or 0 if not provided.
     * @param {number} [y] - Minimum y coordinate of the bounds, or 0 if not provided.
     * @returns {Bounds2}
     */
    toBounds: function( x, y ) {
      x = x !== undefined ? x : 0;
      y = y !== undefined ? y : 0;
      return new dot.Bounds2( x, y, this.width + x, this.height + y );
    },

    /**
     * Exact equality comparison between this dimension and another dimension.
     * @public
     *
     * @param {Dimension2} other
     * @returns {boolean} - Whether the two dimensions have equal width and height
     */
    equals: function( other ) {
      return this.width === other.width && this.height === other.height;
    }
  } );

  return Dimension2;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Eigensystem decomposition, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * Eigenvalues and eigenvectors of a real matrix.
 * <P>
 * If A is symmetric, then A = V*D*V' where the eigenvalue matrix D is
 * diagonal and the eigenvector matrix V is orthogonal.
 * I.e. A = V.times(D.times(V.transpose())) and
 * V.times(V.transpose()) equals the identity matrix.
 * <P>
 * If A is not symmetric, then the eigenvalue matrix D is block diagonal
 * with the real eigenvalues in 1-by-1 blocks and any complex eigenvalues,
 * lambda + i*mu, in 2-by-2 blocks, [lambda, mu; -mu, lambda].  The
 * columns of V represent the eigenvectors in the sense that A*V = V*D,
 * i.e. A.times(V) equals V.times(D).  The matrix V may be badly
 * conditioned, or even singular, so the validity of the equation
 * A = V*D*inverse(V) depends upon V.cond().
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/EigenvalueDecomposition',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var Float32Array = window.Float32Array || Array;

  // require( 'DOT/Matrix' ); // commented out so Require.js doesn't complain about the circular dependency

  function EigenvalueDecomposition( matrix ) {
    var i;
    var j;

    var A = matrix.entries;
    this.n = matrix.getColumnDimension(); // Row and column dimension (square matrix).
    var n = this.n;
    this.V = new Float32Array( n * n ); // Array for internal storage of eigenvectors.

    // Arrays for internal storage of eigenvalues.
    this.d = new Float32Array( n );
    this.e = new Float32Array( n );

    this.issymmetric = true;
    for ( j = 0; (j < n) && this.issymmetric; j++ ) {
      for ( i = 0; (i < n) && this.issymmetric; i++ ) {
        this.issymmetric = (A[ i * this.n + j ] === A[ j * this.n + i ]);
      }
    }

    if ( this.issymmetric ) {
      for ( i = 0; i < n; i++ ) {
        for ( j = 0; j < n; j++ ) {
          this.V[ i * this.n + j ] = A[ i * this.n + j ];
        }
      }

      // Tridiagonalize.
      this.tred2();

      // Diagonalize.
      this.tql2();

    }
    else {
      this.H = new Float32Array( n * n ); // Array for internal storage of nonsymmetric Hessenberg form.
      this.ort = new Float32Array( n ); // // Working storage for nonsymmetric algorithm.

      for ( j = 0; j < n; j++ ) {
        for ( i = 0; i < n; i++ ) {
          this.H[ i * this.n + j ] = A[ i * this.n + j ];
        }
      }

      // Reduce to Hessenberg form.
      this.orthes();

      // Reduce Hessenberg to real Schur form.
      this.hqr2();
    }
  }

  dot.register( 'EigenvalueDecomposition', EigenvalueDecomposition );

  EigenvalueDecomposition.prototype = {
    constructor: EigenvalueDecomposition,

    // Return the eigenvector matrix
    getV: function() {
      return this.V.copy();
    },

    // {Array} Return the real parts of the eigenvalues
    getRealEigenvalues: function() {
      return this.d;
    },

    // {Array} Return the imaginary parts of the eigenvalues
    getImagEigenvalues: function() {
      return this.e;
    },

    // Return the block diagonal eigenvalue matrix
    getD: function() {
      var n = this.n;
      var d = this.d;
      var e = this.e;

      var X = new dot.Matrix( n, n );
      var D = X.entries;
      for ( var i = 0; i < n; i++ ) {
        for ( var j = 0; j < n; j++ ) {
          D[ i * this.n + j ] = 0.0;
        }
        D[ i * this.n + i ] = d[ i ];
        if ( e[ i ] > 0 ) {
          D[ i * this.n + i + 1 ] = e[ i ];
        }
        else if ( e[ i ] < 0 ) {
          D[ i * this.n + i - 1 ] = e[ i ];
        }
      }
      return X;
    },

    // Symmetric Householder reduction to tridiagonal form.
    tred2: function() {
      var n = this.n;
      var V = this.V;
      var d = this.d;
      var e = this.e;
      var i;
      var j;
      var k;
      var f;
      var g;
      var h;

      //  This is derived from the Algol procedures tred2 by
      //  Bowdler, Martin, Reinsch, and Wilkinson, Handbook for
      //  Auto. Comp., Vol.ii-Linear Algebra, and the corresponding
      //  Fortran subroutine in EISPACK.

      for ( j = 0; j < n; j++ ) {
        d[ j ] = V[ (n - 1) * n + j ];
      }

      // Householder reduction to tridiagonal form.

      for ( i = n - 1; i > 0; i-- ) {

        // Scale to avoid under/overflow.

        var scale = 0.0;
        h = 0.0;
        for ( k = 0; k < i; k++ ) {
          scale = scale + Math.abs( d[ k ] );
        }
        if ( scale === 0.0 ) {
          e[ i ] = d[ i - 1 ];
          for ( j = 0; j < i; j++ ) {
            d[ j ] = V[ (i - 1) * n + j ];
            V[ i * this.n + j ] = 0.0;
            V[ j * this.n + i ] = 0.0;
          }
        }
        else {

          // Generate Householder vector.

          for ( k = 0; k < i; k++ ) {
            d[ k ] /= scale;
            h += d[ k ] * d[ k ];
          }
          f = d[ i - 1 ];
          g = Math.sqrt( h );
          if ( f > 0 ) {
            g = -g;
          }
          e[ i ] = scale * g;
          h = h - f * g;
          d[ i - 1 ] = f - g;
          for ( j = 0; j < i; j++ ) {
            e[ j ] = 0.0;
          }

          // Apply similarity transformation to remaining columns.

          for ( j = 0; j < i; j++ ) {
            f = d[ j ];
            V[ j * this.n + i ] = f;
            g = e[ j ] + V[ j * n + j ] * f;
            for ( k = j + 1; k <= i - 1; k++ ) {
              g += V[ k * n + j ] * d[ k ];
              e[ k ] += V[ k * n + j ] * f;
            }
            e[ j ] = g;
          }
          f = 0.0;
          for ( j = 0; j < i; j++ ) {
            e[ j ] /= h;
            f += e[ j ] * d[ j ];
          }
          var hh = f / (h + h);
          for ( j = 0; j < i; j++ ) {
            e[ j ] -= hh * d[ j ];
          }
          for ( j = 0; j < i; j++ ) {
            f = d[ j ];
            g = e[ j ];
            for ( k = j; k <= i - 1; k++ ) {
              V[ k * n + j ] -= (f * e[ k ] + g * d[ k ]);
            }
            d[ j ] = V[ (i - 1) * n + j ];
            V[ i * this.n + j ] = 0.0;
          }
        }
        d[ i ] = h;
      }

      // Accumulate transformations.

      for ( i = 0; i < n - 1; i++ ) {
        V[ (n - 1) * n + i ] = V[ i * n + i ];
        V[ i * n + i ] = 1.0;
        h = d[ i + 1 ];
        if ( h !== 0.0 ) {
          for ( k = 0; k <= i; k++ ) {
            d[ k ] = V[ k * n + (i + 1) ] / h;
          }
          for ( j = 0; j <= i; j++ ) {
            g = 0.0;
            for ( k = 0; k <= i; k++ ) {
              g += V[ k * n + (i + 1) ] * V[ k * n + j ];
            }
            for ( k = 0; k <= i; k++ ) {
              V[ k * n + j ] -= g * d[ k ];
            }
          }
        }
        for ( k = 0; k <= i; k++ ) {
          V[ k * n + (i + 1) ] = 0.0;
        }
      }
      for ( j = 0; j < n; j++ ) {
        d[ j ] = V[ (n - 1) * n + j ];
        V[ (n - 1) * n + j ] = 0.0;
      }
      V[ (n - 1) * n + (n - 1) ] = 1.0;
      e[ 0 ] = 0.0;
    },

    // Symmetric tridiagonal QL algorithm.
    tql2: function() {
      var n = this.n;
      var V = this.V;
      var d = this.d;
      var e = this.e;
      var i;
      var j;
      var k;
      var l;
      var g;
      var p;
      var iter;

      //  This is derived from the Algol procedures tql2, by
      //  Bowdler, Martin, Reinsch, and Wilkinson, Handbook for
      //  Auto. Comp., Vol.ii-Linear Algebra, and the corresponding
      //  Fortran subroutine in EISPACK.

      for ( i = 1; i < n; i++ ) {
        e[ i - 1 ] = e[ i ];
      }
      e[ n - 1 ] = 0.0;

      var f = 0.0;
      var tst1 = 0.0;
      var eps = Math.pow( 2.0, -52.0 );
      for ( l = 0; l < n; l++ ) {

        // Find small subdiagonal element

        tst1 = Math.max( tst1, Math.abs( d[ l ] ) + Math.abs( e[ l ] ) );
        var m = l;
        while ( m < n ) {
          if ( Math.abs( e[ m ] ) <= eps * tst1 ) {
            break;
          }
          m++;
        }

        // If m === l, d[l] is an eigenvalue,
        // otherwise, iterate.

        if ( m > l ) {
          iter = 0;
          do {
            iter = iter + 1;  // (Could check iteration count here.)

            // Compute implicit shift

            g = d[ l ];
            p = (d[ l + 1 ] - g) / (2.0 * e[ l ]);
            var r = dot.Matrix.hypot( p, 1.0 );
            if ( p < 0 ) {
              r = -r;
            }
            d[ l ] = e[ l ] / (p + r);
            d[ l + 1 ] = e[ l ] * (p + r);
            var dl1 = d[ l + 1 ];
            var h = g - d[ l ];
            for ( i = l + 2; i < n; i++ ) {
              d[ i ] -= h;
            }
            f = f + h;

            // Implicit QL transformation.

            p = d[ m ];
            var c = 1.0;
            var c2 = c;
            var c3 = c;
            var el1 = e[ l + 1 ];
            var s = 0.0;
            var s2 = 0.0;
            for ( i = m - 1; i >= l; i-- ) {
              c3 = c2;
              c2 = c;
              s2 = s;
              g = c * e[ i ];
              h = c * p;
              r = dot.Matrix.hypot( p, e[ i ] );
              e[ i + 1 ] = s * r;
              s = e[ i ] / r;
              c = p / r;
              p = c * d[ i ] - s * g;
              d[ i + 1 ] = h + s * (c * g + s * d[ i ]);

              // Accumulate transformation.

              for ( k = 0; k < n; k++ ) {
                h = V[ k * n + (i + 1) ];
                V[ k * n + (i + 1) ] = s * V[ k * n + i ] + c * h;
                V[ k * n + i ] = c * V[ k * n + i ] - s * h;
              }
            }
            p = -s * s2 * c3 * el1 * e[ l ] / dl1;
            e[ l ] = s * p;
            d[ l ] = c * p;

            // Check for convergence.

          } while ( Math.abs( e[ l ] ) > eps * tst1 );
        }
        d[ l ] = d[ l ] + f;
        e[ l ] = 0.0;
      }

      // Sort eigenvalues and corresponding vectors.

      for ( i = 0; i < n - 1; i++ ) {
        k = i;
        p = d[ i ];
        for ( j = i + 1; j < n; j++ ) {
          if ( d[ j ] < p ) {
            k = j;
            p = d[ j ];
          }
        }
        if ( k !== i ) {
          d[ k ] = d[ i ];
          d[ i ] = p;
          for ( j = 0; j < n; j++ ) {
            p = V[ j * this.n + i ];
            V[ j * this.n + i ] = V[ j * n + k ];
            V[ j * n + k ] = p;
          }
        }
      }
    },

    // Nonsymmetric reduction to Hessenberg form.
    orthes: function() {
      var n = this.n;
      var V = this.V;
      var H = this.H;
      var ort = this.ort;
      var i;
      var j;
      var m;
      var f;
      var g;

      //  This is derived from the Algol procedures orthes and ortran,
      //  by Martin and Wilkinson, Handbook for Auto. Comp.,
      //  Vol.ii-Linear Algebra, and the corresponding
      //  Fortran subroutines in EISPACK.

      var low = 0;
      var high = n - 1;

      for ( m = low + 1; m <= high - 1; m++ ) {

        // Scale column.

        var scale = 0.0;
        for ( i = m; i <= high; i++ ) {
          scale = scale + Math.abs( H[ i * n + (m - 1) ] );
        }
        if ( scale !== 0.0 ) {

          // Compute Householder transformation.

          var h = 0.0;
          for ( i = high; i >= m; i-- ) {
            ort[ i ] = H[ i * n + (m - 1) ] / scale;
            h += ort[ i ] * ort[ i ];
          }
          g = Math.sqrt( h );
          if ( ort[ m ] > 0 ) {
            g = -g;
          }
          h = h - ort[ m ] * g;
          ort[ m ] = ort[ m ] - g;

          // Apply Householder similarity transformation
          // H = (I-u*u'/h)*H*(I-u*u')/h)

          for ( j = m; j < n; j++ ) {
            f = 0.0;
            for ( i = high; i >= m; i-- ) {
              f += ort[ i ] * H[ i * this.n + j ];
            }
            f = f / h;
            for ( i = m; i <= high; i++ ) {
              H[ i * this.n + j ] -= f * ort[ i ];
            }
          }

          for ( i = 0; i <= high; i++ ) {
            f = 0.0;
            for ( j = high; j >= m; j-- ) {
              f += ort[ j ] * H[ i * this.n + j ];
            }
            f = f / h;
            for ( j = m; j <= high; j++ ) {
              H[ i * this.n + j ] -= f * ort[ j ];
            }
          }
          ort[ m ] = scale * ort[ m ];
          H[ m * n + (m - 1) ] = scale * g;
        }
      }

      // Accumulate transformations (Algol's ortran).

      for ( i = 0; i < n; i++ ) {
        for ( j = 0; j < n; j++ ) {
          V[ i * this.n + j ] = (i === j ? 1.0 : 0.0);
        }
      }

      for ( m = high - 1; m >= low + 1; m-- ) {
        if ( H[ m * n + (m - 1) ] !== 0.0 ) {
          for ( i = m + 1; i <= high; i++ ) {
            ort[ i ] = H[ i * n + (m - 1) ];
          }
          for ( j = m; j <= high; j++ ) {
            g = 0.0;
            for ( i = m; i <= high; i++ ) {
              g += ort[ i ] * V[ i * this.n + j ];
            }
            // Double division avoids possible underflow
            g = (g / ort[ m ]) / H[ m * n + (m - 1) ];
            for ( i = m; i <= high; i++ ) {
              V[ i * this.n + j ] += g * ort[ i ];
            }
          }
        }
      }
    },

    // Complex scalar division.
    cdiv: function( xr, xi, yr, yi ) {
      var r;
      var d;
      if ( Math.abs( yr ) > Math.abs( yi ) ) {
        r = yi / yr;
        d = yr + r * yi;
        this.cdivr = (xr + r * xi) / d;
        this.cdivi = (xi - r * xr) / d;
      }
      else {
        r = yr / yi;
        d = yi + r * yr;
        this.cdivr = (r * xr + xi) / d;
        this.cdivi = (r * xi - xr) / d;
      }
    },

    // Nonsymmetric reduction from Hessenberg to real Schur form.
    hqr2: function() {
      var n;
      var V = this.V;
      var d = this.d;
      var e = this.e;
      var H = this.H;
      var i;
      var j;
      var k;
      var l;
      var m;
      var iter;

      //  This is derived from the Algol procedure hqr2,
      //  by Martin and Wilkinson, Handbook for Auto. Comp.,
      //  Vol.ii-Linear Algebra, and the corresponding
      //  Fortran subroutine in EISPACK.

      // Initialize

      var nn = this.n;
      n = nn - 1;
      var low = 0;
      var high = nn - 1;
      var eps = Math.pow( 2.0, -52.0 );
      var exshift = 0.0;
      var p = 0;
      var q = 0;
      var r = 0;
      var s = 0;
      var z = 0;
      var t;
      var w;
      var x;
      var y;

      // Store roots isolated by balanc and compute matrix norm

      var norm = 0.0;
      for ( i = 0; i < nn; i++ ) {
        if ( i < low || i > high ) {
          d[ i ] = H[ i * n + i ];
          e[ i ] = 0.0;
        }
        for ( j = Math.max( i - 1, 0 ); j < nn; j++ ) {
          norm = norm + Math.abs( H[ i * this.n + j ] );
        }
      }

      // Outer loop over eigenvalue index

      iter = 0;
      while ( n >= low ) {

        // Look for single small sub-diagonal element

        l = n;
        while ( l > low ) {
          s = Math.abs( H[ (l - 1) * n + (l - 1) ] ) + Math.abs( H[ l * n + l ] );
          if ( s === 0.0 ) {
            s = norm;
          }
          if ( Math.abs( H[ l * n + (l - 1) ] ) < eps * s ) {
            break;
          }
          l--;
        }

        // Check for convergence
        // One root found

        if ( l === n ) {
          H[ n * n + n ] = H[ n * n + n ] + exshift;
          d[ n ] = H[ n * n + n ];
          e[ n ] = 0.0;
          n--;
          iter = 0;

          // Two roots found

        }
        else if ( l === n - 1 ) {
          w = H[ n * n + n - 1 ] * H[ (n - 1) * n + n ];
          p = (H[ (n - 1) * n + (n - 1) ] - H[ n * n + n ]) / 2.0;
          q = p * p + w;
          z = Math.sqrt( Math.abs( q ) );
          H[ n * n + n ] = H[ n * n + n ] + exshift;
          H[ (n - 1) * n + (n - 1) ] = H[ (n - 1) * n + (n - 1) ] + exshift;
          x = H[ n * n + n ];

          // Real pair

          if ( q >= 0 ) {
            if ( p >= 0 ) {
              z = p + z;
            }
            else {
              z = p - z;
            }
            d[ n - 1 ] = x + z;
            d[ n ] = d[ n - 1 ];
            if ( z !== 0.0 ) {
              d[ n ] = x - w / z;
            }
            e[ n - 1 ] = 0.0;
            e[ n ] = 0.0;
            x = H[ n * n + n - 1 ];
            s = Math.abs( x ) + Math.abs( z );
            p = x / s;
            q = z / s;
            r = Math.sqrt( p * p + q * q );
            p = p / r;
            q = q / r;

            // Row modification

            for ( j = n - 1; j < nn; j++ ) {
              z = H[ (n - 1) * n + j ];
              H[ (n - 1) * n + j ] = q * z + p * H[ n * n + j ];
              H[ n * n + j ] = q * H[ n * n + j ] - p * z;
            }

            // Column modification

            for ( i = 0; i <= n; i++ ) {
              z = H[ i * n + n - 1 ];
              H[ i * n + n - 1 ] = q * z + p * H[ i * n + n ];
              H[ i * n + n ] = q * H[ i * n + n ] - p * z;
            }

            // Accumulate transformations

            for ( i = low; i <= high; i++ ) {
              z = V[ i * n + n - 1 ];
              V[ i * n + n - 1 ] = q * z + p * V[ i * n + n ];
              V[ i * n + n ] = q * V[ i * n + n ] - p * z;
            }

            // Complex pair

          }
          else {
            d[ n - 1 ] = x + p;
            d[ n ] = x + p;
            e[ n - 1 ] = z;
            e[ n ] = -z;
          }
          n = n - 2;
          iter = 0;

          // No convergence yet

        }
        else {

          // Form shift

          x = H[ n * n + n ];
          y = 0.0;
          w = 0.0;
          if ( l < n ) {
            y = H[ (n - 1) * n + (n - 1) ];
            w = H[ n * n + n - 1 ] * H[ (n - 1) * n + n ];
          }

          // Wilkinson's original ad hoc shift

          if ( iter === 10 ) {
            exshift += x;
            for ( i = low; i <= n; i++ ) {
              H[ i * n + i ] -= x;
            }
            s = Math.abs( H[ n * n + n - 1 ] ) + Math.abs( H[ (n - 1) * n + n - 2 ] );
            x = y = 0.75 * s;
            w = -0.4375 * s * s;
          }

          // MATLAB's new ad hoc shift

          if ( iter === 30 ) {
            s = (y - x) / 2.0;
            s = s * s + w;
            if ( s > 0 ) {
              s = Math.sqrt( s );
              if ( y < x ) {
                s = -s;
              }
              s = x - w / ((y - x) / 2.0 + s);
              for ( i = low; i <= n; i++ ) {
                H[ i * n + i ] -= s;
              }
              exshift += s;
              x = y = w = 0.964;
            }
          }

          iter = iter + 1;   // (Could check iteration count here.)

          // Look for two consecutive small sub-diagonal elements

          m = n - 2;
          while ( m >= l ) {
            z = H[ m * n + m ];
            r = x - z;
            s = y - z;
            p = (r * s - w) / H[ (m + 1) * n + m ] + H[ m * n + m + 1 ];
            q = H[ (m + 1) * n + m + 1 ] - z - r - s;
            r = H[ (m + 2) * n + m + 1 ];
            s = Math.abs( p ) + Math.abs( q ) + Math.abs( r );
            p = p / s;
            q = q / s;
            r = r / s;
            if ( m === l ) {
              break;
            }
            if ( Math.abs( H[ m * n + (m - 1) ] ) * (Math.abs( q ) + Math.abs( r )) <
                 eps * (Math.abs( p ) * (Math.abs( H[ (m - 1) * n + m - 1 ] ) + Math.abs( z ) +
                                         Math.abs( H[ (m + 1) * n + m + 1 ] ))) ) {
              break;
            }
            m--;
          }

          for ( i = m + 2; i <= n; i++ ) {
            H[ i * n + i - 2 ] = 0.0;
            if ( i > m + 2 ) {
              H[ i * n + i - 3 ] = 0.0;
            }
          }

          // Double QR step involving rows l:n and columns m:n

          for ( k = m; k <= n - 1; k++ ) {
            var notlast = (k !== n - 1);
            if ( k !== m ) {
              p = H[ k * n + k - 1 ];
              q = H[ (k + 1) * n + k - 1 ];
              r = (notlast ? H[ (k + 2) * n + k - 1 ] : 0.0);
              x = Math.abs( p ) + Math.abs( q ) + Math.abs( r );
              if ( x !== 0.0 ) {
                p = p / x;
                q = q / x;
                r = r / x;
              }
            }
            if ( x === 0.0 ) {
              break;
            }
            s = Math.sqrt( p * p + q * q + r * r );
            if ( p < 0 ) {
              s = -s;
            }
            if ( s !== 0 ) {
              if ( k !== m ) {
                H[ k * n + k - 1 ] = -s * x;
              }
              else if ( l !== m ) {
                H[ k * n + k - 1 ] = -H[ k * n + k - 1 ];
              }
              p = p + s;
              x = p / s;
              y = q / s;
              z = r / s;
              q = q / p;
              r = r / p;

              // Row modification

              for ( j = k; j < nn; j++ ) {
                p = H[ k * n + j ] + q * H[ (k + 1) * n + j ];
                if ( notlast ) {
                  p = p + r * H[ (k + 2) * n + j ];
                  H[ (k + 2) * n + j ] = H[ (k + 2) * n + j ] - p * z;
                }
                H[ k * n + j ] = H[ k * n + j ] - p * x;
                H[ (k + 1) * n + j ] = H[ (k + 1) * n + j ] - p * y;
              }

              // Column modification

              for ( i = 0; i <= Math.min( n, k + 3 ); i++ ) {
                p = x * H[ i * n + k ] + y * H[ i * n + k + 1 ];
                if ( notlast ) {
                  p = p + z * H[ i * n + k + 2 ];
                  H[ i * n + k + 2 ] = H[ i * n + k + 2 ] - p * r;
                }
                H[ i * n + k ] = H[ i * n + k ] - p;
                H[ i * n + k + 1 ] = H[ i * n + k + 1 ] - p * q;
              }

              // Accumulate transformations

              for ( i = low; i <= high; i++ ) {
                p = x * V[ i * n + k ] + y * V[ i * n + k + 1 ];
                if ( notlast ) {
                  p = p + z * V[ i * n + k + 2 ];
                  V[ i * n + k + 2 ] = V[ i * n + k + 2 ] - p * r;
                }
                V[ i * n + k ] = V[ i * n + k ] - p;
                V[ i * n + k + 1 ] = V[ i * n + k + 1 ] - p * q;
              }
            }  // (s !== 0)
          }  // k loop
        }  // check convergence
      }  // while (n >= low)

      // Backsubstitute to find vectors of upper triangular form

      if ( norm === 0.0 ) {
        return;
      }

      for ( n = nn - 1; n >= 0; n-- ) {
        p = d[ n ];
        q = e[ n ];

        // Real vector

        if ( q === 0 ) {
          l = n;
          H[ n * n + n ] = 1.0;
          for ( i = n - 1; i >= 0; i-- ) {
            w = H[ i * n + i ] - p;
            r = 0.0;
            for ( j = l; j <= n; j++ ) {
              r = r + H[ i * this.n + j ] * H[ j * n + n ];
            }
            if ( e[ i ] < 0.0 ) {
              z = w;
              s = r;
            }
            else {
              l = i;
              if ( e[ i ] === 0.0 ) {
                if ( w !== 0.0 ) {
                  H[ i * n + n ] = -r / w;
                }
                else {
                  H[ i * n + n ] = -r / (eps * norm);
                }

                // Solve real equations

              }
              else {
                x = H[ i * n + i + 1 ];
                y = H[ (i + 1) * n + i ];
                q = (d[ i ] - p) * (d[ i ] - p) + e[ i ] * e[ i ];
                t = (x * s - z * r) / q;
                H[ i * n + n ] = t;
                if ( Math.abs( x ) > Math.abs( z ) ) {
                  H[ (i + 1) * n + n ] = (-r - w * t) / x;
                }
                else {
                  H[ (i + 1) * n + n ] = (-s - y * t) / z;
                }
              }

              // Overflow control

              t = Math.abs( H[ i * n + n ] );
              if ( (eps * t) * t > 1 ) {
                for ( j = i; j <= n; j++ ) {
                  H[ j * n + n ] = H[ j * n + n ] / t;
                }
              }
            }
          }

          // Complex vector

        }
        else if ( q < 0 ) {
          l = n - 1;

          // Last vector component imaginary so matrix is triangular

          if ( Math.abs( H[ n * n + n - 1 ] ) > Math.abs( H[ (n - 1) * n + n ] ) ) {
            H[ (n - 1) * n + (n - 1) ] = q / H[ n * n + n - 1 ];
            H[ (n - 1) * n + n ] = -(H[ n * n + n ] - p) / H[ n * n + n - 1 ];
          }
          else {
            this.cdiv( 0.0, -H[ (n - 1) * n + n ], H[ (n - 1) * n + (n - 1) ] - p, q );
            H[ (n - 1) * n + (n - 1) ] = this.cdivr;
            H[ (n - 1) * n + n ] = this.cdivi;
          }
          H[ n * n + n - 1 ] = 0.0;
          H[ n * n + n ] = 1.0;
          for ( i = n - 2; i >= 0; i-- ) {
            var ra;
            var sa;
            var vr;
            var vi;
            ra = 0.0;
            sa = 0.0;
            for ( j = l; j <= n; j++ ) {
              ra = ra + H[ i * this.n + j ] * H[ j * n + n - 1 ];
              sa = sa + H[ i * this.n + j ] * H[ j * n + n ];
            }
            w = H[ i * n + i ] - p;

            if ( e[ i ] < 0.0 ) {
              z = w;
              r = ra;
              s = sa;
            }
            else {
              l = i;
              if ( e[ i ] === 0 ) {
                this.cdiv( -ra, -sa, w, q );
                H[ i * n + n - 1 ] = this.cdivr;
                H[ i * n + n ] = this.cdivi;
              }
              else {

                // Solve complex equations

                x = H[ i * n + i + 1 ];
                y = H[ (i + 1) * n + i ];
                vr = (d[ i ] - p) * (d[ i ] - p) + e[ i ] * e[ i ] - q * q;
                vi = (d[ i ] - p) * 2.0 * q;
                if ( vr === 0.0 && vi === 0.0 ) {
                  vr = eps * norm * (Math.abs( w ) + Math.abs( q ) +
                                     Math.abs( x ) + Math.abs( y ) + Math.abs( z ));
                }
                this.cdiv( x * r - z * ra + q * sa, x * s - z * sa - q * ra, vr, vi );
                H[ i * n + n - 1 ] = this.cdivr;
                H[ i * n + n ] = this.cdivi;
                if ( Math.abs( x ) > (Math.abs( z ) + Math.abs( q )) ) {
                  H[ (i + 1) * n + n - 1 ] = (-ra - w * H[ i * n + n - 1 ] + q * H[ i * n + n ]) / x;
                  H[ (i + 1) * n + n ] = (-sa - w * H[ i * n + n ] - q * H[ i * n + n - 1 ]) / x;
                }
                else {
                  this.cdiv( -r - y * H[ i * n + n - 1 ], -s - y * H[ i * n + n ], z, q );
                  H[ (i + 1) * n + n - 1 ] = this.cdivr;
                  H[ (i + 1) * n + n ] = this.cdivi;
                }
              }

              // Overflow control
              t = Math.max( Math.abs( H[ i * n + n - 1 ] ), Math.abs( H[ i * n + n ] ) );
              if ( (eps * t) * t > 1 ) {
                for ( j = i; j <= n; j++ ) {
                  H[ j * n + n - 1 ] = H[ j * n + n - 1 ] / t;
                  H[ j * n + n ] = H[ j * n + n ] / t;
                }
              }
            }
          }
        }
      }

      // Vectors of isolated roots
      for ( i = 0; i < nn; i++ ) {
        if ( i < low || i > high ) {
          for ( j = i; j < nn; j++ ) {
            V[ i * this.n + j ] = H[ i * this.n + j ];
          }
        }
      }

      // Back transformation to get eigenvectors of original matrix
      for ( j = nn - 1; j >= low; j-- ) {
        for ( i = low; i <= high; i++ ) {
          z = 0.0;
          for ( k = low; k <= Math.min( j, high ); k++ ) {
            z = z + V[ i * n + k ] * H[ k * n + j ];
          }
          V[ i * this.n + j ] = z;
        }
      }
    }
  };

  return EigenvalueDecomposition;
} );

// Copyright 2013-2014, University of Colorado Boulder

/**
 * Function for doing a linear mapping between two domains ('a' and 'b').
 * <p>
 * Example usage:
 * <code>
 * var f = new dot.LinearFunction( 0, 100, 0, 200 );
 * f( 50 ); // 100
 * f.inverse( 100 ); // 50
 * </code>
 *
 * @author Chris Malley (PixelZoom, Inc.)
 */
define( 'DOT/LinearFunction',['require','DOT/dot','DOT/Util'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  // modules
  require( 'DOT/Util' );

  /**
   * @param {Number} a1
   * @param {Number} a2
   * @param {Number} b1
   * @param {Number} b2
   * @param {Boolean} clamp clamp the result to the provided ranges, false by default
   * @constructor
   */
  function LinearFunction( a1, a2, b1, b2, clamp ) {

    clamp = _.isUndefined( clamp ) ? false : clamp;

    /*
     * Linearly interpolate two points and evaluate the line equation for a third point.
     * f( a1 ) = b1, f( a2 ) = b2, f( a3 ) = <linear mapped value>
     * Optionally clamp the result to the range [b1,b2].
     */
    var map = function( a1, a2, b1, b2, a3, clamp ) {
      var b3 = dot.Util.linear( a1, a2, b1, b2, a3 );
      if ( clamp ) {
        var max = Math.max( b1, b2 );
        var min = Math.min( b1, b2 );
        b3 = dot.Util.clamp( b3, min, max );
      }
      return b3;
    };

    // Maps from a to b.
    var evaluate = function( a3 ) {
      return map( a1, a2, b1, b2, a3, clamp );
    };

    // Maps from b to a.
    evaluate.inverse = function( b3 ) {
      return map( b1, b2, a1, a2, b3, clamp );
    };

    return evaluate; // return the evaluation function, so we use sites look like: f(a) f.inverse(b)
  }

  dot.register( 'LinearFunction', LinearFunction );

  return LinearFunction;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * LU decomposition, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/LUDecomposition',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var Float32Array = window.Float32Array || Array;

  // require( 'DOT/Matrix' ); // commented out so Require.js doesn't complain about the circular dependency

  function LUDecomposition( matrix ) {
    var i;
    var j;
    var k;

    this.matrix = matrix;

    // TODO: size!
    this.LU = matrix.getArrayCopy();
    var LU = this.LU;
    this.m = matrix.getRowDimension();
    var m = this.m;
    this.n = matrix.getColumnDimension();
    var n = this.n;
    this.piv = new Uint32Array( m );
    for ( i = 0; i < m; i++ ) {
      this.piv[ i ] = i;
    }
    this.pivsign = 1;
    var LUcolj = new Float32Array( m );

    // Outer loop.

    for ( j = 0; j < n; j++ ) {

      // Make a copy of the j-th column to localize references.
      for ( i = 0; i < m; i++ ) {
        LUcolj[ i ] = LU[ matrix.index( i, j ) ];
      }

      // Apply previous transformations.

      for ( i = 0; i < m; i++ ) {
        // Most of the time is spent in the following dot product.
        var kmax = Math.min( i, j );
        var s = 0.0;
        for ( k = 0; k < kmax; k++ ) {
          var ik = matrix.index( i, k );
          s += LU[ ik ] * LUcolj[ k ];
        }

        LUcolj[ i ] -= s;
        LU[ matrix.index( i, j ) ] = LUcolj[ i ];
      }

      // Find pivot and exchange if necessary.

      var p = j;
      for ( i = j + 1; i < m; i++ ) {
        if ( Math.abs( LUcolj[ i ] ) > Math.abs( LUcolj[ p ] ) ) {
          p = i;
        }
      }
      if ( p !== j ) {
        for ( k = 0; k < n; k++ ) {
          var pk = matrix.index( p, k );
          var jk = matrix.index( j, k );
          var t = LU[ pk ];
          LU[ pk ] = LU[ jk ];
          LU[ jk ] = t;
        }
        k = this.piv[ p ];
        this.piv[ p ] = this.piv[ j ];
        this.piv[ j ] = k;
        this.pivsign = -this.pivsign;
      }

      // Compute multipliers.

      if ( j < m && LU[ this.matrix.index( j, j ) ] !== 0.0 ) {
        for ( i = j + 1; i < m; i++ ) {
          LU[ matrix.index( i, j ) ] /= LU[ matrix.index( j, j ) ];
        }
      }
    }
  }

  dot.register( 'LUDecomposition', LUDecomposition );

  LUDecomposition.prototype = {
    constructor: LUDecomposition,

    isNonsingular: function() {
      for ( var j = 0; j < this.n; j++ ) {
        var index = this.matrix.index( j, j );
        if ( this.LU[ index ] === 0 ) {
          return false;
        }
      }
      return true;
    },

    getL: function() {
      var result = new dot.Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          if ( i > j ) {
            result.entries[ result.index( i, j ) ] = this.LU[ this.matrix.index( i, j ) ];
          }
          else if ( i === j ) {
            result.entries[ result.index( i, j ) ] = 1.0;
          }
          else {
            result.entries[ result.index( i, j ) ] = 0.0;
          }
        }
      }
      return result;
    },

    getU: function() {
      var result = new dot.Matrix( this.n, this.n );
      for ( var i = 0; i < this.n; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          if ( i <= j ) {
            result.entries[ result.index( i, j ) ] = this.LU[ this.matrix.index( i, j ) ];
          }
          else {
            result.entries[ result.index( i, j ) ] = 0.0;
          }
        }
      }
      return result;
    },

    getPivot: function() {
      var p = new Uint32Array( this.m );
      for ( var i = 0; i < this.m; i++ ) {
        p[ i ] = this.piv[ i ];
      }
      return p;
    },

    getDoublePivot: function() {
      var vals = new Float32Array( this.m );
      for ( var i = 0; i < this.m; i++ ) {
        vals[ i ] = this.piv[ i ];
      }
      return vals;
    },

    det: function() {
      if ( this.m !== this.n ) {
        throw new Error( 'Matrix must be square.' );
      }
      var d = this.pivsign;
      for ( var j = 0; j < this.n; j++ ) {
        d *= this.LU[ this.matrix.index( j, j ) ];
      }
      return d;
    },

    solve: function( matrix ) {
      var i;
      var j;
      var k;
      if ( matrix.getRowDimension() !== this.m ) {
        throw new Error( 'Matrix row dimensions must agree.' );
      }
      if ( !this.isNonsingular() ) {
        throw new Error( 'Matrix is singular.' );
      }

      // Copy right hand side with pivoting
      var nx = matrix.getColumnDimension();
      var Xmat = matrix.getArrayRowMatrix( this.piv, 0, nx - 1 );

      // Solve L*Y = B(piv,:)
      for ( k = 0; k < this.n; k++ ) {
        for ( i = k + 1; i < this.n; i++ ) {
          for ( j = 0; j < nx; j++ ) {
            Xmat.entries[ Xmat.index( i, j ) ] -= Xmat.entries[ Xmat.index( k, j ) ] * this.LU[ this.matrix.index( i, k ) ];
          }
        }
      }

      // Solve U*X = Y;
      for ( k = this.n - 1; k >= 0; k-- ) {
        for ( j = 0; j < nx; j++ ) {
          Xmat.entries[ Xmat.index( k, j ) ] /= this.LU[ this.matrix.index( k, k ) ];
        }
        for ( i = 0; i < k; i++ ) {
          for ( j = 0; j < nx; j++ ) {
            Xmat.entries[ Xmat.index( i, j ) ] -= Xmat.entries[ Xmat.index( k, j ) ] * this.LU[ this.matrix.index( i, k ) ];
          }
        }
      }
      return Xmat;
    }
  };

  return LUDecomposition;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Tests whether a reference is to an array.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/isArray',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  function isArray( array ) {
    // yes, this is actually how to do this. see http://stackoverflow.com/questions/4775722/javascript-check-if-object-is-array
    return Object.prototype.toString.call( array ) === '[object Array]';
  }

  phetCore.register( 'isArray', isArray );

  return isArray;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * SVD decomposition, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/SingularValueDecomposition',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var Float32Array = window.Float32Array || Array;

  // require( 'DOT/Matrix' ); // commented out so Require.js doesn't complain about the circular dependency

  function SingularValueDecomposition( matrix ) {
    this.matrix = matrix;

    var Arg = matrix;

    // Derived from LINPACK code.
    // Initialize.
    var A = Arg.getArrayCopy();
    this.m = Arg.getRowDimension();
    this.n = Arg.getColumnDimension();
    var m = this.m;
    var n = this.n;

    var min = Math.min;
    var max = Math.max;
    var pow = Math.pow;
    var abs = Math.abs;

    /* Apparently the failing cases are only a proper subset of (m<n),
     so let's not throw error.  Correct fix to come later?
     if (m<n) {
     throw new IllegalArgumentException("Jama SVD only works for m >= n"); }
     */
    var nu = min( m, n );
    this.s = new Float32Array( min( m + 1, n ) );
    var s = this.s;
    this.U = new Float32Array( m * nu );
    var U = this.U;
    this.V = new Float32Array( n * n );
    var V = this.V;
    var e = new Float32Array( n );
    var work = new Float32Array( m );
    var wantu = true;
    var wantv = true;

    var i;
    var j;
    var k;
    var t;
    var f;

    var cs;
    var sn;

    var hypot = dot.Matrix.hypot;

    // Reduce A to bidiagonal form, storing the diagonal elements
    // in s and the super-diagonal elements in e.

    var nct = min( m - 1, n );
    var nrt = max( 0, min( n - 2, m ) );
    for ( k = 0; k < max( nct, nrt ); k++ ) {
      if ( k < nct ) {

        // Compute the transformation for the k-th column and
        // place the k-th diagonal in s[k].
        // Compute 2-norm of k-th column without under/overflow.
        s[ k ] = 0;
        for ( i = k; i < m; i++ ) {
          s[ k ] = hypot( s[ k ], A[ i * n + k ] );
        }
        if ( s[ k ] !== 0.0 ) {
          if ( A[ k * n + k ] < 0.0 ) {
            s[ k ] = -s[ k ];
          }
          for ( i = k; i < m; i++ ) {
            A[ i * n + k ] /= s[ k ];
          }
          A[ k * n + k ] += 1.0;
        }
        s[ k ] = -s[ k ];
      }
      for ( j = k + 1; j < n; j++ ) {
        if ( (k < nct) && (s[ k ] !== 0.0) ) {

          // Apply the transformation.

          t = 0;
          for ( i = k; i < m; i++ ) {
            t += A[ i * n + k ] * A[ i * n + j ];
          }
          t = -t / A[ k * n + k ];
          for ( i = k; i < m; i++ ) {
            A[ i * n + j ] += t * A[ i * n + k ];
          }
        }

        // Place the k-th row of A into e for the
        // subsequent calculation of the row transformation.

        e[ j ] = A[ k * n + j ];
      }
      if ( wantu && (k < nct) ) {

        // Place the transformation in U for subsequent back
        // multiplication.

        for ( i = k; i < m; i++ ) {
          U[ i * nu + k ] = A[ i * n + k ];
        }
      }
      if ( k < nrt ) {

        // Compute the k-th row transformation and place the
        // k-th super-diagonal in e[k].
        // Compute 2-norm without under/overflow.
        e[ k ] = 0;
        for ( i = k + 1; i < n; i++ ) {
          e[ k ] = hypot( e[ k ], e[ i ] );
        }
        if ( e[ k ] !== 0.0 ) {
          if ( e[ k + 1 ] < 0.0 ) {
            e[ k ] = -e[ k ];
          }
          for ( i = k + 1; i < n; i++ ) {
            e[ i ] /= e[ k ];
          }
          e[ k + 1 ] += 1.0;
        }
        e[ k ] = -e[ k ];
        if ( (k + 1 < m) && (e[ k ] !== 0.0) ) {

          // Apply the transformation.

          for ( i = k + 1; i < m; i++ ) {
            work[ i ] = 0.0;
          }
          for ( j = k + 1; j < n; j++ ) {
            for ( i = k + 1; i < m; i++ ) {
              work[ i ] += e[ j ] * A[ i * n + j ];
            }
          }
          for ( j = k + 1; j < n; j++ ) {
            t = -e[ j ] / e[ k + 1 ];
            for ( i = k + 1; i < m; i++ ) {
              A[ i * n + j ] += t * work[ i ];
            }
          }
        }
        if ( wantv ) {

          // Place the transformation in V for subsequent
          // back multiplication.

          for ( i = k + 1; i < n; i++ ) {
            V[ i * n + k ] = e[ i ];
          }
        }
      }
    }

    // Set up the final bidiagonal matrix or order p.

    var p = min( n, m + 1 );
    if ( nct < n ) {
      s[ nct ] = A[ nct * n + nct ];
    }
    if ( m < p ) {
      s[ p - 1 ] = 0.0;
    }
    if ( nrt + 1 < p ) {
      e[ nrt ] = A[ nrt * n + p - 1 ];
    }
    e[ p - 1 ] = 0.0;

    // If required, generate U.

    if ( wantu ) {
      for ( j = nct; j < nu; j++ ) {
        for ( i = 0; i < m; i++ ) {
          U[ i * nu + j ] = 0.0;
        }
        U[ j * nu + j ] = 1.0;
      }
      for ( k = nct - 1; k >= 0; k-- ) {
        if ( s[ k ] !== 0.0 ) {
          for ( j = k + 1; j < nu; j++ ) {
            t = 0;
            for ( i = k; i < m; i++ ) {
              t += U[ i * nu + k ] * U[ i * nu + j ];
            }
            t = -t / U[ k * nu + k ];
            for ( i = k; i < m; i++ ) {
              U[ i * nu + j ] += t * U[ i * nu + k ];
            }
          }
          for ( i = k; i < m; i++ ) {
            U[ i * nu + k ] = -U[ i * nu + k ];
          }
          U[ k * nu + k ] = 1.0 + U[ k * nu + k ];
          for ( i = 0; i < k - 1; i++ ) {
            U[ i * nu + k ] = 0.0;
          }
        }
        else {
          for ( i = 0; i < m; i++ ) {
            U[ i * nu + k ] = 0.0;
          }
          U[ k * nu + k ] = 1.0;
        }
      }
    }

    // If required, generate V.

    if ( wantv ) {
      for ( k = n - 1; k >= 0; k-- ) {
        if ( (k < nrt) && (e[ k ] !== 0.0) ) {
          for ( j = k + 1; j < nu; j++ ) {
            t = 0;
            for ( i = k + 1; i < n; i++ ) {
              t += V[ i * n + k ] * V[ i * n + j ];
            }
            t = -t / V[ (k + 1) * n + k ];
            for ( i = k + 1; i < n; i++ ) {
              V[ i * n + j ] += t * V[ i * n + k ];
            }
          }
        }
        for ( i = 0; i < n; i++ ) {
          V[ i * n + k ] = 0.0;
        }
        V[ k * n + k ] = 1.0;
      }
    }

    // Main iteration loop for the singular values.

    var pp = p - 1;
    var iter = 0;
    var eps = pow( 2.0, -52.0 );
    var tiny = pow( 2.0, -966.0 );
    while ( p > 0 ) {
      var kase;

      // Here is where a test for too many iterations would go.
      if ( iter > 500 ) {
        break;
      }

      // This section of the program inspects for
      // negligible elements in the s and e arrays.  On
      // completion the variables kase and k are set as follows.

      // kase = 1   if s(p) and e[k-1] are negligible and k<p
      // kase = 2   if s(k) is negligible and k<p
      // kase = 3   if e[k-1] is negligible, k<p, and
      //        s(k), ..., s(p) are not negligible (qr step).
      // kase = 4   if e(p-1) is negligible (convergence).

      for ( k = p - 2; k >= -1; k-- ) {
        if ( k === -1 ) {
          break;
        }
        if ( abs( e[ k ] ) <=
             tiny + eps * (abs( s[ k ] ) + abs( s[ k + 1 ] )) ) {
          e[ k ] = 0.0;
          break;
        }
      }
      if ( k === p - 2 ) {
        kase = 4;
      }
      else {
        var ks;
        for ( ks = p - 1; ks >= k; ks-- ) {
          if ( ks === k ) {
            break;
          }
          t = (ks !== p ? abs( e[ ks ] ) : 0) +
              (ks !== k + 1 ? abs( e[ ks - 1 ] ) : 0);
          if ( abs( s[ ks ] ) <= tiny + eps * t ) {
            s[ ks ] = 0.0;
            break;
          }
        }
        if ( ks === k ) {
          kase = 3;
        }
        else if ( ks === p - 1 ) {
          kase = 1;
        }
        else {
          kase = 2;
          k = ks;
        }
      }
      k++;

      // Perform the task indicated by kase.

      switch( kase ) {

        // Deflate negligible s(p).

        case 1:
        {
          f = e[ p - 2 ];
          e[ p - 2 ] = 0.0;
          for ( j = p - 2; j >= k; j-- ) {
            t = hypot( s[ j ], f );
            cs = s[ j ] / t;
            sn = f / t;
            s[ j ] = t;
            if ( j !== k ) {
              f = -sn * e[ j - 1 ];
              e[ j - 1 ] = cs * e[ j - 1 ];
            }
            if ( wantv ) {
              for ( i = 0; i < n; i++ ) {
                t = cs * V[ i * n + j ] + sn * V[ i * n + p - 1 ];
                V[ i * n + p - 1 ] = -sn * V[ i * n + j ] + cs * V[ i * n + p - 1 ];
                V[ i * n + j ] = t;
              }
            }
          }
        }
          break;

        // Split at negligible s(k).

        case 2:
        {
          f = e[ k - 1 ];
          e[ k - 1 ] = 0.0;
          for ( j = k; j < p; j++ ) {
            t = hypot( s[ j ], f );
            cs = s[ j ] / t;
            sn = f / t;
            s[ j ] = t;
            f = -sn * e[ j ];
            e[ j ] = cs * e[ j ];
            if ( wantu ) {
              for ( i = 0; i < m; i++ ) {
                t = cs * U[ i * nu + j ] + sn * U[ i * nu + k - 1 ];
                U[ i * nu + k - 1 ] = -sn * U[ i * nu + j ] + cs * U[ i * nu + k - 1 ];
                U[ i * nu + j ] = t;
              }
            }
          }
        }
          break;

        // Perform one qr step.

        case 3:
        {

          // Calculate the shift.

          var scale = max( max( max( max( abs( s[ p - 1 ] ), abs( s[ p - 2 ] ) ), abs( e[ p - 2 ] ) ), abs( s[ k ] ) ), abs( e[ k ] ) );
          var sp = s[ p - 1 ] / scale;
          var spm1 = s[ p - 2 ] / scale;
          var epm1 = e[ p - 2 ] / scale;
          var sk = s[ k ] / scale;
          var ek = e[ k ] / scale;
          var b = ((spm1 + sp) * (spm1 - sp) + epm1 * epm1) / 2.0;
          var c = (sp * epm1) * (sp * epm1);
          var shift = 0.0;
          if ( (b !== 0.0) || (c !== 0.0) ) {
            shift = Math.sqrt( b * b + c );
            if ( b < 0.0 ) {
              shift = -shift;
            }
            shift = c / (b + shift);
          }
          f = (sk + sp) * (sk - sp) + shift;
          var g = sk * ek;

          // Chase zeros.

          for ( j = k; j < p - 1; j++ ) {
            t = hypot( f, g );
            cs = f / t;
            sn = g / t;
            if ( j !== k ) {
              e[ j - 1 ] = t;
            }
            f = cs * s[ j ] + sn * e[ j ];
            e[ j ] = cs * e[ j ] - sn * s[ j ];
            g = sn * s[ j + 1 ];
            s[ j + 1 ] = cs * s[ j + 1 ];
            if ( wantv ) {
              for ( i = 0; i < n; i++ ) {
                t = cs * V[ i * n + j ] + sn * V[ i * n + j + 1 ];
                V[ i * n + j + 1 ] = -sn * V[ i * n + j ] + cs * V[ i * n + j + 1 ];
                V[ i * n + j ] = t;
              }
            }
            t = hypot( f, g );
            cs = f / t;
            sn = g / t;
            s[ j ] = t;
            f = cs * e[ j ] + sn * s[ j + 1 ];
            s[ j + 1 ] = -sn * e[ j ] + cs * s[ j + 1 ];
            g = sn * e[ j + 1 ];
            e[ j + 1 ] = cs * e[ j + 1 ];
            if ( wantu && (j < m - 1) ) {
              for ( i = 0; i < m; i++ ) {
                t = cs * U[ i * nu + j ] + sn * U[ i * nu + j + 1 ];
                U[ i * nu + j + 1 ] = -sn * U[ i * nu + j ] + cs * U[ i * nu + j + 1 ];
                U[ i * nu + j ] = t;
              }
            }
          }
          e[ p - 2 ] = f;
          iter = iter + 1;
        }
          break;

        // Convergence.

        case 4:
        {

          // Make the singular values positive.

          if ( s[ k ] <= 0.0 ) {
            s[ k ] = (s[ k ] < 0.0 ? -s[ k ] : 0.0);
            if ( wantv ) {
              for ( i = 0; i <= pp; i++ ) {
                V[ i * n + k ] = -V[ i * n + k ];
              }
            }
          }

          // Order the singular values.

          while ( k < pp ) {
            if ( s[ k ] >= s[ k + 1 ] ) {
              break;
            }
            t = s[ k ];
            s[ k ] = s[ k + 1 ];
            s[ k + 1 ] = t;
            if ( wantv && (k < n - 1) ) {
              for ( i = 0; i < n; i++ ) {
                t = V[ i * n + k + 1 ];
                V[ i * n + k + 1 ] = V[ i * n + k ];
                V[ i * n + k ] = t;
              }
            }
            if ( wantu && (k < m - 1) ) {
              for ( i = 0; i < m; i++ ) {
                t = U[ i * nu + k + 1 ];
                U[ i * nu + k + 1 ] = U[ i * nu + k ];
                U[ i * nu + k ] = t;
              }
            }
            k++;
          }
          iter = 0;
          p--;
        }
          break;
      }
    }
  }

  dot.register( 'SingularValueDecomposition', SingularValueDecomposition );

  SingularValueDecomposition.prototype = {
    constructor: SingularValueDecomposition,

    getU: function() {
      return new dot.Matrix( this.m, Math.min( this.m + 1, this.n ), this.U, true ); // the "fast" flag added, since U is Float32Array
    },

    getV: function() {
      return new dot.Matrix( this.n, this.n, this.V, true );
    },

    getSingularValues: function() {
      return this.s;
    },

    getS: function() {
      var result = new dot.Matrix( this.n, this.n );
      for ( var i = 0; i < this.n; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          result.entries[ result.index( i, j ) ] = 0.0;
        }
        result.entries[ result.index( i, i ) ] = this.s[ i ];
      }
      return result;
    },

    norm2: function() {
      return this.s[ 0 ];
    },

    cond: function() {
      return this.s[ 0 ] / this.s[ Math.min( this.m, this.n ) - 1 ];
    },

    rank: function() {
      // changed to 23 from 52 (bits of mantissa), since we are using floats here!
      var eps = Math.pow( 2.0, -23.0 );
      var tol = Math.max( this.m, this.n ) * this.s[ 0 ] * eps;
      var r = 0;
      for ( var i = 0; i < this.s.length; i++ ) {
        if ( this.s[ i ] > tol ) {
          r++;
        }
      }
      return r;
    }
  };

  return SingularValueDecomposition;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * QR decomposition, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/QRDecomposition',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var Float32Array = window.Float32Array || Array;

  // require( 'DOT/Matrix' ); // commented out so Require.js doesn't complain about the circular dependency

  dot.QRDecomposition = function QRDecomposition( matrix ) {
    this.matrix = matrix;

    // TODO: size!
    this.QR = matrix.getArrayCopy();
    var QR = this.QR;
    this.m = matrix.getRowDimension();
    var m = this.m;
    this.n = matrix.getColumnDimension();
    var n = this.n;

    this.Rdiag = new Float32Array( n );

    var i;
    var j;
    var k;

    // Main loop.
    for ( k = 0; k < n; k++ ) {
      // Compute 2-norm of k-th column without under/overflow.
      var nrm = 0;
      for ( i = k; i < m; i++ ) {
        nrm = dot.Matrix.hypot( nrm, QR[ this.matrix.index( i, k ) ] );
      }

      if ( nrm !== 0.0 ) {
        // Form k-th Householder vector.
        if ( QR[ this.matrix.index( k, k ) ] < 0 ) {
          nrm = -nrm;
        }
        for ( i = k; i < m; i++ ) {
          QR[ this.matrix.index( i, k ) ] /= nrm;
        }
        QR[ this.matrix.index( k, k ) ] += 1.0;

        // Apply transformation to remaining columns.
        for ( j = k + 1; j < n; j++ ) {
          var s = 0.0;
          for ( i = k; i < m; i++ ) {
            s += QR[ this.matrix.index( i, k ) ] * QR[ this.matrix.index( i, j ) ];
          }
          s = -s / QR[ this.matrix.index( k, k ) ];
          for ( i = k; i < m; i++ ) {
            QR[ this.matrix.index( i, j ) ] += s * QR[ this.matrix.index( i, k ) ];
          }
        }
      }
      this.Rdiag[ k ] = -nrm;
    }
  };
  var QRDecomposition = dot.QRDecomposition;

  QRDecomposition.prototype = {
    constructor: QRDecomposition,

    isFullRank: function() {
      for ( var j = 0; j < this.n; j++ ) {
        if ( this.Rdiag[ j ] === 0 ) {
          return false;
        }
      }
      return true;
    },

    getH: function() {
      var result = new dot.Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          if ( i >= j ) {
            result.entries[ result.index( i, j ) ] = this.QR[ this.matrix.index( i, j ) ];
          }
          else {
            result.entries[ result.index( i, j ) ] = 0.0;
          }
        }
      }
      return result;
    },

    getR: function() {
      var result = new dot.Matrix( this.n, this.n );
      for ( var i = 0; i < this.n; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          if ( i < j ) {
            result.entries[ result.index( i, j ) ] = this.QR[ this.matrix.index( i, j ) ];
          }
          else if ( i === j ) {
            result.entries[ result.index( i, j ) ] = this.Rdiag[ i ];
          }
          else {
            result.entries[ result.index( i, j ) ] = 0.0;
          }
        }
      }
      return result;
    },

    getQ: function() {
      var i;
      var j;
      var k;
      var result = new dot.Matrix( this.m, this.n );
      for ( k = this.n - 1; k >= 0; k-- ) {
        for ( i = 0; i < this.m; i++ ) {
          result.entries[ result.index( i, k ) ] = 0.0;
        }
        result.entries[ result.index( k, k ) ] = 1.0;
        for ( j = k; j < this.n; j++ ) {
          if ( this.QR[ this.matrix.index( k, k ) ] !== 0 ) {
            var s = 0.0;
            for ( i = k; i < this.m; i++ ) {
              s += this.QR[ this.matrix.index( i, k ) ] * result.entries[ result.index( i, j ) ];
            }
            s = -s / this.QR[ this.matrix.index( k, k ) ];
            for ( i = k; i < this.m; i++ ) {
              result.entries[ result.index( i, j ) ] += s * this.QR[ this.matrix.index( i, k ) ];
            }
          }
        }
      }
      return result;
    },

    solve: function( matrix ) {
      if ( matrix.getRowDimension() !== this.m ) {
        throw new Error( 'Matrix row dimensions must agree.' );
      }
      if ( !this.isFullRank() ) {
        throw new Error( 'Matrix is rank deficient.' );
      }

      var i;
      var j;
      var k;

      // Copy right hand side
      var nx = matrix.getColumnDimension();
      var X = matrix.getArrayCopy();

      // Compute Y = transpose(Q)*matrix
      for ( k = 0; k < this.n; k++ ) {
        for ( j = 0; j < nx; j++ ) {
          var s = 0.0;
          for ( i = k; i < this.m; i++ ) {
            s += this.QR[ this.matrix.index( i, k ) ] * X[ matrix.index( i, j ) ];
          }
          s = -s / this.QR[ this.matrix.index( k, k ) ];
          for ( i = k; i < this.m; i++ ) {
            X[ matrix.index( i, j ) ] += s * this.QR[ this.matrix.index( i, k ) ];
          }
        }
      }

      // Solve R*X = Y;
      for ( k = this.n - 1; k >= 0; k-- ) {
        for ( j = 0; j < nx; j++ ) {
          X[ matrix.index( k, j ) ] /= this.Rdiag[ k ];
        }
        for ( i = 0; i < k; i++ ) {
          for ( j = 0; j < nx; j++ ) {
            X[ matrix.index( i, j ) ] -= X[ matrix.index( k, j ) ] * this.QR[ this.matrix.index( i, k ) ];
          }
        }
      }
      return new dot.Matrix( this.n, nx, X, true ).getMatrix( 0, this.n - 1, 0, nx - 1 );
    }
  };

  return QRDecomposition;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Arbitrary-dimensional matrix, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Matrix',['require','DOT/dot','PHET_CORE/isArray','DOT/SingularValueDecomposition','DOT/LUDecomposition','DOT/QRDecomposition','DOT/EigenvalueDecomposition','DOT/Vector2','DOT/Vector3','DOT/Vector4'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var Float32Array = window.Float32Array || Array;

  var isArray = require( 'PHET_CORE/isArray' );

  require( 'DOT/SingularValueDecomposition' );
  require( 'DOT/LUDecomposition' );
  require( 'DOT/QRDecomposition' );
  require( 'DOT/EigenvalueDecomposition' );
  require( 'DOT/Vector2' );
  require( 'DOT/Vector3' );
  require( 'DOT/Vector4' );

  function Matrix( m, n, filler, fast ) {
    this.m = m;
    this.n = n;

    var size = m * n;
    this.size = size;
    var i;

    if ( fast ) {
      this.entries = filler;
    }
    else {
      if ( !filler ) {
        filler = 0;
      }

      // entries stored in row-major format
      this.entries = new Float32Array( size );

      if ( isArray( filler ) ) {
        assert && assert( filler.length === size );

        for ( i = 0; i < size; i++ ) {
          this.entries[ i ] = filler[ i ];
        }
      }
      else {
        for ( i = 0; i < size; i++ ) {
          this.entries[ i ] = filler;
        }
      }
    }
  }

  dot.register( 'Matrix', Matrix );

  /** sqrt(a^2 + b^2) without under/overflow. **/
  Matrix.hypot = function hypot( a, b ) {
    var r;
    if ( Math.abs( a ) > Math.abs( b ) ) {
      r = b / a;
      r = Math.abs( a ) * Math.sqrt( 1 + r * r );
    }
    else if ( b !== 0 ) {
      r = a / b;
      r = Math.abs( b ) * Math.sqrt( 1 + r * r );
    }
    else {
      r = 0.0;
    }
    return r;
  };

  Matrix.prototype = {
    constructor: Matrix,

    copy: function() {
      var result = new Matrix( this.m, this.n );
      for ( var i = 0; i < this.size; i++ ) {
        result.entries[ i ] = this.entries[ i ];
      }
      return result;
    },

    getArray: function() {
      return this.entries;
    },

    getArrayCopy: function() {
      return new Float32Array( this.entries );
    },

    getRowDimension: function() {
      return this.m;
    },

    getColumnDimension: function() {
      return this.n;
    },

    // TODO: inline this places if we aren't using an inlining compiler! (check performance)
    index: function( i, j ) {
      return i * this.n + j;
    },

    get: function( i, j ) {
      return this.entries[ this.index( i, j ) ];
    },

    set: function( i, j, s ) {
      this.entries[ this.index( i, j ) ] = s;
    },

    getMatrix: function( i0, i1, j0, j1 ) {
      var result = new Matrix( i1 - i0 + 1, j1 - j0 + 1 );
      for ( var i = i0; i <= i1; i++ ) {
        for ( var j = j0; j <= j1; j++ ) {
          result.entries[ result.index( i - i0, j - j0 ) ] = this.entries[ this.index( i, j ) ];
        }
      }
      return result;
    },

    // getMatrix (int[] r, int j0, int j1)
    getArrayRowMatrix: function( r, j0, j1 ) {
      var result = new Matrix( r.length, j1 - j0 + 1 );
      for ( var i = 0; i < r.length; i++ ) {
        for ( var j = j0; j <= j1; j++ ) {
          result.entries[ result.index( i, j - j0 ) ] = this.entries[ this.index( r[ i ], j ) ];
        }
      }
      return result;
    },

    // allow passing in a pre-constructed matrix
    transpose: function( result ) {
      result = result || new Matrix( this.n, this.m );
      assert && assert( result.m === this.n );
      assert && assert( result.n === this.m );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          result.entries[ result.index( j, i ) ] = this.entries[ this.index( i, j ) ];
        }
      }
      return result;
    },

    norm1: function() {
      var f = 0;
      for ( var j = 0; j < this.n; j++ ) {
        var s = 0;
        for ( var i = 0; i < this.m; i++ ) {
          s += Math.abs( this.entries[ this.index( i, j ) ] );
        }
        f = Math.max( f, s );
      }
      return f;
    },

    norm2: function() {
      return (new dot.SingularValueDecomposition( this ).norm2());
    },

    normInf: function() {
      var f = 0;
      for ( var i = 0; i < this.m; i++ ) {
        var s = 0;
        for ( var j = 0; j < this.n; j++ ) {
          s += Math.abs( this.entries[ this.index( i, j ) ] );
        }
        f = Math.max( f, s );
      }
      return f;
    },

    normF: function() {
      var f = 0;
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          f = Matrix.hypot( f, this.entries[ this.index( i, j ) ] );
        }
      }
      return f;
    },

    uminus: function() {
      var result = new Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          result.entries[ result.index( i, j ) ] = -this.entries[ this.index( i, j ) ];
        }
      }
      return result;
    },

    plus: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      var result = new Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = result.index( i, j );
          result.entries[ index ] = this.entries[ index ] + matrix.entries[ index ];
        }
      }
      return result;
    },

    plusEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      var result = new Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = result.index( i, j );
          this.entries[ index ] = this.entries[ index ] + matrix.entries[ index ];
        }
      }
      return this;
    },

    minus: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      var result = new Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          result.entries[ index ] = this.entries[ index ] - matrix.entries[ index ];
        }
      }
      return result;
    },

    minusEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[ index ] = this.entries[ index ] - matrix.entries[ index ];
        }
      }
      return this;
    },

    arrayTimes: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      var result = new Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = result.index( i, j );
          result.entries[ index ] = this.entries[ index ] * matrix.entries[ index ];
        }
      }
      return result;
    },

    arrayTimesEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[ index ] = this.entries[ index ] * matrix.entries[ index ];
        }
      }
      return this;
    },

    arrayRightDivide: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      var result = new Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          result.entries[ index ] = this.entries[ index ] / matrix.entries[ index ];
        }
      }
      return result;
    },

    arrayRightDivideEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[ index ] = this.entries[ index ] / matrix.entries[ index ];
        }
      }
      return this;
    },

    arrayLeftDivide: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      var result = new Matrix( this.m, this.n );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          result.entries[ index ] = matrix.entries[ index ] / this.entries[ index ];
        }
      }
      return result;
    },

    arrayLeftDivideEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[ index ] = matrix.entries[ index ] / this.entries[ index ];
        }
      }
      return this;
    },

    times: function( matrixOrScalar ) {
      var result;
      var i;
      var j;
      var k;
      var s;
      var matrix;
      if ( matrixOrScalar.isMatrix ) {
        matrix = matrixOrScalar;
        if ( matrix.m !== this.n ) {
          throw new Error( 'Matrix inner dimensions must agree.' );
        }
        result = new Matrix( this.m, matrix.n );
        var matrixcolj = new Float32Array( this.n );
        for ( j = 0; j < matrix.n; j++ ) {
          for ( k = 0; k < this.n; k++ ) {
            matrixcolj[ k ] = matrix.entries[ matrix.index( k, j ) ];
          }
          for ( i = 0; i < this.m; i++ ) {
            s = 0;
            for ( k = 0; k < this.n; k++ ) {
              s += this.entries[ this.index( i, k ) ] * matrixcolj[ k ];
            }
            result.entries[ result.index( i, j ) ] = s;
          }
        }
        return result;
      }
      else {
        s = matrixOrScalar;
        result = new Matrix( this.m, this.n );
        for ( i = 0; i < this.m; i++ ) {
          for ( j = 0; j < this.n; j++ ) {
            result.entries[ result.index( i, j ) ] = s * this.entries[ this.index( i, j ) ];
          }
        }
        return result;
      }
    },

    timesEquals: function( s ) {
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[ index ] = s * this.entries[ index ];
        }
      }
      return this;
    },

    solve: function( matrix ) {
      return (this.m === this.n ? (new dot.LUDecomposition( this )).solve( matrix ) :
              (new dot.QRDecomposition( this )).solve( matrix ));
    },

    solveTranspose: function( matrix ) {
      return this.transpose().solve( matrix.transpose() );
    },

    inverse: function() {
      return this.solve( Matrix.identity( this.m, this.m ) );
    },

    det: function() {
      return new dot.LUDecomposition( this ).det();
    },

    rank: function() {
      return new dot.SingularValueDecomposition( this ).rank();
    },

    cond: function() {
      return new dot.SingularValueDecomposition( this ).cond();
    },

    trace: function() {
      var t = 0;
      for ( var i = 0; i < Math.min( this.m, this.n ); i++ ) {
        t += this.entries[ this.index( i, i ) ];
      }
      return t;
    },

    checkMatrixDimensions: function( matrix ) {
      if ( matrix.m !== this.m || matrix.n !== this.n ) {
        throw new Error( 'Matrix dimensions must agree.' );
      }
    },

    toString: function() {
      var result = '';
      result += 'dim: ' + this.getRowDimension() + 'x' + this.getColumnDimension() + '\n';
      for ( var row = 0; row < this.getRowDimension(); row++ ) {
        for ( var col = 0; col < this.getColumnDimension(); col++ ) {
          result += this.get( row, col ) + ' ';
        }
        result += '\n';
      }
      return result;
    },

    // returns a vector that is contained in the specified column
    extractVector2: function( column ) {
      assert && assert( this.m === 2 ); // rows should match vector dimension
      return new dot.Vector2( this.get( 0, column ), this.get( 1, column ) );
    },

    // returns a vector that is contained in the specified column
    extractVector3: function( column ) {
      assert && assert( this.m === 3 ); // rows should match vector dimension
      return new dot.Vector3( this.get( 0, column ), this.get( 1, column ), this.get( 2, column ) );
    },

    // returns a vector that is contained in the specified column
    extractVector4: function( column ) {
      assert && assert( this.m === 4 ); // rows should match vector dimension
      return new dot.Vector4( this.get( 0, column ), this.get( 1, column ), this.get( 2, column ), this.get( 3, column ) );
    },

    // Sets the current matrix to the values of the listed column vectors (Vector3).
    setVectors3: function( vectors ) {
      var m = 3;
      var n = vectors.length;

      assert && assert( this.m === m );
      assert && assert( this.n === n );

      for ( var i = 0; i < n; i++ ) {
        var vector = vectors[ i ];
        this.entries[ i ] = vector.x;
        this.entries[ i + n ] = vector.y;
        this.entries[ i + 2 * n ] = vector.z;
      }

      return this;
    },

    isMatrix: true
  };

  Matrix.identity = function( m, n ) {
    var result = new Matrix( m, n );
    for ( var i = 0; i < m; i++ ) {
      for ( var j = 0; j < n; j++ ) {
        result.entries[ result.index( i, j ) ] = (i === j ? 1.0 : 0.0);
      }
    }
    return result;
  };

  Matrix.rowVector2 = function( vector ) {
    return new Matrix( 1, 2, [ vector.x, vector.y ] );
  };

  Matrix.rowVector3 = function( vector ) {
    return new Matrix( 1, 3, [ vector.x, vector.y, vector.z ] );
  };

  Matrix.rowVector4 = function( vector ) {
    return new Matrix( 1, 4, [ vector.x, vector.y, vector.z, vector.w ] );
  };

  Matrix.rowVector = function( vector ) {
    if ( vector.isVector2 ) {
      return Matrix.rowVector2( vector );
    }
    else if ( vector.isVector3 ) {
      return Matrix.rowVector3( vector );
    }
    else if ( vector.isVector4 ) {
      return Matrix.rowVector4( vector );
    }
    else {
      throw new Error( 'undetected type of vector: ' + vector.toString() );
    }
  };

  Matrix.columnVector2 = function( vector ) {
    return new Matrix( 2, 1, [ vector.x, vector.y ] );
  };

  Matrix.columnVector3 = function( vector ) {
    return new Matrix( 3, 1, [ vector.x, vector.y, vector.z ] );
  };

  Matrix.columnVector4 = function( vector ) {
    return new Matrix( 4, 1, [ vector.x, vector.y, vector.z, vector.w ] );
  };

  Matrix.columnVector = function( vector ) {
    if ( vector.isVector2 ) {
      return Matrix.columnVector2( vector );
    }
    else if ( vector.isVector3 ) {
      return Matrix.columnVector3( vector );
    }
    else if ( vector.isVector4 ) {
      return Matrix.columnVector4( vector );
    }
    else {
      throw new Error( 'undetected type of vector: ' + vector.toString() );
    }
  };

  /**
   * Create a Matrix where each column is a vector
   */

  Matrix.fromVectors2 = function( vectors ) {
    var dimension = 2;
    var n = vectors.length;
    var data = new Float32Array( dimension * n );

    for ( var i = 0; i < n; i++ ) {
      var vector = vectors[ i ];
      data[ i ] = vector.x;
      data[ i + n ] = vector.y;
    }

    return new Matrix( dimension, n, data, true );
  };

  Matrix.fromVectors3 = function( vectors ) {
    var dimension = 3;
    var n = vectors.length;
    var data = new Float32Array( dimension * n );

    for ( var i = 0; i < n; i++ ) {
      var vector = vectors[ i ];
      data[ i ] = vector.x;
      data[ i + n ] = vector.y;
      data[ i + 2 * n ] = vector.z;
    }

    return new Matrix( dimension, n, data, true );
  };

  Matrix.fromVectors4 = function( vectors ) {
    var dimension = 4;
    var n = vectors.length;
    var data = new Float32Array( dimension * n );

    for ( var i = 0; i < n; i++ ) {
      var vector = vectors[ i ];
      data[ i ] = vector.x;
      data[ i + n ] = vector.y;
      data[ i + 2 * n ] = vector.z;
      data[ i + 3 * n ] = vector.w;
    }

    return new Matrix( dimension, n, data, true );
  };

  return Matrix;
} );

// Copyright 2015, University of Colorado Boulder

/**
 * Fast 3x3 matrix computations at the lower level, including an SVD implementation that is fully stable.
 * Overall, it uses a heavily mutable style, passing in the object where the result(s) will be stored.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/MatrixOps3',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  /*
   * Matrices are stored as flat typed arrays with row-major indices. For example, for a 3x3:
   * [0] [1] [2]
   * [3] [4] [5]
   * [6] [7] [8]
   *
   * NOTE: We assume the typed arrays are AT LEAST as long as necessary (but could be longer). This allows us to use
   * an array as big as the largest one we'll need.
   */

  // constants
  var SQRT_HALF = Math.sqrt( 0.5 );

  var MatrixOps3 = {
    // use typed arrays if possible
    Array: dot.FastArray,

    /*---------------------------------------------------------------------------*
     * 3x3 matrix math
     *----------------------------------------------------------------------------*/

    /*
     * From 0-indexed row and column indices, returns the index into the flat array
     *
     * @param {number} row
     * @param {number} col
     */
    index3: function( row, col ) {
      assert && assert( row >= 0 && row < 3 );
      assert && assert( col >= 0 && col < 3 );
      return 3 * row + col;
    },

    /*
     * Copies one matrix into another
     *
     * @param {FastMath.Array} matrix - [input] 3x3 Matrix
     * @param {FastMath.Array} result - [output] 3x3 Matrix
     */
    set3: function( matrix, result ) {
      assert && assert( matrix.length >= 9 );
      assert && assert( result.length >= 9 );
      result[ 0 ] = matrix[ 0 ];
      result[ 1 ] = matrix[ 1 ];
      result[ 2 ] = matrix[ 2 ];
      result[ 3 ] = matrix[ 3 ];
      result[ 4 ] = matrix[ 4 ];
      result[ 5 ] = matrix[ 5 ];
      result[ 6 ] = matrix[ 6 ];
      result[ 7 ] = matrix[ 7 ];
      result[ 8 ] = matrix[ 8 ];
    },

    /*
     * Writes the transpose of the input matrix into the result matrix (in-place modification is OK)
     *
     * @param {FastMath.Array} matrix - [input] 3x3 Matrix
     * @param {FastMath.Array} result - [output] 3x3 Matrix
     */
    transpose3: function( matrix, result ) {
      assert && assert( matrix.length >= 9 );
      assert && assert( result.length >= 9 );
      var m1 = matrix[ 3 ];
      var m2 = matrix[ 6 ];
      var m3 = matrix[ 1 ];
      var m5 = matrix[ 7 ];
      var m6 = matrix[ 2 ];
      var m7 = matrix[ 5 ];
      result[ 0 ] = matrix[ 0 ];
      result[ 1 ] = m1;
      result[ 2 ] = m2;
      result[ 3 ] = m3;
      result[ 4 ] = matrix[ 4 ];
      result[ 5 ] = m5;
      result[ 6 ] = m6;
      result[ 7 ] = m7;
      result[ 8 ] = matrix[ 8 ];
    },

    /*
     * The determinant of a 3x3 matrix
     *
     * @param {FastMath.Array} matrix - [input] 3x3 Matrix
     * @returns {number} - The determinant. 0 indicates a singular (non-invertible) matrix.
     */
    det3: function( matrix ) {
      assert && assert( matrix.length >= 9 );
      return matrix[ 0 ] * matrix[ 4 ] * matrix[ 8 ] + matrix[ 1 ] * matrix[ 5 ] * matrix[ 6 ] +
             matrix[ 2 ] * matrix[ 3 ] * matrix[ 7 ] - matrix[ 2 ] * matrix[ 4 ] * matrix[ 6 ] -
             matrix[ 1 ] * matrix[ 3 ] * matrix[ 8 ] - matrix[ 0 ] * matrix[ 5 ] * matrix[ 7 ];
    },

    /*
     * Writes the matrix multiplication ( left * right ) into result. (in-place modification is OK)
     *
     * @param {FastMath.Array} left - [input] 3x3 Matrix
     * @param {FastMath.Array} right - [input] 3x3 Matrix
     * @param {FastMath.Array} result - [output] 3x3 Matrix
     */
    mult3: function( left, right, result ) {
      assert && assert( left.length >= 9 );
      assert && assert( right.length >= 9 );
      assert && assert( result.length >= 9 );
      var m0 = left[ 0 ] * right[ 0 ] + left[ 1 ] * right[ 3 ] + left[ 2 ] * right[ 6 ];
      var m1 = left[ 0 ] * right[ 1 ] + left[ 1 ] * right[ 4 ] + left[ 2 ] * right[ 7 ];
      var m2 = left[ 0 ] * right[ 2 ] + left[ 1 ] * right[ 5 ] + left[ 2 ] * right[ 8 ];
      var m3 = left[ 3 ] * right[ 0 ] + left[ 4 ] * right[ 3 ] + left[ 5 ] * right[ 6 ];
      var m4 = left[ 3 ] * right[ 1 ] + left[ 4 ] * right[ 4 ] + left[ 5 ] * right[ 7 ];
      var m5 = left[ 3 ] * right[ 2 ] + left[ 4 ] * right[ 5 ] + left[ 5 ] * right[ 8 ];
      var m6 = left[ 6 ] * right[ 0 ] + left[ 7 ] * right[ 3 ] + left[ 8 ] * right[ 6 ];
      var m7 = left[ 6 ] * right[ 1 ] + left[ 7 ] * right[ 4 ] + left[ 8 ] * right[ 7 ];
      var m8 = left[ 6 ] * right[ 2 ] + left[ 7 ] * right[ 5 ] + left[ 8 ] * right[ 8 ];
      result[ 0 ] = m0;
      result[ 1 ] = m1;
      result[ 2 ] = m2;
      result[ 3 ] = m3;
      result[ 4 ] = m4;
      result[ 5 ] = m5;
      result[ 6 ] = m6;
      result[ 7 ] = m7;
      result[ 8 ] = m8;
    },

    /*
     * Writes the matrix multiplication ( transpose( left ) * right ) into result. (in-place modification is OK)
     *
     * @param {FastMath.Array} left - [input] 3x3 Matrix
     * @param {FastMath.Array} right - [input] 3x3 Matrix
     * @param {FastMath.Array} result - [output] 3x3 Matrix
     */
    mult3LeftTranspose: function( left, right, result ) {
      assert && assert( left.length >= 9 );
      assert && assert( right.length >= 9 );
      assert && assert( result.length >= 9 );
      var m0 = left[ 0 ] * right[ 0 ] + left[ 3 ] * right[ 3 ] + left[ 6 ] * right[ 6 ];
      var m1 = left[ 0 ] * right[ 1 ] + left[ 3 ] * right[ 4 ] + left[ 6 ] * right[ 7 ];
      var m2 = left[ 0 ] * right[ 2 ] + left[ 3 ] * right[ 5 ] + left[ 6 ] * right[ 8 ];
      var m3 = left[ 1 ] * right[ 0 ] + left[ 4 ] * right[ 3 ] + left[ 7 ] * right[ 6 ];
      var m4 = left[ 1 ] * right[ 1 ] + left[ 4 ] * right[ 4 ] + left[ 7 ] * right[ 7 ];
      var m5 = left[ 1 ] * right[ 2 ] + left[ 4 ] * right[ 5 ] + left[ 7 ] * right[ 8 ];
      var m6 = left[ 2 ] * right[ 0 ] + left[ 5 ] * right[ 3 ] + left[ 8 ] * right[ 6 ];
      var m7 = left[ 2 ] * right[ 1 ] + left[ 5 ] * right[ 4 ] + left[ 8 ] * right[ 7 ];
      var m8 = left[ 2 ] * right[ 2 ] + left[ 5 ] * right[ 5 ] + left[ 8 ] * right[ 8 ];
      result[ 0 ] = m0;
      result[ 1 ] = m1;
      result[ 2 ] = m2;
      result[ 3 ] = m3;
      result[ 4 ] = m4;
      result[ 5 ] = m5;
      result[ 6 ] = m6;
      result[ 7 ] = m7;
      result[ 8 ] = m8;
    },

    /*
     * Writes the matrix multiplication ( left * transpose( right ) ) into result. (in-place modification is OK)
     *
     * @param {FastMath.Array} left - [input] 3x3 Matrix
     * @param {FastMath.Array} right - [input] 3x3 Matrix
     * @param {FastMath.Array} result - [output] 3x3 Matrix
     */
    mult3RightTranspose: function( left, right, result ) {
      assert && assert( left.length >= 9 );
      assert && assert( right.length >= 9 );
      assert && assert( result.length >= 9 );
      var m0 = left[ 0 ] * right[ 0 ] + left[ 1 ] * right[ 1 ] + left[ 2 ] * right[ 2 ];
      var m1 = left[ 0 ] * right[ 3 ] + left[ 1 ] * right[ 4 ] + left[ 2 ] * right[ 5 ];
      var m2 = left[ 0 ] * right[ 6 ] + left[ 1 ] * right[ 7 ] + left[ 2 ] * right[ 8 ];
      var m3 = left[ 3 ] * right[ 0 ] + left[ 4 ] * right[ 1 ] + left[ 5 ] * right[ 2 ];
      var m4 = left[ 3 ] * right[ 3 ] + left[ 4 ] * right[ 4 ] + left[ 5 ] * right[ 5 ];
      var m5 = left[ 3 ] * right[ 6 ] + left[ 4 ] * right[ 7 ] + left[ 5 ] * right[ 8 ];
      var m6 = left[ 6 ] * right[ 0 ] + left[ 7 ] * right[ 1 ] + left[ 8 ] * right[ 2 ];
      var m7 = left[ 6 ] * right[ 3 ] + left[ 7 ] * right[ 4 ] + left[ 8 ] * right[ 5 ];
      var m8 = left[ 6 ] * right[ 6 ] + left[ 7 ] * right[ 7 ] + left[ 8 ] * right[ 8 ];
      result[ 0 ] = m0;
      result[ 1 ] = m1;
      result[ 2 ] = m2;
      result[ 3 ] = m3;
      result[ 4 ] = m4;
      result[ 5 ] = m5;
      result[ 6 ] = m6;
      result[ 7 ] = m7;
      result[ 8 ] = m8;
    },

    /*
     * Writes the matrix multiplication ( transpose( left ) * transpose( right ) ) into result.
     * (in-place modification is OK)
     * NOTE: This is equivalent to transpose( right * left ).
     *
     * @param {FastMath.Array} left - [input] 3x3 Matrix
     * @param {FastMath.Array} right - [input] 3x3 Matrix
     * @param {FastMath.Array} result - [output] 3x3 Matrix
     */
    mult3BothTranspose: function( left, right, result ) {
      assert && assert( left.length >= 9 );
      assert && assert( right.length >= 9 );
      assert && assert( result.length >= 9 );
      var m0 = left[ 0 ] * right[ 0 ] + left[ 3 ] * right[ 1 ] + left[ 6 ] * right[ 2 ];
      var m1 = left[ 0 ] * right[ 3 ] + left[ 3 ] * right[ 4 ] + left[ 6 ] * right[ 5 ];
      var m2 = left[ 0 ] * right[ 6 ] + left[ 3 ] * right[ 7 ] + left[ 6 ] * right[ 8 ];
      var m3 = left[ 1 ] * right[ 0 ] + left[ 4 ] * right[ 1 ] + left[ 7 ] * right[ 2 ];
      var m4 = left[ 1 ] * right[ 3 ] + left[ 4 ] * right[ 4 ] + left[ 7 ] * right[ 5 ];
      var m5 = left[ 1 ] * right[ 6 ] + left[ 4 ] * right[ 7 ] + left[ 7 ] * right[ 8 ];
      var m6 = left[ 2 ] * right[ 0 ] + left[ 5 ] * right[ 1 ] + left[ 8 ] * right[ 2 ];
      var m7 = left[ 2 ] * right[ 3 ] + left[ 5 ] * right[ 4 ] + left[ 8 ] * right[ 5 ];
      var m8 = left[ 2 ] * right[ 6 ] + left[ 5 ] * right[ 7 ] + left[ 8 ] * right[ 8 ];
      result[ 0 ] = m0;
      result[ 1 ] = m1;
      result[ 2 ] = m2;
      result[ 3 ] = m3;
      result[ 4 ] = m4;
      result[ 5 ] = m5;
      result[ 6 ] = m6;
      result[ 7 ] = m7;
      result[ 8 ] = m8;
    },

    /*
     * Writes the product ( matrix * vector ) into result. (in-place modification is OK)
     *
     * @param {FastMath.Array} matrix - [input] 3x3 Matrix
     * @param {Vector3} vector - [input]
     * @param {Vector3} result - [output]
     */
    mult3Vector3: function( matrix, vector, result ) {
      assert && assert( matrix.length >= 9 );
      var x = matrix[ 0 ] * vector.x + matrix[ 1 ] * vector.y + matrix[ 2 ] * vector.z;
      var y = matrix[ 3 ] * vector.x + matrix[ 4 ] * vector.y + matrix[ 5 ] * vector.z;
      var z = matrix[ 6 ] * vector.x + matrix[ 7 ] * vector.y + matrix[ 8 ] * vector.z;
      result.x = x;
      result.y = y;
      result.z = z;
    },

    /*
     * Swaps two columns in a matrix, negating one of them to maintain the sign of the determinant.
     *
     * @param {FastMath.Array} matrix - [input] 3x3 Matrix
     * @param {number} idx0 - In the range [0,2]
     * @param {number} idx1 - In the range [0,2]
     */
    swapNegateColumn: function( matrix, idx0, idx1 ) {
      assert && assert( matrix.length >= 9 );
      var tmp0 = matrix[ idx0 ];
      var tmp1 = matrix[ idx0 + 3 ];
      var tmp2 = matrix[ idx0 + 6 ];

      matrix[ idx0 ] = matrix[ idx1 ];
      matrix[ idx0 + 3 ] = matrix[ idx1 + 3 ];
      matrix[ idx0 + 6 ] = matrix[ idx1 + 6 ];

      matrix[ idx1 ] = -tmp0;
      matrix[ idx1 + 3 ] = -tmp1;
      matrix[ idx1 + 6 ] = -tmp2;
    },

    /*
     * Sets the result matrix to the identity.
     *
     * @param {FastMath.Array} result - [output] 3x3 Matrix
     */
    setIdentity3: function( result ) {
      result[ 0 ] = result[ 4 ] = result[ 8 ] = 1; // diagonal
      result[ 1 ] = result[ 2 ] = result[ 3 ] = result[ 5 ] = result[ 6 ] = result[ 7 ] = 0; // non-diagonal
    },

    /*
     * Sets the result matrix to the Givens rotation (performs a rotation between two components). Instead of an angle,
     * the 'cos' and 'sin' values are passed in directly since we skip the trigonometry almost everywhere we can.
     *
     * See http://en.wikipedia.org/wiki/Givens_rotation (note that we use the other sign convention for the sin)
     *
     * @param {FastMath.Array} result - [output] 3x3 Matrix
     * @param {number} cos - [input] The cosine of the Givens rotation angle
     * @param {number} sin - [input] The sine of the Givens rotation angle
     * @param {number} idx0 - [input] The smaller row/column index
     * @param {number} idx1 - [input] The larger row/column index
     */
    setGivens3: function( result, cos, sin, idx0, idx1 ) {
      assert && assert( idx0 < idx1 );
      this.setIdentity3( result );
      result[ this.index3( idx0, idx0 ) ] = cos;
      result[ this.index3( idx1, idx1 ) ] = cos;
      result[ this.index3( idx0, idx1 ) ] = sin;
      result[ this.index3( idx1, idx0 ) ] = -sin;
    },

    /*
     * Efficiently pre-multiples the matrix in-place by the specified Givens rotation (matrix <= rotation * matrix).
     * Equivalent to using setGivens3 and mult3.
     *
     * @param {FastMath.Array} result - [input AND output] 3x3 Matrix
     * @param {number} cos - [input] The cosine of the Givens rotation angle
     * @param {number} sin - [input] The sine of the Givens rotation angle
     * @param {number} idx0 - [input] The smaller row/column index
     * @param {number} idx1 - [input] The larger row/column index
     */
    preMult3Givens: function( matrix, cos, sin, idx0, idx1 ) {
      var baseA = idx0 * 3;
      var baseB = idx1 * 3;
      // lexicographically in column-major order for "affine" section
      var a = cos * matrix[ baseA + 0 ] + sin * matrix[ baseB + 0 ];
      var b = cos * matrix[ baseB + 0 ] - sin * matrix[ baseA + 0 ];
      var c = cos * matrix[ baseA + 1 ] + sin * matrix[ baseB + 1 ];
      var d = cos * matrix[ baseB + 1 ] - sin * matrix[ baseA + 1 ];
      var e = cos * matrix[ baseA + 2 ] + sin * matrix[ baseB + 2 ];
      var f = cos * matrix[ baseB + 2 ] - sin * matrix[ baseA + 2 ];
      matrix[ baseA + 0 ] = a;
      matrix[ baseB + 0 ] = b;
      matrix[ baseA + 1 ] = c;
      matrix[ baseB + 1 ] = d;
      matrix[ baseA + 2 ] = e;
      matrix[ baseB + 2 ] = f;
    },

    /*
     * Efficiently post-multiples the matrix in-place by the transpose of the specified Givens rotation
     * (matrix <= matrix * rotation^T).
     * Equivalent to using setGivens3 and mult3RightTranspose.
     *
     * @param {FastMath.Array} result - [input AND output] 3x3 Matrix
     * @param {number} cos - [input] The cosine of the Givens rotation angle
     * @param {number} sin - [input] The sine of the Givens rotation angle
     * @param {number} idx0 - [input] The smaller row/column index
     * @param {number} idx1 - [input] The larger row/column index
     */
    postMult3Givens: function( matrix, cos, sin, idx0, idx1 ) {
      // lexicographically in row-major order for the "transposed affine" section
      var a = cos * matrix[ idx0 + 0 ] + sin * matrix[ idx1 + 0 ];
      var b = cos * matrix[ idx1 + 0 ] - sin * matrix[ idx0 + 0 ];
      var c = cos * matrix[ idx0 + 3 ] + sin * matrix[ idx1 + 3 ];
      var d = cos * matrix[ idx1 + 3 ] - sin * matrix[ idx0 + 3 ];
      var e = cos * matrix[ idx0 + 6 ] + sin * matrix[ idx1 + 6 ];
      var f = cos * matrix[ idx1 + 6 ] - sin * matrix[ idx0 + 6 ];
      matrix[ idx0 + 0 ] = a;
      matrix[ idx1 + 0 ] = b;
      matrix[ idx0 + 3 ] = c;
      matrix[ idx1 + 3 ] = d;
      matrix[ idx0 + 6 ] = e;
      matrix[ idx1 + 6 ] = f;
    },

    /*
     * Zeros out the [idx0,idx1] and [idx1,idx0] entries of the matrix mS by applying a Givens rotation as part of the
     * Jacobi iteration. In addition, the Givens rotation is prepended to mQ so we can track the accumulated rotations
     * applied (this is how we get V in the SVD).
     *
     * @param {FastMath.Array} mS - [input AND output] Symmetric 3x3 Matrix
     * @param {FastMath.Array} mQ - [input AND output] Unitary 3x3 Matrix
     * @param {number} idx0 - [input] The smaller row/column index
     * @param {number} idx1 - [input] The larger row/column index
     */
    applyJacobi3: function( mS, mQ, idx0, idx1 ) {
      // submatrix entries for idx0,idx1
      var a11 = mS[ 3 * idx0 + idx0 ];
      var a12 = mS[ 3 * idx0 + idx1 ]; // we assume mS is symmetric, so we don't need a21
      var a22 = mS[ 3 * idx1 + idx1 ];

      // Approximate givens angle, see https://graphics.cs.wisc.edu/Papers/2011/MSTTS11/SVD_TR1690.pdf (section 2.3)
      // "Computing the Singular Value Decomposition of 3x3 matrices with minimal branching and elementary floating point operations"
      // Aleka McAdams, Andrew Selle, Rasmus Tamstorf, Joseph Teran, Eftychios Sifakis
      var lhs = a12 * a12;
      var rhs = a11 - a22;
      rhs = rhs * rhs;
      var useAngle = lhs < rhs;
      var w = 1 / Math.sqrt( lhs + rhs );
      // NOTE: exact Givens angle is 0.5 * Math.atan( 2 * a12 / ( a11 - a22 ) ), but clamped to withing +-Math.PI / 4
      var cos = useAngle ? ( w * ( a11 - a22 ) ) : SQRT_HALF;
      var sin = useAngle ? ( w * a12 ) : SQRT_HALF;

      // S' = Q * S * transpose( Q )
      this.preMult3Givens( mS, cos, sin, idx0, idx1 );
      this.postMult3Givens( mS, cos, sin, idx0, idx1 );

      // Q' = Q * mQ
      this.preMult3Givens( mQ, cos, sin, idx0, idx1 );
    },

    /*
     * The Jacobi method, which in turn zeros out all the non-diagonal entries repeatedly until mS converges into
     * a diagonal matrix. We track the applied Givens rotations in mQ, so that when given mS and mQ=identity, we will
     * maintain the value mQ * mS * mQ^T
     *
     * @param {FastMath.Array} mS - [input AND output] Symmetric 3x3 Matrix
     * @param {FastMath.Array} mQ - [input AND output] Unitary 3x3 Matrix
     * @param {number} n - [input] The number of iterations to run
     */
    jacobiIteration3: function( mS, mQ, n ) {
      // for 3x3, we eliminate non-diagonal entries iteratively
      for ( var i = 0; i < n; i++ ) {
        this.applyJacobi3( mS, mQ, 0, 1 );
        this.applyJacobi3( mS, mQ, 0, 2 );
        this.applyJacobi3( mS, mQ, 1, 2 );
      }
    },

    /*
     * One step in computing the QR decomposition. Zeros out the (row,col) entry in 'r', while maintaining the
     * value of (q * r). We will end up with an orthogonal Q and upper-triangular R (or in the SVD case,
     * R will be diagonal)
     *
     * @param {FastMath.Array} q - [input AND ouput] 3x3 Matrix
     * @param {FastMath.Array} r - [input AND ouput] 3x3 Matrix
     * @param {number} row - [input] The row of the entry to zero out
     * @param {number} col - [input] The column of the entry to zero out
     */
    qrAnnihilate3: function( q, r, row, col ) {
      assert && assert( row > col ); // only in the lower-triangular area

      var epsilon = 0.0000000001;
      var cos;
      var sin;

      var diagonalValue = r[ this.index3( col, col ) ];
      var targetValue = r[ this.index3( row, col ) ];
      var diagonalSquared = diagonalValue * diagonalValue;
      var targetSquared = targetValue * targetValue;

      // handle the case where both (row,col) and (col,col) are very small (would cause instabilities)
      if ( diagonalSquared + targetSquared < epsilon ) {
        cos = diagonalValue > 0 ? 1 : 0;
        sin = 0;
      }
      else {
        var rsqr = 1 / Math.sqrt( diagonalSquared + targetSquared );
        cos = rsqr * diagonalValue;
        sin = rsqr * targetValue;
      }

      this.preMult3Givens( r, cos, sin, col, row );
      this.postMult3Givens( q, cos, sin, col, row );
    },

    /*
     * 3x3 Singular Value Decomposition, handling singular cases.
     * Based on https://graphics.cs.wisc.edu/Papers/2011/MSTTS11/SVD_TR1690.pdf
     * "Computing the Singular Value Decomposition of 3x3 matrices with minimal branching and elementary floating point operations"
     * Aleka McAdams, Andrew Selle, Rasmus Tamstorf, Joseph Teran, Eftychios Sifakis
     *
     * @param {FastMath.Array} a - [input] 3x3 Matrix that we want the SVD of.
     * @param {number} jacobiIterationCount - [input] How many Jacobi iterations to run (larger is more accurate to a point)
     * @param {FastMath.Array} resultU - [output] 3x3 U matrix (unitary)
     * @param {FastMath.Array} resultSigma - [output] 3x3 diagonal matrix of singular values
     * @param {FastMath.Array} resultV - [output] 3x3 V matrix (unitary)
     */
    svd3: function( a, jacobiIterationCount, resultU, resultSigma, resultV ) {
      // shorthands
      var q = resultU;
      var v = resultV;
      var r = resultSigma;

      // for now, use 'r' as our S == transpose( A ) * A, so we don't have to use scratch matrices
      this.mult3LeftTranspose( a, a, r );
      // we'll accumulate into 'q' == transpose( V ) during the Jacobi iteration
      this.setIdentity3( q );

      // Jacobi iteration turns Q into V^T and R into Sigma^2 (we'll ditch R since the QR decomposition will be beter)
      this.jacobiIteration3( r, q, jacobiIterationCount );
      // final determination of V
      this.transpose3( q, v ); // done with this 'q' until we reuse the scratch matrix later below for the QR decomposition

      this.mult3( a, v, r ); // R = AV

      // Sort columns of R and V based on singular values (needed for the QR step, and useful anyways).
      // Their product will remain unchanged.
      var mag0 = r[ 0 ] * r[ 0 ] + r[ 3 ] * r[ 3 ] + r[ 6 ] * r[ 6 ]; // column vector magnitudes
      var mag1 = r[ 1 ] * r[ 1 ] + r[ 4 ] * r[ 4 ] + r[ 7 ] * r[ 7 ];
      var mag2 = r[ 2 ] * r[ 2 ] + r[ 5 ] * r[ 5 ] + r[ 8 ] * r[ 8 ];
      var tmpMag;
      if ( mag0 < mag1 ) {
        // swap magnitudes
        tmpMag = mag0;
        mag0 = mag1;
        mag1 = tmpMag;
        this.swapNegateColumn( r, 0, 1 );
        this.swapNegateColumn( v, 0, 1 );
      }
      if ( mag0 < mag2 ) {
        // swap magnitudes
        tmpMag = mag0;
        mag0 = mag2;
        mag2 = tmpMag;
        this.swapNegateColumn( r, 0, 2 );
        this.swapNegateColumn( v, 0, 2 );
      }
      if ( mag1 < mag2 ) {
        this.swapNegateColumn( r, 1, 2 );
        this.swapNegateColumn( v, 1, 2 );
      }

      // QR decomposition
      this.setIdentity3( q ); // reusing Q now for the QR
      // Zero out all three strictly lower-triangular values. Should turn the matrix diagonal
      this.qrAnnihilate3( q, r, 1, 0 );
      this.qrAnnihilate3( q, r, 2, 0 );
      this.qrAnnihilate3( q, r, 2, 1 );

      // checks for a singular U value, we'll add in the needed 1 entries to make sure our U is orthogonal
      var bigEpsilon = 0.001; // they really should be around 1
      if ( q[ 0 ] * q[ 0 ] + q[ 1 ] * q[ 1 ] + q[ 2 ] * q[ 2 ] < bigEpsilon ) {
        q[ 0 ] = 1;
      }
      if ( q[ 3 ] * q[ 3 ] + q[ 4 ] * q[ 4 ] + q[ 5 ] * q[ 5 ] < bigEpsilon ) {
        q[ 4 ] = 1;
      }
      if ( q[ 6 ] * q[ 6 ] + q[ 7 ] * q[ 7 ] + q[ 8 ] * q[ 8 ] < bigEpsilon ) {
        q[ 8 ] = 1;
      }
    },

    /*---------------------------------------------------------------------------*
     * 3xN matrix math
     *----------------------------------------------------------------------------*/

    /*
     * Sets the 3xN result matrix to be made out of column vectors
     *
     * @param {Array.<Vector3>} columnVectors - [input] List of 3D column vectors
     * @param {FastMath.Array} result - [output] 3xN Matrix, where N is the number of column vectors
     */
    setVectors3: function( columnVectors, result ) {
      var m = 3;
      var n = columnVectors.length;

      assert && assert( result.length >= m * n, 'Array length check' );

      for ( var i = 0; i < n; i++ ) {
        var vector = columnVectors[ i ];
        result[ i ] = vector.x;
        result[ i + n ] = vector.y;
        result[ i + 2 * n ] = vector.z;
      }
    },

    /*
     * Retrieves column vector values from a 3xN matrix.
     *
     * @param {number} m - [input] The number of rows in the matrix (sanity check, should always be 3)
     * @param {number} n - [input] The number of columns in the matrix
     * @param {FastMath.Array} matrix - [input] 3xN Matrix
     * @param {number} columnIndex - [input] 3xN Matrix
     * @param {Vector3} result - [output] Vector to store the x,y,z
     */
    getColumnVector3: function( m, n, matrix, columnIndex, result ) {
      assert && assert( m === 3 && columnIndex < n );

      result.x = matrix[ columnIndex ];
      result.y = matrix[ columnIndex + n ];
      result.z = matrix[ columnIndex + 2 * n ];
    },

    /*---------------------------------------------------------------------------*
     * Arbitrary dimension matrix math
     *----------------------------------------------------------------------------*/

    /*
     * From 0-indexed row and column indices, returns the index into the flat array
     *
     * @param {number} m - Number of rows in the matrix
     * @param {number} n - Number of columns in the matrix
     * @param {number} row
     * @param {number} col
     */
    index: function( m, n, row, col ) {
      return n * row + col;
    },

    /*
     * Writes the transpose of the matrix into the result.
     *
     * @param {number} m - Number of rows in the original matrix
     * @param {number} n - Number of columns in the original matrix
     * @param {FastMath.Array} matrix - [input] MxN Matrix
     * @param {FastMath.Array} result - [output] NxM Matrix
     */
    transpose: function( m, n, matrix, result ) {
      assert && assert( matrix.length >= m * n );
      assert && assert( result.length >= n * m );
      assert && assert( matrix !== result, 'In-place modification not implemented yet' );

      for ( var row = 0; row < m; row++ ) {
        for ( var col = 0; col < n; col++ ) {
          result[ m * col + row ] = matrix[ n * row + col ];
        }
      }
    },

    /*
     * Writes the matrix multiplication of ( left * right ) into result
     *
     * @param {number} m - Number of rows in the left matrix
     * @param {number} n - Number of columns in the left matrix, number of rows in the right matrix
     * @param {number} p - Number of columns in the right matrix
     * @param {FastMath.Array} left - [input] MxN Matrix
     * @param {FastMath.Array} right - [input] NxP Matrix
     * @param {FastMath.Array} result - [output] MxP Matrix
     */
    mult: function( m, n, p, left, right, result ) {
      assert && assert( left.length >= m * n );
      assert && assert( right.length >= n * p );
      assert && assert( result.length >= m * p );
      assert && assert( left !== result && right !== result, 'In-place modification not implemented yet' );

      for ( var row = 0; row < m; row++ ) {
        for ( var col = 0; col < p; col++ ) {
          var x = 0;
          for ( var k = 0; k < n; k++ ) {
            x += left[ this.index( m, n, row, k ) ] * right[ this.index( n, p, k, col ) ];
          }
          result[ this.index( m, p, row, col ) ] = x;
        }
      }
    },

    /*
     * Writes the matrix multiplication of ( left * transpose( right ) ) into result
     *
     * @param {number} m - Number of rows in the left matrix
     * @param {number} n - Number of columns in the left matrix, number of columns in the right matrix
     * @param {number} p - Number of rows in the right matrix
     * @param {FastMath.Array} left - [input] MxN Matrix
     * @param {FastMath.Array} right - [input] PxN Matrix
     * @param {FastMath.Array} result - [output] MxP Matrix
     */
    multRightTranspose: function( m, n, p, left, right, result ) {
      assert && assert( left.length >= m * n );
      assert && assert( right.length >= n * p );
      assert && assert( result.length >= m * p );
      assert && assert( left !== result && right !== result, 'In-place modification not implemented yet' );

      for ( var row = 0; row < m; row++ ) {
        for ( var col = 0; col < p; col++ ) {
          var x = 0;
          for ( var k = 0; k < n; k++ ) {
            x += left[ this.index( m, n, row, k ) ] * right[ this.index( p, n, col, k ) ];
          }
          result[ this.index( m, p, row, col ) ] = x;
        }
      }
    },

    /*
     * Writes the matrix into the result, permuting the columns.
     *
     * @param {number} m - Number of rows in the original matrix
     * @param {number} n - Number of columns in the original matrix
     * @param {FastMath.Array} matrix - [input] MxN Matrix
     * @param {Permutation} permutation - [input] Permutation
     * @param {FastMath.Array} result - [output] MxN Matrix
     */
    permuteColumns: function( m, n, matrix, permutation, result ) {
      assert && assert( matrix !== result, 'In-place modification not implemented yet' );
      assert && assert( matrix.length >= m * n );
      assert && assert( result.length >= m * n );

      for ( var col = 0; col < n; col++ ) {
        var permutedColumnIndex = permutation.indices[ col ];
        for ( var row = 0; row < m; row++ ) {
          result[ this.index( m, n, row, col ) ] = matrix[ this.index( m, n, row, permutedColumnIndex ) ];
        }
      }
    }
  };
  dot.register( 'MatrixOps3', MatrixOps3 );

  return MatrixOps3;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * An immutable permutation that can permute an array
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Permutation',['require','DOT/dot','PHET_CORE/isArray','DOT/Util'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var isArray = require( 'PHET_CORE/isArray' );
  require( 'DOT/Util' ); // for rangeInclusive

  // Creates a permutation that will rearrange a list so that newList[i] = oldList[permutation[i]]
  function Permutation( indices ) {
    this.indices = indices;
  }

  dot.register( 'Permutation', Permutation );

  // An identity permutation with a specific number of elements
  Permutation.identity = function( size ) {
    assert && assert( size >= 0 );
    var indices = new Array( size );
    for ( var i = 0; i < size; i++ ) {
      indices[ i ] = i;
    }
    return new Permutation( indices );
  };

  // lists all permutations that have a given size
  Permutation.permutations = function( size ) {
    var result = [];
    Permutation.forEachPermutation( dot.rangeInclusive( 0, size - 1 ), function( integers ) {
      result.push( new Permutation( integers ) );
    } );
    return result;
  };

  /**
   * Call our function with each permutation of the provided list PREFIXED by prefix, in lexicographic order
   *
   * @param array   List to generate permutations of
   * @param prefix   Elements that should be inserted at the front of each list before each call
   * @param callback Function to call
   */
  function recursiveForEachPermutation( array, prefix, callback ) {
    if ( array.length === 0 ) {
      callback( prefix );
    }
    else {
      for ( var i = 0; i < array.length; i++ ) {
        var element = array[ i ];

        // remove the element from the array
        var nextArray = array.slice( 0 );
        nextArray.splice( i, 1 );

        // add it into the prefix
        var nextPrefix = prefix.slice( 0 );
        nextPrefix.push( element );

        recursiveForEachPermutation( nextArray, nextPrefix, callback );
      }
    }
  }

  Permutation.forEachPermutation = function( array, callback ) {
    recursiveForEachPermutation( array, [], callback );
  };

  Permutation.prototype = {
    constructor: Permutation,

    size: function() {
      return this.indices.length;
    },

    apply: function( arrayOrInt ) {
      if ( isArray( arrayOrInt ) ) {
        if ( arrayOrInt.length !== this.size() ) {
          throw new Error( 'Permutation length ' + this.size() + ' not equal to list length ' + arrayOrInt.length );
        }

        // permute it as an array
        var result = new Array( arrayOrInt.length );
        for ( var i = 0; i < arrayOrInt.length; i++ ) {
          result[ i ] = arrayOrInt[ this.indices[ i ] ];
        }
        return result;
      }
      else {
        // permute a single index
        return this.indices[ arrayOrInt ];
      }
    },

    // The inverse of this permutation
    inverted: function() {
      var newPermutation = new Array( this.size() );
      for ( var i = 0; i < this.size(); i++ ) {
        newPermutation[ this.indices[ i ] ] = i;
      }
      return new Permutation( newPermutation );
    },

    withIndicesPermuted: function( indices ) {
      var result = [];
      var that = this;
      Permutation.forEachPermutation( indices, function( integers ) {
        var oldIndices = that.indices;
        var newPermutation = oldIndices.slice( 0 );

        for ( var i = 0; i < indices.length; i++ ) {
          newPermutation[ indices[ i ] ] = oldIndices[ integers[ i ] ];
        }
        result.push( new Permutation( newPermutation ) );
      } );
      return result;
    },

    toString: function() {
      return 'P[' + this.indices.join( ', ' ) + ']';
    }
  };

  Permutation.testMe = function( console ) {
    var a = new Permutation( [ 1, 4, 3, 2, 0 ] );
    console.log( a.toString() );

    var b = a.inverted();
    console.log( b.toString() );

    console.log( b.withIndicesPermuted( [ 0, 3, 4 ] ).toString() );

    console.log( Permutation.permutations( 4 ).toString() );
  };

  return Permutation;
} );

// Copyright 2014, University of Colorado Boulder

/**
 * A mathematical plane in 3 dimensions determined by a normal vector to the plane and the distance to the closest
 * point on the plane to the origin
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Plane3',['require','DOT/dot','DOT/Vector3'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );
  var Vector3 = require( 'DOT/Vector3' );

  /*
   * @constructor
   * @param {Vector3} normal - A normal vector (perpendicular) to the plane
   * @param {number} distance - The signed distance to the plane from the origin, so that normal.times( distance )
   *                            will be a point on the plane.
   */
  function Plane3( normal, distance ) {
    this.normal = normal;
    this.distance = distance;

    assert && assert( Math.abs( normal.magnitude() - 1 ) < 0.01 );

    phetAllocation && phetAllocation( 'Plane3' );
  }

  dot.register( 'Plane3', Plane3 );

  Plane3.prototype = {
    constructor: Plane3,

    /*
     * @param {Ray3} ray
     * @returns The intersection {Vector3} of the ray with the plane
     */
    intersectWithRay: function( ray ) {
      return ray.pointAtDistance( ray.distanceToPlane( this ) );
    }
  };

  Plane3.XY = new Plane3( new Vector3( 0, 0, 1 ), 0 );
  Plane3.XZ = new Plane3( new Vector3( 0, 1, 0 ), 0 );
  Plane3.YZ = new Plane3( new Vector3( 1, 0, 0 ), 0 );

  /*
   * @param {Vector3} a - first point
   * @param {Vector3} b - second point
   * @param {Vector3} c - third point
   */
  Plane3.fromTriangle = function( a, b, c ) {
    var normal = ( c.minus( a ) ).cross( b.minus( a ) );
    if ( normal.magnitude() === 0 ) {
      return null;
    }
    normal.normalize();

    return new Plane3( normal, normal.dot( a ) );
  };

  return Plane3;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Quaternion, see http://en.wikipedia.org/wiki/Quaternion
 *
 * TODO: convert from JME-style parameterization into classical mathematical description?
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Quaternion',['require','DOT/dot','PHET_CORE/Poolable','DOT/Vector3','DOT/Matrix3','DOT/Util'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  var Poolable = require( 'PHET_CORE/Poolable' );
  require( 'DOT/Vector3' );
  require( 'DOT/Matrix3' );
  require( 'DOT/Util' );

  function Quaternion( x, y, z, w ) {
    this.setXYZW( x, y, z, w );

    phetAllocation && phetAllocation( 'Quaternion' );
  }

  dot.register( 'Quaternion', Quaternion );

  Quaternion.prototype = {
    constructor: Quaternion,

    isQuaternion: true,

    setXYZW: function( x, y, z, w ) {
      this.x = x !== undefined ? x : 0;
      this.y = y !== undefined ? y : 0;
      this.z = z !== undefined ? z : 0;
      this.w = w !== undefined ? w : 1;
    },

    /*---------------------------------------------------------------------------*
     * Immutables
     *----------------------------------------------------------------------------*/

    plus: function( quat ) {
      return new Quaternion( this.x + quat.x, this.y + quat.y, this.z + quat.z, this.w + quat.w );
    },

    timesScalar: function( s ) {
      return new Quaternion( this.x * s, this.y * s, this.z * s, this.w * s );
    },

    // standard quaternion multiplication (hamilton product)
    timesQuaternion: function( quat ) {
      // TODO: note why this is the case? product noted everywhere is the other one mentioned!
      // mathematica-style
//        return new Quaternion(
//                this.x * quat.x - this.y * quat.y - this.z * quat.z - this.w * quat.w,
//                this.x * quat.y + this.y * quat.x + this.z * quat.w - this.w * quat.z,
//                this.x * quat.z - this.y * quat.w + this.z * quat.x + this.w * quat.y,
//                this.x * quat.w + this.y * quat.z - this.z * quat.y + this.w * quat.x
//        );

      // JME-style
      return new Quaternion(
        this.x * quat.w - this.z * quat.y + this.y * quat.z + this.w * quat.x,
        -this.x * quat.z + this.y * quat.w + this.z * quat.x + this.w * quat.y,
        this.x * quat.y - this.y * quat.x + this.z * quat.w + this.w * quat.z,
        -this.x * quat.x - this.y * quat.y - this.z * quat.z + this.w * quat.w
      );

      /*
       Mathematica!
       In[13]:= Quaternion[-0.0, -0.0024999974, 0.0, 0.9999969] ** Quaternion[-0.9864071, 0.0016701065, -0.0050373166, 0.16423558]
       Out[13]= Quaternion[-0.164231, 0.00750332, 0.00208069, -0.986391]

       In[17]:= Quaternion[-0.0024999974, 0.0, 0.9999969, 0] ** Quaternion[0.0016701065, -0.0050373166, 0.16423558, -0.9864071]
       Out[17]= Quaternion[-0.164239, -0.986391, 0.00125951, 0.00750332]

       JME contains the rearrangement of what is typically called {w,x,y,z}
       */
    },

    timesVector3: function( v ) {
      if ( v.magnitude() === 0 ) {
        return new dot.Vector3();
      }

      // TODO: optimization?
      return new dot.Vector3(
        this.w * this.w * v.x + 2 * this.y * this.w * v.z - 2 * this.z * this.w * v.y + this.x * this.x * v.x + 2 * this.y * this.x * v.y + 2 * this.z * this.x * v.z - this.z * this.z * v.x - this.y * this.y * v.x,
        2 * this.x * this.y * v.x + this.y * this.y * v.y + 2 * this.z * this.y * v.z + 2 * this.w * this.z * v.x - this.z * this.z * v.y + this.w * this.w * v.y - 2 * this.x * this.w * v.z - this.x * this.x * v.y,
        2 * this.x * this.z * v.x + 2 * this.y * this.z * v.y + this.z * this.z * v.z - 2 * this.w * this.y * v.x - this.y * this.y * v.z + 2 * this.w * this.x * v.y - this.x * this.x * v.z + this.w * this.w * v.z
      );
    },

    magnitude: function() {
      return Math.sqrt( this.magnitudeSquared() );
    },

    magnitudeSquared: function() {
      return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    },

    normalized: function() {
      var magnitude = this.magnitude();
      assert && assert( magnitude !== 0, 'Cannot normalize a zero-magnitude quaternion' );
      return this.timesScalar( 1 / magnitude );
    },

    negated: function() {
      return new Quaternion( -this.x, -this.y, -this.z, -this.w );
    },

    toRotationMatrix: function() {
      // see http://en.wikipedia.org/wiki/Rotation_matrix#Quaternion

      var norm = this.magnitudeSquared();
      var flip = ( norm === 1 ) ? 2 : ( norm > 0 ) ? 2 / norm : 0;

      var xx = this.x * this.x * flip;
      var xy = this.x * this.y * flip;
      var xz = this.x * this.z * flip;
      var xw = this.w * this.x * flip;
      var yy = this.y * this.y * flip;
      var yz = this.y * this.z * flip;
      var yw = this.w * this.y * flip;
      var zz = this.z * this.z * flip;
      var zw = this.w * this.z * flip;

      return dot.Matrix3.dirtyFromPool().columnMajor(
        1 - ( yy + zz ),
        ( xy + zw ),
        ( xz - yw ),
        ( xy - zw ),
        1 - ( xx + zz ),
        ( yz + xw ),
        ( xz + yw ),
        ( yz - xw ),
        1 - ( xx + yy )
      );
    }
  };

  Quaternion.fromEulerAngles = function( yaw, roll, pitch ) {
    var sinPitch = Math.sin( pitch * 0.5 );
    var cosPitch = Math.cos( pitch * 0.5 );
    var sinRoll = Math.sin( roll * 0.5 );
    var cosRoll = Math.cos( roll * 0.5 );
    var sinYaw = Math.sin( yaw * 0.5 );
    var cosYaw = Math.cos( yaw * 0.5 );

    var a = cosRoll * cosPitch;
    var b = sinRoll * sinPitch;
    var c = cosRoll * sinPitch;
    var d = sinRoll * cosPitch;

    return new Quaternion(
      a * sinYaw + b * cosYaw,
      d * cosYaw + c * sinYaw,
      c * cosYaw - d * sinYaw,
      a * cosYaw - b * sinYaw
    );
  };

  Quaternion.fromRotationMatrix = function( matrix ) {
    var v00 = matrix.m00();
    var v01 = matrix.m01();
    var v02 = matrix.m02();
    var v10 = matrix.m10();
    var v11 = matrix.m11();
    var v12 = matrix.m12();
    var v20 = matrix.m20();
    var v21 = matrix.m21();
    var v22 = matrix.m22();

    // from graphics gems code
    var trace = v00 + v11 + v22;
    var sqt;

    // we protect the division by s by ensuring that s>=1
    if ( trace >= 0 ) {
      sqt = Math.sqrt( trace + 1 );
      return new Quaternion(
        ( v21 - v12 ) * 0.5 / sqt,
        ( v02 - v20 ) * 0.5 / sqt,
        ( v10 - v01 ) * 0.5 / sqt,
        0.5 * sqt
      );
    }
    else if ( ( v00 > v11 ) && ( v00 > v22 ) ) {
      sqt = Math.sqrt( 1 + v00 - v11 - v22 );
      return new Quaternion(
        sqt * 0.5,
        ( v10 + v01 ) * 0.5 / sqt,
        ( v02 + v20 ) * 0.5 / sqt,
        ( v21 - v12 ) * 0.5 / sqt
      );
    }
    else if ( v11 > v22 ) {
      sqt = Math.sqrt( 1 + v11 - v00 - v22 );
      return new Quaternion(
        ( v10 + v01 ) * 0.5 / sqt,
        sqt * 0.5,
        ( v21 + v12 ) * 0.5 / sqt,
        ( v02 - v20 ) * 0.5 / sqt
      );
    }
    else {
      sqt = Math.sqrt( 1 + v22 - v00 - v11 );
      return new Quaternion(
        ( v02 + v20 ) * 0.5 / sqt,
        ( v21 + v12 ) * 0.5 / sqt,
        sqt * 0.5,
        ( v10 - v01 ) * 0.5 / sqt
      );
    }
  };

  /**
   * Find a quaternion that transforms a unit vector A into a unit vector B. There
   * are technically multiple solutions, so this only picks one.
   *
   * @param a Unit vector A
   * @param b Unit vector B
   * @return A quaternion s.t. Q * A = B
   */
  Quaternion.getRotationQuaternion = function( a, b ) {
    return Quaternion.fromRotationMatrix( dot.Matrix3.rotateAToB( a, b ) );
  };

  // spherical linear interpolation - blending two quaternions
  Quaternion.slerp = function( a, b, t ) {
    // if they are identical, just return one of them
    if ( a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w ) {
      return a;
    }

    var dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    if ( dot < 0 ) {
      b = b.negated();
      dot = -dot;
    }

    // how much of each quaternion should be contributed
    var ratioA = 1 - t;
    var ratioB = t;

    // tweak them if necessary
    if ( ( 1 - dot ) > 0.1 ) {
      var theta = Math.acos( dot );
      var invSinTheta = ( 1 / Math.sin( theta ) );

      ratioA = ( Math.sin( ( 1 - t ) * theta ) * invSinTheta );
      ratioB = ( Math.sin( ( t * theta ) ) * invSinTheta );
    }

    return new Quaternion(
      ratioA * a.x + ratioB * b.x,
      ratioA * a.y + ratioB * b.y,
      ratioA * a.z + ratioB * b.z,
      ratioA * a.w + ratioB * b.w
    );
  };

  Poolable.mixin( Quaternion, {
    defaultFactory: function() { return new Quaternion(); },
    constructorDuplicateFactory: function( pool ) {
      return function( x, y, z, w ) {
        if ( pool.length ) {
          return pool.pop().set( x, y, z, w );
        }
        else {
          return new Quaternion( x, y, z, w );
        }
      };
    }
  } );

  return Quaternion;
} );

// Copyright 2015, University of Colorado Boulder

/**
 * Random number generator with an optional seed.
 *
 * @author John Blanco
 * @author Mohamed Safi
 * @author Aaron Davis
 * @author Sam Reid
 */
define( 'DOT/Random',['require','DOT/Util','DOT/dot'],function( require ) {
  'use strict';

  // modules
  var Util = require( 'DOT/Util' );
  var dot = require( 'DOT/dot' );

  function Random( options ) {
    options = _.extend( {

      // {Tandem} for deterministic playback in randomized sims
      tandem: null,

      // {number|null} seed for the random number generator.
      //               when seed is null, Math.random() is used
      seed: null,

      // {boolean} if true, use the seed specified statically in the preloads for replicable playback in phet-io
      // this is a convenience option since it will be a common occurrence to use the replicable playback seed
      // if staticSeed and seed are both specified, there will be an assertion error.
      staticSeed: false

    }, options );

    if ( options.seed !== null && options.staticSeed ) {
      assert && assert( false, 'cannot specify seed and useChipperSeed, use one or the other' );
    }

    var seed = options.staticSeed ? window.phet.chipper.randomSeed : options.seed;
    this.setSeed( seed );

    options.tandem && options.tandem.addInstance( this );
  }

  dot.register( 'Random', Random );

  Random.prototype = {

    constructor: Random,

    /**
     * Re-seed the random number generator, or null to use Math.random()
     * @param seed
     */
    setSeed: function( seed ) {
      this.seed = seed;

      // Use "new" to create a local prng without altering Math.random.
      this.seedrandom = this.seed !== null ? new Math.seedrandom( this.seed + '' ) : null;
    },

    getSeed: function() {
      return this.seed;
    },

    random: function() {
      return this.seed === null ? Math.random() : this.seedrandom();
    },

    nextBoolean: function() {
      return this.random() >= 0.5;
    },

    nextInt: function( n ) {
      var value = this.random() * n;
      return value | 0; // convert to int
    },

    nextDouble: function() {
      var vv = this.random();
      return vv;
    },

    /**
     * @public
     * @returns {number}
     * // TODO: Seed this
     */
    nextGaussian: function() {
      // random gaussian with mean = 0 and standard deviation = 1
      return Util.boxMullerTransform( 0, 1 );
    }
  };

  return Random;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * 3-dimensional ray
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Ray3',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  function Ray3( position, direction ) {
    this.position = position;
    this.direction = direction;
  }

  dot.register( 'Ray3', Ray3 );

  Ray3.prototype = {
    constructor: Ray3,

    shifted: function( distance ) {
      return new Ray3( this.pointAtDistance( distance ), this.direction );
    },

    pointAtDistance: function( distance ) {
      return this.position.plus( this.direction.timesScalar( distance ) );
    },

    // @param {Plane3} plane
    distanceToPlane: function( plane ) {
      return ( plane.distance - this.position.dot( plane.normal ) ) / this.direction.dot( plane.normal );
    },

    toString: function() {
      return this.position.toString() + ' => ' + this.direction.toString();
    }
  };

  return Ray3;
} );

// Copyright 2013-2014, University of Colorado Boulder

/**
 * A 2D rectangle-shaped bounded area, with a convenience name and constructor. Totally functionally
 * equivalent to Bounds2, but with a different constructor.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Rectangle',['require','DOT/dot','PHET_CORE/inherit','DOT/Bounds2'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );

  function Rectangle( x, y, width, height ) {
    assert && assert( height !== undefined, 'Rectangle requires 4 parameters' );
    Bounds2.call( this, x, y, x + width, y + height );
  }

  dot.register( 'Rectangle', Rectangle );

  inherit( Bounds2, Rectangle );

  return Rectangle;
} );

// Copyright 2014-2015, University of Colorado Boulder

/**
 * A sphere in 3 dimensions (NOT a 3-sphere).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Sphere3',['require','DOT/dot'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );

  /*
   * @constructor
   * @param {Vector3} center - The center of the sphere
   * @param {number} radius - The radius of the sphere
   */
  function Sphere3( center, radius ) {
    this.center = center;
    this.radius = radius;

    assert && assert( radius >= 0 );

    phetAllocation && phetAllocation( 'Sphere3' );
  }

  dot.register( 'Sphere3', Sphere3 );

  Sphere3.prototype = {
    constructor: Sphere3,

    /*
     * @param {Ray3} ray - The ray to intersect with the sphere
     * @param {number} epsilon - A small varing-point value to be used to handle intersections tangent to the sphere
     * @returns An intersection result { distance, hitPoint, normal, fromOutside }, or null if the sphere is behind the ray
     */
    intersect: function( ray, epsilon ) {
      var raydir = ray.direction;
      var pos = ray.position;
      var centerToRay = pos.minus( this.center );

      // basically, we can use the quadratic equation to solve for both possible hit points (both +- roots are the hit points)
      var tmp = raydir.dot( centerToRay );
      var centerToRayDistSq = centerToRay.magnitudeSquared();
      var det = 4 * tmp * tmp - 4 * ( centerToRayDistSq - this.radius * this.radius );
      if ( det < epsilon ) {
        // ray misses sphere entirely
        return null;
      }

      var base = raydir.dot( this.center ) - raydir.dot( pos );
      var sqt = Math.sqrt( det ) / 2;

      // the "first" entry point distance into the sphere. if we are inside the sphere, it is behind us
      var ta = base - sqt;

      // the "second" entry point distance
      var tb = base + sqt;

      if ( tb < epsilon ) {
        // sphere is behind ray, so don't return an intersection
        return null;
      }

      var hitPositionB = ray.pointAtDistance( tb );
      var normalB = hitPositionB.minus( this.center ).normalized();

      if ( ta < epsilon ) {
        // we are inside the sphere
        // in => out
        return {
          distance: tb,
          hitPoint: hitPositionB,
          normal: normalB.negated(),
          fromOutside: false
        };
      }
      else {
        // two possible hits
        var hitPositionA = ray.pointAtDistance( ta );
        var normalA = hitPositionA.minus( this.center ).normalized();

        // close hit, we have out => in
        return {
          distance: ta,
          hitPoint: hitPositionA,
          normal: normalA,
          fromOutside: true
        };
      }
    },

    /*
     * @param {Ray3} ray - The ray to intersect with the sphere
     * @param {number} epsilon - A small varing-point value to be used to handle intersections tangent to the sphere
     * @returns An array of intersection results like { distance, hitPoint, normal, fromOutside }. Will be 0 or 2, with
     *          the "proper" intersection first, if applicable (closest in front of the ray).
     */
    intersections: function( ray, epsilon ) {
      var raydir = ray.direction;
      var pos = ray.position;
      var centerToRay = pos.minus( this.center );

      // basically, we can use the quadratic equation to solve for both possible hit points (both +- roots are the hit points)
      var tmp = raydir.dot( centerToRay );
      var centerToRayDistSq = centerToRay.magnitudeSquared();
      var det = 4 * tmp * tmp - 4 * ( centerToRayDistSq - this.radius * this.radius );
      if ( det < epsilon ) {
        // ray misses sphere entirely
        return [];
      }

      var base = raydir.dot( this.center ) - raydir.dot( pos );
      var sqt = Math.sqrt( det ) / 2;

      // the "first" entry point distance into the sphere. if we are inside the sphere, it is behind us
      var ta = base - sqt;

      // the "second" entry point distance
      var tb = base + sqt;

      if ( tb < epsilon ) {
        // sphere is behind ray, so don't return an intersection
        return [];
      }

      var hitPositionB = ray.pointAtDistance( tb );
      var normalB = hitPositionB.minus( this.center ).normalized();

      var hitPositionA = ray.pointAtDistance( ta );
      var normalA = hitPositionA.minus( this.center ).normalized();

      var resultB = {
        distance: tb,
        hitPoint: hitPositionB,
        normal: normalB.negated(),
        fromOutside: false
      };
      var resultA = {
        distance: ta,
        hitPoint: hitPositionA,
        normal: normalA,
        fromOutside: true
      };
      if ( ta < epsilon ) {
        // we are inside the sphere
        // in => out

        return [ resultB, resultA ];
      }
      else {
        // two possible hits

        // close hit, we have out => in
        return [ resultA, resultB ];
      }
    }
  };

  return Sphere3;
} );

// Copyright 2013-2015, University of Colorado Boulder

/**
 * Forward and inverse transforms with 4x4 matrices, allowing flexibility including affine and perspective transformations.
 *
 * Methods starting with 'transform' will apply the transform from our
 * primary matrix, while methods starting with 'inverse' will apply the transform from the inverse of our matrix.
 *
 * Generally, this means transform.inverseThing( transform.transformThing( thing ) ).equals( thing ).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Transform4',['require','DOT/dot','AXON/Events','PHET_CORE/inherit','DOT/Matrix4','DOT/Vector3','DOT/Ray3'],function( require ) {
  'use strict';

  var dot = require( 'DOT/dot' );
  var Events = require( 'AXON/Events' );
  var inherit = require( 'PHET_CORE/inherit' );

  require( 'DOT/Matrix4' );
  require( 'DOT/Vector3' );
  require( 'DOT/Ray3' );

  var scratchMatrix = new dot.Matrix4();

  function checkMatrix( matrix ) {
    return ( matrix instanceof dot.Matrix4 ) && matrix.isFinite();
  }

  /**
   * Creates a transform based around an initial matrix.
   * @constructor
   * @public
   *
   * @param {Matrix4} matrix
   */
  function Transform4( matrix ) {
    Events.call( this );

    // @private {Matrix4} - The primary matrix used for the transform
    this.matrix = dot.Matrix4.IDENTITY.copy();

    // @private {Matrix4} - The inverse of the primary matrix, computed lazily
    this.inverse = dot.Matrix4.IDENTITY.copy();

    // @private {Matrix4} - The transpose of the primary matrix, computed lazily
    this.matrixTransposed = dot.Matrix4.IDENTITY.copy();

    // @private {Matrix4} - The inverse of the transposed primary matrix, computed lazily
    this.inverseTransposed = dot.Matrix4.IDENTITY.copy();


    // @private {boolean} - Whether this.inverse has been computed based on the latest primary matrix
    this.inverseValid = true;

    // @private {boolean} - Whether this.matrixTransposed has been computed based on the latest primary matrix
    this.transposeValid = true;

    // @private {boolean} - Whether this.inverseTransposed has been computed based on the latest primary matrix
    this.inverseTransposeValid = true;

    if ( matrix ) {
      this.setMatrix( matrix );
    }

    phetAllocation && phetAllocation( 'Transform4' );
  }

  dot.register( 'Transform4', Transform4 );

  inherit( Events, Transform4, {
    /*---------------------------------------------------------------------------*
     * mutators
     *---------------------------------------------------------------------------*/

    /**
     * Sets the value of the primary matrix directly from a Matrix4. Does not change the Matrix4 instance of this
     * Transform4.
     * @public
     *
     * @param {Matrix4} matrix
     */
    setMatrix: function( matrix ) {
      assert && assert( checkMatrix( matrix ), 'Matrix has NaNs, non-finite values, or isn\'t a matrix!' );

      // copy the matrix over to our matrix
      this.matrix.set( matrix );

      // set flags and notify
      this.invalidate();
    },

    /**
     * This should be called after our internal matrix is changed. It marks the other dependent matrices as invalid,
     * and sends out notifications of the change.
     * @private
     */
    invalidate: function() {
      // sanity check
      assert && assert( this.matrix.isFinite() );

      // dependent matrices now invalid
      this.inverseValid = false;
      this.transposeValid = false;
      this.inverseTransposeValid = false;

      this.trigger0( 'change' );
    },

    /**
     * Modifies the primary matrix such that: this.matrix = matrix * this.matrix.
     * @public
     *
     * @param {Matrix4} matrix
     */
    prepend: function( matrix ) {
      assert && assert( checkMatrix( matrix ), 'Matrix has NaNs, non-finite values, or isn\'t a matrix!' );

      // In the absence of a prepend-multiply function in Matrix4, copy over to a scratch matrix instead
      // TODO: implement a prepend-multiply directly in Matrix4 for a performance increase
      scratchMatrix.set( this.matrix );
      this.matrix.set( matrix );
      this.matrix.multiplyMatrix( scratchMatrix );

      // set flags and notify
      this.invalidate();
    },

    /**
     * Modifies the primary matrix such that: this.matrix = this.matrix * matrix
     * @public
     *
     * @param {Matrix4} matrix
     */
    append: function( matrix ) {
      assert && assert( checkMatrix( matrix ), 'Matrix has NaNs, non-finite values, or isn\'t a matrix!' );

      this.matrix.multiplyMatrix( matrix );

      // set flags and notify
      this.invalidate();
    },

    /**
     * Like prepend(), but prepends the other transform's matrix.
     * @public
     *
     * @param {Transform4} transform
     */
    prependTransform: function( transform ) {
      this.prepend( transform.matrix );
    },

    /**
     * Like append(), but appends the other transform's matrix.
     * @public
     *
     * @param {Transform4} transform
     */
    appendTransform: function( transform ) {
      this.append( transform.matrix );
    },

    /**
     * Sets the transform of a Canvas context to be equivalent to the 2D affine part of this transform.
     * @public
     *
     * @param {CanvasRenderingContext2D} context
     */
    applyToCanvasContext: function( context ) {
      context.setTransform( this.matrix.m00(), this.matrix.m10(), this.matrix.m01(), this.matrix.m11(), this.matrix.m03(), this.matrix.m13() );
    },

    /*---------------------------------------------------------------------------*
     * getters
     *---------------------------------------------------------------------------*/

    /**
     * Creates a copy of this transform.
     * @public
     *
     * @returns {Transform4}
     */
    copy: function() {
      var transform = new Transform4( this.matrix );

      transform.inverse = this.inverse;
      transform.matrixTransposed = this.matrixTransposed;
      transform.inverseTransposed = this.inverseTransposed;

      transform.inverseValid = this.inverseValid;
      transform.transposeValid = this.transposeValid;
      transform.inverseTransposeValid = this.inverseTransposeValid;
    },

    /**
     * Returns the primary matrix of this transform.
     * @public
     *
     * @returns {Matrix4}
     */
    getMatrix: function() {
      return this.matrix;
    },

    /**
     * Returns the inverse of the primary matrix of this transform.
     * @public
     *
     * @returns {Matrix4}
     */
    getInverse: function() {
      if ( !this.inverseValid ) {
        this.inverseValid = true;

        this.inverse.set( this.matrix );
        this.inverse.invert();
      }
      return this.inverse;
    },

    /**
     * Returns the transpose of the primary matrix of this transform.
     * @public
     *
     * @returns {Matrix4}
     */
    getMatrixTransposed: function() {
      if ( !this.transposeValid ) {
        this.transposeValid = true;

        this.matrixTransposed.set( this.matrix );
        this.matrixTransposed.transpose();
      }
      return this.matrixTransposed;
    },

    /**
     * Returns the inverse of the transpose of matrix of this transform.
     * @public
     *
     * @returns {Matrix4}
     */
    getInverseTransposed: function() {
      if ( !this.inverseTransposeValid ) {
        this.inverseTransposeValid = true;

        this.inverseTransposed.set( this.getInverse() ); // triggers inverse to be valid
        this.inverseTransposed.transpose();
      }
      return this.inverseTransposed;
    },

    /**
     * Returns whether our primary matrix is known to be an identity matrix. If false is returned, it doesn't necessarily
     * mean our matrix isn't an identity matrix, just that it is unlikely in normal usage.
     * @public
     *
     * @returns {boolean}
     */
    isIdentity: function() {
      return this.matrix.type === dot.Matrix4.Types.IDENTITY;
    },

    /**
     * Returns whether any components of our primary matrix are either infinite or NaN.
     * @public
     *
     * @returns {boolean}
     */
    isFinite: function() {
      return this.matrix.isFinite();
    },

    /*---------------------------------------------------------------------------*
     * forward transforms (for Vector3 or scalar)
     *---------------------------------------------------------------------------*/

    /**
     * Transforms a 3-dimensional vector like it is a point with a position (translation is applied).
     * @public
     *
     * For an affine matrix $M$, the result is the homogeneous multiplication $M\begin{bmatrix} x \\ y \\ z \\ 1 \end{bmatrix}$.
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    transformPosition3: function( v ) {
      return this.matrix.timesVector3( v );
    },

    /**
     * Transforms a 3-dimensional vector like position is irrelevant (translation is not applied).
     * @public
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    transformDelta3: function( v ) {
      return this.matrix.timesRelativeVector3( v );
    },

    /**
     * Transforms a 3-dimensional vector like it is a normal to a surface (so that the surface is transformed, and the new
     * normal to the surface at the transformed point is returned).
     * @public
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    transformNormal3: function( v ) {
      return this.getInverse().timesTransposeVector3( v );
    },

    /**
     * Returns the x-coordinate difference for two transformed vectors, which add the x-coordinate difference of the input
     * x (and same y,z values) beforehand.
     * @public
     *
     * @param {number} x
     * @returns {number}
     */
    transformDeltaX: function( x ) {
      return this.transformDelta3( new dot.Vector3( x, 0, 0 ) ).x;
    },

    /**
     * Returns the y-coordinate difference for two transformed vectors, which add the y-coordinate difference of the input
     * y (and same x,z values) beforehand.
     * @public
     *
     * @param {number} y
     * @returns {number}
     */
    transformDeltaY: function( y ) {
      return this.transformDelta3( new dot.Vector3( 0, y, 0 ) ).y;
    },

    /**
     * Returns the z-coordinate difference for two transformed vectors, which add the z-coordinate difference of the input
     * z (and same x,y values) beforehand.
     * @public
     *
     * @param {number} z
     * @returns {number}
     */
    transformDeltaZ: function( z ) {
      return this.transformDelta3( new dot.Vector3( 0, 0, z ) ).z;
    },

    /**
     * Returns a transformed ray.
     * @pubic
     *
     * @param {Ray3} ray
     * @returns {Ray3}
     */
    transformRay: function( ray ) {
      return new dot.Ray3(
        this.transformPosition3( ray.position ),
        this.transformPosition3( ray.position.plus( ray.direction ) ).minus( this.transformPosition3( ray.position ) ) );
    },

    /*---------------------------------------------------------------------------*
     * inverse transforms (for Vector3 or scalar)
     *---------------------------------------------------------------------------*/

    /**
     * Transforms a 3-dimensional vector by the inverse of our transform like it is a point with a position (translation is applied).
     * @public
     *
     * For an affine matrix $M$, the result is the homogeneous multiplication $M^{-1}\begin{bmatrix} x \\ y \\ z \\ 1 \end{bmatrix}$.
     *
     * This is the inverse of transformPosition3().
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    inversePosition3: function( v ) {
      return this.getInverse().timesVector3( v );
    },

    /**
     * Transforms a 3-dimensional vector by the inverse of our transform like position is irrelevant (translation is not applied).
     * @public
     *
     * This is the inverse of transformDelta3().
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    inverseDelta3: function( v ) {
      // inverse actually has the translation rolled into the other coefficients, so we have to make this longer
      return this.inversePosition3( v ).minus( this.inversePosition3( dot.Vector3.ZERO ) );
    },

    /**
     * Transforms a 3-dimensional vector by the inverse of our transform like it is a normal to a curve (so that the
     * curve is transformed, and the new normal to the curve at the transformed point is returned).
     * @public
     *
     * This is the inverse of transformNormal3().
     *
     * @param {Vector3} v
     * @returns {Vector3}
     */
    inverseNormal3: function( v ) {
      return this.matrix.timesTransposeVector3( v );
    },

    /**
     * Returns the x-coordinate difference for two inverse-transformed vectors, which add the x-coordinate difference of the input
     * x (and same y,z values) beforehand.
     * @public
     *
     * This is the inverse of transformDeltaX().
     *
     * @param {number} x
     * @returns {number}
     */
    inverseDeltaX: function( x ) {
      return this.inverseDelta3( new dot.Vector3( x, 0, 0 ) ).x;
    },

    /**
     * Returns the y-coordinate difference for two inverse-transformed vectors, which add the y-coordinate difference of the input
     * y (and same x,z values) beforehand.
     * @public
     *
     * This is the inverse of transformDeltaY().
     *
     * @param {number} y
     * @returns {number}
     */
    inverseDeltaY: function( y ) {
      return this.inverseDelta3( new dot.Vector3( 0, y, 0 ) ).y;
    },

    /**
     * Returns the z-coordinate difference for two inverse-transformed vectors, which add the z-coordinate difference of the input
     * z (and same x,y values) beforehand.
     * @public
     *
     * This is the inverse of transformDeltaZ().
     *
     * @param {number} z
     * @returns {number}
     */
    inverseDeltaZ: function( z ) {
      return this.inverseDelta3( new dot.Vector3( 0, 0, z ) ).z;
    },

    /**
     * Returns an inverse-transformed ray.
     * @pubic
     *
     * This is the inverse of transformRay()
     *
     * @param {Ray3} ray
     * @returns {Ray3}
     */
    inverseRay: function( ray ) {
      return new dot.Ray3(
        this.inversePosition3( ray.position ),
        this.inversePosition3( ray.position.plus( ray.direction ) ).minus( this.inversePosition3( ray.position ) )
      );
    }
  } );

  return Transform4;
} );

// Copyright 2013-2015, University of Colorado Boulder

define( 'DOT/main',[
  'DOT/dot',
  'DOT/BinPacker',
  'DOT/Bounds2',
  'DOT/Bounds3',
  'DOT/Complex',
  'DOT/ConvexHull2',
  'DOT/Dimension2',
  'DOT/EigenvalueDecomposition',
  'DOT/LinearFunction',
  'DOT/LUDecomposition',
  'DOT/Matrix',
  'DOT/Matrix3',
  'DOT/Matrix4',
  'DOT/MatrixOps3',
  'DOT/Permutation',
  'DOT/Plane3',
  'DOT/QRDecomposition',
  'DOT/Quaternion',
  'DOT/Random',
  'DOT/Ray2',
  'DOT/Ray3',
  'DOT/Rectangle',
  'DOT/SingularValueDecomposition',
  'DOT/Sphere3',
  'DOT/Transform3',
  'DOT/Transform4',
  'DOT/Util',
  'DOT/Vector2',
  'DOT/Vector3',
  'DOT/Vector4'
], function( dot ) {
  'use strict';
  return dot;
} );

// Copyright 2014-2015, University of Colorado Boulder

/**
 * Removes a single (the first) matching object from an Array.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/arrayRemove',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  /*
   * @param {Array} arr
   * @param {*} item - The item to remove from the array
   */
  function arrayRemove( arr, item ) {
    assert && assert( arr instanceof Array, 'arrayRemove either takes an Array' );

    var index = _.indexOf( arr, item );
    assert && assert( index >= 0, 'item not found in Array' );

    arr.splice( index, 1 );
  }

  phetCore.register( 'arrayRemove', arrayRemove );

  return arrayRemove;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * Creates an array of results from an iterator that takes a callback.
 *
 * For instance, if calling a function f( g ) will call g( 1 ), g( 2 ), and g( 3 ),
 * collect( function( callback ) { f( callback ); } );
 * will return [1,2,3].
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/collect',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  function collect( iterate ) {
    assert && assert( typeof iterate === 'function' );
    var result = [];
    iterate( function( ob ) {
      result.push( ob );
    } );
    return result;
  }

  phetCore.register( 'collect', collect );

  return collect;
} );
// Copyright 2014-2015, University of Colorado Boulder

/**
 * Scans through potential properties on an object to detect prefixed forms, and returns the first match.
 *
 * E.g. currently:
 * phetCore.detectPrefix( document.createElement( 'div' ).style, 'transform' ) === 'webkitTransform'
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/detectPrefix',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  // @returns the best String str where obj[str] !== undefined, or returns undefined if that is not available
  function detectPrefix( obj, name ) {
    if ( obj[ name ] !== undefined ) { return name; }

    // prepare for camelCase
    name = name.charAt( 0 ).toUpperCase() + name.slice( 1 );

    // Chrome planning to not introduce prefixes in the future, hopefully we will be safe
    if ( obj[ 'moz' + name ] !== undefined ) { return 'moz' + name; }
    if ( obj[ 'Moz' + name ] !== undefined ) { return 'Moz' + name; } // some prefixes seem to have all-caps?
    if ( obj[ 'webkit' + name ] !== undefined ) { return 'webkit' + name; }
    if ( obj[ 'ms' + name ] !== undefined ) { return 'ms' + name; }
    if ( obj[ 'o' + name ] !== undefined ) { return 'o' + name; }
    return undefined;
  }

  phetCore.register( 'detectPrefix', detectPrefix );

  return detectPrefix;
} );
// Copyright 2014-2015, University of Colorado Boulder

/**
 * Scans through potential event properties on an object to detect prefixed forms, and returns the first match.
 *
 * E.g. currently:
 * phetCore.detectPrefixEvent( document, 'fullscreenchange' ) === 'webkitfullscreenchange'
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/detectPrefixEvent',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  // @returns the best String str where obj['on'+str] !== undefined, or returns undefined if that is not available
  function detectPrefixEvent( obj, name, isEvent ) {
    if ( obj[ 'on' + name ] !== undefined ) { return name; }

    // Chrome planning to not introduce prefixes in the future, hopefully we will be safe
    if ( obj[ 'on' + 'moz' + name ] !== undefined ) { return 'moz' + name; }
    if ( obj[ 'on' + 'Moz' + name ] !== undefined ) { return 'Moz' + name; } // some prefixes seem to have all-caps?
    if ( obj[ 'on' + 'webkit' + name ] !== undefined ) { return 'webkit' + name; }
    if ( obj[ 'on' + 'ms' + name ] !== undefined ) { return 'ms' + name; }
    if ( obj[ 'on' + 'o' + name ] !== undefined ) { return 'o' + name; }
    return undefined;
  }

  phetCore.register( 'detectPrefixEvent', detectPrefixEvent );

  return detectPrefixEvent;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * Escaping of HTML content that will be placed in the body, inside an element as a node.
 *
 * This is NOT for escaping something in other HTML contexts, for example as an attribute value
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
define( 'PHET_CORE/escapeHTML',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  function escapeHTML( str ) {
    // see https://www.owasp.org/index.php/XSS_(Cross_Site_Scripting)_Prevention_Cheat_Sheet
    // HTML Entity Encoding
    return str
      .replace( /&/g, '&amp;' )
      .replace( /</g, '&lt;' )
      .replace( />/g, '&gt;' )
      .replace( /\"/g, '&quot;' )
      .replace( /\'/g, '&#x27;' )
      .replace( /\//g, '&#x2F;' );
  }

  phetCore.register( 'escapeHTML', escapeHTML );

  return escapeHTML;
} );
// Copyright 2014-2015, University of Colorado Boulder

/**
 * Abstraction for timed-event series that helps with variable frame-rates. Useful for things that need to happen at a
 * specific rate real-time regardless of the frame-rate.
 *
 * An EventTimer is created with a specific event "model" that determines when events occur, and a callback that will
 * be triggered for each event (with its time elapsed since it should have occurred).
 *
 * To run the EventTimer, call step( realTimeElapsed ), and it will call your callback for every event that would have
 * occurred over that time-frame (possibly zero).
 *
 * For example, create a timer with a constant rate that it will fire events every 1 time units:
 *
 * var timer = new phetCore.EventTimer( new phetCore.EventTimer.ConstantEventModel( 1 ), function( timeElapsed ) {
 *   console.log( 'event with timeElapsed: ' + timeElapsed );
 * } );
 *
 * Stepping once for 1.5 time units will fire once (0.5 seconds since the "end" of the step), and will be 0.5 seconds
 * from the next step:
 *
 * timer.step( 1.5 );
 * > event with timeElapsed: 0.5
 *
 * Stepping for a longer time will result in more events:
 *
 * timer.step( 6 );
 * > event with timeElapsed: 5.5
 * > event with timeElapsed: 4.5
 * > event with timeElapsed: 3.5
 * > event with timeElapsed: 2.5
 * > event with timeElapsed: 1.5
 * > event with timeElapsed: 0.5
 *
 * A step with zero time will trigger no events:
 *
 * timer.step( 0 );
 *
 * The timer will fire an event once it reaches the exact point in time:
 *
 * timer.step( 1.5 );
 * > event with timeElapsed: 1
 * > event with timeElapsed: 0
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/EventTimer',['require','PHET_CORE/phetCore','PHET_CORE/inherit'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );
  var inherit = require( 'PHET_CORE/inherit' );

  /*
   * Create an event timer with a specific model (determines the time between events), and a callback to be called
   * for events.
   * @public
   *
   * @param {Object with getPeriodBeforeNextEvent(): Number} eventModel: getPeriodBeforeNextEvent() will be called at
   *    the start and after every event to determine the time required to pass by before the next event occurs.
   * @param {function} eventCallback( timeElapsed ): Will be called for every event. The timeElapsed passed in as the
   *    only argument denotes the time elapsed since the event would have occurred. E.g. if we step for 5 seconds and
   *    our event would have occurred 1 second into that step, the timeElapsed will be 4 seconds, since after the end
   *    of the 5 seconds the event would have happened 4 seconds ago.
   */
  function EventTimer( eventModel, eventCallback ) {
    assert && assert( typeof eventCallback === 'function', 'EventTimer requires a callback' );

    // @private
    this.eventModel = eventModel;
    this.eventCallback = eventCallback;

    // @private
    this.timeBeforeNextEvent = this.eventModel.getPeriodBeforeNextEvent();
  }

  phetCore.register( 'EventTimer', EventTimer );

  inherit( Object, EventTimer, {
    /**
     * Steps the timer forward by a certain amount of time. This may cause 0 or more events to actually occur.
     * @public
     *
     * @param {number} dt
     */
    step: function( dt ) {
      while ( dt >= this.timeBeforeNextEvent ) {
        dt -= this.timeBeforeNextEvent;
        this.timeBeforeNextEvent = this.eventModel.getPeriodBeforeNextEvent();

        // how much time has elapsed since this event began
        this.eventCallback( dt );
      }

      // use up the remaining DT
      this.timeBeforeNextEvent -= dt;
    }
  } );

  /*
   * Event model that will fire events at a constant rate. An event will occur every 1/rate time units.
   * @public
   *
   * @param {number} rate
   */
  EventTimer.ConstantEventModel = inherit( Object, function ConstantEventRate( rate ) {
    assert && assert( typeof rate === 'number',
      'The rate should be a number' );
    assert && assert( rate > 0,
      'We need to have a strictly positive rate in order to prevent infinite loops.' );

    this.rate = rate;
  }, {
    // @public
    getPeriodBeforeNextEvent: function() {
      return 1 / this.rate;
    }
  } );

  /*
   * Event model that will fire events averaging a certain rate, but with the time between events being uniformly
   * random.
   * @public
   *
   * The pseudoRandomNumberSource, when called, should generate uniformly distributed random numbers in the range [0,1).
   *
   * @param {number} rate
   * @param {function} pseudoRandomNumberSource() : Number
   */
  EventTimer.UniformEventModel = inherit( Object, function UniformEventModel( rate, pseudoRandomNumberSource ) {
    assert && assert( typeof rate === 'number',
      'The rate should be a number' );
    assert && assert( typeof pseudoRandomNumberSource === 'function',
      'The pseudo-random number source should be a function' );
    assert && assert( rate > 0,
      'We need to have a strictly positive rate in order to prevent infinite loops.' );

    this.rate = rate;
    this.pseudoRandomNumberSource = pseudoRandomNumberSource;
  }, {
    // @public
    getPeriodBeforeNextEvent: function() {
      var uniformRandomNumber = this.pseudoRandomNumberSource();
      assert && assert( typeof uniformRandomNumber === 'number' &&
      uniformRandomNumber >= 0 && uniformRandomNumber < 1,
        'Our uniform random number is outside of its expected range with a value of ' + uniformRandomNumber );

      // sample the exponential distribution
      return uniformRandomNumber * 2 / this.rate;
    }
  } );

  /*
   * Event model that will fire events corresponding to a Poisson process with the specified rate.
   * The pseudoRandomNumberSource, when called, should generate uniformly distributed random numbers in the range [0,1).
   * @public
   *
   * @param {number} rate
   * @param {function} pseudoRandomNumberSource() : number
   */
  EventTimer.PoissonEventModel = inherit( Object, function PoissonEventModel( rate, pseudoRandomNumberSource ) {
    assert && assert( typeof rate === 'number',
      'The time between events should be a number' );
    assert && assert( typeof pseudoRandomNumberSource === 'function',
      'The pseudo-random number source should be a function' );
    assert && assert( rate > 0,
      'We need to have a strictly positive poisson rate in order to prevent infinite loops.' );

    this.rate = rate;
    this.pseudoRandomNumberSource = pseudoRandomNumberSource;
  }, {
    // @public
    getPeriodBeforeNextEvent: function() {
      // A poisson process can be described as having an independent exponential distribution for the time between
      // consecutive events.
      // see http://en.wikipedia.org/wiki/Exponential_distribution#Generating_exponential_variates and
      // http://en.wikipedia.org/wiki/Poisson_process

      var uniformRandomNumber = this.pseudoRandomNumberSource();
      assert && assert( typeof uniformRandomNumber === 'number' &&
      uniformRandomNumber >= 0 && uniformRandomNumber < 1,
        'Our uniform random number is outside of its expected range with a value of ' + uniformRandomNumber );

      // sample the exponential distribution
      return -Math.log( uniformRandomNumber ) / this.rate;
    }
  } );

  return EventTimer;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * Loads a script
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/loadScript',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  /*
   * Load a script. The only required argument is src, and can be specified either as
   * loadScript( "<url>" ) or loadScript( { src: "<url>", ... other options ... } ).
   *
   * Arguments:
   *   src:         The source of the script to load
   *   callback:    A callback to call (with no arguments) once the script is loaded and has been executed
   *   async:       Whether the script should be loaded asynchronously. Defaults to true
   *   cacheBuster: Whether the URL should have an appended query string to work around caches
   */
  function loadScript( args ) {
    // handle a string argument
    if ( typeof args === 'string' ) {
      args = { src: args };
    }

    var src = args.src;
    var callback = args.callback;
    var async = args.async === undefined ? true : args.async;
    var cacheBuster = args.cacheBuster === undefined ? false : args.cacheBuster;

    var called = false;

    var script = document.createElement( 'script' );
    script.type = 'text/javascript';
    script.async = async;
    script.onload = script.onreadystatechange = function() {
      var state = this.readyState;
      if ( state && state !== 'complete' && state !== 'loaded' ) {
        return;
      }

      if ( !called ) {
        called = true;

        if ( callback ) {
          callback();
        }
      }
    };

    // make sure things aren't cached, just in case
    script.src = src + ( cacheBuster ? '?random=' + Math.random().toFixed( 10 ) : '' );

    var other = document.getElementsByTagName( 'script' )[ 0 ];
    other.parentNode.insertBefore( script, other );
  }

  phetCore.register( 'loadScript', loadScript );

  return loadScript;
} );
// Copyright 2014-2015, University of Colorado Boulder

/**
 * Creates an array of arrays, which consists of pairs of objects from the input array without duplication.
 *
 * For example, phetCore.pairs( [ 'a', 'b', 'c' ] ) will return:
 * [ [ 'a', 'b' ], [ 'a', 'c' ], [ 'b', 'c' ] ]
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/pairs',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  function pairs( array ) {
    var result = [];
    var length = array.length;
    if ( length > 1 ) {
      for ( var i = 0; i < length - 1; i++ ) {
        var first = array[ i ];
        for ( var j = i + 1; j < length; j++ ) {
          result.push( [ first, array[ j ] ] );
        }
      }
    }
    return result;
  }

  phetCore.register( 'pairs', pairs );

  return pairs;
} );

// Copyright 2014-2015, University of Colorado Boulder

/**
 * Partitions an array into two arrays: the first contains all elements that satisfy the predicate, and the second
 * contains all the (other) elements that do not satisfy the predicate.
 *
 * e.g. partition( [1,2,3,4], function( n ) { return n % 2 === 0; } ) will return [[2,4],[1,3]]
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/partition',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  function partition( array, predicate ) {
    assert && assert( array instanceof Array );
    assert && assert( typeof predicate === 'function' );

    var satisfied = [];
    var unsatisfied = [];
    var length = array.length;
    for ( var i = 0; i < length; i++ ) {
      if ( predicate( array[ i ] ) ) {
        satisfied.push( array[ i ] );
      }
      else {
        unsatisfied.push( array[ i ] );
      }
    }

    return [ satisfied, unsatisfied ];
  }

  phetCore.register( 'partition', partition );

  return partition;
} );
// Copyright 2013-2015, University of Colorado Boulder

/**
 * Code for testing which platform is running.  Use sparingly, if at all!
 *
 * Sample usage:
 * if (platform.firefox) {node.renderer = 'canvas';}
 *
 * @author Sam Reid
 */
define( 'PHET_CORE/platform',['require','PHET_CORE/phetCore'],function( require ) {
  'use strict';

  var phetCore = require( 'PHET_CORE/phetCore' );

  var ua = navigator.userAgent;

  // Checks to see whether we are IE, and if so whether the version matches.
  function isIE( version ) {
    return getInternetExplorerVersion() === version;
  }

  //IE11 no longer reports MSIE in the user agent string, see https://github.com/phetsims/phet-core/issues/12
  //This code is adapted from http://stackoverflow.com/questions/17907445/how-to-detect-ie11
  function getInternetExplorerVersion() {
    var rv = -1;
    var re = null;
    if ( navigator.appName === 'Microsoft Internet Explorer' ) {
      re = new RegExp( 'MSIE ([0-9]{1,}[.0-9]{0,})' );
      if ( re.exec( ua ) !== null ) {
        rv = parseFloat( RegExp.$1 );
      }
    }
    else if ( navigator.appName === 'Netscape' ) {
      re = new RegExp( 'Trident/.*rv:([0-9]{1,}[.0-9]{0,})' );
      if ( re.exec( ua ) !== null ) {
        rv = parseFloat( RegExp.$1 );
      }
    }
    return rv;
  }

  var platform = {
    // Whether the browser is most likely Firefox
    firefox: ua.toLowerCase().indexOf( 'firefox' ) > -1,

    // Whether the browser is most likely Safari running on iOS
    // See http://stackoverflow.com/questions/3007480/determine-if-user-navigated-from-mobile-safari
    mobileSafari: !!( ua.match( /(iPod|iPhone|iPad)/ ) && ua.match( /AppleWebKit/ ) ),

    // Whether the browser is a matching version of Safari running on OS X
    safari5: !!( ua.match( /Version\/5\./ ) && ua.match( /Safari\// ) && ua.match( /AppleWebKit/ ) ),
    safari6: !!( ua.match( /Version\/6\./ ) && ua.match( /Safari\// ) && ua.match( /AppleWebKit/ ) ),
    safari7: !!( ua.match( /Version\/7\./ ) && ua.match( /Safari\// ) && ua.match( /AppleWebKit/ ) ),

    // Whether the browser is some type of IE (Internet Explorer)
    ie: getInternetExplorerVersion() !== -1,

    // Whether the browser is a specific version of IE (Internet Explorer)
    ie9: isIE( 9 ),
    ie10: isIE( 10 ),
    ie11: isIE( 11 ),

    // Whether the browser has Android in its user agent
    android: ua.indexOf( 'Android' ) > 0,

    // Whether the browser is Microsoft Edge
    edge: !!ua.match( /Edge\// ),

    // Whether the browser is Chromium-based (usually Chrome)
    chromium: (/chrom(e|ium)/).test( ua.toLowerCase() ) && !ua.match( /Edge\// )
  };
  phetCore.register( 'platform', platform );

  return platform;
} );
// Copyright 2013-2015, University of Colorado Boulder

define( 'PHET_CORE/main',[
  'PHET_CORE/phetCore',
  'PHET_CORE/arrayRemove',
  'PHET_CORE/cleanArray',
  'PHET_CORE/collect',
  'PHET_CORE/detectPrefix',
  'PHET_CORE/detectPrefixEvent',
  'PHET_CORE/escapeHTML',
  'PHET_CORE/EventTimer',
  'PHET_CORE/extend',
  'PHET_CORE/inherit',
  'PHET_CORE/isArray',
  'PHET_CORE/loadScript',
  'PHET_CORE/pairs',
  'PHET_CORE/partition',
  'PHET_CORE/phetAllocation',
  'PHET_CORE/platform',
  'PHET_CORE/Poolable'
], function( phetCore ) {
  'use strict';
  return phetCore;
} );

// Copyright 2013-2015, University of Colorado Boulder

require.config( {
  deps: [ 'main', 'AXON/main', 'DOT/main', 'PHET_CORE/main' ],

  paths: {
    KITE: '.',
    DOT: '../../dot/js',
    PHET_CORE: '../../phet-core/js',
    AXON: '../../axon/js'
  },

  // optional cache buster to make browser refresh load all included scripts, can be disabled with ?cacheBuster=false
  urlArgs: Date.now()
} );

define("config", function(){});

 window.kite = require( 'main' ); window.axon = require( 'AXON/main' ); window.dot = require( 'DOT/main' ); window.phetCore = require( 'PHET_CORE/main' ); }());
