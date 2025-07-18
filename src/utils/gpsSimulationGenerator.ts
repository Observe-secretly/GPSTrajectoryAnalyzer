/**
 * GPS模拟数据生成器实现
 * 支持多种GPS异常场景的模拟生成
 */

import {
  ISimulationGenerator,
  GPSPoint,
  MarkerInfo,
  SimulationOptions
} from './gpsAlgorithmPackage';

/** GPS异常类型 */
type DriftType = 'static' | 'moving' | 'tunnel' | 'speed';

/** 漂移配置 */
interface DriftConfig {
  type: DriftType;
  startIndex: number;
  endIndex: number;
  distance: number;
  direction: number;
  intensity: number;
}

/** 默认模拟选项 */
const DEFAULT_SIMULATION_OPTIONS: Required<SimulationOptions> = {
  staticDriftCount: 5,     // 静态漂移基准点数量
  movingDriftCount: 5,     // 运动漂移基准点数量
  tunnelCount: 3,          // 隧道数量
  speedScenarioCount: 4,   // 高速场景数量
  driftDistanceRange: [10, 200],  // 漂移距离范围
  driftDistribution: [
    { ratio: 0.9, range: [10, 50] },    // 90% 在10-50米范围
    { ratio: 0.1, range: [50, 200] }    // 10% 在50-200米范围
  ]
};

/**
 * GPS模拟数据生成器实现类
 */
export class GPSSimulationGenerator implements ISimulationGenerator {
  
  /**
   * 生成模拟测试数据
   */
  generateSimulatedData(
    originalData: GPSPoint[], 
    options?: SimulationOptions
  ): { points: GPSPoint[]; markers: MarkerInfo[] } {
    
    if (originalData.length === 0) {
      return { points: [], markers: [] };
    }
    
    const opts = { ...DEFAULT_SIMULATION_OPTIONS, ...options };
    const simulatedPoints = [...originalData];
    const markers: MarkerInfo[] = [];
    
    // 生成漂移配置
    const driftConfigs = this.generateDriftConfigs(originalData.length, opts);
    
    // 应用各种漂移效果
    for (const config of driftConfigs) {
      this.applyDriftEffect(simulatedPoints, config, markers);
    }
    
    // 过滤掉被标记为删除的点
    const filteredPoints = simulatedPoints.filter(point => !point.isDeleted);
    
    // 清理isDeleted属性
    filteredPoints.forEach(point => {
      delete point.isDeleted;
    });
    
    // 按时间戳排序
    filteredPoints.sort((a, b) => a.timestamp - b.timestamp);
    markers.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // 移除重复点
    const uniquePoints = new Map();
    for (const point of filteredPoints) {
      const key = `${point.lat},${point.lng},${point.timestamp}`;
      uniquePoints.set(key, point);
    }
    const finalPoints = Array.from(uniquePoints.values());
    
    return { points: finalPoints, markers };
  }
  
  /**
   * 生成漂移配置
   */
  private generateDriftConfigs(dataLength: number, options: Required<SimulationOptions>): DriftConfig[] {
    const configs: DriftConfig[] = [];
    
    // 静态漂移
    for (let i = 0; i < options.staticDriftCount; i++) {
      const startIndex = Math.floor(Math.random() * (dataLength * 0.8));
      const duration = Math.floor(Math.random() * 15) + 5; // 5-20个点，减少持续时间
      const endIndex = Math.min(startIndex + duration, dataLength - 1);
      
      configs.push({
        type: 'static',
        startIndex,
        endIndex,
        distance: this.getRandomDistance(options.driftDistribution),
        direction: Math.random() * 360,
        intensity: Math.random() * 0.3 + 0.2 // 0.2-0.5，降低强度使漂移更自然
      });
    }
    
    // 运动漂移
    for (let i = 0; i < options.movingDriftCount; i++) {
      const startIndex = Math.floor(Math.random() * (dataLength * 0.6)) + Math.floor(dataLength * 0.2);
      const duration = Math.floor(Math.random() * 10) + 5; // 5-15个点，减少持续时间
      const endIndex = Math.min(startIndex + duration, dataLength - 1);
      
      configs.push({
        type: 'moving',
        startIndex,
        endIndex,
        distance: this.getRandomDistance(options.driftDistribution),
        direction: Math.random() * 360,
        intensity: Math.random() * 0.2 + 0.2 // 0.2-0.4，降低强度使漂移更自然
      });
    }
    
    // 隧道效应
    for (let i = 0; i < options.tunnelCount; i++) {
      const startIndex = Math.floor(Math.random() * (dataLength * 0.7));
      const duration = Math.floor(Math.random() * 20) + 10; // 10-30个点，减少持续时间
      const endIndex = Math.min(startIndex + duration, dataLength - 1);
      
      configs.push({
        type: 'tunnel',
        startIndex,
        endIndex,
        distance: this.getRandomDistance(options.driftDistribution) * 1.2, // 隧道漂移稍大
        direction: Math.random() * 360,
        intensity: Math.random() * 0.3 + 0.4 // 0.4-0.7，降低强度使漂移更自然
      });
    }
    
    // 高速场景
    for (let i = 0; i < options.speedScenarioCount; i++) {
      const startIndex = Math.floor(Math.random() * (dataLength * 0.5)) + Math.floor(dataLength * 0.3);
      const duration = Math.floor(Math.random() * 15) + 10; // 10-25个点，减少持续时间
      const endIndex = Math.min(startIndex + duration, dataLength - 1);
      
      configs.push({
        type: 'speed',
        startIndex,
        endIndex,
        distance: this.getRandomDistance(options.driftDistribution) * 1.5, // 高速漂移稍大
        direction: Math.random() * 360,
        intensity: Math.random() * 0.3 + 0.5 // 0.5-0.8，降低强度使漂移更自然
      });
    }
    
    // 按开始索引排序，避免重叠
    configs.sort((a, b) => a.startIndex - b.startIndex);
    
    // 调整重叠的配置
    for (let i = 1; i < configs.length; i++) {
      if (configs[i].startIndex < configs[i - 1].endIndex) {
        configs[i].startIndex = configs[i - 1].endIndex + 1;
        if (configs[i].startIndex >= configs[i].endIndex) {
          configs[i].endIndex = Math.min(configs[i].startIndex + 10, dataLength - 1);
        }
      }
    }
    
    return configs.filter(config => config.startIndex < config.endIndex);
  }
  
  /**
   * 根据分布获取随机距离
   */
  private getRandomDistance(distribution: { ratio: number; range: [number, number] }[]): number {
    const random = Math.random();
    let cumulativeRatio = 0;
    
    for (const dist of distribution) {
      cumulativeRatio += dist.ratio;
      if (random <= cumulativeRatio) {
        const [min, max] = dist.range;
        return Math.random() * (max - min) + min;
      }
    }
    
    // 默认返回最后一个范围的随机值
    const lastDist = distribution[distribution.length - 1];
    const [min, max] = lastDist.range;
    return Math.random() * (max - min) + min;
  }
  
  /**
   * 应用漂移效果
   */
  private applyDriftEffect(
    points: GPSPoint[], 
    config: DriftConfig, 
    markers: MarkerInfo[]
  ): void {
    
    switch (config.type) {
      case 'static':
        this.applyStaticDrift(points, config, markers);
        break;
      case 'moving':
        this.applyMovingDrift(points, config, markers);
        break;
      case 'tunnel':
        this.applyTunnelEffect(points, config, markers);
        break;
      case 'speed':
        this.applySpeedScenario(points, config, markers);
        break;

    }
  }
  
  /**
   * 应用静态漂移
   */
  private applyStaticDrift(
    points: GPSPoint[], 
    config: DriftConfig, 
    markers: MarkerInfo[]
  ): void {
    
    if (config.startIndex >= points.length) return;
    
    const basePoint = points[config.startIndex];
    const driftPointCount = Math.floor(Math.random() * 11) + 10; // 10-20个漂移点
    
    // 生成多个漂移点
    for (let j = 0; j < driftPointCount; j++) {
      // 随机选择漂移距离，90%概率小距离，10%概率大距离
      const useSmallRange = Math.random() < 0.9;
      const distance = useSmallRange ?
        10 + Math.random() * 40 : // 10-50米
        50 + Math.random() * 150; // 50-200米
      
      // 随机方向
      const direction = Math.random() * 360;
      const driftPoint = this.calculateDriftPoint(basePoint, distance, direction);
      
      // 添加漂移点
      points.push({
        lat: driftPoint.lat,
        lng: driftPoint.lng,
        timestamp: basePoint.timestamp + j * 1000 // 每个点间隔1秒
      });
      
      // 为主要漂移点添加标记
      if (j === 0) {
        markers.push({
          type: 'drift',
          position: { lat: driftPoint.lat, lng: driftPoint.lng },
          info: `静态漂移 (${Math.round(distance)}m)`,
          timestamp: basePoint.timestamp
        });
      }
    }
  }
  
  /**
   * 应用运动漂移
   */
  private applyMovingDrift(
    points: GPSPoint[], 
    config: DriftConfig, 
    markers: MarkerInfo[]
  ): void {
    
    if (config.startIndex >= points.length) return;
    
    const basePoint = points[config.startIndex];
    const driftPointCount = Math.floor(Math.random() * 3) + 3; // 3-5个漂移点
    
    // 生成多个漂移点
    for (let j = 0; j < driftPointCount; j++) {
      // 随机选择漂移距离，90%概率小距离，10%概率大距离
      const useSmallRange = Math.random() < 0.9;
      const distance = useSmallRange ?
        10 + Math.random() * 40 : // 10-50米
        50 + Math.random() * 150; // 50-200米
      
      // 随机方向
      const direction = Math.random() * 360;
      const driftPoint = this.calculateDriftPoint(basePoint, distance, direction);
      
      // 添加漂移点
      points.push({
        lat: driftPoint.lat,
        lng: driftPoint.lng,
        timestamp: basePoint.timestamp + j * 1000 // 每个点间隔1秒
      });
      
      // 为主要漂移点添加标记
      if (j === 0) {
        markers.push({
          type: 'drift',
          position: { lat: driftPoint.lat, lng: driftPoint.lng },
          info: `运动漂移 (${Math.round(distance)}m)`,
          timestamp: basePoint.timestamp
        });
      }
    }
  }
  
  /**
   * 应用隧道效应
   */
  private applyTunnelEffect(
    points: GPSPoint[], 
    config: DriftConfig, 
    markers: MarkerInfo[]
  ): void {
    
    if (config.startIndex >= points.length) return;
    
    // 随机选择要删除的点数（10-20个）
    const pointsToRemove = Math.floor(Math.random() * 11) + 10;
    const endIndex = Math.min(config.startIndex + pointsToRemove, points.length);
    
    // 添加隧道标记
    if (config.startIndex < points.length) {
      markers.push({
        type: 'tunnel',
        position: { lat: points[config.startIndex].lat, lng: points[config.startIndex].lng },
        info: `隧道效应 (${endIndex - config.startIndex}点)`,
        timestamp: points[config.startIndex].timestamp
      });
    }
    
    // 标记要删除的点（不直接删除，避免影响索引）
    for (let i = config.startIndex; i < endIndex; i++) {
      if (i < points.length) {
        points[i].isDeleted = true; // 标记为删除
      }
    }
  }
  
  /**
   * 应用高速场景
   */
  private applySpeedScenario(
    points: GPSPoint[], 
    config: DriftConfig, 
    markers: MarkerInfo[]
  ): void {
    
    if (config.startIndex >= points.length) return;
    
    const basePoint = points[config.startIndex];
    const totalPoints = config.endIndex - config.startIndex + 1;
    
    // 识别直线段：计算相邻点之间的方向变化
    const isLinearSegment = (p1: GPSPoint, p2: GPSPoint, p3: GPSPoint): boolean => {
      const angle1 = Math.atan2(p2.lat - p1.lat, p2.lng - p1.lng);
      const angle2 = Math.atan2(p3.lat - p2.lat, p3.lng - p2.lng);
      const angleDiff = Math.abs(angle1 - angle2) * 180 / Math.PI;
      return angleDiff < 15; // 方向变化小于15度认为是直线
    };
    
    // 计算两点之间的距离
    const getDistance = (p1: GPSPoint, p2: GPSPoint): number => {
      const R = 6371000; // 地球半径（米）
      const lat1 = p1.lat * Math.PI / 180;
      const lat2 = p2.lat * Math.PI / 180;
      const dLat = lat2 - lat1;
      const dLng = (p2.lng - p1.lng) * Math.PI / 180;
      
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };
    
    // 标记需要保留的点
    const keepPoint = new Array(points.length).fill(true);
    let lastKeptIndex = config.startIndex;
    
    // 在直线段上删除部分点，模拟数据缺失
    for (let i = config.startIndex + 2; i < config.endIndex && i < points.length - 1; i++) {
      if (isLinearSegment(points[lastKeptIndex], points[i-1], points[i])) {
        const distance = getDistance(points[lastKeptIndex], points[i]);
        if (distance < 100) { // 距离小于100米的直线段上删除点
          keepPoint[i-1] = false; // 删除中间点
        } else {
          lastKeptIndex = i-1;
        }
      } else {
        lastKeptIndex = i;
      }
    }
    
    // 应用漂移效果到保留的点
    for (let i = config.startIndex; i <= config.endIndex && i < points.length; i++) {
      if (!keepPoint[i]) continue;
      
      const progress = (i - config.startIndex) / Math.max(totalPoints - 1, 1);
      const speedWave = Math.sin(progress * Math.PI * 2) * config.intensity; // 减少周期
      const currentDistance = config.distance * Math.abs(speedWave);
      const currentDirection = config.direction + Math.cos(progress * Math.PI) * 30; // 减小方向变化
      
      const driftPoint = this.calculateDriftPoint(points[i], currentDistance, currentDirection);
      const randomOffset = this.getRandomOffset(config.distance * 0.05);
      
      points[i] = {
        lat: driftPoint.lat + randomOffset.lat,
        lng: driftPoint.lng + randomOffset.lng,
        timestamp: points[i].timestamp
      };
    }
    
    // 删除标记为false的点
    for (let i = points.length - 1; i >= 0; i--) {
      if (!keepPoint[i]) {
        points.splice(i, 1);
      }
    }
    
    // 添加高速标记，确保标记分布均匀
    const markerCount = Math.min(3, Math.floor((config.endIndex - config.startIndex) / 10));
    for (let i = 0; i < markerCount; i++) {
      const markerIndex = config.startIndex + Math.floor(i * (config.endIndex - config.startIndex) / (markerCount - 1 || 1));
      if (markerIndex < points.length) {
        markers.push({
          type: 'speed',
          position: { lat: points[markerIndex].lat, lng: points[markerIndex].lng },
          info: `高速场景 (${Math.round(config.distance)}m)`,
          timestamp: points[markerIndex].timestamp
        });
      }
    }
  }
  
  /**
   * 计算漂移点坐标
   */
  private calculateDriftPoint(
    basePoint: GPSPoint, 
    distance: number, 
    direction: number
  ): { lat: number; lng: number } {
    
    const earthRadius = 6371000; // 地球半径（米）
    const directionRad = direction * Math.PI / 180;
    
    // 计算纬度偏移
    const latOffset = (distance * Math.cos(directionRad)) / earthRadius * (180 / Math.PI);
    
    // 计算经度偏移（考虑纬度影响）
    const lngOffset = (distance * Math.sin(directionRad)) / 
                     (earthRadius * Math.cos(basePoint.lat * Math.PI / 180)) * (180 / Math.PI);
    
    return {
      lat: basePoint.lat + latOffset,
      lng: basePoint.lng + lngOffset
    };
  }
  
  /**
   * 获取随机偏移
   */
  private getRandomOffset(maxOffset: number): { lat: number; lng: number } {
    const earthRadius = 6371000;
    // 使用高斯分布生成更自然的随机偏移
    const distance = Math.min(
      maxOffset,
      Math.abs((Math.random() + Math.random() + Math.random() - 1.5) * maxOffset)
    );
    const direction = Math.random() * 360 * Math.PI / 180;
    
    // 考虑纬度影响，使偏移更准确
    const latOffset = (distance * Math.cos(direction)) / earthRadius * (180 / Math.PI);
    const lngOffset = (distance * Math.sin(direction)) / earthRadius * (180 / Math.PI);
    
    return { lat: latOffset, lng: lngOffset };
  }
  
  /**
   * 生成特定类型的测试数据
   */
  generateSpecificScenario(
    originalData: GPSPoint[],
    scenarioType: DriftType,
    intensity: number = 1.0
  ): { points: GPSPoint[]; markers: MarkerInfo[] } {
    
    if (originalData.length === 0) {
      return { points: [], markers: [] };
    }
    
    const simulatedPoints = [...originalData];
    const markers: MarkerInfo[] = [];
    
    const startIndex = Math.floor(originalData.length * 0.3);
    const endIndex = Math.floor(originalData.length * 0.7);
    
    const config: DriftConfig = {
      type: scenarioType,
      startIndex,
      endIndex,
      distance: 200 * intensity,
      direction: Math.random() * 360,
      intensity
    };
    
    this.applyDriftEffect(simulatedPoints, config, markers);
    
    return { points: simulatedPoints, markers };
  }
  

  
  /**
   * 生成压力测试数据
   */
  generateStressTestData(
    originalData: GPSPoint[],
    complexity: 'low' | 'medium' | 'high' = 'medium'
  ): { points: GPSPoint[]; markers: MarkerInfo[] } {
    
    const complexitySettings = {
      low: { staticDriftCount: 1, movingDriftCount: 1, tunnelCount: 0, speedScenarioCount: 0 },
      medium: { staticDriftCount: 3, movingDriftCount: 2, tunnelCount: 1, speedScenarioCount: 1 },
      high: { staticDriftCount: 5, movingDriftCount: 3, tunnelCount: 2, speedScenarioCount: 2 }
    };
    
    const options: SimulationOptions = {
      ...complexitySettings[complexity],
      driftDistanceRange: [50, 600],
      driftDistribution: [
        { ratio: 0.4, range: [50, 150] },
        { ratio: 0.4, range: [150, 300] },
        { ratio: 0.2, range: [300, 600] }
      ]
    };
    
    return this.generateSimulatedData(originalData, options);
  }
  
  /**
   * 获取模拟统计信息
   */
  getSimulationStats(
    originalData: GPSPoint[],
    simulatedData: GPSPoint[],
    markers: MarkerInfo[]
  ): {
    originalPointsCount: number;
    simulatedPointsCount: number;
    markersCount: number;
    markersByType: Record<string, number>;
    averageDriftDistance: number;
    maxDriftDistance: number;
  } {
    
    const markersByType: Record<string, number> = {};
    let totalDriftDistance = 0;
    let maxDriftDistance = 0;
    let driftCount = 0;
    
    // 统计标记类型
    for (const marker of markers) {
      markersByType[marker.type] = (markersByType[marker.type] || 0) + 1;
      
      // 提取漂移距离信息
      const distanceMatch = marker.info.match(/(\d+)m/);
      if (distanceMatch) {
        const distance = parseInt(distanceMatch[1]);
        totalDriftDistance += distance;
        maxDriftDistance = Math.max(maxDriftDistance, distance);
        driftCount++;
      }
    }
    
    return {
      originalPointsCount: originalData.length,
      simulatedPointsCount: simulatedData.length,
      markersCount: markers.length,
      markersByType,
      averageDriftDistance: driftCount > 0 ? totalDriftDistance / driftCount : 0,
      maxDriftDistance
    };
  }
}

export default GPSSimulationGenerator;