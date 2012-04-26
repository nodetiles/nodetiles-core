/**
 *  Returns a UTFGrid.
 *   
 *  Usage: 
 *    var gridJSON = UTFGrid.generate(64, function(coord) {
 *      // lookup the color at point coord in image
 *      // lookup feature associated with color
 *      // return feature
 *    });
 *
 *  eg. the delegate function should return a feature 
 *      when passed a {x: x, y: y} object
 *
 *  Credit: Rob Brackett (mr0grog)   
 */

var UTFGrid = function (size, delegate) {
  this.size = size;
  this.delegate = delegate;
  this._features = [];
  this._codePoints = {};
  this._lastCodePoint = 32;
};

UTFGrid.generate = function(size, delegate) {
  return (new UTFGrid(size, delegate)).encode();
};

UTFGrid.prototype = {
  constructor: UTFGrid,
  
  encode: function() {
    return JSON.stringify(this.encodeAsObject());
  },
  
  encodeAsObject: function() {
    var grid = {
      grid: [],
      keys: [""],
      data: {}
    };
    
    for (var y = 0; y < this.size; y++) {
      var gridRow = "";
      for (var x = 0; x < this.size; x++) {
        var feature = this.delegate({x: x, y: y});
        if (feature) {
          var id = this._features.indexOf(feature);
          if (id === -1) {
            id = this._features.push(feature) - 1;

            grid.keys.push(id.toString(10));
            grid.data[id] = feature;
          }
          
          gridRow += String.fromCharCode(this._codePointForId(id));
        }
        else {
          gridRow += " ";
        }
      }
      grid.grid.push(gridRow);
    }
    
    return grid;
  },
  
  _codePointForId: function(id) {
    if (!this._codePoints[id]) {
      // Skip '"' and '\'
      var codePoint = ++this._lastCodePoint;
      if (codePoint === 34 || codePoint === 92) {
        codePoint += 1;
        this._lastCodePoint += 1;
      }
      
      this._codePoints[id] = codePoint;
    }
    return this._codePoints[id];
  }
};

module.exports = UTFGrid;