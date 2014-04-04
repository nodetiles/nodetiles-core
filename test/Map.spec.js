var expect = require("chai").expect;
var sinon = require("sinon");
var Map = require(__dirname + '/../index').Map;

describe("Map", function() {
  
  describe("bounds buffering", function() {
    
    it("should default to 25%", function() {
      var data = sinon.stub().returns([]);
      var map = new Map();
      map.addData(data);
      map.addStyle("Map { background-color: #999; }");
      map.render({
        bounds: {minX: 0, minY: 0, maxX: 10, maxY: 10},
        width: 256,
        height: 256,
        zoom: 10
      });
      expect(data.calledWith(-2.5, -2.5, 12.5, 12.5)).to.be.true;
    });
    
    it("should accept a custom value per map", function() {
      var data = sinon.stub().returns([]);
      var map = new Map({
        boundsBuffer: 0.5
      });
      map.addData(data);
      map.addStyle("Map { background-color: #999; }");
      map.render({
        bounds: {minX: 0, minY: 0, maxX: 10, maxY: 10},
        width: 256,
        height: 256,
        zoom: 10
      });
      expect(data.calledWith(-5, -5, 15, 15)).to.be.true;
    });
    
    it("should accept a custom function per map", function() {
      var data = sinon.stub().returns([]);
      var map = new Map({
        boundsBuffer: function() {
          return {minX: -1, minY: 1, maxX: 12, maxY: 9};
        }
      });
      map.addData(data);
      map.addStyle("Map { background-color: #999; }");
      map.render({
        bounds: {minX: 0, minY: 0, maxX: 10, maxY: 10},
        width: 256,
        height: 256,
        zoom: 10
      });
      expect(data.calledWith(-1, 1, 12, 9)).to.be.true;
    });
    
    it("should accept a custom value per render", function() {
      var data = sinon.stub().returns([]);
      var map = new Map({
        boundsBuffer: 0.5
      });
      map.addData(data);
      map.addStyle("Map { background-color: #999; }");
      map.render({
        bounds: {minX: 0, minY: 0, maxX: 10, maxY: 10},
        width: 256,
        height: 256,
        zoom: 10,
        boundsBuffer: 0.1
      });
      expect(data.calledWith(-1, -1, 11, 11)).to.be.true;
    });
    
    it("should accept a custom function per render", function() {
      var data = sinon.stub().returns([]);
      var map = new Map({
        boundsBuffer: 0.5
      });
      map.addData(data);
      map.addStyle("Map { background-color: #999; }");
      map.render({
        bounds: {minX: 0, minY: 0, maxX: 10, maxY: 10},
        width: 256,
        height: 256,
        zoom: 10,
        boundsBuffer: function() {
          return {minX: -1, minY: 1, maxX: 12, maxY: 9};
        }
      });
      expect(data.calledWith(-1, 1, 12, 9)).to.be.true;
    });
    
    it("should be able to be 0", function() {
      var data = sinon.stub().returns([]);
      var map = new Map({
        boundsBuffer: 0
      });
      map.addData(data);
      map.addStyle("Map { background-color: #999; }");
      map.render({
        bounds: {minX: 0, minY: 0, maxX: 10, maxY: 10},
        width: 256,
        height: 256,
        zoom: 10
      });
      expect(data.calledWith(0, 0, 10, 10)).to.be.true;
    });
    
  });
  
});
