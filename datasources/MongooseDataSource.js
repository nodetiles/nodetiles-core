var mongoose = require('mongoose');
var projector = require(__dirname + "/../lib/projector");
var Response = require('./ResponseModel');

var FILTER_BY_EXTENTS = true;

var start;

var A = 6378137,
    MAXEXTENT = 20037508.34,
    ORIGIN_SHIFT = Math.PI * 6378137,
    D2R = Math.PI / 180,
    R2D = 180 / Math.PI; //20037508.342789244

/**
 * Turn stored parcel results into geoJSON
 * @param  {Array} items An array of responses
 * @return {Array}       An array of responses structured as geoJSON
 */
function resultsToGeoJSON(items, callback) {
  var i;
  var obj;
  var newItems = [];

  for (i = 0; i < items.length; i++) {
    obj = {};
    obj.type = 'Feature';

    // Get the shape
    // Or if there isn't one, use the centroid.
    if (items[i].geo_info.geometry !== undefined) {
      obj.id = items[i].parcel_id;
      obj.geometry = items[i].geo_info.geometry;
    }else {
      obj.id = items[i]._id;
      obj.geometry = {
        type: 'Point',
        coordinates: items[i].geo_info.centroid
      };
    }

    obj.properties = items[i];

    newItems.push(obj);
  }

  callback(newItems);
}

var MongooseDataSource = function(options) {
  // Set basic options: projection, data path, dataset name, and encoding
  this._projection = projector.util.cleanProjString(options.projection || "EPSG:4326");
  this._path = options.path; // required
  this._encoding = options.encoding || "utf8";
  this.name = options.name || options.path.slice(options.path.lastIndexOf("/") + 1);
  if (this.name.indexOf(".") !== -1) {
    this.name = this.name.slice(0, this.name.indexOf("."));
  }
  this.sourceName = this.name;

  this.surveyId = options.surveyId;

  // loading synchronization
  this._loadCallbacks = [];
  this._loading = false;

  // stored state
  this._loadError = null;
  this._data = null;
  this._projectedData = {};

  // Set up the mongoose database
  this.collection = options.collection;
  var mongooseOpts = {
    db: {
      w: 1,
      safe: true,
      native_parser: true // try true if things break?
    }
  };

  if (options.mongoUser !== undefined) {
    mongooseOpts.user = options.mongoUser;
    mongooseOpts.pass = options.mongoPassword;
  }

  mongoose.connect(options.mongoHost, options.mongoDB, options.mongoPort, mongooseOpts);

  this.db = mongoose.connection;
  this.db.on('error', function (error) {
    console.log('ERROR: ' + error.message);
  });
};

MongooseDataSource.prototype = {
  constructor: MongooseDataSource,

  _metersToLatLon: function(c) {
    return [
      (c[0] * R2D / A),
      ((Math.PI*0.5) - 2.0 * Math.atan(Math.exp(-c[1] / A))) * R2D
    ];
  },

  getShapes: function(minX, minY, maxX, maxY, mapProjection, callback) {
    var data;

    // Hacky! 
    minXY = this._metersToLatLon([minX, minY]);
    maxXY = this._metersToLatLon([maxX, maxY]);

    console.log("Getting shapes", minXY, maxXY);

    // Generate the bounds
    //var serializedBounds = minXY[0] + ',' + minXY[1] + ',' + maxXY[0] + ',' + maxXY[1];

    // Time the processes

    // Get the responses
    var conditions = {
      survey: this.surveyId
    };
    var parsedBbox = [[minXY[0], minXY[1]], [maxXY[0],  maxXY[1]]];
    conditions['geo_info.centroid'] = { '$within': { '$box': parsedBbox } };
    
    var serializedBounds = minXY[0] + ',' + minXY[1] + ',' + maxXY[0] + ',' + maxXY[1];
    var url = this._path + serializedBounds;
    // console.log("URL:", url);

    // console.log(conditions, parsedBbox);

    var query = Response.find(conditions);   
    query.select({'geo_info.geometry': 1});

    // console.log("Query set");

    // Execute the query
    start = Date.now();
    query.lean().exec(function (error, responses) {
      if (error) { console.log("DB error:", error); return; }
      

      console.log("Fetched responses in " + (Date.now() - start) + "ms");

      // console.log("Got", responses.length, "responses");

      start = Date.now();

      resultsToGeoJSON(responses, function(data) {
        this._data = {
          type: "FeatureCollection",
          features: data
        };

        start = Date.now();
        this._project(mapProjection);

        start = Date.now();
        callback(this._loadError, this._shapes(this._projectedData[mapProjection]));
      }.bind(this));
    }.bind(this));


    // Old stuff

    // request(url, function (error, response, body) {
    //   if (error || response.statusCode !== 200) {
    //     this._loadError = error;
    //   }
    //   else {
    //     try {
    //       this._data = JSON.parse(body);
    //       console.log("Loaded " + this._data.features.length + " features in " + (Date.now() - // start) + "ms");
    //       console.log(url);
    //     }
    //     catch (ex) {
    //       this._loadError = ex;
    //       console.log("Failed to load in " + (Date.now() - start) + "ms");
    //     }
    //   }
// 
    //   this._project(mapProjection);
    //   callback(this._loadError, this._shapes(this._projectedData[mapProjection]));
// 
    //   // this._loading = false;
// 
    //   // var callbacks = this._loadCallbacks;
    //   // this._loadCallbacks = [];
    //   // callbacks.forEach(function(callback) {
    //   //   callback(this._loadError, this._data);
    //   // }.bind(this));
    // }.bind(this));


    // Old stuff......

    // If there already is data at our desired projection:
    // if (this._projectedData[mapProjection]){
    // 
    //   // Filter the data to match the given bounds
    //   data = this._filterByExtent(this._projectedData[mapProjection], minX, minY, maxX, maxY);
    //   callback(null, data);
    // }
    // else {
    // 
    //   // If we don't already have data, load it
    //   this.load(function(error, data) {
    //     if (error){
    //       this._loadError = error;
    //     }
    //     else if (!this._projectedData[mapProjection]) {
    //       // TODO: why are we projecting?
    //       // Shouldn't the data already come projected?
    //       this._project(mapProjection);
    //     }
    // 
    //     // Filter the data by the given extent
    //     // TODO: instead, we should already have the data indexed by extent.
    //     // Or we can just request this square from the server.
    //     data = this._filterByExtent(this._projectedData[mapProjection], minX, minY, maxX, maxY);
    //     callback(this._loadError, data);
    //   }.bind(this));
    // }
  },

  load: function(callback) {
    // Load becomes a noop
    return;

    //if (this._data || this._loadError) {
    //  callback(this._loadError, this._data);
    //  return;
    //}

    // callback && this._loadCallbacks.push(callback);

    //if (!this._loading) {
    //  this._loading = true;
    //
    //  var start = Date.now();
    //  console.log("Loading data from " + this._path + "...");

    //  var request = require('request');
    //  request(this._path, function (error, response, body) {
    //    if (error || response.statusCode !== 200) {
    //      this._loadError = error;
    //    }
    //    else {
    //      try {
    //        this._data = JSON.parse(body);
    //        console.log("Loaded in " + (Date.now() - start) + "ms");
    //      }
    //      catch (ex) {
    //        this._loadError = ex;
    //        console.log("Failed to load in " + (Date.now() - start) + "ms");
    //      }
    //    }

    //    this._loading = false;

    //     var callbacks = this._loadCallbacks;
    //     this._loadCallbacks = [];
    //     callbacks.forEach(function(callback) {
    //       callback(this._loadError, this._data);
    //     }.bind(this));
    //   }.bind(this));
    // }
  },

  project: function(destinationProjection) {
    this._project(destinationProjection);
  },

  _project: function(mapProjection) {
    var doBounds = !this._projectedData[mapProjection];

    if (this._projection !== mapProjection) {
      console.log("Projecting", this._data.features.length, "features");
      start = Date.now();

      this._projectedData[mapProjection] = projector.project.FeatureCollection(this._projection, mapProjection, this._data);

      console.log("Projected in " + (Date.now() - start) + "ms");
    } else {
      console.log("Projection not necessary");
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
};

module.exports = MongooseDataSource;

var intersects = function(a, b) {
  var xIntersects = (a.minX < b.maxX && a.minX > b.minX) ||
                    (a.maxX < b.maxX && a.maxX > b.minX) ||
                    (a.minX < b.minX && a.maxX > b.maxX);
                    
  var yIntersects = (a.minY < b.maxY && a.minY > b.minY) ||
                    (a.maxY < b.maxY && a.maxY > b.minY) ||
                    (a.minY < b.minY && a.maxY > b.maxY);
                    
  return xIntersects && yIntersects;
};
