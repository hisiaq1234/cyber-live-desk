/* Cyber Radar location plate — the Cyber Radar site's stage1-v1 style (26 layers),
 * ported verbatim as a plain JS object: no imports, no build step. Read from the shipped
 * UNILAG archive at /tiles/unilag.pmtiles with self-hosted glyphs at /fonts/{fontstack}/{range}.pbf.
 * Generated from the site's src/map/style.ts; do not hand-edit geography.
 */
window.DESK_MAP_STYLE = {
  "version": 8,
  "glyphs": "/fonts/{fontstack}/{range}.pbf",
  "sky": {
    "sky-color": "#0b0c0a",
    "horizon-color": "#141513",
    "fog-color": "#141513",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.5
  },
  "sources": {
    "unilag": {
      "type": "vector",
      "url": "pmtiles:///tiles/unilag.pmtiles",
      "maxzoom": 18,
      "attribution": "<a href='https://openstreetmap.org' target='_blank' rel='noreferrer'>© OpenStreetMap Contributors</a> · ODbL"
    }
  },
  "layers": [
    {
      "id": "bg",
      "type": "background",
      "paint": {
        "background-color": "#141513"
      }
    },
    {
      "id": "campus_fill",
      "type": "fill",
      "source": "unilag",
      "source-layer": "campus",
      "minzoom": 8,
      "paint": {
        "fill-color": "#191c19",
        "fill-opacity": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          10,
          0.6,
          14,
          0.4,
          17,
          0.22
        ]
      }
    },
    {
      "id": "green_fill",
      "type": "fill",
      "source": "unilag",
      "source-layer": "green",
      "minzoom": 9,
      "paint": {
        "fill-color": [
          "case",
          [
            "in",
            [
              "get",
              "leisure"
            ],
            [
              "literal",
              [
                "pitch",
                "stadium",
                "track"
              ]
            ]
          ],
          "#232e23",
          [
            "in",
            [
              "get",
              "leisure"
            ],
            [
              "literal",
              [
                "park",
                "garden",
                "recreation_ground"
              ]
            ]
          ],
          "#1f2b20",
          [
            "in",
            [
              "get",
              "landuse"
            ],
            [
              "literal",
              [
                "grass",
                "meadow",
                "orchard",
                "forest"
              ]
            ]
          ],
          "#1f2b20",
          "#1a231c"
        ],
        "fill-opacity": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          10,
          0.7,
          15,
          0.88,
          18,
          0.95
        ]
      }
    },
    {
      "id": "water_fill",
      "type": "fill",
      "source": "unilag",
      "source-layer": "water",
      "paint": {
        "fill-color": "#090d11"
      }
    },
    {
      "id": "water_shoreline",
      "type": "line",
      "source": "unilag",
      "source-layer": "water",
      "minzoom": 14,
      "paint": {
        "line-color": "#16242c",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          14,
          0.6,
          17,
          1,
          19,
          1.4
        ],
        "line-opacity": 0.9
      }
    },
    {
      "id": "waterway_line",
      "type": "line",
      "source": "unilag",
      "source-layer": "waterway",
      "minzoom": 12,
      "paint": {
        "line-color": "#12202a",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          12,
          0.8,
          16,
          2,
          19,
          3.5
        ],
        "line-opacity": 0.85
      }
    },
    {
      "id": "building_fill",
      "type": "fill",
      "source": "unilag",
      "source-layer": "building",
      "minzoom": 13,
      "paint": {
        "fill-color": "#23262a",
        "fill-opacity": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          0.75,
          15,
          0.95,
          17,
          1
        ]
      }
    },
    {
      "id": "building_edge",
      "type": "line",
      "source": "unilag",
      "source-layer": "building",
      "minzoom": 14,
      "paint": {
        "line-color": "#0d0e0f",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          14,
          0.4,
          17,
          0.7,
          19,
          1
        ],
        "line-opacity": 0.9
      }
    },
    {
      "id": "path_line",
      "type": "line",
      "source": "unilag",
      "source-layer": "path",
      "minzoom": 14,
      "filter": [
        "!=",
        [
          "get",
          "highway"
        ],
        "steps"
      ],
      "layout": {
        "line-cap": "butt",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#3d423c",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          14,
          0.6,
          16,
          1.2,
          18,
          2.2,
          19,
          3
        ],
        "line-dasharray": [
          2,
          2
        ],
        "line-opacity": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          14,
          0.75,
          16,
          0.95
        ]
      }
    },
    {
      "id": "path_steps",
      "type": "line",
      "source": "unilag",
      "source-layer": "path",
      "minzoom": 15,
      "filter": [
        "==",
        [
          "get",
          "highway"
        ],
        "steps"
      ],
      "paint": {
        "line-color": "#4a4a42",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          15,
          1,
          18,
          2.4,
          19,
          3.2
        ],
        "line-dasharray": [
          1,
          1
        ],
        "line-opacity": 0.95
      }
    },
    {
      "id": "road_service",
      "type": "line",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 15,
      "filter": [
        "in",
        [
          "get",
          "highway"
        ],
        [
          "literal",
          [
            "service",
            "track"
          ]
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#34332e",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          15,
          0.6,
          16,
          1.1,
          17,
          1.9,
          18,
          3,
          19,
          4.2
        ],
        "line-opacity": [
          "case",
          [
            "!=",
            [
              "coalesce",
              [
                "get",
                "tunnel"
              ],
              "no"
            ],
            "no"
          ],
          0.55,
          1
        ]
      }
    },
    {
      "id": "road_residential",
      "type": "line",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 13,
      "filter": [
        "in",
        [
          "get",
          "highway"
        ],
        [
          "literal",
          [
            "residential",
            "unclassified",
            "living_street",
            "road"
          ]
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#43413b",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          0.7,
          14,
          1,
          15,
          1.7,
          16,
          2.7,
          17,
          4.2,
          18,
          6,
          19,
          8
        ],
        "line-opacity": [
          "case",
          [
            "!=",
            [
              "coalesce",
              [
                "get",
                "tunnel"
              ],
              "no"
            ],
            "no"
          ],
          0.55,
          1
        ]
      }
    },
    {
      "id": "road_tertiary",
      "type": "line",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 12,
      "filter": [
        "in",
        [
          "get",
          "highway"
        ],
        [
          "literal",
          [
            "tertiary",
            "tertiary_link"
          ]
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#58554b",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          12,
          0.9,
          13,
          1.1,
          14,
          1.3,
          15,
          2.2,
          16,
          3.4,
          17,
          5.2,
          18,
          7.2,
          19,
          9.5
        ],
        "line-opacity": [
          "case",
          [
            "!=",
            [
              "coalesce",
              [
                "get",
                "tunnel"
              ],
              "no"
            ],
            "no"
          ],
          0.55,
          1
        ]
      }
    },
    {
      "id": "road_secondary",
      "type": "line",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 11,
      "filter": [
        "in",
        [
          "get",
          "highway"
        ],
        [
          "literal",
          [
            "secondary",
            "secondary_link"
          ]
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#6f6a5f",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          11,
          1,
          12,
          1.2,
          13,
          1.4,
          14,
          1.9,
          15,
          2.6,
          16,
          4,
          17,
          6,
          18,
          8.5,
          19,
          11
        ],
        "line-opacity": [
          "case",
          [
            "!=",
            [
              "coalesce",
              [
                "get",
                "tunnel"
              ],
              "no"
            ],
            "no"
          ],
          0.55,
          1
        ]
      }
    },
    {
      "id": "road_primary",
      "type": "line",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 10,
      "filter": [
        "in",
        [
          "get",
          "highway"
        ],
        [
          "literal",
          [
            "motorway",
            "motorway_link",
            "trunk",
            "trunk_link",
            "primary",
            "primary_link"
          ]
        ]
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": "#8f8a7c",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          10,
          1,
          11,
          1.2,
          12,
          1.4,
          13,
          1.6,
          14,
          2.2,
          15,
          3,
          16,
          4.6,
          17,
          7,
          18,
          10,
          19,
          14
        ],
        "line-opacity": [
          "case",
          [
            "!=",
            [
              "coalesce",
              [
                "get",
                "tunnel"
              ],
              "no"
            ],
            "no"
          ],
          0.55,
          1
        ]
      }
    },
    {
      "id": "road_bridge",
      "type": "line",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 13,
      "filter": [
        "!=",
        [
          "coalesce",
          [
            "get",
            "bridge"
          ],
          "no"
        ],
        "no"
      ],
      "layout": {
        "line-cap": "round",
        "line-join": "round"
      },
      "paint": {
        "line-color": [
          "match",
          [
            "get",
            "highway"
          ],
          [
            "motorway",
            "motorway_link",
            "trunk",
            "trunk_link",
            "primary",
            "primary_link"
          ],
          "#a9a293",
          [
            "secondary",
            "secondary_link"
          ],
          "#8b8578",
          [
            "tertiary",
            "tertiary_link"
          ],
          "#6f6a5f",
          [
            "residential",
            "unclassified",
            "living_street",
            "road"
          ],
          "#565349",
          "#43413b"
        ],
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          1,
          15,
          2.4,
          16,
          3.6,
          17,
          5.6,
          18,
          8,
          19,
          11
        ],
        "line-opacity": 0.85
      }
    },
    {
      "id": "campus_boundary",
      "type": "line",
      "source": "unilag",
      "source-layer": "campus",
      "minzoom": 11,
      "maxzoom": 16.5,
      "paint": {
        "line-color": "#2f4a38",
        "line-width": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          11,
          1,
          15,
          1.6
        ],
        "line-dasharray": [
          3,
          2
        ],
        "line-opacity": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          11,
          0.7,
          15,
          0.45,
          16.5,
          0.15
        ]
      }
    },
    {
      "id": "lbl_landmark",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "poi",
      "minzoom": 13,
      "filter": [
        "all",
        [
          "has",
          "name"
        ],
        [
          "in",
          [
            "get",
            "name"
          ],
          [
            "literal",
            [
              "Unilag Main Library",
              "Central Library"
            ]
          ]
        ]
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Medium"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          10,
          15,
          11.5,
          15.5,
          13,
          17,
          14,
          19,
          16
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.05,
        "text-anchor": "top",
        "text-offset": [
          0,
          0.4
        ],
        "text-max-width": 8,
        "text-padding": 4,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "symbol-placement": "point"
      },
      "paint": {
        "text-color": "#e8f2e6",
        "text-halo-color": "#0c0d0b",
        "text-halo-width": 1.6,
        "text-halo-blur": 0.3
      }
    },
    {
      "id": "lbl_landmark_bldg",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "building",
      "minzoom": 13,
      "filter": [
        "all",
        [
          "has",
          "name"
        ],
        [
          "==",
          [
            "get",
            "name"
          ],
          "Senate Building"
        ]
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Medium"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          10,
          15,
          11.5,
          15.5,
          13,
          17,
          14,
          19,
          16
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.05,
        "text-anchor": "center",
        "text-max-width": 8,
        "text-padding": 4,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "symbol-placement": "point"
      },
      "paint": {
        "text-color": "#e8f2e6",
        "text-halo-color": "#0c0d0b",
        "text-halo-width": 1.6,
        "text-halo-blur": 0.3
      }
    },
    {
      "id": "lbl_hall",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "poi",
      "minzoom": 14.2,
      "filter": [
        "all",
        [
          "has",
          "name"
        ],
        [
          "==",
          [
            "get",
            "poi_kind"
          ],
          "hostel"
        ]
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Medium"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          14.2,
          10.5,
          15.5,
          12.5,
          17,
          13.5,
          19,
          15
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.04,
        "text-anchor": "top",
        "text-offset": [
          0,
          0.3
        ],
        "text-max-width": 7,
        "text-padding": 3,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "symbol-placement": "point"
      },
      "paint": {
        "text-color": "#d9e7d4",
        "text-halo-color": "#0c0d0b",
        "text-halo-width": 1.5,
        "text-halo-blur": 0.3
      }
    },
    {
      "id": "lbl_road_primary",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 13,
      "filter": [
        "all",
        [
          "has",
          "name"
        ],
        [
          "in",
          [
            "get",
            "highway"
          ],
          [
            "literal",
            [
              "motorway",
              "motorway_link",
              "trunk",
              "trunk_link",
              "primary",
              "primary_link"
            ]
          ]
        ]
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          13,
          9.5,
          15,
          10.5,
          17,
          11.5,
          19,
          13
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.08,
        "symbol-placement": "line",
        "symbol-spacing": 320,
        "text-max-angle": 45,
        "text-keep-upright": true,
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "viewport",
        "text-padding": 2,
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      "paint": {
        "text-color": "#b3ad9e",
        "text-halo-color": "#0c0d0b",
        "text-halo-width": 1.3
      }
    },
    {
      "id": "lbl_road_secondary",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 14,
      "filter": [
        "all",
        [
          "has",
          "name"
        ],
        [
          "in",
          [
            "get",
            "highway"
          ],
          [
            "literal",
            [
              "secondary",
              "secondary_link"
            ]
          ]
        ]
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          14,
          9,
          16,
          10,
          19,
          12
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.07,
        "symbol-placement": "line",
        "symbol-spacing": 300,
        "text-max-angle": 45,
        "text-keep-upright": true,
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "viewport",
        "text-padding": 2,
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      "paint": {
        "text-color": "#979183",
        "text-halo-color": "#0c0d0b",
        "text-halo-width": 1.2
      }
    },
    {
      "id": "lbl_road_tertiary",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 15,
      "filter": [
        "all",
        [
          "has",
          "name"
        ],
        [
          "in",
          [
            "get",
            "highway"
          ],
          [
            "literal",
            [
              "tertiary",
              "tertiary_link"
            ]
          ]
        ]
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          15,
          8.5,
          17,
          10,
          19,
          11.5
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.06,
        "symbol-placement": "line",
        "symbol-spacing": 280,
        "text-max-angle": 45,
        "text-keep-upright": true,
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "viewport",
        "text-padding": 2,
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      "paint": {
        "text-color": "#7d786d",
        "text-halo-color": "#0c0d0b",
        "text-halo-width": 1.2
      }
    },
    {
      "id": "lbl_campus",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "campus",
      "minzoom": 10,
      "maxzoom": 15.5,
      "filter": [
        "has",
        "name"
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          10,
          11,
          12,
          14,
          14,
          17,
          15.5,
          18
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.35,
        "text-max-width": 6,
        "symbol-placement": "point",
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      "paint": {
        "text-color": "#3f5a47",
        "text-halo-color": "#141513",
        "text-halo-width": 2,
        "text-opacity": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          10,
          0.85,
          13,
          0.7,
          15.5,
          0
        ]
      }
    },
    {
      "id": "lbl_road_residential",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "road",
      "minzoom": 16,
      "filter": [
        "all",
        [
          "has",
          "name"
        ],
        [
          "in",
          [
            "get",
            "highway"
          ],
          [
            "literal",
            [
              "residential",
              "unclassified",
              "living_street",
              "road"
            ]
          ]
        ]
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          16,
          8.5,
          19,
          10.5
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.05,
        "symbol-placement": "line",
        "symbol-spacing": 260,
        "text-max-angle": 45,
        "text-keep-upright": true,
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "viewport",
        "text-padding": 2,
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      "paint": {
        "text-color": "#625e55",
        "text-halo-color": "#0c0d0b",
        "text-halo-width": 1.1
      }
    },
    {
      "id": "lbl_poi",
      "type": "symbol",
      "source": "unilag",
      "source-layer": "poi",
      "minzoom": 16.5,
      "filter": [
        "all",
        [
          "has",
          "name"
        ],
        [
          "any",
          [
            "in",
            [
              "get",
              "amenity"
            ],
            [
              "literal",
              [
                "cafe",
                "restaurant",
                "fast_food",
                "bank",
                "atm",
                "pharmacy",
                "hospital",
                "clinic",
                "library",
                "place_of_worship",
                "bus_station",
                "parking",
                "fuel",
                "marketplace",
                "toilets",
                "police"
              ]
            ]
          ],
          [
            "in",
            [
              "get",
              "tourism"
            ],
            [
              "literal",
              [
                "hotel",
                "hostel",
                "guest_house",
                "attraction"
              ]
            ]
          ],
          [
            "in",
            [
              "get",
              "leisure"
            ],
            [
              "literal",
              [
                "sports_centre",
                "fitness_centre",
                "swimming_pool"
              ]
            ]
          ]
        ]
      ],
      "layout": {
        "text-field": [
          "get",
          "name"
        ],
        "text-font": [
          "Noto Sans Regular"
        ],
        "text-size": [
          "interpolate",
          [
            "linear"
          ],
          [
            "zoom"
          ],
          16.5,
          9.5,
          19,
          11.5
        ],
        "text-letter-spacing": 0.02,
        "text-anchor": "top",
        "text-offset": [
          0,
          0.6
        ],
        "text-max-width": 9,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "symbol-placement": "point",
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      "paint": {
        "text-color": "#93a094",
        "text-halo-color": "#0c0d0b",
        "text-halo-width": 1
      }
    }
  ]
};
