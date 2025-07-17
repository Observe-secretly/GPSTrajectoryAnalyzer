<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import AmapContainer from '../components/AmapContainer.vue'
import { GPSProcessor, ProcessorConfig } from '../utils/gpsProcessor'
import { GPSDataConverter } from '../utils/gpsDataConverter'

// 类型定义
interface GPSPoint {
  lat: number
  lng: number
  timestamp: number
}

interface SimulationMarker {
  type: 'tunnel' | 'drift' | 'speed'
  position: GPSPoint
  info: string
}

interface RebuildMarker {
  type: 'rebuild'
  position: GPSPoint
  info: string
}

interface ProcessedResult {
  originalPoints: GPSPoint[]
  processedPoints: GPSPoint[]
  filteredPoints: GPSPoint[]
}

interface AlgorithmResult {
  processedPoints: GPSPoint[]
  markers: SimulationMarker[]
}

interface ProcessorStatus {
  slidingWindowSize: number
  validPointsCount: number
  hasBasePoint: boolean
  basePointRadius: number
  consecutiveDriftCount: number
  basePointAge: number
  isBasePointExpired: boolean
  basePoint: { lat: number; lng: number } | null
  discardedDriftPointsCount: number
  basePointRebuildsCount: number
  basePointRebuildPositions: GPSPoint[]
}

// 响应式状态
const gpsInput = ref('')
const processedResult = ref<ProcessedResult | null>(null)
const gpsProcessor = new GPSProcessor()
const dataConverter = new GPSDataConverter()
const isPanelExpanded = ref(true)
const showInputMode = ref(true) // true: 输入模式, false: 参数调整模式
const enableCoordinateConversion = ref(true)
const showBaselineTrajectory = ref(true)

// 算法包相关
const useNewAlgorithm = ref(false) // 是否使用新算法包
const algorithmResult = ref<AlgorithmResult | null>(null) // 新算法包处理结果

// 标记点显示控制
const showTunnelMarkers = ref(true)
const showDriftMarkers = ref(true)
const showSpeedMarkers = ref(true)
const showRebuildMarkers = ref(true)

// 模拟数据相关
const isSimulationMode = ref(false)
const simulationInfo = ref('')
const simulationMarkers = ref<SimulationMarker[]>([])
const basePointRebuildMarkers = ref<RebuildMarker[]>([])
const baselineTrajectory = ref<GPSPoint[]>([])

// 参数配置
const processorConfig = reactive<ProcessorConfig>({
  windowSize: 10,
  validityPeriod: 180000,
  maxDriftSequence: 5,
  driftThresholdMultiplier: 2.0,
  linearMotionAngleThreshold: 30 // 添加直线漂移点误判角度参数
})

// 运行时状态
const processorStatus = ref<ProcessorStatus | null>(null)

// 计算过滤率
const filterRate = computed(() => {
  if (processedResult.value) {
    const { originalPoints, processedPoints } = processedResult.value
    if (originalPoints.length === 0) return 0
    return Math.round(((originalPoints.length - processedPoints.length) / originalPoints.length) * 100)
  }
  return 0
})

// 获取当前处理结果的统一接口
const currentProcessedPoints = computed<GPSPoint[]>(() => {
  if (useNewAlgorithm.value && algorithmResult.value) {
    return algorithmResult.value.processedPoints
  } else if (processedResult.value) {
    return processedResult.value.processedPoints
  }
  return []
})

const currentOriginalPoints = computed<GPSPoint[]>(() => {
  if (useNewAlgorithm.value && algorithmResult.value) {
    // 从算法包结果中获取原始点（需要从统计信息推断）
    return processedResult.value?.originalPoints || []
  } else if (processedResult.value) {
    return processedResult.value.originalPoints
  }
  return []
})

// 获取当前标记信息
const currentMarkers = computed<SimulationMarker[]>(() => {
  if (useNewAlgorithm.value && algorithmResult.value && algorithmResult.value.markers) {
    return algorithmResult.value.markers.map(marker => ({
      type: marker.type,
      position: {
        lat: marker.position.lat,
        lng: marker.position.lng,
        timestamp: Date.now() // 确保每个标记点位置都有时间戳
      },
      info: marker.info
    }))
  }
  return simulationMarkers.value
})

// 过滤后的标记（使用统一接口）
const filteredSimulationMarkers = computed<SimulationMarker[]>(() => {
  return currentMarkers.value.filter(marker => {
    if (marker.type === 'tunnel') return showTunnelMarkers.value
    if (marker.type === 'drift') return showDriftMarkers.value
    if (marker.type === 'speed') return showSpeedMarkers.value
    return true
  })
})

const filteredRebuildMarkers = computed<RebuildMarker[]>(() => {
  return showRebuildMarkers.value ? basePointRebuildMarkers.value : []
})

// 更新处理器配置
const updateProcessorConfig = () => {
  // 更新处理器配置
  gpsProcessor.updateConfig(processorConfig)
  // 如果有处理结果，重新处理数据
  if (processedResult.value && gpsInput.value.trim()) {
    processGPS()
  }
}

// 刷新状态
const refreshStatus = () => {
  processorStatus.value = gpsProcessor.getStatus()
}

// 处理GPS数据
const processGPS = () => {
  if (!gpsInput.value.trim()) return

  try {
    // 解析GPS数据并添加时间戳
    const points = dataConverter.parseFromString(gpsInput.value).map((point, index) => ({
      ...point,
      timestamp: Date.now() + index * 1000 // 确保每个点都有时间戳
    })) as GPSPoint[]
    if (points.length === 0) {
      alert('未能解析到有效的GPS坐标，请检查输入格式')
      return
    }
    
    // 更新配置
    gpsProcessor.updateConfig(processorConfig)
    
    // 处理GPS轨迹
    processedResult.value = gpsProcessor.processTrajectory(points)
    refreshStatus()

    // 创建基准点重建标记
    const status = gpsProcessor.getStatus()
    basePointRebuildMarkers.value = status.basePointRebuildPositions.map((point, index) => ({
      type: 'rebuild' as const,
      position: { lat: point.lat, lng: point.lng },
      info: `基准点重建 #${index + 1}`
    })) || []

    console.log('处理器处理完成:', {
      原始点数: processedResult.value.originalPoints.length,
      处理后点数: processedResult.value.processedPoints.length,
      过滤点数: processedResult.value.originalPoints.length - processedResult.value.processedPoints.length
    })
    
    // 切换到参数调整模式
    showInputMode.value = false
  } catch (error) {
    console.error('GPS数据处理失败:', error)
    alert('GPS数据处理失败，请检查输入格式')
  }
}

// 切换面板显示
const togglePanel = () => {
  isPanelExpanded.value = !isPanelExpanded.value
}

// 结束参数调整，返回输入模式
const finishAdjustment = () => {
  showInputMode.value = true
  isPanelExpanded.value = true
}

// 生成模拟数据
const generateSimulatedData = async () => {
  try {
    // 动态导入JSON数据
    const response = await fetch('/convertedTrajectory.json')
    if (!response.ok) {
      throw new Error('无法加载轨迹数据文件')
    }
    const trajectoryData = await response.json()

    if (trajectoryData.length === 0) {
      alert('轨迹数据为空，无法生成模拟数据')
      return
    }

    // 转换数据格式
    const convertedData = trajectoryData.map((point: any) => ({
      alt: null,
      cog: 0,
      lat: point.lat,
      lon: point.lon,
      spd: 0
    }))

    // 使用旧处理器生成模拟数据
    console.log('使用处理器生成模拟数据')
    const simulatedResult = GPSProcessor.generateSimulatedData(convertedData)
    
    // 设置标记点
    simulationMarkers.value = simulatedResult.markers.map((marker: any) => ({
      type: marker.type as 'tunnel' | 'drift' | 'speed',
      position: {
        lat: marker.position.lat,
        lng: marker.position.lng,
        timestamp: Date.now() // 添加必需的timestamp
      },
      info: marker.info
    }))

    // 转换为GPS输入格式
    const gpsText = simulatedResult.points.map(point => `${point.lat},${point.lng}`).join('\n')
    gpsInput.value = gpsText

    // 设置模拟模式标识
    isSimulationMode.value = true
    
    const tunnelCount = simulationMarkers.value.filter(m => m.type === 'tunnel').length
    const driftCount = simulationMarkers.value.filter(m => m.type === 'drift').length
    const speedCount = simulationMarkers.value.filter(m => m.type === 'speed').length
    simulationInfo.value = `已生成 ${simulatedResult.points.length} 个模拟GPS点，包含${tunnelCount}个隧道、${driftCount}个漂移区域和${speedCount}个高速场景`

    // 创建原始轨迹的processedResult以便在地图上显示
    processedResult.value = {
      originalPoints: simulatedResult.points.map((p: any) => ({
        lat: p.lat,
        lng: p.lng,
        timestamp: p.timestamp || Date.now() // 确保有timestamp
      })),
      processedPoints: [], // 空数组，因为还没有处理
      filteredPoints: [] // 空数组，因为还没有处理
    }

    console.log('模拟数据生成完成:', {
      算法类型: useNewAlgorithm.value ? '新算法包' : '旧处理器',
      原始点数: trajectoryData.length,
      模拟点数: simulatedResult.points.length,
      增加点数: simulatedResult.points.length - trajectoryData.length,
      标记数量: simulationMarkers.value.length
    })

  } catch (error) {
    console.error('生成模拟数据失败:', error)
    alert('生成模拟数据失败，请检查轨迹数据格式')
  }
}

// 加载基准轨迹数据
const loadBaselineTrajectory = async () => {
  try {
    const response = await fetch('/convertedTrajectory.json')
    const data = await response.json()
    baselineTrajectory.value = data.map((point: any, index: number) => ({
      lat: point.lat,
      lng: point.lon,
      timestamp: Date.now() + index * 1000 // 模拟时间戳
    })) as GPSPoint[]
    console.log('基准轨迹加载完成，共', baselineTrajectory.value.length, '个点')
  } catch (error) {
    console.error('加载基准轨迹失败:', error)
  }
}

// 清空数据
const clearData = () => {
  gpsInput.value = ''
  processedResult.value = null
  processorStatus.value = null
  showInputMode.value = true
  isSimulationMode.value = false
  simulationInfo.value = ''
  simulationMarkers.value = []
  basePointRebuildMarkers.value = []
}

// 组件挂载时加载基准轨迹
onMounted(() => {
  loadBaselineTrajectory()
})
</script>

<template>
  <div class="home-container">
    <!-- 统一控制面板 -->
    <div class="control-panel" :class="{ expanded: isPanelExpanded }">
      <div class="panel-header">
        <h1 class="title">{{ showInputMode ? 'DTU GPS点处理演示' : '算法参数调整' }}</h1>
        <div class="header-buttons">
          <button
            v-if="showInputMode"
            @click="togglePanel"
            class="toggle-btn"
          >
            {{ isPanelExpanded ? '收起' : '展开' }}
          </button>
          <template v-else>
            <button
              @click="togglePanel"
              class="toggle-btn"
            >
              {{ isPanelExpanded ? '收起' : '展开' }}
            </button>
            <button
              @click="finishAdjustment"
              class="finish-btn"
            >
              结束
            </button>
          </template>
        </div>
      </div>

      <transition name="slide">
        <div v-show="isPanelExpanded" class="panel-content">
          <!-- GPS输入模式 -->
          <div v-if="showInputMode" class="input-section">
            <div class="input-group">
              <label for="gps-input">输入GPS坐标（每行一个，格式：纬度,经度）：</label>
              <textarea
                id="gps-input"
                v-model="gpsInput"
                class="gps-textarea"
                placeholder="例如：&#10;39.908823,116.397470&#10;39.908900,116.397500&#10;39.909000,116.397600"
                rows="5"
              ></textarea>
              <div class="button-group">
                <button @click="processGPS" class="process-btn" :disabled="!gpsInput.trim()">处理GPS数据</button>
                <button @click="generateSimulatedData" class="simulate-btn">生成模拟数据</button>
                <button @click="clearData" class="clear-btn">清空数据</button>

              </div>
              <!-- 模拟数据信息显示 -->
              <div v-if="isSimulationMode && simulationInfo" class="simulation-info">
                <div class="info-icon">🎯</div>
                <span class="info-text">{{ simulationInfo }}</span>
              </div>
            </div>
          </div>

          <!-- 参数调整模式 -->
          <div v-else class="param-section-container">
            <div class="param-section">
              <h4>核心参数</h4>
              <div class="param-item">
                <label>滑动窗口大小:</label>
                <input
                  type="number"
                  v-model.number="processorConfig.windowSize"
                  min="3"
                  max="20"
                  @change="updateProcessorConfig"
                />
                <span class="param-unit">个点</span>
              </div>
              <div class="param-item">
                <label>基准点有效期:</label>
                <input
                  type="number"
                  v-model.number="processorConfig.validityPeriod"
                  min="5000"
                  max="60000"
                  step="1000"
                  @change="updateProcessorConfig"
                />
                <span class="param-unit">毫秒</span>
              </div>
              <div class="param-item">
                <label>最大连续漂移点:</label>
                <input
                  type="number"
                  v-model.number="processorConfig.maxDriftSequence"
                  min="3"
                  max="20"
                  @change="updateProcessorConfig"
                />
                <span class="param-unit">个点</span>
              </div>
              <div class="param-item">
                <label>漂移判定倍数:</label>
                <input
                  type="number"
                  v-model.number="processorConfig.driftThresholdMultiplier"
                  min="1"
                  max="5"
                  step="0.1"
                  @change="updateProcessorConfig"
                />
                <span class="param-unit">倍</span>
              </div>
              <div class="param-item">
                <label>直线漂移点误判角度:</label>
                <input
                  type="number"
                  v-model.number="processorConfig.linearMotionAngleThreshold"
                  min="5"
                  max="60"
                  step="1"
                  @change="updateProcessorConfig"
                />
                <span class="param-unit">度</span>
              </div>
            </div>

            <div class="param-section" v-if="processorStatus">
              <h4>运行状态</h4>
              <div class="status-item">
                <span class="status-label">滑动窗口:</span>
                <span class="status-value">{{ processorStatus.slidingWindowSize }}/{{ processorConfig.windowSize }}</span>
              </div>
              <div class="status-item">
                <span class="status-label">有效点数:</span>
                <span class="status-value">{{ processorStatus.validPointsCount }}</span>
              </div>
              <div class="status-item">
                <span class="status-label">基准点状态:</span>
                <span class="status-value" :class="{ active: processorStatus.hasBasePoint }">
                  {{ processorStatus.hasBasePoint ? '已建立' : '未建立' }}
                </span>
              </div>
              <div class="status-item" v-if="processorStatus.hasBasePoint">
                <span class="status-label">基准点半径:</span>
                <span class="status-value">{{ processorStatus.basePointRadius.toFixed(2) }}米</span>
              </div>
              <div class="status-item">
                <span class="status-label">连续漂移点:</span>
                <span class="status-value">{{ processorStatus.consecutiveDriftCount }}</span>
              </div>
              <div class="status-item" v-if="processorStatus.hasBasePoint">
                <span class="status-label">基准点年龄:</span>
                <span class="status-value">{{ Math.round(processorStatus.basePointAge / 1000) }}秒</span>
              </div>
              <div class="status-item" v-if="processorStatus.basePoint">
                <span class="status-label">基准点坐标:</span>
                <span class="status-value small">{{ processorStatus.basePoint.lat.toFixed(6) }}, {{ processorStatus.basePoint.lng.toFixed(6) }}</span>
              </div>
              <button @click="refreshStatus" class="refresh-btn">刷新状态</button>
            </div>
          </div>
        </div>
      </transition>
    </div>



    <!-- 主地图展示区域 -->
    <div class="main-map-section">
      <div class="map-header" v-if="processedResult || algorithmResult">
        <!-- 轨迹图例 -->
        <div class="legend">
          <div v-if="baselineTrajectory.length > 0"
                class="legend-item"
                :class="{ 'legend-item-hidden': !showBaselineTrajectory }"
                @click="showBaselineTrajectory = !showBaselineTrajectory">
             <div class="legend-color baseline"></div>
             <span>基准轨迹 ({{ baselineTrajectory.length }}个点)</span>
             <span class="legend-status">{{ showBaselineTrajectory ? '显示' : '隐藏' }}</span>
           </div>
          <div class="legend-item">
            <div class="legend-color original"></div>
            <span>原始轨迹 ({{ currentOriginalPoints.length }}个点)</span>
          </div>
          <div class="legend-item">
            <div class="legend-color processed"></div>
            <span>处理后轨迹 ({{ currentProcessedPoints.length }}个点)</span>
          </div>
          <div class="legend-item" v-if="baselineTrajectory.length > 0">
            <div class="legend-color baseline"></div>
            <span>基准轨迹 ({{ baselineTrajectory.length }}个点)</span>
          </div>
        </div>
        <div class="stats-summary">
          <div class="stat-chip">过滤率: {{ filterRate }}%</div>
          <div class="stat-chip">传统算法</div>
        </div>
      </div>

      <!-- 统计卡片移到左下角 -->
      <div class="stats-card-bottom" v-if="processedResult">
        <h4>处理统计</h4>
        <div class="stat-item">
          <span class="stat-label">忽略漂移点:</span>
          <span class="stat-value">
            {{ gpsProcessor?.getStatus().discardedDriftPointsCount || 0 }}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">基准点重建:</span>
          <span class="stat-value">
            {{ gpsProcessor?.getStatus().basePointRebuildsCount || 0 }}
          </span>
        </div>
      </div>

      <!-- 标记点图例卡片移到右下角 -->
      <div class="markers-card-bottom" v-if="isSimulationMode || basePointRebuildMarkers.length > 0">
        <h4>标记点图例</h4>
        <div class="legend-item clickable"
             v-if="isSimulationMode"
             :class="{ 'legend-item-hidden': !showTunnelMarkers }"
             @click="showTunnelMarkers = !showTunnelMarkers">
          <div class="legend-marker tunnel">T</div>
          <span>隧道标记 ({{ simulationMarkers.filter(m => m.type === 'tunnel').length }}个)</span>
          <span class="legend-status">{{ showTunnelMarkers ? '显示' : '隐藏' }}</span>
        </div>
        <div class="legend-item clickable"
             v-if="isSimulationMode"
             :class="{ 'legend-item-hidden': !showDriftMarkers }"
             @click="showDriftMarkers = !showDriftMarkers">
          <div class="legend-marker drift">D</div>
          <span>漂移标记 ({{ simulationMarkers.filter(m => m.type === 'drift').length }}个)</span>
          <span class="legend-status">{{ showDriftMarkers ? '显示' : '隐藏' }}</span>
        </div>
        <div class="legend-item clickable"
             v-if="isSimulationMode"
             :class="{ 'legend-item-hidden': !showSpeedMarkers }"
             @click="showSpeedMarkers = !showSpeedMarkers">
          <div class="legend-marker speed">S</div>
          <span>高速标记 ({{ simulationMarkers.filter(m => m.type === 'speed').length }}个)</span>
          <span class="legend-status">{{ showSpeedMarkers ? '显示' : '隐藏' }}</span>
        </div>
        <div class="legend-item clickable"
             v-if="basePointRebuildMarkers.length > 0"
             :class="{ 'legend-item-hidden': !showRebuildMarkers }"
             @click="showRebuildMarkers = !showRebuildMarkers">
          <div class="legend-marker rebuild">R</div>
          <span>基准点重建位置 ({{ basePointRebuildMarkers.length }}个)</span>
          <span class="legend-status">{{ showRebuildMarkers ? '显示' : '隐藏' }}</span>
        </div>
      </div>
      <div class="main-map">
        <AmapContainer
          :original-points="currentOriginalPoints"
          :processed-points="currentProcessedPoints"
          :baseline-points="showBaselineTrajectory ? baselineTrajectory : []"
          :simulation-markers="filteredSimulationMarkers"
          :base-point-rebuild-markers="filteredRebuildMarkers"
          v-model:enable-coordinate-conversion="enableCoordinateConversion"
          title="GPS轨迹对比"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  position: relative;
  height: 100vh;
  width: 100vw;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-size: 14px;
}

.control-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.control-panel.expanded {
  min-height: 280px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
}

.title {
  color: #2c3e50;
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.header-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toggle-btn {
  padding: 4px 8px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 12px;
}

.toggle-btn:hover {
  background: #e9ecef;
}

.finish-btn {
  padding: 4px 8px;
  background: #dc3545;
  color: white;
  border: 1px solid #dc3545;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 12px;
}

.finish-btn:hover {
  background: #c82333;
  border-color: #bd2130;
}

.panel-content {
  padding: 0 16px 16px;
}

.slide-enter-active, .slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from, .slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  font-weight: 500;
  color: #34495e;
  font-size: 14px;
}

.gps-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #e1e8ed;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  resize: vertical;
  transition: border-color 0.3s ease;
}

.gps-textarea:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.button-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}



.process-btn, .clear-btn, .simulate-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 12px;
}

.process-btn {
  background: #3498db;
  color: white;
}

.process-btn:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-1px);
}

.process-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.simulate-btn {
  background: #9b59b6;
  color: white;
}

.simulate-btn:hover {
  background: #8e44ad;
  transform: translateY(-1px);
}

.clear-btn {
  background: #e74c3c;
  color: white;
}

.clear-btn:hover {
  background: #c0392b;
  transform: translateY(-1px);
}

.main-map-section {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

.map-header {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.stats-card-bottom {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 5;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid #e9ecef;
  min-width: 140px;
}

.markers-card-bottom {
  position: absolute;
  bottom: 10px;
  right: 200px;
  z-index: 5;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid #e9ecef;
  min-width: 140px;
}

.markers-card-bottom h4 {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 4px;
}

.markers-card-bottom .legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #2c3e50;
}

.markers-card-bottom .legend-item:last-child {
  margin-bottom: 0;
}

.stats-card-bottom h4 {
  margin: 0 0 8px 0;
  color: #2c3e50;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 4px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  padding: 2px 0;
}

.stat-label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.stat-value {
  font-size: 14px;
  color: #e74c3c;
  font-weight: 700;
  background: #ffeaea;
  padding: 2px 6px;
  border-radius: 4px;
  min-width: 20px;
  text-align: center;
}

.legend-marker {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  color: white;
  margin-right: 8px;
}

.legend-marker.tunnel {
  background: #8B4513;
  border: 2px solid #654321;
}

.legend-marker.drift {
  background: #FF6B35;
  border: 2px solid #E55A2B;
}

.legend-marker.speed {
  background: #2196F3;
  border: 2px solid #1976D2;
}

.legend-marker.rebuild {
  background: #9c27b0;
  border: 2px solid #7b1fa2;
}

.markers-legend {
  margin-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.markers-legend h4 {
  margin: 0;
  font-size: 14px;
  color: #2c3e50;
  font-weight: 600;
}

.legend {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #34495e;
}

.legend-item.clickable {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
  user-select: none;
}

.legend-item.clickable:hover {
  background: rgba(52, 152, 219, 0.1);
  transform: translateY(-1px);
}

.legend-item.legend-item-hidden {
  opacity: 0.5;
  background: rgba(0, 0, 0, 0.05);
}

.legend-status {
  margin-left: auto;
  font-size: 10px;
  font-weight: 500;
  color: #666;
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
}

.legend-color {
  width: 14px;
  height: 3px;
  border-radius: 2px;
}

.legend-color.baseline {
  background-color: #666666;
  height: 3px;
}

.legend-color.original {
  background: #FF5722;
}

.legend-color.processed {
  background: #4CAF50;
}

.stats-summary {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.stat-chip {
  background: #e3f2fd;
  color: #1976d2;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
}

.main-map {
  height: 100%;
  width: 100%;
}

/* 参数调整区域样式 */
.param-section-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.param-section {
  background: #f8f9fa;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}

.param-section h4 {
  margin: 0 0 8px 0;
  color: #34495e;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid #3498db;
  padding-bottom: 4px;
}

.param-item {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  gap: 4px;
}

.param-item label {
  flex: 1;
  font-size: 13px;
  color: #555;
  font-weight: 500;
}

.param-item input {
  width: 50px;
  padding: 2px 4px;
  border: 1px solid #ddd;
  border-radius: 2px;
  font-size: 11px;
  text-align: center;
  transition: border-color 0.3s ease;
}

.param-item input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.1);
}

.param-unit {
  font-size: 11px;
  color: #666;
  min-width: 25px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
  padding: 2px 0;
}

.status-label {
  font-size: 12px;
  color: #555;
  font-weight: 500;
}

.status-value {
  font-size: 12px;
  color: #2c3e50;
  font-weight: 600;
}

.status-value.active {
  color: #27ae60;
}

.status-value.small {
  font-size: 10px;
  font-family: 'Courier New', monospace;
}

.refresh-btn {
  width: 100%;
  padding: 4px 8px;
  background: #2ecc71;
  color: white;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
  margin-top: 4px;
  transition: all 0.3s ease;
}

.refresh-btn:hover {
  background: #27ae60;
  transform: translateY(-1px);
}

/* 模拟数据信息样式 */
.simulation-info {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 8px;
  margin-top: 8px;
  font-size: 13px;
  color: #495057;
}

.info-icon {
  font-size: 16px;
}

.info-text {
  flex: 1;
  font-weight: 500;
}

@media (max-width: 768px) {
    .param-section-container {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .button-group {
      flex-direction: column;
    }

    .title {
      font-size: 16px;
    }

    .panel-header {
      padding: 8px 12px;
    }

    .panel-content {
      padding: 0 12px 12px;
    }

    .toggle-btn {
      padding: 4px 6px;
      font-size: 11px;
    }

    .finish-btn {
      padding: 4px 6px;
      font-size: 11px;
    }

    .header-buttons {
      gap: 4px;
    }

    .process-btn, .clear-btn, .simulate-btn, .algorithm-toggle-btn {
      padding: 4px 6px;
      font-size: 11px;
    }
  }

/* 算法切换按钮样式 */
.algorithm-toggle-btn {
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.algorithm-toggle-btn:hover {
  background: #5a6268;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.algorithm-toggle-btn.new-algorithm {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
}

.algorithm-toggle-btn.new-algorithm:hover {
  background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.algorithm-toggle-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.algorithm-toggle-btn:hover::before {
  left: 100%;
}
</style>
