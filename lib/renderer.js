var Canvas = require('canvas');
var UTFGrid = require('./utfgrid');
var fs = require('fs');
var path = require('path');
var __ = require('lodash');

// FIXME: this *really* shouldn't be here
var bgColor = '#ddddff';

// Handles canvas and context management, then passes things off to an actual rendering routine
// TODO: support arbitrary canvas size (or at least @2x size)
// TODO: support arbitrary render routines
var renderImage = exports.renderImage = function(minX, minY, maxX, maxY, width, height, layers, styles, callback) {
  var canvas = new Canvas(width, height),
      ctx = canvas.getContext('2d'),
      // we're using the same ratio for width and height, so the actual maxY may not match specified maxY...
      pxPtRatio = width / (maxX - minX);
  
  // var img = new Canvas.Image();
  // img.src = fs.readFileSync("/Users/rbrackett/Dev/cfa/nodetiles/static/images/furley_bg.png");
  // ctx.drawImage(img, 0, 0, img.width, img.height);
  
  
  
  
  // 
  transform = function(p) {
    var point = [];
    point[0] = (p[0] - minX) * pxPtRatio;
    point[1] = ((p[1] - minY) * -pxPtRatio) + height;
    return point;
  };
  
  // var scale = Math.pow(2, zoom);
  // ctx.scale(scale, scale);
  // ctx.translate(-x * 256 / scale, -y * 256 / scale);
  
  // renderer is provided somehow (but we'll have a simple default)
  imageRenderer(ctx, pxPtRatio, layers, styles);
  
  // Print coordinates on tiles
  // ctx.textAlign = 'center';
  // ctx.font = "10px sans-serif";
  // ctx.fillStyle = "#000";
  // ctx.strokeStyle = "#fff";
  // ctx.lineWidth = 3;
  // ctx.strokeText("Coords: "+minX+", "+minY,width/2,height/2+5);
  // ctx.strokeText("Coords: "+maxX+", "+maxY,width/2,height/2+20);
  // ctx.fillText("Coords: "+minX+", "+minY,width/2,height/2+5);
  // ctx.fillText("Coords: "+maxX+", "+maxY,width/2,height/2+20);

  callback(null, canvas);
};

var renderGrid = exports.renderGrid = function(minX, minY, maxX, maxY, width, height, layers, styles, featureImage, callback) {
  var canvas = new Canvas(width, width),
      ctx = canvas.getContext('2d'),
      // we're using the same ratio for width and height, so the actual maxY may not match specified maxY...
      pxPtRatio = width / (maxX - minX),
      gridSize = width;
  
  transform = function(p) {
    var point = [];
    point[0] = (p[0] - minX) * pxPtRatio;
    point[1] = ((p[1] - minY) * -pxPtRatio) + height;
    return point;
  };
  
  ctx.antialias = 'none';
  ctx.fillStyle = '#000000'; // Paint it black
  ctx.fillRect(0, 0, gridSize, gridSize);
  
  // ctx.scale(pxPtRatio, pxPtRatio);
  // ctx.translate(-minX, -minY);
  
  
  // renderer is provided somehow (but we'll have a simple default)
  var colorIndex = gridRenderer(ctx, pxPtRatio, layers, styles);
  
  // return the image we just rendered instead of the actual grid (for debugging)
  if (featureImage) {
    callback(undefined, canvas);
  }
  else {
    var pixels = ctx.getImageData(0, 0, gridSize, gridSize).data; // array of all pixels
    var utfgrid = (new UTFGrid(gridSize, function (point) {
      // Use our raster (ctx) and colorIndex to lookup the corresponding feature

      //look up the the rgba values for the pixel at x,y
      // scan rows and columns; each pixel is 4 separate values (R,G,B,A) in the array
      var startPixel = (gridSize * point.y + point.x) * 4;

      // convert those rgba elements to hex then an integer
      var intColor = h2d(d2h(pixels[startPixel], 2) + d2h(pixels[startPixel + 1], 2) + d2h(pixels[startPixel + 2], 2));

       return colorIndex[intColor]; // returns the feature that's referenced in colorIndex.
    })).encodeAsObject();
    
    for(var featureId in utfgrid.data) {
      utfgrid.data[featureId] = utfgrid.data[featureId].properties; 
    }
  
    callback(undefined, utfgrid);
  }
};

// NB:- these functions are called using 'this' as our canvas context
// it's not clear to me whether this architecture is right but it's neat ATM.
var transform = null;
var renderPath = {
    'MultiPolygon': function(mp) {
        mp.forEach(renderPath.Polygon, this);
    },
    /**
     *  NOTE: RENDERING POLYGONS WITH HOLES
     *  Canvas appears to use the "ESRI Polygon" convention:
     *
     *  The ESRI polygon is an array of rings and an inner ring, or hole, 
     *  is specified by ordering the points counter-clockwise. 
     *  
     *  Alternative, the GeoJSON polygon is an array of rings, but the first 
     *  is always the outer ring and the following ones are inner rings.
     *
     *  Creating polygons with holes that follow the ESRI Polygon convention
     *  magically seems to work with Node-Canvas/Cairo. Weird.
     */
    'Polygon': function(p) {
        p.forEach(renderPath.LineString, this);
    },
    'MultiLineString': function(ml) {
        ml.forEach(renderPath.LineString, this);
    },
    'LineString': function(l) {
        var start = l[0];
        if (transform) {
          start = transform(start);
        }
        this.moveTo(start[0], start[1]);
        l.slice(1).forEach(function(c){
            if (transform) {
              c = transform(c);
            }
            this.lineTo(c[0], c[1]);
        }, this);
    },
    'MultiPoint': function(p, scale) {
        // Can't use forEach here because we need to pass scale along
        for (var i = 0, len = p.length; i < len; i++) {
          renderPath.Point.call(this, p[i], scale);
        }
    },
    'Point': function(p, scale) {
        if (transform) {
          p = transform(p);
          this.arc(p[0], p[1], 8, 0, Math.PI * 2, true);
        }
        else {
          this.arc(p[0], p[1], 8 / scale, 0, Math.PI * 2, true);
        }
    }
};

// Do the actual render. It should be possible for the caller to provide this
var imageRenderer = function (ctx, scale, layers, styles) {
  // background first
  styles.forEach(function(style) {
    if (selectorIsMatch(style.selector)) {
      if (style.properties["background-color"]) {
        ctx.fillStyle = style.properties["background-color"];
        ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
      }
      if (style.properties["background-image"]) {
        // cut off the "url(...)"
        if (typeof style.properties["background-image"] === "string") {
          var content = style.properties["background-image"].slice(4, -1);
          var img = new Canvas.Image();
          var imagePath = path.normalize(__dirname + "/../static/images/" + content);
          img.src = fs.readFileSync(imagePath);
          style.properties["background-image"] = img;
        }
        
        img = style.properties["background-image"];
        // ctx.drawImage(img, 0, 0, img.width, img.height);
        
        ctx.fillStyle = ctx.createPattern(img, "repeat");
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    }
  });
  
  layers.forEach(function(layer, i) {
    var source = layer.source;
    var features = layer.features || layer;
    features.forEach(function(feature) {
      styles.forEach(function(style) {
        if (selectorIsMatch(style.selector, feature, source)) {
          style = style.properties;
          
          ctx.fillStyle = style.fillStyle || style['background-color'] || '';
          ctx.strokeStyle = style.strokeStyle || style['line-color'] || '';
          var lineWidth = style.lineWidth || style['line-width'] || 1.0;
          ctx.lineWidth = lineWidth;// / scale;
          
          ctx.beginPath();
          var shape = feature.geometry || feature;
          var coordinates = shape.coordinates;
          renderPath[shape.type].call(ctx, coordinates, scale);
          if (style.fillStyle) {
              ctx.fill();
          }
          if (style.strokeStyle || style['line-color']) {
              ctx.stroke();
          }
          ctx.closePath();
        }
      });
    });
  });

};


var gridRenderer = function (ctx, scale, layers, styles) {
  var intColor = 1; // color zero is black/empty; so start with 1
  colorIndex = ['']; // make room for black/empty
  
  
  layers.forEach(function(layer, i) {
    var source = layer.source;
    var features = layer.features || layer;
    features.forEach(function(feature) {
      styles.forEach(function(style) {
        if (selectorIsMatch(style.selector, feature, source) && style.selector.interactive) {
          style = style.properties;
          
          ctx.fillStyle = style.fillStyle ? '#' + d2h(intColor, 6) : ''; // only fill in if we have a style defined
          ctx.strokeStyle = style.strokeStyle ? '#' + d2h(intColor, 6) : '';
          
          // ctx.fillStyle = style.fillStyle || style['background-color'] || '';
          // ctx.strokeStyle = style.strokeStyle || style['line-color'] || '';
          var lineWidth = style.lineWidth || style['line-width'] || 1.0;
          ctx.lineWidth = lineWidth;// / scale;
          
          ctx.beginPath();
          var shape = feature.geometry || feature;
          var coordinates = shape.coordinates;
          // var coordinates = feature.geometry ? feature.geometry.coordinates : feature.coordinates;
          renderPath[shape.type].call(ctx, coordinates, scale);
          if (style.fillStyle) {
              ctx.fill();
          }
          if (style.strokeStyle || style['line-color']) {
              ctx.stroke();
          }
          ctx.closePath();
          
          colorIndex.push(feature); // this should like up with our colors.
          intColor++; // Go on to the next color;
        }
      });
    });
  });
  
  return colorIndex;
};

// hex helper functions
function d2h(d, digits) {
  d = d.toString(16); 
  while (d.length < digits) {
		d = '0' + d;
	}
	  
  return d;
}
function h2d(h) {
  return parseInt(h,16);
}

var selectorIsMatch = function(selector, feature, source) {
  var matches = true;
  for (var key in selector) {
    if (key === "source") {
      matches = matches && selector[key] === source;
    }
    else if (key === "zoom") {
      // matches = matches && true;
    }
    else if (key === "ruleName") {
      // noop
    }
    else if (key === "interactive") {
      // noop
    }
    else if (key === "background") {
      var valid = feature ? !selector[key] : selector[key];
      matches = matches && valid;
    }
    else {
      matches = matches && feature.properties[key] === selector[key];
    }
    if (!matches) {
      return false;
    }
  }
  return matches;
};

var processStyles = exports.processStyles = function(styles) {
  var processed = [];
    
  styles.forEach(function(style) {
    var existing = __.find(processed, function(processedStyle) {
      // return __.isEqual(processedStyle.selector, style.selector);
      return deepEqual(processedStyle.selector, style.selector);
    });
      
    if (existing) {
      for (var key in style.properties) {
        existing.properties[key] = style.properties[key];
      }
    }
    else {
      processed.push(style);
    }
  });
    
  return processed;
};

var deepEqual = function(a, b) {
  try {
  var aKeys = Object.keys(a),
      bKeys = Object.keys(b);
  }
  catch(ex) {
    return a === b;
  }
  
  if (aKeys.length === bKeys.length) {
    var equal = true;
    for (var i = aKeys.length - 1; i >= 0; i--) {
      var aKey = aKeys[i],
          bKey = bKeys[i];
      if (aKey === bKey) {
        var aVal = a[aKey],
            bVal = b[bKey];
        if (aVal instanceof Date) {
          equal = equal && (bVal instanceof Date) && aVal.valueOf() === bVal.valueOf();
        }
        else if (aVal instanceof RegExp) {
          equal = equal && (bVal instanceof RegExp) && (aVal.toString() === bVal.toString());
        }
        else if (typeof aVal !== "object") {
          equal = equal && aVal === bVal;
        }
        else {
          equal = equal && deepEqual(aVal, bVal);
        }
      }
      else {
        return false;
      }
    }
    return equal;
  }
  
  return false;
};
