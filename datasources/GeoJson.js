var fs = require("fs");
var projector = require("../projector");

module.exports = function(path, encoding) {
  encoding = encoding || "utf8";
  
  // loading synchronization
  var loadCallbacks = [];
  var loading = false;
  
  // stored state
  var loadError = null;
  var data = null;
  
  // TODO: project data properly
  var source = function GeoJsonSource(minX, minY, maxX, maxY, projection, callback) {
    if (!data && !loadError) {
      source.load(callback);
    }
    else {
      callback(loadError, data);
    }
  };
  source.load = function(callback) {
    callback && loadCallbacks.push(callback);
    if (!loading) {
      loading = true;
      
      var start = Date.now();
      console.log("Loading data in " + path + "...");
      
      loadJsonFile(path, encoding, function(error, jsonData) {
        loadError = error;
        data = jsonData;
        
        console.log("Loaded in " + (Date.now() - start) + "ms");
        
        if (!error) {
          console.log("Projecting features...");
          start = Date.now();
          
          projector.project.FeatureCollection(data);
          
          console.log("Projected in " + (Date.now() - start) + "ms");
        }
        
        loading = false;
        var callbacks = loadCallbacks;
        loadCallbacks = [];
        callbacks.forEach(function(callback) {
          callback(loadError, data);
        });
      });
    }
  };
  
  return source;
};

var loadJsonFile = function(path, encoding, callback) {
  fs.readFile(path, encoding, function(error, content) {
    var data;
    if (!error) {
      try {
        data = JSON.parse(content);
      }
      catch (ex) {
        error = ex;
      }
    }
    
    callback(error, data);
  });
};
