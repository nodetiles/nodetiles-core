/**
 * var map = new Map();
 * map.addData(function(minX, minY, maxX, maxY, projection) { ... });
 * map.setStyle(...);
 * map.render(0, 0, 180, 90, 500, 250);
 */
 
// default to EPSG:3857 (web mercator)
var DEFAULT_PROJECTION = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs";

var Map = function(options) {
  this.datasources = [];
  this.styles = [];
  this.projection = DEFAULT_PROJECTION;
};

Map.prototype = {
  constructor: Map,
  
  render: function(minX, minY, maxX, maxY, width, height) {
    throw "Not Implemented";
  },
  
  addData: function(datasource) {
    throw "Not Implemented";
  },
  
  removeData: function(datasource) {
    throw "Not Implemented";
  },
  
  setProjection: function(projection) {
    throw "Not Implemented";
  },
  
  setStyle: function(style) {
    throw "Not Implemented";
  }
};