// TODO this should support passing in projection strings in many formats, including preconstructed Proj4 objects 

var Proj4js = require('proj4js');
require('proj4js-defs')(Proj4js);
var __ = require('lodash');

var A = 6378137,
    MAXEXTENT = 20037508.34,
    ORIGIN_SHIFT = Math.PI * 6378137,
    D2R = Math.PI / 180,
    R2D = 180 / Math.PI; //20037508.342789244


//projection defs: we should add more here

// Credit for the math: http://www.maptiler.org/google-maps-coordinates-tile-bounds-projection/
// TODO: just use https://github.com/mapbox/node-sphericalmercator/blob/master/sphericalmercator.js
var util = {
  cleanProjString: function(text) {
    if (typeof text == "number") {
      return "EPSG:"+text;
    } else if (text.indexOf("EPSG:") > -1){
      return text;
    } else if (text.indexOf("+proj") > -1) {
      // proj4 string
      Proj4js.defs["NODETILES:9999"] = text;
      return "NODETILES:9999";
    } else {
      console.warn("Invalid projection string");
      return "EPSG:4326"
    }
  },
  pixelsToMeters: function(x, y, zoom, tileSize) {
    var mx, my;
    var tileSize = tileSize || 256;
    // meters per pixel at zoom 0
    var initialResolution = 2 * Math.PI * 6378137 / tileSize;
    //Resolution (meters/pixel) for given zoom level (measured at Equator)"
    var res = initialResolution / Math.pow(2,zoom);
    // return (2 * math.pi * 6378137) / (self.tileSize * 2**zoom)
    mx = x * res - ORIGIN_SHIFT;
    my = y * res - ORIGIN_SHIFT;
    return [mx, my];
  },

  // Thanks to https://github.com/mapbox/node-sphericalmercator/blob/master/sphericalmercator.js
  metersToLatLon: function(c) {
    return [
        (c[0] * R2D / A),
        ((Math.PI*0.5) - 2.0 * Math.atan(Math.exp(-c[1] / A))) * R2D
    ];
  },
  latLonToMeters: function(c) {
    var xy = [
        A * c[0] * D2R,
        A * Math.log(Math.tan((Math.PI*0.25) + (0.5 * c[1] * D2R)))
    ];
    // if xy value is beyond maxextent (e.g. poles), return maxextent.
    (xy[0] > MAXEXTENT) && (xy[0] = MAXEXTENT);
    (xy[0] < -MAXEXTENT) && (xy[0] = -MAXEXTENT);
    (xy[1] > MAXEXTENT) && (xy[1] = MAXEXTENT);
    (xy[1] < -MAXEXTENT) && (xy[1] = -MAXEXTENT);
    return xy;
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
    var from = new Proj4js.Proj(inProjection);
    var to = new Proj4js.Proj(outProjection);
    var _fc = __.clone(fc);
    //console.log(_fc.features[0].geometry.coordinates[0]);
    _fc.features = _fc.features.map(project.Feature.bind(null, from, to));
    //console.log(_fc.features[0].geometry.coordinates[0]);
    return _fc;
  },
  'Feature': function(inProjection, outProjection, f) {
    var _f = __.clone(f);
    _f.geometry = __.clone(f.geometry);
    _f.geometry.coordinates = project[f.geometry.type](inProjection, outProjection, _f.geometry.coordinates);
    return _f;
  },
  'MultiPolygon': function(inProjection, outProjection, mp) {
    return mp.map(project.Polygon.bind(null, inProjection, outProjection));
  },
  'Polygon': function(inProjection, outProjection, p) {
    return p.map(project.LineString.bind(null, inProjection, outProjection));
  },
  'MultiLineString': function(inProjection, outProjection, ml) {
    return ml.map(project.LineString.bind(null, inProjection, outProjection));
  },
  'LineString': function(inProjection, outProjection, l) {
    return l.map(project.Point.bind(null, inProjection, outProjection));
  },
  'MultiPoint': function(inProjection, outProjection, mp) {
    return mp.map(project.Point.bind(null, inProjection, outProjection));
  },
  'Point': function(inProjection, outProjection, c) {
    if (inProjection && outProjection) {
      var from, to;
      // TODO: only do this if typeof inProj or outProj is string. Or do it once earlier in the process.
      if (inProjection instanceof Proj4js.Proj){
        from = inProjection;
      } else {
        from = new Proj4js.Proj(inProjection);
      }

      if (outProjection instanceof Proj4js.Proj){
        to = outProjection;
      } else {
        to = new Proj4js.Proj(outProjection);
      }

      //while (!from.readyToUse || !to.readyToUse) {
      //  console.log("Projections not ready");
      //}

      if (inProjection.srsProjNumber == '4326' && outProjection.srsProjNumber == '900913'){
        return util.latLonToMeters(c);
      } else if (inProjection.srsProjNumber == '900913' && outProjection.srsProjNumber == '4326'){
        return util.metersToLatLon(c);
      } else {
        var point = new Proj4js.Point(c);
        Proj4js.transform(from, to, point);
        return [point.x, point.y];
      }
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
  var from = inProjection && new Proj4js.Proj(inProjection),
  to = outProjection && new Proj4js.Proj(outProjection);

  return project[featureType](null, null, feature);
  };
  });
  */
