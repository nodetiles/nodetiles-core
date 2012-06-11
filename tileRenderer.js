var Canvas = require('canvas');
var UTFGrid = require('./lib/utfgrid');

// FIXME: this *really* shouldn't be here
var bgColor = '#ddddff';

// Handles canvas and context management, then passes things off to an actual rendering routine
// TODO: support arbitrary canvas size (or at least @2x size)
// TODO: support arbitrary render routines
var renderImage = exports.renderImage = function(zoom, x, y, layers, callback) {
  // createTile(imageRenderer, zoom, x, y, layers, callback);
  var canvas = new Canvas(256, 256),
      ctx = canvas.getContext('2d');
  
  var scale = Math.pow(2, zoom);
  ctx.scale(scale, scale);
  ctx.translate(-x * 256 / scale, -y * 256 / scale);
  
  // renderer is provided somehow (but we'll have a simple default)
  imageRenderer(ctx, zoom, x, y, layers);
  
  callback(undefined, canvas);
};

var renderGrid = exports.renderGrid = function(zoom, x, y, layers, callback, featureImage) {
  // createTile(gridRenderer, zoom - 2, x, y, layers, callback);
  var gridSize = 64,
      canvas = new Canvas(gridSize, gridSize),
      ctx = canvas.getContext('2d');
  
  ctx.antialias = 'none';
  ctx.fillStyle = '#000000'; // Paint it black
  ctx.fillRect(0, 0, gridSize, gridSize);
  
  var scale = Math.pow(2, zoom - 2);
  ctx.scale(scale, scale);
  ctx.translate(-x * 64 / scale, -y * 64 / scale);
  
  // renderer is provided somehow (but we'll have a simple default)
  var colorIndex = gridRenderer(ctx, zoom, x, y, layers);
  
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

var createTile = function(renderer, zoom, x, y, layers, callback) {
  var canvas = new Canvas(256, 256),
      ctx = canvas.getContext('2d');
  
  var scale = Math.pow(2, zoom);
  ctx.scale(scale, scale);
  ctx.translate(-x * 256 / scale, -y * 256 / scale);
  
  // renderer is provided somehow (but we'll have a simple default)
  renderer(ctx, zoom, x, y, layers);
  
  callback(undefined, canvas);
};


// NB:- these functions are called using 'this' as our canvas context
// it's not clear to me whether this architecture is right but it's neat ATM.
var renderPath = {
    'MultiPolygon': function(mp) {
        mp.forEach(renderPath.Polygon, this);
    },
    'Polygon': function(p) {
        p.forEach(renderPath.LineString, this);
    },
    'MultiLineString': function(ml) {
        ml.forEach(renderPath.LineString, this);
    },
    'LineString': function(l) {
        this.moveTo(l[0][0], l[0][1]);
        l.slice(1).forEach(function(c){
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
        this.arc(p[0], p[1], 8 / scale, 0, Math.PI * 2, true);
    }
};

// Do the actual render. It should be possible for the caller to provide this
var imageRenderer = function (ctx, zoom, x, y, layers) {
  var scale = Math.pow(2, zoom);
  
  // FIXME: bgColor really needs to come from somewhere appropriate
  ctx.fillStyle = bgColor;
  ctx.fillRect(0,0,256,256);
  
  layers.forEach(function(layer, i) {
    layer.styles.forEach(function(style) {
      ctx.fillStyle = style.fillStyle || '';
      ctx.strokeStyle = style.strokeStyle || '';
      ctx.lineWidth = 'lineWidth' in style ? style.lineWidth / scale : 1.0 / scale;
      
      layer.features.forEach(function(feature) {
        ctx.beginPath();
        var coordinates = feature.geometry.coordinates;
        renderPath[feature.geometry.type].call(ctx, coordinates, scale);
        if (style.fillStyle) {
            ctx.fill();
        }
        if (style.strokeStyle) {
            ctx.stroke();
        }
        ctx.closePath();
      });
    });
  });
};



var gridRenderer = function (ctx, zoom, x, y, layers) {
  var intColor = 1; // color zero is black/empty; so start with 1
  colorIndex = ['']; // make room for black/empty

  var scale = Math.pow(2, zoom - 2);
  
  layers.forEach(function(layer, layerIndex) {
    if (layerIndex != 0) { // TODO: make some way to configure which layers become UTFgrids
      layer.styles.forEach(function(style, styleIndex) {
        ctx.lineWidth = 'lineWidth' in style ? style.lineWidth / scale : 1.0 / scale;
        layer.features.forEach(function(feature, featureIndex) {
          ctx.fillStyle = style.fillStyle ? '#' + d2h(intColor, 6) : ''; // only fill in if we have a style defined
          ctx.strokeStyle = style.strokeStyle ? '#' + d2h(intColor, 6) : '';
        
          //console.log(ctx.fillStyle);
        
          ctx.beginPath();
          var coordinates = feature.geometry.coordinates;
          renderPath[feature.geometry.type].call(ctx, coordinates, Math.pow(2, zoom)); // TODO :Clean up the scaling
          if (ctx.fillStyle) {
            ctx.fill();
          }
          if (ctx.strokeStyle) {
            ctx.stroke();
          }
          ctx.closePath();
        
          colorIndex.push(feature); // this should like up with our colors.
          intColor++; // Go on to the next color;
        });
      });
   }
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