(function() {
  if ( !window.hasOwnProperty( '_' ) ) {
    throw new Error( 'Underscore/Lodash not found: _' );
  }

// Copyright 2002-2014, University of Colorado Boulder

/*
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

(function(){
  

  window.assertions = window.assertions || {};
  window.assertions.assertFunction = window.assertions.assertFunction || function( predicate, message ) {
    var result = typeof predicate === 'function' ? predicate() : predicate;

    if ( !result ) {

      //Log the stack trace to IE.  Just creating an Error is not enough, it has to be caught to get a stack.
      if ( window.navigator && window.navigator.appName === 'Microsoft Internet Explorer' ) {
        try { throw new Error(); }
        catch( e ) { message = message + ', stack=\n' + e.stack; }
      }

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

// Copyright 2002-2014, University of Colorado Boulder

define( 'PHET_CORE/core',['require'],function( require ) {
  

  // no phetAllocation initialized, since we don't need it with just phet-core, and this file is required before that

  // will be filled in by other modules
  return {};
} );

// Copyright 2002-2014, University of Colorado Boulder

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

define( 'PHET_CORE/phetAllocation',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  core.phetAllocation = function phetAllocation( name ) {
    if ( window.alloc ) {
      var stack;
      try { throw new Error(); }
      catch( e ) { stack = e.stack; }

      if ( !window.alloc[name] ) {
        window.alloc[name] = { count: 0, stacks: {} };
      }
      var log = window.alloc[name];

      log.count++;
      if ( !log.stacks[stack] ) {
        log.stacks[stack] = 1;
      }
      else {
        log.stacks[stack] += 1;
      }
      log.report = function() {
        var stacks = Object.keys( log.stacks );
        stacks = _.sortBy( stacks, function( key ) { return log.stacks[key]; } );
        _.each( stacks, function( stack ) {
          console.log( log.stacks[stack] + ': ' + stack );
        } );
      };
    }
  };

  return core.phetAllocation;
} );
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

define( 'KITE/kite',['require','PHET_CORE/phetAllocation'],function( require ) {
  

  // object allocation tracking
  window.phetAllocation = require( 'PHET_CORE/phetAllocation' );

  var kite = {
    svgNumber: function( n ) {
      return n.toFixed( 20 );
    }
  };

  // will be filled in by other modules
  return kite;
} );

// Copyright 2002-2014, University of Colorado Boulder

define( 'DOT/dot',['require','PHET_CORE/phetAllocation'],function( require ) {
  

  // object allocation tracking
  window.phetAllocation = require( 'PHET_CORE/phetAllocation' );

  var dot = function dot() {
    switch( arguments.length ) {
      case 2:
        return new dot.Vector2( arguments[0], arguments[1] );
      case 3:
        return new dot.Vector3( arguments[0], arguments[1], arguments[2] );
      case 4:
        return new dot.Vector4( arguments[0], arguments[1], arguments[2], arguments[3] );
      default:
        throw new Error( 'dot takes 2-4 arguments' );
    }
  };

  // TODO: performance: check browser speed to compare how fast this is. We may need to add a 32 option for GL ES.
  dot.FastArray = window.Float64Array ? window.Float64Array : window.Array;

  // will be filled in by other modules
  return dot;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Like Underscore's _.extend, but with hardcoded support for ES5 getters/setters.
 *
 * See https://github.com/documentcloud/underscore/pull/986.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/extend',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  core.extend = function extend( obj ) {
    _.each( Array.prototype.slice.call( arguments, 1 ), function( source ) {
      if ( source ) {
        for ( var prop in source ) {
          Object.defineProperty( obj, prop, Object.getOwnPropertyDescriptor( source, prop ) );
        }
      }
    } );
    return obj;
  };

  return core.extend;
} );
// Copyright 2002-2014, University of Colorado Boulder

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
define( 'PHET_CORE/inherit',['require','PHET_CORE/core','PHET_CORE/extend'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );
  var extend = require( 'PHET_CORE/extend' );

  /**
   * @param supertype           Constructor for the supertype.
   * @param subtype             Constructor for the subtype. Generally should contain supertype.call( this, ... )
   * @param prototypeProperties [optional] object containing properties that will be set on the prototype.
   * @param staticProperties [optional] object containing properties that will be set on the constructor function itself
   */
  core.inherit = function inherit( supertype, subtype, prototypeProperties, staticProperties ) {
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
  };

  return core.inherit;
} );
// Copyright 2002-2014, University of Colorado

/**
 * Experimental object pooling mix-in
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/Poolable',['require','PHET_CORE/core','PHET_CORE/extend'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );
  var extend = require( 'PHET_CORE/extend' );

  /*
   * For option details, please see documentation inside this constructor body for now
   */
  core.Poolable = function Poolable( type, options ) {
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

      // fills the object pool up to n instances
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
      type.createFromPool = options.constructorDuplicateFactory( pool );
    }

    /*
     * Frees the object to the pool (instance.freeToPool())
     */
    proto.freeToPool = function() {
      if ( pool.length < options.maxPoolSize ) {
        pool.push( this );
      }
    };
  };

  return core.Poolable;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Utility functions for Dot, placed into the dot.X namespace.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Util',['require','DOT/dot'],function( require ) {
  

  var dot = require( 'DOT/dot' );
  // require( 'DOT/Vector2' ); // Require.js doesn't like the circular reference

  dot.Util = {
    testAssert: function() {
      return 'assert.dot: ' + ( assert ? 'true' : 'false' );
    },

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

    // returns a number between [min,max) with the same equivalence class as value mod (max-min)
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

    // returns a number between (min,max] with the same equivalence class as value mod (max-min)
    moduloBetweenUp: function( value, min, max ) {
      return -Util.moduloBetweenDown( -value, -max, -min );
    },

    // Returns an array of integers from A to B (including both A to B)
    rangeInclusive: function( a, b ) {
      if ( b < a ) {
        return [];
      }
      var result = new Array( b - a + 1 );
      for ( var i = a; i <= b; i++ ) {
        result[i - a] = i;
      }
      return result;
    },

    // Returns an array of integers between A and B (excluding both A to B)
    rangeExclusive: function( a, b ) {
      return Util.rangeInclusive( a + 1, b - 1 );
    },

    toRadians: function( degrees ) {
      return Math.PI * degrees / 180;
    },

    toDegrees: function( radians ) {
      return 180 * radians / Math.PI;
    },

    // find the greatest common denominator using the classic algorithm
    gcd: function( a, b ) {
      return b === 0 ? a : this.gcd( b, a % b );
    },

    // intersection between the line from p1-p2 and the line from p3-p4
    lineLineIntersection: function( p1, p2, p3, p4 ) {
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

    // assumes a sphere with the specified radius, centered at the origin
    sphereRayIntersection: function( radius, ray, epsilon ) {
      epsilon = epsilon === undefined ? 1e-5 : epsilon;

      // center is the origin for now, but leaving in computations so that we can change that in the future. optimize away if needed
      var center = new dot.Vector3();

      var rayDir = ray.dir;
      var pos = ray.pos;
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

    // return an array of real roots of ax^2 + bx + c = 0
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

    // return an array of real roots of ax^3 + bx^2 + cx + d = 0
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

    cubeRoot: function( x ) {
      return x >= 0 ? Math.pow( x, 1 / 3 ) : -Math.pow( -x, 1 / 3 );
    },

    // Linearly interpolate two points and evaluate the line equation for a third point
    // f( a1 ) = b1, f( a2 ) = b2, f( a3 ) = <linear mapped value>
    linear: function( a1, a2, b1, b2, a3 ) {
      return ( b2 - b1 ) / ( a2 - a1 ) * ( a3 - a1 ) + b1;
    },

    /**
     * A predictable implementation of toFixed.
     * JavaScript's toFixed is notoriously buggy, behavior differs depending on browser,
     * because the spec doesn't specify whether to round or floor.
     * @param {number} number
     * @param {number} decimalPlaces
     * @returns {string}
     */
    toFixed: function( number, decimalPlaces ) {
      var multiplier = Math.pow( 10, decimalPlaces );
      var value = Math.round( number * multiplier ) / multiplier;
      return value.toFixed( decimalPlaces );
    },

    // Convenience for returning a number instead of a string.
    toFixedNumber: function( number, decimalPlaces ) {
      return parseFloat( Util.toFixed( number, decimalPlaces ) );
    },

    isInteger: function( n ) {
      return ( typeof n === 'number' ) && ( n % 1 === 0 );
    },

    /*
     * Computes the intersection of two line segments. Algorithm taked from Paul Bourke, 1989:
     * http://astronomy.swin.edu.au/~pbourke/geometry/lineline2d/
     * Ported from MathUtil.java on 9/20/2013 by @samreid
     * line a goes from point 1->2 and line b goes from 3->4
     * @returns a Vector2 of the intersection point, or null if no intersection
     */
    lineSegmentIntersection: function( x1, y1, x2, y2, x3, y3, x4, y4 ) {
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
     *
     * @param point the point
     * @param a start point of a line segment
     * @param b end point of a line segment
     * @returns {Number}
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
     * @param point the point
     * @param a start point of a line segment
     * @param b end point of a line segment
     * @returns {Number}
     */
    distToSegment: function( point, a, b ) { return Math.sqrt( this.distToSegmentSquared( point, a, b ) ); },

    arePointsCollinear: function( a, b, c, epsilon ) {
      if ( epsilon === undefined ) {
        epsilon = 0;
      }
      return Util.triangleArea( a, b, c ) <= epsilon;
    },

    triangleArea: function( a, b, c ) {
      return Math.abs( Util.triangleAreaSigned( a, b, c ) );
    },

    // TODO: investigate which way we want the sign (Canvas or WebGL style)
    triangleAreaSigned: function( a, b, c ) {
      return a.x * ( b.y - c.y ) + b.x * ( c.y - a.y ) + c.x * ( a.y - b.y );
    },

    log10: function( val ) {
      return Math.log( val ) / Math.LN10;
    }
  };
  var Util = dot.Util;

  // make these available in the main namespace directly (for now)
  dot.testAssert = Util.testAssert;
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

  return Util;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Basic 2-dimensional vector
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Vector2',['require','DOT/dot','PHET_CORE/inherit','PHET_CORE/Poolable','DOT/Util'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  require( 'DOT/Util' );
  // require( 'DOT/Vector3' ); // commented out since Require.js complains about the circular dependency

  dot.Vector2 = function Vector2( x, y ) {
    // allow optional parameters
    this.x = x || 0;
    this.y = y || 0;

    assert && assert( typeof this.x === 'number', 'x needs to be a number' );
    assert && assert( typeof this.y === 'number', 'y needs to be a number' );

    phetAllocation && phetAllocation( 'Vector2' );
  };
  var Vector2 = dot.Vector2;

  Vector2.createPolar = function( magnitude, angle ) {
    return new Vector2().setPolar( magnitude, angle );
  };

  Vector2.prototype = {
    constructor: Vector2,
    isVector2: true,
    dimension: 2,

    magnitude: function() {
      return Math.sqrt( this.magnitudeSquared() );
    },

    magnitudeSquared: function() {
      return this.x * this.x + this.y * this.y;
    },

    // the distance between this vector (treated as a point) and another point
    distance: function( point ) {
      return Math.sqrt( this.distanceSquared( point ) );
    },

    // the distance between this vector (treated as a point) and another point specified as x:Number, y:Number
    distanceXY: function( x, y ) {
      var dx = this.x - x;
      var dy = this.y - y;
      return Math.sqrt( dx * dx + dy * dy );
    },

    // the squared distance between this vector (treated as a point) and another point
    distanceSquared: function( point ) {
      var dx = this.x - point.x;
      var dy = this.y - point.y;
      return dx * dx + dy * dy;
    },

    // the squared distance between this vector (treated as a point) and another point as (x,y)
    distanceSquaredXY: function( x, y ) {
      var dx = this.x - x;
      var dy = this.y - y;
      return dx * dx + dy * dy;
    },

    dot: function( v ) {
      return this.x * v.x + this.y * v.y;
    },

    dotXY: function( vx, vy ) {
      return this.x * vx + this.y * vy;
    },

    equals: function( other ) {
      return this.x === other.x && this.y === other.y;
    },

    equalsEpsilon: function( other, epsilon ) {
      if ( !epsilon ) {
        epsilon = 0;
      }
      return Math.max( Math.abs( this.x - other.x ), Math.abs( this.y - other.y ) ) <= epsilon;
    },

    isFinite: function() {
      return isFinite( this.x ) && isFinite( this.y );
    },

    /*---------------------------------------------------------------------------*
     * Immutables
     *----------------------------------------------------------------------------*/

    // create a copy, or if a vector is passed in, set that vector to our value
    copy: function( vector ) {
      if ( vector ) {
        return vector.set( this );
      }
      else {
        return new Vector2( this.x, this.y );
      }
    },

    // z component of the equivalent 3-dimensional cross product (this.x, this.y,0) x (v.x, v.y, 0)
    crossScalar: function( v ) {
      return this.x * v.y - this.y * v.x;
    },

    normalized: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( "Cannot normalize a zero-magnitude vector" );
      }
      else {
        return new Vector2( this.x / mag, this.y / mag );
      }
    },

    withMagnitude: function( magnitude ) {
      return this.copy().setMagnitude( magnitude );
    },

    timesScalar: function( scalar ) {
      return new Vector2( this.x * scalar, this.y * scalar );
    },

    times: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.timesScalar( scalar );
    },

    componentTimes: function( v ) {
      return new Vector2( this.x * v.x, this.y * v.y );
    },

    plus: function( v ) {
      return new Vector2( this.x + v.x, this.y + v.y );
    },

    plusXY: function( x, y ) {
      return new Vector2( this.x + x, this.y + y );
    },

    plusScalar: function( scalar ) {
      return new Vector2( this.x + scalar, this.y + scalar );
    },

    minus: function( v ) {
      return new Vector2( this.x - v.x, this.y - v.y );
    },

    minusXY: function( x, y ) {
      return new Vector2( this.x - x, this.y - y );
    },

    minusScalar: function( scalar ) {
      return new Vector2( this.x - scalar, this.y - scalar );
    },

    dividedScalar: function( scalar ) {
      return new Vector2( this.x / scalar, this.y / scalar );
    },

    negated: function() {
      return new Vector2( -this.x, -this.y );
    },

    angle: function() {
      return Math.atan2( this.y, this.x );
    },

    // equivalent to a -PI/2 rotation (right hand rotation)
    perpendicular: function() {
      return new Vector2( this.y, -this.x );
    },

    angleBetween: function( v ) {
      var thisMagnitude = this.magnitude();
      var vMagnitude = v.magnitude();
      return Math.acos( dot.clamp( ( this.x * v.x + this.y * v.y ) / ( thisMagnitude * vMagnitude ), -1, 1 ) );
    },

    rotated: function( angle ) {
      var newAngle = this.angle() + angle;
      var mag = this.magnitude();
      return new Vector2( mag * Math.cos( newAngle ), mag * Math.sin( newAngle ) );
    },

    // linear interpolation from this (ratio=0) to vector (ratio=1)
    blend: function( vector, ratio ) {
      return new Vector2( this.x + (vector.x - this.x) * ratio, this.y + (vector.y - this.y) * ratio );
    },

    // average position between this and the provided vector
    average: function( vector ) {
      return this.blend( vector, 0.5 );
    },

    toString: function() {
      return 'Vector2(' + this.x + ', ' + this.y + ')';
    },

    toVector3: function() {
      return new dot.Vector3( this.x, this.y );
    },

    /*---------------------------------------------------------------------------*
     * Mutables
     *----------------------------------------------------------------------------*/

    // our core three functions which all mutation should go through
    setXY: function( x, y ) {
      this.x = x;
      this.y = y;
      return this;
    },
    setX: function( x ) {
      this.x = x;
      return this;
    },
    setY: function( y ) {
      this.y = y;
      return this;
    },

    set: function( v ) {
      return this.setXY( v.x, v.y );
    },

    //Sets the magnitude of the vector, keeping the same direction (though a negative magnitude will flip the vector direction)
    setMagnitude: function( m ) {
      var scale = m / this.magnitude();
      return this.multiplyScalar( scale );
    },

    add: function( v ) {
      return this.setXY( this.x + v.x, this.y + v.y );
    },

    addXY: function( x, y ) {
      return this.setXY( this.x + x, this.y + y );
    },

    addScalar: function( scalar ) {
      return this.setXY( this.x + scalar, this.y + scalar );
    },

    subtract: function( v ) {
      return this.setXY( this.x - v.x, this.y - v.y );
    },

    subtractScalar: function( scalar ) {
      return this.setXY( this.x - scalar, this.y - scalar );
    },

    multiplyScalar: function( scalar ) {
      return this.setXY( this.x * scalar, this.y * scalar );
    },

    multiply: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.multiplyScalar( scalar );
    },

    componentMultiply: function( v ) {
      return this.setXY( this.x * v.x, this.y * v.y );
    },

    divideScalar: function( scalar ) {
      return this.setXY( this.x / scalar, this.y / scalar );
    },

    negate: function() {
      return this.setXY( -this.x, -this.y );
    },

    normalize: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( "Cannot normalize a zero-magnitude vector" );
      }
      else {
        return this.divideScalar( mag );
      }
    },

    rotate: function( angle ) {
      var newAngle = this.angle() + angle;
      var mag = this.magnitude();
      return this.setXY( mag * Math.cos( newAngle ), mag * Math.sin( newAngle ) );
    },

    setPolar: function( magnitude, angle ) {
      return this.setXY( magnitude * Math.cos( angle ), magnitude * Math.sin( angle ) );
    }

  };

  // experimental object pooling
  /* jshint -W064 */
  Poolable( Vector2, {
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
   *----------------------------------------------------------------------------*/
  Vector2.Immutable = function ImmutableVector2( x, y ) {
    Vector2.call( this, x, y );
  };
  var Immutable = Vector2.Immutable;

  inherit( Vector2, Immutable );

  // throw errors whenever a mutable method is called on our immutable vector
  Immutable.mutableOverrideHelper = function( mutableFunctionName ) {
    Immutable.prototype[mutableFunctionName] = function() {
      throw new Error( "Cannot call mutable method '" + mutableFunctionName + "' on immutable Vector2" );
    };
  };

  // TODO: better way to handle this list?
  Immutable.mutableOverrideHelper( 'setXY' );
  Immutable.mutableOverrideHelper( 'setX' );
  Immutable.mutableOverrideHelper( 'setY' );

  // helpful immutable constants
  Vector2.ZERO = new Immutable( 0, 0 );
  Vector2.X_UNIT = new Immutable( 1, 0 );
  Vector2.Y_UNIT = new Immutable( 0, 1 );

  return Vector2;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * A 2D rectangle-shaped bounded area (bounding box)
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

define( 'DOT/Bounds2',['require','DOT/dot','PHET_CORE/Poolable','DOT/Vector2'],function( require ) {
  

  var dot = require( 'DOT/dot' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  require( 'DOT/Vector2' );

  //Temporary instances to be used in the transform method.
  var scratchVector2 = new dot.Vector2();

  // not using x,y,width,height so that it can handle infinity-based cases in a better way
  dot.Bounds2 = function Bounds2( minX, minY, maxX, maxY ) {
    assert && assert( maxY !== undefined, 'Bounds2 requires 4 parameters' );
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;

    phetAllocation && phetAllocation( 'Bounds2' );
  };
  var Bounds2 = dot.Bounds2;

  Bounds2.prototype = {
    constructor: Bounds2,

    isBounds: true,
    dimension: 2,

    /*---------------------------------------------------------------------------*
    * Properties
    *----------------------------------------------------------------------------*/

    getWidth: function() { return this.maxX - this.minX; },
    get width() { return this.getWidth(); },

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
    getX: function() { return this.minX; },
    get x() { return this.getX(); },
    getY: function() { return this.minY; },
    get y() { return this.getY(); },

    getMinX: function() { return this.minX; },
    get left() { return this.minX; },
    getMinY: function() { return this.minY; },
    get top() { return this.minY; },
    getMaxX: function() { return this.maxX; },
    get right() { return this.maxX; },
    getMaxY: function() { return this.maxY; },
    get bottom() { return this.maxY; },

    getCenterX: function() { return ( this.maxX + this.minX ) / 2; },
    get centerX() { return this.getCenterX(); },
    getCenterY: function() { return ( this.maxY + this.minY ) / 2; },
    get centerY() { return this.getCenterY(); },

    getLeftTop: function() { return new dot.Vector2( this.minX, this.minY ); },
    get leftTop() { return this.getLeftTop(); },
    getCenterTop: function() { return new dot.Vector2( this.getCenterX(), this.minY ); },
    get centerTop() { return this.getCenterTop(); },
    getRightTop: function() { return new dot.Vector2( this.maxX, this.minY ); },
    get rightTop() { return this.getRightTop(); },
    getLeftCenter: function() { return new dot.Vector2( this.minX, this.getCenterY() ); },
    get leftCenter() { return this.getLeftCenter(); },
    getCenter: function() { return new dot.Vector2( this.getCenterX(), this.getCenterY() ); },
    get center() { return this.getCenter(); },
    getRightCenter: function() { return new dot.Vector2( this.maxX, this.getCenterY() ); },
    get rightCenter() { return this.getRightCenter(); },
    getLeftBottom: function() { return new dot.Vector2( this.minX, this.maxY ); },
    get leftBottom() { return this.getLeftBottom(); },
    getCenterBottom: function() { return new dot.Vector2( this.getCenterX(), this.maxY ); },
    get centerBottom() { return this.getCenterBottom(); },
    getRightBottom: function() { return new dot.Vector2( this.maxX, this.maxY ); },
    get rightBottom() { return this.getRightBottom(); },

    isEmpty: function() { return this.getWidth() < 0 || this.getHeight() < 0; },

    isFinite: function() {
      return isFinite( this.minX ) && isFinite( this.minY ) && isFinite( this.maxX ) && isFinite( this.maxY );
    },

    hasNonzeroArea: function() {
      return this.getWidth() > 0 && this.getHeight() > 0;
    },

    isValid: function() {
      return !this.isEmpty() && this.isFinite();
    },

    // whether the coordinates are inside the bounding box (or on the boundary)
    containsCoordinates: function( x, y ) {
      return this.minX <= x && x <= this.maxX && this.minY <= y && y <= this.maxY;
    },

    // whether the point is inside the bounding box (or on the boundary)
    containsPoint: function( point ) {
      return this.containsCoordinates( point.x, point.y );
    },

    // whether this bounding box completely contains the argument bounding box
    containsBounds: function( bounds ) {
      return this.minX <= bounds.minX && this.maxX >= bounds.maxX && this.minY <= bounds.minY && this.maxY >= bounds.maxY;
    },

    // whether the intersection is non-empty (if they share any part of a boundary, this will be true)
    intersectsBounds: function( bounds ) {
      // TODO: more efficient way of doing this?
      return !this.intersection( bounds ).isEmpty();
    },

    // distance to the closest point inside the Bounds2
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

    // distance to the farthest point inside the Bounds2
    maximumDistanceToPointSquared: function( point ) {
      var x = point.x > this.getCenterX() ? this.minX : this.maxX;
      var y = point.y > this.getCenterY() ? this.minY : this.maxY;
      x -= point.x;
      y -= point.y;
      return x * x + y * y;
    },

    toString: function() {
      return '[x:(' + this.minX + ',' + this.maxX + '),y:(' + this.minY + ',' + this.maxY + ')]';
    },

    equals: function( other ) {
      return this.minX === other.minX && this.minY === other.minY && this.maxX === other.maxX && this.maxY === other.maxY;
    },

    equalsEpsilon: function( other, epsilon ) {
      epsilon = epsilon || 0;
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
    *----------------------------------------------------------------------------*/

    // create a copy, or if bounds is passed in, set that bounds to our value
    copy: function( bounds ) {
      if ( bounds ) {
        return bounds.set( this );
      }
      else {
        return new Bounds2( this.minX, this.minY, this.maxX, this.maxY );
      }
    },

    // immutable operations (bounding-box style handling, so that the relevant bounds contain everything)
    union: function( bounds ) {
      return new Bounds2(
        Math.min( this.minX, bounds.minX ),
        Math.min( this.minY, bounds.minY ),
        Math.max( this.maxX, bounds.maxX ),
        Math.max( this.maxY, bounds.maxY )
      );
    },
    intersection: function( bounds ) {
      return new Bounds2(
        Math.max( this.minX, bounds.minX ),
        Math.max( this.minY, bounds.minY ),
        Math.min( this.maxX, bounds.maxX ),
        Math.min( this.maxY, bounds.maxY )
      );
    },
    // TODO: difference should be well-defined, but more logic is needed to compute

    withCoordinates: function( x, y ) {
      return new Bounds2(
        Math.min( this.minX, x ),
        Math.min( this.minY, y ),
        Math.max( this.maxX, x ),
        Math.max( this.maxY, y )
      );
    },

    // like a union with a point-sized bounding box
    withPoint: function( point ) {
      return this.withCoordinates( point.x, point.y );
    },

    withMinX: function( minX ) { return new Bounds2( minX, this.minY, this.maxX, this.maxY ); },
    withMinY: function( minY ) { return new Bounds2( this.minX, minY, this.maxX, this.maxY ); },
    withMaxX: function( maxX ) { return new Bounds2( this.minX, this.minY, maxX, this.maxY ); },
    withMaxY: function( maxY ) { return new Bounds2( this.minX, this.minY, this.maxX, maxY ); },

    // copy rounded to integral values, expanding where necessary
    roundedOut: function() {
      return new Bounds2(
        Math.floor( this.minX ),
        Math.floor( this.minY ),
        Math.ceil( this.maxX ),
        Math.ceil( this.maxY )
      );
    },

    // copy rounded to integral values, contracting where necessary
    roundedIn: function() {
      return new Bounds2(
        Math.ceil( this.minX ),
        Math.ceil( this.minY ),
        Math.floor( this.maxX ),
        Math.floor( this.maxY )
      );
    },

    // transform a bounding box.
    // NOTE that box.transformed( matrix ).transformed( inverse ) may be larger than the original box
    transformed: function( matrix ) {
      return this.copy().transform( matrix );
    },

    // returns copy expanded on all sides by length d
    dilated: function( d ) {
      return new Bounds2( this.minX - d, this.minY - d, this.maxX + d, this.maxY + d );
    },

    // dilates only in the x direction
    dilatedX: function( x ) {
      return new Bounds2( this.minX - x, this.minY, this.maxX + x, this.maxY );
    },

    // dilates only in the y direction
    dilatedY: function( y ) {
      return new Bounds2( this.minX, this.minY - y, this.maxX, this.maxY + y );
    },

    // dilate with different amounts in the x and y directions
    dilatedXY: function( x, y ) {
      return new Bounds2( this.minX - x, this.minY - y, this.maxX + x, this.maxY + y );
    },

    // returns copy contracted on all sides by length d, or for x/y independently
    eroded: function( d ) { return this.dilated( -d ); },
    erodedX: function( x ) { return this.dilatedX( -x ); },
    erodedY: function( y ) { return this.dilatedY( -y ); },
    erodedXY: function( x, y ) { return this.dilatedXY( -x, -y ); },

    shiftedX: function( x ) {
      return new Bounds2( this.minX + x, this.minY, this.maxX + x, this.maxY );
    },

    shiftedY: function( y ) {
      return new Bounds2( this.minX, this.minY + y, this.maxX, this.maxY + y );
    },

    shifted: function( x, y ) {
      return new Bounds2( this.minX + x, this.minY + y, this.maxX + x, this.maxY + y );
    },

    /*---------------------------------------------------------------------------*
    * Mutable operations
    *----------------------------------------------------------------------------*/

    // mutable core operations (all other mutations should be called through these)
    setMinMax: function( minX, minY, maxX, maxY ) {
      this.minX = minX;
      this.minY = minY;
      this.maxX = maxX;
      this.maxY = maxY;
      return this;
    },
    setMinX: function( minX ) {
      this.minX = minX;
      return this;
    },
    setMinY: function( minY ) {
      this.minY = minY;
      return this;
    },
    setMaxX: function( maxX ) {
      this.maxX = maxX;
      return this;
    },
    setMaxY: function( maxY ) {
      this.maxY = maxY;
      return this;
    },

    set: function( bounds ) {
      return this.setMinMax( bounds.minX, bounds.minY, bounds.maxX, bounds.maxY );
    },

    // mutable union
    includeBounds: function( bounds ) {
      return this.setMinMax(
        Math.min( this.minX, bounds.minX ),
        Math.min( this.minY, bounds.minY ),
        Math.max( this.maxX, bounds.maxX ),
        Math.max( this.maxY, bounds.maxY )
      );
    },

    // mutable intersection
    constrainBounds: function( bounds ) {
      return this.setMinMax(
        Math.max( this.minX, bounds.minX ),
        Math.max( this.minY, bounds.minY ),
        Math.min( this.maxX, bounds.maxX ),
        Math.min( this.maxY, bounds.maxY )
      );
    },

    addCoordinates: function( x, y ) {
      return this.setMinMax(
        Math.min( this.minX, x ),
        Math.min( this.minY, y ),
        Math.max( this.maxX, x ),
        Math.max( this.maxY, y )
      );
    },

    addPoint: function( point ) {
      return this.addCoordinates( point.x, point.y );
    },

    // round to integral values, expanding where necessary
    roundOut: function() {
      return this.setMinMax(
        Math.floor( this.minX ),
        Math.floor( this.minY ),
        Math.ceil( this.maxX ),
        Math.ceil( this.maxY )
      );
    },

    // round to integral values, contracting where necessary
    roundIn: function() {
      return this.setMinMax(
        Math.ceil( this.minX ),
        Math.ceil( this.minY ),
        Math.floor( this.maxX ),
        Math.floor( this.maxY )
      );
    },

    // transform a bounding box.
    // NOTE that box.transformed( matrix ).transformed( inverse ) may be larger than the original box
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

    // expands on all sides by length d
    dilate: function( d ) {
      return this.setMinMax( this.minX - d, this.minY - d, this.maxX + d, this.maxY + d );
    },

    // dilates only in the x direction
    dilateX: function( x ) {
      return this.setMinMax( this.minX - x, this.minY, this.maxX + x, this.maxY );
    },

    // dilates only in the y direction
    dilateY: function( y ) {
      return this.setMinMax( this.minX, this.minY - y, this.maxX, this.maxY + y );
    },

    // dilate with different amounts in the x and y directions
    dilateXY: function( x, y ) {
      return this.setMinMax( this.minX - x, this.minY - y, this.maxX + x, this.maxY + y );
    },

    // contracts on all sides by length d, or for x/y independently
    erode: function( d ) { return this.dilate( -d ); },
    erodeX: function( x ) { return this.dilateX( -x ); },
    erodeY: function( y ) { return this.dilateY( -y ); },
    erodeXY: function( x, y ) { return this.dilateXY( -x, -y ); },

    shiftX: function( x ) {
      return this.setMinMax( this.minX + x, this.minY, this.maxX + x, this.maxY );
    },

    shiftY: function( y ) {
      return this.setMinMax( this.minX, this.minY + y, this.maxX, this.maxY + y );
    },

    shift: function( x, y ) {
      return this.setMinMax( this.minX + x, this.minY + y, this.maxX + x, this.maxY + y );
    },

    /**
     * Find a point in the Bounds2 closest to the specified point.  Used for making sure a dragged object doesn't get outside the visible play area.
     * @param x x point to test
     * @param y y point to test
     * @param {Vector2} result optional Vector2 that can store the return value to avoid allocations
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
  };

  Bounds2.rect = function( x, y, width, height ) {
    return new Bounds2( x, y, x + width, y + height );
  };

  // a volume-less point bounds, which can be dilated to form a centered bounds
  Bounds2.point = function( x, y ) {
    if ( x instanceof dot.Vector2 ) {
      var p = x;
      return new Bounds2( p.x, p.y, p.x, p.y );
    }
    else {
      return new Bounds2( x, y, x, y );
    }
  };

  // experimental object pooling
  /* jshint -W064 */
  Poolable( Bounds2, {
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

  // specific bounds useful for operations
  Bounds2.EVERYTHING = new Bounds2( Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY );
  Bounds2.NOTHING = new Bounds2( Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY );

  return Bounds2;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * 2-dimensional ray
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Ray2',['require','DOT/dot'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  dot.Ray2 = function Ray2( pos, dir ) {
    this.pos = pos;
    this.dir = dir;

    assert && assert( Math.abs( dir.magnitude() - 1 ) < 0.01 );

    phetAllocation && phetAllocation( 'Ray2' );
  };
  var Ray2 = dot.Ray2;

  Ray2.prototype = {
    constructor: Ray2,

    shifted: function( distance ) {
      return new Ray2( this.pointAtDistance( distance ), this.dir );
    },

    pointAtDistance: function( distance ) {
      return this.pos.plus( this.dir.timesScalar( distance ) );
    },

    toString: function() {
      return this.pos.toString() + " => " + this.dir.toString();
    }
  };

  return Ray2;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * A segment represents a specific curve with a start and end.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Segment',['require','KITE/kite','DOT/Util','DOT/Bounds2'],function( require ) {
  

  var kite = require( 'KITE/kite' );

  var DotUtil = require( 'DOT/Util' );
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
   * intersectsBounds         - whether this segment intersects the specified bounding box (not just the segment's bounding box, but the actual segment)
   * windingIntersection      - returns the winding number for intersection with a ray
   * getInteriorExtremaTs     - returns a list of t values where dx/dt or dy/dt is 0 where 0 < t < 1. subdividing on these will result in monotonic segments
   *
   * writeToContext( context ) - draws the segment to the 2D Canvas context, assuming the context's current location is already at the start point
   * transformed( matrix )     - returns a new segment that represents this segment after transformation by the matrix
   */
  kite.Segment = function Segment() {}; // no common construction for now
  var Segment = kite.Segment;

  var identityFunction = function identityFunction( x ) { return x; };

  Segment.prototype = {
    constructor: Segment,

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
        var t = tList[i];
        var arr = right.subdivided( t );
        assert && assert( arr.length === 2 );
        result.push( arr[0] );
        right = arr[1];

        // scale up the remaining t values
        for ( var j = i + 1; j < tList.length; j++ ) {
          tList[j] = DotUtil.linear( t, 1, 0, 1, tList[j] );
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
        segments.push( new Segment.Line( start, end ) );
      }
      else {
        var subdividedSegments = this.subdivided( 0.5 );
        subdividedSegments[0].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, start, middle );
        subdividedSegments[1].toPiecewiseLinearSegments( options, minLevels - 1, maxLevels - 1, segments, middle, end );
      }
      return segments;
    }
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
            bestList = [info];
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
        var ts = [0].concat( segment.getInteriorExtremaTs() ).concat( [1] );
        for ( var i = 0; i < ts.length - 1; i++ ) {
          var ta = ts[i];
          var tb = ts[i + 1];
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

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Linear segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Line',['require','PHET_CORE/inherit','DOT/Bounds2','DOT/Vector2','DOT/Util','KITE/kite','KITE/segments/Segment'],function( require ) {
  

  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Vector2 = require( 'DOT/Vector2' );
  var Util = require( 'DOT/Util' );

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  var scratchVector2 = new Vector2();

  Segment.Line = function Line( start, end ) {
    this._start = start;
    this._end = end;

    // TODO: performance test removal of these undefined declarations
    this._tangent = undefined;
    this._bounds = undefined;
  };
  inherit( Segment, Segment.Line, {

    getStart: function() {
      return this._start;
    },
    get start() { return this._start; },

    getEnd: function() {
      return this._end;
    },
    get end() { return this._end; },

    getStartTangent: function() {
      if ( this._tangent === undefined ) {
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
      if ( this._bounds === undefined ) {
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
        return [this];
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
      return [new Segment.Line( this._start.plus( offset ), this._end.plus( offset ) )];
    },

    strokeRight: function( lineWidth ) {
      var offset = this.getStartTangent().perpendicular().times( lineWidth / 2 );
      return [new Segment.Line( this._end.plus( offset ), this._start.plus( offset ) )];
    },

    // lines are already monotone
    getInteriorExtremaTs: function() { return []; },

    subdivided: function( t ) {
      var pt = this.positionAt( t );
      return [
        new Segment.Line( this._start, pt ),
        new Segment.Line( pt, this._end )
      ];
    },

    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.Line.intersectsBounds unimplemented' ); // TODO: implement
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

      var denom = ray.dir.y * diff.x - ray.dir.x * diff.y;

      // If denominator is 0, the lines are parallel or coincident
      if ( denom === 0 ) {
        return result;
      }

      // linear parameter where start (0) to end (1)
      var t = ( ray.dir.x * ( start.y - ray.pos.y ) - ray.dir.y * ( start.x - ray.pos.x ) ) / denom;

      // check that the intersection point is between the line segment's endpoints
      if ( t < 0 || t >= 1 ) {
        return result;
      }

      // linear parameter where ray.pos (0) to ray.pos+ray.dir (1)
      var s = ( diff.x * ( start.y - ray.pos.y ) - diff.y * ( start.x - ray.pos.x ) ) / denom;

      // bail if it is behind our ray
      if ( s < 0.000001 ) {
        return result;
      }

      // return the proper winding direction depending on what way our line intersection is "pointed"
      var perp = diff.perpendicular();
      result.push( {
        distance: s,
        point: start.plus( diff.times( t ) ),
        normal: perp.dot( ray.dir ) > 0 ? perp.negated() : perp,
        wind: ray.dir.perpendicular().dot( diff ) < 0 ? 1 : -1,
        segment: this
      } );
      return result;
    },

    // returns the resultant winding number of this ray intersecting this segment.
    windingIntersection: function( ray ) {
      var hits = this.intersection( ray );
      if ( hits.length ) {
        return hits[0].wind;
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
      return new Segment.Line( matrix.timesVector2( this._start ), matrix.timesVector2( this._end ) );
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
      return new Segment.Line( this.positionAt( b ), this.positionAt( a + b ) );
    },

    polarToCartesian: function( options ) {
      if ( this._start.x === this._end.x ) {
        // angle is the same, we are still a line segment!
        return [new Segment.Line( Vector2.createPolar( this._start.y, this._start.x ), Vector2.createPolar( this._end.y, this._end.x ) )];
      }
      else if ( this._start.y === this._end.y ) {
        // we have a constant radius, so we are a circular arc
        return [new Segment.Arc( Vector2.ZERO, this._start.y, this._start.x, this._end.x, this._start.x > this._end.x )];
      }
      else {
        return this.toPiecewiseLinearSegments( options );
      }
    }
  } );

  return Segment.Line;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Arc segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Arc',['require','PHET_CORE/inherit','DOT/Vector2','DOT/Bounds2','DOT/Util','KITE/kite','KITE/segments/Segment'],function( require ) {
  

  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var DotUtil = require( 'DOT/Util' );

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  Segment.Arc = function Arc( center, radius, startAngle, endAngle, anticlockwise ) {
    if ( radius < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      radius = -radius;
      startAngle += Math.PI;
      endAngle += Math.PI;
    }

    this._center = center;
    this._radius = radius;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;

    // TODO: performance test removal of these undefined declarations
    this._start = undefined;
    this._end = undefined;
    this._startTangent = undefined;
    this._endTangent = undefined;
    this._actualEndAngle = undefined;
    this._isFullPerimeter = undefined;
    this._angleDifference = undefined;

    // constraints
    assert && assert( !( ( !anticlockwise && endAngle - startAngle <= -Math.PI * 2 ) || ( anticlockwise && startAngle - endAngle <= -Math.PI * 2 ) ), 'Not handling arcs with start/end angles that show differences in-between browser handling' );
    assert && assert( !( ( !anticlockwise && endAngle - startAngle > Math.PI * 2 ) || ( anticlockwise && startAngle - endAngle > Math.PI * 2 ) ), 'Not handling arcs with start/end angles that show differences in-between browser handling' );
  };
  inherit( Segment, Segment.Arc, {

    getCenter: function() {
      return this._center;
    },
    get center() { return this.getCenter(); },

    getRadius: function() {
      return this._radius;
    },
    get radius() { return this.getRadius(); },

    getStartAngle: function() {
      return this._startAngle;
    },
    get startAngle() { return this.getStartAngle(); },

    getEndAngle: function() {
      return this._endAngle;
    },
    get endAngle() { return this.getEndAngle(); },

    getAnticlockwise: function() {
      return this._anticlockwise;
    },
    get anticlockwise() { return this.getAnticlockwise(); },

    getStart: function() {
      if ( this._start === undefined ) {
        this._start = this.positionAtAngle( this._startAngle );
      }
      return this._start;
    },
    get start() { return this.getStart(); },

    getEnd: function() {
      if ( this._end === undefined ) {
        this._end = this.positionAtAngle( this._endAngle );
      }
      return this._end;
    },
    get end() { return this.getEnd(); },

    getStartTangent: function() {
      if ( this._startTangent === undefined ) {
        this._startTangent = this.tangentAtAngle( this._startAngle );
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      if ( this._endTangent === undefined ) {
        this._endTangent = this.tangentAtAngle( this._endAngle );
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    getActualEndAngle: function() {
      if ( this._actualEndAngle === undefined ) {
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
      if ( this._isFullPerimeter === undefined ) {
        this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
      }
      return this._isFullPerimeter;
    },
    get isFullPerimeter() { return this.getIsFullPerimeter(); },

    getAngleDifference: function() {
      if ( this._angleDifference === undefined ) {
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
      if ( this._bounds === undefined ) {
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
        return [this]; // basically, Arcs aren't really degenerate that easily
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

    // TODO: refactor? shared with Segment.EllipticalArc (use this improved version)
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
      return [new Segment.Arc( this._center, this._radius + ( this._anticlockwise ? 1 : -1 ) * lineWidth / 2, this._startAngle, this._endAngle, this._anticlockwise )];
    },

    strokeRight: function( lineWidth ) {
      return [new Segment.Arc( this._center, this._radius + ( this._anticlockwise ? -1 : 1 ) * lineWidth / 2, this._endAngle, this._startAngle, !this._anticlockwise )];
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
        new Segment.Arc( this._center, this._radius, angle0, angleT, this._anticlockwise ),
        new Segment.Arc( this._center, this._radius, angleT, angle1, this._anticlockwise )
      ];
    },

    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.intersectsBounds unimplemented!' );
    },

    intersection: function( ray ) {
      var result = []; // hits in order

      // left here, if in the future we want to better-handle boundary points
      var epsilon = 0;

      // Run a general circle-intersection routine, then we can test the angles later.
      // Solves for the two solutions t such that ray.pos + ray.dir * t is on the circle.
      // Then we check whether the angle at each possible hit point is in our arc.
      var centerToRay = ray.pos.minus( this._center );
      var tmp = ray.dir.dot( centerToRay );
      var centerToRayDistSq = centerToRay.magnitudeSquared();
      var discriminant = 4 * tmp * tmp - 4 * ( centerToRayDistSq - this._radius * this._radius );
      if ( discriminant < epsilon ) {
        // ray misses circle entirely
        return result;
      }
      var base = ray.dir.dot( this._center ) - ray.dir.dot( ray.pos );
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
        return new Segment.EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, 0, startAngle, endAngle, anticlockwise );
      }
      else {
        var radius = scaleVector.x * this._radius;
        return new Segment.Arc( matrix.timesVector2( this._center ), radius, startAngle, endAngle, anticlockwise );
      }
    }
  } );

  return Segment.Arc;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * A Canvas-style stateful (mutable) subpath, which tracks segments in addition to the points.
 *
 * See http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#concept-path
 * for the path / subpath Canvas concept.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/util/Subpath',['require','DOT/Bounds2','KITE/kite','KITE/segments/Line','KITE/segments/Arc'],function( require ) {
  

  var Bounds2 = require( 'DOT/Bounds2' );

  var kite = require( 'KITE/kite' );

  require( 'KITE/segments/Line' );
  require( 'KITE/segments/Arc' );

  // all arguments optional (they are for the copy() method)
  kite.Subpath = function Subpath( segments, points, closed ) {
    this.segments = segments || [];

    // recombine points if necessary, based off of start points of segments + the end point of the last segment
    this.points = points || ( ( segments && segments.length ) ? _.map( segments, function( segment ) { return segment.start; } ).concat( segments[segments.length - 1].end ) : [] );
    this.closed = !!closed;

    // cached stroked shape (so hit testing can be done quickly on stroked shapes)
    this._strokedSubpaths = null;
    this._strokedSubpathsComputed = false;
    this._strokedStyles = null;

    var bounds = this.bounds = Bounds2.NOTHING.copy();
    _.each( this.segments, function( segment ) {
      bounds.includeBounds( segment.bounds );
    } );
  };
  var Subpath = kite.Subpath;
  Subpath.prototype = {
    copy: function() {
      return new Subpath( this.segments.slice( 0 ), this.points.slice( 0 ), this.closed );
    },

    invalidate: function() {
      this._strokedSubpathsComputed = false;
    },

    addPoint: function( point ) {
      this.points.push( point );

      return this; // allow chaining
    },

    addSegmentDirectly: function( segment ) {
      assert && assert( segment.start.isFinite(), 'Segment start is infinite' );
      assert && assert( segment.end.isFinite(), 'Segment end is infinite' );
      assert && assert( segment.startTangent.isFinite(), 'Segment startTangent is infinite' );
      assert && assert( segment.endTangent.isFinite(), 'Segment endTangent is infinite' );
      assert && assert( segment.bounds.isEmpty() || segment.bounds.isFinite(), 'Segment bounds is infinite and non-empty' );
      this.segments.push( segment );
      this.invalidate();

      this.bounds.includeBounds( segment.getBounds() );

      return this; // allow chaining
    },

    addSegment: function( segment ) {
      var subpath = this;
      _.each( segment.getNondegenerateSegments(), function( segment ) {
        subpath.addSegmentDirectly( segment );
      } );

      return this; // allow chaining
    },

    // Adds a line segment from the start to end (if non-zero length) and marks the subpath as closed.
    // NOTE: normally you just want to mark the subpath as closed, and not generate the closing segment this way?
    addClosingSegment: function() {
      if ( this.hasClosingSegment() ) {
        var closingSegment = this.getClosingSegment();
        this.addSegmentDirectly( closingSegment );
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
      return new kite.Segment.Line( this.getLastPoint(), this.getFirstPoint() );
    },

    writeToContext: function( context ) {
      if ( this.isDrawable() ) {
        var startPoint = this.getFirstSegment().start;
        context.moveTo( startPoint.x, startPoint.y ); // the segments assume the current context position is at their start

        var len = this.segments.length;
        for ( var i = 0; i < len; i++ ) {
          this.segments[i].writeToContext( context );
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
        if ( options.methodName && segment[options.methodName] ) {
          return segment[options.methodName]( options );
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
        bounds.includeBounds( this.segments[i].getBoundsWithTransform( matrix ) );
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
        offsets.push( regularSegments[i].strokeLeft( 2 * distance ) );
      }

      var segments = [];
      for ( i = 0; i < regularSegments.length; i++ ) {
        if ( this.closed || i > 0 ) {
          var previousI = ( i > 0 ? i : regularSegments.length ) - 1;
          var center = regularSegments[i].start;
          var fromTangent = regularSegments[previousI].endTangent;
          var toTangent = regularSegments[i].startTangent;

          var startAngle = fromTangent.perpendicular().negated().times( distance ).angle();
          var endAngle = toTangent.perpendicular().negated().times( distance ).angle();
          var anticlockwise = fromTangent.perpendicular().dot( toTangent ) > 0;
          segments.push( new kite.Segment.Arc( center, Math.abs( distance ), startAngle, endAngle, anticlockwise ) );
        }
        segments = segments.concat( offsets[i] );
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
        lineStyles = new kite.LineStyles();
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
      var closingSegment = alreadyClosed ? null : new kite.Segment.Line( this.segments[this.segments.length - 1].end, this.segments[0].start );

      // stroke the logical "left" side of our path
      for ( i = 0; i < this.segments.length; i++ ) {
        if ( i > 0 ) {
          appendLeftSegments( lineStyles.leftJoin( this.segments[i].start, this.segments[i - 1].endTangent, this.segments[i].startTangent ) );
        }
        appendLeftSegments( this.segments[i].strokeLeft( lineWidth ) );
      }

      // stroke the logical "right" side of our path
      for ( i = this.segments.length - 1; i >= 0; i-- ) {
        if ( i < this.segments.length - 1 ) {
          appendRightSegments( lineStyles.rightJoin( this.segments[i].end, this.segments[i].endTangent, this.segments[i + 1].startTangent ) );
        }
        appendRightSegments( this.segments[i].strokeRight( lineWidth ) );
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
      this._strokedStyles = new kite.LineStyles( lineStyles ); // shallow copy, since we consider linestyles to be mutable

      return subpaths;
    }
  };

  return kite.Subpath;
} );

// generated from svgPath.pegjs, with added kite namespace and require.js compatibility

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

  kite.svgPath = {
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
        if ( parseFunctions[startRule] === undefined ) {
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, path ) { return path ? path : []; })( pos0, result0[1] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b ) { return a.concat( b ); })( pos0, result0[0], result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, m, c ) { return c.length ? m.concat( c ) : m; })( pos0, result0[0], result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, cmd, cmds ) { return cmd.concat( cmds ); })( pos0, result0[0], result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return createMoveTo( args, false ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return createMoveTo( args, true ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, pair, list ) { return [pair].concat( list ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_coordinatePair();
          if ( result0 !== null ) {
            result0 = (function( offset, pair ) { return [pair]; })( pos0, result0 );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'lineTo', args: [ arg.x, arg.y ] }; } ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'lineToRelative', args: [ arg.x, arg.y ] }; } ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b ) { return [a].concat( b ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_coordinatePair();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [a]; })( pos0, result0 );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'horizontalLineTo', args: [ arg ] } } ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'horizontalLineToRelative', args: [ arg ] } } ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b ) { return [a].concat( b ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_number();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [a]; })( pos0, result0 );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'verticalLineTo', args: [ arg ] } } ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'verticalLineToRelative', args: [ arg ] } } ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b ) { return [a].concat( b ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_number();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [a]; })( pos0, result0 );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'cubicCurveTo', args: arg } } ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'cubicCurveToRelative', args: arg } } ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, list ) { return [a].concat( list ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_curvetoArgument();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [a]; })( pos0, result0 );
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
                  result0 = [result0, result1, result2, result3, result4];
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
          result0 = (function( offset, a, b, c ) { return [ a.x, a.y, b.x, b.y, c.x, c.y ]; })( pos0, result0[0], result0[2], result0[4] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'smoothCubicCurveTo', args: arg } } ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'smoothCubicCurveToRelative', args: arg } } ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, list ) { return [a].concat( list ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_smoothCurvetoArgument();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [a]; })( pos0, result0 );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b ) { return [ a.x, a.y, b.x, b.y ]; })( pos0, result0[0], result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'quadraticCurveTo', args: arg } } ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'quadraticCurveToRelative', args: arg } } ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, list ) { return [a].concat( list ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_quadraticBezierCurvetoArgument();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [a]; })( pos0, result0 );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b ) { return [ a.x, a.y, b.x, b.y ]; })( pos0, result0[0], result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'smoothQuadraticCurveTo', args: [ arg.x, arg.y ] } } ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'smoothQuadraticCurveToRelative', args: [ arg.x, arg.y ] } } ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, list ) { return [a].concat( list ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_coordinatePair();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [a]; })( pos0, result0 );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'ellipticalArcTo', args: arg } } ); })( pos0, result0[2] );
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
                result0 = [result0, result1, result2];
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
            result0 = (function( offset, args ) { return args.map( function( arg ) { return { cmd: 'ellipticalArcToRelative', args: arg } } ); })( pos0, result0[2] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, list ) { return [a].concat( list ); })( pos0, result0[0], result0[2] );
        }
        if ( result0 === null ) {
          pos = pos0;
        }
        if ( result0 === null ) {
          pos0 = pos;
          result0 = parse_ellipticalArcArgument();
          if ( result0 !== null ) {
            result0 = (function( offset, a ) { return [a]; })( pos0, result0 );
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
                              result0 = [result0, result1, result2, result3, result4, result5, result6, result7, result8, result9, result10];
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
          result0 = (function( offset, rx, ry, rot, largeArc, sweep, to ) { return [ rx, ry, rot, largeArc, sweep, to.x, to.y ] })( pos0, result0[0], result0[2], result0[4], result0[6], result0[8], result0[10] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b ) { return { x: a, y: b }; })( pos0, result0[0], result0[2] );
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
            result0 = [result0, result1];
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
          result0 = (function( offset, sign, number ) { return parseFloat( sign + number, 10 ); })( pos0, result0[0], result0[1] );
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
              result0 = [result0, result1];
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
            result0 = (function( offset, sign, number ) { return parseInt( sign + number, 10 ); })( pos0, result0[0], result0[1] );
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
              result0 = [result0, result1, result2];
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
              result0 = [result0, result1];
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
            result0 = [result0, result1];
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
          result0 = (function( offset, a, b ) { return a + b; })( pos0, result0[0], result0[1] );
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
              result0 = [result0, result1];
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
            result0 = (function( offset, a, b ) { return a + b; })( pos0, result0[0], result0[1] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b ) { return a + '.' + b; })( pos0, result0[0], result0[2] );
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
              result0 = [result0, result1];
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
            result0 = (function( offset, a ) { return a })( pos0, result0[0] );
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
              result0 = [result0, result1, result2];
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
          result0 = (function( offset, a, b, c ) { return a + b + c; })( pos0, result0[0], result0[1], result0[2] );
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
            result0 = [result0, result1];
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
          result0 = (function( offset, a, b ) { return a + b; })( pos0, result0[0], result0[1] );
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
          if ( expected[i] !== lastExpected ) {
            cleanExpected.push( expected[i] );
            lastExpected = expected[i];
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
        var result = [
          {
            cmd: isRelative ? 'moveToRelative' : 'moveTo',
            args: [ args[0].x, args[0].y ]
          }
        ];

        // any other coordinate pairs are implicit lineTos
        if ( args.length > 1 ) {
          for ( var i = 1; i < args.length; i++ ) {
            result.push( {
              cmd: isRelative ? 'lineToRelative' : 'lineTo',
              args: [ args[i].x, args[i].y ]
            } );
          }
        }
        return result;
      }


      var result = parseFunctions[startRule]();

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
  var result = kite.svgPath;

  /* Thrown when a parser encounters a syntax error. */

  result.SyntaxError = function( expected, found, offset, line, column ) {
    function buildMessage( expected, found ) {
      var expectedHumanized, foundHumanized;

      switch( expected.length ) {
        case 0:
          expectedHumanized = "end of input";
          break;
        case 1:
          expectedHumanized = expected[0];
          break;
        default:
          expectedHumanized = expected.slice( 0, expected.length - 1 ).join( ", " )
                                + " or "
            + expected[expected.length - 1];
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

  return result;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Styles needed to determine a stroked line shape.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/util/LineStyles',['require','KITE/kite','DOT/Util'],function( require ) {
  

  var kite = require( 'KITE/kite' );
  var lineLineIntersection = require( 'DOT/Util' ).lineLineIntersection;

  kite.LineStyles = function( args ) {
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
  };
  var LineStyles = kite.LineStyles;
  LineStyles.prototype = {
    constructor: LineStyles,

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
          if ( this.lineDash[i] !== other.lineDash[i] ) {
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
     * Joins two segments together on the logical "left" side, at 'center' (where they meet), and normalized tangent
     * vectors in the direction of the stroking. To join on the "right" side, switch the tangent order and negate them.
     */
    leftJoin: function( center, fromTangent, toTangent ) {
      // where our join path starts and ends
      var fromPoint = center.plus( fromTangent.perpendicular().negated().times( this.lineWidth / 2 ) );
      var toPoint = center.plus( toTangent.perpendicular().negated().times( this.lineWidth / 2 ) );

      var bevel = ( fromPoint.equals( toPoint ) ? [] : [new kite.Segment.Line( fromPoint, toPoint )] );

      // only insert a join on the non-acute-angle side
      if ( fromTangent.perpendicular().dot( toTangent ) > 0 ) {
        switch( this.lineJoin ) {
          case 'round':
            var fromAngle = fromTangent.angle() + Math.PI / 2;
            var toAngle = toTangent.angle() + Math.PI / 2;
            return [new kite.Segment.Arc( center, this.lineWidth / 2, fromAngle, toAngle, true )];
          case 'miter':
            var theta = fromTangent.angleBetween( toTangent.negated() );
            if ( 1 / Math.sin( theta / 2 ) <= this.miterLimit && theta < Math.PI - 0.00001 ) {
              // draw the miter
              var miterPoint = lineLineIntersection( fromPoint, fromPoint.plus( fromTangent ), toPoint, toPoint.plus( toTangent ) );
              return [
                new kite.Segment.Line( fromPoint, miterPoint ),
                new kite.Segment.Line( miterPoint, toPoint )
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
      var fromPoint = center.plus( tangent.perpendicular().times( -this.lineWidth / 2 ) );
      var toPoint = center.plus( tangent.perpendicular().times( this.lineWidth / 2 ) );

      switch( this.lineCap ) {
        case 'butt':
          return [new kite.Segment.Line( fromPoint, toPoint )];
        case 'round':
          var tangentAngle = tangent.angle();
          return [new kite.Segment.Arc( center, this.lineWidth / 2, tangentAngle + Math.PI / 2, tangentAngle - Math.PI / 2, true )];
        case 'square':
          var toLeft = tangent.perpendicular().negated().times( this.lineWidth / 2 );
          var toRight = tangent.perpendicular().times( this.lineWidth / 2 );
          var toFront = tangent.times( this.lineWidth / 2 );

          var left = center.plus( toLeft ).plus( toFront );
          var right = center.plus( toRight ).plus( toFront );
          return [
            new kite.Segment.Line( fromPoint, left ),
            new kite.Segment.Line( left, right ),
            new kite.Segment.Line( right, toPoint )
          ];
      }
    }
  };

  return kite.LineStyles;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Basic 4-dimensional vector
 *
 * TODO: sync with Vector2 changes
 * TODO: add quaternion extension
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Vector4',['require','DOT/dot','DOT/Util'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  require( 'DOT/Util' );
  // require( 'DOT/Vector3' ); // commented out so Require.js doesn't complain about the circular dependency

  dot.Vector4 = function Vector4( x, y, z, w ) {
    // allow optional parameters
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.w = w !== undefined ? w : 1; // since w could be zero!
  };
  var Vector4 = dot.Vector4;

  Vector4.prototype = {
    constructor: Vector4,
    isVector4: true,
    dimension: 4,

    magnitude: function() {
      return Math.sqrt( this.magnitudeSquared() );
    },

    magnitudeSquared: function() {
      this.dot( this );
    },

    // the distance between this vector (treated as a point) and another point
    distance: function( point ) {
      return this.minus( point ).magnitude();
    },

    // the squared distance between this vector (treated as a point) and another point
    distanceSquared: function( point ) {
      return this.minus( point ).magnitudeSquared();
    },

    dot: function( v ) {
      return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
    },

    isFinite: function() {
      return isFinite( this.x ) && isFinite( this.y ) && isFinite( this.z ) && isFinite( this.w );
    },

    equals: function( other ) {
      return this.x === other.x && this.y === other.y && this.z === other.z && this.w === other.w;
    },

    equalsEpsilon: function( other, epsilon ) {
      if ( !epsilon ) {
        epsilon = 0;
      }
      return Math.abs( this.x - other.x ) + Math.abs( this.y - other.y ) + Math.abs( this.z - other.z ) + Math.abs( this.w - other.w ) <= epsilon;
    },

    /*---------------------------------------------------------------------------*
     * Immutables
     *----------------------------------------------------------------------------*/

    // create a copy, or if a vector is passed in, set that vector to our value
    copy: function( vector ) {
      if ( vector ) {
        return vector.set( this );
      }
      else {
        return new Vector4( this.x, this.y, this.z, this.w );
      }
    },

    normalized: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( "Cannot normalize a zero-magnitude vector" );
      }
      else {
        return new Vector4( this.x / mag, this.y / mag, this.z / mag, this.w / mag );
      }
    },

    timesScalar: function( scalar ) {
      return new Vector4( this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar );
    },

    times: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.timesScalar( scalar );
    },

    componentTimes: function( v ) {
      return new Vector4( this.x * v.x, this.y * v.y, this.z * v.z, this.w * v.w );
    },

    plus: function( v ) {
      return new Vector4( this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w );
    },

    plusScalar: function( scalar ) {
      return new Vector4( this.x + scalar, this.y + scalar, this.z + scalar, this.w + scalar );
    },

    minus: function( v ) {
      return new Vector4( this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w );
    },

    minusScalar: function( scalar ) {
      return new Vector4( this.x - scalar, this.y - scalar, this.z - scalar, this.w - scalar );
    },

    dividedScalar: function( scalar ) {
      return new Vector4( this.x / scalar, this.y / scalar, this.z / scalar, this.w / scalar );
    },

    negated: function() {
      return new Vector4( -this.x, -this.y, -this.z, -this.w );
    },

    angleBetween: function( v ) {
      return Math.acos( dot.clamp( this.normalized().dot( v.normalized() ), -1, 1 ) );
    },

    // linear interpolation from this (ratio=0) to vector (ratio=1)
    blend: function( vector, ratio ) {
      return this.plus( vector.minus( this ).times( ratio ) );
    },

    // average position between this and the provided vector
    average: function( vector ) {
      return this.blend( vector, 0.5 );
    },

    toString: function() {
      return "Vector4(" + this.x + ", " + this.y + ", " + this.z + ", " + this.w + ")";
    },

    toVector3: function() {
      return new dot.Vector3( this.x, this.y, this.z );
    },

    /*---------------------------------------------------------------------------*
     * Mutables
     *----------------------------------------------------------------------------*/

    // our core mutables (all mutation should go through these)
    setXYZW: function( x, y, z, w ) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
      return this;
    },
    setX: function( x ) {
      this.x = x;
      return this;
    },
    setY: function( y ) {
      this.y = y;
      return this;
    },
    setZ: function( z ) {
      this.z = z;
      return this;
    },
    setW: function( w ) {
      this.w = w;
      return this;
    },

    set: function( v ) {
      return this.setXYZW( v.x, v.y, v.z, v.w );
    },

    add: function( v ) {
      return this.setXYZW( this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w );
    },

    addScalar: function( scalar ) {
      return this.setXYZW( this.x + scalar, this.y + scalar, this.z + scalar, this.w + scalar );
    },

    subtract: function( v ) {
      return this.setXYZW( this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w );
    },

    subtractScalar: function( scalar ) {
      return this.setXYZW( this.x - scalar, this.y - scalar, this.z - scalar, this.w - scalar );
    },

    multiplyScalar: function( scalar ) {
      return this.setXYZW( this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar );
    },

    multiply: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.multiplyScalar( scalar );
    },

    componentMultiply: function( v ) {
      return this.setXYZW( this.x * v.x, this.y * v.y, this.z * v.z, this.w * v.w );
    },

    divideScalar: function( scalar ) {
      return this.setXYZW( this.x / scalar, this.y / scalar, this.z / scalar, this.w / scalar );
    },

    negate: function() {
      return this.setXYZW( -this.x, -this.y, -this.z, -this.w );
    },

    normalize: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( "Cannot normalize a zero-magnitude vector" );
      }
      else {
        return this.divideScalar( mag );
      }
      return this;
    }
  };

  /*---------------------------------------------------------------------------*
   * Immutable Vector form
   *----------------------------------------------------------------------------*/
  Vector4.Immutable = function( x, y, z, w ) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.w = w !== undefined ? w : 1;
  };
  var Immutable = Vector4.Immutable;

  Immutable.prototype = new Vector4();
  Immutable.prototype.constructor = Immutable;

  // throw errors whenever a mutable method is called on our immutable vector
  Immutable.mutableOverrideHelper = function( mutableFunctionName ) {
    Immutable.prototype[mutableFunctionName] = function() {
      throw new Error( "Cannot call mutable method '" + mutableFunctionName + "' on immutable Vector4" );
    };
  };

  // TODO: better way to handle this list?
  Immutable.mutableOverrideHelper( 'setXYZW' );
  Immutable.mutableOverrideHelper( 'setX' );
  Immutable.mutableOverrideHelper( 'setY' );
  Immutable.mutableOverrideHelper( 'setZ' );
  Immutable.mutableOverrideHelper( 'setW' );

  // helpful immutable constants
  Vector4.ZERO = new Immutable( 0, 0, 0, 0 );
  Vector4.X_UNIT = new Immutable( 1, 0, 0, 0 );
  Vector4.Y_UNIT = new Immutable( 0, 1, 0, 0 );
  Vector4.Z_UNIT = new Immutable( 0, 0, 1, 0 );
  Vector4.W_UNIT = new Immutable( 0, 0, 0, 1 );

  return Vector4;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Basic 3-dimensional vector
 *
 * TODO: sync with Vector2 changes
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Vector3',['require','DOT/dot','DOT/Util','DOT/Vector2','DOT/Vector4'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  require( 'DOT/Util' );
  require( 'DOT/Vector2' );
  require( 'DOT/Vector4' );

  dot.Vector3 = function Vector3( x, y, z ) {
    // allow optional parameters
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
  };
  var Vector3 = dot.Vector3;

  Vector3.prototype = {
    constructor: Vector3,
    isVector3: true,
    dimension: 3,

    magnitude: function() {
      return Math.sqrt( this.magnitudeSquared() );
    },

    magnitudeSquared: function() {
      return this.dot( this );
    },

    // the distance between this vector (treated as a point) and another point
    distance: function( point ) {
      return Math.sqrt( this.distanceSquared( point ) );
    },

    // the squared distance between this vector (treated as a point) and another point
    distanceSquared: function( point ) {
      var dx = this.x - point.x;
      var dy = this.y - point.y;
      var dz = this.z - point.z;
      return dx * dx + dy * dy + dz * dz;
    },

    dot: function( v ) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    },

    isFinite: function() {
      return isFinite( this.x ) && isFinite( this.y ) && isFinite( this.z );
    },

    equals: function( other ) {
      return this.x === other.x && this.y === other.y && this.z === other.z;
    },

    equalsEpsilon: function( other, epsilon ) {
      if ( !epsilon ) {
        epsilon = 0;
      }
      return Math.abs( this.x - other.x ) + Math.abs( this.y - other.y ) + Math.abs( this.z - other.z ) <= epsilon;
    },

    /*---------------------------------------------------------------------------*
     * Immutables
     *----------------------------------------------------------------------------*/

    // create a copy, or if a vector is passed in, set that vector to our value
    copy: function( vector ) {
      if ( vector ) {
        return vector.set( this );
      }
      else {
        return new Vector3( this.x, this.y, this.z );
      }
    },

    cross: function( v ) {
      return new Vector3(
          this.y * v.z - this.z * v.y,
          this.z * v.x - this.x * v.z,
          this.x * v.y - this.y * v.x
      );
    },

    normalized: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( "Cannot normalize a zero-magnitude vector" );
      }
      else {
        return new Vector3( this.x / mag, this.y / mag, this.z / mag );
      }
    },

    withMagnitude: function( magnitude ) {
      return this.copy().setMagnitude( magnitude );
    },

    timesScalar: function( scalar ) {
      return new Vector3( this.x * scalar, this.y * scalar, this.z * scalar );
    },

    times: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.timesScalar( scalar );
    },

    componentTimes: function( v ) {
      return new Vector3( this.x * v.x, this.y * v.y, this.z * v.z );
    },

    plus: function( v ) {
      return new Vector3( this.x + v.x, this.y + v.y, this.z + v.z );
    },

    plusScalar: function( scalar ) {
      return new Vector3( this.x + scalar, this.y + scalar, this.z + scalar );
    },

    minus: function( v ) {
      return new Vector3( this.x - v.x, this.y - v.y, this.z - v.z );
    },

    minusScalar: function( scalar ) {
      return new Vector3( this.x - scalar, this.y - scalar, this.z - scalar );
    },

    dividedScalar: function( scalar ) {
      return new Vector3( this.x / scalar, this.y / scalar, this.z / scalar );
    },

    negated: function() {
      return new Vector3( -this.x, -this.y, -this.z );
    },

    angleBetween: function( v ) {
      return Math.acos( dot.clamp( this.normalized().dot( v.normalized() ), -1, 1 ) );
    },

    // linear interpolation from this (ratio=0) to vector (ratio=1)
    blend: function( vector, ratio ) {
      return this.plus( vector.minus( this ).times( ratio ) );
    },

    // average position between this and the provided vector
    average: function( vector ) {
      return this.blend( vector, 0.5 );
    },

    toString: function() {
      return "Vector3(" + this.x + ", " + this.y + ", " + this.z + ")";
    },

    toVector2: function() {
      return new dot.Vector2( this.x, this.y );
    },

    toVector4: function() {
      return new dot.Vector4( this.x, this.y, this.z );
    },

    /*---------------------------------------------------------------------------*
     * Mutables
     *----------------------------------------------------------------------------*/

    // our core mutables, all mutation should go through these
    setXYZ: function( x, y, z ) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
    setX: function( x ) {
      this.x = x;
      return this;
    },
    setY: function( y ) {
      this.y = y;
      return this;
    },
    setZ: function( z ) {
      this.z = z;
      return this;
    },

    set: function( v ) {
      return this.setXYZ( v.x, v.y, v.z );
    },

    // sets the magnitude of the vector, keeping the same direction (though a negative magnitude will flip the vector direction)
    setMagnitude: function( m ) {
      var scale = m / this.magnitude();
      return this.multiplyScalar( scale );
    },

    add: function( v ) {
      return this.setXYZ( this.x + v.x, this.y + v.y, this.z + v.z );
    },

    addScalar: function( scalar ) {
      return this.setXYZ( this.x + scalar, this.y + scalar, this.z + scalar );
    },

    subtract: function( v ) {
      return this.setXYZ( this.x - v.x, this.y - v.y, this.z - v.z );
    },

    subtractScalar: function( scalar ) {
      return this.setXYZ( this.x - scalar, this.y - scalar, this.z - scalar );
    },

    multiplyScalar: function( scalar ) {
      return this.setXYZ( this.x * scalar, this.y * scalar, this.z * scalar );
    },

    multiply: function( scalar ) {
      // make sure it's not a vector!
      assert && assert( scalar.dimension === undefined );
      return this.multiplyScalar( scalar );
    },

    componentMultiply: function( v ) {
      return this.setXYZ( this.x * v.x, this.y * v.y, this.z * v.z );
    },

    divideScalar: function( scalar ) {
      return this.setXYZ( this.x / scalar, this.y / scalar, this.z / scalar );
    },

    negate: function() {
      return this.setXYZ( -this.x, -this.y, -this.z );
    },

    normalize: function() {
      var mag = this.magnitude();
      if ( mag === 0 ) {
        throw new Error( "Cannot normalize a zero-magnitude vector" );
      }
      else {
        return this.divideScalar( mag );
      }
    }
  };

  /**
   * Spherical linear interpolation between two unit vectors.
   *
   * @param {Vector3} start - Start unit vector
   * @param {Vector3} end - End unit vector
   * @param {number} ratio  - Between 0 (at start vector) and 1 (at end vector)
   * @return Spherical linear interpolation between the start and end
   */
  Vector3.slerp = function( start, end, ratio ) {
    // NOTE: we can't create a require() loop here
    return dot.Quaternion.slerp( new dot.Quaternion(), dot.Quaternion.getRotationQuaternion( start, end ), ratio ).timesVector3( start );
  };

  /*---------------------------------------------------------------------------*
   * Immutable Vector form
   *----------------------------------------------------------------------------*/
  Vector3.Immutable = function( x, y, z ) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
  };
  var Immutable = Vector3.Immutable;

  Immutable.prototype = new Vector3();
  Immutable.prototype.constructor = Immutable;

  // throw errors whenever a mutable method is called on our immutable vector
  Immutable.mutableOverrideHelper = function( mutableFunctionName ) {
    Immutable.prototype[mutableFunctionName] = function() {
      throw new Error( "Cannot call mutable method '" + mutableFunctionName + "' on immutable Vector3" );
    };
  };

  // TODO: better way to handle this list?
  Immutable.mutableOverrideHelper( 'setXYZ' );
  Immutable.mutableOverrideHelper( 'setX' );
  Immutable.mutableOverrideHelper( 'setY' );
  Immutable.mutableOverrideHelper( 'setZ' );

  // helpful immutable constants
  Vector3.ZERO = new Immutable( 0, 0, 0 );
  Vector3.X_UNIT = new Immutable( 1, 0, 0 );
  Vector3.Y_UNIT = new Immutable( 0, 1, 0 );
  Vector3.Z_UNIT = new Immutable( 0, 0, 1 );

  return Vector3;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * 4-dimensional Matrix
 *
 * TODO: consider adding affine flag if it will help performance (a la Matrix3)
 * TODO: get rotation angles
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Matrix4',['require','DOT/dot','DOT/Vector3','DOT/Vector4'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  require( 'DOT/Vector3' );
  require( 'DOT/Vector4' );

  var Float32Array = window.Float32Array || Array;

  dot.Matrix4 = function Matrix4( v00, v01, v02, v03, v10, v11, v12, v13, v20, v21, v22, v23, v30, v31, v32, v33, type ) {

    // entries stored in column-major format
    this.entries = new Float32Array( 16 );

    this.rowMajor(
        v00 === undefined ? 1 : v00, v01 || 0, v02 || 0, v03 || 0,
        v10 || 0, v11 === undefined ? 1 : v11, v12 || 0, v13 || 0,
        v20 || 0, v21 || 0, v22 === undefined ? 1 : v22, v23 || 0,
        v30 || 0, v31 || 0, v32 || 0, v33 === undefined ? 1 : v33,
      type );
  };
  var Matrix4 = dot.Matrix4;

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
      this.entries[0] = v00;
      this.entries[1] = v10;
      this.entries[2] = v20;
      this.entries[3] = v30;
      this.entries[4] = v01;
      this.entries[5] = v11;
      this.entries[6] = v21;
      this.entries[7] = v31;
      this.entries[8] = v02;
      this.entries[9] = v12;
      this.entries[10] = v22;
      this.entries[11] = v32;
      this.entries[12] = v03;
      this.entries[13] = v13;
      this.entries[14] = v23;
      this.entries[15] = v33;

      // TODO: consider performance of the affine check here
      this.type = type === undefined ? ( ( v30 === 0 && v31 === 0 && v32 === 0 && v33 === 1 ) ? Types.AFFINE : Types.OTHER ) : type;
      return this;
    },

    columnMajor: function( v00, v10, v20, v30, v01, v11, v21, v31, v02, v12, v22, v32, v03, v13, v23, v33, type ) {
      return this.rowMajor( v00, v01, v02, v03, v10, v11, v12, v13, v20, v21, v22, v23, v30, v31, v32, v33, type );
    },

    // convenience getters. inline usages of these when performance is critical? TODO: test performance of inlining these, with / without closure compiler
    m00: function() { return this.entries[0]; },
    m01: function() { return this.entries[4]; },
    m02: function() { return this.entries[8]; },
    m03: function() { return this.entries[12]; },
    m10: function() { return this.entries[1]; },
    m11: function() { return this.entries[5]; },
    m12: function() { return this.entries[9]; },
    m13: function() { return this.entries[13]; },
    m20: function() { return this.entries[2]; },
    m21: function() { return this.entries[6]; },
    m22: function() { return this.entries[10]; },
    m23: function() { return this.entries[14]; },
    m30: function() { return this.entries[3]; },
    m31: function() { return this.entries[7]; },
    m32: function() { return this.entries[11]; },
    m33: function() { return this.entries[15]; },

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

      // we need to prevent the numbers from being in an exponential toString form, since the CSS transform does not support that
      // 20 is the largest guaranteed number of digits according to https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toFixed

      // the inner part of a CSS3 transform, but remember to add the browser-specific parts!
      // NOTE: the toFixed calls are inlined for performance reasons
      return 'matrix3d(' +
             this.entries[0].toFixed( 20 ) + ',' +
             this.entries[1].toFixed( 20 ) + ',' +
             this.entries[2].toFixed( 20 ) + ',' +
             this.entries[3].toFixed( 20 ) + ',' +
             this.entries[4].toFixed( 20 ) + ',' +
             this.entries[5].toFixed( 20 ) + ',' +
             this.entries[6].toFixed( 20 ) + ',' +
             this.entries[7].toFixed( 20 ) + ',' +
             this.entries[8].toFixed( 20 ) + ',' +
             this.entries[9].toFixed( 20 ) + ',' +
             this.entries[10].toFixed( 20 ) + ',' +
             this.entries[11].toFixed( 20 ) + ',' +
             this.entries[12].toFixed( 20 ) + ',' +
             this.entries[13].toFixed( 20 ) + ',' +
             this.entries[14].toFixed( 20 ) + ',' +
             this.entries[15].toFixed( 20 ) + ')';
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
          break; // because JSHint totally can't tell that this can't be reached
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
      return this.m00() + " " + this.m01() + " " + this.m02() + " " + this.m03() + "\n" +
             this.m10() + " " + this.m11() + " " + this.m12() + " " + this.m13() + "\n" +
             this.m20() + " " + this.m21() + " " + this.m22() + " " + this.m23() + "\n" +
             this.m30() + " " + this.m31() + " " + this.m32() + " " + this.m33();
    },

    makeImmutable: function() {
      this.rowMajor = function() {
        throw new Error( "Cannot modify immutable matrix" );
      };
    }
  };

  // create an immutable
  Matrix4.IDENTITY = new Matrix4();
  Matrix4.IDENTITY.makeImmutable();

  return Matrix4;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * 3-dimensional Matrix
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Matrix3',['require','DOT/dot','PHET_CORE/Poolable','DOT/Vector2','DOT/Vector3','DOT/Matrix4'],function( require ) {
  

  var dot = require( 'DOT/dot' );
  var Poolable = require( 'PHET_CORE/Poolable' );

  var FastArray = dot.FastArray;

  require( 'DOT/Vector2' );
  require( 'DOT/Vector3' );
  require( 'DOT/Matrix4' );

  var identityFastArray = new FastArray( 9 );
  identityFastArray[0] = 1;
  identityFastArray[4] = 1;
  identityFastArray[8] = 1;

  var createIdentityArray = FastArray === Array ?
                            function() {
                              return [1, 0, 0, 0, 1, 0, 0, 0, 1];
                            } :
                            function() {
                              return new FastArray( identityFastArray );
                            };

  //Create an identity matrix
  dot.Matrix3 = function Matrix3( argumentsShouldNotExist ) {

    //Make sure no clients are expecting to create a matrix with non-identity values
    assert && assert( !argumentsShouldNotExist, 'Matrix3 constructor should not be called with any arguments.  Use Matrix3.createFromPool()/Matrix3.identity()/etc.' );

    // entries stored in column-major format
    this.entries = createIdentityArray();

//    this.rowMajor( v00 === undefined ? 1 : v00, v01 || 0, v02 || 0,
//        v10 || 0, v11 === undefined ? 1 : v11, v12 || 0,
//        v20 || 0, v21 || 0, v22 === undefined ? 1 : v22,
//      type );

    phetAllocation && phetAllocation( 'Matrix3' );
    this.type = Types.IDENTITY;
  };
  var Matrix3 = dot.Matrix3;

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
    m00: function() { return this.entries[0]; },
    m01: function() { return this.entries[3]; },
    m02: function() { return this.entries[6]; },
    m10: function() { return this.entries[1]; },
    m11: function() { return this.entries[4]; },
    m12: function() { return this.entries[7]; },
    m20: function() { return this.entries[2]; },
    m21: function() { return this.entries[5]; },
    m22: function() { return this.entries[8]; },

    isIdentity: function() {
      return this.type === Types.IDENTITY || this.equals( Matrix3.IDENTITY );
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
      var transformedVector = this.timesVector2( dot.Vector2.X_UNIT ).minus( this.timesVector2( dot.Vector2.ZERO ) );
      return Math.atan2( transformedVector.y, transformedVector.x );
    },
    get rotation() { return this.getRotation(); },

    toMatrix4: function() {
      return new dot.Matrix4(
        this.m00(), this.m01(), this.m02(), 0,
        this.m10(), this.m11(), this.m12(), 0,
        this.m20(), this.m21(), this.m22(), 0,
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

      // we need to prevent the numbers from being in an exponential toString form, since the CSS transform does not support that
      // 20 is the largest guaranteed number of digits according to https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toFixed

      // the inner part of a CSS3 transform, but remember to add the browser-specific parts!
      // NOTE: the toFixed calls are inlined for performance reasons
      return 'matrix(' + this.entries[0].toFixed( 20 ) + ',' + this.entries[1].toFixed( 20 ) + ',' + this.entries[3].toFixed( 20 ) + ',' + this.entries[4].toFixed( 20 ) + ',' + this.entries[6].toFixed( 20 ) + ',' + this.entries[7].toFixed( 20 ) + ')';
    },
    get cssTransform() { return this.getCSSTransform(); },

    getSVGTransform: function() {
      // SVG transform presentation attribute. See http://www.w3.org/TR/SVG/coords.html#TransformAttribute

      // we need to prevent the numbers from being in an exponential toString form, since the CSS transform does not support that
      function svgNumber( number ) {
        // largest guaranteed number of digits according to https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toFixed
        return number.toFixed( 20 );
      }

      switch( this.type ) {
        case Types.IDENTITY:
          return '';
        case Types.TRANSLATION_2D:
          return 'translate(' + svgNumber( this.entries[6] ) + ',' + svgNumber( this.entries[7] ) + ')';
        case Types.SCALING:
          return 'scale(' + svgNumber( this.entries[0] ) + ( this.entries[0] === this.entries[4] ? '' : ',' + svgNumber( this.entries[4] ) ) + ')';
        default:
          return 'matrix(' + svgNumber( this.entries[0] ) + ',' + svgNumber( this.entries[1] ) + ',' + svgNumber( this.entries[3] ) + ',' + svgNumber( this.entries[4] ) + ',' + svgNumber( this.entries[6] ) + ',' + svgNumber( this.entries[7] ) + ')';
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
          break; // because JSHint totally can't tell that this can't be reached
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
          break; // because JSHint totally can't tell that this can't be reached
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
      this.entries[0] = v00;
      this.entries[1] = v10;
      this.entries[2] = v20;
      this.entries[3] = v01;
      this.entries[4] = v11;
      this.entries[5] = v21;
      this.entries[6] = v02;
      this.entries[7] = v12;
      this.entries[8] = v22;

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
          break; // because JSHint totally can't tell that this can't be reached
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
          break; // because JSHint totally can't tell that this can't be reached
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

      var e, h, f;

      var v = start.cross( end );
      e = start.dot( end );
      f = ( e < 0 ) ? -e : e;

      // if "from" and "to" vectors are nearly parallel
      if ( f > 1.0 - epsilon ) {
        var c1, c2, c3;

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
        var hvx, hvz, hvxy, hvxz, hvyz;
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
        this.entries[0],
        this.entries[1],
        this.entries[3],
        this.entries[4],
        this.entries[6],
        this.entries[7]
      );
    },

    // appends the affine part of this matrix to the Canvas 2D rendering context
    canvasAppendTransform: function( context ) {
      if ( this.type !== Types.IDENTITY ) {
        context.transform(
          // inlined array entries
          this.entries[0],
          this.entries[1],
          this.entries[3],
          this.entries[4],
          this.entries[6],
          this.entries[7]
        );
      }
    }
  };

  /* jshint -W064 */
  Poolable( Matrix3, {

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

  Matrix3.X_REFLECTION = Matrix3.createFromPool( -1, 0, 0,
    0, 1, 0,
    0, 0, 1,
    Types.AFFINE );
  Matrix3.X_REFLECTION.makeImmutable();

  Matrix3.Y_REFLECTION = Matrix3.createFromPool( 1, 0, 0,
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
    return Matrix3.createFromPool( m.m00(), m.m01(), m.m02() + x,
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

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Quadratic Bezier segment
 *
 * Good reference: http://cagd.cs.byu.edu/~557/text/ch2.pdf
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/Quadratic',['require','PHET_CORE/inherit','DOT/Bounds2','DOT/Matrix3','DOT/Util','DOT/Util','KITE/kite','KITE/segments/Segment'],function( require ) {
  

  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var solveQuadraticRootsReal = require( 'DOT/Util' ).solveQuadraticRootsReal;
  var arePointsCollinear = require( 'DOT/Util' ).arePointsCollinear;

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );

  Segment.Quadratic = function Quadratic( start, control, end ) {
    this._start = start;
    this._control = control;
    this._end = end;

    // TODO: performance test removal of these undefined declarations
    this._startTangent = undefined;
    this._endTangent = undefined;
    this._tCriticalX = undefined; // replaced with null if not in range
    this._tCriticalY = undefined; // replaced with null if not in range
    this._bounds = undefined;
  };
  inherit( Segment, Segment.Quadratic, {

    degree: 2,

    getStart: function() {
      return this._start;
    },
    get start() { return this._start; },

    getControl: function() {
      return this._control;
    },
    get control() { return this._control; },

    getEnd: function() {
      return this._end;
    },
    get end() { return this._end; },

    getStartTangent: function() {
      if ( this._startTangent === undefined ) {
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
      if ( this._endTangent === undefined ) {
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
      if ( this._tCriticalX === undefined ) {
        this._tCriticalX = Segment.Quadratic.extremaT( this._start.x, this._control.x, this._end.x );
      }
      return this._tCriticalX;
    },
    get tCriticalX() { return this.getTCriticalX(); },

    getTCriticalY: function() {
      // compute y where the derivative is 0 (used for bounds and other things)
      if ( this._tCriticalY === undefined ) {
        this._tCriticalY = Segment.Quadratic.extremaT( this._start.y, this._control.y, this._end.y );
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
          new Segment.Line( start, halfPoint ),
          new Segment.Line( halfPoint, end )
        ];
      }
      else if ( arePointsCollinear( start, control, end ) ) {
        // if they are collinear, we can reduce to start->control and control->end, or if control is between, just one line segment
        // also, start !== end (handled earlier)
        if ( startIsControl || endIsControl ) {
          // just a line segment!
          return [new Segment.Line( start, end )]; // no extra nondegenerate check since start !== end
        }
        // now control point must be unique. we check to see if our rendered path will be outside of the start->end line segment
        var delta = end.minus( start );
        var p1d = control.minus( start ).dot( delta.normalized ) / delta.magnitude();
        var t = Segment.Quadratic.extremaT( 0, p1d, 1 );
        if ( t !== null && t > 0 && t < 1 ) {
          // we have a local max inside the range, indicating that our extrema point is outside of start->end
          // we'll line to and from it
          var pt = this.positionAt( t );
          return _.flatten( [
            new Segment.Line( start, pt ).getNondegenerateSegments(),
            new Segment.Line( pt, end ).getNondegenerateSegments()
          ] );
        }
        else {
          // just provide a line segment, our rendered path doesn't go outside of this
          return [new Segment.Line( start, end )]; // no extra nondegenerate check since start !== end
        }
      }
      else {
        return [this];
      }
    },

    getBounds: function() {
      // calculate our temporary guaranteed lower bounds based on the end points
      if ( this._bounds === undefined ) {
        this._bounds = new Bounds2( Math.min( this._start.x, this._end.x ), Math.min( this._start.y, this._end.y ), Math.max( this._start.x, this._end.x ), Math.max( this._start.y, this._end.y ) );

        // compute x and y where the derivative is 0, so we can include this in the bounds
        var tCriticalX = this.getTCriticalX();
        var tCriticalY = this.getTCriticalY();

        if ( tCriticalX !== null && tCriticalX > 0 && tCriticalX < 1 ) {
          this._bounds = this._bounds.withPoint( this.positionAt( tCriticalX ) );
        }
        if ( tCriticalY !== null && tCriticalY > 0 && tCriticalY < 1 ) {
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
        return this.subdivided( t, true )[0].curvatureAt( 1 );
      }
    },

    // see http://www.visgraf.impa.br/sibgrapi96/trabs/pdf/a14.pdf
    // and http://math.stackexchange.com/questions/12186/arc-length-of-bezier-curves for curvature / arc length

    offsetTo: function( r, reverse ) {
      // TODO: implement more accurate method at http://www.antigrain.com/research/adaptive_bezier/index.html
      // TODO: or more recently (and relevantly): http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      var curves = [this];

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
        new Segment.Quadratic( this._start, leftMid, mid ),
        new Segment.Quadratic( mid, rightMid, this._end )
      ];
    },

    // elevation of this quadratic Bezier curve to a cubic Bezier curve
    degreeElevated: function() {
      // TODO: allocation reduction
      return new Segment.Cubic(
        this._start,
        this._start.plus( this._control.timesScalar( 2 ) ).dividedScalar( 3 ),
        this._end.plus( this._control.timesScalar( 2 ) ).dividedScalar( 3 ),
        this._end
      );
    },

    reversed: function() {
      return new Segment.Quadratic( this._end, this._control, this._start );
    },

    approximateOffset: function( r ) {
      return new Segment.Quadratic(
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
      if ( this.tCriticalX !== undefined && this.tCriticalX > epsilon && this.tCriticalX < 1 - epsilon ) {
        result.push( this.tCriticalX );
      }
      if ( this.tCriticalY !== undefined && this.tCriticalY > epsilon && this.tCriticalY < 1 - epsilon ) {
        result.push( this.tCriticalY );
      }
      return result.sort();
    },

    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.Quadratic.intersectsBounds unimplemented' ); // TODO: implement
    },

    // returns the resultant winding number of this ray intersecting this segment.
    intersection: function( ray ) {
      var self = this;
      var result = [];

      // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
      var inverseMatrix = Matrix3.rotation2( -ray.dir.angle() ).timesMatrix( Matrix3.translation( -ray.pos.x, -ray.pos.y ) );

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
          var toHit = hitPoint.minus( ray.pos );

          // make sure it's not behind the ray
          if ( toHit.dot( ray.dir ) > 0 ) {
            result.push( {
              distance: toHit.magnitude(),
              point: hitPoint,
              normal: perp.dot( ray.dir ) > 0 ? perp.negated() : perp,
              wind: ray.dir.perpendicular().dot( unitTangent ) < 0 ? 1 : -1
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
      return new Segment.Quadratic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control ), matrix.timesVector2( this._end ) );
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
      return new Segment.Quadratic( gamma, beta.timesScalar( 0.5 ).plus( gamma ), alpha.plus( beta ).plus( gamma ) );
    }
  } );

  // one-dimensional solution to extrema
  Segment.Quadratic.extremaT = function( start, control, end ) {
    // compute t where the derivative is 0 (used for bounds and other things)
    var divisorX = 2 * ( end - 2 * control + start );
    if ( divisorX !== 0 ) {
      return -2 * ( control - start ) / divisorX;
    }
    else {
      return null;
    }
  };

  return Segment.Quadratic;
} );

// Copyright 2002-2014, University of Colorado Boulder

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

  Segment.Cubic = function Cubic( start, control1, control2, end ) {
    this._start = start;
    this._control1 = control1;
    this._control2 = control2;
    this._end = end;

    // TODO: performance test removal of these undefined declarations
    this._startTangent = undefined;
    this._endTangent = undefined;
    this._r = undefined;
    this._s = undefined;

    this._tCusp = undefined;
    this._tDeterminant = undefined;
    this._tInflection1 = undefined;
    this._tInflection2 = undefined;
    this._startQuadratic = undefined;
    this._endQuadratic = undefined;

    this._xExtremaT = undefined;
    this._yExtremaT = undefined;

    this._bounds = undefined;
  };
  inherit( Segment, Segment.Cubic, {

    degree: 3,

    getStart: function() {
      return this._start;
    },
    get start() { return this._start; },

    getControl1: function() {
      return this._control1;
    },
    get control1() { return this._control1; },

    getControl2: function() {
      return this._control2;
    },
    get control2() { return this._control2; },

    getEnd: function() {
      return this._end;
    },
    get end() { return this._end; },

    getStartTangent: function() {
      if ( this._startTangent === undefined ) {
        this._startTangent = this.tangentAt( 0 ).normalized();
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      if ( this._endTangent === undefined ) {
        this._endTangent = this.tangentAt( 1 ).normalized();
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    getR: function() {
      // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      if ( this._r === undefined ) {
        this._r = this._control1.minus( this._start ).normalized();
      }
      return this._r;
    },
    get r() { return this.getR(); },

    getS: function() {
      // from http://www.cis.usouthal.edu/~hain/general/Publications/Bezier/BezierFlattening.pdf
      if ( this._s === undefined ) {
        this._s = this.getR().perpendicular();
      }
      return this._s;
    },
    get s() { return this.getS(); },

    getTCusp: function() {
      if ( this._tCusp === undefined ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tCusp !== undefined );
      return this._tCusp;
    },
    get tCusp() { return this.getTCusp(); },

    getTDeterminant: function() {
      if ( this._tDeterminant === undefined ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tDeterminant !== undefined );
      return this._tDeterminant;
    },
    get tDeterminant() { return this.getTDeterminant(); },

    getTInflection1: function() {
      if ( this._tInflection1 === undefined ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tInflection1 !== undefined );
      return this._tInflection1;
    },
    get tInflection1() { return this.getTInflection1(); },

    getTInflection2: function() {
      if ( this._tInflection2 === undefined ) {
        this.computeCuspInfo();
      }
      assert && assert( this._tInflection2 !== undefined );
      return this._tInflection2;
    },
    get tInflection2() { return this.getTInflection2(); },

    getStartQuadratic: function() {
      if ( this._startQuadratic === undefined ) {
        this.computeCuspSegments();
      }
      assert && assert( this._startQuadratic !== undefined );
      return this._startQuadratic;
    },
    get startQuadratic() { return this.getStartQuadratic(); },

    getEndQuadratic: function() {
      if ( this._endQuadratic === undefined ) {
        this.computeCuspSegments();
      }
      assert && assert( this._endQuadratic !== undefined );
      return this._endQuadratic;
    },
    get endQuadratic() { return this.getEndQuadratic(); },

    getXExtremaT: function() {
      if ( this._xExtremaT === undefined ) {
        this._xExtremaT = Segment.Cubic.extremaT( this._start.x, this._control1.x, this._control2.x, this._end.x );
      }
      return this._xExtremaT;
    },
    get xExtremaT() { return this.getXExtremaT(); },

    getYExtremaT: function() {
      if ( this._yExtremaT === undefined ) {
        this._yExtremaT = Segment.Cubic.extremaT( this._start.y, this._control1.y, this._control2.y, this._end.y );
      }
      return this._yExtremaT;
    },
    get yExtremaT() { return this.getYExtremaT(); },

    getBounds: function() {
      if ( this._bounds === undefined ) {
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
        this._tInflection1 = null;
        this._tInflection2 = null;
      }
    },

    // the cusp allows us to split into 2 quadratic Bezier curves
    computeCuspSegments: function() {
      if ( this.hasCusp() ) {
        // if there is a cusp, we'll split at the cusp into two quadratic bezier curves.
        // see http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.94.8088&rep=rep1&type=pdf (Singularities of rational Bezier curves - J Monterde, 2001)
        var subdividedAtCusp = this.subdivided( this.getTCusp );
        this._startQuadratic = new Segment.Quadratic( subdividedAtCusp[0].start, subdividedAtCusp[0].control1, subdividedAtCusp[0].end, false );
        this._endQuadratic = new Segment.Quadratic( subdividedAtCusp[1].start, subdividedAtCusp[1].control2, subdividedAtCusp[1].end, false );
      }
      else {
        this._startQuadratic = null;
        this._endQuadratic = null;
      }
    },

    getNondegenerateSegments: function() {
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
        throw new Error( 'TODO, use extrema T funcs' );
      }
      else {
        return [this];
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
      return this._start.times( -3 * mt * mt ).plus( this._control1.times( 3 * mt * mt - 6 * mt * t ) ).plus( this._control2.times( 6 * mt * t - 3 * t * t ) ).plus( this._end.times( 3 * t * t ) );
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
        return this.subdivided( t )[0].curvatureAt( 1 );
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
        new Segment.Cubic( this._start, left, leftMid, mid ),
        new Segment.Cubic( mid, rightMid, right, this._end )
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
          result.push( new Segment.Line( points[i - 1], points[i] ) );
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

    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.Cubic.intersectsBounds unimplemented' ); // TODO: implement
    },

    // returns the resultant winding number of this ray intersecting this segment.
    intersection: function( ray ) {
      var self = this;
      var result = [];

      // find the rotation that will put our ray in the direction of the x-axis so we can only solve for y=0 for intersections
      var inverseMatrix = Matrix3.rotation2( -ray.dir.angle() ).timesMatrix( Matrix3.translation( -ray.pos.x, -ray.pos.y ) );

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
          var toHit = hitPoint.minus( ray.pos );

          // make sure it's not behind the ray
          if ( toHit.dot( ray.dir ) > 0 ) {
            result.push( {
              distance: toHit.magnitude(),
              point: hitPoint,
              normal: perp.dot( ray.dir ) > 0 ? perp.negated() : perp,
              wind: ray.dir.perpendicular().dot( unitTangent ) < 0 ? 1 : -1
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
      return new Segment.Cubic( matrix.timesVector2( this._start ), matrix.timesVector2( this._control1 ), matrix.timesVector2( this._control2 ), matrix.timesVector2( this._end ) );
    },

    // returns a degree-reduced quadratic Bezier if possible, otherwise it returns null
    degreeReduced: function( epsilon ) {
      epsilon = epsilon || 0; // if not provided, use an exact version
      // TODO: allocation reduction
      // TODO: performance: don't divide both by 2 here, combine it later!!
      var controlA = this._control1.timesScalar( 3 ).minus( this._start ).dividedScalar( 2 );
      var controlB = this._control2.timesScalar( 3 ).minus( this._end ).dividedScalar( 2 );
      if ( controlA.minus( controlB ).magnitude() <= epsilon ) {
        return new Segment.Quadratic(
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
    //   var inverseMatrix = Matrix3.rotation2( -ray.dir.angle() );
    //   assert && assert( inverseMatrix.timesVector2( ray.dir ).x > 0.99 ); // verify that we transform the unit vector to the x-unit

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
    //       result += ray.dir.perpendicular().dot( this.tangentAt( t ) ) < 0 ? 1 : -1;
    //     }
    //   } );

    //   return result;
    // }
  } );

  // finds what t values the cubic extrema are at (if any). This is just the 1-dimensional case, used for multiple purposes
  Segment.Cubic.extremaT = function( v0, v1, v2, v3 ) {
    // coefficients of derivative
    var a = -3 * v0 + 9 * v1 - 9 * v2 + 3 * v3;
    var b = 6 * v0 - 12 * v1 + 6 * v2;
    var c = -3 * v0 + 3 * v1;

    return solveQuadraticRootsReal( a, b, c );
  };

  return Segment.Cubic;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Forward and inverse transforms with 3x3 matrices
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Transform3',['require','DOT/dot','DOT/Matrix3','DOT/Vector2','DOT/Ray2'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  require( 'DOT/Matrix3' );
  require( 'DOT/Vector2' );
  require( 'DOT/Ray2' );

  // takes a 4x4 matrix
  dot.Transform3 = function Transform3( matrix ) {
    this.listeners = [];

    // using immutable version for now. change it to the mutable identity copy if we need mutable operations on the matrices
    this.setMatrix( matrix === undefined ? dot.Matrix3.IDENTITY : matrix );

    phetAllocation && phetAllocation( 'Transform3' );
  };
  var Transform3 = dot.Transform3;

  Transform3.prototype = {
    constructor: Transform3,

    /*---------------------------------------------------------------------------*
    * mutators
    *----------------------------------------------------------------------------*/

    setMatrix: function( matrix ) {
      // TODO: performance: don't notify or handle instances where the matrix is detected to be the identity matrix?
      assert && assert( matrix instanceof dot.Matrix3 );

      assert && assert( matrix.isFinite(), 'Matrix was suspicious' );

      //Temporary solution: if the programmer tried to set the top, bottom, etc of a node without defined bounds, do a no-op
      //In the future, this should be replaced with the assertion above, once we have tested that everything is working properly
      if ( !matrix.isFinite() ) {
        return;
      }

      var oldMatrix = this.matrix;
      var length = this.listeners.length;
      var i;

      // notify listeners before the change
      for ( i = 0; i < length; i++ ) {
        this.listeners[i].before( matrix, oldMatrix );
      }

      this.matrix = matrix;

      // compute these lazily
      this.inverse = null;
      this.matrixTransposed = null;
      this.inverseTransposed = null;

      // notify listeners after the change
      for ( i = 0; i < length; i++ ) {
        this.listeners[i].after( matrix, oldMatrix );
      }
    },

    prepend: function( matrix ) {
      this.setMatrix( matrix.timesMatrix( this.matrix ) );
    },

    //Simpler case of prepending a translation without having to allocate a matrix for it, see scenery#119
    prependTranslation: function( x, y ) {
      this.setMatrix( dot.Matrix3.translationTimesMatrix( x, y, this.matrix ) );
    },

    append: function( matrix ) {
      this.setMatrix( this.matrix.timesMatrix( matrix ) );
    },

    prependTransform: function( transform ) {
      this.prepend( transform.matrix );
    },

    appendTransform: function( transform ) {
      this.append( transform.matrix );
    },

    applyToCanvasContext: function( context ) {
      context.setTransform( this.matrix.m00(), this.matrix.m10(), this.matrix.m01(), this.matrix.m11(), this.matrix.m02(), this.matrix.m12() );
    },

    /*---------------------------------------------------------------------------*
    * getters
    *----------------------------------------------------------------------------*/

    // uses the same matrices, for use cases where the matrices are considered immutable
    copy: function() {
      var transform = new Transform3( this.matrix );
      transform.inverse = this.inverse;
      transform.matrixTransposed = this.matrixTransposed;
      transform.inverseTransposed = this.inverseTransposed;
    },

    // copies matrices, for use cases where the matrices are considered mutable
    deepCopy: function() {
      var transform = new Transform3( this.matrix.copy() );
      transform.inverse = this.inverse ? this.inverse.copy() : null;
      transform.matrixTransposed = this.matrixTransposed ? this.matrixTransposed.copy() : null;
      transform.inverseTransposed = this.inverseTransposed ? this.inverseTransposed.copy() : null;
    },

    getMatrix: function() {
      return this.matrix;
    },

    getInverse: function() {
      if ( this.inverse === null ) {
        this.inverse = this.matrix.inverted();
      }
      return this.inverse;
    },

    getMatrixTransposed: function() {
      if ( this.matrixTransposed === null ) {
        this.matrixTransposed = this.matrix.transposed();
      }
      return this.matrixTransposed;
    },

    getInverseTransposed: function() {
      if ( this.inverseTransposed === null ) {
        this.inverseTransposed = this.getInverse().transposed();
      }
      return this.inverseTransposed;
    },

    isIdentity: function() {
      return this.matrix.type === dot.Matrix3.Types.IDENTITY;
    },

    isFinite: function() {
      return this.matrix.isFinite();
    },

    /*---------------------------------------------------------------------------*
     * forward transforms (for Vector2 or scalar)
     *----------------------------------------------------------------------------*/

    // transform a position (includes translation)
    transformPosition2: function( vec2 ) {
      return this.matrix.timesVector2( vec2 );
    },

    // transform a vector (exclude translation)
    transformDelta2: function( vec2 ) {
      var m = this.getMatrix();
      // m . vec2 - m . Vector2.ZERO
      return new dot.Vector2( m.m00() * vec2.x + m.m01() * vec2.y, m.m10() * vec2.x + m.m11() * vec2.y );
    },

    // transform a normal vector (different than a normal vector)
    transformNormal2: function( vec2 ) {
      return this.getInverse().timesTransposeVector2( vec2 );
    },

    transformX: function( x ) {
      var m = this.getMatrix();
      assert && assert( !m.m01(), 'Transforming an X value with a rotation/shear is ill-defined' );
      return m.m00() * x + m.m02();
    },

    transformY: function( y ) {
      var m = this.getMatrix();
      assert && assert( !m.m10(), 'Transforming a Y value with a rotation/shear is ill-defined' );
      return m.m11() * y + m.m12();
    },

    transformDeltaX: function( x ) {
      var m = this.getMatrix();
      assert && assert( !m.m01(), 'Transforming an X value with a rotation/shear is ill-defined' );
      // same as this.transformDelta2( new dot.Vector2( x, 0 ) ).x;
      return m.m00() * x;
    },

    transformDeltaY: function( y ) {
      var m = this.getMatrix();
      assert && assert( !m.m10(), 'Transforming a Y value with a rotation/shear is ill-defined' );
      // same as this.transformDelta2( new dot.Vector2( 0, y ) ).y;
      return m.m11() * y;
    },

    transformBounds2: function( bounds2 ) {
      return bounds2.transformed( this.matrix );
    },

    transformShape: function( shape ) {
      return shape.transformed( this.matrix );
    },

    transformRay2: function( ray ) {
      return new dot.Ray2( this.transformPosition2( ray.pos ), this.transformDelta2( ray.dir ).normalized() );
    },

    /*---------------------------------------------------------------------------*
     * inverse transforms (for Vector2 or scalar)
     *----------------------------------------------------------------------------*/

    inversePosition2: function( vec2 ) {
      return this.getInverse().timesVector2( vec2 );
    },

    inverseDelta2: function( vec2 ) {
      var m = this.getInverse();
      // m . vec2 - m . Vector2.ZERO
      return new dot.Vector2( m.m00() * vec2.x + m.m01() * vec2.y, m.m10() * vec2.x + m.m11() * vec2.y );
    },

    inverseNormal2: function( vec2 ) {
      return this.matrix.timesTransposeVector2( vec2 );
    },

    inverseX: function( x ) {
      var m = this.getInverse();
      assert && assert( !m.m01(), 'Inverting an X value with a rotation/shear is ill-defined' );
      return m.m00() * x + m.m02();
    },

    inverseY: function( y ) {
      var m = this.getInverse();
      assert && assert( !m.m10(), 'Inverting a Y value with a rotation/shear is ill-defined' );
      return m.m11() * y + m.m12();
    },

    inverseDeltaX: function( x ) {
      var m = this.getInverse();
      assert && assert( !m.m01(), 'Inverting an X value with a rotation/shear is ill-defined' );
      // same as this.inverseDelta2( new dot.Vector2( x, 0 ) ).x;
      return m.m00() * x;
    },

    inverseDeltaY: function( y ) {
      var m = this.getInverse();
      assert && assert( !m.m10(), 'Inverting a Y value with a rotation/shear is ill-defined' );
      // same as this.inverseDelta2( new dot.Vector2( 0, y ) ).y;
      return m.m11() * y;
    },

    inverseBounds2: function( bounds2 ) {
      return bounds2.transformed( this.getInverse() );
    },

    inverseShape: function( shape ) {
      return shape.transformed( this.getInverse() );
    },

    inverseRay2: function( ray ) {
      return new dot.Ray2( this.inversePosition2( ray.pos ), this.inverseDelta2( ray.dir ).normalized() );
    },

    /*---------------------------------------------------------------------------*
    * listeners
    *----------------------------------------------------------------------------*/

    // note: listener.before( matrix, oldMatrix ) will be called before the change, listener.after( matrix, oldMatrix ) will be called after
    addTransformListener: function( listener ) {
      assert && assert( !_.contains( this.listeners, listener ) );
      this.listeners.push( listener );
    },

    // useful for making sure the listener is triggered first
    prependTransformListener: function( listener ) {
      assert && assert( !_.contains( this.listeners, listener ) );
      this.listeners.unshift( listener );
    },

    removeTransformListener: function( listener ) {
      assert && assert( _.contains( this.listeners, listener ) );
      this.listeners.splice( _.indexOf( this.listeners, listener ), 1 );
    }
  };

  return Transform3;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Elliptical arc segment
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'KITE/segments/EllipticalArc',['require','PHET_CORE/inherit','DOT/Vector2','DOT/Bounds2','DOT/Matrix3','DOT/Transform3','DOT/Util','DOT/Util','KITE/kite','KITE/segments/Segment','KITE/util/Subpath'],function( require ) {
  

  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Transform3 = require( 'DOT/Transform3' );
  var toDegrees = require( 'DOT/Util' ).toDegrees;
  var DotUtil = require( 'DOT/Util' );

  var kite = require( 'KITE/kite' );
  var Segment = require( 'KITE/segments/Segment' );
  require( 'KITE/util/Subpath' );

  // TODO: notes at http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
  // Canvas notes at http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-ellipse
  Segment.EllipticalArc = function EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise ) {
    if ( radiusX < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      radiusX = -radiusX;
      startAngle = Math.PI - startAngle;
      endAngle = Math.PI - endAngle;
      anticlockwise = !anticlockwise;
    }
    if ( radiusY < 0 ) {
      // support this case since we might actually need to handle it inside of strokes?
      radiusY = -radiusY;
      startAngle = -startAngle;
      endAngle = -endAngle;
      anticlockwise = !anticlockwise;
    }
    if ( radiusX < radiusY ) {
      // swap radiusX and radiusY internally for consistent Canvas / SVG output
      rotation += Math.PI / 2;
      startAngle -= Math.PI / 2;
      endAngle -= Math.PI / 2;

      // swap radiusX and radiusY
      var tmpR = radiusX;
      radiusX = radiusY;
      radiusY = tmpR;
    }

    this._center = center;
    this._radiusX = radiusX;
    this._radiusY = radiusY;
    this._rotation = rotation;
    this._startAngle = startAngle;
    this._endAngle = endAngle;
    this._anticlockwise = anticlockwise;

    // TODO: performance test removal of these undefined declarations
    this._unitTransform = undefined;
    this._start = undefined;
    this._end = undefined;
    this._startTangent = undefined;
    this._endTangent = undefined;
    this._actualEndAngle = undefined;
    this._isFullPerimeter = undefined;
    this._angleDifference = undefined;
    this._unitArcSegment = undefined;

    if ( radiusX < radiusY ) {
      // TODO: check this
      throw new Error( 'Not verified to work if radiusX < radiusY' );
    }

    // constraints shared with Segment.Arc
    assert && assert( !( ( !anticlockwise && endAngle - startAngle <= -Math.PI * 2 ) || ( anticlockwise && startAngle - endAngle <= -Math.PI * 2 ) ), 'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
    assert && assert( !( ( !anticlockwise && endAngle - startAngle > Math.PI * 2 ) || ( anticlockwise && startAngle - endAngle > Math.PI * 2 ) ), 'Not handling elliptical arcs with start/end angles that show differences in-between browser handling' );
  };
  inherit( Segment, Segment.EllipticalArc, {

    getCenter: function() {
      return this._center;
    },
    get center() { return this.getCenter(); },

    getRadiusX: function() {
      return this._radiusX;
    },
    get radiusX() { return this.getRadiusX(); },

    getRadiusY: function() {
      return this._radiusY;
    },
    get radiusY() { return this.getRadiusY(); },

    getRotation: function() {
      return this._rotation;
    },
    get rotation() { return this.getRotation(); },

    getStartAngle: function() {
      return this._startAngle;
    },
    get startAngle() { return this.getStartAngle(); },

    getEndAngle: function() {
      return this._endAngle;
    },
    get endAngle() { return this.getEndAngle(); },

    getAnticlockwise: function() {
      return this._anticlockwise;
    },
    get anticlockwise() { return this.getAnticlockwise(); },

    getUnitTransform: function() {
      if ( this._unitTransform === undefined ) {
        this._unitTransform = Segment.EllipticalArc.computeUnitTransform( this._center, this._radiusX, this._radiusY, this._rotation );
      }
      return this._unitTransform;
    },
    get unitTransform() { return this.getUnitTransform(); },

    getStart: function() {
      if ( this._start === undefined ) {
        this._start = this.positionAtAngle( this._startAngle );
      }
      return this._start;
    },
    get start() { return this.getStart(); },

    getEnd: function() {
      if ( this._end === undefined ) {
        this._end = this.positionAtAngle( this._endAngle );
      }
      return this._end;
    },
    get end() { return this.getEnd(); },

    getStartTangent: function() {
      if ( this._startTangent === undefined ) {
        this._startTangent = this.tangentAtAngle( this._startAngle );
      }
      return this._startTangent;
    },
    get startTangent() { return this.getStartTangent(); },

    getEndTangent: function() {
      if ( this._endTangent === undefined ) {
        this._endTangent = this.tangentAtAngle( this._endAngle );
      }
      return this._endTangent;
    },
    get endTangent() { return this.getEndTangent(); },

    getActualEndAngle: function() {
      if ( this._actualEndAngle === undefined ) {
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
      if ( this._isFullPerimeter === undefined ) {
        this._isFullPerimeter = ( !this._anticlockwise && this._endAngle - this._startAngle >= Math.PI * 2 ) || ( this._anticlockwise && this._startAngle - this._endAngle >= Math.PI * 2 );
      }
      return this._isFullPerimeter;
    },
    get isFullPerimeter() { return this.getIsFullPerimeter(); },

    getAngleDifference: function() {
      if ( this._angleDifference === undefined ) {
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
      if ( this._unitArcSegment === undefined ) {
        this._unitArcSegment = new Segment.Arc( Vector2.ZERO, 1, this._startAngle, this._endAngle, this._anticlockwise );
      }
      return this._unitArcSegment;
    },

    // temporary shims
    getBounds: function() {
      if ( this._bounds === undefined ) {
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
        return [new Segment.Arc( this._center, this._radiusX, startAngle, endAngle, this._anticlockwise )];
      }
      else {
        return [this];
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

    // TODO: refactor? exact same as Segment.Arc
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
          result.push( new Segment.Line( points[i - 1], points[i] ) );
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
        new Segment.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angle0, angleT, this._anticlockwise ),
        new Segment.EllipticalArc( this._center, this._radiusX, this._radiusY, this._rotation, angleT, angle1, this._anticlockwise )
      ];
    },

    intersectsBounds: function( bounds ) {
      throw new Error( 'Segment.EllipticalArc.intersectsBounds unimplemented' );
    },

    intersection: function( ray ) {
      // be lazy. transform it into the space of a non-elliptical arc.
      var unitTransform = this.getUnitTransform();
      var rayInUnitCircleSpace = unitTransform.inverseRay2( ray );
      var hits = this.getUnitArcSegment().intersection( rayInUnitCircleSpace );

      return _.map( hits, function( hit ) {
        var transformedPoint = unitTransform.transformPosition2( hit.point );
        return {
          distance: ray.pos.distance( transformedPoint ),
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

      return new Segment.EllipticalArc( matrix.timesVector2( this._center ), radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );
    }
  } );

  // adapted from http://www.w3.org/TR/SVG/implnote.html#PathElementImplementationNotes
  // transforms the unit circle onto our ellipse
  Segment.EllipticalArc.computeUnitTransform = function( center, radiusX, radiusY, rotation ) {
    return new Transform3( Matrix3.translation( center.x, center.y ) // TODO: convert to Matrix3.translation( this._center) when available
      .timesMatrix( Matrix3.rotation2( rotation ) )
      .timesMatrix( Matrix3.scaling( radiusX, radiusY ) ) );
  };

  return Segment.EllipticalArc;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Shape handling
 *
 * Shapes are internally made up of Subpaths, which contain a series of segments, and are optionally closed.
 * Familiarity with how Canvas handles subpaths is helpful for understanding this code.
 *
 * Canvas spec: http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html
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

define( 'KITE/Shape',['require','KITE/kite','DOT/Vector2','DOT/Bounds2','DOT/Ray2','KITE/util/Subpath','KITE/parser/svgPath','KITE/util/LineStyles','KITE/segments/Arc','KITE/segments/Cubic','KITE/segments/EllipticalArc','KITE/segments/Line','KITE/segments/Quadratic'],function( require ) {
  

  var kite = require( 'KITE/kite' );

  // TODO: clean up imports
  var Vector2 = require( 'DOT/Vector2' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Ray2 = require( 'DOT/Ray2' );

  var Subpath = require( 'KITE/util/Subpath' );

  var svgPath = require( 'KITE/parser/svgPath' );
  require( 'KITE/util/LineStyles' );
  require( 'KITE/segments/Arc' );
  require( 'KITE/segments/Cubic' );
  require( 'KITE/segments/EllipticalArc' );
  require( 'KITE/segments/Line' );
  require( 'KITE/segments/Quadratic' );

  // for brevity
  function p( x, y ) { return new Vector2( x, y ); }

  function v( x, y ) { return new Vector2( x, y ); } // TODO: use this version in general, it makes more sense and is easier to type

  // a normalized vector for non-zero winding checks
  // var weirdDir = p( Math.PI, 22 / 7 );

  // all arguments optional, they are for the copy() method. if used, ensure that 'bounds' is consistent with 'subpaths'
  kite.Shape = function Shape( subpaths, bounds ) {
    // lower-level piecewise mathematical description using segments, also individually immutable
    this.subpaths = ( typeof subpaths === 'object' ) ? subpaths : [];
    assert && assert( this.subpaths.length === 0 || this.subpaths[0].constructor.name !== 'Array' );

    // computed bounds for all pieces added so far
    this.bounds = ( bounds || Bounds2.NOTHING ).copy();

    var that = this;
    if ( subpaths && typeof subpaths !== 'object' ) {
      assert && assert( typeof subpaths === 'string', 'if subpaths is not an object, it must be a string' );
      // parse the SVG path
      _.each( svgPath.parse( subpaths ), function( item ) {
        assert && assert( Shape.prototype[item.cmd] !== undefined, 'method ' + item.cmd + ' from parsed SVG does not exist' );
        that[item.cmd].apply( that, item.args );
      } );
    }

    this.resetControlPoints();

    phetAllocation && phetAllocation( 'Shape' );
  };
  var Shape = kite.Shape;

  Shape.prototype = {
    constructor: Shape,

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

    moveTo: function( x, y ) { return this.moveToPoint( v( x, y ) ); },
    moveToRelative: function( x, y ) { return this.moveToPointRelative( v( x, y ) ); },
    moveToPointRelative: function( point ) { return this.moveToPoint( this.getRelativePoint().plus( point ) ); },
    moveToPoint: function( point ) {
      this.addSubpath( new kite.Subpath().addPoint( point ) );
      this.resetControlPoints();

      return this;
    },

    lineTo: function( x, y ) { return this.lineToPoint( v( x, y ) ); },
    lineToRelative: function( x, y ) { return this.lineToPointRelative( v( x, y ) ); },
    lineToPointRelative: function( point ) { return this.lineToPoint( this.getRelativePoint().plus( point ) ); },
    lineToPoint: function( point ) {
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-lineto
      if ( this.hasSubpaths() ) {
        var start = this.getLastSubpath().getLastPoint();
        var end = point;
        var line = new kite.Segment.Line( start, end );
        this.getLastSubpath().addPoint( end );
        this.addSegmentAndBounds( line );
        assert && assert( !isNaN( this.bounds.getX() ) );
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

      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-quadraticcurveto
      this.ensure( controlPoint );
      var start = this.getLastSubpath().getLastPoint();
      var quadratic = new kite.Segment.Quadratic( start, controlPoint, point );
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
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-quadraticcurveto
      this.ensure( control1 );
      var start = this.getLastSubpath().getLastPoint();
      var cubic = new kite.Segment.Cubic( start, control1, control2, point );

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
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-arc

      var arc = new kite.Segment.Arc( center, radius, startAngle, endAngle, anticlockwise );

      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = arc.getStart();
      var endPoint = arc.getEnd();

      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint(), 0 ) ) {
        this.addSegmentAndBounds( new kite.Segment.Line( this.getLastSubpath().getLastPoint(), startPoint ) );
      }

      if ( !this.hasSubpaths() ) {
        this.addSubpath( new kite.Subpath() );
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
      // see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html#dom-context-2d-arc

      var ellipticalArc = new kite.Segment.EllipticalArc( center, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise );

      // we are assuming that the normal conditions were already met (or exceptioned out) so that these actually work with canvas
      var startPoint = ellipticalArc.start;
      var endPoint = ellipticalArc.end;

      // if there is already a point on the subpath, and it is different than our starting point, draw a line between them
      if ( this.hasSubpaths() && this.getLastSubpath().getLength() > 0 && !startPoint.equals( this.getLastSubpath().getLastPoint(), 0 ) ) {
        this.addSegmentAndBounds( new kite.Segment.Line( this.getLastSubpath().getLastPoint(), startPoint ) );
      }

      if ( !this.hasSubpaths() ) {
        this.addSubpath( new kite.Subpath() );
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
        var nextPath = new kite.Subpath();

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
      var subpath = new kite.Subpath();
      this.addSubpath( subpath );
      subpath.addPoint( v( x, y ) );
      subpath.addPoint( v( x + width, y ) );
      subpath.addPoint( v( x + width, y + height ) );
      subpath.addPoint( v( x, y + height ) );
      this.addSegmentAndBounds( new kite.Segment.Line( subpath.points[0], subpath.points[1] ) );
      this.addSegmentAndBounds( new kite.Segment.Line( subpath.points[1], subpath.points[2] ) );
      this.addSegmentAndBounds( new kite.Segment.Line( subpath.points[2], subpath.points[3] ) );
      subpath.close();
      this.addSubpath( new kite.Subpath() );
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
        this.moveToPoint( vertices[0] );
        for ( var i = 1; i < length; i++ ) {
          this.lineToPoint( vertices[i] );
        }
      }
      return this.close();
    },

    copy: function() {
      // copy each individual subpath, so future modifications to either Shape doesn't affect the other one
      return new Shape( _.map( this.subpaths, function( subpath ) { return subpath.copy(); } ), this.bounds );
    },

    // write out this shape's path to a canvas 2d context. does NOT include the beginPath()!
    writeToContext: function( context ) {
      var len = this.subpaths.length;
      for ( var i = 0; i < len; i++ ) {
        this.subpaths[i].writeToContext( context );
      }
    },

    // returns something like "M150 0 L75 200 L225 200 Z" for a triangle
    getSVGPath: function() {
      var subpathStrings = [];
      var len = this.subpaths.length;
      for ( var i = 0; i < len; i++ ) {
        var subpath = this.subpaths[i];
        if ( subpath.isDrawable() ) {
          // since the commands after this are relative to the previous 'point', we need to specify a move to the initial point
          var startPoint = subpath.getFirstSegment().start;
          assert && assert( startPoint.equals( subpath.getFirstPoint(), 0.00001 ) ); // sanity check
          var string = 'M ' + kite.svgNumber( startPoint.x ) + ' ' + kite.svgNumber( startPoint.y ) + ' ';

          string += _.map( subpath.segments, function( segment ) { return segment.getSVGPathFragment(); } ).join( ' ' );

          if ( subpath.isClosed() ) {
            string += ' Z';
          }
          subpathStrings.push( string );
        }
      }
      return subpathStrings.join( ' ' );
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

    // returns the bounds. if lineStyles exists, include the stroke in the bounds
    // TODO: consider renaming to getBounds()? (yes, definitely rename)
    computeBounds: function( lineStyles ) {
      if ( lineStyles ) {
        return this.bounds.union( this.getStrokedShape( lineStyles ).bounds );
      }
      else {
        return this.bounds;
      }
    },

    getBoundsWithTransform: function( matrix, lineStyles ) {
      // if we don't need to handle rotation/shear, don't use the extra effort!
      if ( matrix.isAxisAligned() ) {
        return this.computeBounds( lineStyles );
      }

      var bounds = Bounds2.NOTHING.copy();

      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[i];
        bounds.includeBounds( subpath.getBoundsWithTransform( matrix ) );
      }

      if ( lineStyles ) {
        bounds.includeBounds( this.getStrokedShape( lineStyles ).getBoundsWithTransform( matrix ) );
      }

      return bounds;
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
        var subpath = this.subpaths[i];

        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            var segment = subpath.segments[k];
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
        var subpath = this.subpaths[i];

        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            wind += subpath.segments[k].windingIntersection( ray );
          }

          // handle the implicit closing line segment
          if ( subpath.hasClosingSegment() ) {
            wind += subpath.getClosingSegment().windingIntersection( ray );
          }
        }
      }

      return wind;
    },

    intersectsBounds: function( bounds ) {
      var numSubpaths = this.subpaths.length;
      for ( var i = 0; i < numSubpaths; i++ ) {
        var subpath = this.subpaths[i];

        if ( subpath.isDrawable() ) {
          var numSegments = subpath.segments.length;
          for ( var k = 0; k < numSegments; k++ ) {
            if ( subpath.segments[k].intersectsBounds( bounds ) ) {
              return true;
            }
          }

          // handle the implicit closing line segment
          if ( subpath.hasClosingSegment() ) {
            if ( subpath.getClosingSegment().intersectsBounds( bounds ) ) {
              return true;
            }
          }
        }
      }
      return false;
    },

    // returns a new Shape that is an outline of the stroked path of this current Shape. currently not intended to be nested (doesn't do intersection computations yet)
    // TODO: rename stroked( lineStyles )
    getStrokedShape: function( lineStyles ) {
      var subpaths = [];
      var bounds = Bounds2.NOTHING.copy();
      var subLen = this.subpaths.length;
      for ( var i = 0; i < subLen; i++ ) {
        var subpath = this.subpaths[i];
        var strokedSubpath = subpath.stroked( lineStyles );
        subpaths = subpaths.concat( strokedSubpath );
      }
      subLen = subpaths.length;
      for ( i = 0; i < subLen; i++ ) {
        bounds.includeBounds( subpaths[i].bounds );
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
        subpaths.push( this.subpaths[i].offset( distance ) );
      }
      subLen = subpaths.length;
      for ( i = 0; i < subLen; i++ ) {
        bounds.includeBounds( subpaths[i].bounds );
      }
      return new Shape( subpaths, bounds );
    },

    toString: function() {
      // TODO: consider a more verbose but safer way?
      return 'new kite.Shape( \'' + this.getSVGPath() + '\' )';
    },

    /*---------------------------------------------------------------------------*
    * Internal subpath computations
    *----------------------------------------------------------------------------*/

    addSegmentAndBounds: function( segment ) {
      this.getLastSubpath().addSegment( segment );
      this.bounds = this.bounds.includeBounds( this.getLastSubpath().bounds );
    },

    ensure: function( point ) {
      if ( !this.hasSubpaths() ) {
        this.addSubpath( new Subpath() );
        this.getLastSubpath().addPoint( point );
      }
    },

    addSubpath: function( subpath ) {
      this.subpaths.push( subpath );

      return this; // allow chaining
    },

    hasSubpaths: function() {
      return this.subpaths.length > 0;
    },

    getLastSubpath: function() {
      return _.last( this.subpaths );
    },

    // gets the last point in the last subpath, or null if it doesn't exist
    getLastPoint: function() {
      return this.hasSubpaths() ? this.getLastSubpath().getLastPoint() : null;
    },

    getLastSegment: function() {
      if ( !this.hasSubpaths() ) { return null; }

      var subpath = this.getLastSubpath();
      if ( !subpath.isDrawable() ) { return null; }

      return subpath.getLastSegment();
    },

    // returns the point to be used for smooth quadratic segments
    getSmoothQuadraticControlPoint: function() {
      var lastPoint = this.getLastPoint();

      if ( this.lastQuadraticControlPoint ) {
        return lastPoint.plus( lastPoint.minus( this.lastQuadraticControlPoint ) );
      } else {
        return lastPoint;
      }
    },

    // returns the point to be used for smooth cubic segments
    getSmoothCubicControlPoint: function() {
      var lastPoint = this.getLastPoint();

      if ( this.lastCubicControlPoint ) {
        return lastPoint.plus( lastPoint.minus( this.lastCubicControlPoint ) );
      } else {
        return lastPoint;
      }
    },

    getRelativePoint: function() {
      var lastPoint = this.getLastPoint();
      return lastPoint ? lastPoint : Vector2.ZERO;
    }
  };

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

// Copyright 2002-2014, University of Colorado Boulder

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
  

  return kite;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * A 3D cuboid-shaped bounded area (bounding box)
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

define( 'DOT/Bounds3',['require','DOT/dot','DOT/Vector3'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  require( 'DOT/Vector3' );

  // not using x,y,width,height so that it can handle infinity-based cases in a better way
  dot.Bounds3 = function Bounds3( minX, minY, minZ, maxX, maxY, maxZ ) {
    assert && assert( maxY !== undefined, 'Bounds3 requires 4 parameters' );
    this.minX = minX;
    this.minY = minY;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxY = maxY;
    this.maxZ = maxZ;

    phetAllocation && phetAllocation( 'Bounds3' );
  };
  var Bounds3 = dot.Bounds3;

  Bounds3.prototype = {
    constructor: Bounds3,

    isBounds: true,
    dimension: 3,

    /*---------------------------------------------------------------------------*
    * Properties
    *----------------------------------------------------------------------------*/

    getWidth: function() { return this.maxX - this.minX; },
    get width() { return this.getWidth(); },

    getHeight: function() { return this.maxY - this.minY; },
    get height() { return this.getHeight(); },

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
    getX: function() { return this.minX; },
    get x() { return this.getX(); },
    getY: function() { return this.minY; },
    get y() { return this.getY(); },
    getZ: function() { return this.minZ; },
    get z() { return this.getZ(); },

    getMinX: function() { return this.minX; },
    get left() { return this.minX; },
    getMinY: function() { return this.minY; },
    get top() { return this.minY; },
    getMinZ: function() { return this.minZ; },
    get back() { return this.minZ; },
    getMaxX: function() { return this.maxX; },
    get right() { return this.maxX; },
    getMaxY: function() { return this.maxY; },
    get bottom() { return this.maxY; },
    getMaxZ: function() { return this.maxZ; },
    get front() { return this.maxZ; },

    getCenterX: function() { return ( this.maxX + this.minX ) / 2; },
    get centerX() { return this.getCenterX(); },
    getCenterY: function() { return ( this.maxY + this.minY ) / 2; },
    get centerY() { return this.getCenterY(); },
    getCenterZ: function() { return ( this.maxZ + this.minZ ) / 2; },
    get centerZ() { return this.getCenterZ(); },

    getCenter: function() { return new dot.Vector3( this.getCenterX(), this.getCenterY(), this.getCenterZ() ); },
    get center() { return this.getCenter(); },

    isEmpty: function() { return this.getWidth() < 0 || this.getHeight() < 0 || this.getDepth() < 0; },

    isFinite: function() {
      return isFinite( this.minX ) && isFinite( this.minY ) && isFinite( this.minZ ) && isFinite( this.maxX ) && isFinite( this.maxY ) && isFinite( this.maxZ );
    },

    isValid: function() {
      return !this.isEmpty() && this.isFinite();
    },

    // whether the coordinates are inside the bounding box (or on the boundary)
    containsCoordinates: function( x, y, z ) {
      return this.minX <= x && x <= this.maxX && this.minY <= y && y <= this.maxY && this.minZ <= z && z <= this.maxZ;
    },

    // whether the point is inside the bounding box (or on the boundary)
    containsPoint: function( point ) {
      return this.containsCoordinates( point.x, point.y, point.z );
    },

    // whether this bounding box completely contains the argument bounding box
    containsBounds: function( bounds ) {
      return this.minX <= bounds.minX && this.maxX >= bounds.maxX && this.minY <= bounds.minY && this.maxY >= bounds.maxY && this.minZ <= bounds.minZ && this.maxZ >= bounds.maxZ;
    },

    // whether the intersection is non-empty (if they share any part of a boundary, this will be true)
    intersectsBounds: function( bounds ) {
      // TODO: more efficient way of doing this?
      return !this.intersection( bounds ).isEmpty();
    },

    toString: function() {
      return '[x:(' + this.minX + ',' + this.maxX + '),y:(' + this.minY + ',' + this.maxY + '),z:(' + this.minZ + ',' + this.maxZ + ')]';
    },

    equals: function( other ) {
      return this.minX === other.minX && this.minY === other.minY && this.minZ === other.minZ && this.maxX === other.maxX && this.maxY === other.maxY && this.maxZ === other.maxZ;
    },

    equalsEpsilon: function( other, epsilon ) {
      epsilon = epsilon || 0;
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
    *----------------------------------------------------------------------------*/

    // create a copy, or if bounds is passed in, set that bounds to our value
    copy: function( bounds ) {
      if ( bounds ) {
        return bounds.set( this );
      }
      else {
        return new Bounds3( this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ );
      }
    },

    // immutable operations (bounding-box style handling, so that the relevant bounds contain everything)
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

    // like a union with a point-sized bounding box
    withPoint: function( point ) {
      return this.withCoordinates( point.x, point.y, point.z );
    },

    withMinX: function( minX ) { return new Bounds3( minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ ); },
    withMinY: function( minY ) { return new Bounds3( this.minX, minY, this.minZ, this.maxX, this.maxY, this.maxZ ); },
    withMinZ: function( minZ ) { return new Bounds3( this.minX, this.minY, minZ, this.maxX, this.maxY, this.maxZ ); },
    withMaxX: function( maxX ) { return new Bounds3( this.minX, this.minY, this.minZ, maxX, this.maxY, this.maxZ ); },
    withMaxY: function( maxY ) { return new Bounds3( this.minX, this.minY, this.minZ, this.maxX, maxY, this.maxZ ); },
    withMaxZ: function( maxZ ) { return new Bounds3( this.minX, this.minY, this.minZ, this.maxX, this.maxY, maxZ ); },

    // copy rounded to integral values, expanding where necessary
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

    // copy rounded to integral values, contracting where necessary
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

    // transform a bounding box.
    // NOTE that box.transformed( matrix ).transformed( inverse ) may be larger than the original box
    transformed: function( matrix ) {
      return this.copy().transform( matrix );
    },

    // returns copy expanded on all sides by length d
    dilated: function( d ) {
      return new Bounds3( this.minX - d, this.minY - d, this.minZ - d, this.maxX + d, this.maxY + d, this.maxZ + d );
    },

    // dilates only in the x direction
    dilatedX: function( x ) {
      return new Bounds3( this.minX - x, this.minY, this.minZ, this.maxX + x, this.maxY, this.maxZ );
    },

    // dilates only in the y direction
    dilatedY: function( y ) {
      return new Bounds3( this.minX, this.minY - y, this.minZ, this.maxX, this.maxY + y, this.maxZ );
    },

    // dilates only in the z direction
    dilatedZ: function( z ) {
      return new Bounds3( this.minX, this.minY, this.minZ - z, this.maxX, this.maxY, this.maxZ + z );
    },

    // dilate with different amounts in the x, y and z directions
    dilatedXYZ: function( x, y, z ) {
      return new Bounds3( this.minX - x, this.minY - y, this.minZ - z, this.maxX + x, this.maxY + y, this.maxZ + z );
    },

    // returns copy contracted on all sides by length d, or x/y/z separately
    eroded: function( d ) { return this.dilated( -d ); },
    erodedX: function( x ) { return this.dilatedX( -x ); },
    erodedY: function( y ) { return this.dilatedY( -y ); },
    erodedZ: function( z ) { return this.dilatedZ( -z ); },
    erodedXYZ: function( x, y, z ) { return this.dilatedXYZ( -x, -y, -z ); },

    shiftedX: function( x ) {
      return new Bounds3( this.minX + x, this.minY, this.minZ, this.maxX + x, this.maxY, this.maxZ );
    },

    shiftedY: function( y ) {
      return new Bounds3( this.minX, this.minY + y, this.minZ, this.maxX, this.maxY + y, this.maxZ );
    },

    shiftedZ: function( z ) {
      return new Bounds3( this.minX, this.minY, this.minZ + z, this.maxX, this.maxY, this.maxZ + z );
    },

    shifted: function( x, y, z ) {
      return new Bounds3( this.minX + x, this.minY + y, this.minZ + z, this.maxX + x, this.maxY + y, this.maxZ + z );
    },

    /*---------------------------------------------------------------------------*
    * Mutable operations
    *----------------------------------------------------------------------------*/

    // core mutations (every other mutator should call one of these once)
    setMinMax: function( minX, minY, minZ, maxX, maxY, maxZ ) {
      this.minX = minX;
      this.minY = minY;
      this.minZ = minZ;
      this.maxX = maxX;
      this.maxY = maxY;
      this.maxZ = maxZ;
      return this;
    },
    setMinX: function( minX ) {
      this.minX = minX;
      return this;
    },
    setMinY: function( minY ) {
      this.minY = minY;
      return this;
    },
    setMinZ: function( minZ ) {
      this.minZ = minZ;
      return this;
    },
    setMaxX: function( maxX ) {
      this.maxX = maxX;
      return this;
    },
    setMaxY: function( maxY ) {
      this.maxY = maxY;
      return this;
    },
    setMaxZ: function( maxZ ) {
      this.maxZ = maxZ;
      return this;
    },

    set: function( bounds ) {
      return this.setMinMax( bounds.minX, bounds.minY, bounds.minZ, bounds.maxX, bounds.maxY, bounds.maxZ );
    },

    // mutable union
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

    // mutable intersection
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

    addPoint: function( point ) {
      return this.addCoordinates( point.x, point.y, point.z );
    },

    // round to integral values, expanding where necessary
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

    // round to integral values, contracting where necessary
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

    // transform a bounding box.
    // NOTE that box.transformed( matrix ).transformed( inverse ) may be larger than the original box
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

    // expands on all sides by length d
    dilate: function( d ) {
      return this.setMinMax( this.minX - d, this.minY - d, this.minZ - d, this.maxX + d, this.maxY + d, this.maxZ + d );
    },

    // dilates only in the x direction
    dilateX: function( x ) {
      return this.setMinMax( this.minX - x, this.minY, this.minZ, this.maxX + x, this.maxY, this.maxZ );
    },

    // dilates only in the y direction
    dilateY: function( y ) {
      return this.setMinMax( this.minX, this.minY - y, this.minZ, this.maxX, this.maxY + y, this.maxZ );
    },

    // dilates only in the z direction
    dilateZ: function( z ) {
      return this.setMinMax( this.minX, this.minY, this.minZ - z, this.maxX, this.maxY, this.maxZ + z );
    },

    // dilate with different amounts in the x, y and z directions
    dilateXYZ: function( x, y, z ) {
      return this.setMinMax( this.minX - x, this.minY - y, this.minZ - z, this.maxX + x, this.maxY + y, this.maxZ + z );
    },

    // contracts on all sides by length d, or x/y/z independently
    erode: function( d ) { return this.dilate( -d ); },
    erodeX: function( x ) { return this.dilateX( -x ); },
    erodeY: function( y ) { return this.dilateY( -y ); },
    erodeZ: function( z ) { return this.dilateZ( -z ); },
    erodeXYZ: function( x, y, z ) { return this.dilateXYZ( -x, -y, -z ); },

    shiftX: function( x ) {
      return this.setMinMax( this.minX + x, this.minY, this.minZ, this.maxX + x, this.maxY, this.maxZ );
    },

    shiftY: function( y ) {
      return this.setMinMax( this.minX, this.minY + y, this.minZ, this.maxX, this.maxY + y, this.maxZ );
    },

    shiftZ: function( z ) {
      return this.setMinMax( this.minX, this.minY, this.minZ + z, this.maxX, this.maxY, this.maxZ + z );
    },

    shift: function( x, y, z ) {
      return this.setMinMax( this.minX + x, this.minY + y, this.minZ + z, this.maxX + x, this.maxY + y, this.maxZ + z );
    }
  };

  Bounds3.cuboid = function( x, y, z, width, height, depth ) {
    return new Bounds3( x, y, z, x + width, y + height, z + depth );
  };

  // a volume-less point bounds, which can be dilated to form a centered bounds
  Bounds3.point = function( x, y, z ) {
    return new Bounds3( x, y, z, x, y, z );
  };

  // specific bounds useful for operations
  Bounds3.EVERYTHING = new Bounds3( Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY );
  Bounds3.NOTHING = new Bounds3( Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY );

  return Bounds3;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Immutable complex number handling
 *
 * TODO: handle quaternions in a Quaternion.js!
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Chris Malley
 */

define( 'DOT/Complex',['require','DOT/dot','PHET_CORE/inherit','DOT/Vector2'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );

  // not using x,y,width,height so that it can handle infinity-based cases in a better way
  dot.Complex = function Complex( real, imaginary ) {
    Vector2.call( this, real, imaginary );
    this.real = real;
    this.imaginary = imaginary;
  };
  var Complex = dot.Complex;

  Complex.real = function( real ) {
    return new Complex( real, 0 );
  };

  Complex.imaginary = function( imaginary ) {
    return new Complex( 0, imaginary );
  };

  Complex.createPolar = function( magnitude, phase ) {
    return new Complex( magnitude * Math.cos( phase ), magnitude * Math.sin( phase ) );
  };

  // inheriting Vector2 for now since many times we may want to treat the complex number as a vector
  // ideally, we should have Vector2-likeness be a mixin?
  // we also inherit the immutable form since we add 'real' and 'imaginary' properties,
  // without adding extra logic to mutators in Vector2
  inherit( Vector2.Immutable, Complex, {
    phase: Vector2.prototype.angle,

    // TODO: remove times() from Vector2? or have it do this for vectors
    times: function( c ) {
      return new Complex( this.real * c.real - this.imaginary * c.imaginary, this.real * c.imaginary + this.imaginary * c.real );
    },

    dividedBy: function( c ) {
      var cMag = c.magnitudeSquared();
      return new Complex(
          ( this.real * c.real + this.imaginary * c.imaginary ) / cMag,
          ( this.imaginary * c.real - this.real * c.imaginary ) / cMag
      );
    },

    // TODO: pow()
    sqrt: function() {
      var mag = this.magnitude();
      return new Complex( Math.sqrt( ( mag + this.real ) / 2 ),
          ( this.imaginary >= 0 ? 1 : -1 ) * Math.sqrt( ( mag - this.real ) / 2 ) );
    },

    conjugate: function() {
      return new Complex( this.real, -this.imaginary );
    },

    // e^(a+bi) = ( e^a ) * ( cos(b) + i * sin(b) )
    exponentiated: function() {
      return Complex.createPolar( Math.exp( this.real ), this.imaginary );
    },

    toString: function() {
      return "Complex(" + this.x + ", " + this.y + ")";
    }
  } );

  Complex.ZERO = new Complex( 0, 0 );
  Complex.ONE = new Complex( 1, 0 );
  Complex.I = new Complex( 0, 1 );

  return Complex;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * 2D convex hulls
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/ConvexHull2',['require','DOT/dot'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  // counter-clockwise turn if > 0, clockwise turn if < 0, collinear if === 0.
  function ccw( p1, p2, p3 ) {
    return p2.minus( p1 ).crossScalar( p3.minus( p1 ) );
  }

  dot.ConvexHull2 = {
    // test: all collinear, multiple ways of having same angle, etc.

    // points is an array of Vector2 instances. see http://en.wikipedia.org/wiki/Graham_scan
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
      var result = [p];

      _.each( points, function( point ) {
        // ignore points equal to our starting point
        if ( p.x === point.x && p.y === point.y ) { return; }

        function isRightTurn() {
          if ( result.length < 2 ) {
            return false;
          }
          var cross = ccw( result[result.length - 2], result[result.length - 1], point );
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

  return dot.ConvexHull2;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Basic width and height
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Dimension2',['require','DOT/dot','DOT/Bounds2'],function( require ) {
  

  var dot = require( 'DOT/dot' );
  require( 'DOT/Bounds2' );

  dot.Dimension2 = function Dimension2( width, height ) {
    this.width = width;
    this.height = height;
  };
  var Dimension2 = dot.Dimension2;

  Dimension2.prototype = {
    constructor: Dimension2,

    toString: function() {
      return "[" + this.width + "w, " + this.height + "h]";
    },

    set: function( dimension ) {
      this.width = dimension.width;
      this.height = dimension.height;
      return this;
    },

    setWidth: function( width ) {
      this.width = width;
      return this;
    },

    setHeight: function( width ) {
      this.width = width;
      return this;
    },

    copy: function( dimension ) {
      if ( dimension ) {
        return dimension.set( this );
      }
      else {
        return new Dimension2( this.width, this.height );
      }
    },

    toBounds: function( x, y ) {
      x = x || 0;
      y = y || 0;
      return new dot.Bounds2( x, y, this.width + x, this.height + y );
    },

    equals: function( other ) {
      return this.width === other.width && this.height === other.height;
    }
  };

  return Dimension2;
} );

// Copyright 2002-2014, University of Colorado Boulder

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
  

  var dot = require( 'DOT/dot' );

  var Float32Array = window.Float32Array || Array;

  // require( 'DOT/Matrix' ); // commented out so Require.js doesn't complain about the circular dependency

  dot.EigenvalueDecomposition = function EigenvalueDecomposition( matrix ) {
    var i, j;

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
        this.issymmetric = (A[i * this.n + j] === A[j * this.n + i]);
      }
    }

    if ( this.issymmetric ) {
      for ( i = 0; i < n; i++ ) {
        for ( j = 0; j < n; j++ ) {
          this.V[i * this.n + j] = A[i * this.n + j];
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
          this.H[i * this.n + j] = A[i * this.n + j];
        }
      }

      // Reduce to Hessenberg form.
      this.orthes();

      // Reduce Hessenberg to real Schur form.
      this.hqr2();
    }
  };
  var EigenvalueDecomposition = dot.EigenvalueDecomposition;

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
      var n = this.n, d = this.d, e = this.e;

      var X = new dot.Matrix( n, n );
      var D = X.entries;
      for ( var i = 0; i < n; i++ ) {
        for ( var j = 0; j < n; j++ ) {
          D[i * this.n + j] = 0.0;
        }
        D[i * this.n + i] = d[i];
        if ( e[i] > 0 ) {
          D[i * this.n + i + 1] = e[i];
        }
        else if ( e[i] < 0 ) {
          D[i * this.n + i - 1] = e[i];
        }
      }
      return X;
    },

    // Symmetric Householder reduction to tridiagonal form.
    tred2: function() {
      var n = this.n, V = this.V, d = this.d, e = this.e;
      var i, j, k, f, g, h;

      //  This is derived from the Algol procedures tred2 by
      //  Bowdler, Martin, Reinsch, and Wilkinson, Handbook for
      //  Auto. Comp., Vol.ii-Linear Algebra, and the corresponding
      //  Fortran subroutine in EISPACK.

      for ( j = 0; j < n; j++ ) {
        d[j] = V[(n - 1) * n + j];
      }

      // Householder reduction to tridiagonal form.

      for ( i = n - 1; i > 0; i-- ) {

        // Scale to avoid under/overflow.

        var scale = 0.0;
        h = 0.0;
        for ( k = 0; k < i; k++ ) {
          scale = scale + Math.abs( d[k] );
        }
        if ( scale === 0.0 ) {
          e[i] = d[i - 1];
          for ( j = 0; j < i; j++ ) {
            d[j] = V[(i - 1) * n + j];
            V[i * this.n + j] = 0.0;
            V[j * this.n + i] = 0.0;
          }
        }
        else {

          // Generate Householder vector.

          for ( k = 0; k < i; k++ ) {
            d[k] /= scale;
            h += d[k] * d[k];
          }
          f = d[i - 1];
          g = Math.sqrt( h );
          if ( f > 0 ) {
            g = -g;
          }
          e[i] = scale * g;
          h = h - f * g;
          d[i - 1] = f - g;
          for ( j = 0; j < i; j++ ) {
            e[j] = 0.0;
          }

          // Apply similarity transformation to remaining columns.

          for ( j = 0; j < i; j++ ) {
            f = d[j];
            V[j * this.n + i] = f;
            g = e[j] + V[j * n + j] * f;
            for ( k = j + 1; k <= i - 1; k++ ) {
              g += V[k * n + j] * d[k];
              e[k] += V[k * n + j] * f;
            }
            e[j] = g;
          }
          f = 0.0;
          for ( j = 0; j < i; j++ ) {
            e[j] /= h;
            f += e[j] * d[j];
          }
          var hh = f / (h + h);
          for ( j = 0; j < i; j++ ) {
            e[j] -= hh * d[j];
          }
          for ( j = 0; j < i; j++ ) {
            f = d[j];
            g = e[j];
            for ( k = j; k <= i - 1; k++ ) {
              V[k * n + j] -= (f * e[k] + g * d[k]);
            }
            d[j] = V[(i - 1) * n + j];
            V[i * this.n + j] = 0.0;
          }
        }
        d[i] = h;
      }

      // Accumulate transformations.

      for ( i = 0; i < n - 1; i++ ) {
        V[(n - 1) * n + i] = V[i * n + i];
        V[i * n + i] = 1.0;
        h = d[i + 1];
        if ( h !== 0.0 ) {
          for ( k = 0; k <= i; k++ ) {
            d[k] = V[k * n + (i + 1)] / h;
          }
          for ( j = 0; j <= i; j++ ) {
            g = 0.0;
            for ( k = 0; k <= i; k++ ) {
              g += V[k * n + (i + 1)] * V[k * n + j];
            }
            for ( k = 0; k <= i; k++ ) {
              V[k * n + j] -= g * d[k];
            }
          }
        }
        for ( k = 0; k <= i; k++ ) {
          V[k * n + (i + 1)] = 0.0;
        }
      }
      for ( j = 0; j < n; j++ ) {
        d[j] = V[(n - 1) * n + j];
        V[(n - 1) * n + j] = 0.0;
      }
      V[(n - 1) * n + (n - 1)] = 1.0;
      e[0] = 0.0;
    },

    // Symmetric tridiagonal QL algorithm.
    tql2: function() {
      var n = this.n, V = this.V, d = this.d, e = this.e;
      var i, j, k, l, g, p;
      var iter;

      //  This is derived from the Algol procedures tql2, by
      //  Bowdler, Martin, Reinsch, and Wilkinson, Handbook for
      //  Auto. Comp., Vol.ii-Linear Algebra, and the corresponding
      //  Fortran subroutine in EISPACK.

      for ( i = 1; i < n; i++ ) {
        e[i - 1] = e[i];
      }
      e[n - 1] = 0.0;

      var f = 0.0;
      var tst1 = 0.0;
      var eps = Math.pow( 2.0, -52.0 );
      for ( l = 0; l < n; l++ ) {

        // Find small subdiagonal element

        tst1 = Math.max( tst1, Math.abs( d[l] ) + Math.abs( e[l] ) );
        var m = l;
        while ( m < n ) {
          if ( Math.abs( e[m] ) <= eps * tst1 ) {
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

            g = d[l];
            p = (d[l + 1] - g) / (2.0 * e[l]);
            var r = dot.Matrix.hypot( p, 1.0 );
            if ( p < 0 ) {
              r = -r;
            }
            d[l] = e[l] / (p + r);
            d[l + 1] = e[l] * (p + r);
            var dl1 = d[l + 1];
            var h = g - d[l];
            for ( i = l + 2; i < n; i++ ) {
              d[i] -= h;
            }
            f = f + h;

            // Implicit QL transformation.

            p = d[m];
            var c = 1.0;
            var c2 = c;
            var c3 = c;
            var el1 = e[l + 1];
            var s = 0.0;
            var s2 = 0.0;
            for ( i = m - 1; i >= l; i-- ) {
              c3 = c2;
              c2 = c;
              s2 = s;
              g = c * e[i];
              h = c * p;
              r = dot.Matrix.hypot( p, e[i] );
              e[i + 1] = s * r;
              s = e[i] / r;
              c = p / r;
              p = c * d[i] - s * g;
              d[i + 1] = h + s * (c * g + s * d[i]);

              // Accumulate transformation.

              for ( k = 0; k < n; k++ ) {
                h = V[k * n + (i + 1)];
                V[k * n + (i + 1)] = s * V[k * n + i] + c * h;
                V[k * n + i] = c * V[k * n + i] - s * h;
              }
            }
            p = -s * s2 * c3 * el1 * e[l] / dl1;
            e[l] = s * p;
            d[l] = c * p;

            // Check for convergence.

          } while ( Math.abs( e[l] ) > eps * tst1 );
        }
        d[l] = d[l] + f;
        e[l] = 0.0;
      }

      // Sort eigenvalues and corresponding vectors.

      for ( i = 0; i < n - 1; i++ ) {
        k = i;
        p = d[i];
        for ( j = i + 1; j < n; j++ ) {
          if ( d[j] < p ) {
            k = j;
            p = d[j];
          }
        }
        if ( k !== i ) {
          d[k] = d[i];
          d[i] = p;
          for ( j = 0; j < n; j++ ) {
            p = V[j * this.n + i];
            V[j * this.n + i] = V[j * n + k];
            V[j * n + k] = p;
          }
        }
      }
    },

    // Nonsymmetric reduction to Hessenberg form.
    orthes: function() {
      var n = this.n, V = this.V, H = this.H, ort = this.ort;
      var i, j, m, f, g;

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
          scale = scale + Math.abs( H[i * n + (m - 1)] );
        }
        if ( scale !== 0.0 ) {

          // Compute Householder transformation.

          var h = 0.0;
          for ( i = high; i >= m; i-- ) {
            ort[i] = H[i * n + (m - 1)] / scale;
            h += ort[i] * ort[i];
          }
          g = Math.sqrt( h );
          if ( ort[m] > 0 ) {
            g = -g;
          }
          h = h - ort[m] * g;
          ort[m] = ort[m] - g;

          // Apply Householder similarity transformation
          // H = (I-u*u'/h)*H*(I-u*u')/h)

          for ( j = m; j < n; j++ ) {
            f = 0.0;
            for ( i = high; i >= m; i-- ) {
              f += ort[i] * H[i * this.n + j];
            }
            f = f / h;
            for ( i = m; i <= high; i++ ) {
              H[i * this.n + j] -= f * ort[i];
            }
          }

          for ( i = 0; i <= high; i++ ) {
            f = 0.0;
            for ( j = high; j >= m; j-- ) {
              f += ort[j] * H[i * this.n + j];
            }
            f = f / h;
            for ( j = m; j <= high; j++ ) {
              H[i * this.n + j] -= f * ort[j];
            }
          }
          ort[m] = scale * ort[m];
          H[m * n + (m - 1)] = scale * g;
        }
      }

      // Accumulate transformations (Algol's ortran).

      for ( i = 0; i < n; i++ ) {
        for ( j = 0; j < n; j++ ) {
          V[i * this.n + j] = (i === j ? 1.0 : 0.0);
        }
      }

      for ( m = high - 1; m >= low + 1; m-- ) {
        if ( H[m * n + (m - 1)] !== 0.0 ) {
          for ( i = m + 1; i <= high; i++ ) {
            ort[i] = H[i * n + (m - 1)];
          }
          for ( j = m; j <= high; j++ ) {
            g = 0.0;
            for ( i = m; i <= high; i++ ) {
              g += ort[i] * V[i * this.n + j];
            }
            // Double division avoids possible underflow
            g = (g / ort[m]) / H[m * n + (m - 1)];
            for ( i = m; i <= high; i++ ) {
              V[i * this.n + j] += g * ort[i];
            }
          }
        }
      }
    },

    // Complex scalar division.
    cdiv: function( xr, xi, yr, yi ) {
      var r, d;
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
      var n, V = this.V, d = this.d, e = this.e, H = this.H;
      var i, j, k, l, m;
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
      var p = 0, q = 0, r = 0, s = 0, z = 0, t, w, x, y;

      // Store roots isolated by balanc and compute matrix norm

      var norm = 0.0;
      for ( i = 0; i < nn; i++ ) {
        if ( i < low || i > high ) {
          d[i] = H[i * n + i];
          e[i] = 0.0;
        }
        for ( j = Math.max( i - 1, 0 ); j < nn; j++ ) {
          norm = norm + Math.abs( H[i * this.n + j] );
        }
      }

      // Outer loop over eigenvalue index

      iter = 0;
      while ( n >= low ) {

        // Look for single small sub-diagonal element

        l = n;
        while ( l > low ) {
          s = Math.abs( H[(l - 1) * n + (l - 1)] ) + Math.abs( H[l * n + l] );
          if ( s === 0.0 ) {
            s = norm;
          }
          if ( Math.abs( H[l * n + (l - 1)] ) < eps * s ) {
            break;
          }
          l--;
        }

        // Check for convergence
        // One root found

        if ( l === n ) {
          H[n * n + n] = H[n * n + n] + exshift;
          d[n] = H[n * n + n];
          e[n] = 0.0;
          n--;
          iter = 0;

          // Two roots found

        }
        else if ( l === n - 1 ) {
          w = H[n * n + n - 1] * H[(n - 1) * n + n];
          p = (H[(n - 1) * n + (n - 1)] - H[n * n + n]) / 2.0;
          q = p * p + w;
          z = Math.sqrt( Math.abs( q ) );
          H[n * n + n] = H[n * n + n] + exshift;
          H[(n - 1) * n + (n - 1)] = H[(n - 1) * n + (n - 1)] + exshift;
          x = H[n * n + n];

          // Real pair

          if ( q >= 0 ) {
            if ( p >= 0 ) {
              z = p + z;
            }
            else {
              z = p - z;
            }
            d[n - 1] = x + z;
            d[n] = d[n - 1];
            if ( z !== 0.0 ) {
              d[n] = x - w / z;
            }
            e[n - 1] = 0.0;
            e[n] = 0.0;
            x = H[n * n + n - 1];
            s = Math.abs( x ) + Math.abs( z );
            p = x / s;
            q = z / s;
            r = Math.sqrt( p * p + q * q );
            p = p / r;
            q = q / r;

            // Row modification

            for ( j = n - 1; j < nn; j++ ) {
              z = H[(n - 1) * n + j];
              H[(n - 1) * n + j] = q * z + p * H[n * n + j];
              H[n * n + j] = q * H[n * n + j] - p * z;
            }

            // Column modification

            for ( i = 0; i <= n; i++ ) {
              z = H[i * n + n - 1];
              H[i * n + n - 1] = q * z + p * H[i * n + n];
              H[i * n + n] = q * H[i * n + n] - p * z;
            }

            // Accumulate transformations

            for ( i = low; i <= high; i++ ) {
              z = V[i * n + n - 1];
              V[i * n + n - 1] = q * z + p * V[i * n + n];
              V[i * n + n] = q * V[i * n + n] - p * z;
            }

            // Complex pair

          }
          else {
            d[n - 1] = x + p;
            d[n] = x + p;
            e[n - 1] = z;
            e[n] = -z;
          }
          n = n - 2;
          iter = 0;

          // No convergence yet

        }
        else {

          // Form shift

          x = H[n * n + n];
          y = 0.0;
          w = 0.0;
          if ( l < n ) {
            y = H[(n - 1) * n + (n - 1)];
            w = H[n * n + n - 1] * H[(n - 1) * n + n];
          }

          // Wilkinson's original ad hoc shift

          if ( iter === 10 ) {
            exshift += x;
            for ( i = low; i <= n; i++ ) {
              H[i * n + i] -= x;
            }
            s = Math.abs( H[n * n + n - 1] ) + Math.abs( H[(n - 1) * n + n - 2] );
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
                H[i * n + i] -= s;
              }
              exshift += s;
              x = y = w = 0.964;
            }
          }

          iter = iter + 1;   // (Could check iteration count here.)

          // Look for two consecutive small sub-diagonal elements

          m = n - 2;
          while ( m >= l ) {
            z = H[m * n + m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / H[(m + 1) * n + m] + H[m * n + m + 1];
            q = H[(m + 1) * n + m + 1] - z - r - s;
            r = H[(m + 2) * n + m + 1];
            s = Math.abs( p ) + Math.abs( q ) + Math.abs( r );
            p = p / s;
            q = q / s;
            r = r / s;
            if ( m === l ) {
              break;
            }
            if ( Math.abs( H[m * n + (m - 1)] ) * (Math.abs( q ) + Math.abs( r )) <
                 eps * (Math.abs( p ) * (Math.abs( H[(m - 1) * n + m - 1] ) + Math.abs( z ) +
                                         Math.abs( H[(m + 1) * n + m + 1] ))) ) {
              break;
            }
            m--;
          }

          for ( i = m + 2; i <= n; i++ ) {
            H[i * n + i - 2] = 0.0;
            if ( i > m + 2 ) {
              H[i * n + i - 3] = 0.0;
            }
          }

          // Double QR step involving rows l:n and columns m:n

          for ( k = m; k <= n - 1; k++ ) {
            var notlast = (k !== n - 1);
            if ( k !== m ) {
              p = H[k * n + k - 1];
              q = H[(k + 1) * n + k - 1];
              r = (notlast ? H[(k + 2) * n + k - 1] : 0.0);
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
                H[k * n + k - 1] = -s * x;
              }
              else if ( l !== m ) {
                H[k * n + k - 1] = -H[k * n + k - 1];
              }
              p = p + s;
              x = p / s;
              y = q / s;
              z = r / s;
              q = q / p;
              r = r / p;

              // Row modification

              for ( j = k; j < nn; j++ ) {
                p = H[k * n + j] + q * H[(k + 1) * n + j];
                if ( notlast ) {
                  p = p + r * H[(k + 2) * n + j];
                  H[(k + 2) * n + j] = H[(k + 2) * n + j] - p * z;
                }
                H[k * n + j] = H[k * n + j] - p * x;
                H[(k + 1) * n + j] = H[(k + 1) * n + j] - p * y;
              }

              // Column modification

              for ( i = 0; i <= Math.min( n, k + 3 ); i++ ) {
                p = x * H[i * n + k] + y * H[i * n + k + 1];
                if ( notlast ) {
                  p = p + z * H[i * n + k + 2];
                  H[i * n + k + 2] = H[i * n + k + 2] - p * r;
                }
                H[i * n + k] = H[i * n + k] - p;
                H[i * n + k + 1] = H[i * n + k + 1] - p * q;
              }

              // Accumulate transformations

              for ( i = low; i <= high; i++ ) {
                p = x * V[i * n + k] + y * V[i * n + k + 1];
                if ( notlast ) {
                  p = p + z * V[i * n + k + 2];
                  V[i * n + k + 2] = V[i * n + k + 2] - p * r;
                }
                V[i * n + k] = V[i * n + k] - p;
                V[i * n + k + 1] = V[i * n + k + 1] - p * q;
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
        p = d[n];
        q = e[n];

        // Real vector

        if ( q === 0 ) {
          l = n;
          H[n * n + n] = 1.0;
          for ( i = n - 1; i >= 0; i-- ) {
            w = H[i * n + i] - p;
            r = 0.0;
            for ( j = l; j <= n; j++ ) {
              r = r + H[i * this.n + j] * H[j * n + n];
            }
            if ( e[i] < 0.0 ) {
              z = w;
              s = r;
            }
            else {
              l = i;
              if ( e[i] === 0.0 ) {
                if ( w !== 0.0 ) {
                  H[i * n + n] = -r / w;
                }
                else {
                  H[i * n + n] = -r / (eps * norm);
                }

                // Solve real equations

              }
              else {
                x = H[i * n + i + 1];
                y = H[(i + 1) * n + i];
                q = (d[i] - p) * (d[i] - p) + e[i] * e[i];
                t = (x * s - z * r) / q;
                H[i * n + n] = t;
                if ( Math.abs( x ) > Math.abs( z ) ) {
                  H[(i + 1) * n + n] = (-r - w * t) / x;
                }
                else {
                  H[(i + 1) * n + n] = (-s - y * t) / z;
                }
              }

              // Overflow control

              t = Math.abs( H[i * n + n] );
              if ( (eps * t) * t > 1 ) {
                for ( j = i; j <= n; j++ ) {
                  H[j * n + n] = H[j * n + n] / t;
                }
              }
            }
          }

          // Complex vector

        }
        else if ( q < 0 ) {
          l = n - 1;

          // Last vector component imaginary so matrix is triangular

          if ( Math.abs( H[n * n + n - 1] ) > Math.abs( H[(n - 1) * n + n] ) ) {
            H[(n - 1) * n + (n - 1)] = q / H[n * n + n - 1];
            H[(n - 1) * n + n] = -(H[n * n + n] - p) / H[n * n + n - 1];
          }
          else {
            this.cdiv( 0.0, -H[(n - 1) * n + n], H[(n - 1) * n + (n - 1)] - p, q );
            H[(n - 1) * n + (n - 1)] = this.cdivr;
            H[(n - 1) * n + n] = this.cdivi;
          }
          H[n * n + n - 1] = 0.0;
          H[n * n + n] = 1.0;
          for ( i = n - 2; i >= 0; i-- ) {
            var ra, sa, vr, vi;
            ra = 0.0;
            sa = 0.0;
            for ( j = l; j <= n; j++ ) {
              ra = ra + H[i * this.n + j] * H[j * n + n - 1];
              sa = sa + H[i * this.n + j] * H[j * n + n];
            }
            w = H[i * n + i] - p;

            if ( e[i] < 0.0 ) {
              z = w;
              r = ra;
              s = sa;
            }
            else {
              l = i;
              if ( e[i] === 0 ) {
                this.cdiv( -ra, -sa, w, q );
                H[i * n + n - 1] = this.cdivr;
                H[i * n + n] = this.cdivi;
              }
              else {

                // Solve complex equations

                x = H[i * n + i + 1];
                y = H[(i + 1) * n + i];
                vr = (d[i] - p) * (d[i] - p) + e[i] * e[i] - q * q;
                vi = (d[i] - p) * 2.0 * q;
                if ( vr === 0.0 && vi === 0.0 ) {
                  vr = eps * norm * (Math.abs( w ) + Math.abs( q ) +
                                     Math.abs( x ) + Math.abs( y ) + Math.abs( z ));
                }
                this.cdiv( x * r - z * ra + q * sa, x * s - z * sa - q * ra, vr, vi );
                H[i * n + n - 1] = this.cdivr;
                H[i * n + n] = this.cdivi;
                if ( Math.abs( x ) > (Math.abs( z ) + Math.abs( q )) ) {
                  H[(i + 1) * n + n - 1] = (-ra - w * H[i * n + n - 1] + q * H[i * n + n]) / x;
                  H[(i + 1) * n + n] = (-sa - w * H[i * n + n] - q * H[i * n + n - 1]) / x;
                }
                else {
                  this.cdiv( -r - y * H[i * n + n - 1], -s - y * H[i * n + n], z, q );
                  H[(i + 1) * n + n - 1] = this.cdivr;
                  H[(i + 1) * n + n] = this.cdivi;
                }
              }

              // Overflow control
              t = Math.max( Math.abs( H[i * n + n - 1] ), Math.abs( H[i * n + n] ) );
              if ( (eps * t) * t > 1 ) {
                for ( j = i; j <= n; j++ ) {
                  H[j * n + n - 1] = H[j * n + n - 1] / t;
                  H[j * n + n] = H[j * n + n] / t;
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
            V[i * this.n + j] = H[i * this.n + j];
          }
        }
      }

      // Back transformation to get eigenvectors of original matrix
      for ( j = nn - 1; j >= low; j-- ) {
        for ( i = low; i <= high; i++ ) {
          z = 0.0;
          for ( k = low; k <= Math.min( j, high ); k++ ) {
            z = z + V[i * n + k] * H[k * n + j];
          }
          V[i * this.n + j] = z;
        }
      }
    }
  };

  return EigenvalueDecomposition;
} );

// Copyright 2002-2014, University of Colorado Boulder

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
  dot.LinearFunction = function LinearFunction( a1, a2, b1, b2, clamp ) {

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
  };

  return dot.LinearFunction;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * LU decomposition, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/LUDecomposition',['require','DOT/dot'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var Float32Array = window.Float32Array || Array;

  // require( 'DOT/Matrix' ); // commented out so Require.js doesn't complain about the circular dependency

  dot.LUDecomposition = function LUDecomposition( matrix ) {
    var i, j, k;

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
      this.piv[i] = i;
    }
    this.pivsign = 1;
    var LUcolj = new Float32Array( m );

    // Outer loop.

    for ( j = 0; j < n; j++ ) {

      // Make a copy of the j-th column to localize references.
      for ( i = 0; i < m; i++ ) {
        LUcolj[i] = LU[matrix.index( i, j )];
      }

      // Apply previous transformations.

      for ( i = 0; i < m; i++ ) {
        // Most of the time is spent in the following dot product.
        var kmax = Math.min( i, j );
        var s = 0.0;
        for ( k = 0; k < kmax; k++ ) {
          var ik = matrix.index( i, k );
          s += LU[ik] * LUcolj[k];
        }

        LUcolj[i] -= s;
        LU[matrix.index( i, j )] = LUcolj[i];
      }

      // Find pivot and exchange if necessary.

      var p = j;
      for ( i = j + 1; i < m; i++ ) {
        if ( Math.abs( LUcolj[i] ) > Math.abs( LUcolj[p] ) ) {
          p = i;
        }
      }
      if ( p !== j ) {
        for ( k = 0; k < n; k++ ) {
          var pk = matrix.index( p, k );
          var jk = matrix.index( j, k );
          var t = LU[pk];
          LU[pk] = LU[jk];
          LU[jk] = t;
        }
        k = this.piv[p];
        this.piv[p] = this.piv[j];
        this.piv[j] = k;
        this.pivsign = -this.pivsign;
      }

      // Compute multipliers.

      if ( j < m && LU[this.matrix.index( j, j )] !== 0.0 ) {
        for ( i = j + 1; i < m; i++ ) {
          LU[matrix.index( i, j )] /= LU[matrix.index( j, j )];
        }
      }
    }
  };
  var LUDecomposition = dot.LUDecomposition;

  LUDecomposition.prototype = {
    constructor: LUDecomposition,

    isNonsingular: function() {
      for ( var j = 0; j < this.n; j++ ) {
        var index = this.matrix.index( j, j );
        if ( this.LU[index] === 0 ) {
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
            result.entries[result.index( i, j )] = this.LU[this.matrix.index( i, j )];
          }
          else if ( i === j ) {
            result.entries[result.index( i, j )] = 1.0;
          }
          else {
            result.entries[result.index( i, j )] = 0.0;
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
            result.entries[result.index( i, j )] = this.LU[this.matrix.index( i, j )];
          }
          else {
            result.entries[result.index( i, j )] = 0.0;
          }
        }
      }
      return result;
    },

    getPivot: function() {
      var p = new Uint32Array( this.m );
      for ( var i = 0; i < this.m; i++ ) {
        p[i] = this.piv[i];
      }
      return p;
    },

    getDoublePivot: function() {
      var vals = new Float32Array( this.m );
      for ( var i = 0; i < this.m; i++ ) {
        vals[i] = this.piv[i];
      }
      return vals;
    },

    det: function() {
      if ( this.m !== this.n ) {
        throw new Error( "Matrix must be square." );
      }
      var d = this.pivsign;
      for ( var j = 0; j < this.n; j++ ) {
        d *= this.LU[this.matrix.index( j, j )];
      }
      return d;
    },

    solve: function( matrix ) {
      var i, j, k;
      if ( matrix.getRowDimension() !== this.m ) {
        throw new Error( "Matrix row dimensions must agree." );
      }
      if ( !this.isNonsingular() ) {
        throw new Error( "Matrix is singular." );
      }

      // Copy right hand side with pivoting
      var nx = matrix.getColumnDimension();
      var Xmat = matrix.getArrayRowMatrix( this.piv, 0, nx - 1 );

      // Solve L*Y = B(piv,:)
      for ( k = 0; k < this.n; k++ ) {
        for ( i = k + 1; i < this.n; i++ ) {
          for ( j = 0; j < nx; j++ ) {
            Xmat.entries[Xmat.index( i, j )] -= Xmat.entries[Xmat.index( k, j )] * this.LU[this.matrix.index( i, k )];
          }
        }
      }

      // Solve U*X = Y;
      for ( k = this.n - 1; k >= 0; k-- ) {
        for ( j = 0; j < nx; j++ ) {
          Xmat.entries[Xmat.index( k, j )] /= this.LU[this.matrix.index( k, k )];
        }
        for ( i = 0; i < k; i++ ) {
          for ( j = 0; j < nx; j++ ) {
            Xmat.entries[Xmat.index( i, j )] -= Xmat.entries[Xmat.index( k, j )] * this.LU[this.matrix.index( i, k )];
          }
        }
      }
      return Xmat;
    }
  };

  return LUDecomposition;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Tests whether a reference is to an array.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/isArray',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  core.isArray = function isArray( array ) {
    // yes, this is actually how to do this. see http://stackoverflow.com/questions/4775722/javascript-check-if-object-is-array
    return Object.prototype.toString.call( array ) === '[object Array]';
  };

  return core.isArray;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * SVD decomposition, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/SingularValueDecomposition',['require','DOT/dot'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var Float32Array = window.Float32Array || Array;

  // require( 'DOT/Matrix' ); // commented out so Require.js doesn't complain about the circular dependency

  dot.SingularValueDecomposition = function SingularValueDecomposition( matrix ) {
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

    var i, j, k, t, f;
    var cs, sn;

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
        s[k] = 0;
        for ( i = k; i < m; i++ ) {
          s[k] = hypot( s[k], A[i * n + k] );
        }
        if ( s[k] !== 0.0 ) {
          if ( A[k * n + k] < 0.0 ) {
            s[k] = -s[k];
          }
          for ( i = k; i < m; i++ ) {
            A[i * n + k] /= s[k];
          }
          A[k * n + k] += 1.0;
        }
        s[k] = -s[k];
      }
      for ( j = k + 1; j < n; j++ ) {
        if ( (k < nct) && (s[k] !== 0.0) ) {

          // Apply the transformation.

          t = 0;
          for ( i = k; i < m; i++ ) {
            t += A[i * n + k] * A[i * n + j];
          }
          t = -t / A[k * n + k];
          for ( i = k; i < m; i++ ) {
            A[i * n + j] += t * A[i * n + k];
          }
        }

        // Place the k-th row of A into e for the
        // subsequent calculation of the row transformation.

        e[j] = A[k * n + j];
      }
      if ( wantu && (k < nct) ) {

        // Place the transformation in U for subsequent back
        // multiplication.

        for ( i = k; i < m; i++ ) {
          U[i * nu + k] = A[i * n + k];
        }
      }
      if ( k < nrt ) {

        // Compute the k-th row transformation and place the
        // k-th super-diagonal in e[k].
        // Compute 2-norm without under/overflow.
        e[k] = 0;
        for ( i = k + 1; i < n; i++ ) {
          e[k] = hypot( e[k], e[i] );
        }
        if ( e[k] !== 0.0 ) {
          if ( e[k + 1] < 0.0 ) {
            e[k] = -e[k];
          }
          for ( i = k + 1; i < n; i++ ) {
            e[i] /= e[k];
          }
          e[k + 1] += 1.0;
        }
        e[k] = -e[k];
        if ( (k + 1 < m) && (e[k] !== 0.0) ) {

          // Apply the transformation.

          for ( i = k + 1; i < m; i++ ) {
            work[i] = 0.0;
          }
          for ( j = k + 1; j < n; j++ ) {
            for ( i = k + 1; i < m; i++ ) {
              work[i] += e[j] * A[i * n + j];
            }
          }
          for ( j = k + 1; j < n; j++ ) {
            t = -e[j] / e[k + 1];
            for ( i = k + 1; i < m; i++ ) {
              A[i * n + j] += t * work[i];
            }
          }
        }
        if ( wantv ) {

          // Place the transformation in V for subsequent
          // back multiplication.

          for ( i = k + 1; i < n; i++ ) {
            V[i * n + k] = e[i];
          }
        }
      }
    }

    // Set up the final bidiagonal matrix or order p.

    var p = min( n, m + 1 );
    if ( nct < n ) {
      s[nct] = A[nct * n + nct];
    }
    if ( m < p ) {
      s[p - 1] = 0.0;
    }
    if ( nrt + 1 < p ) {
      e[nrt] = A[nrt * n + p - 1];
    }
    e[p - 1] = 0.0;

    // If required, generate U.

    if ( wantu ) {
      for ( j = nct; j < nu; j++ ) {
        for ( i = 0; i < m; i++ ) {
          U[i * nu + j] = 0.0;
        }
        U[j * nu + j] = 1.0;
      }
      for ( k = nct - 1; k >= 0; k-- ) {
        if ( s[k] !== 0.0 ) {
          for ( j = k + 1; j < nu; j++ ) {
            t = 0;
            for ( i = k; i < m; i++ ) {
              t += U[i * nu + k] * U[i * nu + j];
            }
            t = -t / U[k * nu + k];
            for ( i = k; i < m; i++ ) {
              U[i * nu + j] += t * U[i * nu + k];
            }
          }
          for ( i = k; i < m; i++ ) {
            U[i * nu + k] = -U[i * nu + k];
          }
          U[k * nu + k] = 1.0 + U[k * nu + k];
          for ( i = 0; i < k - 1; i++ ) {
            U[i * nu + k] = 0.0;
          }
        }
        else {
          for ( i = 0; i < m; i++ ) {
            U[i * nu + k] = 0.0;
          }
          U[k * nu + k] = 1.0;
        }
      }
    }

    // If required, generate V.

    if ( wantv ) {
      for ( k = n - 1; k >= 0; k-- ) {
        if ( (k < nrt) && (e[k] !== 0.0) ) {
          for ( j = k + 1; j < nu; j++ ) {
            t = 0;
            for ( i = k + 1; i < n; i++ ) {
              t += V[i * n + k] * V[i * n + j];
            }
            t = -t / V[(k + 1) * n + k];
            for ( i = k + 1; i < n; i++ ) {
              V[i * n + j] += t * V[i * n + k];
            }
          }
        }
        for ( i = 0; i < n; i++ ) {
          V[i * n + k] = 0.0;
        }
        V[k * n + k] = 1.0;
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
        if ( abs( e[k] ) <=
             tiny + eps * (abs( s[k] ) + abs( s[k + 1] )) ) {
          e[k] = 0.0;
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
          t = (ks !== p ? abs( e[ks] ) : 0) +
              (ks !== k + 1 ? abs( e[ks - 1] ) : 0);
          if ( abs( s[ks] ) <= tiny + eps * t ) {
            s[ks] = 0.0;
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
          f = e[p - 2];
          e[p - 2] = 0.0;
          for ( j = p - 2; j >= k; j-- ) {
            t = hypot( s[j], f );
            cs = s[j] / t;
            sn = f / t;
            s[j] = t;
            if ( j !== k ) {
              f = -sn * e[j - 1];
              e[j - 1] = cs * e[j - 1];
            }
            if ( wantv ) {
              for ( i = 0; i < n; i++ ) {
                t = cs * V[i * n + j] + sn * V[i * n + p - 1];
                V[i * n + p - 1] = -sn * V[i * n + j] + cs * V[i * n + p - 1];
                V[i * n + j] = t;
              }
            }
          }
        }
          break;

        // Split at negligible s(k).

        case 2:
        {
          f = e[k - 1];
          e[k - 1] = 0.0;
          for ( j = k; j < p; j++ ) {
            t = hypot( s[j], f );
            cs = s[j] / t;
            sn = f / t;
            s[j] = t;
            f = -sn * e[j];
            e[j] = cs * e[j];
            if ( wantu ) {
              for ( i = 0; i < m; i++ ) {
                t = cs * U[i * nu + j] + sn * U[i * nu + k - 1];
                U[i * nu + k - 1] = -sn * U[i * nu + j] + cs * U[i * nu + k - 1];
                U[i * nu + j] = t;
              }
            }
          }
        }
          break;

        // Perform one qr step.

        case 3:
        {

          // Calculate the shift.

          var scale = max( max( max( max(
              abs( s[p - 1] ), abs( s[p - 2] ) ), abs( e[p - 2] ) ),
            abs( s[k] ) ), abs( e[k] ) );
          var sp = s[p - 1] / scale;
          var spm1 = s[p - 2] / scale;
          var epm1 = e[p - 2] / scale;
          var sk = s[k] / scale;
          var ek = e[k] / scale;
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
              e[j - 1] = t;
            }
            f = cs * s[j] + sn * e[j];
            e[j] = cs * e[j] - sn * s[j];
            g = sn * s[j + 1];
            s[j + 1] = cs * s[j + 1];
            if ( wantv ) {
              for ( i = 0; i < n; i++ ) {
                t = cs * V[i * n + j] + sn * V[i * n + j + 1];
                V[i * n + j + 1] = -sn * V[i * n + j] + cs * V[i * n + j + 1];
                V[i * n + j] = t;
              }
            }
            t = hypot( f, g );
            cs = f / t;
            sn = g / t;
            s[j] = t;
            f = cs * e[j] + sn * s[j + 1];
            s[j + 1] = -sn * e[j] + cs * s[j + 1];
            g = sn * e[j + 1];
            e[j + 1] = cs * e[j + 1];
            if ( wantu && (j < m - 1) ) {
              for ( i = 0; i < m; i++ ) {
                t = cs * U[i * nu + j] + sn * U[i * nu + j + 1];
                U[i * nu + j + 1] = -sn * U[i * nu + j] + cs * U[i * nu + j + 1];
                U[i * nu + j] = t;
              }
            }
          }
          e[p - 2] = f;
          iter = iter + 1;
        }
          break;

        // Convergence.

        case 4:
        {

          // Make the singular values positive.

          if ( s[k] <= 0.0 ) {
            s[k] = (s[k] < 0.0 ? -s[k] : 0.0);
            if ( wantv ) {
              for ( i = 0; i <= pp; i++ ) {
                V[i * n + k] = -V[i * n + k];
              }
            }
          }

          // Order the singular values.

          while ( k < pp ) {
            if ( s[k] >= s[k + 1] ) {
              break;
            }
            t = s[k];
            s[k] = s[k + 1];
            s[k + 1] = t;
            if ( wantv && (k < n - 1) ) {
              for ( i = 0; i < n; i++ ) {
                t = V[i * n + k + 1];
                V[i * n + k + 1] = V[i * n + k];
                V[i * n + k] = t;
              }
            }
            if ( wantu && (k < m - 1) ) {
              for ( i = 0; i < m; i++ ) {
                t = U[i * nu + k + 1];
                U[i * nu + k + 1] = U[i * nu + k];
                U[i * nu + k] = t;
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
  };
  var SingularValueDecomposition = dot.SingularValueDecomposition;

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
          result.entries[result.index( i, j )] = 0.0;
        }
        result.entries[result.index( i, i )] = this.s[i];
      }
      return result;
    },

    norm2: function() {
      return this.s[0];
    },

    cond: function() {
      return this.s[0] / this.s[Math.min( this.m, this.n ) - 1];
    },

    rank: function() {
      // changed to 23 from 52 (bits of mantissa), since we are using floats here!
      var eps = Math.pow( 2.0, -23.0 );
      var tol = Math.max( this.m, this.n ) * this.s[0] * eps;
      var r = 0;
      for ( var i = 0; i < this.s.length; i++ ) {
        if ( this.s[i] > tol ) {
          r++;
        }
      }
      return r;
    }
  };

  return SingularValueDecomposition;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * QR decomposition, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/QRDecomposition',['require','DOT/dot'],function( require ) {
  

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

    var i, j, k;

    // Main loop.
    for ( k = 0; k < n; k++ ) {
      // Compute 2-norm of k-th column without under/overflow.
      var nrm = 0;
      for ( i = k; i < m; i++ ) {
        nrm = dot.Matrix.hypot( nrm, QR[this.matrix.index( i, k )] );
      }

      if ( nrm !== 0.0 ) {
        // Form k-th Householder vector.
        if ( QR[this.matrix.index( k, k )] < 0 ) {
          nrm = -nrm;
        }
        for ( i = k; i < m; i++ ) {
          QR[this.matrix.index( i, k )] /= nrm;
        }
        QR[this.matrix.index( k, k )] += 1.0;

        // Apply transformation to remaining columns.
        for ( j = k + 1; j < n; j++ ) {
          var s = 0.0;
          for ( i = k; i < m; i++ ) {
            s += QR[this.matrix.index( i, k )] * QR[this.matrix.index( i, j )];
          }
          s = -s / QR[this.matrix.index( k, k )];
          for ( i = k; i < m; i++ ) {
            QR[this.matrix.index( i, j )] += s * QR[this.matrix.index( i, k )];
          }
        }
      }
      this.Rdiag[k] = -nrm;
    }
  };
  var QRDecomposition = dot.QRDecomposition;

  QRDecomposition.prototype = {
    constructor: QRDecomposition,

    isFullRank: function() {
      for ( var j = 0; j < this.n; j++ ) {
        if ( this.Rdiag[j] === 0 ) {
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
            result.entries[result.index( i, j )] = this.QR[this.matrix.index( i, j )];
          }
          else {
            result.entries[result.index( i, j )] = 0.0;
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
            result.entries[result.index( i, j )] = this.QR[this.matrix.index( i, j )];
          }
          else if ( i === j ) {
            result.entries[result.index( i, j )] = this.Rdiag[i];
          }
          else {
            result.entries[result.index( i, j )] = 0.0;
          }
        }
      }
      return result;
    },

    getQ: function() {
      var i, j, k;
      var result = new dot.Matrix( this.m, this.n );
      for ( k = this.n - 1; k >= 0; k-- ) {
        for ( i = 0; i < this.m; i++ ) {
          result.entries[result.index( i, k )] = 0.0;
        }
        result.entries[result.index( k, k )] = 1.0;
        for ( j = k; j < this.n; j++ ) {
          if ( this.QR[this.matrix.index( k, k )] !== 0 ) {
            var s = 0.0;
            for ( i = k; i < this.m; i++ ) {
              s += this.QR[this.matrix.index( i, k )] * result.entries[result.index( i, j )];
            }
            s = -s / this.QR[this.matrix.index( k, k )];
            for ( i = k; i < this.m; i++ ) {
              result.entries[result.index( i, j )] += s * this.QR[this.matrix.index( i, k )];
            }
          }
        }
      }
      return result;
    },

    solve: function( matrix ) {
      if ( matrix.getRowDimension() !== this.m ) {
        throw new Error( "Matrix row dimensions must agree." );
      }
      if ( !this.isFullRank() ) {
        throw new Error( "Matrix is rank deficient." );
      }

      var i, j, k;

      // Copy right hand side
      var nx = matrix.getColumnDimension();
      var X = matrix.getArrayCopy();

      // Compute Y = transpose(Q)*matrix
      for ( k = 0; k < this.n; k++ ) {
        for ( j = 0; j < nx; j++ ) {
          var s = 0.0;
          for ( i = k; i < this.m; i++ ) {
            s += this.QR[this.matrix.index( i, k )] * X[matrix.index( i, j )];
          }
          s = -s / this.QR[this.matrix.index( k, k )];
          for ( i = k; i < this.m; i++ ) {
            X[matrix.index( i, j )] += s * this.QR[this.matrix.index( i, k )];
          }
        }
      }

      // Solve R*X = Y;
      for ( k = this.n - 1; k >= 0; k-- ) {
        for ( j = 0; j < nx; j++ ) {
          X[matrix.index( k, j )] /= this.Rdiag[k];
        }
        for ( i = 0; i < k; i++ ) {
          for ( j = 0; j < nx; j++ ) {
            X[matrix.index( i, j )] -= X[matrix.index( k, j )] * this.QR[this.matrix.index( i, k )];
          }
        }
      }
      return new dot.Matrix( X, this.n, nx ).getMatrix( 0, this.n - 1, 0, nx - 1 );
    }
  };

  return QRDecomposition;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Arbitrary-dimensional matrix, based on Jama (http://math.nist.gov/javanumerics/jama/)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Matrix',['require','DOT/dot','PHET_CORE/isArray','DOT/SingularValueDecomposition','DOT/LUDecomposition','DOT/QRDecomposition','DOT/EigenvalueDecomposition','DOT/Vector2','DOT/Vector3','DOT/Vector4'],function( require ) {
  

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

  dot.Matrix = function Matrix( m, n, filler, fast ) {
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
          this.entries[i] = filler[i];
        }
      }
      else {
        for ( i = 0; i < size; i++ ) {
          this.entries[i] = filler;
        }
      }
    }
  };
  var Matrix = dot.Matrix;

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
        result.entries[i] = this.entries[i];
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
      return this.entries[this.index( i, j )];
    },

    set: function( i, j, s ) {
      this.entries[this.index( i, j )] = s;
    },

    getMatrix: function( i0, i1, j0, j1 ) {
      var result = new Matrix( i1 - i0 + 1, j1 - j0 + 1 );
      for ( var i = i0; i <= i1; i++ ) {
        for ( var j = j0; j <= j1; j++ ) {
          result.entries[result.index( i - i0, j - j0 )] = this.entries[this.index( i, j )];
        }
      }
      return result;
    },

    // getMatrix (int[] r, int j0, int j1)
    getArrayRowMatrix: function( r, j0, j1 ) {
      var result = new Matrix( r.length, j1 - j0 + 1 );
      for ( var i = 0; i < r.length; i++ ) {
        for ( var j = j0; j <= j1; j++ ) {
          result.entries[result.index( i, j - j0 )] = this.entries[this.index( r[i], j )];
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
          result.entries[result.index( j, i )] = this.entries[this.index( i, j )];
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
          result.entries[result.index( i, j )] = -this.entries[ this.index( i, j ) ];
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
          result.entries[index] = this.entries[index] + matrix.entries[index];
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
          this.entries[index] = this.entries[index] + matrix.entries[index];
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
          result.entries[index] = this.entries[index] - matrix.entries[index];
        }
      }
      return result;
    },

    minusEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[index] = this.entries[index] - matrix.entries[index];
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
          result.entries[index] = this.entries[index] * matrix.entries[index];
        }
      }
      return result;
    },

    arrayTimesEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[index] = this.entries[index] * matrix.entries[index];
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
          result.entries[index] = this.entries[index] / matrix.entries[index];
        }
      }
      return result;
    },

    arrayRightDivideEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[index] = this.entries[index] / matrix.entries[index];
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
          result.entries[index] = matrix.entries[index] / this.entries[index];
        }
      }
      return result;
    },

    arrayLeftDivideEquals: function( matrix ) {
      this.checkMatrixDimensions( matrix );
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[index] = matrix.entries[index] / this.entries[index];
        }
      }
      return this;
    },

    times: function( matrixOrScalar ) {
      var result;
      var i, j, k, s;
      var matrix;
      if ( matrixOrScalar.isMatrix ) {
        matrix = matrixOrScalar;
        if ( matrix.m !== this.n ) {
          throw new Error( "Matrix inner dimensions must agree." );
        }
        result = new Matrix( this.m, matrix.n );
        var matrixcolj = new Float32Array( this.n );
        for ( j = 0; j < matrix.n; j++ ) {
          for ( k = 0; k < this.n; k++ ) {
            matrixcolj[k] = matrix.entries[ matrix.index( k, j ) ];
          }
          for ( i = 0; i < this.m; i++ ) {
            s = 0;
            for ( k = 0; k < this.n; k++ ) {
              s += this.entries[this.index( i, k )] * matrixcolj[k];
            }
            result.entries[result.index( i, j )] = s;
          }
        }
        return result;
      }
      else {
        s = matrixOrScalar;
        result = new Matrix( this.m, this.n );
        for ( i = 0; i < this.m; i++ ) {
          for ( j = 0; j < this.n; j++ ) {
            result.entries[result.index( i, j )] = s * this.entries[this.index( i, j )];
          }
        }
        return result;
      }
    },

    timesEquals: function( s ) {
      for ( var i = 0; i < this.m; i++ ) {
        for ( var j = 0; j < this.n; j++ ) {
          var index = this.index( i, j );
          this.entries[index] = s * this.entries[index];
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
        throw new Error( "Matrix dimensions must agree." );
      }
    },

    toString: function() {
      var result = "";
      result += "dim: " + this.getRowDimension() + "x" + this.getColumnDimension() + "\n";
      for ( var row = 0; row < this.getRowDimension(); row++ ) {
        for ( var col = 0; col < this.getColumnDimension(); col++ ) {
          result += this.get( row, col ) + " ";
        }
        result += "\n";
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
        var vector = vectors[i];
        this.entries[i] = vector.x;
        this.entries[i + n] = vector.y;
        this.entries[i + 2 * n] = vector.z;
      }

      return this;
    },

    isMatrix: true
  };

  Matrix.identity = function( m, n ) {
    var result = new Matrix( m, n );
    for ( var i = 0; i < m; i++ ) {
      for ( var j = 0; j < n; j++ ) {
        result.entries[result.index( i, j )] = (i === j ? 1.0 : 0.0);
      }
    }
    return result;
  };

  Matrix.rowVector2 = function( vector ) {
    return new Matrix( 1, 2, [vector.x, vector.y] );
  };

  Matrix.rowVector3 = function( vector ) {
    return new Matrix( 1, 3, [vector.x, vector.y, vector.z] );
  };

  Matrix.rowVector4 = function( vector ) {
    return new Matrix( 1, 4, [vector.x, vector.y, vector.z, vector.w] );
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
      throw new Error( "undetected type of vector: " + vector.toString() );
    }
  };

  Matrix.columnVector2 = function( vector ) {
    return new Matrix( 2, 1, [vector.x, vector.y] );
  };

  Matrix.columnVector3 = function( vector ) {
    return new Matrix( 3, 1, [vector.x, vector.y, vector.z] );
  };

  Matrix.columnVector4 = function( vector ) {
    return new Matrix( 4, 1, [vector.x, vector.y, vector.z, vector.w] );
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
      throw new Error( "undetected type of vector: " + vector.toString() );
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
      var vector = vectors[i];
      data[i] = vector.x;
      data[i + n] = vector.y;
    }

    return new Matrix( dimension, n, data, true );
  };

  Matrix.fromVectors3 = function( vectors ) {
    var dimension = 3;
    var n = vectors.length;
    var data = new Float32Array( dimension * n );

    for ( var i = 0; i < n; i++ ) {
      var vector = vectors[i];
      data[i] = vector.x;
      data[i + n] = vector.y;
      data[i + 2 * n] = vector.z;
    }

    return new Matrix( dimension, n, data, true );
  };

  Matrix.fromVectors4 = function( vectors ) {
    var dimension = 4;
    var n = vectors.length;
    var data = new Float32Array( dimension * n );

    for ( var i = 0; i < n; i++ ) {
      var vector = vectors[i];
      data[i] = vector.x;
      data[i + n] = vector.y;
      data[i + 2 * n] = vector.z;
      data[i + 3 * n] = vector.w;
    }

    return new Matrix( dimension, n, data, true );
  };

  return Matrix;
} );

// Copyright 2002-2013, University of Colorado Boulder

define( 'AXON/axon',['require'],function( require ) {
  

  var axon = {};

  // will be filled in by other modules
  return axon;
} );

//  Copyright 2002-2014, University of Colorado Boulder

/**
 * A Multilink is an instance that can be used to link to multiple properties.  It is very similar to a DerivedProperty, but has no value and does not conform to the Property API,
 * because it is intended for use with callbacks that do not compute a value.  Multilink should not be created through calling its constructor directly,
 * but through the Property.multilink and Property.lazyMultilink functions.
 *
 * @author Sam Reid
 */
define( 'AXON/Multilink',['require','AXON/axon','PHET_CORE/inherit'],function( require ) {
  

  var axon = require( 'AXON/axon' );
  var inherit = require( 'PHET_CORE/inherit' );

  /**
   * @param {Property[]} dependencies
   * @param {function} callback function that expects args in the same order as dependencies
   * @param {boolean} lazy Optional parameter that can be set to true if this should be a lazy multilink (no immediate callback)
   * @constructor
   */
  axon.Multilink = function Multilink( dependencies, callback, lazy ) {
    this.dependencies = dependencies;

    //Keep track of each dependency and only update the changed value, for speed
    this.dependencyValues = dependencies.map( function( property ) {return property.get();} );

    var multilink = this;

    //Keep track of listeners so they can be detached
    this.dependencyListeners = [];

    //When a dependency value changes, update the list of dependencies and call back to the callback
    for ( var i = 0; i < dependencies.length; i++ ) {
      var dependency = dependencies[i];
      (function( dependency, i ) {
        var listener = function( newValue ) {
          multilink.dependencyValues[i] = newValue;
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
  };

  return inherit( Object, axon.Multilink, {

      /**
       * Detaches this derived property from its dependencies.
       */
      detach: function() {
        for ( var i = 0; i < this.dependencies.length; i++ ) {
          var dependency = this.dependencies[i];
          dependency.unlink( this.dependencyListeners[i] );
        }
      }
    }
  );
} );
// Copyright 2002-2013, University of Colorado Boulder

/**
 * An observable property, notifies registered observers when the value changes.
 *
 * Uses the 'Constructor' pattern for object creation, which has the downside that
 * all properties are created once for each instance. It would be nice if our functions
 * were shared. But since the only way to create private fields is in the constructor,
 * and the functions need access to those private fields, there doesn't seem to be
 * any choice but to define the functions in the constructor.
 *
 * @author Sam Reid
 * @author Chris Malley (PixelZoom, Inc.)
 */
define( 'AXON/Property',['require','AXON/axon','AXON/Multilink'],function( require ) {
  

  var axon = require( 'AXON/axon' );
  require( 'AXON/Multilink' );

  /**
   * @param {*} value
   * @constructor
   */
  axon.Property = function Property( value ) {

    //Store the internal value and the initial value
    this.storeValue( value );        // typically sets this._value
    this.storeInitialValue( value ); // typically sets this._initialValue
    this._observers = [];
  };

  axon.Property.prototype = {

    /**
     * Gets the value.  You can also use the es5 getter (property.value) but this means is provided for inner loops or internal code that must be fast.
     * @return {*}
     */
    get: function() {
      return this._value;
    },

    /**
     * Sets the value and notifies registered observers.  You can also use the es5 getter (property.value) but this means is provided for inner loops or internal code that must be fast.
     * If the value hasn't changed, this is a no-op.
     *
     * @param {*} value
     */
    set: function( value ) {
      if ( !this.equalsValue( value ) ) {
        this._setAndNotifyObservers( value );
      }
      return this;
    },

    // whether this property will not "change" when the passed-in value is set
    equalsValue: function( value ) {
      return value === this._value;
    },

    // store the current (new) value
    storeValue: function( value ) {
      this._value = value;
    },

    // store the initial value
    storeInitialValue: function( value ) {
      this._initialValue = value;
    },

    get initialValue() {
      return this._initialValue;
    },

    _setAndNotifyObservers: function( value ) {
      var oldValue = this.get();
      this.storeValue( value );
      this._notifyObservers( oldValue );
    },

    _notifyObservers: function( oldValue ) {
      var value = this.get();
      // TODO: JO: avoid slice() by storing observers array correctly
      var observersCopy = this._observers.slice(); // make a copy, in case notification results in removeObserver
      for ( var i = 0; i < observersCopy.length; i++ ) {
        observersCopy[i]( value, oldValue );
      }
    },

    //Use this method when mutating a value (not replacing with a new instance) and you want to send notifications about the change.
    //This is different from the normal axon strategy, but may be necessary to prevent memory allocations.
    //This method is unsafe for removing observers because it assumes the observer list not modified, to save another allocation
    //Only provides the new reference as a callback (no oldvalue)
    //See https://github.com/phetsims/axon/issues/6
    notifyObserversStatic: function() {
      var value = this.get();
      for ( var i = 0; i < this._observers.length; i++ ) {
        this._observers[i]( value );
      }
    },

    /**
     * Resets the value to the initial value.
     */
    reset: function() {
      this.set( this._initialValue );
    },

    /**
     * This function returns a bound function that sets the specified value.  For use in creating closures e.g. with gui classes.
     * For instance, to have a button that sets a property to true, instead of using
     * button.click(function(){property.set(true);});
     * you could use
     * button.click(property._set(true));
     * @param value the value to use when the setter is called.
     * @return a function that can be used to set the specified value.
     */
    _set: function( value ) {
      return this.set.bind( this, value );
    },

    get value() { return this.get(); },

    set value( newValue ) { this.set( newValue ); },

    /**
     * Adds an observer and notifies it immediately.
     * If observer is already registered, this is a no-op.
     * The initial notification provides the current value for newValue and null for oldValue.
     *
     * @param {function} observer a function of the form observer(newValue,oldValue)
     */
    link: function( observer ) {
      if ( this._observers.indexOf( observer ) === -1 ) {
        this._observers.push( observer );
        observer( this.get(), null ); // null should be used when an object is expected but unavailable
      }
    },

    /**
     * Removes an observer.
     * If observer is not registered, this is a no-op.
     *
     * @param {function} observer
     */
    unlink: function( observer ) {
      var index = this._observers.indexOf( observer );
      if ( index !== -1 ) {
        this._observers.splice( index, 1 );
      }
    },

    /**
     * Add an observer to the Property, without calling it back right away.  This is used when you need to register a listener without an immediate callback.
     * @param {function} observer  a function with a single argument, which is the value of the property at the time the function is called.
     */
    lazyLink: function( observer ) {
      if ( this._observers.indexOf( observer ) === -1 ) {
        this._observers.push( observer );
      }
    },

    //Provide toString for console debugging, see http://stackoverflow.com/questions/2485632/valueof-vs-tostring-in-javascript
    toString: function() {return 'Property{' + this.get() + '}'; },
    valueOf: function() {return this.toString();},

    /**
     * Add a listener so that it will only fire once (and not on registration)
     *
     * I can see two ways to implement this:
     * (a) add a field to the observer so after notifications it can be checked and possibly removed. Disadvantage: will make everything slower even if not using 'once'
     * (b) wrap the observer in a new function which will call the observer and then remove itself.  Disadvantage: cannot remove an observer added using 'once'
     * To avoid possible performance problems, use a wrapper function, and return it as a handle in case the 'once' listener must be removed before it is called once
     *
     * @param observer the listener which should be called back only for one property change (and not on registration)
     * @returns {function} the wrapper handle in case the wrapped function needs to be removed with 'unlink' before it is called once
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
     * Links an object's named attribute to this property.  Returns a handle so it can be removed using Property.unlink();
     * Example: modelVisibleProperty.linkAttribute(view,'visible');
     *
     * @param object
     * @param attributeName
     */
    linkAttribute: function( object, attributeName ) {
      var handle = function( value ) {object[attributeName] = value;};
      this.link( handle );
      return handle;
    },

    /**
     * Returns a new DerivedProperty which is true/false based on whether the value matches (based on ===) the passed in argument.
     * @param value
     * @returns {axon.DerivedProperty}
     */
    valueEquals: function( value ) {
      return new axon.DerivedProperty( [this], function( propertyValue ) { return propertyValue === value; } );
    },

    /**
     * Returns a new boolean DerivedProperty which is true/false based on && operator.
     * @param otherProperty
     * @returns {DerivedProperty.<boolean>}
     */
    and: function( otherProperty ) {
      return new axon.DerivedProperty( [this, otherProperty], function( thisValue, otherValue ) { return thisValue && otherValue; } );
    },

    /**
     * Returns a new boolean DerivedProperty which is true/false based on || operator.
     * @param otherProperty
     * @returns {DerivedProperty.<boolean>}
     */
    or: function( otherProperty ) {
      return new axon.DerivedProperty( [this, otherProperty], function( thisValue, otherValue ) { return thisValue || otherValue; } );
    },

    /**
     * Multiply this property's value by a constant scalar number, and return the derived property.
     *
     * @param scalar
     * @returns {axon.DerivedProperty}
     */
    times: function( scalar ) {
      return new axon.DerivedProperty( [this], function( thisValue ) { return thisValue * scalar; } );
    },

    /**
     * Not property, which does not propagate changes to dependents.
     * @returns {DerivedProperty}
     */
    derivedNot: function() {
      return new axon.DerivedProperty( [this], function( thisValue ) { return !thisValue; } );
    },

    /**
     * Two way communication for not, so you can set the value and have it come back to the parent
     * Note that noting about the following code is specific to booleans, although this should probably be used mostly for booleans.
     * To unlink both listeners attached unlink a property created with not(), use detach()
     */
    not: function() {
      var parentProperty = this;
      var childProperty = new axon.Property( !this.value );

      var setParentToChild = function( value ) {childProperty.set( !value );};
      parentProperty.link( setParentToChild );

      var setChildToParent = function( value ) {parentProperty.set( !value );};
      childProperty.link( setChildToParent );

      childProperty.detach = function() {
        parentProperty.unlink( setParentToChild );
        childProperty.unlink( setChildToParent );
      };
      return childProperty;
    },

    /**
     * Convenience function for debugging a property values.  It prints the new value on registration and when changed.
     * @param name debug name to be printed on the console
     * @returns {function} the handle to the linked listener in case it needs to be removed later
     */
    debug: function( name ) {
      var listener = function( value ) { console.log( name, value ); };
      this.link( listener );
      return listener;
    },

    //Returns a new Property that maps its values using the specified lookup table.
    //If the parent property value does not appear as a key in the lookup table, the returned property value is undefined
    mapValues: function( values ) {
      return new axon.DerivedProperty( [this], function( thisValue ) { return values[thisValue];} );
    },

    //Returns a new Property that maps its values using the specified function
    //See https://github.com/phetsims/axon/issues/25
    map: function( f ) {
      return new axon.DerivedProperty( [this], function( thisValue ) {return f( thisValue );} );
    },

    /**
     * Returns a function that can be used to toggle the property (using !)
     * @returns {function}
     */
    get toggleFunction() {
      return this.toggle.bind( this );
    },

    /**
     * Modifies the value of this Property with the ! operator.  Works for booleans and non-booleans.
     */
    toggle: function() {
      this.value = !this.value;
    },

    /**
     * Adds a listener that is fired when the property takes the specified value.  If the property has the value already, the listener is called back
     * immediately.  A reference to the listener is returned so that it can be removed.
     *
     * @param value the value to match
     * @param the listener that is called when this Property
     */
    onValue: function( value, listener ) {
      var observer = function( v ) {
        if ( v === value ) {
          listener();
        }
      };
      this.link( observer );
      return observer;
    }
  };

  /**
   * Registers an observer with multiple properties, then notifies the observer immediately.
   * @param {Property[]} properties
   * @param {function} observer no params, returns nothing
   * @static
   */
  axon.Property.multilink = function( properties, observer ) {
    return new axon.Multilink( properties, observer, false );
  };

  axon.Property.lazyMultilink = function( properties, observer ) {
    return new axon.Multilink( properties, observer, true );
  };

  return axon.Property;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Observable version of the basic 2-dimensional bounding box (Bounds2)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/ObservableBounds2',['require','DOT/dot','PHET_CORE/inherit','PHET_CORE/extend','PHET_CORE/Poolable','AXON/Property','DOT/Bounds2'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var extend = require( 'PHET_CORE/extend' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Property = require( 'AXON/Property' );
  require( 'DOT/Bounds2' );

  dot.ObservableBounds2 = function ObservableBounds2( minX, minY, maxX, maxY ) {
    dot.Bounds2.call( this, minX, minY, maxX, maxY );

    this._oldValue = this.copy();
    Property.call( this, this );
  };
  var ObservableBounds2 = dot.ObservableBounds2;

  inherit( dot.Bounds2, ObservableBounds2, extend( {}, Property.prototype, {
    // returns this value directly
    get: function() {
      return this;
    },

    /*---------------------------------------------------------------------------*
    * Overriding the core mutable methods (any mutable operation should call one of these)
    *----------------------------------------------------------------------------*/
    setMinMax: function( minX, minY, maxX, maxY ) {
      if ( this.minX !== minX || this.minY !== minY || this.maxX !== maxX || this.maxY !== maxY ) {
        this._oldValue.minX = this.minX;
        this._oldValue.minY = this.minY;
        this._oldValue.maxX = this.maxX;
        this._oldValue.maxY = this.maxY;
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
        this._notifyObservers( this._oldValue );
      }
      return this;
    },
    setMinX: function( minX ) {
      if ( this.minX !== minX ) {
        this._oldValue.minX = this.minX;
        this.minX = minX;
        this._notifyObservers( this._oldValue );
      }
      return this;
    },
    setMinY: function( minY ) {
      if ( this.minY !== minY ) {
        this._oldValue.minY = this.minY;
        this.minY = minY;
        this._notifyObservers( this._oldValue );
      }
      return this;
    },
    setMaxX: function( maxX ) {
      if ( this.maxX !== maxX ) {
        this._oldValue.maxX = this.maxX;
        this.maxX = maxX;
        this._notifyObservers( this._oldValue );
      }
      return this;
    },
    setMaxY: function( maxY ) {
      if ( this.maxY !== maxY ) {
        this._oldValue.maxY = this.maxY;
        this.maxY = maxY;
        this._notifyObservers( this._oldValue );
      }
      return this;
    },
    set: dot.Bounds2.prototype.set,

    // override with vector equality instead of instance equality
    equalsValue: function( value ) {
      return this.equals( value );
    },

    // we are not storing a separate value field (_value), so we leave this blank
    storeValue: function( value ) {
    },

    // to prevent a user from modifying the passed in initial value, we store the x/y here
    storeInitialValue: function( value ) {
      this._initialMinX = value.minX;
      this._initialMinY = value.minY;
      this._initialMaxX = value.maxX;
      this._initialMaxY = value.maxY;
    },

    reset: function() {
      this.setMinMax( this._initialMinX, this._initialMinY, this._initialMaxX, this._initialMaxY );
    },

    toString: function() {
      return 'ObservableBounds2(' + this.minX + ', ' + this.minY + ', ' + this.maxX + ', ' + this.maxY + ')';
    }
  } ) );

  // experimental object pooling
  /* jshint -W064 */
  Poolable( ObservableBounds2, {
    defaultFactory: function() { return new ObservableBounds2(); },
    constructorDuplicateFactory: function( pool ) {
      return function( minX, minY, maxX, maxY ) {
        if ( pool.length ) {
          return pool.pop().setMinMax( minX, minY, maxX, maxY );
        }
        else {
          return new ObservableBounds2( minX, minY, maxX, maxY );
        }
      };
    }
  } );

  return ObservableBounds2;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Observable version of the basic 3-dimensional matrix (Matrix3)
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/ObservableMatrix3',['require','DOT/dot','PHET_CORE/inherit','PHET_CORE/extend','PHET_CORE/Poolable','AXON/Property','DOT/Matrix3'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var extend = require( 'PHET_CORE/extend' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Property = require( 'AXON/Property' );
  require( 'DOT/Matrix3' );

  dot.ObservableMatrix3 = function ObservableMatrix3( v00, v01, v02, v10, v11, v12, v20, v21, v22, type ) {
    dot.Matrix3.call( this, v00, v01, v02, v10, v11, v12, v20, v21, v22, type );

    this._oldValue = this.copy();
    this._skipChecks = false;
    Property.call( this, this );
  };
  var ObservableMatrix3 = dot.ObservableMatrix3;

  inherit( dot.Matrix3, ObservableMatrix3, extend( {}, Property.prototype, {
    // returns this value directly
    get: function() {
      return this;
    },

    /*---------------------------------------------------------------------------*
    * Overriding the core mutable methods (any mutable operation should call one of these)
    *----------------------------------------------------------------------------*/
    // every mutable method goes through rowMajor
    rowMajor: function( v00, v01, v02, v10, v11, v12, v20, v21, v22, type ) {
      var skip = this._skipChecks;
      var modified = skip ||
                     v00 !== this.entries[0] ||
                     v10 !== this.entries[1] ||
                     v20 !== this.entries[2] ||
                     v01 !== this.entries[3] ||
                     v11 !== this.entries[4] ||
                     v21 !== this.entries[5] ||
                     v02 !== this.entries[6] ||
                     v12 !== this.entries[7] ||
                     v22 !== this.entries[8] ||
                     type !== this.type;
      if ( modified ) {

        if ( !skip && this._oldValue ) {
          this._oldValue.entries[0] = this.entries[0];
          this._oldValue.entries[1] = this.entries[1];
          this._oldValue.entries[2] = this.entries[2];
          this._oldValue.entries[3] = this.entries[3];
          this._oldValue.entries[4] = this.entries[4];
          this._oldValue.entries[5] = this.entries[5];
          this._oldValue.entries[6] = this.entries[6];
          this._oldValue.entries[7] = this.entries[7];
          this._oldValue.entries[8] = this.entries[8];
          this._oldValue.type = this.type;
        }

        this.entries[0] = v00;
        this.entries[1] = v10;
        this.entries[2] = v20;
        this.entries[3] = v01;
        this.entries[4] = v11;
        this.entries[5] = v21;
        this.entries[6] = v02;
        this.entries[7] = v12;
        this.entries[8] = v22;

        // TODO: consider performance of the affine check here
        this.type = type === undefined ? ( ( v20 === 0 && v21 === 0 && v22 === 1 ) ? dot.Matrix3.Types.AFFINE : dot.Matrix3.Types.OTHER ) : type;

        // if this isn't initialization, fire off changes and update the old value
        if ( this._observers ) {
          this._notifyObservers( skip ? null : this._oldValue );
        }
      }

      return this;
    },

    // override set, since it is overridden by property
    set: dot.Matrix3.prototype.set,

    // override with vector equality instead of instance equality
    equalsValue: function( value ) {
      return this.equals( value );
    },

    // we are not storing a separate value field (_value), so we leave this blank
    storeValue: function( value ) {
    },

    // to prevent a user from modifying the passed in initial value, we store the x/y here
    storeInitialValue: function( value ) {
      this._initial00 = value.m00();
      this._initial01 = value.m01();
      this._initial02 = value.m02();
      this._initial10 = value.m10();
      this._initial11 = value.m11();
      this._initial12 = value.m12();
      this._initial20 = value.m20();
      this._initial21 = value.m21();
      this._initial22 = value.m22();
      this._initialType = value.type;
    },

    reset: function() {
      this.rowMajor(
        this._initial00, this._initial01, this._initial02,
        this._initial10, this._initial11, this._initial12,
        this._initial20, this._initial21, this._initial22,
        this._initialType );
    },

    toString: dot.Matrix3.prototype.toString
  } ) );

  // experimental object pooling
  /* jshint -W064 */
  Poolable( ObservableMatrix3, {
    defaultFactory: function() { return new ObservableMatrix3(); },
    constructorDuplicateFactory: function( pool ) {
      return function( v00, v01, v02, v10, v11, v12, v20, v21, v22, type ) {
        if ( pool.length ) {
          return pool.pop().rowMajor( v00, v01, v02, v10, v11, v12, v20, v21, v22, type );
        }
        else {
          return new ObservableMatrix3( v00, v01, v02, v10, v11, v12, v20, v21, v22, type );
        }
      };
    }
  } );

  return ObservableMatrix3;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Observable version of the basic 2-dimensional vector
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/ObservableVector2',['require','DOT/dot','PHET_CORE/inherit','PHET_CORE/extend','PHET_CORE/Poolable','AXON/Property','DOT/Vector2'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var inherit = require( 'PHET_CORE/inherit' );
  var extend = require( 'PHET_CORE/extend' );
  var Poolable = require( 'PHET_CORE/Poolable' );
  var Property = require( 'AXON/Property' );
  require( 'DOT/Vector2' );

  dot.ObservableVector2 = function ObservableVector2( x, y ) {
    dot.Vector2.call( this, x, y );

    this._oldValue = this.copy();
    Property.call( this, this );
  };
  var ObservableVector2 = dot.ObservableVector2;

  inherit( dot.Vector2, ObservableVector2, extend( {}, Property.prototype, {
    // returns this value directly
    get: function() {
      return this;
    },

    /*---------------------------------------------------------------------------*
    * Overriding the core mutable methods (any mutable operation should call one of these)
    *----------------------------------------------------------------------------*/
    setXY: function( x, y ) {
      if ( this.x !== x || this.y !== y ) {
        this._oldValue.x = this.x;
        this._oldValue.y = this.y;
        this.x = x;
        this.y = y;
        this._notifyObservers( this._oldValue );
      }
      return this;
    },
    setX: function( x ) {
      if ( this.x !== x ) {
        this._oldValue.x = this.x;
        this.x = x;
        this._notifyObservers( this._oldValue );
      }
      return this;
    },
    setY: function( y ) {
      if ( this.y !== y ) {
        this._oldValue.y = this.y;
        this.y = y;
        this._notifyObservers( this._oldValue );
      }
      return this;
    },
    set: dot.Vector2.prototype.set,

    // override with vector equality instead of instance equality
    equalsValue: function( value ) {
      return this.equals( value );
    },

    // we are not storing a separate value field (_value), so we leave this blank
    storeValue: function( value ) {
    },

    // to prevent a user from modifying the passed in initial value, we store the x/y here
    storeInitialValue: function( value ) {
      this._initialX = value.x;
      this._initialY = value.y;
    },

    reset: function() {
      this.setXY( this._initialX, this._initialY );
    },

    toString: function() {
      return 'ObservableVector2(' + this.x + ', ' + this.y + ')';
    }
  } ) );

  // experimental object pooling
  /* jshint -W064 */
  Poolable( ObservableVector2, {
    defaultFactory: function() { return new ObservableVector2(); },
    constructorDuplicateFactory: function( pool ) {
      return function( x, y ) {
        if ( pool.length ) {
          return pool.pop().setXY( x, y );
        }
        else {
          return new ObservableVector2( x, y );
        }
      };
    }
  } );

  return ObservableVector2;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * An immutable permutation that can permute an array
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Permutation',['require','DOT/dot','PHET_CORE/isArray','DOT/Util'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var isArray = require( 'PHET_CORE/isArray' );
  require( 'DOT/Util' ); // for rangeInclusive

  // Creates a permutation that will rearrange a list so that newList[i] = oldList[permutation[i]]
  var Permutation = dot.Permutation = function Permutation( indices ) {
    this.indices = indices;
  };

  // An identity permutation with a specific number of elements
  Permutation.identity = function( size ) {
    assert && assert( size >= 0 );
    var indices = new Array( size );
    for ( var i = 0; i < size; i++ ) {
      indices[i] = i;
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
      callback.call( undefined, prefix );
    }
    else {
      for ( var i = 0; i < array.length; i++ ) {
        var element = array[i];

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
          throw new Error( "Permutation length " + this.size() + " not equal to list length " + arrayOrInt.length );
        }

        // permute it as an array
        var result = new Array( arrayOrInt.length );
        for ( var i = 0; i < arrayOrInt.length; i++ ) {
          result[i] = arrayOrInt[ this.indices[i] ];
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
        newPermutation[this.indices[i]] = i;
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
          newPermutation[indices[i]] = oldIndices[integers[i]];
        }
        result.push( new Permutation( newPermutation ) );
      } );
      return result;
    },

    toString: function() {
      return "P[" + this.indices.join( ", " ) + "]";
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

// Copyright 2002-2014, University of Colorado Boulder

/**
 * A mathematical plane in 3 dimensions determined by a normal vector to the plane and the distance to the closest
 * point on the plane to the origin
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Plane3',['require','DOT/dot','DOT/Vector3'],function( require ) {
  

  var dot = require( 'DOT/dot' );
  var Vector3 = require( 'DOT/Vector3' );

  /*
   * @constructor
   * @param {Vector3} normal - A normal vector (perpendicular) to the plane
   * @param {number} distance - The signed distance to the plane from the origin, so that normal.times( distance )
   *                            will be a point on the plane.
   */
  dot.Plane3 = function Plane3( normal, distance ) {
    this.normal = normal;
    this.distance = distance;

    assert && assert( Math.abs( normal.magnitude() - 1 ) < 0.01 );

    phetAllocation && phetAllocation( 'Plane3' );
  };
  var Plane3 = dot.Plane3;

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

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Quaternion, see http://en.wikipedia.org/wiki/Quaternion
 *
 * TODO: convert from JME-style parameterization into classical mathematical description?
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Quaternion',['require','DOT/dot','PHET_CORE/Poolable','DOT/Vector3','DOT/Matrix3','DOT/Util'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  var Poolable = require( 'PHET_CORE/Poolable' );
  require( 'DOT/Vector3' );
  require( 'DOT/Matrix3' );
  require( 'DOT/Util' );

  dot.Quaternion = function Quaternion( x, y, z, w ) {
    this.setXYZW( x, y, z, w );

    phetAllocation && phetAllocation( 'Quaternion' );
  };
  var Quaternion = dot.Quaternion;

  Quaternion.prototype = {
    constructor: Quaternion,

    isQuaternion: true,

    setXYZW: function( x, y, z, w ) {
      this.x = x || 0;
      this.y = y || 0;
      this.z = z || 0;
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

  // experimental object pooling
  /* jshint -W064 */
  Poolable( Quaternion, {
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

// Copyright 2002-2014, University of Colorado Boulder

/**
 * 3-dimensional ray
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Ray3',['require','DOT/dot'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  dot.Ray3 = function Ray3( pos, dir ) {
    this.pos = pos;
    this.dir = dir;
  };
  var Ray3 = dot.Ray3;

  Ray3.prototype = {
    constructor: Ray3,

    shifted: function( distance ) {
      return new Ray3( this.pointAtDistance( distance ), this.dir );
    },

    pointAtDistance: function( distance ) {
      return this.pos.plus( this.dir.timesScalar( distance ) );
    },

    // @param {Plane3} plane
    distanceToPlane: function( plane ) {
      return ( plane.distance - this.pos.dot( plane.normal ) ) / this.dir.dot( plane.normal );
    },

    toString: function() {
      return this.pos.toString() + " => " + this.dir.toString();
    }
  };

  return Ray3;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * A 2D rectangle-shaped bounded area, with a convenience name and constructor. Totally functionally
 * equivalent to Bounds2, but with a different constructor.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Rectangle',['require','DOT/dot','PHET_CORE/inherit','DOT/Bounds2'],function( require ) {
  

  var dot = require( 'DOT/dot' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Bounds2 = require( 'DOT/Bounds2' );

  dot.Rectangle = function Rectangle( x, y, width, height ) {
    assert && assert( height !== undefined, 'Rectangle requires 4 parameters' );
    Bounds2.call( this, x, y, x + width, y + height );
  };
  var Rectangle = dot.Rectangle;

  inherit( Bounds2, Rectangle );

  return Rectangle;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * A sphere in 3 dimensions (NOT a 3-sphere).
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Sphere3',['require','DOT/dot'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  /*
   * @constructor
   * @param {Vector3} center - The center of the sphere
   * @param {number} radius - The radius of the sphere
   */
  dot.Sphere3 = function Sphere3( center, radius ) {
    this.center = center;
    this.radius = radius;

    assert && assert( radius >= 0 );

    phetAllocation && phetAllocation( 'Sphere3' );
  };
  var Sphere3 = dot.Sphere3;

  Sphere3.prototype = {
    constructor: Sphere3,

    /*
     * @param {Ray3} ray - The ray to intersect with the sphere
     * @param {number} epsilon - A small varing-point value to be used to handle intersections tangent to the sphere
     * @returns An intersection result { distance, hitPoint, normal, fromOutside }, or null if the sphere is behind the ray
     */
    intersect: function( ray, epsilon ) {
      var raydir = ray.dir;
      var pos = ray.pos;
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
      var raydir = ray.dir;
      var pos = ray.pos;
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

          return [resultB, resultA];
      }
      else {
          // two possible hits

          // close hit, we have out => in
          return [resultA, resultB];
      }
    }
  };

  return Sphere3;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Forward and inverse transforms with 4x4 matrices, allowing flexibility including affine and perspective transformations.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'DOT/Transform4',['require','DOT/dot','DOT/Matrix4','DOT/Vector3','DOT/Ray3'],function( require ) {
  

  var dot = require( 'DOT/dot' );

  require( 'DOT/Matrix4' );
  require( 'DOT/Vector3' );
  require( 'DOT/Ray3' );

  // takes a 4x4 matrix
  dot.Transform4 = function Transform4( matrix ) {
    // using immutable version for now. change it to the mutable identity copy if we need mutable operations on the matrices
    this.setMatrix( matrix === undefined ? dot.Matrix4.IDENTITY : matrix );
  };
  var Transform4 = dot.Transform4;

  Transform4.prototype = {
    constructor: Transform4,

    setMatrix: function( matrix ) {
      this.matrix = matrix;

      // compute these lazily
      this.inverse = null;
      this.matrixTransposed = null; // since WebGL won't allow transpose == true
      this.inverseTransposed = null;
    },

    getMatrix: function() {
      return this.matrix;
    },

    getInverse: function() {
      if ( this.inverse === null ) {
        this.inverse = this.matrix.inverted();
      }
      return this.inverse;
    },

    getMatrixTransposed: function() {
      if ( this.matrixTransposed === null ) {
        this.matrixTransposed = this.matrix.transposed();
      }
      return this.matrixTransposed;
    },

    getInverseTransposed: function() {
      if ( this.inverseTransposed === null ) {
        this.inverseTransposed = this.getInverse().transposed();
      }
      return this.inverseTransposed;
    },

    prepend: function( matrix ) {
      this.setMatrix( matrix.timesMatrix( this.matrix ) );
    },

    append: function( matrix ) {
      this.setMatrix( this.matrix.timesMatrix( matrix ) );
    },

    prependTransform: function( transform ) {
      this.prepend( transform.matrix );
    },

    appendTransform: function( transform ) {
      this.append( transform.matrix );
    },

    isIdentity: function() {
      return this.matrix.type === dot.Matrix4.Types.IDENTITY;
    },

    // applies the 2D affine transform part of the transformation
    applyToCanvasContext: function( context ) {
      context.setTransform( this.matrix.m00(), this.matrix.m10(), this.matrix.m01(), this.matrix.m11(), this.matrix.m03(), this.matrix.m13() );
    },

    /*---------------------------------------------------------------------------*
     * forward transforms (for Vector3 or scalar)
     *----------------------------------------------------------------------------*/

    // transform a position (includes translation)
    transformPosition3: function( vec3 ) {
      return this.matrix.timesVector3( vec3 );
    },

    // transform a vector (exclude translation)
    transformDelta3: function( vec3 ) {
      return this.matrix.timesRelativeVector3( vec3 );
    },

    // transform a normal vector (different than a normal vector)
    transformNormal3: function( vec3 ) {
      return this.getInverse().timesTransposeVector3( vec3 );
    },

    transformDeltaX: function( x ) {
      return this.transformDelta3( new dot.Vector3( x, 0, 0 ) ).x;
    },

    transformDeltaY: function( y ) {
      return this.transformDelta3( new dot.Vector3( 0, y, 0 ) ).y;
    },

    transformDeltaZ: function( z ) {
      return this.transformDelta3( new dot.Vector3( 0, 0, z ) ).z;
    },

    transformRay: function( ray ) {
      return new dot.Ray3(
        this.transformPosition3( ray.pos ),
        this.transformPosition3( ray.pos.plus( ray.dir ) ).minus( this.transformPosition3( ray.pos ) ) );
    },

    /*---------------------------------------------------------------------------*
     * inverse transforms (for Vector3 or scalar)
     *----------------------------------------------------------------------------*/

    inversePosition3: function( vec3 ) {
      return this.getInverse().timesVector3( vec3 );
    },

    inverseDelta3: function( vec3 ) {
      // inverse actually has the translation rolled into the other coefficients, so we have to make this longer
      return this.inversePosition3( vec3 ).minus( this.inversePosition3( dot.Vector3.ZERO ) );
    },

    inverseNormal3: function( vec3 ) {
      return this.matrix.timesTransposeVector3( vec3 );
    },

    inverseDeltaX: function( x ) {
      return this.inverseDelta3( new dot.Vector3( x, 0, 0 ) ).x;
    },

    inverseDeltaY: function( y ) {
      return this.inverseDelta3( new dot.Vector3( 0, y, 0 ) ).y;
    },

    inverseDeltaZ: function( z ) {
      return this.inverseDelta3( new dot.Vector3( 0, 0, z ) ).z;
    },

    inverseRay: function( ray ) {
      return new dot.Ray3(
        this.inversePosition3( ray.pos ),
        this.inversePosition3( ray.pos.plus( ray.dir ) ).minus( this.inversePosition3( ray.pos ) )
      );
    }
  };

  return Transform4;
} );

// Copyright 2002-2014, University of Colorado Boulder

define( 'DOT/main',[
  'DOT/dot',
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
  'DOT/ObservableBounds2',
  'DOT/ObservableMatrix3',
  'DOT/ObservableVector2',
  'DOT/Permutation',
  'DOT/Plane3',
  'DOT/QRDecomposition',
  'DOT/Quaternion',
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
  
  return dot;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Removes a single (the first) matching object from an Array.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/arrayRemove',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  /*
   * @param {Array} arr
   * @param {*} item - The item to remove from the array
   */
  core.arrayRemove = function arrayRemove( arr, item ) {
    assert && assert( arr instanceof Array, 'arrayRemove either takes an Array' );

    var index = _.indexOf( arr, item );
    assert && assert( index >= 0, 'item not found in Array' );

    arr.splice( index, 1 );
  };

  return core.arrayRemove;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * If given an Array, removes all of its elements and returns it. Otherwise, if given a falsy value
 * (null/undefined/etc.), it will create and return a fresh Array.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/cleanArray',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  core.cleanArray = function cleanArray( arr ) {
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
  };

  return core.cleanArray;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Creates an array of results from an iterator that takes a callback.
 *
 * For instance, if calling a function f( g ) will call g( 1 ), g( 2 ), and g( 3 ),
 * collect( function( callback ) { f( callback ); } );
 * will return [1,2,3].
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/collect',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  core.collect = function collect( iterate ) {
    assert && assert( typeof iterate === 'function' );
    var result = [];
    iterate( function( ob ) {
      result.push( ob );
    } );
    return result;
  };
  return core.collect;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Scans through potential properties on an object to detect prefixed forms, and returns the first match.
 *
 * E.g. currently:
 * core.detectPrefix( document.createElement( 'div' ).style, 'transform' ) === 'webkitTransform'
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/detectPrefix',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  // @returns the best String str where obj[str] !== undefined, or returns undefined if that is not available
  core.detectPrefix = function detectPrefix( obj, name ) {
    if ( obj[name] !== undefined ) { return name; }

    // prepare for camelCase
    name = name.charAt( 0 ).toUpperCase() + name.slice( 1 );

    // Chrome planning to not introduce prefixes in the future, hopefully we will be safe
    if ( obj['moz' + name] !== undefined ) { return 'moz' + name; }
    if ( obj['Moz' + name] !== undefined ) { return 'Moz' + name; } // some prefixes seem to have all-caps?
    if ( obj['webkit' + name] !== undefined ) { return 'webkit' + name; }
    if ( obj['ms' + name] !== undefined ) { return 'ms' + name; }
    if ( obj['o' + name] !== undefined ) { return 'o' + name; }
    return undefined;
  };

  return core.detectPrefix;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Scans through potential event properties on an object to detect prefixed forms, and returns the first match.
 *
 * E.g. currently:
 * core.detectPrefixEvent( document, 'fullscreenchange' ) === 'webkitfullscreenchange'
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/detectPrefixEvent',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  // @returns the best String str where obj['on'+str] !== undefined, or returns undefined if that is not available
  core.detectPrefixEvent = function detectPrefixEvent( obj, name, isEvent ) {
    if ( obj['on' + name] !== undefined ) { return name; }

    // Chrome planning to not introduce prefixes in the future, hopefully we will be safe
    if ( obj['on' + 'moz' + name] !== undefined ) { return 'moz' + name; }
    if ( obj['on' + 'Moz' + name] !== undefined ) { return 'Moz' + name; } // some prefixes seem to have all-caps?
    if ( obj['on' + 'webkit' + name] !== undefined ) { return 'webkit' + name; }
    if ( obj['on' + 'ms' + name] !== undefined ) { return 'ms' + name; }
    if ( obj['on' + 'o' + name] !== undefined ) { return 'o' + name; }
    return undefined;
  };

  return core.detectPrefixEvent;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Escaping of HTML content that will be placed in the body, inside an element as a node.
 *
 * This is NOT for escaping something in other HTML contexts, for example as an attribute value
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
define( 'PHET_CORE/escapeHTML',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  core.escapeHTML = function escapeHTML( str ) {
    // see https://www.owasp.org/index.php/XSS_(Cross_Site_Scripting)_Prevention_Cheat_Sheet
    // HTML Entity Encoding
    return str
      .replace( /&/g, '&amp;' )
      .replace( /</g, '&lt;' )
      .replace( />/g, '&gt;' )
      .replace( /\"/g, '&quot;' )
      .replace( /\'/g, '&#x27;' )
      .replace( /\//g, '&#x2F;' );
  };
  return core.escapeHTML;
} );
// Copyright 2002-2014, University of Colorado Boulder

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
 * var timer = new core.EventTimer( new core.EventTimer.ConstantEventModel( 1 ), function( timeElapsed ) {
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

define( 'PHET_CORE/EventTimer',['require','PHET_CORE/core','PHET_CORE/inherit'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );
  var inherit = require( 'PHET_CORE/inherit' );

  /*
   * Create an event timer with a specific model (determines the time between events), and a callback to be called
   * for events.
   *
   * @param {Object with getPeriodBeforeNextEvent(): Number} eventModel: getPeriodBeforeNextEvent() will be called at
   *    the start and after every event to determine the time required to pass by before the next event occurs.
   * @param {function} eventCallback( timeElapsed ): Will be called for every event. The timeElapsed passed in as the
   *    only argument denotes the time elapsed since the event would have occurred. E.g. if we step for 5 seconds and
   *    our event would have occurred 1 second into that step, the timeElapsed will be 4 seconds, since after the end
   *    of the 5 seconds the event would have happened 4 seconds ago.
   */
  core.EventTimer = function EventTimer( eventModel, eventCallback ) {
    assert && assert( typeof eventCallback === 'function', 'EventTimer requires a callback' );

    this.eventModel = eventModel;
    this.eventCallback = eventCallback;

    this.timeBeforeNextEvent = this.eventModel.getPeriodBeforeNextEvent();
  };

  inherit( Object, core.EventTimer, {
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
   * @param {number} rate
   */
  core.EventTimer.ConstantEventModel = inherit( Object, function ConstantEventRate( rate ) {
    assert && assert( typeof rate === 'number',
      'The rate should be a number' );
    assert && assert( rate > 0,
      'We need to have a strictly positive rate in order to prevent infinite loops.' );

    this.rate = rate;
  }, {
    getPeriodBeforeNextEvent: function() {
      return 1 / this.rate;
    }
  } );

  /*
   * Event model that will fire events averaging a certain rate, but with the time between events being uniformly
   * random.
   * The pseudoRandomNumberSource, when called, should generate uniformly distributed random numbers in the range [0,1).
   * @param {number} rate
   * @param {function} pseudoRandomNumberSource() : Number
   */
  core.EventTimer.UniformEventModel = inherit( Object, function UniformEventModel( rate, pseudoRandomNumberSource ) {
    assert && assert( typeof rate === 'number',
      'The rate should be a number' );
    assert && assert( typeof pseudoRandomNumberSource === 'function',
      'The pseudo-random number source should be a function' );
    assert && assert( rate > 0,
      'We need to have a strictly positive rate in order to prevent infinite loops.' );

    this.rate = rate;
    this.pseudoRandomNumberSource = pseudoRandomNumberSource;
  }, {
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
   * @param {number} rate
   * @param {function} pseudoRandomNumberSource() : number
   */
  core.EventTimer.PoissonEventModel = inherit( Object, function PoissonEventModel( rate, pseudoRandomNumberSource ) {
    assert && assert( typeof rate === 'number',
      'The time between events should be a number' );
    assert && assert( typeof pseudoRandomNumberSource === 'function',
      'The pseudo-random number source should be a function' );
    assert && assert( rate > 0,
      'We need to have a strictly positive poisson rate in order to prevent infinite loops.' );

    this.rate = rate;
    this.pseudoRandomNumberSource = pseudoRandomNumberSource;
  }, {
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

  return core.EventTimer;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Loads a script
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/loadScript',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

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
  core.loadScript = function loadScript( args ) {
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
      if ( state && state !== "complete" && state !== "loaded" ) {
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

    var other = document.getElementsByTagName( 'script' )[0];
    other.parentNode.insertBefore( script, other );
  };

  return core.loadScript;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Creates an array of arrays, which consists of pairs of objects from the input array without duplication.
 *
 * For example, core.pairs( [ 'a', 'b', 'c' ] ) will return:
 * [ [ 'a', 'b' ], [ 'a', 'c' ], [ 'b', 'c' ] ]
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/pairs',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  core.pairs = function pairs( array ) {
    var result = [];
    var length = array.length;
    if ( length > 1 ) {
      for ( var i = 0; i < length - 1; i++ ) {
        var first = array[i];
        for ( var j = i + 1; j < length; j++ ) {
          result.push( [ first, array[j] ] );
        }
      }
    }
    return result;
  };
  return core.pairs;
} );

// Copyright 2002-2014, University of Colorado Boulder

/**
 * Partitions an array into two arrays: the first contains all elements that satisfy the predicate, and the second
 * contains all the (other) elements that do not satisfy the predicate.
 *
 * e.g. partition( [1,2,3,4], function( n ) { return n % 2 === 0; } ) will return [[2,4],[1,3]]
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

define( 'PHET_CORE/partition',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  core.partition = function partition( array, predicate ) {
    assert && assert( array instanceof Array );
    assert && assert( typeof predicate === 'function' );

    var satisfied = [];
    var unsatisfied = [];
    var length = array.length;
    for ( var i = 0; i < length; i++ ) {
      if ( predicate( array[i] ) ) {
        satisfied.push( array[i] );
      } else {
        unsatisfied.push( array[i] );
      }
    }

    return [satisfied, unsatisfied];
  };
  return core.partition;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Code for testing which platform is running.  Use sparingly, if at all!
 *
 * Sample usage:
 * if (platform.firefox) {node.renderer = 'canvas';}
 *
 * @author Sam Reid
 */
define( 'PHET_CORE/platform',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  var ua = navigator.userAgent;

  // taken from HomeScreen
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

  core.platform = {
    get firefox() { return ua.toLowerCase().indexOf( 'firefox' ) > -1; },

    //see http://stackoverflow.com/questions/3007480/determine-if-user-navigated-from-mobile-safari
    get mobileSafari() { return ua.match( /(iPod|iPhone|iPad)/ ) && ua.match( /AppleWebKit/ ); },
    get safari5() { return ua.match( /Version\/5\./ ) && ua.match( /Safari\// ) && ua.match( /AppleWebKit/ ); },
    get safari6() { return ua.match( /Version\/6\./ ) && ua.match( /Safari\// ) && ua.match( /AppleWebKit/ ); },
    get safari7() { return ua.match( /Version\/7\./ ) && ua.match( /Safari\// ) && ua.match( /AppleWebKit/ ); },

    get ie9() { return isIE( 9 ); },
    get ie10() { return isIE( 10 ); },
    get ie11() { return isIE( 11 ); },
    get ie() { return getInternetExplorerVersion() !== -1; },

    // from HomeScreen
    get android() { return ua.indexOf( 'Android' ) > 0; },

    get chromium() { return (/chrom(e|ium)/).test( ua.toLowerCase() ); }
  };

  return core.platform;
} );
// Copyright 2002-2014, University of Colorado Boulder

/**
 * Simple profiler which handles nested calls which provides a composite view, to help for micro-optimization.
 * Usage:
 * profiler.start('updateScene');
 * ...
 * profiler.start('moveObjects');
 * ...
 * profiler.stop();
 * ...
 * profiler.stop();
 * See testSelf() for a larger example. This could be used on ipad for instance.
 *
 * @author Sam Reid
 */
define( 'PHET_CORE/profiler',['require','PHET_CORE/core'],function( require ) {
  

  var core = require( 'PHET_CORE/core' );

  var stack = [];
  var results = {};
  var count = 0;
  var listeners = [];
  core.profiler = {
    displayCount: 1000,
    start: function( name ) {
      var time = Date.now();
      stack.push( {name: name, time: time} );
    },
    addListener: function( listener ) {
      listeners.push( listener );
    },
    stop: function() {
      var end = Date.now();
      var top = stack.pop();
      var elapsed = end - top.time;
      if ( !results[top.name] ) {
        results[top.name] = [];
      }
      //TODO: this may be a memory problem, consider coalescing (averaging or summing) values here
      results[top.name].push( elapsed );
      count++;
      if ( count % this.displayCount === 0 ) {
        var summary = JSON.stringify( this.toJSON() );

        console.log( summary );

        //Also notify listeners that a new result was obtained
        for ( var i = 0; i < listeners.length; i++ ) {
          listeners[i]( summary );
        }
        results = {};
      }
    },
    toJSON: function() {
      var summary = {};
      var sum;
      for ( var property in results ) {
        sum = 0;
        for ( var i = 0; i < results[property].length; i++ ) {
          var time = results[property][i];
          sum += time;
        }
        var average = sum / results[property].length;
        summary[property] = {average: average, count: results[property].length};
      }
      return summary;
    },

    //sanity test
    testSelf: function() {
      var a, b;
      var profiler = this;
      this.displayCount = 10000000;//Only show final result
      for ( var i = 0; i < 10; i++ ) {
        profiler.start( 'physics' );
        for ( var k = 0; k < 10000; k++ ) {
          profiler.start( 'mloop' );
          for ( var m = 0; m < 10000; m++ ) {
            a = 100 * 200;
          }
          profiler.stop();
          profiler.start( 'xloop' );
          for ( var x = 0; x < 20000; x++ ) {
            b = 100 * 200;
          }
          profiler.stop();
        }
        profiler.stop();
      }

      console.log( 'results: ', a, b );
      console.log( JSON.stringify( this.toJSON() ) );

      //sample correct output on chrome: {"mloop":{"average":0.01675,"count":100000},"xloop":{"average":0.03254,"count":100000},"physics":{"average":498.9,"count":10}}
    }
  };
//  profiler.testSelf();
  return core.profiler;
} );

// Copyright 2002-2014, University of Colorado Boulder

define( 'PHET_CORE/main',[
  'PHET_CORE/core',
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
  'PHET_CORE/Poolable',
  'PHET_CORE/profiler'
], function( core ) {
  
  return core;
} );

// Copyright 2002-2014, University of Colorado Boulder

window.loadedKiteConfig = true;

require.config( {
  deps: [ 'main', 'DOT/main', 'PHET_CORE/main' ],

  paths: {
    underscore: '../../sherpa/lodash-2.4.1',
    KITE: '.',
    DOT: '../../dot/js',
    PHET_CORE: '../../phet-core/js',
    AXON: '../../axon/js'
  },

  shim: {
    underscore: { exports: '_' }
  },

  urlArgs: new Date().getTime() // add cache buster query string to make browser refresh actually reload everything
} );

define("config", function(){});

 window.kite = require( 'main' ); window.dot = require( 'DOT/main' ); window.core = require( 'PHET_CORE/main' ); }());
