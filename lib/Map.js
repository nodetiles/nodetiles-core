var async = require("async");
var __ = require("lodash");
var renderer = require("./renderer");
var projector = require("./projector");
var cartoRenderer = require("./cartoRenderer");

var BUFFER_RATIO = 0.25;

/**
 * var map = new Map();
 * map.addData(function(minX, minY, maxX, maxY, projection) { ... });
 * map.setStyle(...);
 * map.render(0, 0, 180, 90, 500, 250);
 */

// default to EPSG:3857 (web mercator)
// http://spatialreference.org/ref/sr-org/7483/
var DEFAULT_PROJECTION = "EPSG:900913";//"+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";

var Map = function(options) {
  this.datasources = [];
  this.styles = [];
  this.projection = DEFAULT_PROJECTION;
  this.assetsPath = ".";

  if (options && options.projection){
    this.projection = projector.util.cleanProjString(options.projection);
    console.log(this.projection);
  }

  this._renderer = cartoRenderer;
};

Map.prototype = {
  constructor: Map,

  render: function(options) {
    var bounds = options.bounds;
    this._getData(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, function(error, shapes) {
      if (error) {
        options.callback(error);
      }
      else {
        this._renderer.renderImage(__.extend({}, options, {
          layers: shapes,
          styles: this.processedStyles,
          callback: function(error, canvas) {
            options.callback && options.callback(error, canvas);
          }
        }));
      }
    }.bind(this));
  },

  // Should this really be here, or should it exist on a different object entirely?
  renderGrid: function(options) {//minX, minY, maxX, maxY, width, height, asImage, callback) {
    var bounds = options.bounds;
    this._getData(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, function(error, shapes) {
      if (error) {
        callback(error);
        console.error("ERROR! "+error);
      }
      else {
        // this._renderer.renderGrid(minX, minY, maxX, maxY, width, height, shapes, this.processedStyles, asImage, callback);
        this._renderer.renderGrid(__.extend({}, options, {
          layers: shapes,
          styles: this.processedStyles,
          callback: function(error, canvas) {
            options.callback && options.callback(error, canvas);
          }
        }));
      }
    }.bind(this));
  },

  _getData: function(minX, minY, maxX, maxY, callback) {
    var buffer = (maxX - minX) * BUFFER_RATIO;

    // this is a bit quick and dirty - we could possibly use style data
    // to figure out more detailed queries than just geographic bounds
    var projection = this.projection;
    var self = this;
    async.map(
      this.datasources,
      function(datasource, dataCallback) {
        var sourceName = datasource.sourceName;
        var preCallback = function(error, data) {
          if (!error) {
            data.source = sourceName;
          }
          dataCallback(error, data);
        };

        if (typeof datasource !== "function") {
          datasource = datasource.getShapes.bind(datasource);
        }

        // allow simple sources to just return results immediately
        var syncData = datasource(minX - buffer, minY - buffer, maxX + buffer, maxY + buffer, projection, preCallback);
        if (syncData) {
          preCallback(null, syncData);
        }
      },
      callback
      // HACK: this is temporary until all the style machinery is done
      // should really be the above line
      // function(error, data) {
      //   if (!error) {
      //     data.forEach(function(collection, index) {
      //       collection.styles = [self.styles[index].properties];
      //     });
      //   }
      //   callback(error, data);
      // }
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
    this._processStyles();
  },

  setRenderer: function(renderer) {
    if (renderer.renderImage && renderer.renderGrid && renderer.processStyles) {
      this._renderer = renderer;
      this._processStyles();
    }
  },


  /**
   * Triggers all the map's datasources to prepare themselves. Usually this
   * connecting to a database, loading and processing a file, etc.
   * Calling this method is completely optional, but allows you to speed up
   * rendering of the first tile.
   */
  prepare: function() {
    var projection = this.projection;

    this.datasources.fEach(function(datasource) {
      datasource.load && datasource.load(function(error) {
        datasource.project && datasource.project(projection);
      });
    });
  },

  _processStyles: function() {
    this.processedStyles = this._renderer.processStyles(this.styles, this.assetsPath);
  }
};

module.exports = Map;
