var Canvas = require('canvas');
var carto = require("carto");
var UTFGrid = require('./utfgrid');
var fs = require('fs');
var path = require('path');
var util = require('util');
var __ = require('lodash');

var MIGURSKI = true;

var MAX_ZOOM = 23;
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
var renderImage = exports.renderImage = function(options) {
  var bounds = options.bounds;
  var width = options.width;
  var height = options.height;
  var layers = options.layers;
  var styles = options.styles;
  var callback = options.callback;
  var zoom = options.zoom;
  
  var canvas = new Canvas(width, height),
      ctx = canvas.getContext('2d'),
      // we're using the same ratio for width and height, so the actual maxY may not match specified maxY...
      pxPtRatio = width / (bounds.maxX - bounds.minX);
  
  // once upon a time, we used to scale and translate the canvas instead of transforming the points. 
  // However, this causes problems when drawing images and patterns, so we can't do that anymore :(
  transform = function(p) {
    var point = [];
    point[0] = (p[0] - bounds.minX) * pxPtRatio;
    point[1] = ((p[1] - bounds.minY) * -pxPtRatio) + height;
    return point;
  };
  
  cartoImageRenderer(ctx, pxPtRatio, options.layers, options.styles, options.zoom, bounds.minX, bounds.maxX, bounds.minY);
  
  options.callback && options.callback(null, canvas);
};

var renderGrid = exports.renderGrid = function(options) {
  var bounds = options.bounds;
  var width = options.width;
  var height = options.height;
  var callback = options.callback;
  var featureImage = options.drawImage;
  
  var canvas = new Canvas(width, width),
      ctx = canvas.getContext('2d'),
      // we're using the same ratio for width and height, so the actual maxY may not match specified maxY...
      pxPtRatio = width / (bounds.maxX - bounds.minX),
      gridSize = width;
  
  transform = function(p) {
    var point = [];
    point[0] = (p[0] - bounds.minX) * pxPtRatio;
    point[1] = ((p[1] - bounds.minY) * -pxPtRatio) + height;
    return point;
  };
  
  ctx.antialias = 'none';
  ctx.fillStyle = '#000000'; // Paint it black
  ctx.fillRect(0, 0, gridSize, gridSize);
  
  // renderer is provided somehow (but we'll have a simple default)
  var colorIndex = cartoGridRenderer(ctx, pxPtRatio, options.layers, options.styles, options.zoom);
  
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

var renderImage = {
  'MultiPolygon': function(image, mp) {
    mp.forEach(renderImage.Polygon.bind(this, image));
  },
  'Polygon': function(image, p) {
    renderImage.LineString.call(this, image, p[0]);
  },
  'MultiLineString': function(image, ml) {
    ml.forEach(renderImage.LineString.bind(this, image));
  },
  'LineString': function(image, l) {
    // put the point at the center
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    l.forEach(function(point) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    });
    return renderImage.Point.call(this, image, [minX + (maxX - minX) / 2, minY + (maxY - minY) / 2])
  },
  'MultiPoint': function(image, p, scale) {
    // Can't use forEach here because we need to pass scale along
    for (var i = 0, len = p.length; i < len; i++) {
      renderImage.Point.call(this, image, p[i], scale);
    }
  },
  'Point': function(image, p, scale) {
    if (transform) {
      p = transform(p);
    }
    this.drawImage(image, p[0] - image.width / 2, p[1] - image.height / 2);
  }
};

var renderDot = {
  'MultiPolygon': function(radius, mp) {
    mp.forEach(renderDot.Polygon.bind(this, radius));
  },
  'Polygon': function(radius, p) {
    renderDot.LineString.call(this, radius, p[0]);
  },
  'MultiLineString': function(radius, ml) {
    ml.forEach(renderDot.LineString.bind(this, radius));
  },
  'LineString': function(radius, l) {
    // put the point at the center
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    l.forEach(function(point) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    });
    return renderDot.Point.call(this, radius, [minX + (maxX - minX) / 2, minY + (maxY - minY) / 2])
  },
  'MultiPoint': function(radius, p, scale) {
    // Can't use forEach here because we need to pass scale along
    for (var i = 0, len = p.length; i < len; i++) {
      renderDot.Point.call(this, radius, p[i], scale);
    }
  },
  'Point': function(radius, p) {
    if (transform) {
      p = transform(p);
    }
    this.arc(p[0], p[1], radius || 10, 0, Math.PI * 2, true);
  }
};

var renderText = {
  'MultiPolygon': function(text, mp) {
    mp.forEach(renderText.Polygon.bind(this, text));
  },
  'Polygon': function(text, p) {
    renderText.LineString.call(this, text, p[0]);
  },
  'MultiLineString': function(text, ml) {
    ml.forEach(renderText.LineString.bind(this, text));
  },
  'LineString': function(text, l) {
    // we support line and point, point is default
    if (text.placement === "line") {
      this.textAlign = "left";
      
      var totalLength = 0;
      var segmentLengths = [];
      
      for (var i = 1, len = l.length; i < len; i++) {
        var start = transform(l[i - 1]);
            end = transform(l[i]),
            dx = end[0] - start[0];
            dy = end[1] - start[1];
            lineLength = Math.sqrt(dx * dx + dy * dy);
            
        totalLength += lineLength;
        segmentLengths.push(lineLength);
      }
      
      var closedShape = l[0][0] === l[len - 1][0] && l[0][1] === l[len - 1][1];
      
      // NOTE: should we really bail here if there's not enough room on the line to write the text?
      // maybe this should be an option (on by default)
      var textLength = this.measureText(text.text).width;
      if (totalLength < textLength) {
        return;
      }
      
      // determine distance along line to start placing text
      var startPoint = 0;
      // TODO: support BIDI text (right now end = right and start = left)
      if (text.align === "end" || text.align === "right") {
        startPoint = totalLength - textLength;
      }
      else if (text.align === "center" || text.align === "middle" || !text.align) {
        startPoint = totalLength / 2 - textLength / 2;
      }
      
      // these operations may be destructive to the text object, so save old values here
      // TODO: maybe we should make a new object that uses the text argument as its prototype?
      var fullText = text.text;
      var originalXOffset = 0;
      if (text.offset) {
        originalXOffset = text.offset.x || 0;
        startPoint += originalXOffset;
        text.offset.x = 0;
        
        // if the line represents a closed shape, loop startPoint around the line
        if (closedShape) {
          while (startPoint < 0) {
            startPoint += totalLength;
          }
        
          while (startPoint > totalLength) {
            startPoint -= totalLength;
          }
        }
      }
      
      var segmentLengthsTotal = 0;
      
      for (var i = 0, len = segmentLengths.length; i < len; i++) {
        var segmentLength = segmentLengths[i];
        if (segmentLengthsTotal + segmentLength >= startPoint || i === len - 1) {
          var segmentDistance = startPoint - segmentLengthsTotal;
          
          var start = transform(l[i]),
              end = transform(l[i + 1]),
              dx = end[0] - start[0],
              dy = end[1] - start[1],
              angle = Math.atan2(dy, dx),
              centerPoint = [segmentDistance * Math.cos(angle) + start[0], start[1] + segmentDistance * Math.sin(angle)];
          
          // keep street names from going upside-down
          var flippedText = false;
          var flippedMinus = false;
          if (angle > 0.5 * Math.PI) {
            angle -= Math.PI;
            flippedText = true;
            flippedMinus = true;
          }
          else if (angle < -0.5 * Math.PI) {
            angle += Math.PI;
            flippedText = true;
          }
            
          this.save();
          this.translate(centerPoint[0], centerPoint[1]);
          this.rotate(angle);
            
          if (MIGURSKI) {
            var textPixels = 0;
            var resetIndex = 0;
            var segmentOffset = 0;
            for (var j = 0, jLen = fullText.length; j < jLen; j++) {
              // GO BACKWARDS FOR FLIPPED TEXT
              if (flippedText) {
                  
                if (segmentOffset + segmentDistance + textPixels > segmentLength && (i < len - 1 || closedShape)) {
                  // TODO: Potentially add some spacing if the angle causes the text top to bend "in"
                  segmentOffset = (segmentOffset + segmentDistance + textPixels) - segmentLength;
                  i = (i + 1) % len;
                  segmentLength = segmentLengths[i];
                  segmentDistance = 0;
                  var start = transform(l[i]),
                      end = transform(l[i + 1]),
                      dx = end[0] - start[0],
                      dy = end[1] - start[1],
                      angle = Math.atan2(dy, dx);
                                    
                  // keep street names from going upside-down
                  if (flippedText) {
                    if (flippedMinus) {
                      angle -= Math.PI;
                    }
                    else {
                      angle += Math.PI;
                    }
                  }
                                    
                  this.restore();
                  this.save();
                  this.translate(start[0], start[1]);
                  this.rotate(angle);
                  textPixels = 0;
                  resetIndex = j;
                }
                  
                var textIndex = jLen - 1 - j;
                textPixels = this.measureText(fullText.slice(textIndex, jLen - resetIndex)).width;
                  
                text.text = fullText[textIndex];
                renderText.Point.call(this, text, [-(segmentOffset + textPixels), 0], true);
              }
              else {
                
                var textIndex = j;
                var textResetIndex = resetIndex;
                if (j > 0) {
                  textPixels = this.measureText(fullText.slice(resetIndex, j)).width;
                }
                  
                if (segmentOffset + segmentDistance + textPixels > segmentLength && (i < len - 1 || closedShape)) {
                  // TODO: Potentially add some spacing if the angle causes the text top to bend "in"
                  segmentOffset = (segmentOffset + segmentDistance + textPixels) - segmentLength;
                  i = (i + 1) % len;
                  segmentLength = segmentLengths[i];
                  segmentDistance = 0;
                  var start = transform(l[i]),
                      end = transform(l[i + 1]),
                      dx = end[0] - start[0],
                      dy = end[1] - start[1],
                      angle = Math.atan2(dy, dx);
                  
                  this.restore();
                  this.save();
                  this.translate(start[0], start[1]);
                  this.rotate(angle);
                  textPixels = 0;
                  resetIndex = j;
                }
              
                text.text = fullText[textIndex];
                renderText.Point.call(this, text, [segmentOffset + textPixels, 0], true);
              }
            }
          }
          else {
            renderText.Point.call(this, text, [0, 0], true);
          }
          
          this.restore();
          break;
        }
        segmentLengthsTotal += segmentLength;
      }
      
      // repair text object before returning
      text.text = fullText;
      text.offset.x = originalXOffset;
    }
    else {
      // put the point at the center
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      l.forEach(function(point) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      });
      return renderText.Point.call(this, text, [minX + (maxX - minX) / 2, minY + (maxY - minY) / 2])
    }
  },
  'MultiPoint': function(text, p, scale) {
    // Can't use forEach here because we need to pass scale along
    for (var i = 0, len = p.length; i < len; i++) {
      renderText.Point.call(this, radius, p[i], scale);
    }
  },
  'Point': function(text, p, preTransformed) {
    if (transform && !preTransformed) {
      p = transform(p);
    }
    var x = p[0] + (text.offset ? text.offset.x : 0);
    var y = p[1] + (text.offset ? text.offset.y : 0);
    var textMethod = text.stroke ? "strokeText" : "fillText";
    this[textMethod](text.text, x, y);
  }
};

// var didATile = false;
var cartoImageRenderer = function (ctx, scale, layers, styles, zoom, minX, maxX, minY) {
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
  
  // create list of attachments (in order) so that we can walk through and render them together for each layer
  // TODO: should be able to do this as part of the processing stage
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
              shouldMark = false,
              shouldPoint = false,
              shouldText = false,
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
            else if (key.indexOf("marker") === 0) {
              shouldMark = true;
            }
            else if (key === "point-file") {
              shouldPoint = true;
            }
            else if (key === "text-name") {
              shouldText = true;
            }
          }
          
          if (shouldFill || shouldStroke || shouldMark || shouldPoint || shouldText) {
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
            
            if (shouldMark) {
              if (instanceStyle["marker-file"]) {
                renderImage[shape.type].call(ctx, instanceStyle["marker-file"], coordinates);
              }
              else {
                // we only support the "ellipse" type
                // we only support circles, not ellipses right now :\
                var radius = instanceStyle["marker-width"] || instanceStyle["marker-height"];
                radius = (radius ? radius.value : 10) / 2;

                var shouldFillMarker = false;
                var shouldStrokeMarker = false;
                if (instanceStyle["marker-fill"]) {
                  ctx.fillStyle = instanceStyle["marker-fill"].toString();
                  shouldFillMarker = true;
                }
                if (instanceStyle["marker-line-color"]) {
                  ctx.strokeStyle = instanceStyle["marker-line-color"].toString();
                  shouldStrokeMarker = true;
                }
                if (instanceStyle["marker-line-width"]) {
                  var lineWidth = instanceStyle["marker-line-width"].value;
                  ctx.lineWidth = lineWidth;
                  shouldStrokeMarker = !!lineWidth;
                }
                
                ctx.beginPath();
                renderDot[shape.type].call(ctx, radius, coordinates);
                if (shouldFillMarker) {
                  ctx.fill();
                }
                if (shouldStrokeMarker) {
                  ctx.stroke();
                }
                ctx.closePath();
              }
            }
            
            if (shouldPoint && instanceStyle["point-file"]) {
              renderImage[shape.type].call(ctx, instanceStyle["point-file"], coordinates);
            }
            
            if (shouldText) {
              var text = instanceStyle["text-name"];
              if (text.is === "propertyLookup") {
                text = text.toString(feature);
              }
              
              if (text) {
                var textSize = (instanceStyle["text-size"] || "10").toString();
                var textFace = (instanceStyle["text-face-name"] || "sans-serif").toString();
                ctx.font = textSize + "px '" + textFace + "'";
                
                var textInfo = {
                  text: text
                };
                
                // offsetting
                textInfo.offset = {
                  x: instanceStyle["text-dx"] ? instanceStyle["text-dx"].value : 0,
                  y: instanceStyle["text-dy"] ? instanceStyle["text-dy"].value : 0
                };
                
                // vertical alignment
                var verticalAlign = instanceStyle["text-vertical-alignment"];
                if (verticalAlign && verticalAlign.value !== "auto") {
                  ctx.textBaseline = {
                    top: "top",
                    middle: "middle",
                    bottom: "alphabetic"
                  }[verticalAlign];
                }
                else {
                  ctx.textBaseline = textInfo.offset.y === 0 ? "middle" : (textInfo.offset.y < 0 ? "top" : "alphabetic");
                }
                
                // horizontal alignment
                var textHorizontalAlignment = instanceStyle["text-horizontal-alignment"];
                if (textHorizontalAlignment) {
                  ctx.textAlign = textHorizontalAlignment.toString();
                }
                else {
                  // default to center
                  ctx.textAlign = "center";
                }
                textInfo.align = ctx.textAlign;
                
                // text-transform
                var textTransform = instanceStyle["text-transform"];
                textTransform = textTransform && textTransform.toString();
                if (textTransform === "uppercase") {
                  textInfo.text = text.toUpperCase();
                }
                if (textTransform === "lowercase") {
                  textInfo.text = text.toLowerCase();
                }
                if (textTransform === "capitalize") {
                  textInfo.text = text.replace(/\b(\w)/g, function(match, character) {
                    return character.toUpperCase();
                  });
                }
                
                // text-placement
                var placement = instanceStyle["text-placement"];
                textInfo.placement = placement ? placement.toString() : "point";
                
                // TODO: text-placement-type (currently like "dummy")
                // TODO: text-align (this is alignment within the text *box*)
                // We don't have anything that generates a box right now, so we dont' support this
                
                if (instanceStyle["text-halo-fill"]) {
                  ctx.strokeStyle = instanceStyle["text-halo-fill"].toString();
                  if (instanceStyle["text-halo-radius"]) {
                    ctx.lineWidth = instanceStyle["text-halo-radius"].value * 2;
                  }
                  
                  // definitely DON'T leave this set to miter :P
                  ctx.lineJoin = "round";
                  textInfo.stroke = true;
                  renderText[shape.type].call(ctx, textInfo, coordinates);
                }
              
                if (instanceStyle["text-fill"]) {
                  ctx.fillStyle = instanceStyle["text-fill"].toString();
                }
                
                textInfo.stroke = false;
                renderText[shape.type].call(ctx, textInfo, coordinates);
              }
            }
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

exports.processStyles = function(styles, assetsPath) {
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
    
    var propertyMatcher = /^\[([^\]]+)\]$/;
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
              var imagePath = path.join(assetsPath, stringValue);
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
        
        if (rule.name === "text-name") {
          var value = rule.value.toString();
          var propertyMatch = value.match(propertyMatcher);
          if (propertyMatch) {
            rule.value = {
              is: 'propertyLookup',
              property: propertyMatch[1],
              toString: function(feature) {
                return feature ? feature.properties[this.property] : this.property;
              }
            };
          }
          else {
            rule.value = value;
          }
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
