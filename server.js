// Basic configuration
var PORT = process.env.PORT || process.argv[2] || 3000;
var DEBUG = true;


// Script
var path = require('path');
var http = require('http');
var fs = require('fs');
var Connect = require('connect');
var Express = require('express');
var projector = require('./projector');
var tileRenderer = require('./tileRenderer');
var Map = require('./lib/Map');

// App configuration
var app = Express();
app.use(Connect.compress());

// initialize
function Layer(filename, styles) {
    var data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    data.styles = styles;
    return data;
};

console.log("Loading layers...");
var start = Date.now();
var layers = [ 
    Layer('./geodata/sf_shore.json', [ { fillStyle: '#ffffee', strokeStyle: '#888', lineWidth: 1.0 } ]),
    Layer('./geodata/sf_parks.json', [ { fillStyle: 'rgba(0,255,0,.5)', strokeStyle: 'rgba(255,255,255, .5)', lineWidth: 1.0 } ]),
    Layer('./geodata/sf_streets.json', [ { strokeStyle: 'rgba(0,0,0,.8)', lineWidth: 1.0 } ])
];
console.log("Loaded in " + (Date.now() - start) + "ms");
console.log("Projecting features...");
start = Date.now();
layers.forEach(projector.project.FeatureCollection);
console.log("Projected in " + (Date.now() - start) + "ms");

// just use one map for everything
var map = new Map();
map.addData(function() { return layers });


// views
app.get('/', function(req, res) {
  res.sendfile('./views/leaflet.html');
});
app.get('/sf_tile.jsonp', function(req, res) {
  res.sendfile('./views/sf_tile.jsonp');
});

// tile/grid rendering routes
// app.get('/tiles/:zoom/:col/:row', tile);
// app.get('/utfgrids/:zoom/:col/:row', utfgrid);



// simple default utility server
// app.get('/tiles/:zoom/:col/:row', TileServer.getTile);
app.get('/tiles/:zoom/:col/:row', function tile(req, res) {
  // TODO: clean this up since it's halfway to Express
  // TODO: handle no extension and non-png extensions
  // verify arguments
  var tileCoordinate = [req.params.zoom, req.params.col, path.basename(req.params.row, '.png')];
  if (!tileCoordinate || tileCoordinate.length != 3) {
      console.error(req.url, 'not a coordinate, match =', tileCoordinate);
      res.writeHead(404);
      res.end();
      return;
  }
  
  console.log('Requested tile: ' + tileCoordinate.join('/'));
  
  tileCoordinate = tileCoordinate.map(Number);
  
  // turn tile coordinates into lat/longs
  // TODO: custom TileMap class or tools for this
  var scale = Math.pow(2, tileCoordinate[0]);
  var minX = 256 * tileCoordinate[1] / scale;
  var minY = 256 * tileCoordinate[2] / scale;
  var maxX = minX + 256 / scale;
  var maxY = minY + 256 / scale;
  
  map.render(minX, minY, maxX, maxY, 256, 256, function(error, canvas) {
    var stream = canvas.createPNGStream();
    stream.pipe(res);
  });
});

// app.get('/utfgrids/:zoom/:col/:row', utfgrid);
app.get('/utfgrids/:zoom/:col/:row.:format?', function utfgrid(req, res) {
  console.log(req.params);
  // TODO: clean this up since it's halfway to Express
  // TODO: handle no extension and non-png extensions
  // verify arguments
  var tileCoordinate = [req.params.zoom, req.params.col, req.params.row];
  if (!tileCoordinate || tileCoordinate.length != 3) {
      console.error(req.url, 'not a coordinate, match =', tileCoordinate);
      res.writeHead(404);
      res.end();
      return;
  }
  
  console.log('Requested tile: ' + tileCoordinate.join('/'));
  
  tileCoordinate = tileCoordinate.map(Number);
  var respondWithImage = req.params.format === 'png';
  var renderHandler;
  
  if (respondWithImage) {
    renderHandler = function(err, canvas) {
      var stream = canvas.createPNGStream();
      stream.pipe(res);
    };
  }
  else {
    renderHandler = function(err, grid) {
      // TODO: "grid()" shouldn't be hardcoded (should be value of "callback" param)
      res.send('grid(' + JSON.stringify(grid) + ')', { 'Content-Type': 'application/json' }, 200);
    };
  }
  tileRenderer.renderGrid(tileCoordinate[0], tileCoordinate[1], tileCoordinate[2], layers, renderHandler, respondWithImage);
});












// ...and go!
app.listen(PORT);