var fs = require("fs");
var projector = require("../projector");

var GeoJsonSource = function(options) {
  this._projection = options.projection;// || "EPSG:4326"; //"+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";
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
      callback(null, this._projectedData[mapProjection]);
    } else {
      this.load(function(error, data){
        if (!error){
            this._project(mapProjection);
        } else {
          this._loadError = error;
        }
        callback(this._loadError, this._projectedData[mapProjection])
      }.bind(this));
    }
  },

  load: function(callback) {
    callback && this._loadCallbacks.push(callback);

    if (!this._loading && !this._loadError && !this._data) { // only load once
      this._loading = true;

      var start = Date.now();
      console.log("Loading data in " + this._path + "...");

      fs.readFile(this._path, this._encoding, function(error, content) {
        if (!error) {
          try {
            this._data = JSON.parse(content);
            console.log("Loaded in " + (Date.now() - start) + "ms");
          }
          catch (ex) {
            this._loadError = ex;
          }
        }

        this._loading = false;

        var callbacks = this._loadCallbacks;
        callbacks.forEach(function(callback) {
          callback(this._loadError, this._data);
        }.bind(this));
        //callback(this._loadError, this._data);
      }.bind(this));
    } else {
      var callbacks = this._loadCallbacks;
      callbacks.forEach(function(callback) {
        callback(this._loadError, this._data);
      }.bind(this));
    }
  },

  _project: function(mapProjection) {
    if (this._projection !== mapProjection) {
      console.log("Projecting features...");
      start = Date.now();

      this._projectedData[mapProjection] = projector.project.FeatureCollection(this._projection, mapProjection, this._data);

      console.log("Projected in " + (Date.now() - start) + "ms"); 
    } else {
      console.log("Projection not necessary")
        this._projectedData[mapProjection] = this._data;
    }
  }

  // _filterByExtent: function(minX, minY, maxX, maxY)


}

module.exports = GeoJsonSource;
