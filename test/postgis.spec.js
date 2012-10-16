var expect = require('chai').expect;
var sinon = require('sinon');
var pg    = require('pg').native;
var PostGISSource = require(__dirname + '/../datasources/PostGIS');

var async = require('async');
var __ = require('lodash')


var source = new PostGISSource({
  connectionString: process.env.DATABASE_URL || "tcp://postgres@localhost/postgis", //required
  tableName: "rpd_parks", // required
  geomField: "wkb_geometry", // required
  fields: "map_park_n, ogc_fid", //faster if you specify fields, but optional
  name: "sf_parks", // optional, defaults to table name
  projection: "EPSG:4326" // Lat/Long
});

describe('PostGIS Data Source', function() {
  describe('Projects between a Web Mercator (meters) Map and a Lat/Lon PostGIS data source', function() {
    /**
     * Test values taken from: http://www.maptiler.org/google-maps-coordinates-tile-bounds-projection/
     */
    
    // Describe the bounding box of the map tile
    var min = [-13638811.83098057, 4539747.983913187];
    var max = [-13629027.891360067, 4549531.923533689];
    var mapProjection = "EPSG:900913" // web mercator
    
    // stub the PostGres connection and client so it never fires
    var rows = [ 
      {
        id: 1,
        name: "Point: Spreckels Lake (Northwest)",
        geometry: JSON.stringify({ "type": "Point", "coordinates": [-122.494142, 37.771126] }), // Long/Lat!
      }, 
      {
        id: 2,
        name: "Point: Stow Lake (Northeast)",
        geometry: JSON.stringify({ "type": "Point", "coordinates": [-122.473210, 37.768930] }),
      }, 
      {
        id: 3,
        name: "Point: Devils Teeth Bakery (Southwest)",
        geometry: JSON.stringify({ "type": "Point", "coordinates": [-122.505069, 37.75324] }),
      },
      {
        id: 4,
        name: "Point: Manna Korean Restuarant(Southeast)",
        geometry: JSON.stringify({ "type": "Point", "coordinates": [-122.468151, 37.763694] }),
      }, 
      {
        id: 5,
        name: "Polygon: Sunset (Polygon)",
        geometry: JSON.stringify({ "type": "Polygon", "coordinates": [
         [ [-122.494142, 37.771126],
          [-122.473210, 37.768930],
          [-122.505069, 37.75324],
          [-122.468151, 37.763694] ]
        ]}),
      }
    ];
    var querySpy = sinon.stub().yields(null, { rows: rows })
    var pgStub = sinon.stub(pg, 'connect').yields(null, { query: querySpy });
    var shapes = {}; // to store our features
    
    before(function(done) {
      // Make our call to datasource.getShapes
      source.getShapes(min[0], min[1], max[0], max[1], mapProjection, function(err, results) {
        // can look at the initial query in the querySpy
        shapes = results; // what we got back from the datasource
        done();
      });
    });
        
    it('Projects/transforms the bounding box (in the Map\'s projection), into the projecion of the datasource', function(done){
      var bbDatasource = querySpy.args[0][1];
      expect(bbDatasource[0]).to.closeTo(-122.51953125000001, "should project minX"); // <-- not sure why so many significant digits 
      expect(bbDatasource[1]).to.closeTo(37.71859032558813, "should project minY");
      expect(bbDatasource[2]).to.closeTo(-122.431640625, "should project maxX");
      expect(bbDatasource[3]).to.closeTo(37.78808138412046, (0.1*10), "should project maxY"); // <-- weird rounding on this guy
      done();
    });
    describe('Retrieves rows as GeoJsonand Projects/transforms from the datasource projection to the map\s', function() {
      
      it("Correctly sets GeoJson properties", function(done) {
        var point = shapes.features[0];
        expect(point.properties.id).to.equal(1);
        expect(point.properties.name).to.equal('Point: Spreckels Lake (Northwest)');
        done()
      });
      
      it("Correctly transforms a point", function(done) {
        var point = shapes.features[0];
        var geometry = point.geometry;
        
        expect(geometry.coordinates[0]).to.equal(-13635985.512598947);
        expect(geometry.coordinates[1]).to.equal(4547143.855632217);
        done();
      });
      
      it("Correctly transforms a polygon", function(done) {
        var polygon = shapes.features[4];
        var geometry = polygon.geometry;
        
        expect(geometry.coordinates[0][0][0]).to.equal(-13635985.512598947);
        expect(geometry.coordinates[0][0][1]).to.equal(4547143.855632217);
        done();
      });
    })
  });
});