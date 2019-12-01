"use strict";
const geojsonVt = require("geojson-vt");
const vtPbf     = require("vt-pbf");
const request   = require("requestretry");
const zlib      = require("zlib");

const url     = "https://baustellen.strassen.baden-wuerttemberg.de/bis_wfs/wfs?VERSION=1.0.0&typeName=bis:Baustelle&request=GetFeature&outputFormat=json";
const maxZoom = parseInt(process.env.MAX_ZOOM) || 20;

const getTileIndex = (url, callback) => {
  request(
    {
      url: url,
      maxAttempts: 20,
      retryDelay: 30000,
      retryStrategy: (err, response) =>
        request.RetryStrategies.HTTPOrNetworkError(err, response) ||
        (response && 202 === response.statusCode)
    },
    function(err, res, body) {
      if (err) {
        callback(err);
        return;
      }

      const json = JSON.parse(body);
      // the API adds the field "crs" with in ancient history was part of the GeoJSON standard.
      // it causes an error in the parser though, so we remove it.
      delete json.crs;
      callback(null, geojsonVt(json, { maxZoom: maxZoom }));
    }
  );
};

class RoadworksSource {
  constructor(uri, callback) {
    getTileIndex(url, (err, tileIndex) => {
      if (err) {
        callback(err);
        return;
      }
      this.tileIndex = tileIndex;
      callback(null, this);
    });
  }

  getTile(z, x, y, callback) {
    let tile = this.tileIndex.getTile(z, x, y);

    if (tile === null) {
      tile = { features: [] };
    }

    const data = Buffer.from(vtPbf.fromGeojsonVt({ roadwork: tile }));

    zlib.gzip(data, function(err, buffer) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, buffer, { "content-encoding": "gzip" });
    });
  }

  getInfo(callback) {
    callback(null, {
      format: "pbf",
      maxzoom: maxZoom,
      vector_layers: [
        {
          description: "Roadwork information for Baden-Württemberg",
          id: "roadwork"
        }
      ]
    });
  }
}

module.exports = RoadworksSource;

module.exports.registerProtocols = tilelive => {
  tilelive.protocols["roadworkbw:"] = RoadworksSource;
};
