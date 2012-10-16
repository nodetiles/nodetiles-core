var expect = require('chai').expect;
var sinon = require('sinon');
var projector = require(__dirname + '/../index').projector;

// THIS IS THE CORRECT DATA
// Requested tile: 12/654/1584
// 
// Spherical Mercator (meters):
// -13638811.83098057 4529964.044292685
// -13629027.891360067 4539747.983913187
// 
// WGS84 datum (longitude/latitude):
// -122.51953125 37.64903402157866
// -122.431640625 37.71859032558813

describe('Projector', function() {
  describe('utils', function() {
    it('Can correctly convert from Tiles to Spherical Mercator (meters)', function(done) {
      var tile = [12, 654, 1584];
      var metersCorrect = [
      -13638811.83098057, 4529964.044292685,
      -13629027.891360067, 4539747.983913187
      ]
      var outputMeters = projector.util.tileToMeters(tile[1], tile[2], tile[0]);

    expect(outputMeters[0]).to.equal(metersCorrect[0], 'should calculate minX');
    expect(outputMeters[1]).to.equal(metersCorrect[1], 'should calculate minY');
    expect(outputMeters[2]).to.equal(metersCorrect[2], 'should calculate maxX');
    expect(outputMeters[3]).to.equal(metersCorrect[3], 'should calculate maxY');
    done();
    });

    it('Can correctly convert from Tiles to Spherical Mercator (meters), zoom 14', function(done) {
      var tile = [14, 2617, 6333];
      var metersCorrect = [
      -13636365.846075444, 4544639.953723438,
      -13633919.861170318, 4547085.9386285655
      ]
      var outputMeters = projector.util.tileToMeters(tile[1], tile[2], tile[0]);

    expect(outputMeters[0]).to.equal(metersCorrect[0], 'should calculate minX');
    expect(outputMeters[1]).to.equal(metersCorrect[1], 'should calculate minY');
    expect(outputMeters[2]).to.equal(metersCorrect[2], 'should calculate maxX');
    expect(outputMeters[3]).to.equal(metersCorrect[3], 'should calculate maxY');
    done();
    })

    it('Can correctly convert from Tiles to Spherical Mercator (meters), zoom 13', function(done) {
      var tile = [13, 1308, 3166];
      var metersCorrect = [
      -13638811.83098057, 4544639.953723438,
      -13633919.861170318, 4549531.923533689
      ]
      var outputMeters = projector.util.tileToMeters(tile[1], tile[2], tile[0]);

    expect(outputMeters[0]).to.equal(metersCorrect[0], 'should calculate minX');
    expect(outputMeters[1]).to.equal(metersCorrect[1], 'should calculate minY');
    expect(outputMeters[2]).to.equal(metersCorrect[2], 'should calculate maxX');
    expect(outputMeters[3]).to.equal(metersCorrect[3], 'should calculate maxY');
    done();
    })
  });
  
  describe("project (proj4)", function() {
    it('Point: converts a from lat/lon to spherical mercator meters', function(done) {
      var c = [-122.51953125, 37.75334401310656];
      var metersCorrect = [-13638811.83098057, 4544639.953723437]; // or 438?

      var projected = projector.project.Point("EPSG:4326","EPSG:900913", c);
      expect(projected[0]).to.equal(metersCorrect[0], 'should calculate x');
      expect(projected[1]).to.equal(metersCorrect[1], 'should calculate y');
      done();
    });
    it('Feature: converts polygon from lat/lon to spherical mercator meters', function(done) {
      var feature = {
        name: "Sunset",
        geometry: { 
          "type": "Polygon", 
          "coordinates": [
           [ [-122.494142, 37.771126],
            [-122.473210, 37.768930],
            [-122.505069, 37.75324],
            [-122.468151, 37.763694] ]
          ]
        }
      };
      var expectedFeature = {
        name: "Sunset",
        geometry: { 
          "type": "Polygon", 
          "coordinates": [
           [ [-13635985.512598947, 4547143.855632217],
            [-13633655.37301766, 4546834.601778074],
            [-13637201.900674844, 4544625.309289526],
            [-13633092.207713738, 4546097.273993165] ]
          ]
        }
      };
      var projected = projector.project.Feature("EPSG:4326","EPSG:900913", feature);
      expect(projected).to.deep.equal(expectedFeature, 'should calculate x');
      done();
    });
  });
});
