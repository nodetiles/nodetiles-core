var fs = require("fs");
var projector = require(__dirname + "/../lib/projector");

var FILTER_BY_EXTENTS = true;

var GeoJsonSource = function(options) {
  this._projection = projector.util.cleanProjString(options.projection || "EPSG:4326");
  this._path = options.path; // required
  this._encoding = options.encoding || "utf8";
  this.name = options.name || options.path.slice(options.path.lastIndexOf("/") + 1);
  if (this.name.indexOf(".") !== -1) {
    this.name = this.name.slice(0, this.name.indexOf("."));
  }
  this.sourceName = this.name;

  // loading synchronization
  this._loadCallbacks = [];
  this._loading = false;

  // stored state
  this._loadError = null;
  this._data = null;
  this._projectedData = {};

};

GeoJsonSource.prototype = {
  constructor: GeoJsonSource,

  getShapes: function(minX, minY, maxX, maxY, mapProjection, callback) {
    if (this._projectedData[mapProjection]){
      var data = this._filterByExtent(this._projectedData[mapProjection], minX, minY, maxX, maxY);
      callback(null, data);
    }
    else {
      this.load(function(error, data) {
        if (error){
          this._loadError = error;
        }
        else if (!this._projectedData[mapProjection]) {
          this._project(mapProjection);
        }
        
        var data = this._filterByExtent(this._projectedData[mapProjection], minX, minY, maxX, maxY);
        callback(this._loadError, data);
      }.bind(this));
    }
  },

  load: function(callback) {
    if (this._data || this._loadError) {
      callback(this._loadError, this._data);
      return;
    }
    
    callback && this._loadCallbacks.push(callback);
    
    if (!this._loading) {
      this._loading = true;

      var start = Date.now();
      console.log("Loading data in " + this._path + "...");

      fs.readFile(this._path, this._encoding, function(error, content) {
        if (error) {
          this._loadError = error;
        }
        else {
          try {
            this._data = JSON.parse(content);
            console.log("Loaded in " + (Date.now() - start) + "ms");
          }
          catch (ex) {
            this._loadError = ex;
            console.log("Failed to load in " + (Date.now() - start) + "ms");
          }
        }

        this._loading = false;

        var callbacks = this._loadCallbacks;
        this._loadCallbacks = [];
        callbacks.forEach(function(callback) {
          callback(this._loadError, this._data);
        }.bind(this));
      }.bind(this));
    }
  },
  
  project: function(destinationProjection) {
    this._project(destinationProjection);
  },

  _project: function(mapProjection) {
    var doBounds = !this._projectedData[mapProjection];
    
    if (this._projection !== mapProjection) {
      console.log("Projecting features...");
      start = Date.now();

      this._projectedData[mapProjection] = projector.project.FeatureCollection(this._projection, mapProjection, this._data);

      console.log("Projected in " + (Date.now() - start) + "ms"); 
    } else {
      console.log("Projection not necessary")
        this._projectedData[mapProjection] = this._data;
    }
    
    // HACK
    if (FILTER_BY_EXTENTS && doBounds) {
      this._calculateBounds(this._projectedData[mapProjection]);
    }
  },
  
  _calculateBounds: function(dataset) {
    return this._shapes(dataset).forEach(function(shape) {
      shape.bounds = this._shapeBounds(shape);
    }, this);
  },

  _filterByExtent: function(dataset, minX, minY, maxX, maxY) {
    if (!FILTER_BY_EXTENTS) {
      return dataset;
    }
    
    var extent = {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY
    };
    
    return this._shapes(dataset).filter(function(shape) {
      // return intersects(this._shapeBounds(shape), extent);
      return intersects(shape.bounds, extent);
    }.bind(this));
  },
  
  _shapeBounds: function(shape) {
    shape = shape.geometry || shape;
    var coordinates = shape.coordinates;
    
    if (shape.type === "Point") {
      return {
        minX: coordinates[0],
        maxX: coordinates[0],
        minY: coordinates[1],
        maxY: coordinates[1]
      };
    }
    
    var bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };
    
    if (shape.type === "Polygon" || shape.type === "MultiLineString") {
      for (var i = coordinates.length - 1; i >= 0; i--) {
        var coordinateSet = coordinates[i];
        for (var j = coordinateSet.length - 1; j >= 0; j--) {
          bounds.minX = Math.min(bounds.minX, coordinateSet[j][0]);
          bounds.maxX = Math.max(bounds.maxX, coordinateSet[j][0]);
          bounds.minY = Math.min(bounds.minY, coordinateSet[j][1]);
          bounds.maxY = Math.max(bounds.maxY, coordinateSet[j][1]);
        }
      }
    }
    else if (shape.type === "MultiPolygon") {
      for (var i = coordinates.length - 1; i >= 0; i--) {
        var coordinateSet = coordinates[i];
        for (var j = coordinateSet.length - 1; j >= 0; j--) {
          var coordinateSetSet = coordinateSet[j];
          for (var k = coordinateSetSet.length - 1; k >= 0; k--) {
            bounds.minX = Math.min(bounds.minX, coordinateSetSet[k][0]);
            bounds.maxX = Math.max(bounds.maxX, coordinateSetSet[k][0]);
            bounds.minY = Math.min(bounds.minY, coordinateSetSet[k][1]);
            bounds.maxY = Math.max(bounds.maxY, coordinateSetSet[k][1]);
          }
        }
      }
    }
    else {
      for (var i = coordinates.length - 1; i >= 0; i--) {
        bounds.minX = Math.min(bounds.minX, coordinates[i][0]);
        bounds.maxX = Math.max(bounds.maxX, coordinates[i][0]);
        bounds.minY = Math.min(bounds.minY, coordinates[i][1]);
        bounds.maxY = Math.max(bounds.maxY, coordinates[i][1]);
      }
    }
    
    return bounds;
  },
  
  _shapes: function(feature) {
    var shapes = [];
    if (feature.type === "FeatureCollection") {
      for (var i = feature.features.length - 1; i >= 0; i--) {
        shapes = shapes.concat(this._shapes(feature.features[i]));
      }
    }
    else if (feature.type === "Feature") {
      if (feature.geometry.type === "GeometryCollection") {
        shapes = shapes.concat(this._shapes(feature.geometry));
      }
      else {
        shapes.push(feature);
      }
    }
    else if (feature.type === "GeometryCollection") {
      for (var i = feature.geometries.length - 1; i >= 0; i--) {
        shapes = shapes.concat(this._shapes(feature.geometries[i]));
      }
    }
    else {
      shapes.push(feature);
    }
    
    return shapes;
  }
}

module.exports = GeoJsonSource;

var intersects = function(a, b) {
  var xIntersects = (a.minX < b.maxX && a.minX > b.minX) ||
                    (a.maxX < b.maxX && a.maxX > b.minX) ||
                    (a.minX < b.minX && a.maxX > b.maxX);
                    
  var yIntersects = (a.minY < b.maxY && a.minY > b.minY) ||
                    (a.maxY < b.maxY && a.maxY > b.minY) ||
                    (a.minY < b.minY && a.maxY > b.maxY);
                    
  return xIntersects && yIntersects;
};
