<template>
  <div class="amap-wrapper">
    <div class="amap-container" :id="mapId"></div>
    <!-- 图例 -->
    <div v-if="hasAnyTrajectory" class="legend">
      <div class="legend-title">
        轨迹图例
        <!-- 坐标转换开关 -->
        <div class="coordinate-switch">
          <label class="switch-label">
            <input
              type="checkbox"
              :checked="enableCoordinateConversion"
              @change="toggleCoordinateConversion"
              class="switch-input"
            />
            <span class="switch-slider"></span>
            <span class="switch-text">坐标转换</span>
          </label>
        </div>
      </div>
      <div v-if="originalPoints.length > 0"
           class="legend-item"
           :class="{ 'legend-item-hidden': !legendState.original }"
           @click="toggleTrajectory('original')">
        <div class="legend-color" style="background-color: #FF5722;"></div>
        <span>原始轨迹</span>
        <span class="legend-status">{{ legendState.original ? '显示' : '隐藏' }}</span>
      </div>
      <div v-if="processedPoints.length > 0"
           class="legend-item"
           :class="{ 'legend-item-hidden': !legendState.processed }"
           @click="toggleTrajectory('processed')">
        <div class="legend-color" style="background-color: #4CAF50;"></div>
        <span>处理后轨迹</span>
        <span class="legend-status">{{ legendState.processed ? '显示' : '隐藏' }}</span>
      </div>
      <div v-if="baselinePoints.length > 0"
           class="legend-item"
           :class="{ 'legend-item-hidden': !legendState.baseline }"
           @click="toggleTrajectory('baseline')">
        <div class="legend-color" style="background-color: #666666;"></div>
        <span>基准轨迹</span>
        <span class="legend-status">{{ legendState.baseline ? '显示' : '隐藏' }}</span>
      </div>

    </div>
  </div>
</template>

<script lang="ts">
import { ref, onMounted, onUnmounted, watch, defineComponent, computed, type PropType } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import type { GPSPoint } from '../utils/gpsCore'
import { convertGpsPointsToGcj02 } from '../utils/coordinateConverter'

export default defineComponent({
  props: {
    originalPoints: {
      type: Array as () => GPSPoint[],
      default: () => []
    },
    processedPoints: {
      type: Array as () => GPSPoint[],
      default: () => []
    },
    simulationMarkers: {
    type: Array as PropType<{ type: 'tunnel' | 'drift' | 'speed', position: { lat: number, lng: number }, info: string }[]>,
    default: () => []
  },
  basePointRebuildMarkers: {
    type: Array as PropType<{ type: 'rebuild', position: { lat: number, lng: number }, info: string }[]>,
    default: () => []
  },
  baselinePoints: {
    type: Array as PropType<GPSPoint[]>,
    default: () => []
  },
    enableCoordinateConversion: {
      type: Boolean,
      default: true
    },
    title: {
      type: String,
      default: '地图'
    }
  },
  emits: ['update:enableCoordinateConversion'],
  setup(props, { emit }) {
    const mapId = `amap-${Math.random().toString(36).substr(2, 9)}`
    const map = ref<any>(null)
    const polylines = ref<any[]>([])
    const markers = ref<any[]>([])

    // 图例状态管理
    const legendState = ref({
      original: true,
      processed: true,
      baseline: true
    })

    // 轨迹线对象存储
    const trajectoryLines = ref<{
      original?: any,
      processed?: any,
      baseline?: any
    }>({})

    // 计算是否有任何轨迹
      const hasAnyTrajectory = computed(() => {
        return props.originalPoints.length > 0 ||
               props.processedPoints.length > 0 ||
               props.baselinePoints.length > 0
      })

     // 切换轨迹显示/隐藏
      const toggleTrajectory = (type: 'original' | 'processed' | 'baseline') => {
       legendState.value[type] = !legendState.value[type]

       const line = trajectoryLines.value[type]
       if (line && map.value) {
         if (legendState.value[type]) {
           map.value.add(line)
           console.log(`显示${type}轨迹`)
         } else {
           map.value.remove(line)
           console.log(`隐藏${type}轨迹`)
         }
       }
     }

     // 切换坐标转换开关
     const toggleCoordinateConversion = (event: Event) => {
       const target = event.target as HTMLInputElement
       emit('update:enableCoordinateConversion', target.checked)
     }

    // 初始化地图
    const initMap = async () => {
      try {
        const AMap = await AMapLoader.load({
          key: 'd03f0a1b2e2f201085a5801d01ffec4e', // 需要替换为实际的高德地图API Key
          version: '2.0',
          plugins: ['AMap.Scale', 'AMap.ToolBar']
        })

        map.value = new AMap.Map(mapId, {
          zoom: 15,
          center: [116.397428, 39.90923], // 默认中心点（北京）
          viewMode: '3D',
          pitch: 0
        })

        // 添加工具条
        map.value.addControl(new AMap.Scale())
        map.value.addControl(new AMap.ToolBar())

        // 监听点数据变化
        updateMapData()
      } catch (error) {
        console.error('地图初始化失败:', error)
      }
    }

    // 更新地图数据
    // 使用自定义坐标转换函数
    const convertCoordinates = (points: GPSPoint[]): GPSPoint[] => {
      if (!points || !Array.isArray(points)) {
        console.warn('无效的坐标点数组');
        return [];
      }

      if (!points.length) {
        console.warn('空的坐标点数组');
        return [];
      }

      // 过滤无效点
      const validPoints = points.filter(point => {
        if (!point || typeof point !== 'object') {
          console.warn('无效的坐标点对象:', point);
          return false;
        }
        if (typeof point.lat !== 'number' || typeof point.lng !== 'number') {
          console.warn('坐标点缺少有效的经纬度:', point);
          return false;
        }
        if (isNaN(point.lat) || isNaN(point.lng)) {
          console.warn('坐标点经纬度为NaN:', point);
          return false;
        }
        return true;
      });

      if (validPoints.length === 0) {
        console.warn('没有有效的坐标点可以转换');
        return [];
      }

      // 根据开关决定是否进行坐标转换
      if (!props.enableCoordinateConversion) {
        console.log(`坐标转换已关闭，直接使用原始坐标 ${validPoints.length} 个点`);
        return validPoints;
      }

      try {
        // 使用自定义的WGS84到GCJ02转换算法
        const converted = convertGpsPointsToGcj02(validPoints);
        
        // 验证转换结果
        const validConverted = converted.filter(point => {
          if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number' ||
              isNaN(point.lat) || isNaN(point.lng)) {
            console.warn('转换后的坐标点无效:', point);
            return false;
          }
          return true;
        });

        if (validConverted.length === 0) {
          console.warn('坐标转换后没有有效点');
          return validPoints;
        }

        console.log(`成功转换 ${validConverted.length} 个GPS坐标点到GCJ02坐标系`);
        return validConverted;
      } catch (error) {
        console.error('坐标转换失败，使用原始坐标:', error);
        return validPoints;
      }
    };

    // 修改updateMapData，使用转换后的点
    const updateMapData = () => {
      if (!map.value) return;

      clearMapData();

      const allPaths: any[] = [];
      const linesToAdd: any[] = [];

      // 添加基准轨迹
      if (props.baselinePoints && props.baselinePoints.length > 0) {
        const baselineCoords = convertCoordinates(props.baselinePoints);
        const baselinePath = baselineCoords
          .filter(point => point && typeof point.lng === 'number' && typeof point.lat === 'number' && !isNaN(point.lng) && !isNaN(point.lat))
          .map(point => [point.lng, point.lat]);
        
        if (baselinePath.length === 0) {
          console.warn('基准轨迹坐标点无效');
          return;
        }

        const baselinePolyline = new (window as any).AMap.Polyline({
          path: baselinePath,
          strokeColor: '#666666',
          strokeWeight: 3,
          strokeStyle: 'solid',
          strokeOpacity: 0.8,
          showDir: true,
          dirColor: '#666666'
        });

        trajectoryLines.value.baseline = baselinePolyline
        if (legendState.value.baseline) {
          linesToAdd.push(baselinePolyline)
        }
        allPaths.push(...baselinePath);
      }

      // 转换并创建原始轨迹
      if (props.originalPoints && props.originalPoints.length > 0) {
        const convertedOriginal = convertCoordinates(props.originalPoints);
        const originalPath = convertedOriginal
          .filter((point: GPSPoint) => point && typeof point.lng === 'number' && typeof point.lat === 'number' && !isNaN(point.lng) && !isNaN(point.lat))
          .map((point: GPSPoint) => [point.lng, point.lat]);
        const originalPolyline = new (window as any).AMap.Polyline({
          path: originalPath,
          strokeColor: '#FF5722',
          strokeWeight: 2,
          strokeOpacity: 0.6,
          strokeStyle: 'solid',
          showDir: true,
          dirColor: '#FF5722'
        })
        trajectoryLines.value.original = originalPolyline
        if (legendState.value.original) {
          linesToAdd.push(originalPolyline)
        }
        allPaths.push(...originalPath);
      }

      // 类似地转换processedPoints
      if (props.processedPoints && props.processedPoints.length > 0) {
        const convertedProcessed = convertCoordinates(props.processedPoints);
        const processedPath = convertedProcessed
          .filter((point: GPSPoint) => point && typeof point.lng === 'number' && typeof point.lat === 'number' && !isNaN(point.lng) && !isNaN(point.lat))
          .map((point: GPSPoint) => [point.lng, point.lat]);
        const processedPolyline = new (window as any).AMap.Polyline({
          path: processedPath,
          strokeColor: '#4CAF50',
          strokeWeight: 3,
          strokeOpacity: 0.8,
          strokeStyle: 'solid',
          showDir: true,
          dirColor: '#4CAF50'
        });
        trajectoryLines.value.processed = processedPolyline
        if (legendState.value.processed) {
          linesToAdd.push(processedPolyline)
        }
        allPaths.push(...processedPath);
      }



      // 添加可见的轨迹线到地图
      if (linesToAdd.length > 0 && allPaths.length > 0) {
        try {
          map.value.add(linesToAdd);
          polylines.value = linesToAdd;
          console.log('添加轨迹线成功，路径点数量:', allPaths.length);
        } catch (error) {
          console.error('添加轨迹线失败:', error);
          console.log('轨迹线路径:', allPaths);
        }
      } else {
        console.warn('没有有效的轨迹线可添加');
      }

      // 添加起点和终点标记
      const pointsForMarkers = props.processedPoints?.length > 0 ? props.processedPoints : props.originalPoints;
      if (pointsForMarkers && pointsForMarkers.length > 0) {
        const convertedPointsForMarkers = convertCoordinates(pointsForMarkers)
          .filter(point => point && typeof point.lng === 'number' && typeof point.lat === 'number' && !isNaN(point.lng) && !isNaN(point.lat));

        if (convertedPointsForMarkers.length === 0) {
          console.warn('起点和终点标记坐标点无效');
          return;
        }

        const startPoint = convertedPointsForMarkers[0];
        const endPoint = convertedPointsForMarkers[convertedPointsForMarkers.length - 1];

        const startMarker = new (window as any).AMap.Marker({
          position: [startPoint.lng, startPoint.lat],
          icon: new (window as any).AMap.Icon({
            size: new (window as any).AMap.Size(25, 34),
            image: 'https://webapi.amap.com/theme/v1.3/markers/n/start.png'
          }),
          title: '起点'
        });

        const endMarker = new (window as any).AMap.Marker({
          position: [endPoint.lng, endPoint.lat],
          icon: new (window as any).AMap.Icon({
            size: new (window as any).AMap.Size(25, 34),
            image: 'https://webapi.amap.com/theme/v1.3/markers/n/end.png'
          }),
          title: '终点'
        });

        markers.value = [startMarker, endMarker];
        map.value.add(markers.value);
      }

      // 添加模拟标记
      if (props.simulationMarkers && props.simulationMarkers.length > 0) {
        console.log('添加标记点:', props.simulationMarkers);
        const simulationMarkers = props.simulationMarkers.map((marker: { type: 'tunnel' | 'drift' | 'speed', position: { lat: number, lng: number }, info: string }) => {
          // 验证坐标有效性
          if (!marker.position || typeof marker.position.lat !== 'number' || typeof marker.position.lng !== 'number' ||
              isNaN(marker.position.lat) || isNaN(marker.position.lng)) {
            console.warn('无效的标记点坐标:', marker);
            return null;
          }

          const convertedMarkers = convertCoordinates([{
            lat: marker.position.lat,
            lng: marker.position.lng,
            timestamp: Date.now()
          }]);

          if (!convertedMarkers || !convertedMarkers[0]) {
            console.warn('坐标转换失败:', marker);
            return null;
          }

          const convertedPos = convertedMarkers[0];
          console.log(`处理标记点 - 类型: ${marker.type}, 位置: [${convertedPos.lat}, ${convertedPos.lng}], 信息: ${marker.info}`);

          const markerIcon = {
            tunnel: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#8B4513" stroke="#654321" stroke-width="2"/><text x="10" y="14" text-anchor="middle" fill="white" font-size="10" font-weight="bold">T</text></svg>`,
            drift: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#FF6B35" stroke="#E55A2B" stroke-width="2"/><text x="10" y="14" text-anchor="middle" fill="white" font-size="10" font-weight="bold">D</text></svg>`,
            speed: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#2196F3" stroke="#1976D2" stroke-width="2"/><text x="10" y="14" text-anchor="middle" fill="white" font-size="10" font-weight="bold">S</text></svg>`
          };

          const markerObj = new (window as any).AMap.Marker({
            position: [convertedPos.lng, convertedPos.lat],
            icon: new (window as any).AMap.Icon({
              size: new (window as any).AMap.Size(20, 20),
              image: 'data:image/svg+xml;base64,' + btoa(markerIcon[marker.type])
            }),
            title: marker.info,
            offset: new (window as any).AMap.Pixel(-10, -10),
            zIndex: 110,
            extData: { type: marker.type }
          });

          // 添加点击事件
          markerObj.on('click', () => {
            const info = new (window as any).AMap.InfoWindow({
              content: `<div style="padding:10px;">${marker.info}</div>`,
              offset: new (window as any).AMap.Pixel(0, -30)
            });
            info.open(map.value, markerObj.getPosition());
          });

          return markerObj;
        });

        // 过滤掉无效的标记点
        const validSimulationMarkers = simulationMarkers.filter(marker => marker !== null);
        if (validSimulationMarkers.length > 0) {
          markers.value.push(...validSimulationMarkers);
          map.value.add(validSimulationMarkers);
        }
      }

      // 添加基准点重建标记
      if (props.basePointRebuildMarkers && props.basePointRebuildMarkers.length > 0) {
        const rebuildMarkers = props.basePointRebuildMarkers.map((marker: { type: 'rebuild', position: { lat: number, lng: number }, info: string }) => {
          // 验证坐标有效性
          if (!marker.position || typeof marker.position.lat !== 'number' || typeof marker.position.lng !== 'number' ||
              isNaN(marker.position.lat) || isNaN(marker.position.lng)) {
            console.warn('无效的重建点坐标:', marker);
            return null;
          }

          const convertedMarkers = convertCoordinates([{
            lat: marker.position.lat,
            lng: marker.position.lng,
            timestamp: Date.now()
          }]);

          if (!convertedMarkers || !convertedMarkers[0]) {
            console.warn('坐标转换失败:', marker);
            return null;
          }

          const convertedPos = convertedMarkers[0];

          return new (window as any).AMap.Marker({
            position: [convertedPos.lng, convertedPos.lat],
            icon: new (window as any).AMap.Icon({
              size: new (window as any).AMap.Size(20, 20),
              image: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#9c27b0" stroke="#7b1fa2" stroke-width="2"/><text x="10" y="14" text-anchor="middle" fill="white" font-size="10" font-weight="bold">R</text></svg>`)
            }),
            title: marker.info
          });
        });

        // 过滤掉无效的重建点标记
        const validRebuildMarkers = rebuildMarkers.filter(marker => marker !== null);
        if (validRebuildMarkers.length > 0) {
          markers.value.push(...validRebuildMarkers);
          map.value.add(validRebuildMarkers);
        }
      }

      // 自适应显示所有点
      if (allPaths.length > 0) {
        map.value.setFitView();
      }
    }

    // 清除地图数据
    const clearMapData = () => {
      if (!map.value) return;

      // 清除轨迹线
      if (polylines.value.length > 0) {
        map.value.remove(polylines.value);
        polylines.value = [];
      }

      // 清除轨迹线存储
      Object.values(trajectoryLines.value).forEach(line => {
        if (line && map.value) {
          map.value.remove(line);
        }
      });
      trajectoryLines.value = {};

      // 清除标记点
      if (markers.value.length > 0) {
        map.value.remove(markers.value);
        markers.value = [];
      }
    }

    // 监听点数据变化和坐标转换开关变化
     watch(() => [props.originalPoints, props.processedPoints, props.baselinePoints, props.simulationMarkers, props.basePointRebuildMarkers, props.enableCoordinateConversion], updateMapData, { deep: true })

    onMounted(() => {
  initMap()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (map.value) {
    map.value.destroy()
  }
  window.removeEventListener('resize', handleResize)
})

const handleResize = () => {
  if (map.value) {
    map.value.resize()
    if (polylines.value.length > 0) {
      map.value.setFitView()
    }
  }
}

    return {
      mapId,
      polylines,
      legendState,
      hasAnyTrajectory,
      toggleTrajectory,
      toggleCoordinateConversion
    }
  }
})
</script>

<style scoped>
.amap-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.legend {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 160px;
}

.legend-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: #333;
  font-size: 14px;
  border-bottom: 1px solid #eee;
  padding-bottom: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.coordinate-switch {
  margin-left: 10px;
}

.switch-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  user-select: none;
}

.switch-input {
  display: none;
}

.switch-slider {
  position: relative;
  width: 32px;
  height: 16px;
  background-color: #ccc;
  border-radius: 16px;
  transition: background-color 0.3s;
  margin-right: 6px;
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: white;
  top: 2px;
  left: 2px;
  transition: transform 0.3s;
}

.switch-input:checked + .switch-slider {
  background-color: #4CAF50;
}

.switch-input:checked + .switch-slider::before {
  transform: translateX(16px);
}

.switch-text {
  font-size: 11px;
  color: #666;
  white-space: nowrap;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  user-select: none;
}

.legend-item:hover {
  background-color: rgba(0, 0, 0, 0.08);
  transform: translateX(2px);
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-item-hidden {
  opacity: 0.5;
  background-color: rgba(0, 0, 0, 0.05);
}

.legend-item-hidden:hover {
  opacity: 0.7;
}

.legend-color {
  width: 20px;
  height: 4px;
  margin-right: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-status {
  margin-left: auto;
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.legend-item-hidden .legend-status {
  color: #999;
}
</style>
