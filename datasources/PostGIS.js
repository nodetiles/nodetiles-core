var pg = require("pg");
var projector = require("../projector");
/*
 * Something like this eventually? 
 * https://github.com/mapbox/tilemill/blob/master/models/Layer.bones#L60
 */
module.exports = function(connectionString, table, geom_field, projection, encoding) {
  encoding = encoding || "utf8";
  projection = projection || "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";
  // TODO better and more explicitly support projection autodetection, especially from PostGIS

  // loading synchronization
  var loadCallbacks = [];
  var loading = false;

  // stored state
  var loadError = null;
  var data = null;

  var source = function PostGISSource(minX, minY, maxX, maxY, mapProjection, callback) {
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
      console.log("Loading data in " + table + "...");

      loadPostGIS(connectionString, table, unique_field, geom_field,[minX, minY, maxX, maxY], projection, mapProjection, function(error, postgisData) {
        loadError = error;
        data = postgisData;

        console.log("Loaded in " + (Date.now() - start) + "ms");

        if (!error) {
          if (projection !== mapProjection) {
            console.log("Projecting features...");
            start = Date.now();

            projector.project.FeatureCollection(data, projection, mapProjection);

            console.log("Projected in " + (Date.now() - start) + "ms"); 
          }
          console.log("Projection not necessary")
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

var loadPostGIS = function(connectionString, table, geom_field, coords callback) {
  pg.connect(connectionString, function(err, client) {
    if (!err) {

      // need some way to check projection equivalency programmatically so we can use built-in postgis projection i.e.
      //
      // check proj4 support with: SELECT PostGIS_Full_Version();
      // i.e. POSTGIS="1.3.3" GEOS="3.1.0-CAPI-1.5.0" PROJ="Rel. 4.4.9, 29 Oct 2004" USE_STATS
      // 
      //
      // if (!projector.equals(projection,mapProjection){
      //    var query = SELECT ST_TRANSFORM(query, projection, mapProjecion)
      //

      // might need this as well: http://www.postgis.org/docs/ST_AsGeoJSON.html
      var query = "SELECT * FROM "+table+" WHERE "+table+"."+geom_field+" && ST_MakeEnvelope($1,$2,$3,$4);";

      client.query(query, [coords], function(err, result) {
        callback(err, result);
      });

    } else {
      callback(err, null);
    }
  });
}

