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
  
  it('should draw markers', function(done) {
    var style = '#data {\
      marker-fill: #ff530d;\
      marker-line-color: #fff;\
      marker-width: 8;\
      marker-line-width: 2;\
      marker-allow-overlap: true;\
    }';
    var data = {
      "type": "FeatureCollection",                                
      "features": [
        { "type": "Feature", "properties": { "DC_NUM": "014848", "DC_KEY": "201001014848", "LOCATION_B": "2100 BLOCK S BROAD ST", "THEFT_DATE": "2010\/04\/16", "THEFT_YEAR": 2010, "DC_DIST": 1, "STOLEN_VAL": 150, "THEFT_HOUR": 0, "UCR": 625, "LAT": 39.9242733, "LNG": -75.169775454 }, "geometry": { "type": "Point", "coordinates": [ -75.169775453999989, 39.924273321000044 ] } },
        { "type": "Feature", "properties": { "DC_NUM": "016330", "DC_KEY": "201001016330", "LOCATION_B": "S 2100 MCKEAN ST", "THEFT_DATE": "2010\/04\/24", "THEFT_YEAR": 2010, "DC_DIST": 1, "STOLEN_VAL": 215, "THEFT_HOUR": 17, "UCR": 615, "LAT": 39.9270745, "LNG": -75.180905401 }, "geometry": { "type": "Point", "coordinates": [ -75.180905400999961, 39.927074527000059 ] } },
        { "type": "Feature", "properties": { "DC_NUM": "023568", "DC_KEY": "201001023568", "LOCATION_B": "2700 BLOCK SNYDER AVE", "THEFT_DATE": "2010\/06\/06", "THEFT_YEAR": 2010, "DC_DIST": 1, "STOLEN_VAL": 120, "THEFT_HOUR": 11, "UCR": 625, "LAT": 39.9271197, "LNG": -75.191034151 }, "geometry": { "type": "Point", "coordinates": [ -75.19103415099994, 39.927119746000074 ] } },
        { "type": "Feature", "properties": { "DC_NUM": "028556", "DC_KEY": "201001028556", "LOCATION_B": "2100 BLOCK S GARNET ST", "THEFT_DATE": "2010\/07\/08", "THEFT_YEAR": 2010, "DC_DIST": 1, "STOLEN_VAL": 200, "THEFT_HOUR": 15, "UCR": 615, "LAT": 39.9254113, "LNG": -75.178257356 }, "geometry": { "type": "Point", "coordinates": [ -75.178257355999961, 39.925411335000035 ] } },
        { "type": "Feature", "properties": { "DC_NUM": "029047", "DC_KEY": "201001029047", "LOCATION_B": "2100 BLOCK S 15TH ST", "THEFT_DATE": "2010\/07\/11", "THEFT_YEAR": 2010, "DC_DIST": 1, "STOLEN_VAL": 75, "THEFT_HOUR": 11, "UCR": 625, "LAT": 39.9241409, "LNG": -75.171456936 }, "geometry": { "type": "Point", "coordinates": [ -75.17145693599997, 39.924140875000035 ] } }
      ]
    };
    var bounds = projector.util.tileToMeters(1192, 1551, 12);
    
    expect(style).to.have.length(151);
    
    var map = new nodetiles.Map();
    map.addStyle(style);
    map.addData({
      sourceName: "data", // for the stylesheet to use
      getShapes: function(minX, minY, maxX, maxY, mapProjection) {
        return projector.project[data.type]("EPSG:4326", mapProjection, data);
      }
    });
    
    console.log("\nbounds:", bounds);
  
    map.render({
      bounds: {minX: bounds[0], minY: bounds[1], maxX: bounds[2], maxY: bounds[3]},
      width: 256,
      height: 256,
      zoom: 12,
      callback: function(err, result) {
        result.createPNGStream().pipe(fs.createWriteStream(__dirname + '/markers.output.png'));
        var expectedImage = new Canvas.Image();
        expectedImage.src = fs.readFileSync(__dirname + '/markers.expected.png');
        // expect(imagediff.equal(result, expectedImage, 100)).to.be.true;
        
        // reproduce test logic
        var tmpCanvas = new Canvas(expectedImage.width, expectedImage.height),
            ctx = tmpCanvas.getContext('2d');
        ctx.drawImage(expectedImage, 0, 0, expectedImage.width, expectedImage.height);
        var aData = ctx.getImageData(0, 0, expectedImage.width, expectedImage.height).data;
        var bData = result.getContext('2d').getImageData(0, 0, expectedImage.width, expectedImage.height).data;
        var width = 256;
        var i, j;
        for (i = 0; i < aData.length; i += 4) {
          for (j = 0; j < 4; j++) {
            var index = i + j;
            if (aData[index] !== bData[index]) {
              var col = (i / 4) % 256;
              var row = Math.floor((i / 4) / 256);
              console.log("Diff at " + col + ", " + row + " channel ", j, "=", aData[index], "vs.", bData[index]);
            }
          }
        }
        // for (var i = aData.length; i--;) {
        //   if (aData[i] !== bData[i]) {
        //     console.log("Diff at ", i, "=", Math.abs(aData[i] - bData[i]));
        //   }
        // }
        
        // real test
        expect(imagediff.equal(result, tmpCanvas, 100)).to.be.true;
        done();
      }
    });
  });
  
});
