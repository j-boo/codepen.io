/*jshint esversion: 6 */ /*jslint single*/
console.clear();

// Firebase
var database = firebase.database();
var databaseEndpoint = '/beta/';

// GeoJSON objects
var geojson = featureCollection([]);
var FEATURE = null; // create empty feature

// FIPS are unique codes for a county
var FIPS = [];
var tags = [];
var filter;
var baseFilter = ['in', 'FIPS'];

var colorHighlightedCounty = "#888888";
var paletteColors = [
  '#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494',
  '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'
];

// Mapbox map
var map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v9',
  center: [-98, 38.88],
  minZoom: 2,
  zoom: 3
});

var overlay = document.getElementById('map-overlay');

// Create a popup, but don't add it to the map yet.
var popup = new mapboxgl.Popup({
  closeButton: false
});

map.on('load', function() {
  // Add the source to query. In this example we're using
  // county polygons uploaded as vector tiles
  map.addSource('counties', {
    "type": "vector",
    "url": "mapbox://mapbox.82pkq93d"
  });

  map.addLayer({
    "id": "counties",
    "type": "fill",
    "source": "counties",
    "source-layer": "original",
    "paint": {
      "fill-outline-color": "rgba(0,0,0,0.1)",
      "fill-color": "rgba(0,0,0,0.1)"
    }
  }, 'place-city-sm'); // Place polygon under these labels.

  paletteColors.forEach(function(color) {
    lay = addLayer(color);
    map.addLayer(lay, 'place-city-sm'); // Place polygon under these labels.)
  });

  // Border highlighted layer
  map.addLayer(addCountyBorderLayer(), 'place-city-sm');

  // Database
  var databaseObject = [];
  var rootRef = firebase.database().ref(databaseEndpoint);
  rootRef.once('value', function(snapshot) {

    if (snapshot.val() !== null) {
      databaseObject = snapshot.val();
      // the endpoint, or name of the object in the database is 'geojson/'
      //   so simplifiy the name by extracting the data by the name of 'geojson'
      geojson = databaseObject.geojson;

      if (geojson.features !== undefined) {
        setPaintColors(geojson);
      } else { // data base is NOT empty, but has no features
        geojson = featureCollection([]);
      }

    } else { // data base is empty
      geojson = featureCollection([]);
    }
  });

  map.on('click', function(e) {
    console.log('click');

    let queryFeature;
    // let checkbox = $('input[name="city-county-checkbox"]').bootstrapSwitch('state');
    checkbox = false; // TODO hardcode to false = County

    // Since we clicked on a new feature, nullify the previous one
    FEATURE = null;

    // Create a new GeoJson feature and properties
    let p = point([e.lngLat.lng, e.lngLat.lat]);
    FEATURE = feature(p);

    //
    if (checkbox === true) { // City
      queryFeature = map.queryRenderedFeatures(e.point);
      FEATURE.properties.name = queryFeature[0].properties.name;
    } else { // County
      queryFeature = map.queryRenderedFeatures(e.point, {
        layers: ['counties']
      });

      FEATURE.properties.FIPS = queryFeature[0].properties.FIPS;
      FEATURE.properties.name = queryFeature[0].properties.COUNTY;

      // add border when county is selected
      filter = baseFilter;
      filter = filter.concat(FEATURE.properties.FIPS);
      map.setFilter("county-border", filter);
    }

    // compare geojson for the current FIPS value, then extract the tags to update the UI
    indexOfFIPS = getFIPSByMap(geojson, FEATURE);
    if (indexOfFIPS != -1) {
      let t = geojson.features[indexOfFIPS].properties.tags;
      $("input[name='tags']").tagsinput('removeAll');
      $("input[name='tags']").tagsinput('add', t);
    }

    $(".county").html(FEATURE.properties.name);

  });

  map.on('mousemove', function(e) {
    var features = map.queryRenderedFeatures(e.point, {
      layers: ['counties']
    });

    // Change the cursor style as a UI indicator.
    map.getCanvas().style.cursor = features.length ? 'pointer' : '';

    // Remove things if no feature was found.
    if (!features.length) {
      popup.remove();
      // map.setFilter('counties-highlighted', ['in', 'COUNTY', '']);
      // overlay.style.display = 'none';
      return;
    }

    // Single out the first found feature on mouseove.
    var feature = features[0];

    // Query the counties layer visible in the map. Use the filter
    // param to only collect results that share the same county name.
    var relatedFeatures = map.querySourceFeatures('counties', {
      sourceLayer: 'original',
      filter: ['in', 'COUNTY', feature.properties.COUNTY]
    });

    // Display a popup with the name of the county
    popup.setLngLat(e.lngLat)
      .setText(feature.properties.COUNTY)
      .addTo(map);
  });
});

/////
function setPaintColors(geoJsonObject) {

  byColor = getFIPSByColor(geoJsonObject);

  // Special case when trying to remove the 'last' county
  if (byColor.length === 0) {
    filter = baseFilter;
    filter = filter.concat('[ ]');
    map.setFilter(layer, filter);
    return;
  }

  // Remove layers for each color to ensure UI is updated
  // Then replace each
  paletteColors.forEach(function(color) {
    rawCurrentColor = rawColorValue(color);
    layer = 'counties-highlighted-' + rawCurrentColor;
    map.removeLayer(layer);

    lay = addLayer(color);
    map.addLayer(lay, 'place-city-sm'); // Place polygon under these labels.)
  });

  byColor.forEach(function(colorRow) {
    color = colorRow.color;
    rawCurrentColor = rawColorValue(color);
    layer = 'counties-highlighted-' + rawCurrentColor;

    filter = baseFilter;
    filter = filter.concat(colorRow.FIPS);

    map.setFilter(layer, filter);
  });
}
/////

// GeoJson objects

// main geojson key
function featureCollection(f) {
  return {
    type: 'FeatureCollection',
    features: f
  };
}

// generate a geojson feature
function feature(geom) {
  return {
    type: 'Feature',
    geometry: geom,
    properties: properties()
  };
}

//  expects [longitude, latitude]
function point(coordinates) {
  return {
    type: 'Point',
    coordinates: coordinates
  };
}

// fill in the properites keys/values here
function properties() {
  return {
    "fill-color": "#ff0000",
    "tags": "",
    "FIPS": null,
    "name": ""
  };
}

function updateGeojson(geoJsonObject, feat) {

  let ff = geoJsonObject.features;

  if (ff.length === 0) {
    ff.push(feat);
    return featureCollection(ff);
  }

  indexOfFIPS = getFIPSByMap(geoJsonObject, feat);
  console.log("index of matching FIPS = " + indexOfFIPS);

  if (indexOfFIPS == -1) { // check if does not exist
    ff.push(feat);
  } else {
    console.log(ff[indexOfFIPS].properties["fill-color"], feat.properties["fill-color"]);
    if (ff[indexOfFIPS].properties["fill-color"] == feat.properties["fill-color"]) {
      // FIPS exists and colors match, remove
      console.log("remove FIPS");
      ff.splice(indexOfFIPS, 1);
    } else {
      // FIPS exists and colors are different, change color
      console.log("Update color and possibly tags");
      ff[indexOfFIPS].properties["fill-color"] = feat.properties["fill-color"];
      ff[indexOfFIPS].properties.tags = feat.properties.tags;
    }
  }

  return featureCollection(ff);

}

function getFIPSByMap(geoJsonObject, feat) {
  let features = geoJsonObject.features;
  let indexOfFIPS = -1;

  indexOfFIPS = features
    .map(function(v) {
      return v.properties.FIPS;
    })
    .indexOf(feat.properties.FIPS);

  return indexOfFIPS;
}

function getFIPSByColor(geoJsonObject) {

  value = [];
  colors = [];

  // first create an array, pushing only unique colors
  for (var f of geoJsonObject.features) {
    fillColor = f.properties['fill-color'];

    // add only unique colors to this array
    if (colors.indexOf(fillColor) == -1) {
      colors.push(fillColor);
    }
  }

  // now iterate overall features, again, to add FIPS
  for (var c of colors) {
    uniqueFips = [];

    for (var ff of geoJsonObject.features) {
      fillColor = ff.properties['fill-color'];
      FIPS = ff.properties.FIPS;

      if (c == fillColor & FIPS !== undefined) {
        // color exists, so push only the FIPS value
        uniqueFips.push(FIPS);
      }
    }

    colorFIPS = {
      color: '#123456',
      FIPS: []
    };

    colorFIPS.color = c;
    colorFIPS.FIPS = uniqueFips;

    value.push(colorFIPS);
  }

  return value;
}

function findByColor(colors, findColor) {
  for (var c of colors) {
    if (findColor == c.color) {
      return c.FIPS;
    }
  }
}

////
/// color picker
////
$("#overlay").mouseleave(function() {

});

var swatches = document.getElementById('swatches');

paletteColors.forEach(function(color) {

  var swatch = document.createElement('button');
  swatch.style.backgroundColor = color;

  swatch.addEventListener('mouseover', function() {
    console.log(color);
  });

  swatch.addEventListener('click', function() {

    if (FEATURE === null) {
      console.log("No FEATURE chosen, exiting");
      return;
    }

    console.log(color);

    let t = $("input[name='tags']").tagsinput('items');
    FEATURE.properties.tags = t.toString();
    FEATURE.properties["fill-color"] = color;

    // Create local copy, and pass that by value rather than the global
    p = point([FEATURE.geometry.coordinates[0], FEATURE.geometry.coordinates[1]]);
    f = feature(p);
    f.properties.FIPS = FEATURE.properties.FIPS;
    f.properties["fill-color"] = color;
    f.properties.name = FEATURE.properties.name;
    f.properties.tags = FEATURE.properties.tags;
    // add the new clicked feature to the geojson
    geojson = updateGeojson(geojson, f);

    // add border when county is DE-selected
    filter = baseFilter;
    map.setFilter("county-border", filter);

    setPaintColors(geojson);

    // update the database
    firebase.database().ref(databaseEndpoint).set({
      geojson: geojson
    });

  });
  swatches.appendChild(swatch);

});

function rawColorValue(color) {
  // color looks like #123456
  //   strip off the '#'
  return color.split('#')[1];
}

function addLayer(color) {

  var colorValue = rawColorValue(color);

  var layer = {
    "id": "counties-highlighted-" + colorValue,
    "type": "fill",
    "source": "counties",
    "source-layer": "original",
    "paint": {
      "fill-outline-color": colorHighlightedCounty,
      "fill-color": color,
    },
    "filter": baseFilter
  };

  return layer;
}

function addCountyBorderLayer() {

  var layer = {
    "id": "county-border",
    "type": "line",
    "source": "counties",
    "source-layer": "original",
    "paint": {
      "line-color": "#000000",
      "line-width": 2
    },
    "filter": baseFilter
  };

  return layer;
}

// jQuery
$(function() {

  $("[name='city-county-checkbox']").bootstrapSwitch();

  $('input').on('change', function(event) {

    var $element = $(event.target);
    var $container = $element.closest('.example');

    if (!$element.data('tagsinput'))
      return;

    var val = $element.val();
    if (val === null)
      val = "null";
    var items = $element.tagsinput('items');

  }).trigger('change');
});
