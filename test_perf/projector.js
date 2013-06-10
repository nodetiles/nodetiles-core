#!/usr/bin/env node
var Benchmark = require('benchmark');
var projector = require("../lib/projector");
var projectorOld = require("../lib/projector.old");

var fileToProject = process.argv[2];
try {
    var data = require(fileToProject);
}
catch(error) {
    console.error("Could not load '" + fileToProject + "'");
    process.exit(1);
}

var suite = new Benchmark.Suite;
suite
  .add('FeatureCollection', function() {
    projector.project.FeatureCollection("EPSG:4326", "EPSG:900913", data);
  })
  .add('Feature', function() {
    for (var i = data.features.length - 1; i > -1; i--) {
      projector.project.Feature("EPSG:4326", "EPSG:900913", data.features[i]);
    }
  })
  .add('Old FeatureCollection', function() {
    projectorOld.project.FeatureCollection("EPSG:4326", "EPSG:900913", data);
  })
  .add('Old Feature', function() {
    for (var i = data.features.length - 1; i > -1; i--) {
      projectorOld.project.Feature("EPSG:4326", "EPSG:900913", data.features[i]);
    }
  })
  .on('cycle', function(event) {
    console.log(event.target.toString());
  })
  .run();
