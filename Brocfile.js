/* jshint node: true */

var env             = process.env.EMBER_ENV;
var defeatureify    = require('broccoli-defeatureify');
var es3SafeRecast   = require('broccoli-es3-safe-recast');
var compileModules  = require('broccoli-es6-module-transpiler');
var funnel          = require('broccoli-funnel');
var jshint          = require('broccoli-jshint');
var merge           = require('broccoli-merge-trees');
var replace         = require('broccoli-replace');
var concat          = require('broccoli-sourcemap-concat');
var uglify          = require('broccoli-uglify-js');
var AMDFormatter    = require('es6-module-transpiler-amd-formatter');
var PackageResolver = require('es6-module-transpiler-package-resolver');
var version         = require('git-repo-version')();
var path            = require('path');

////////////////////////////////////////////////////////////////////////////////

var outputName = 'ember-data.model-fragments';

var packages = merge([
  packageTree('ember'),
  packageTree('ember-data'),
  packageTree('model-fragments')
]);

var main = mainTree(packages, outputName);
var tests = testTree(packages, outputName);

if (env === 'production') {
  var prod = prodTree(main, outputName);
  main = merge([ main, prod ], { overwrite: true });
}

module.exports = merge([ main, tests ]);

////////////////////////////////////////////////////////////////////////////////

function mainTree(packages, outputName) {
  var libFiles = packageSubdirTree(packages, 'lib');
  var compiled = compileModules(libFiles, {
    output: outputName + '.js',
    resolvers: [ PackageResolver ],
    formatter: 'bundle'
  });

  compiled = prependLicense(compiled, outputName + '.js');
  compiled = versionStamp(compiled);

  return compiled;
}

function testTree(packages, outputName) {
  var testFiles = packageSubdirTree(packages, 'tests');
  var compiled = compileModules(testFiles, {
    output: '/test-output',
    resolvers: [ PackageResolver ],
    formatter: new AMDFormatter(),
  });

  var allFiles = funnel(packages, {
    include: [ '**/*.{js,map}' ],
    destDir: '/jshint'
  });
  var hinted = hint(allFiles);

  return concat(merge([ compiled, hinted ]), {
    inputFiles: [ '**/*.js' ],
    outputFile: '/' + outputName + '-tests.js'
  });
}

function prodTree(main, outputName) {
  var es3Safe = es3SafeRecast(main);
  var stripped = defeatureify(es3Safe, {
    debugStatements: [
      "Ember.warn",
      "Ember.assert",
      "Ember.deprecate",
      "Ember.debug",
      "Ember.Logger.info",
      "Ember.runInDebug"
    ],
    enableStripDebug: true
  });

  var prod = moveFile(stripped, outputName + '.js', outputName + '.prod.js');
  prod = removeSourceMappingURL(prod);

  var uglified = uglify(prod, { mangle: true });
  uglified = moveFile(uglified, outputName + '.prod.js', outputName + '.min.js');

  return merge([ uglified, prod ], { overwrite: true });
}

function packageTree(packagePath, vendorPath) {
  return funnel(vendorPath || 'packages', {
    include: [ packagePath + '/**/*.js' ],
  });
}

function packageSubdirTree(tree, path) {
  return funnel(tree, {
    include: [ '**/*/' + path + '/**/*.{js,map}' ]
  });
}

function moveFile(tree, srcPath, destPath) {
  return funnel(tree, {
    getDestinationPath: function(relativePath) {
      return relativePath === srcPath ? destPath : relativePath;
    }
  });
}

function versionStamp(tree) {
  return replace(tree, {
    files: ['**/*'],
    patterns: [{
      match: /VERSION_STRING_PLACEHOLDER/g,
      replacement: version
    }]
  });
}

function prependLicense(tree, filePath) {
  var licenseTree = funnel('config', {
    files: [ 'license.js' ]
  });

  return concat(merge([ licenseTree, tree ]), {
    inputFiles: [ 'license.js', filePath ],
    outputFile: filePath
  });
}

function removeSourceMappingURL(tree) {
  return replace(tree, {
    files: [ '**/*' ],
    patterns: [{
      match: /\/\/(.*)sourceMappingURL=(.*)/g,
      replacement: ''
    }]
  });
}

function hint(tree) {
  var dirname = path.resolve(path.dirname());
  return jshint(tree, {
    jshintrcPath: path.join(dirname, '.jshintrc')
  });
}
