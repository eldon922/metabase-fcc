/* eslint-disable react/prop-types */
import cx from "classnames";
import * as d3 from "d3";
import L from "leaflet";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { LatitudeLongitudeError } from "metabase/visualizations/lib/errors";
import { hasPolygon } from "metabase-lib/v1/types/utils/isa";

import FccPolygonMap from "./FccPolygonMap";

const WORLD_BOUNDS = [
  [-90, -180],
  [90, 180],
];

const MAP_COMPONENTS_BY_TYPE = {
  markers: FccPolygonMap,
};

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  zIndex: 99999999999,
  display: "flex",
  justifyContent: "center",
  alignItems: "center"
};

const modalStyle = {
  backgroundColor: "#fff",
  padding: "20px",
  borderRadius: "12px",
  width: "60%",
  maxWidth: "90%",
  boxShadow: "0 2px 10px rgba(0,0,0,0.3)"
};

const modalHeader= {
  paddingBottom: "10px",
  borderBottom: "1px solid #000",
  position: "relative"
};

const modalBodyDataStyle = {
  maxHeight: '70vh',
  overflowY: 'auto'
};

const modalBodyDataContainerStyle = {
  display:'flex'
};

const modalBodyDataColumnStyle = {
  width:'250px',
  height:'50px',
  whiteSpace:'wrap',
  paddingLeft:'10px',
  paddingRight:'10px'
};

const modalBodyDataValueStyle= {
  height:'50px',
  paddingLeft:'10px',
  paddingRight:'10px',
  flex:1
};

const closeButtonStyle = {
  position: "absolute",
  top: "5px",
  right: "15px",
  background: "transparent",
  border: "none",
  fontSize: "20px",
  cursor: "pointer"
};

export default class PinMap extends Component {
  static uiName = t`FCC Map Experimental`;
  static identifier = "fccmapexperimental";
  static iconName = "pinmap";

  static isSensible({ cols, rows }) {
    return hasPolygon(cols);
  }

  static checkRenderable([
    {
      data: { cols, rows },
    },
  ]) {
    if (!hasPolygon(cols)) {
      throw new LatitudeLongitudeError();
    }
  }

  state;
  _map = null;

  constructor(props) {
    super(props);
    this.state = {
      lat: null,
      lng: null,
      zoom: null,
      filtering: false,
      showModal: false,
      modalData: [],
      detailData: null,
      ...this._getPoints(props),
    };
  }

  toggleModal = (data) => {
    this.setState(prevState => ({ 
      showModal: !prevState.showModal 
    }));
    this.setState(prevState => ({ 
      modalData: [...data]
    }));
  };

  drawPolygonFStart = (map) => {
    console.warn(`check map`, {
      map:map
    })
    const drawData = new L.Draw.Polygon(
      map._map.map,
      map._map.drawControl.options.polygon,
    )
    drawData.enable();
  };

  drawPolygonFEnd = (map) => {
    const drawData = new L.Draw.Polygon(
      map._map.map,
      map._map.drawControl.options.polygon,
    )
    drawData.disable();
  };

  UNSAFE_componentWillReceiveProps(newProps) {
    const SETTINGS_KEYS = [
      "map.polygon_column",
      "map.latitude_column",
      "map.longitude_column",
    ];
    if (
      newProps.series[0].data !== this.props.series[0].data ||
      !_.isEqual(
        _.pick(newProps.settings, ...SETTINGS_KEYS),
        _.pick(this.props.settings, ...SETTINGS_KEYS),
      )
    ) {
      this.setState(this._getPoints(newProps));
    }
  }

  updateSettings = () => {
    const newSettings = {};
    if (this.state.lat != null) {
      newSettings["map.center_latitude"] = this.state.lat;
    }
    if (this.state.lng != null) {
      newSettings["map.center_longitude"] = this.state.lng;
    }
    if (this.state.zoom != null) {
      newSettings["map.zoom"] = this.state.zoom;
    }
    this.props.onUpdateVisualizationSettings(newSettings);
    this.setState({ lat: null, lng: null, zoom: null });
  };

  onMapCenterChange = (lat, lng) => {
    this.setState({ lat, lng });
  };

  onMapZoomChange = zoom => {
    this.setState({ zoom });
  };

  _getPoints(props) {
    const {
      settings,
      series: [
        {
          data: { cols, rows },
        },
      ],
      onUpdateWarnings,
    } = props;
    const latitudeIndex = _.findIndex(
      cols,
      col => col.name === settings["map.latitude_column"],
    );
    const longitudeIndex = _.findIndex(
      cols,
      col => col.name === settings["map.longitude_column"],
    );
    const polygonIndex = _.findIndex(
      cols,
      col => col.name === settings["map.polygon_column"],
    );
    const metricIndex = _.findIndex(
      cols,
      col => col.name === settings["map.metric_column"],
    );
    let polygonList = []
    rows.map(row => {
      if(row[polygonIndex]){
        // let polygonListToLoop = JSON.parse(row[polygonIndex])
        // for (let polI = 0; polI < polygonListToLoop.length; polI++) {
        //   polygonList = [
        //     ...polygonList,
        //     polygonListToLoop[polI]
        //   ]
        // }
        let polygonListToLoop = row[polygonIndex].replace("POLYGON ((", "")
        .replace("))", "")
        .split(",")
        .map(coordStr => {
          const [lng, lat] = coordStr.trim().split(" ").map(Number);
          return [lat, lng]
        })
        for (let polI = 0; polI < polygonListToLoop.length; polI++) {
          polygonList = [
            ...polygonList,
            polygonListToLoop[polI]
          ]
        }
      }
    })
    const allPoints = polygonList.map(data => [
      data[0],
      data[1],
      1,
    ]);
    const validPoints = allPoints.map(([lat, lng, metric]) => {
      if (settings["map.type"] === "pin") {
        return lat != null && lng != null;
      }

      return lat != null && lng != null && metric != null;
    });
    const points = allPoints.filter((_, i) => validPoints[i]);
    const updatedRows = rows.filter((_, i) => validPoints[i]);

    const warnings = [];
    const filteredRows = allPoints.length - points.length;
    if (filteredRows > 0) {
      warnings.push(
        t`We filtered out ${filteredRows} row(s) containing null values.`,
      );
    }
    if (onUpdateWarnings && warnings) {
      onUpdateWarnings(warnings);
    }

    const bounds = L.latLngBounds(points.length > 0 ? points : WORLD_BOUNDS);

    const min = d3.min(points, point => point[2]);
    const max = d3.max(points, point => point[2]);

    const binWidth =
      cols[longitudeIndex] &&
      cols[longitudeIndex].binning_info &&
      cols[longitudeIndex].binning_info.bin_width;
    const binHeight =
      cols[latitudeIndex] &&
      cols[latitudeIndex].binning_info &&
      cols[latitudeIndex].binning_info.bin_width;

    if (binWidth != null) {
      bounds._northEast.lng += binWidth;
    }
    if (binHeight != null) {
      bounds._northEast.lat += binHeight;
    }

    return { rows: updatedRows, points, bounds, min, max, binWidth, binHeight };
  }

  render() {
    const { className, settings, isEditing, isDashboard } = this.props;
    const { lat, lng, zoom } = this.state;
    const disableUpdateButton = lat == null && lng == null && zoom == null;

    // const Map = MAP_COMPONENTS_BY_TYPE[settings["map.pin_type"]];
    const Map = FccPolygonMap;

    const { rows, points, bounds, min, max, binHeight, binWidth } = this.state;

    const mapProps = { ...this.props };
    mapProps.series[0].data.rows = rows;

    return (
      <div
        data-element-id="pin-map"
        className={cx(
          className,
          DashboardS.PinMap,
          CS.relative,
          CS.hoverParent,
          CS.hoverVisibility,
        )}
        onMouseDownCapture={e => e.stopPropagation() }
      >
        {Map ? (
          <Map
            {...mapProps}
            ref={map => (this._map = map)}
            className={cx(
              CS.absolute,
              CS.top,
              CS.left,
              CS.bottom,
              CS.right,
              CS.z1,
            )}
            onMapCenterChange={this.onMapCenterChange}
            onMapZoomChange={this.onMapZoomChange}
            lat={lat}
            lng={lng}
            zoom={zoom}
            points={points}
            bounds={bounds}
            min={min}
            max={max}
            binWidth={binWidth}
            binHeight={binHeight}
            onFiltering={filtering => this.setState({ filtering })}
            openModal = {(data) => this.toggleModal(data)}
          />
        ) : <h1>loading . . .</h1>}
        {/* <div
          className={cx(
            CS.absolute,
            CS.top,
            CS.right,
            CS.m1,
            CS.z2,
            CS.flex,
            CS.flexColumn,
            CS.hoverChild,
          )}
        >
          {isEditing || !isDashboard ? (
            <div
              className={cx(
                "PinMapUpdateButton",
                ButtonsS.Button,
                ButtonsS.ButtonSmall,
                CS.mb1,
                {
                  [DashboardS.PinMapUpdateButtonDisabled]: disableUpdateButton,
                },
              )}
              onClick={this.updateSettings}
            >
              {t`Save as default view`}
            </div>
          ) : null}
          {!isDashboard &&
            this._map &&
            this._map.supportsFilter &&
            this._map.supportsFilter() && (
              <div
                className={cx(
                  "PinMapUpdateButton",
                  ButtonsS.Button,
                  ButtonsS.ButtonSmall,
                  CS.mb1,
                )}
                onClick={() => {
                  if (
                    !this.state.filtering &&
                    this._map &&
                    this._map.startFilter
                  ) {
                    this._map.startFilter();
                  } else if (
                    this.state.filtering &&
                    this._map &&
                    this._map.stopFilter
                  ) {
                    this._map.stopFilter();
                  }
                }}
              >
                {!this.state.filtering
                  ? t`Draw box to filter`
                  : t`Cancel filter`}
              </div>
            )}
        </div> */}

        <div>
          {this.state.showModal && (
            <div style={overlayStyle}>
              <div style={modalStyle}>
                <div style={modalHeader}>
                  <h2>Details</h2>
                  <button style={closeButtonStyle} onClick={()=>this.toggleModal([])}>
                    X
                  </button>
                </div>
                <div style={modalBodyDataStyle}>
                  {
                    this.state.modalData.map((data,index) => 
                      <div style={modalBodyDataContainerStyle} key={index}>
                        <div style={modalBodyDataColumnStyle}>
                          <p>
                            <span style={{fontWeight:"bold"}}>{data.col.name}</span>
                          </p>
                        </div>
                        <div style={modalBodyDataValueStyle}>
                          <p>{data.value}</p>
                        </div>
                      </div>
                    )
                  }
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    );
  }
}
