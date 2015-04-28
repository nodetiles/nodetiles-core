// test tools
var expect = require('chai').expect;
var sinon = require('sinon');
var imagediff = require('imagediff');
var fs = require('fs');
var Canvas = require('canvas');
// lib
var nodetiles = require('../index');
var projector = nodetiles.projector;

describe('cartoRenderer', function() {
  
  simpleTest('markers');
  
  /**
   * Runs a simple test of the renderer against supplied data, styles, and
   * an expected rendered result. Given a name, it will read:
   *   - cartoRenderer/name.json (data)
   *   - cartoRenderer/name.mss  (carto stylesheet)
   *   - cartoRenderer/name.png  (expected result)
   */
  function simpleTest(name) {
    it(name, function(done) {
      var base = __dirname + '/cartoRenderer/' + name;
      var style = fs.readFileSync(base + '.mss', 'utf-8');
      var data = JSON.parse(fs.readFileSync(base + '.json'));
      var bounds = data.bounds;
      if (data.tile) {
        var extents = projector.util.tileToMeters(data.tile.x, data.tile.y, data.tile.z);
        bounds = {
          minX: extents[0],
          minY: extents[1],
          maxX: extents[2],
          maxY: extents[3]
        };
      }
      
      var map = new nodetiles.Map();
      map.addStyle(style);
      map.addData({
        sourceName: "data", // for the stylesheet to use
        getShapes: function(minX, minY, maxX, maxY, mapProjection) {
          return projector.project[data.type]("EPSG:4326", mapProjection, data);
        }
      });
  
      map.render({
        bounds: bounds,
        width: 256,
        height: 256,
        zoom: data.tile ? data.tile.z : 1,
        callback: function(err, result) {
          var expectedImage = new Canvas.Image();
          expectedImage.src = fs.readFileSync(base + '.png');
          var expectedCanvas = new Canvas(expectedImage.width, expectedImage.height);
          var ctx = expectedCanvas.getContext('2d');
          ctx.drawImage(expectedImage, 0, 0, expectedImage.width, expectedImage.height);
        
          // real test
          expect(imagediff.equal(result, expectedCanvas, 20)).to.be.true;
          done();
        }
      });
    });
  }
  
});
