// TODO this should support passing in projection strings in many formats, including preconstructed Proj4 objects 

var Proj4 = require('proj4js');
Proj4.defs["EPSG:3857"] = "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=6378137 +b=6378137 +units=m +no_defs";
Proj4.defs["EPSG:4326"] = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";

var project = {
  'FeatureCollection': function(inProjection, outProjection, fc) { 
    fc.features.forEach(project.Feature.bind(null, inProjection, outProjection));
    return fc;
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
      // TODO: only do this if typeof inProj or outProj is string. Or do it once earlier in the process.
      // var inProj = new Proj4.Proj(inProjection);
      // var outProj = new Proj4.Proj(outProjection);
      var point = new Proj4.Point(c);
      //console.log("original coordinate: "+c);
      Proj4.transform(inProj, outProj, point);
      c[0] = point.x;
      c[1] = point.y;
    } else {
      c[0] = 256.0 * (c[0] + 180) / 360.0;
      c[1] = 256.0 - 256.0 * (Math.PI + Math.log(Math.tan(Math.PI/4+c[1]*(Math.PI/180)/2))) / (2*Math.PI);
    }
    return c;
  }
};

module.exports.project = {};
Object.keys(project).forEach(function(featureType) {
  exports.project[featureType] = function(inProjection, outProjection, feature) {
    var from = inProjection && new Proj4.Proj(inProjection),
        to = outProjection && new Proj4.Proj(outProjection);
    
    return project[featureType](null, null, feature);
  };
});


// module.exports.project = project;
