var async = require("async");
var renderer = require("./renderer");

/**
 * var map = new Map();
 * map.addData(function(minX, minY, maxX, maxY, projection) { ... });
 * map.setStyle(...);
 * map.render(0, 0, 180, 90, 500, 250);
 */
 
// default to EPSG:3857 (web mercator)
// http://spatialreference.org/ref/sr-org/7483/
var DEFAULT_PROJECTION = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";

var Map = function(options) {
  this.datasources = [];
  this.styles = [];
  this.projection = DEFAULT_PROJECTION;
};

Map.prototype = {
  constructor: Map,
  
  render: function(minX, minY, maxX, maxY, width, height, callback) {
    this._getData(minX, minY, maxX, maxY, function(error, shapes) {
      if (error) {
        callback(error);
      }
      else {
        renderer.renderImage(minX, minY, maxX, maxY, width, height, shapes, function(error, canvas) {
          callback(error, canvas);
        });
      }
    });
  },
  
  // Should this really be here, or should it exist on a different object entirely?
  renderGrid: function(minX, minY, maxX, maxY, width, height, asImage, callback) {
    this._getData(minX, minY, maxX, maxY, function(error, shapes) {
      if (error) {
        callback(error);
      }
      else {
        renderer.renderGrid(minX, minY, maxX, maxY, width, height, shapes, asImage, callback);
      }
    });
  },
  
  _getData: function(minX, minY, maxX, maxY, callback) {
    // this is a bit quick and dirty - we could possibly use style data
    // to figure out more detailed queries than just geographic bounds
    var projection = this.projection;
    var self = this;
    async.concat(
      this.datasources,
      function(datasource, dataCallback) {
        if (typeof datasource !== "function") {
          datasource = datasource.getShapes.bind(datasource);
        }
        
        // allow simple sources to just return results immediately
        var syncData = datasource(minX, minY, maxX, maxY, projection, dataCallback);
        if (syncData) {
          dataCallback(null, syncData);
        }
      },
      // callback
      // HACK: this is temporary until all the style machinery is done
      // should really be the above line
      function(error, data) {
        if (!error) {
          data.forEach(function(collection, index) {
            collection.styles = [self.styles[index].properties];
          });
        }
        callback(error, data);
      }
    );
  },
  
  addData: function(datasource) {
    // validate datasource
    if (!(typeof datasource === "function" || typeof datasource.getShapes === "function")) {
      console.warn("Datasource is not a function or an object with a 'getShapes()' function.");
      return false;
    }
    
    var index = this.datasources.indexOf(datasource);
    if (index === -1) {
      this.datasources.push(datasource);
      return true;
    }
    return false;
  },
  
  removeData: function(datasource) {
    var index = this.datasources.indexOf(datasource);
    if (index > -1) {
      this.datasources.splice(index, 1);
      return true;
    }
    return false;
  },
  
  setProjection: function(projection) {
    // TODO: validate this somehow?
    this.projection = projection;
  },
  
  addStyle: function(style) {
    // may need to do better flattening, etc.
    if (Object.prototype.toString.call(style) === "[object Array]") {
      this.styles = this.styles.concat(style);
    }
    else {
      this.styles.push(style);
    }
  }
};

module.exports = Map;
