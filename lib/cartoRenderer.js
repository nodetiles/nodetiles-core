var Canvas = require('canvas');
var carto = require("carto");
var UTFGrid = require('./utfgrid');
var fs = require('fs');
var path = require('path');
var util = require('util');
var __ = require('lodash');

var MAX_ZOOM = 23;
var BASE_IMAGE_PATH = path.normalize(__dirname + "/../static/images/");
var LINE_DASH_PROPERTY = (function() {
  var canvas = new Canvas(8, 8);
  var ctx = canvas.getContext("2d");
  var property = (ctx.dash && "dash") || (ctx.lineDash && "lineDash");
  if (!property) {
    for (var prefixes = ["webkit", "moz", "o", "ms"], i = prefixes.length - 1; i > -1; i--) {
      var prefix = prefixes[i];
      if (ctx[prefix + "Dash"]) return prefix + "Dash"
      else if (ctx[prefix + "LineDash"]) return prefix + "LineDash";
    }
  }
  return property;
})();

// Handles canvas and context management, then passes things off to an actual rendering routine
// TODO: support arbitrary canvas size (or at least @2x size)
// TODO: support arbitrary render routines
var renderImage = exports.renderImage = function(minX, minY, maxX, maxY, width, height, layers, styles, callback) {
  var canvas = new Canvas(width, height),
      ctx = canvas.getContext('2d'),
      // we're using the same ratio for width and height, so the actual maxY may not match specified maxY...
      pxPtRatio = width / (maxX - minX);
  
  // once upon a time, we used to scale and translate the canvas instead of transforming the points. 
  // However, this causes problems when drawing images and patterns, so we can't do that anymore :(
  transform = function(p) {
    var point = [];
    point[0] = (p[0] - minX) * pxPtRatio;
    point[1] = ((p[1] - minY) * -pxPtRatio) + height;
    return point;
  };
  // an even worse hack
  transform.pxPtRatio = pxPtRatio;
  
  // pxPtRatio should be in tile coordinates here...
  var ratio = pxPtRatio;
  for (var i = MAX_ZOOM; i; i--) {
    ratio = ratio / 2;
    if (ratio < 1) {
      break;
    }
  }
  var zoom = MAX_ZOOM - i;
  
  // For web mercator...
  // var pointsPerTilePoint = 2 * Math.PI * 6378137 / 256;
  // var tilePointsPerPoint = 256 / (2 * Math.PI * 6378137);
  // var tilePoints = (maxX - minX) * tilePointsPerPoint;
  // var tilePxPtRatio = width / tilePoints;
  // var zoom = Math.round(tilePxPtRatio);
  // console.log("tilePointsPerPoint: " + tilePointsPerPoint +
  //             "\ntilePoints: " + tilePoints +
  //             "\ntilePxPtRatio: " + tilePxPtRatio);
  // console.log("Est. Zoom: " + zoom);
  
  // renderer is provided somehow (but we'll have a simple default)
  cartoImageRenderer(ctx, pxPtRatio, layers, styles, zoom, minX, maxX, minY);
  
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
  // an even worse hack
  transform.pxPtRatio = pxPtRatio;
  
  // pxPtRatio should be in tile coordinates here...
  var ratio = pxPtRatio;
  for (var i = MAX_ZOOM; i; i--) {
    ratio = ratio / 2;
    if (ratio < 1) {
      break;
    }
  }
  var zoom = MAX_ZOOM - i;
  
  ctx.antialias = 'none';
  ctx.fillStyle = '#000000'; // Paint it black
  ctx.fillRect(0, 0, gridSize, gridSize);
  
  
  // renderer is provided somehow (but we'll have a simple default)
  var colorIndex = cartoGridRenderer(ctx, pxPtRatio, layers, styles, zoom);
  
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

var roundPoint = function(point) {
  return point.map(Math.round);
};

// Many canvas implementations don't support the dash/lineDash property, so we do it by hand :\
// NOTE also lineDash is in the WHATWG HTML draft but not W3C:
// http://www.whatwg.org/specs/web-apps/current-work/multipage/the-canvas-element.html
var renderDashedPath = {
  'MultiPolygon': function(dashArray, mp) {
    mp.forEach(renderDashedPath.Polygon.bind(this, dashArray));
  },
  'Polygon': function(dashArray, p) {
    p.forEach(renderDashedPath.LineString.bind(this, dashArray));
  },
  'MultiLineString': function(dashArray, ml) {
    ml.forEach(renderDashedPath.LineString.bind(this, dashArray));
  },
  'LineString': function(dashArray, l, offset) {
    // if there's no dashArray, just go render a solid line
    if (!dashArray) {
      return renderPath.LineString.call(this, l);
    }
    
    offset = offset || 0;
    
    // don't render segments less than this length (in px)
    // for best fidelity, this should be at least 1, but not much higher
    var minSegmentLength = 2;
    
    // round off the start and end points to get as close as we can to drawing on pixel boundaries
    // loop through line combining segments until they match the minimum length
    var start = roundPoint(transform(l[0]));
    for (var i = 1, len = l.length; i < len; i++) {
      var end = roundPoint(transform(l[i])),
          dx = end[0] - start[0];
          dy = end[1] - start[1];
          lineLength = Math.sqrt(dx * dx + dy * dy);
      
      // only draw segments of 1px or greater
      if (lineLength >= minSegmentLength) {
        var angle = Math.atan2(dy, dx);
        offset = renderDashedPath._screenLine.call(this, dashArray, start, end, lineLength, angle, offset);
        start = end;
      }
    }
    
  },
  _screenLine: function(dashArray, start, end, realLength, angle, offset) {
    // we're gonna do some transforms
    this.save();
    
    // move the line out by half a pixel for more crisp 1px drawing
    var yOffset = -0.5;
        
    // In order to reduce artifacts of trying to draw fractions of a pixel,
    // only draw even pixels worth of length
    var length = Math.floor(realLength);
    
    // Skip zero length/less-than-one length lines
    if (length === 0) {
      return offset;
    }
    
    // decimal offset is left over from refraining from drawing fractions of a pixel on a previous segment
    // (see where the length is floor()'d above)
    // We'll eventually move the start point back by the fractional offset to account for what we
    // didn't draw in the previous segment (we potentially underdraw because we floor()'d the length).
    var intOffset = Math.ceil(offset);
    var decOffset = offset - intOffset;
    offset = intOffset;
    
    // transform the context so we can simplify the work by pretending to draw a straight line
    this.translate(start[0], start[1]);
    this.rotate(angle);
    
    // Move the start point back by the fractional offset (see deeper description above)
    this.moveTo(decOffset, yOffset);
    
    var dashCount = dashArray.length;
    var dashIndex = 0;
    // Move the start point by the integer offset (the fractional bit is already accounted for above)
    var x = offset || 0;
    // keep track of how much of the pattern we drew (used to offset the next segment)
    var patternDistance = 0;
    var draw = true;
    
    while (x < length) {
      // reset the pattern distance when we loop back to the start of the dash array
      if (dashIndex === 0) {
        patternDistance = 0;
      }
      
      // get the distance of this dash
      var dashLength = dashArray[dashIndex];
      dashIndex = (dashIndex + 1) % dashCount;
      x += dashLength;
      patternDistance += dashLength;
      
      // if we are about to draw past the end of the segment, don't
      if (x > length) {
        patternDistance += length - x;
        x = length;
      }
      
      // only draw once we've moved past the offset
      if (x > 0) {
        if (draw) {
          this.lineTo(x, yOffset);
        }
        else {
          this.moveTo(x, yOffset);
        }
      }
      draw = !draw;
    }
    // Add the fractional extra distance that we didn't draw back in
    patternDistance += realLength - length;
    
    this.restore();
    return -patternDistance;
  },
  'MultiPoint': function(dashArray, p, scale) {
    // Can't use forEach here because we need to pass scale along
    for (var i = 0, len = p.length; i < len; i++) {
      renderDashedPath.Point.call(this, null, p[i], scale);
    }
  },
  'Point': function(dashArray, p, scale) {
    if (transform) {
      p = transform(p);
      this.arc(p[0], p[1], 8, 0, Math.PI * 2, true);
    }
    else {
      this.arc(p[0], p[1], 8 / scale, 0, Math.PI * 2, true);
    }
  }
};

// var didATile = false;
var cartoImageRenderer = function (ctx, scale, layers, styles, zoom, minX, maxX, minY) {
  // var length = (maxX - minX) / 5;
  // renderDashedPath.LineString.call(ctx, [4, 4], 
  //   [[minX, minY],
  //    [minX + length, minY],
  //    [minX + length + length, minY],
  //    [minX + length + length + length, minY],
  //    [minX + length + length + length + length, minY]]);
  //  ctx.strokeStyle = "#000";
  //  ctx.lineWidth = 1.0;
  //  // ctx.lineCap = "square";
  //  ctx.stroke();
  //  didATile = true;
  //  return;
  
  
  // background first
  styles.forEach(function(style) {
    if (cartoSelectorIsMatch(style, null, null, zoom)) {
      style.rules.forEach(function(rule) {
        if (rule.name === "background-color") {
          ctx.fillStyle = rule.value.toString();
        }
        else if (rule.name === "background-image") {
          if (!(rule.value instanceof Canvas.Image)) {
            var content = rule.value.toString();
            var img = new Canvas.Image();
            var imagePath = path.normalize(__dirname + "/../static/images/" + content);
            img.src = fs.readFileSync(imagePath);
            rule.value = img;
          }
        
          img = rule.value;
          ctx.fillStyle = ctx.createPattern(img, "repeat");
        }
      });
      ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
    }
  });
  
  var attachments = styles.reduce(function(attachmentList, style) {
    if (style.attachment !== "__default__" && attachmentList.indexOf(style.attachment) === -1) {
      attachmentList.push(style.attachment);
    }
    return attachmentList;
  }, []);
  attachments.push("__default__");
  
  layers.forEach(function(layer, i) {
    var source = layer.source;
    var features = layer.features || layer;
    
    attachments.forEach(function(attachment) {
      
      features.forEach(function(feature) {
        // get all the drawing rules for this attachment and feature
        var collapsedStyle = {};
        var instanceOrder = [];
        styles.forEach(function(style) {
          if (style.attachment === attachment && cartoSelectorIsMatch(style, feature, source, zoom)) {
            style.rules.forEach(function(rule) {
              if (!collapsedStyle[rule.instance]) {
                collapsedStyle[rule.instance] = {};
                instanceOrder.push(rule.instance);
              }
              if (!collapsedStyle[rule.instance].hasOwnProperty(rule.name)) {
                collapsedStyle[rule.instance][rule.name] = rule.value;
              }
            });
          }
        });
        
        var renderInstance = function(instanceName) {
          var instanceStyle = collapsedStyle[instanceName];
          
          ctx.save();
  
          var shouldFill = false,
              shouldStroke = false,
              dashedStroke = false;
          for (var key in instanceStyle) {
            var rawValue = instanceStyle[key],
                value = rawValue.toString();
            
            if (key === "background-color" || key === "polygon-fill") {
              ctx.fillStyle = value;
              shouldFill = true;
            }
            else if (key === "background-image" || key === "polygon-pattern-file") {
              if (rawValue) {
                ctx.fillStyle = ctx.createPattern(rawValue, "repeat");
                shouldFill = true;
              }
            }
            else if (key === "line-width") {
              ctx.lineWidth = parseInt(value);
            }
            else if (key === "line-color") {
              ctx.strokeStyle = value;
              shouldStroke = true;
            }
            else if (key === "line-opacity") {
              // handled at stroke time below
            }
            else if (key === "line-join") {
              ctx.lineJoin = value;
            }
            else if (key === "line-cap") {
              ctx.lineCap = value;
            }
            else if (key === "line-miterlimit") {
              ctx.miterLimit = value;
            }
            else if (key === "line-dasharray") {
              // TODO: dasharray support
              // console.log("Dasharray: ", value);
              var dashedStroke = value.split(",").map(parseFloat);
              // console.log("    now: ", dashArray);
              // ctx.dash = dashArray;
              // ctx.lineDash = dashArray;
            }
            else if (key === "polygon-opacity") {
              // handled at fill time below
            }
            else if (key === "line-pattern-file") {
              if (rawValue) {
                ctx.strokeStyle = ctx.createPattern(rawValue, "repeat");
                shouldStroke = true;
              }
            }
          }
          
          if (shouldFill || shouldStroke) {
            ctx.beginPath();
            var shape = feature.geometry || feature;
            var coordinates = shape.coordinates;
            renderPath[shape.type].call(ctx, coordinates, scale);
            if (shouldFill) {
              ctx.globalAlpha = parseFloat(instanceStyle["polygon-opacity"]) || 1.0;
              var fillColor = instanceStyle["polygon-fill"];
              var fillPattern = instanceStyle["polygon-pattern-file"]
              if (fillColor) {
                ctx.fillStyle = fillColor.toString();
                ctx.fill();
              }
              if (fillPattern) {
                ctx.fillStyle = ctx.createPattern(fillPattern, "repeat");;
                ctx.fill();
              }
            }
            if (shouldStroke) {
              ctx.globalAlpha = parseFloat(instanceStyle["line-opacity"]) || 1.0;
              if (dashedStroke) {
                // since canvas doesn't yet have dashed line support, we have to draw a dashed path :(
                ctx.closePath();
                ctx.beginPath();
                renderDashedPath[shape.type].call(ctx, dashedStroke, coordinates);
              }
              ctx.stroke();
            }
            ctx.closePath();
          }
          
          ctx.restore();
        };
      
        instanceOrder.forEach(function(instanceName) {
          if (instanceName !== "__default__") {
            renderInstance(instanceName);
          }
        });
      
        if (collapsedStyle["__default__"]) {
          renderInstance("__default__");
        }
      
      });
      
    });
    return;
    
    
    
    
    
    
    
    features.forEach(function(feature) {
      
      var collapsedStyle = {};
      var attachmentOrder = [];
      styles.forEach(function(style) {
        if (cartoSelectorIsMatch(style, feature, source, zoom)) {
          if (!collapsedStyle[style.attachment]) {
            collapsedStyle[style.attachment] = {};
            attachmentOrder.push(style.attachment);
          }
          
          var collapsedAttachmentStyle = collapsedStyle[style.attachment];
          
          style.rules.forEach(function(rule) {
            if (!collapsedAttachmentStyle[rule.name]) {
              collapsedAttachmentStyle[rule.name] = rule.value.toString();
            }
          });
        }
      });
      
      // console.log(collapsedStyle);
      
      var renderAttachment = function(attachmentName) {
        var attachmentStyle = collapsedStyle[attachmentName];
          
        ctx.save();
  
        var shouldFill = false,
            shouldStroke = false;
        for (var key in attachmentStyle) {
          var value = attachmentStyle[key];
            
          if (key === "background-color" || key === "polygon-fill") {
            ctx.fillStyle = value;
            shouldFill = true;
          }
          else if (key === "background-image" || key === "polygon-pattern-file") {
            if (!(value instanceof Canvas.Image)) {
              var img = new Canvas.Image();
              var imagePath = path.normalize(__dirname + "/../static/images/" + value);
              img.src = fs.readFileSync(imagePath);
              attachmentStyle[key] = img;
            }
        
            img = attachmentStyle[key];
            ctx.fillStyle = ctx.createPattern(img, "repeat");
            shouldFill = true;
          }
          else if (key === "line-width") {
            ctx.lineWidth = parseInt(value);
          }
          else if (key === "line-color") {
            ctx.strokeStyle = value;
            shouldStroke = true;
          }
          else if (key === "line-opacity") {
            // handled at stroke time below
          }
          else if (key === "line-join") {
            ctx.lineJoin = value;
          }
          else if (key === "line-cap") {
            ctx.lineCap = value;
          }
          else if (key === "line-miterlimit") {
            ctx.miterLimit = value;
          }
          else if (key === "line-dasharray") {
            // TODO: dasharray support
            // console.log("Dasharray: ", value);
            // var dashArray = value.split(",").map(parseFloat);
            // console.log("    now: ", dashArray);
            // ctx.dash = dashArray;
            // ctx.lineDash = dashArray;
          }
          else if (key === "polygon-opacity") {
            // handled at fill time below
          }
          else if (key === "line-pattern-file") {
            if (!(value instanceof Canvas.Image)) {
              var img = new Canvas.Image();
              var imagePath = path.normalize(__dirname + "/../static/images/" + value);
              img.src = fs.readFileSync(imagePath);
              attachmentStyle[key] = img;
            }
        
            img = attachmentStyle[key];
            ctx.strokeStyle = ctx.createPattern(img, "repeat");
            shouldStroke = true;
          }
        }
          
        if (shouldFill || shouldStroke) {
          ctx.beginPath();
          var shape = feature.geometry || feature;
          var coordinates = shape.coordinates;
          renderPath[shape.type].call(ctx, coordinates, scale);
          if (shouldFill) {
            ctx.globalAlpha = parseFloat(attachmentStyle["polygon-opacity"]) || 1.0;
            var fillColor = attachmentStyle["polygon-fill"];
            var fillPattern = attachmentStyle["polygon-pattern-file"]
            if (fillColor) {
              ctx.fillStyle = fillColor;
              ctx.fill();
            }
            if (fillPattern) {
              ctx.fillStyle = ctx.createPattern(fillPattern, "repeat");;
              ctx.fill();
            }
          }
          if (shouldStroke) {
            ctx.globalAlpha = parseFloat(attachmentStyle["line-opacity"]) || 1.0;
            ctx.stroke();
          }
          ctx.closePath();
        }
          
        ctx.restore();
      };
      
      attachmentOrder.forEach(function(attachmentName) {
        if (attachmentName !== "__default__") {
          renderAttachment(attachmentName);
        }
      });
      
      if (collapsedStyle["__default__"]) {
        renderAttachment("__default__");
      }
      
    });
  });
};


var cartoGridRenderer = function (ctx, scale, layers, styles, zoom) {
  var intColor = 1; // color zero is black/empty; so start with 1
  colorIndex = ['']; // make room for black/empty
  
  layers.forEach(function(layer, i) {
    var source = layer.source;
    var features = layer.features || layer;
    features.forEach(function(feature) {
      
      var collapsedStyle = {};
      var attachmentOrder = [];
      styles.forEach(function(style) {
        if (cartoSelectorIsMatch(style, feature, source, zoom)) {
          if (!collapsedStyle[style.attachment]) {
            collapsedStyle[style.attachment] = {};
            attachmentOrder.push(style.attachment);
          }
          
          var collapsedAttachmentStyle = collapsedStyle[style.attachment];
          
          style.rules.forEach(function(rule) {
            if (!collapsedAttachmentStyle[rule.name]) {
              collapsedAttachmentStyle[rule.name] = rule.value.toString();
            }
          });
        }
      });
      
      
      var renderAttachment = function(attachmentName) {
        var attachmentStyle = collapsedStyle[attachmentName];
          
        ctx.save();
  
        var shouldFill = false,
            shouldStroke = false;
        for (var key in attachmentStyle) {
          var value = attachmentStyle[key];
            
          if (key === "background-color") {
            ctx.fillStyle = value;
            shouldFill = true;
          }
          else if (key === "background-image") {
            if (!(value instanceof Canvas.Image)) {
              var img = new Canvas.Image();
              var imagePath = path.normalize(__dirname + "/../static/images/" + value);
              img.src = fs.readFileSync(imagePath);
              attachmentStyle[key] = img;
            }
        
            img = attachmentStyle[key];
            ctx.fillStyle = ctx.createPattern(img, "repeat");
            shouldFill = true;
          }
          else if (key === "line-width") {
            ctx.lineWidth = parseInt(value);
          }
          else if (key === "line-color") {
            ctx.strokeStyle = value;
            shouldStroke = true;
          }
          else if (key === "line-opacity") {
            // TODO: this needs to modify lineStyle
            // and lineStyle needs to watch for it
          }
          else if (key === "line-join") {
            ctx.lineJoin = value;
          }
          else if (key === "line-cap") {
            ctx.lineCap = value;
          }
          else if (key === "line-dasharray") {
            // TODO: dasharray support
            // console.log("Dasharray: ", value);
            // var dashArray = value.split(",").map(parseFloat);
            // console.log("    now: ", dashArray);
            // ctx.dash = dashArray;
            // ctx.lineDash = dashArray;
          }
          else if (key === "") {
            
          }
            
        }
          
        if (shouldFill || shouldStroke) {
          ctx.beginPath();
          var shape = feature.geometry || feature;
          var coordinates = shape.coordinates;
          renderPath[shape.type].call(ctx, coordinates, scale);
          if (shouldFill) {
            ctx.fillStyle = '#' + d2h(intColor, 6);
            ctx.fill();
          }
          if (shouldStroke) {
            ctx.strokeStyle = '#' + d2h(intColor, 6);
            ctx.stroke();
          }
          ctx.closePath();
          
          colorIndex.push(feature); // this should line up with our colors.
          intColor++; // Go on to the next color;
        }
          
        ctx.restore();
      };
      
      attachmentOrder.forEach(function(attachmentName) {
        if (attachmentName !== "__default__") {
          renderAttachment(attachmentName);
        }
      });
      
      if (collapsedStyle["__default__"]) {
        renderAttachment("__default__");
      }
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

var cartoSelectorIsMatch = function(definition, feature, source, zoom) {
  // ZOOM
  var supportedZooms = definition.zoom;
  // 8388607 is all zooms
  if (supportedZooms && supportedZooms !== 8388607) {
    var minZoom, maxZoom;
    for (var i = 0; i < MAX_ZOOM; i++) {
      if (!minZoom && (supportedZooms & (1 << i))) {
        minZoom = i;
      }
      if (minZoom && !(supportedZooms & (1 << i))) {
        maxZoom = i - 1;
      }
    }
  
    if (minZoom > zoom || maxZoom < zoom) {
      return false;
    }
  }
  
  // MAP BG
  if (!feature) {
    return !!__.find(definition.elements, function(element) {
      return element.value === "Map";
    });
  }
  
  // SOURCES
  var matches = true;
  if (definition.elements.length) {
    var hasSource = !!__.find(definition.elements, function(element) {
      var elementName = element.value;
      return elementName === "*" || elementName === ("#" + source) || elementName === ("." + source);
    });
    if (!hasSource) {
      return false;
    }
  }
  
  // OTHER FILTERS
  if (definition.filters) {
    for (var filterKey in definition.filters) {
      var filter = definition.filters[filterKey];
      
      if (filter.op === "=") {
        if (feature.properties[filter.key] !== filter.val) {
          return false;
        }
      }
    }
  }
  return true;
};

exports.processStyles = function(styles) {
  var processed = [];
  var imageCache = {};
  
  styles.forEach(function(cartoString, index) {
    var env = {
      filename: "Style" + index,
      frames: [],
      error: function(error) {
        console.error("Carto parsing error: ", error);
      }
    };
    try {
      var parsed = (carto.Parser(env)).parse(cartoString);
    }
    catch(ex) {
      console.error("Error parsing Carto style #" + index + ": " + ex + "\n" + cartoString + "\n\n");
      return;
    }
    
    var flattened = parsed.flatten([], [], env);
      
    flattened.forEach(function(ruleset) {
      ruleset.rules.forEach(function(rule) {
        rule.value = rule.value.eval(env);
        
        // preload URIs as images
        if (rule.value.is === "uri") {
          var result;
          var stringValue = rule.value.toString();
          if (stringValue) {
            result = imageCache[stringValue];
            if (!result) {
              var imagePath = path.join(BASE_IMAGE_PATH, stringValue);
              var image = new Canvas.Image();
              try {
                image.src = fs.readFileSync(imagePath);
                imageCache[stringValue] = image;
                result = image;
              }
              catch(ex) {}
            }
          }
          rule.value = result;
        }
      });
    });
      
    processed = processed.concat(flattened);
  }, this);
    
  // Sort rules by specificity
  // (copied from carto.Parser - it's private, so we can't just reach in and use it)
  processed.sort(function(a, b) {
    var as = a.specificity;
    var bs = b.specificity;

    if (as[0] != bs[0]) return bs[0] - as[0];
    if (as[1] != bs[1]) return bs[1] - as[1];
    if (as[2] != bs[2]) return bs[2] - as[2];
    return bs[3] - as[3];
  });
    
  return processed;
};
