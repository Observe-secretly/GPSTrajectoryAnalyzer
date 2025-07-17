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

/** 漂移类型 */
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
  staticDriftCount: 2,
  movingDriftCount: 1,
  tunnelCount: 1,
  speedScenarioCount: 1,
  driftDistanceRange: [100, 500],
  driftDistribution: [
    { ratio: 0.6, range: [50, 200] },   // 60% 小漂移
    { ratio: 0.3, range: [200, 400] },  // 30% 中等漂移
    { ratio: 0.1, range: [400, 800] }   // 10% 大漂移
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
    
    // 按时间戳排序
    simulatedPoints.sort((a, b) => a.timestamp - b.timestamp);
    markers.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    return { points: simulatedPoints, markers };
  }
  
  /**
   * 生成漂移配置
   */
  private generateDriftConfigs(dataLength: number, options: Required<SimulationOptions>): DriftConfig[] {
    const configs: DriftConfig[] = [];
    
    // 静态漂移
    for (let i = 0; i < options.staticDriftCount; i++) {
      const startIndex = Math.floor(Math.random() * (dataLength * 0.8));
      const duration = Math.floor(Math.random() * 20) + 10; // 10-30个点
      const endIndex = Math.min(startIndex + duration, dataLength - 1);
      
      configs.push({
        type: 'static',
        startIndex,
        endIndex,
        distance: this.getRandomDistance(options.driftDistribution),
        direction: Math.random() * 360,
        intensity: Math.random() * 0.5 + 0.5 // 0.5-1.0
      });
    }
    
    // 运动漂移
    for (let i = 0; i < options.movingDriftCount; i++) {
      const startIndex = Math.floor(Math.random() * (dataLength * 0.6)) + Math.floor(dataLength * 0.2);
      const duration = Math.floor(Math.random() * 15) + 5; // 5-20个点
      const endIndex = Math.min(startIndex + duration, dataLength - 1);
      
      configs.push({
        type: 'moving',
        startIndex,
        endIndex,
        distance: this.getRandomDistance(options.driftDistribution),
        direction: Math.random() * 360,
        intensity: Math.random() * 0.3 + 0.3 // 0.3-0.6
      });
    }
    
    // 隧道效应
    for (let i = 0; i < options.tunnelCount; i++) {
      const startIndex = Math.floor(Math.random() * (dataLength * 0.7));
      const duration = Math.floor(Math.random() * 30) + 20; // 20-50个点
      const endIndex = Math.min(startIndex + duration, dataLength - 1);
      
      configs.push({
        type: 'tunnel',
        startIndex,
        endIndex,
        distance: this.getRandomDistance(options.driftDistribution) * 1.5, // 隧道漂移更大
        direction: Math.random() * 360,
        intensity: Math.random() * 0.4 + 0.6 // 0.6-1.0
      });
    }
    
    // 高速场景
    for (let i = 0; i < options.speedScenarioCount; i++) {
      const startIndex = Math.floor(Math.random() * (dataLength * 0.5)) + Math.floor(dataLength * 0.3);
      const duration = Math.floor(Math.random() * 25) + 15; // 15-40个点
      const endIndex = Math.min(startIndex + duration, dataLength - 1);
      
      configs.push({
        type: 'speed',
        startIndex,
        endIndex,
        distance: this.getRandomDistance(options.driftDistribution) * 2, // 高速漂移更大
        direction: Math.random() * 360,
        intensity: Math.random() * 0.3 + 0.7 // 0.7-1.0
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
    const driftPoint = this.calculateDriftPoint(basePoint, config.distance, config.direction);
    
    // 应用静态漂移到指定范围的点
    for (let i = config.startIndex; i <= config.endIndex && i < points.length; i++) {
      // 添加一些随机变化，避免完全相同
      const randomOffset = this.getRandomOffset(config.distance * 0.1);
      points[i] = {
        lat: driftPoint.lat + randomOffset.lat,
        lng: driftPoint.lng + randomOffset.lng,
        timestamp: points[i].timestamp
      };
    }
    
    // 添加标记
    markers.push({
      type: 'drift',
      position: { lat: driftPoint.lat, lng: driftPoint.lng },
      info: `静态漂移 (${Math.round(config.distance)}m)`,
      timestamp: basePoint.timestamp
    });
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
    const totalPoints = config.endIndex - config.startIndex + 1;
    
    for (let i = config.startIndex; i <= config.endIndex && i < points.length; i++) {
      const progress = (i - config.startIndex) / Math.max(totalPoints - 1, 1);
      
      // 漂移距离随时间变化
      const currentDistance = config.distance * config.intensity * Math.sin(progress * Math.PI);
      const currentDirection = config.direction + progress * 90; // 方向也会变化
      
      const driftPoint = this.calculateDriftPoint(points[i], currentDistance, currentDirection);
      const randomOffset = this.getRandomOffset(config.distance * 0.05);
      
      points[i] = {
        lat: driftPoint.lat + randomOffset.lat,
        lng: driftPoint.lng + randomOffset.lng,
        timestamp: points[i].timestamp
      };
    }
    
    // 添加标记
    markers.push({
      type: 'drift',
      position: { lat: basePoint.lat, lng: basePoint.lng },
      info: `运动漂移 (${Math.round(config.distance)}m)`,
      timestamp: basePoint.timestamp
    });
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
    
    const basePoint = points[config.startIndex];
    const totalPoints = config.endIndex - config.startIndex + 1;
    
    // 隧道效应：开始和结束时漂移较小，中间漂移较大
    for (let i = config.startIndex; i <= config.endIndex && i < points.length; i++) {
      const progress = (i - config.startIndex) / Math.max(totalPoints - 1, 1);
      
      // 使用抛物线函数模拟隧道效应
      const tunnelIntensity = 4 * progress * (1 - progress); // 0到1的抛物线
      const currentDistance = config.distance * tunnelIntensity * config.intensity;
      
      // 隧道中的方向变化更加随机
      const directionVariation = (Math.random() - 0.5) * 180;
      const currentDirection = config.direction + directionVariation;
      
      const driftPoint = this.calculateDriftPoint(points[i], currentDistance, currentDirection);
      const randomOffset = this.getRandomOffset(config.distance * 0.15);
      
      points[i] = {
        lat: driftPoint.lat + randomOffset.lat,
        lng: driftPoint.lng + randomOffset.lng,
        timestamp: points[i].timestamp
      };
    }
    
    // 添加隧道标记
    const midIndex = Math.floor((config.startIndex + config.endIndex) / 2);
    if (midIndex < points.length) {
      markers.push({
        type: 'tunnel',
        position: { lat: points[midIndex].lat, lng: points[midIndex].lng },
        info: `隧道效应 (${Math.round(config.distance)}m)`,
        timestamp: points[midIndex].timestamp
      });
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
    
    // 高速场景：漂移呈现周期性变化，模拟高速移动时的GPS不稳定
    for (let i = config.startIndex; i <= config.endIndex && i < points.length; i++) {
      const progress = (i - config.startIndex) / Math.max(totalPoints - 1, 1);
      
      // 使用正弦波模拟高速时的周期性漂移
      const speedWave = Math.sin(progress * Math.PI * 4) * config.intensity; // 4个周期
      const currentDistance = config.distance * Math.abs(speedWave);
      
      // 方向也呈周期性变化
      const directionWave = Math.cos(progress * Math.PI * 3) * 45; // 3个周期，±45度变化
      const currentDirection = config.direction + directionWave;
      
      const driftPoint = this.calculateDriftPoint(points[i], currentDistance, currentDirection);
      const randomOffset = this.getRandomOffset(config.distance * 0.08);
      
      points[i] = {
        lat: driftPoint.lat + randomOffset.lat,
        lng: driftPoint.lng + randomOffset.lng,
        timestamp: points[i].timestamp
      };
    }
    
    // 添加高速标记
    markers.push({
      type: 'speed',
      position: { lat: basePoint.lat, lng: basePoint.lng },
      info: `高速场景 (${Math.round(config.distance)}m)`,
      timestamp: basePoint.timestamp
    });
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
    const distance = Math.random() * maxOffset;
    const direction = Math.random() * 360 * Math.PI / 180;
    
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