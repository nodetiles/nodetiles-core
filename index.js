var Map = require(__dirname + '/lib/Map'),
    GeoJson = require(__dirname + '/datasources/GeoJson'),
    RemoteGeoJson = require(__dirname + '/datasources/RemoteGeoJson'),
    PostGIS = require(__dirname + '/datasources/PostGIS'),
    Shp = require(__dirname + '/datasources/Shp'),
    projector = require(__dirname + '/lib/projector'),
    routes = require(__dirname + '/lib/routes'),
    UTFGrid = require(__dirname + '/lib/utfgrid');

module.exports = {
  /**
   * The central map component
   */
  Map: Map,
  /**
   * Datasources are responsible for fetching and returning data
   */
  datasources: {
    GeoJson: GeoJson,
    RemoteGeoJson: RemoteGeoJson,
    PostGIS: PostGIS,
    Shp: Shp
  },
  /**
   * Transform between projections
   */
  projector: projector,
  
  /**
   * Routing Middleware
   */
   route: routes
}
