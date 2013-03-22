/*jslint nomen: true */
/*globals define: true */

define(function (require) {
  'use strict';

  var _ = require('lib/underscore');

  function sec(x) { return 1 / Math.cos(x); }

  /**
   * Convert coordinates to a 
   * @param  {Int}    zoom   Zoom level of the ma
   * @param  {Array}  coords [latitude, longitude]
   * @return {Array}         [xtile, ytile]
   */
  function coordsToTiles(zoom, coords) {
    var n = Math.pow(2, zoom);
    var lon_rad = coords[0] * Math.PI / 180;
    var lat_rad = coords[1] * Math.PI / 180;
    var xtile = n * (1 + (lon_rad / Math.PI)) / 2;
    var ytile = n * (1 - (Math.log(Math.tan(lat_rad) + sec(lat_rad)) / Math.PI)) / 2;
    return [Math.floor(xtile), Math.floor(ytile)];
  }

  function tile2long(x,z) {
    return (x/Math.pow(2,z)*360-180);
  }

  function tile2lat(y,z) {
    var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
    return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
  }


  return {
    getTileCoords: function getTileCoords(zoom, bbox) {
      var tileBBox = [coordsToTiles(zoom, bbox[0]), coordsToTiles(zoom, bbox[1])];
      var tileCoords = [];
      var xrange;
      var yrange;

      if (tileBBox[0][0] < tileBBox[1][0]) {
        xrange = _.range(tileBBox[0][0], tileBBox[1][0] + 1);
      } else {
        xrange = _.range(tileBBox[0][0], tileBBox[1][0] + 1, -1);
      }

      if (tileBBox[0][1] < tileBBox[1][1]) {
        yrange = _.range(tileBBox[0][1], tileBBox[1][1] + 1);
      } else {
        yrange = _.range(tileBBox[0][1], tileBBox[1][1] - 1, -1);
      }

      _.each(xrange, function (x) {
        _.each(yrange, function (y) {
          tileCoords.push([zoom, x, y]);
        });
      });

      return tileCoords;
    },

    tileToBBox: function tileToBBox(tileZXY) {
      var sw = [tile2long(tileZXY[1], tileZXY[0]), tile2lat(tileZXY[2] + 1, tileZXY[0])];
      var ne = [tile2long(tileZXY[1] + 1, tileZXY[0]), tile2lat(tileZXY[2], tileZXY[0])];
      return [sw, ne];
    }
  };
});
