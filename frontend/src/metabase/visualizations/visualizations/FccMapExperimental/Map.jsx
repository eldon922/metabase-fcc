/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ColorRangeSelector } from "metabase/core/components/ColorRangeSelector";
import { getAccentColors } from "metabase/lib/colors/groups";
import MetabaseSettings from "metabase/lib/settings";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  fieldSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import {
  hasLatitudeAndLongitudeColumns,
  isCountry,
  isLatitude,
  isLongitude,
  isMetric,
  isNumeric,
  isState,
  isAny,
} from "metabase-lib/v1/types/utils/isa";

import ChoroplethMap, {
  getColorplethColorScale,
} from "../../components/ChoroplethMap";
import LeafletGridHeatMap from "../../components/LeafletGridHeatMap";
import PinMap from "../../components/FccPolygonMapExperimental/PinMap";

import { CustomMapFooter } from "./CustomMapFooter";

const PIN_MAP_TYPES = new Set(["pin", "heat", "grid"]);

const isArrayField = field => field.base_type === "type/Array";

export class FccMapExperimental extends Component {
  static uiName = t`Geofence and Marker Map`;
  static identifier = "fccmapexperimental";
  static iconName = "pinmap";

  static aliases = ["fcc_state", "fcc_country", "fcc_pin_map"];

  static minSize = getMinSize("fccmapexperimental");
  static defaultSize = getDefaultSize("fccmapexperimental");

  static isSensible({ cols, rows }) {
    return (
      PinMap.isSensible({ cols, rows }) ||
      ChoroplethMap.isSensible({ cols, rows }) ||
      LeafletGridHeatMap.isSensible({ cols, rows })
    );
  }

  static placeholderSeries = [
    {
      card: { display: "map" },
      data: {
        rows: [
          ["AK", 68],
          ["AL", 56],
          ["AR", 49],
          ["AZ", 20],
          ["CA", 90],
          ["CO", 81],
          ["CT", 7],
          ["DE", 4],
          ["FL", 39],
          ["GA", 78],
          ["IA", 104],
          ["ID", 30],
          ["IL", 68],
          ["IN", 61],
          ["KS", 53],
          ["KY", 50],
          ["LA", 41],
          ["MA", 15],
          ["MD", 10],
          ["ME", 19],
          ["MI", 71],
          ["MN", 96],
          ["MO", 81],
          ["MS", 54],
          ["MT", 108],
          ["NC", 74],
          ["ND", 73],
          ["NE", 76],
          ["NH", 7],
          ["NJ", 10],
          ["NM", 22],
          ["NV", 7],
          ["NY", 74],
          ["OH", 65],
          ["OK", 37],
          ["OR", 40],
          ["PA", 57],
          ["RI", 1],
          ["SC", 43],
          ["SD", 62],
          ["TN", 47],
          ["TX", 194],
          ["UT", 13],
          ["VA", 49],
          ["VT", 10],
          ["WA", 41],
          ["WI", 87],
          ["WV", 21],
          ["WY", 37],
        ],
        cols: [
          {
            semantic_type: "type/State",
            name: "STATE",
            source: "breakout",
            display_name: "State",
            base_type: "type/Text",
          },
          {
            base_type: "type/Integer",
            semantic_type: "type/Number",
            name: "count",
            display_name: "count",
            source: "aggregation",
          },
        ],
      },
    },
  ];
  
  static settings = {
    ...columnSettings({ hidden: true }),
    "map.type": {
      title: t`Map type`,
      widget: "select",
      props: {
        options: [
          { name: t`FCC map Experimental`, value: "pin" },
        ],
      },
      getDefault: ([{ card, data }], settings) => {
        return "pin";
      },
      readDependencies: [
        "map.polygon_column",
      ],
    },
    "map.pin_type": {
      title: t`Pin type`,
      props: {
        options: [
          { name: t`Tiles`, value: "tiles" },
          { name: t`Markers`, value: "markers" },
          { name: "Grid", value: "grid" },
        ],
      },
      getDefault: ([{ data }], vizSettings) =>
        vizSettings["map.type"] === "heat"
          ? "heat"
          : vizSettings["map.type"] === "grid"
            ? "grid"
            : data.rows.length >= 1000
              ? "tiles"
              : "markers",
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    },
    ...fieldSetting("map.polygon_column", {
      title: t`Polygon field`,
      fieldFilter: isAny,
      getDefault: null,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.color_column", {
      title: t`Color field`,
      fieldFilter: isAny,
      getDefault: null,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.type_column", {
      title: t`Type field`,
      fieldFilter: isAny,
      getDefault: null,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.latitude_column", {
      title: t`Latitude field`,
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLatitude) || {}).name,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.longitude_column", {
      title: t`Longitude field`,
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLongitude) || {}).name,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.moviment_status_column", {
      title: t`Moviment status field`,
      fieldFilter: isAny,
      getDefault: null,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.load_status_column", {
      title: t`Load status field`,
      fieldFilter: isAny,
      getDefault: null,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.detail_data", {
      title: t`Detail data field`,
      fieldFilter: isAny,
      getDefault: null,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    "map.colors": {
      title: t`Color`,
      widget: ColorRangeSelector,
      props: {
        colors: getAccentColors(),
        colorMapping: Object.fromEntries(
          getAccentColors().map(color => [
            color,
            getColorplethColorScale(color),
          ]),
        ),
        isQuantile: true,
      },
      default: getColorplethColorScale(getAccentColors()[0]),
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    },
    "map.zoom": {},
    "map.center_latitude": {},
    "map.center_longitude": {},
    "map.heat.radius": {
      title: t`Radius`,
      widget: "number",
      default: 30,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.blur": {
      title: t`Blur`,
      widget: "number",
      default: 60,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.min-opacity": {
      title: t`Min Opacity`,
      widget: "number",
      default: 0,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.max-zoom": {
      title: t`Max Zoom`,
      widget: "number",
      default: 1,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
  };

  shouldComponentUpdate(nextProps, nextState) {
    const sameSize =
      this.props.width === nextProps.width &&
      this.props.height === nextProps.height;
    const sameSeries = isSameSeries(this.props.series, nextProps.series);
    return !(sameSize && sameSeries);
  }

  render() {
    return <PinMap {...this.props} />;
  }
}
