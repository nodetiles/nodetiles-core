var expect = require('chai').expect;
var sinon = require('sinon');
var projector = require(__dirname + '/../projector');

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

describe('Projector tools', function() {
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
  })
});
    
