var pg = require("pg");
var projector = require("../projector");
/*
 * Something like this eventually? 
 * https://github.com/mapbox/tilemill/blob/master/models/Layer.bones#L60
 */

var PostGISSource = function(options) {
  this._projection = options.projection;
  this._projectionRaw = options.projection && options.projection.indexOf('EPSG')? options.projection.slice(options.projection.indexOf(':')+1):null;
  this._connectionString = options.connectionString; //required
  this._tableName = options.tableName; // requried
  this._geomField = options.geomField; // required
  this._attrFields = typeof options.fields === "object" ? options.fields.join(',') : options.fields; // array of attribute fields, or comma separated suggested for better performanace

  this.name = options.name || options.tableName;
  this.sourceName = this.name; //not sure which we're using 

  this._loadCallbacks = [];
  this._loading = false;
  this._lastResult = null;

  //state
  this._client = null;
  this._connectError = null;
  this._connect();
}

PostGISSource.prototype = {
  constructor: PostGISSource,

  _connect: function() {
    console.log("Connecting to postGIS "+this._connectionString);
    if (this._connectionString){
      pg.connect(this._connectionString, function(error, client){
        if (!error) {
          console.log("Connected");
          this._client = client;
        } else {
          console.warn("Error connecting", error);
          this._connectError = error;
        }
      }.bind(this));
    } else {
      console.warn("No connection string provided");
      this._connectError = "No connection string provided";
    }
  },

  // need some way to check projection equivalency programmatically so we can use built-in postgis projection i.e.
  //
  // check proj4 support with: SELECT PostGIS_Full_Version();
  // i.e. POSTGIS="1.3.3" GEOS="3.1.0-CAPI-1.5.0" PROJ="Rel. 4.4.9, 29 Oct 2004" USE_STATS
  // 
  // if (!projector.equals(projection,mapProjection){
  //    var query = SELECT ST_TRANSFORM(query, projection, mapProjecion)

  getShapes: function(minX, minY, maxX, maxY, mapProjection, callback) {
    // we don't get real coordinates from Map.js yet so we'll fake it for now
    // minX = -122.4565;
    // minY = 37.756;
    // maxX = -122.451;
    // maxY = 37.761;

    minX = -122.5195;
    minY = 37.7062;
    maxX = -122.3812;
    maxY = 37.8036;
    
    callback && this._loadCallbacks.push(callback);
    
    if (!this._connectError && !this._client) {
      this._connect();
    }

    if (!this._loading && !this._connectError && this._client) {
      this._loading = true;
      console.log("Loading features...");
      start = Date.now();

      if (this._attrFields) {
        var query = "SELECT ST_AsGeoJson("+this._geomField+") as geometry, "+this._attrFields+" FROM "+this._tableName+" WHERE "+this._geomField+" && ST_MakeEnvelope($1,$2,$3,$4);";
      } else {
        // TODO: use dynamic sql here to not select geometry twice
        // TODO: build this query once
        var query = "SELECT ST_AsGeoJson("+this._geomField+") as geometry,* FROM "+this._tableName+" WHERE "+this._geomField+" && ST_MakeEnvelope($1,$2,$3,$4);";
      }

      console.log("Querying... "+query+" "+minX+", "+minY+", "+maxX+", "+maxY);
      this._client.query(query, [minX, minY, maxX, maxY], function(error, result) {
        this._loading = false;
        console.log("Loaded in " + (Date.now() - start) + "ms");

        if (result) {
          this._lastResult = this._toGeoJson(result.rows);
          this._lastResult = projector.project.FeatureCollection(this._projection, mapProjection, this._lastResult);
        }

        var callbacks = this._loadCallbacks;
        callbacks.forEach(function(callback) {
          callback(error, this._lastResult);
        }.bind(this));
      }.bind(this));

    } else {
      var callbacks = this._loadCallbacks;
      callbacks.forEach(function(callback) {
        callback(this._connectError);
      }.bind(this));
    }
  },

  _toGeoJson: function(rows){
    var obj={};
    obj.type = "FeatureCollection";
    obj.features = [];
    rows.forEach(function(item){
      var feature = {};
      feature.type = "Feature";
      feature.properties = {};
      feature.geometry = JSON.parse(item.geometry);
      delete item.geometry;
      for (var key in item) {
        feature.properties[key] = item[key];
      }
      obj.features.push(feature);
    });
    return obj;
  }
}

module.exports = PostGISSource;
