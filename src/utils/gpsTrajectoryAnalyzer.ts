/**
 * GPS轨迹分析算法实现
 * 基于滑动窗口和基准点的GPS漂移检测算法
 */

import {
  IGPSAlgorithm,
  AlgorithmConfig,
  AlgorithmStatus,
  GPSPoint,
  ProcessingResult,
  ProcessingStatistics,
  MarkerInfo,
  DEFAULT_CONFIG
} from './gpsAlgorithmPackage';

/** 算法内部使用的GPS点结构 */
interface InternalGPSPoint {
  lat: number;
  lng: number;
  timestamp: number;
  index?: number;
}

/** 滑动窗口点结构 */
interface WindowPoint {
  point: InternalGPSPoint;
  isValid: boolean;
  isDrift: boolean;
}

/** 基准点信息 */
interface BasePointInfo {
  point: InternalGPSPoint;
  radius: number;
  createdAt: number;
  validPointsCount: number;
}

/**
 * DTU GPS处理算法实现类
 */
export class GpsTrajectoryAnalyzer implements IGPSAlgorithm {
  private config: AlgorithmConfig;
  
  // 算法状态
  private slidingWindow: WindowPoint[] = [];
  private validPoints: InternalGPSPoint[] = [];
  private basePoint: BasePointInfo | null = null;
  private consecutiveDriftCount = 0;
  private processedCount = 0;
  private filteredCount = 0;
  private driftCount = 0;
  private basePointRebuilds = 0;
  private isInitialized = false;
  
  // 处理结果缓存
  private lastProcessingResult: ProcessingResult | null = null;
  
  constructor(config?: Partial<AlgorithmConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reset();
  }
  
  // ==================== 接口实现 ====================
  
  getName(): string {
    return 'GPS Trajectory Analyzer';
  }
  
  getVersion(): string {
    return '1.0.0';
  }
  
  getDescription(): string {
    return '基于滑动窗口和基准点的GPS漂移检测算法，支持动态基准点重建和直线运动误判恢复';
  }
  
  setConfig(config: Partial<AlgorithmConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('info', `配置已更新: ${JSON.stringify(config)}`);
  }
  
  getConfig(): AlgorithmConfig {
    return { ...this.config };
  }
  
  reset(): void {
    this.slidingWindow = [];
    this.validPoints = [];
    this.basePoint = null;
    this.consecutiveDriftCount = 0;
    this.processedCount = 0;
    this.filteredCount = 0;
    this.driftCount = 0;
    this.basePointRebuilds = 0;
    this.isInitialized = true;
    this.lastProcessingResult = null;
    
    this.log('info', '算法状态已重置');
  }
  
  processPoint(point: GPSPoint): boolean {
    if (!this.isInitialized) {
      this.reset();
    }
    
    const internalPoint: InternalGPSPoint = {
      lat: point.lat,
      lng: point.lng,
      timestamp: point.timestamp,
      index: this.processedCount
    };
    
    this.processedCount++;
    
    // 添加到滑动窗口
    this.addToSlidingWindow(internalPoint);
    
    // 检查基准点是否过期
    this.checkBasePointExpiry(internalPoint.timestamp);
    
    // 判断是否为漂移点
    const isDrift = this.isDriftPoint(internalPoint);
    
    if (isDrift) {
      this.consecutiveDriftCount++;
      this.handleDriftPoint(internalPoint);
      return false;
    } else {
      this.consecutiveDriftCount = 0;
      this.handleValidPoint(internalPoint);
      return true;
    }
  }
  
  processTrajectory(points: GPSPoint[]): ProcessingResult {
    const startTime = Date.now();
    
    // 重置状态
    this.reset();
    
    const originalPoints: GPSPoint[] = [...points];
    const processedPoints: GPSPoint[] = [];
    const filteredPoints: GPSPoint[] = [];
    const markers: MarkerInfo[] = [];
    
    // 逐点处理
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const isValid = this.processPoint(point);
      
      if (isValid) {
        processedPoints.push(point);
      } else {
        filteredPoints.push(point);
      }
    }
    
    // 生成标记信息
    this.generateMarkers(markers, originalPoints);
    
    // 构建统计信息
    const statistics: ProcessingStatistics = {
      totalInputPoints: originalPoints.length,
      validOutputPoints: processedPoints.length,
      filteredPointsCount: filteredPoints.length,
      discardedDriftPointsCount: this.driftCount,
      basePointRebuildsCount: this.basePointRebuilds,
      processingTimeMs: Date.now() - startTime,
      filteringRate: originalPoints.length > 0 ? filteredPoints.length / originalPoints.length : 0
    };
    
    const result: ProcessingResult = {
      originalPoints,
      processedPoints,
      filteredPoints,
      statistics,
      markers
    };
    
    this.lastProcessingResult = result;
    
    this.log('info', `轨迹处理完成: 输入${originalPoints.length}点，输出${processedPoints.length}点，过滤${filteredPoints.length}点`);
    
    return result;
  }
  
  getStatus(): AlgorithmStatus {
    return {
      isInitialized: this.isInitialized,
      slidingWindowSize: this.slidingWindow.length,
      validPointsCount: this.validPoints.length,
      hasBasePoint: this.basePoint !== null,
      basePointRadius: this.basePoint?.radius || 0,
      consecutiveDriftCount: this.consecutiveDriftCount,
      basePointAge: this.basePoint ? Date.now() - this.basePoint.createdAt : 0,
      isBasePointExpired: this.isBasePointExpired(),
      basePoint: this.basePoint ? { lat: this.basePoint.point.lat, lng: this.basePoint.point.lng } : null,
      statistics: {
        totalInputPoints: this.processedCount,
        validOutputPoints: this.validPoints.length,
        filteredPointsCount: this.filteredCount,
        discardedDriftPointsCount: this.driftCount,
        basePointRebuildsCount: this.basePointRebuilds
      }
    };
  }
  
  // ==================== 核心算法逻辑 ====================
  
  /** 添加点到滑动窗口 */
  private addToSlidingWindow(point: InternalGPSPoint): void {
    this.slidingWindow.push({
      point,
      isValid: false,
      isDrift: false
    });
    
    // 保持窗口大小
    if (this.slidingWindow.length > this.config.windowSize) {
      this.slidingWindow.shift();
    }
  }
  
  /** 检查基准点是否过期 */
  private checkBasePointExpiry(currentTimestamp: number): void {
    if (this.basePoint && currentTimestamp - this.basePoint.createdAt > this.config.validityPeriod) {
      this.log('debug', '基准点已过期，清除基准点');
      this.basePoint = null;
    }
  }
  
  /** 判断是否为漂移点 */
  private isDriftPoint(point: InternalGPSPoint): boolean {
    if (!this.basePoint) {
      return false; // 没有基准点时不判断漂移
    }
    
    const distance = this.calculateDistance(point, this.basePoint.point);
    const threshold = this.basePoint.radius * this.config.driftThresholdMultiplier;
    
    return distance > threshold;
  }
  
  /** 处理漂移点 */
  private handleDriftPoint(point: InternalGPSPoint): void {
    this.consecutiveDriftCount++;
    this.driftCount++;
    this.filteredCount++;
    
    // 更新滑动窗口中的标记
    const windowPoint = this.slidingWindow[this.slidingWindow.length - 1];
    if (windowPoint) {
      windowPoint.isDrift = true;
    }
    
    this.log('debug', `检测到漂移点: (${point.lat}, ${point.lng}), 连续漂移数: ${this.consecutiveDriftCount}`);
    
    // 检查是否需要重建基准点
    if (this.consecutiveDriftCount >= this.config.maxDriftSequence) {
      this.handleConsecutiveDrift();
    }
  }
  
  /** 处理有效点 */
  private handleValidPoint(point: InternalGPSPoint): void {
    this.consecutiveDriftCount = 0; // 重置连续漂移计数
    this.validPoints.push(point);
    
    // 更新滑动窗口中的标记
    const windowPoint = this.slidingWindow[this.slidingWindow.length - 1];
    if (windowPoint) {
      windowPoint.isValid = true;
    }
    
    // 更新或创建基准点
    this.updateBasePoint();
    
    this.log('debug', `接受有效点: (${point.lat}, ${point.lng})`);
  }
  
  /** 处理连续漂移情况 */
  private handleConsecutiveDrift(): void {
    this.log('info', `检测到连续${this.consecutiveDriftCount}个漂移点，开始分析...`);
    
    // 检查是否为直线运动误判
    if (this.isLinearMotionMisjudgment()) {
      this.recoverFromLinearMotion();
    } else {
      this.rebuildBasePoint();
    }
    
    this.consecutiveDriftCount = 0;
  }
  
  /** 检查是否为直线运动误判 */
  private isLinearMotionMisjudgment(): boolean {
    if (this.slidingWindow.length < 3) {
      return false;
    }
    
    const recentPoints = this.slidingWindow
      .slice(-Math.min(this.config.maxDriftSequence, this.slidingWindow.length))
      .map(wp => wp.point);
    
    if (recentPoints.length < 3) {
      return false;
    }
    
    // 计算最小角度
    for (let i = 1; i < recentPoints.length - 1; i++) {
      const angle = this.calculateMinAngleInTriangle(
        recentPoints[i - 1],
        recentPoints[i],
        recentPoints[i + 1]
      );
      
      if (angle > this.config.linearMotionAngleThreshold) {
        return false; // 发现大角度转弯，不是直线运动
      }
    }
    
    return true;
  }
  
  /** 从直线运动误判中恢复 */
  private recoverFromLinearMotion(): void {
    this.log('info', '检测到直线运动误判，恢复被误判的点');
    
    // 将最近的漂移点标记为有效点
    const recentDriftPoints = this.slidingWindow
      .slice(-this.consecutiveDriftCount)
      .filter(wp => wp.isDrift)
      .map(wp => wp.point);
    
    for (const point of recentDriftPoints) {
      this.validPoints.push(point);
      this.filteredCount--; // 减少过滤计数
      this.driftCount--; // 减少漂移计数
    }
    
    // 更新基准点
    this.updateBasePoint();
  }
  
  /** 重建基准点 */
  private rebuildBasePoint(): void {
    this.log('info', '重建基准点');
    this.basePointRebuilds++;
    
    // 使用最近的有效点重建基准点
    const recentValidPoints = this.validPoints.slice(-this.config.windowSize);
    if (recentValidPoints.length > 0) {
      const centroid = this.calculateCentroid(recentValidPoints);
      const radius = this.calculateRadius(recentValidPoints, centroid);
      
      this.basePoint = {
        point: centroid,
        radius: Math.max(radius, 50), // 最小半径50米
        createdAt: Date.now(),
        validPointsCount: recentValidPoints.length
      };
      
      this.log('info', `新基准点: (${centroid.lat}, ${centroid.lng}), 半径: ${this.basePoint.radius}m`);
    }
  }
  
  /** 更新基准点 */
  private updateBasePoint(): void {
    if (!this.basePoint && this.validPoints.length >= 3) {
      // 创建初始基准点
      const centroid = this.calculateCentroid(this.validPoints);
      const radius = this.calculateRadius(this.validPoints, centroid);
      
      this.basePoint = {
        point: centroid,
        radius: Math.max(radius, 50),
        createdAt: Date.now(),
        validPointsCount: this.validPoints.length
      };
      
      this.log('info', `创建初始基准点: (${centroid.lat}, ${centroid.lng}), 半径: ${this.basePoint.radius}m`);
    } else if (this.basePoint) {
      // 更新现有基准点
      const recentPoints = this.validPoints.slice(-this.config.windowSize);
      const centroid = this.calculateCentroid(recentPoints);
      const radius = this.calculateRadius(recentPoints, centroid);
      
      this.basePoint.point = centroid;
      this.basePoint.radius = Math.max(radius, 50);
      this.basePoint.validPointsCount = recentPoints.length;
    }
  }
  
  /** 基准点是否过期 */
  private isBasePointExpired(): boolean {
    return this.basePoint ? Date.now() - this.basePoint.createdAt > this.config.validityPeriod : false;
  }
  
  // ==================== 数学计算方法 ====================
  
  /** 计算两点间距离（米） */
  private calculateDistance(point1: InternalGPSPoint, point2: InternalGPSPoint): number {
    const lat1Rad = point1.lat * Math.PI / 180;
    const lat2Rad = point2.lat * Math.PI / 180;
    const deltaLatRad = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLngRad = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return this.config.earthRadius * c;
  }
  
  /** 计算质心 */
  private calculateCentroid(points: InternalGPSPoint[]): InternalGPSPoint {
    if (points.length === 0) {
      throw new Error('无法计算空点集的质心');
    }
    
    const sumLat = points.reduce((sum, p) => sum + p.lat, 0);
    const sumLng = points.reduce((sum, p) => sum + p.lng, 0);
    
    return {
      lat: sumLat / points.length,
      lng: sumLng / points.length,
      timestamp: Date.now()
    };
  }
  
  /** 计算半径 */
  private calculateRadius(points: InternalGPSPoint[], center: InternalGPSPoint): number {
    if (points.length === 0) {
      return 50; // 默认半径
    }
    
    const distances = points.map(p => this.calculateDistance(p, center));
    distances.sort((a, b) => a - b);
    
    // 使用中位数作为半径
    const midIndex = Math.floor(distances.length / 2);
    return distances.length % 2 === 0
      ? (distances[midIndex - 1] + distances[midIndex]) / 2
      : distances[midIndex];
  }
  
  /** 计算三角形最小角度 */
  private calculateMinAngleInTriangle(
    p1: InternalGPSPoint,
    p2: InternalGPSPoint,
    p3: InternalGPSPoint
  ): number {
    const a = this.calculateDistance(p2, p3);
    const b = this.calculateDistance(p1, p3);
    const c = this.calculateDistance(p1, p2);
    
    if (a === 0 || b === 0 || c === 0) {
      return 0;
    }
    
    // 使用余弦定理计算角度
    const angleA = Math.acos((b * b + c * c - a * a) / (2 * b * c));
    const angleB = Math.acos((a * a + c * c - b * b) / (2 * a * c));
    const angleC = Math.acos((a * a + b * b - c * c) / (2 * a * b));
    
    const angles = [angleA, angleB, angleC].map(angle => angle * 180 / Math.PI);
    return Math.min(...angles);
  }
  
  // ==================== 辅助方法 ====================
  
  /** 生成标记信息 */
  private generateMarkers(markers: MarkerInfo[], originalPoints: GPSPoint[]): void {
    // 基准点重建标记
    if (this.basePointRebuilds > 0 && this.basePoint) {
      markers.push({
        type: 'rebuild',
        position: { lat: this.basePoint.point.lat, lng: this.basePoint.point.lng },
        info: `基准点重建 (${this.basePointRebuilds}次)`,
        timestamp: this.basePoint.createdAt
      });
    
    // 漂移点标记
    const driftPoints = originalPoints.map((point, index) => {
      const isDrift = this.slidingWindow.find(wp => 
        wp.point.lat === point.lat && 
        wp.point.lng === point.lng && 
        wp.point.timestamp === point.timestamp
      )?.isDrift || false;
      return { point, isDrift, index };
    });

    // 为每个漂移点添加标记，并计算漂移距离
    driftPoints.forEach(({ point, isDrift, index }, arrayIndex) => {
      if (isDrift && this.basePoint) {
        const distance = this.calculateDistance(
          { lat: point.lat, lng: point.lng, timestamp: point.timestamp },
          this.basePoint.point
        );
        const threshold = this.basePoint.radius * this.config.driftThresholdMultiplier;
        markers.push({
          type: 'drift',
          position: { lat: point.lat, lng: point.lng },
          info: `漂移点 (偏离${Math.round(distance)}米，阈值${Math.round(threshold)}米)`,
          timestamp: point.timestamp
        });
      }
    });
    }

    // 检测隧道和高速场景
    let inTunnel = false;
    let inHighSpeed = false;
    let lastPoint: InternalGPSPoint | null = null;
    let localConsecutiveDriftCount = 0;

    for (let i = 0; i < originalPoints.length; i++) {
      const currentPoint: InternalGPSPoint = {
        lat: originalPoints[i].lat,
        lng: originalPoints[i].lng,
        timestamp: originalPoints[i].timestamp
      };
      
      // 检查当前点是否为漂移点
      const isDrift = this.slidingWindow.find(wp => 
        wp.point.lat === currentPoint.lat && 
        wp.point.lng === currentPoint.lng && 
        wp.point.timestamp === currentPoint.timestamp
      )?.isDrift || false;

      // 更新连续漂移点计数
      if (isDrift) {
        localConsecutiveDriftCount++;
      } else {
        localConsecutiveDriftCount = 0;
      }
      
      // 隧道检测（通过连续的漂移点）
      if (localConsecutiveDriftCount >= 3) {
        if (!inTunnel) {
          markers.push({
            type: 'tunnel',
            position: { lat: currentPoint.lat, lng: currentPoint.lng },
            info: `隧道区域 (${localConsecutiveDriftCount}个连续漂移点)`,
            timestamp: currentPoint.timestamp
          });
          inTunnel = true;
        }
      } else {
        inTunnel = false;
      }

      // 高速场景检测（通过连续点的距离和角度）
      if (lastPoint) {
        const distance = this.calculateDistance(lastPoint, currentPoint);
        const timeDiff = (currentPoint.timestamp - lastPoint.timestamp) / 1000; // 转换为秒
        const speed = distance / timeDiff; // 米/秒
        const isHighSpeed = speed > 25; // 假设25米/秒(约90公里/小时)为高速阈值

        // 检查是否为直线运动
        let isLinearMotion = false;
        if (i >= 2) {
          const prevPoint = {
            lat: originalPoints[i-2].lat,
            lng: originalPoints[i-2].lng,
            timestamp: originalPoints[i-2].timestamp
          };
          const angle = this.calculateMinAngleInTriangle(prevPoint, lastPoint, currentPoint);
          isLinearMotion = angle > 150; // 接近直线的运动
        }
        
        if (isHighSpeed && isLinearMotion && !inHighSpeed) {
          markers.push({
            type: 'speed',
            position: { lat: currentPoint.lat, lng: currentPoint.lng },
            info: `高速区域 (${Math.round(speed * 3.6)}km/h，直线运动)`,
            timestamp: currentPoint.timestamp
          });
          inHighSpeed = true;
        } else if (!isHighSpeed || !isLinearMotion) {
          inHighSpeed = false;
        }
      }

      lastPoint = currentPoint;
    }
  }
  
  /** 日志输出 */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    if (!this.config.enableLogging) {
      return;
    }
    
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (messageLevelIndex >= currentLevelIndex) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [GPS-ANALYZER] [${level.toUpperCase()}] ${message}`);
    }
  }
}

export default GpsTrajectoryAnalyzer;