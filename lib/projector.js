// TODO this should support passing in projection strings in many formats, including preconstructed Proj4 objects 

var Proj4 = require('proj4js');
var __ = require('lodash');

var originShift = 2 * Math.PI * 6378137 / 2.0; //20037508.342789244

// Credit for the math: http://www.maptiler.org/google-maps-coordinates-tile-bounds-projection/
var util = {
  pixelsToMeters: function(x, y, zoom, tileSize) {
    var mx, my;
    var tileSize = tileSize || 256;
    // meters per pixel at zoom 0
    var initialResolution = 2 * Math.PI * 6378137 / tileSize;
    //Resolution (meters/pixel) for given zoom level (measured at Equator)"
    var res = initialResolution / Math.pow(2,zoom);
    // return (2 * math.pi * 6378137) / (self.tileSize * 2**zoom)
    mx = x * res - originShift;
    my = y * res - originShift;
    return [mx, my];
  },
  metersToLatLon: function(x, y) {
    //Converts XY point from Spherical Mercator EPSG:900913 to lat/lon in WGS84 Datum"
    var lon, lat;
    lon = (x / originShift) * 180.0;
    lat = (y / originShift) * 180.0;
    lat = 180 / Math.pi * (2 * Math.atan( Math.exp( lat * Math.pi / 180.0)) - Math.pi / 2.0);
    return [lon, lat];
  },
  tileToMeters: function(x, y, zoom, tileSize){
    var tileSize = tileSize || 256;
    y = (Math.pow(2,zoom) - 1) - y; // TMS to Google tile scheme
    var min = util.pixelsToMeters(x*tileSize, y*tileSize, zoom);
    var max = util.pixelsToMeters((x+1)*tileSize, (y+1)*tileSize, zoom);
    return [min[0], min[1], max[0], max[1]];
  }
}
var project = {

  'FeatureCollection': function(inProjection, outProjection, fc) { 
    var from = new Proj4.Proj(inProjection);
    var to = new Proj4.Proj(outProjection);
    var _fc = __.clone(fc, true);
    console.log(_fc.features[0].geometry.coordinates[0]);
    _fc.features.forEach(project.Feature.bind(null, from, to));
    console.log(_fc.features[0].geometry.coordinates[0]);
    return _fc;
  },
  'Feature': function(inProjection, outProjection, f) { 
    project[f.geometry.type](inProjection, outProjection, f.geometry.coordinates); 
    return f;
  },
  'MultiPolygon': function(inProjection, outProjection, mp) { 
    mp.forEach(project.Polygon.bind(null, inProjection, outProjection)); 
    return mp;
  },
  'Polygon': function(inProjection, outProjection, p) { 
    p.forEach(project.LineString.bind(null, inProjection, outProjection));
    return p;
  },
  'MultiLineString': function(inProjection, outProjection, ml) {
    ml.forEach(project.LineString.bind(null, inProjection, outProjection)); 
    return ml;
  },
  'LineString': function(inProjection, outProjection, l) { 
    l.forEach(project.Point.bind(null, inProjection, outProjection)); 
    return l;
  },
  'MultiPoint': function(inProjection, outProjection, mp) { 
    mp.forEach(project.Point.bind(null, inProjection, outProjection)); 
    return mp;
  },
  'Point': function(inProjection, outProjection, c) {
    if (inProjection && outProjection) {
      var from, to;
      // TODO: only do this if typeof inProj or outProj is string. Or do it once earlier in the process.
      if (inProjection instanceof Proj4.Proj){
        from = inProjection;
      } else {
        from = new Proj4.Proj(inProjection);
      }

      if (outProjection instanceof Proj4.Proj){
        to = outProjection;
      } else {
        to = new Proj4.Proj(outProjection);
      }

      //while (!from.readyToUse || !to.readyToUse) {
      //  console.log("Projections not ready");
      //}

      var point = new Proj4.Point(c);
      Proj4.transform(from, to, point);
      c[0] = point.x;
      c[1] = point.y;
//    } else {
//      p[0] = 256.0 * (c[0] + 180) / 360.0;
//      p[1] = 256.0 - 256.0 * (Math.PI + Math.log(Math.tan(Math.PI/4+c[1]*(Math.PI/180)/2))) / (2*Math.PI);
    }
    return c;
  }
};

// TODO: cleanup interface
module.exports.util = util;
module.exports.project = project;


// {};
// this is sexy but doesn't work
/*Object.keys(project).forEach(function(featureType) {
  exports.project[featureType] = function(inProjection, outProjection, feature) {
  var from = inProjection && new Proj4.Proj(inProjection),
  to = outProjection && new Proj4.Proj(outProjection);

  return project[featureType](null, null, feature);
  };
  });
  */
