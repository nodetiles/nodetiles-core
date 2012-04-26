// node.js geo polygon map tile rendering!
// requires https://github.com/learnboost/node-canvas and GeoJSON data files
// e.g. 
// data from naturalearthdata.com converted to GeoJSON with GDAL's ogr2ogr
// or from datasf.org, reprojected too:
// ogr2ogr -f GeoJSON sfbay.js sfbay.shp -t_srs EPSG:4326

var Canvas = require('canvas'),
    Express = require('express'),
    path = require('path'),
    http = require('http'),
    fs = require('fs');
    
var port = process.env.PORT || 3000
    
var project = {
    'FeatureCollection': function(fc) { fc.features.forEach(project.Feature); },
    'Feature': function(f) { project[f.geometry.type](f.geometry.coordinates); },
    'MultiPolygon': function(mp) { mp.forEach(project.Polygon); },    
    'Polygon': function(p) { p.forEach(project.LineString); },
    'MultiLineString': function(ml) { ml.forEach(project.LineString); },
    'LineString': function(l) { l.forEach(project.Point); },
    'MultiPoint': function(mp) { mp.forEach(project.Point); },    
    'Point': function(c) {
        c[0] = 256.0 * (c[0] + 180) / 360.0;
        c[1] = 256.0 - 256.0 * (Math.PI + Math.log(Math.tan(Math.PI/4+c[1]*(Math.PI/180)/2))) / (2*Math.PI);
    }
}

function Layer(filename, styles) {
    var data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    data.styles = styles;
    return data;
}

var bgColor = '#ddddff'; //'#ddddff';

console.log('loading layers...');
var layers = [ 
    //Layer('./geodata/10m_land.json', [ { fillStyle: '#ffffee', strokeStyle: '#888', lineWidth: 1.0 } ]),
    //Layer('./geodata/baltimore-boundaries.json', [ { fillStyle: 'rgba(0,0,0,.5)', strokeStyle: 'rgba(255,255,255,.8)', lineWidth: 1.0 } ]),
    //Layer('./geodata/sf_parcels.json', [ { fillStyle: 'rgba(0,0,0,.5)', strokeStyle: 'rgba(255,255,255,.8)', lineWidth: 1.0 } ]),
    //Layer('./geodata/10m_land.json', [ { fillStyle: '#ffffee', strokeStyle: '#888', lineWidth: 1.0 } ]),
    Layer('./geodata/sf_shore.json', [ { fillStyle: '#ffffee', strokeStyle: '#888', lineWidth: 1.0 } ]),
    Layer('./geodata/sf_streets.json', [ { fillStyle: 'rgba(0,0,0,0)', strokeStyle: 'rgba(0,0,0,1)', lineWidth: 1.0 } ]),
    Layer('./geodata/sf_parks.json', [ { fillStyle: 'rgba(0,255,0,.5)', strokeStyle: 'rgba(255,255,255,.2)', lineWidth: 1.0 } ]),
    //Layer('./geodata/sf_elect_precincts.json', [ { fillStyle: 'rgba(255,255,255, .5)', strokeStyle: 'rgba(0,0,0,.5)', lineWidth: 1.0 } ]),
    
    //Layer('./datasf/sflnds_parks.js', [ { fillStyle: '#ddffdd' } ]),
    //Layer('./datasf/phys_waterbodies.js', [ { fillStyle: '#ddddff' } ]),
    //Layer('./datasf/StClines.js', [ { strokeStyle: '#aaa', lineWidth: 1.0 } ])
];
/*var layers = [
    Layer('./naturalearthdata/10m_land.js', [ { fillStyle: '#ffffee' } ]),
    Layer('./naturalearthdata/10m_glaciated_areas.js', [ { fillStyle: '#ffffff' } ]),
    Layer('./naturalearthdata/10m_rivers_lake_centerlines.js', [ { strokeStyle: '#ddddff' } ]),
    Layer('./naturalearthdata/10m_lakes.js', [ { fillStyle: '#ddddff' } ]),
    Layer('./naturalearthdata/10m_us_parks_area.js', [ { fillStyle: '#ddffdd' } ]),
    Layer('./naturalearthdata/10m-urban-area.js', [ { fillStyle: '#eeeedd' } ]),
    Layer('./naturalearthdata/10m_railroads.js', [ { strokeStyle: '#777777' } ]),
    Layer('./naturalearthdata/10m_roads.js', [ { strokeStyle: '#aa8888' } ])
// TODO more boundaries from http://www.naturalearthdata.com/downloads/10m-cultural-vectors/
//    Layer('./naturalearthdata/10m_geography_regions_polys.js', [ { strokeStyle: 'rgba(0,0,0,0.2)' } ]),    
//    Layer('./naturalearthdata/10m_populated_places_simple.js', [ { fillStyle: '#ffffee' } ]),
//    Layer('./naturalearthdata/10m_roads_north_america.js', [ { strokeStyle: '#888888' } ])
];*/
console.log('done loading');

console.log('projecting features...');
var t = +new Date
layers.forEach(project.FeatureCollection);
console.log('done projecting in', new Date - t, 'ms'); 

var canvasBacklog = 0;

function tile(req, res) {

    var d = new Date();
    
    // TODO: clean this up since it's halfway to Express
    var coord = [req.params.zoom, req.params.col, path.basename(req.params.row, '.png')];
    if (!coord || coord.length != 3) {
        console.error(req.url, 'not a coord, match =', coord);
        res.writeHead(404);
        res.end();
        return;
    }
    
    console.log('Requested tile: ' + coord.join('/'));
    var done = false;
    setTimeout(function () {
      if (!done) {
        console.log('!!! Tile ' + coord.join('/') + ' didn\'t finish in 10s!');
      }
    }, 1000 * 10);
    
    coord = coord.map(Number);
    //console.log('got coord', coord);

    var canvas = new Canvas(256,256),
        ctx = canvas.getContext('2d');
    canvasBacklog++;
    
    //ctx.antialias = 'none';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0,0,256,256);
    
    renderData(ctx, coord[0], coord[1], coord[2]);

    console.log('rendering done in', new Date - d, 'ms');
    d = new Date();
    
    res.writeHead(200, {'Content-Type': 'image/png'});    
    var stream = canvas.createPNGStream(); // createSyncPNGStream(); 
    stream.on('data', function(chunk){
        res.write(chunk);
    });
    stream.on('end', function() {
        console.log('Tile streaming done in', new Date - d, 'ms');
        res.end();
        console.log('Returned tile: ' + coord.join('/') + '['+ --canvasBacklog +' more in backlog]');
        done = true;
    });
    stream.on('close', function() {
        console.log("STREAM CLOSED");
    });
}

// NB:- these functions are called using 'this' as our canvas context
// it's not clear to me whether this architecture is right but it's neat ATM.
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
        this.moveTo(l[0][0], l[0][1]);
        l.slice(1).forEach(function(c){
            this.lineTo(c[0], c[1]);
        }, this);
    },
    'MultiPoint': function(p) {
        console.warn('MultiPoint geometry not implemented in renderPath');
    },
    'Point': function(p) {
        console.warn('Point geometry not implemented in renderPath');
    }
};

function renderData(ctx, zoom, col, row) {
    var sc = Math.pow(2, zoom);
    ctx.scale(sc,sc);
    ctx.translate(-col*256/sc, -row*256/sc);
    layers.forEach(function(layer, i) {
        layer.styles.forEach(function(style) {
            ctx.fillStyle = style.fillStyle || '';
            ctx.strokeStyle = style.strokeStyle || '';
            ctx.lineWidth = 'lineWidth' in style ? style.lineWidth / sc : 1.0 / sc;
            layer.features.forEach(function(feature) {
                ctx.beginPath();
                var coordinates = feature.geometry.coordinates;
                renderPath[feature.geometry.type].call(ctx, coordinates);
                if (style.fillStyle) {
                    ctx.fill();
                }
                if (style.strokeStyle) {
                    ctx.stroke();
                }
            });
        });
    });
}

function utfgrid(req, res) {

    var d = new Date();
    
    // TODO: clean this up since it's halfway to Express
    var coord = [req.params.zoom, req.params.col, path.basename(req.params.row, '.png')];
    console.log(coord);
    if (!coord || coord.length != 3) {
        console.error(req.url, 'not a coord, match =', coord);
        res.writeHead(404);
        res.end();
        return;
    }
    
    var done = false;
    
    coord = coord.map(Number);
    //console.log('got coord', coord);


    var canvas = new Canvas(256,256),
        ctx    = canvas.getContext('2d');
    
    ctx.antialias = 'none';
    // Don't fill the tile
    // ctx.fillStyle = bgColor;
    // ctx.fillRect(0,0,256,256);
    
    renderGrid(ctx, coord[0], coord[1], coord[2]);

    console.log('Grid rendering done in', new Date - d, 'ms');
    d = new Date();
    
    readGrid(ctx);

    
    
    // res.writeHead(200, {'Content-Type': 'text/json'});    
    //res.send('Test');
    
    res.writeHead(200, {'Content-Type': 'image/png'});    
    var stream = canvas.createPNGStream(); // createSyncPNGStream(); 
    stream.on('data', function(chunk){
        res.write(chunk);
    });
    stream.on('end', function() {
        console.log('Tile streaming done in', new Date - d, 'ms');
        res.end();
        console.log('Returned tile: ' + coord.join('/'));
        done = true;
    });
    stream.on('close', function() {
        console.log("STREAM CLOSED");
    });
    
    
    //console.log('Grid streaming done in', new Date - d, 'ms');
    
}

function renderGrid(ctx, zoom, col, row) {
  var intColor = 0;

  var sc = Math.pow(2, zoom);
  ctx.scale(sc,sc);
  ctx.translate(-col*256/sc, -row*256/sc);
  layers.forEach(function(layer, i) {
    layer.styles.forEach(function(style) {
        ctx.lineWidth = 'lineWidth' in style ? style.lineWidth / sc : 1.0 / sc;
        layer.features.forEach(function(feature) {
          ctx.fillStyle = style.fillStyle ? '#'+d2h(intColor, 8) : ''; // only fill in if we have a style defined
          ctx.strokeStyle = style.strokeStyle ? '#'+d2h(intColor, 8) : '';
          
          ctx.beginPath();
          var coordinates = feature.geometry.coordinates;
          renderPath[feature.geometry.type].call(ctx, coordinates);
          if (ctx.fillStyle) {
            ctx.fill();
          }
          if (ctx.strokeStyle) {
            ctx.stroke();
          }
          intColor++; // Go on to the next color;
        });
    });
  });
}

function readGrid(ctx) {
  var intColor = 0;
  var colorGrid = {};
  
  // generate our colors
  layers.forEach(function(layer, layerIndex) {
    layer.features.forEach(function(feature, featureIndex) {
      layer.styles.forEach(function(style, styleIndex) {
        colorGrid[intColor] = {layer: layerIndex, feature: featureIndex, style: styleIndex};
        intColor++; // Go on to the next color;
      });
    });
  });
  
  var imgd = ctx.getImageData(0, 0, 256, 256);
  var pix = imgd.data;
  
  var grid = {
        grid: [],
        keys: [""],
        data: {}
      };
  
  // Loop over each pixel and invert the color.
  for (var i = 0, n = pix.length; i < n; i += 4) {
    if (i === 0) {
      var gridRow = "";
    }
    else if (i % 256*4 === 0) {
      grid.grid.push(gridRow);
      var gridRow = "";
    }
    gridRow += h2d(d2h(pix[i], 2) + d2h(pix[i+1], 2) + d2h(pix[i+2], 2));

  }
  grid.grid.push(gridRow); // push our final gridRow
    
  console.log(grid);
}


// hex helper functions
function d2h(d, digits) {
  d = d.toString(); 
  while (d.length < digits) {
		d = '0' + d;
	}
  
  return d.slice(-1 * digits);
}
function h2d(h) {
  return parseInt(h,16);
}






var app = Express.createServer();

app.get('/', function(req, res){
  res.send(fs.readFileSync('./views/leaflet.html', 'utf8'));
});
app.get('/tiles/:zoom/:col/:row', tile);

app.get('/utfgrids/:zoom/:col/:row', utfgrid);

app.listen(port);