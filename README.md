Nodetiles-Core
=============
Nodetiles-core is a javascript library for rendering map tiles suitable for slippy-maps and static images. Features include:

- **Flexible Data-connectors**: We offer GeoJson and PostGIS connectors out-of-the-box, but it's easy to build your own. 
- **Map Projections**: Transform data between more [3,900+](https://github.com/yuletide/node-proj4js-defs/blob/master/epsg.js) EPSG projections using Proj4.js
- **CartoCSS Support**: We support many (if not most) stylesheet features of [CartCSS](http://mapbox.com/tilemill/docs/manual/carto/) making it trivial to import your map styles from tools like Tilemill
- **Slippy-map URL helpers**: Easily serve map tiles, UTFGrids, and Tile.json. Check out [nodetiles-init](https://github.com/codeforamerica/nodetiles-init) for a simple scaffold.
- **Static maps**: If slipply-maps aren't your style, generate static images of any dimension; checkout [nodetiles-example-static](https://github.com/codeforamerica/nodetiles-example-static) for examples.
- **Joyfully simple, pluggable, flexible, powerful**: We built Nodetiles to be easily understandable, extensible and a joy to use. It's built with Javascript and tries to provide a solid foundation of tools that are still easy to understand, extend or replace depending on your needs. [File an issue](https://github.com/codeforamerica/nodetiles-core/issues/new) if Nodetiles can't do what you need.

Screenshot
-------

![Nodetiles Screenshot](https://raw.github.com/codeforamerica/nodetiles-core/master/screenshot.png)


Example
-------
```
/* Set up the libraries */
var nodetiles = require('nodetiles-core'),
    GeoJsonSource = nodetiles.datasources.GeoJson,
    Projector = nodetiles.projector,
    fs = require('fs'); // we'll output to a file
    
/* Create your map context */
var map = new nodetiles.Map({
    projection: "EPSG:4326" // set the projection of the map
});

/* Add some data */
map.addData(new GeoJsonSource({ 
  name: "world",
  path: __dirname + '/countries.geojson', 
  projection: "EPSG:900913"
}));

/* Link your Carto stylesheet */
map.addStyle(fs.readFileSync('./style.mss','utf8'));

/* Render out the map to a file */
map.render({
  // Make sure your bounds are in the same projection as the map
  bounds: {minX: -180, minY: -90, maxX: 180, maxY: 90},
  width: 800,   // number of pixels to output
  height: 400,
  callback: function(err, canvas) {
    var file = fs.createWriteStream(__dirname + '/map.png'),
        stream = canvas.createPNGStream();

    stream.on('data', function(chunk){
      file.write(chunk);
    });

    stream.on('end', function(){
      console.log('Saved map.png!');
    });
  }
});


```

Thanks
-------

Big THANKS to [Tom Carden](https://github.com/RandomEtc) whose [original gist](https://gist.github.com/668577) inspired this project. He also has other very [useful](https://github.com/RandomEtc/nodemap) [projects](https://github.com/RandomEtc/shapefile-js).

Projections
-----------
[Supported projections](https://github.com/yuletide/node-proj4js-defs)




