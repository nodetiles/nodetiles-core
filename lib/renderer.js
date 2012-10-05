var Canvas = require('canvas');

// FIXME: this *really* shouldn't be here
var bgColor = '#ddddff';

// Handles canvas and context management, then passes things off to an actual rendering routine
// TODO: support arbitrary canvas size (or at least @2x size)
// TODO: support arbitrary render routines
var renderImage = exports.renderImage = function(minX, minY, maxX, maxY, width, height, layers, callback) {
  // createTile(imageRenderer, zoom, x, y, layers, callback);
  var canvas = new Canvas(width, height),
      ctx = canvas.getContext('2d'),
      // we're using the same ratio for width and height, so the actual maxY may not match specified maxY...
      pxPtRatio = width / (maxX - minX);
  
  ctx.scale(pxPtRatio, pxPtRatio);
  ctx.translate(-minX, -minY);
  
  // var scale = Math.pow(2, zoom);
  // ctx.scale(scale, scale);
  // ctx.translate(-x * 256 / scale, -y * 256 / scale);
  
  // renderer is provided somehow (but we'll have a simple default)
  imageRenderer(ctx, pxPtRatio, layers);
  
  callback(null, canvas);
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
var imageRenderer = function (ctx, scale, layers) {
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
