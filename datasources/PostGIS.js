var pg        = require("pg"),
    projector = require("../projector"),
    __        = require("lodash");
/*
 * Something like this eventually? 
 * https://github.com/mapbox/tilemill/blob/master/models/Layer.bones#L60
 */

var PostGISSource = function(options) {
  this._projection = options.projection;
  this._projectionRaw = options.projection && options.projection.indexOf('EPSG')? options.projection.slice(options.projection.indexOf(':')+1):null; // for PostGIS < v1.5, if we want to support it
  this._connectionString = options.connectionString; // required
  this._tableName = options.tableName;               // required
  this._geomField = options.geomField;               // required
  this._attrFields = __.isArray(options.fields) ? 
                       options.fields.join(',') : 
                       options.fields; // array of attribute fields, or comma separated suggested for better performanace
  this.sourceName = options.name || options.tableName;
  
  // TODO: allow `pg` options to be easily set (e.g. max connections, etc.)
  // TODO: throw errors if required fields are missing


  console.log("Creating PostGIS source: "+this._connectionString+" "+this._tableName);
  return this;
}

PostGISSource.prototype = {
  constructor: PostGISSource,

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
    
    pg.connect(this._connectionString, __.bind(function(client, err) { // Switched method signature... WTF?!
      if (err) { console.error(err); return callback(err, null); }
      console.log("Loading features...");
      var start, query;
        
      start = Date.now();
      if (this._attrFields) {
        query = "SELECT ST_AsGeoJson("+this._geomField+") as geometry, "+this._attrFields+" FROM "+this._tableName+" WHERE "+this._geomField+" && ST_MakeEnvelope($1,$2,$3,$4);";
      }
      else {
        query = "SELECT ST_AsGeoJson("+this._geomField+") as geometry,* FROM "+this._tableName+" WHERE "+this._geomField+" && ST_MakeEnvelope($1,$2,$3,$4);";
      }
      console.log("Querying... "+query+" "+minX+", "+minY+", "+maxX+", "+maxY);
      client.query(query, [minX, minY, maxX, maxY], __.bind(function(err, result) {
        if (err) { return callback(err, null); }
        console.log("Loaded in " + (Date.now() - start) + "ms");
        
        var geoJson;

        if (result) {
          // Removed this._lastResult because it wasn't clear why it's being stored
          // Also, since we're processing blackbox data, we should probably catch any exceptions from processing it
          try {
            geoJson = this._toGeoJson(result.rows);
            geoJson = projector.project.FeatureCollection(this._projection, mapProjection, geoJson);
          }
          catch(err) {
            return callback(err, null);
          }
        }
        callback(err, geoJson);
      }, this));
    }, this));
  },

  _toGeoJson: function(rows){
    var obj, i;
    
    obj = {
      type: "FeatureCollection",
      features: []
    };
    
    for (i = 0; i < rows.length; i++) {
      var item, feature, geometry;
      item = rows[i];
      
      geometry = JSON.parse(item.geometry);
      delete item.geometry;
      
      feature = {
        type: "Feature",
        properties: item,
        geometry: geometry
      }
      
      obj.features.push(feature);
    } 
    return obj;
  }
}

module.exports = PostGISSource;
