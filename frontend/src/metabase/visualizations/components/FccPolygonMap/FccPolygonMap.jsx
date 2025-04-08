import L from "leaflet";
import _ from "underscore";

import { getSubpathSafeUrl } from "metabase/lib/urls";
import { isPK } from "metabase-lib/v1/types/utils/isa";

import LeafletMap from "./LeafletMap";

export default class FccPolygonMap extends LeafletMap {
  componentDidMount() {
    super.componentDidMount();

    this.componentDidUpdate({}, {});
  }

  componentDidUpdate(prevProps, prevState) {
    super.componentDidUpdate(prevProps, prevState);
    
    this._addPolygonLayer();
  }

  _addPolygonLayer = () => {
    try {
      const { series, onHoverChange, onVisualizationClick, settings } = this.props;

      let findPolygonList = []
  
      for (let i = 0; i < series.length; i++) {
        const targetData = series[i].data
        const polygonIndex = targetData.cols.findIndex(item => item.name === settings["map.polygon_column"])
        if(polygonIndex>-1){
          const rowToLoop = targetData.rows
          for (let rowI = 0; rowI < rowToLoop.length; rowI++) {
            if(targetData.rows[rowI][polygonIndex]){
              let polygonListToLoop = JSON.parse(targetData.rows[rowI][polygonIndex])
              for (let polI = 0; polI < polygonListToLoop.length; polI++) {
                const coordinateList = polygonListToLoop[polI]
                let newPolygondata = []
                for (let coorI = 0; coorI < coordinateList.length; coorI++) {
                  newPolygondata.push([
                    coordinateList[coorI][1],
                    coordinateList[coorI][0]
                  ])
                }
                findPolygonList.push(newPolygondata)
              }
            }
          }
        }
      }
      
      if (this.polygonLayers) {
        this.polygonLayers.forEach(layer => this.map.removeLayer(layer));
      }
      
      this.polygonLayers = [];
      findPolygonList.forEach((polygonCoordinates, index) => {
        const polygonLayer = L.polygon(polygonCoordinates, {
          color: "cyan",
          fillColor: "cyan",
          fillOpacity: 0.2,
        }).addTo(this.map);
  
        this.polygonLayers.push(polygonLayer); 

        if (onHoverChange) {
          polygonLayer.on("mousemove", e => {
            const { cols, rows } = series[0].data;
            const hover = {
              dimensions: cols.map((col, colIndex) => ({
                value: rows[index] ? rows[index][colIndex] : null,
                column: col,
              })),
              element: e.target._path,
            };
            onHoverChange(hover);
          });
  
          polygonLayer.on("mouseout", () => {
            onHoverChange(null);
          });
        }

        if (onVisualizationClick) {
          polygonLayer.on("click", () => {
            const { cols, rows } = series[0].data;
            const pkIndex = _.findIndex(cols, isPK);
            const hasPk = pkIndex >= 0;
  
            const data = cols.map((col, colIndex) => ({
              col,
              value: rows[index] ? rows[index][colIndex] : null,
            }));
            console.warn(`check on click`, {
              value: hasPk && rows[index] ? rows[index][pkIndex] : null,
              column: hasPk ? cols[pkIndex] : null,
              element: polygonLayer._path,
              origin: { row: rows[index], cols },
              settings,
              data,
            })
  
            onVisualizationClick({
              value: hasPk && rows[index] ? rows[index][pkIndex] : null,
              column: hasPk ? cols[pkIndex] : null,
              element: polygonLayer._path,
              origin: { row: rows[index], cols },
              settings,
              data,
            });
          });
        }
      });
  
    } catch (error) {
      console.error("Error while adding polygon:", error);
    }
  };  
  
}
