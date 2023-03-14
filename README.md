kite
=======

kite is a library for creating, manipulating and displaying 2D shapes in JavaScript.

By PhET Interactive Simulations
https://phet.colorado.edu/

Documentation, examples, and downloads are available at http://phetsims.github.io/kite/

### To check out and build the code

Our processes depend on [Node.js](http://nodejs.org/) and [Grunt](http://gruntjs.com/). It's highly recommended to install
Node.js and then grunt with `npm install -g grunt-cli`.

(1) Clone the simulation and its dependencies:
```
git clone https://github.com/phetsims/assert.git
git clone https://github.com/phetsims/axon.git
git clone https://github.com/phetsims/chipper.git
git clone https://github.com/phetsims/dot.git
git clone https://github.com/phetsims/kite.git
git clone https://github.com/phetsims/perennial.git perennial-alias
git clone https://github.com/phetsims/phet-core.git
git clone https://github.com/phetsims/sherpa.git
git clone https://github.com/phetsims/tandem.git
```

(2) Install dev dependencies:
```
cd chipper
npm install
cd ../perennial-alias
npm install
cd ../kite
npm install
```

(3) Build kite

Ensure you're in the kite directory and run `grunt --lint=false --report-media=false`. This will output files under the `build/` directory

### License

MIT license, see [LICENSE](LICENSE)

### Contributing
If you would like to contribute to this repo, please read our [contributing guidelines](https://github.com/phetsims/community/blob/master/CONTRIBUTING.md).
