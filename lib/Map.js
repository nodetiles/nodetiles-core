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
    // this is a bit quick and dirty - we could possibly use style data
    // to figure out more detailed queries than just geographic bounds
    var shapes = [];
    for (var i = this.datasources.length - 1; i >= 0; i--) {
      shapes = shapes.concat(this.datasources[i](minX, minY, maxX, maxY, this.projection));
    };
    
    // TODO: send the shape and style data off to the renderer
    renderer.renderImage(minX, minY, maxX, maxY, width, height, shapes, function(error, canvas) {
      callback(error, canvas);
    });
  },
  
  addData: function(datasource) {
    // TODO: validate datasource?
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
    // may need to do some flattening, etc.
    // that that would make it harder to remove styles, though
    this.styles.push(style);
  }
};

module.exports = Map;
