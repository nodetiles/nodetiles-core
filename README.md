NodeTiles
=============

This is a dirty hack to do server-side map tile rendering using geojson/shapefiles. Map tiles are rendered using node-canvas--a [special version](https://github.com/bensheldon/node-canvas-heroku) that includes a pre-compiled Cairo binary that works on Heroku--and requested via a standard leaflet map. This demo currently renders Baltimore neighbrhoods.

Big THANKS to [Tom Carden](https://github.com/RandomEtc) whose [original gist](https://gist.github.com/668577) inspired this project. He also has other very [useful](https://github.com/RandomEtc/nodemap) [projects](https://github.com/RandomEtc/shapefile-js).

Installation on Heroku
----------------------

1. Clone it
2. Within the directory, `heroku create --stack cedar`
3. Setup your heroku environment variables for node-canvas-heroku
   
        $ heroku config:add LD_PRELOAD='/app/node_modules/canvas/cairo/libcairo.so /app/node_modules/canvas/lib/libpixman-1.so.0 /app/node_modules/canvas/lib/libfreetype.so.6' --app <your-app>
        $ heroku config:add LD_LIBRARY_PATH=/app/node_modules/canvas/cairo --app <your-app>
   
   IMPORTANT: replace the `<your-app>` at the end of each command with your Heroku app's name, e.g. 'furious-sparrow-2089'
4. `git push heroku master`
5. Rejoice / Open an issue that these instructions are inadequate

Local Development
-----------------

For local development, use `npm install --dev`, which will install node-canvas instead of node-canvas-heroku.

*Note: node-canvas requires Cairo, which you will need to install separately.*

How it works / How to modify it
-------------------------------

This application renders PNG map tiles as well as UTFGrid interaction tiles from static geojson files (though it would be relatively trivial to load geojson from a live database instead). Those geojson are loaded into the `Layers` list along with some basic style settings. When a specific tile is requested, a new canvas is created and the Layers, then Features are stepped through and drawn to a canvas, which is then streamed back to the requesting client as a PNG. UTFGrids are rendered in much the same way: they are drawn as a raster where each feature is assigned a unique RGB value; the resulting raster is then read out to create a UTFGrid.

Shapefiles
----------

Within the `/geodata` directory are GEOjson files from the [datasf.of](https://data.sfgov.org/) (transformed via ogr2ogr).

* San Francisco Shorelines
* San Francisco Street Centerlines
* San Francisco Parks
* San Francisco Parcels (is huge and crashes Heroku when loaded; >500MB memory)

And some others, including world outlines from [Natural Earth](http://www.naturalearthdata.com/).




