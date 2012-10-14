var expect = require('chai').expect;
var sinon = require('sinon');
var pg    = require('pg');
var PostGISSource = require(__dirname + '/../datasources/PostGIS');

var async = require('async');
var __ = require('lodash')


var source = new PostGISSource({
  connectionString: process.env.DATABASE_URL || "tcp://postgres@localhost/postgis", //required
  tableName: "rpd_parks", // required
  geomField: "wkb_geometry", // required
  fields: "map_park_n, ogc_fid", //faster if you specify fields, but optional
  name: "sf_parks" // optional, defaults to table name
});


describe('PostGIS Data Source', function() {
  describe('Projector function', function() {
    
    // stub the PostGres connection and client so it never fires
    var result = [ {key: "value"}, {key: "value2"} ];
    var clientSpy = sinon.stub().yields(null, result);
    var pgStub = sinon.stub(pg, 'connect').yields(null, clientSpy);
    
    it('should data values', function(done){
      source.getShapes(0,0,0,0,4326, function(err, features) {
        done();
      });
    });
  });
});