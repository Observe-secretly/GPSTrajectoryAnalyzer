/**
 * GPS点处理核心算法
 * 
 * 注意：此文件保持向后兼容性，同时集成新的算法包接口
 * 推荐使用新的 GPSAlgorithmPackage 进行开发
 */

import GPSAlgorithmPackage, {
  GPSPoint as AlgorithmGPSPoint,
  ExtendedGPSPoint,
  ProcessingResult as AlgorithmProcessingResult,
  AlgorithmConfig
} from './gpsAlgorithmPackage';
import GpsTrajectoryAnalyzer from './gpsTrajectoryAnalyzer';
import GPSDataConverter from './gpsDataConverter';
import GPSSimulationGenerator from './gpsSimulationGenerator';

// 保持向后兼容的接口定义
export interface GPSPoint {
  lat: number;
  lng: number;
  timestamp: number;
}

// 新的GPS数据格式（来自convertedTrajectory.json）
export interface ConvertedGPSPoint {
  alt: number | null;
  cog: number;
  lat: number;
  lon: number;
  spd: number;
}

export interface ProcessedResult {
  originalPoints: GPSPoint[];
  processedPoints: GPSPoint[];
  filteredPoints: GPSPoint[];
}

export interface ProcessorConfig {
  windowSize: number; // 滑动窗口大小
  validityPeriod: number; // 基准点有效期（毫秒）
  maxDriftSequence: number; // 最大连续漂移点数量
  driftThresholdMultiplier: number; // 漂移判定阈值倍数
  linearMotionAngleThreshold: number; // 直线漂移点误判角度阈值（度）
}

export class GPSProcessor {
  private slidingWindow: GPSPoint[] = [];
  private validPoints: GPSPoint[] = [];
  private lastBasePointTime = 0;
  private basePoint: GPSPoint | null = null;
  private basePointRadius = 0; // 基准点半径距离
  private consecutiveDriftPoints: GPSPoint[] = []; // 连续漂移点序列

  // 统计信息
  private discardedDriftPointsCount = 0; // 忽略的漂移点数量
  private basePointRebuildsCount = 0; // 基准点重建次数
  private basePointRebuildPositions: GPSPoint[] = []; // 基准点重建位置记录

  // 可配置参数
  public config: ProcessorConfig = {
    windowSize: 10, // 滑动窗口大小，需要10个点才计算基准点
    validityPeriod: 15000, // 基准点有效期15秒
    maxDriftSequence: 10, // 最大连续漂移点数量
    driftThresholdMultiplier: 2, // 半径距离的2倍作为漂移判定标准
    linearMotionAngleThreshold: 30 // 直线漂移点误判角度阈值30度
  };

  constructor(config?: Partial<ProcessorConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  // 更新配置
  public updateConfig(newConfig: Partial<ProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // 获取当前运行时状态
  public getStatus() {
    return {
      slidingWindowSize: this.slidingWindow.length,
      validPointsCount: this.validPoints.length,
      hasBasePoint: !!this.basePoint,
      basePointRadius: this.basePointRadius,
      consecutiveDriftCount: this.consecutiveDriftPoints.length,
      basePointAge: this.basePoint ? Date.now() - this.lastBasePointTime : 0,
      isBasePointExpired: this.isBasePointExpired(),
      basePoint: this.basePoint ? {
        lat: this.basePoint.lat,
        lng: this.basePoint.lng
      } : null,
      // 新增统计信息
      discardedDriftPointsCount: this.discardedDriftPointsCount,
      basePointRebuildsCount: this.basePointRebuildsCount,
      basePointRebuildPositions: this.basePointRebuildPositions
    };
  }

  /**
   * 计算两点间的Haversine距离（米）
   */
  private haversineDistance(point1: GPSPoint, point2: GPSPoint): number {
    const R = 6371000; // 地球半径（米）
    const lat1Rad = (point1.lat * Math.PI) / 180;
    const lat2Rad = (point2.lat * Math.PI) / 180;
    const deltaLatRad = ((point2.lat - point1.lat) * Math.PI) / 180;
    const deltaLngRad = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * 计算滑动窗口的中位点
   */
  private calculateMedianPoint(points: GPSPoint[]): GPSPoint {
    if (points.length === 0) {
      throw new Error('Points array is empty');
    }

    const sortedByLat = [...points].sort((a, b) => a.lat - b.lat);
    const sortedByLng = [...points].sort((a, b) => a.lng - b.lng);

    const midIndex = Math.floor(points.length / 2);

    let medianLat: number;
    let medianLng: number;

    if (points.length % 2 === 0) {
      medianLat = (sortedByLat[midIndex - 1].lat + sortedByLat[midIndex].lat) / 2;
      medianLng = (sortedByLng[midIndex - 1].lng + sortedByLng[midIndex].lng) / 2;
    } else {
      medianLat = sortedByLat[midIndex].lat;
      medianLng = sortedByLng[midIndex].lng;
    }

    return {
      lat: medianLat,
      lng: medianLng,
      timestamp: Date.now()
    };
  }



  /**
   * 判断是否为漂移点
   */
  private isDriftPoint(point: GPSPoint): boolean {
    if (!this.basePoint || this.basePointRadius === 0) {
      return false; // 没有基准点或半径未计算时不判断为漂移
    }

    const distance = this.haversineDistance(point, this.basePoint);
    const threshold = this.basePointRadius * this.config.driftThresholdMultiplier; // 半径距离的倍数作为漂移判定标准

    const isDrift = distance > threshold;
    if (isDrift) {
      console.log(`漂移点检测: 距离=${distance.toFixed(2)}米, 阈值=${threshold.toFixed(2)}米`);
    }

    return isDrift;
  }

  /**
   * 计算三个点组成的三角形的最小角度（度）
   */
  private calculateMinAngleInTriangle(p1: GPSPoint, p2: GPSPoint, p3: GPSPoint): number {
    // 计算三边长度
    const a = this.haversineDistance(p2, p3);
    const b = this.haversineDistance(p1, p3);
    const c = this.haversineDistance(p1, p2);

    // 使用余弦定理计算三个角度
    const angleA = Math.acos((b * b + c * c - a * a) / (2 * b * c));
    const angleB = Math.acos((a * a + c * c - b * b) / (2 * a * c));
    const angleC = Math.acos((a * a + b * b - c * c) / (2 * a * b));

    // 转换为度并返回最小角度
    const angles = [angleA, angleB, angleC].map(angle => (angle * 180) / Math.PI);
    return Math.min(...angles);
  }

  /**
   * 检查三个漂移点是否构成直线（用于判断高速直线行驶误判）
   */
  private isLinearMotion(points: GPSPoint[]): boolean {
    if (points.length < 3) {
      return false;
    }

    // 取最近的三个点
    const recentThree = points.slice(-3);
    const minAngle = this.calculateMinAngleInTriangle(recentThree[0], recentThree[1], recentThree[2]);

    // 检查最小角度是否小于配置的阈值
    if (minAngle < this.config.linearMotionAngleThreshold) {
      // 检查距离是否不超过5倍漂移判定倍数
      const maxDistance = Math.max(
        this.haversineDistance(recentThree[0], this.basePoint!),
        this.haversineDistance(recentThree[1], this.basePoint!),
        this.haversineDistance(recentThree[2], this.basePoint!)
      );

      const maxAllowedDistance = this.basePointRadius * this.config.driftThresholdMultiplier * 5;

      if (maxDistance <= maxAllowedDistance) {
        console.log(`检测到直线运动: 最小角度=${minAngle.toFixed(2)}度, 阈值=${this.config.linearMotionAngleThreshold}度, 最大距离=${maxDistance.toFixed(2)}米, 允许距离=${maxAllowedDistance.toFixed(2)}米`);
        return true;
      }
    }

    return false;
  }

  /**
   * 更新基准点
   */
  private updateBasePoint(): void {
    // 只有当滑动窗口达到配置大小时才计算基准点
    if (this.slidingWindow.length >= this.config.windowSize) {
      this.basePoint = this.calculateMedianPoint(this.slidingWindow);
      this.lastBasePointTime = Date.now();

      // 计算基准点半径距离（基于这10个点到基准点的最大距离）
      this.basePointRadius = this.calculateBasePointRadius();
      console.log(`基准点更新: lat=${this.basePoint.lat.toFixed(6)}, lng=${this.basePoint.lng.toFixed(6)}, 半径=${this.basePointRadius.toFixed(2)}米`);
    }
  }

  /**
   * 计算基准点半径距离
   */
  private calculateBasePointRadius(): number {
    if (!this.basePoint || this.slidingWindow.length < this.config.windowSize) {
      return 0;
    }

    let maxDistance = 0;
    for (const point of this.slidingWindow) {
      const distance = this.haversineDistance(point, this.basePoint);
      maxDistance = Math.max(maxDistance, distance);
    }

    return maxDistance;
  }

  /**
   * 检查基准点是否过期
   */
  private isBasePointExpired(): boolean {
    return Date.now() - this.lastBasePointTime > this.config.validityPeriod;
  }

  /**
   * 处理单个GPS点
   */
  public processPoint(point: GPSPoint): boolean {
    // 如果滑动窗口不足配置大小的点，直接接受点并加入窗口
    if (this.slidingWindow.length < this.config.windowSize) {
      this.slidingWindow.push(point);
      this.validPoints.push(point);

      // 当达到配置大小的点时，计算基准点
      if (this.slidingWindow.length === this.config.windowSize) {
        this.updateBasePoint();
        console.log(`滑动窗口已满，开始基准点计算`);
      }

      return true;
    }

    // 基准点过期时，重新开始收集点
    if (this.isBasePointExpired()) {
      console.log(`基准点过期，重新开始收集点`);
      this.slidingWindow = [point];
      this.validPoints.push(point);
      this.basePoint = null;
      this.basePointRadius = 0;
      this.consecutiveDriftPoints = [];
      return true;
    }

    // 判断是否为漂移点
    if (this.isDriftPoint(point)) {
      // 记录连续漂移点
      this.consecutiveDriftPoints.push(point);

      // 限制漂移点序列长度
      if (this.consecutiveDriftPoints.length > this.config.maxDriftSequence) {
        this.consecutiveDriftPoints.shift();
      }

      console.log(`漂移点被记录: lat=${point.lat}, lng=${point.lng}, 连续漂移点数=${this.consecutiveDriftPoints.length}`);

      // 当有3个或以上漂移点时，检查是否为直线运动
      if (this.consecutiveDriftPoints.length >= 3) {
        if (this.isLinearMotion(this.consecutiveDriftPoints)) {
          console.log(`检测到直线运动误判，恢复漂移点并更新基准点`);

          // 将漂移点恢复为有效点
          for (const driftPoint of this.consecutiveDriftPoints) {
            this.validPoints.push(driftPoint);
            this.slidingWindow.push(driftPoint);
            if (this.slidingWindow.length > this.config.windowSize) {
              this.slidingWindow.shift();
            }
          }

          // 清空漂移队列并更新基准点
          this.consecutiveDriftPoints = [];
          this.updateBasePoint();
          this.basePointRebuildsCount++; // 增加基准点重建计数
          this.basePointRebuildPositions.push(point); // 记录重建位置

          return true; // 当前点也被接受
        }
      }

      // 如果连续达到配置数量的点都是漂移点，基准点失效，基于漂移点重新计算基准点
      if (this.consecutiveDriftPoints.length >= this.config.maxDriftSequence) {
        console.log(`连续${this.config.maxDriftSequence}个漂移点，基准点失效，基于漂移点重新计算基准点`);
        this.slidingWindow = [...this.consecutiveDriftPoints];
        this.consecutiveDriftPoints = [];
        this.updateBasePoint();
        this.basePointRebuildsCount++; // 增加基准点重建计数
        this.basePointRebuildPositions.push(point); // 记录重建位置
        this.validPoints.push(point);
        return true;
      }

      this.discardedDriftPointsCount++; // 增加丢弃漂移点计数
      return false; // 漂移点，暂时丢弃
    }

    // 有效点出现，清空连续漂移点记录
    if (this.consecutiveDriftPoints.length > 0) {
      console.log(`有效点出现，清空${this.consecutiveDriftPoints.length}个连续漂移点记录`);
      this.consecutiveDriftPoints = [];
    }

    // 有效点，加入滑动窗口
    this.slidingWindow.push(point);
    if (this.slidingWindow.length > this.config.windowSize) {
      this.slidingWindow.shift(); // 移除最旧的点
    }

    // 加入有效点列表
    this.validPoints.push(point);

    // 更新基准点
    this.updateBasePoint();

    return true; // 有效点
  }





  /**
   * 处理GPS轨迹数据
   */
  public processTrajectory(originalPoints: GPSPoint[]): ProcessedResult {
    // 重置状态
    this.slidingWindow = [];
    this.validPoints = [];
    this.basePoint = null;
    this.lastBasePointTime = 0;
    this.basePointRadius = 0;
    this.consecutiveDriftPoints = [];
    // 重置统计信息
    this.discardedDriftPointsCount = 0;
    this.basePointRebuildsCount = 0;
    this.basePointRebuildPositions = [];

    const filteredPoints: GPSPoint[] = [];

    // 逐点处理
    for (const point of originalPoints) {
      if (this.processPoint(point)) {
        filteredPoints.push(point);
      }
    }

    return {
      originalPoints,
      processedPoints: filteredPoints,
      filteredPoints
    };
  }



  /**
   * 转换新格式的GPS数据为内部格式
   */
  public static convertFromNewFormat(convertedPoints: ConvertedGPSPoint[]): GPSPoint[] {
    return convertedPoints.map((point, index) => ({
      lat: point.lat,
      lng: point.lon,
      timestamp: Date.now() + index * 1000 // 模拟每秒一个点
    }));
  }

  /**
   * 计算两点间的方向角（度）
   */
  private static calculateBearing(point1: ConvertedGPSPoint, point2: ConvertedGPSPoint): number {
    const lat1Rad = point1.lat * Math.PI / 180;
    const lat2Rad = point2.lat * Math.PI / 180;
    const deltaLngRad = (point2.lon - point1.lon) * Math.PI / 180;

    const y = Math.sin(deltaLngRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLngRad);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // 确保结果在0-360度范围内
  }

  /**
   * 计算角度差（考虑360度循环）
   */
  private static angleDifference(angle1: number, angle2: number): number {
    let diff = Math.abs(angle1 - angle2);
    return Math.min(diff, 360 - diff);
  }

  /**
   * 静态版本的Haversine距离计算
   */
  private static calculateDistance(point1: { lat: number, lng: number }, point2: { lat: number, lng: number }): number {
    const R = 6371000; // 地球半径（米）
    const lat1Rad = point1.lat * Math.PI / 180;
    const lat2Rad = point2.lat * Math.PI / 180;
    const deltaLatRad = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLngRad = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * 查找方向变化小于10度的连续6个点
   */
  private static findStraightSegments(data: ConvertedGPSPoint[]): Array<{start: number, end: number}> {
    const segments: Array<{start: number, end: number}> = [];

    for (let i = 0; i <= data.length - 6; i++) {
      let isConsistentDirection = true;
      const bearings: number[] = [];

      // 计算连续6个点的5个方向角
      for (let j = 0; j < 5; j++) {
        const bearing = this.calculateBearing(data[i + j], data[i + j + 1]);
        bearings.push(bearing);
      }

      // 检查所有相邻方向角的差异是否都小于10度
      for (let j = 0; j < bearings.length - 1; j++) {
        const angleDiff = this.angleDifference(bearings[j], bearings[j + 1]);
        if (angleDiff > 10) {
          isConsistentDirection = false;
          break;
        }
      }

      if (isConsistentDirection) {
        segments.push({ start: i, end: i + 5 });
        i += 5; // 跳过已处理的段，避免重叠
      }
    }

    return segments;
  }

  /**
   * 生成模拟测试数据
   */
  public static generateSimulatedData(originalData: ConvertedGPSPoint[]): {
    points: GPSPoint[],
    markers: { type: 'tunnel' | 'drift' | 'speed', position: { lat: number, lng: number }, info: string }[]
  } {
    if (originalData.length === 0) {
      throw new Error('原始数据为空');
    }

    const simulatedData = [...originalData];
    const totalPoints = simulatedData.length;
    const markers: { type: 'tunnel' | 'drift' | 'speed', position: { lat: number, lng: number }, info: string }[] = [];

    // 0. 高速场景将在最后处理，这里先跳过

    // 1. 模拟静态GPS点漂移（5-10个位置，每个位置10-30个漂移点）
    const staticDriftCount = Math.floor(Math.random() * 6) + 5; // 5-10个位置
    for (let i = 0; i < staticDriftCount; i++) {
      const baseIndex = Math.floor(Math.random() * totalPoints);
      const basePoint = simulatedData[baseIndex];
      const driftPointCount = Math.floor(Math.random() * 21) + 10; // 10-30个点

      // 添加漂移标记
      markers.push({
        type: 'drift',
        position: { lat: basePoint.lat, lng: basePoint.lon },
        info: `静态漂移: ${driftPointCount}个点, 90%在50米内，10%在50-200米`
      });

      // 在基础点附近生成漂移点
      for (let j = 0; j < driftPointCount; j++) {
        // 90%的漂移在50米以内，10%在50-200米
        const driftDistance = Math.random() < 0.9 
          ? Math.random() * 40 + 10  // 90%: 10-50米
          : Math.random() * 150 + 50; // 10%: 50-200米
        const driftAngle = Math.random() * 2 * Math.PI;

        // 计算漂移后的坐标（简化计算，1度约等于111000米）
        const latOffset = (driftDistance * Math.cos(driftAngle)) / 111000;
        const lngOffset = (driftDistance * Math.sin(driftAngle)) / (111000 * Math.cos(basePoint.lat * Math.PI / 180));

        const driftPoint: ConvertedGPSPoint = {
          ...basePoint,
          lat: basePoint.lat + latOffset,
          lon: basePoint.lon + lngOffset
        };

        // 插入到原始位置附近
        const insertIndex = Math.min(baseIndex + j + 1, simulatedData.length);
        simulatedData.splice(insertIndex, 0, driftPoint);
      }
    }

    // 2. 模拟隧道（删除连续的30个点左右，3-4个隧道）
    const tunnelCount = Math.floor(Math.random() * 2) + 3; // 3-4个隧道
    const tunnelsToRemove: Array<{start: number, length: number}> = [];

    for (let i = 0; i < tunnelCount; i++) {
      const tunnelLength = Math.floor(Math.random() * 21) + 25; // 25-45个点
      const maxStartIndex = Math.max(0, simulatedData.length - tunnelLength - 1);
      const startIndex = Math.floor(Math.random() * maxStartIndex);

      // 确保隧道不重叠
      const isOverlapping = tunnelsToRemove.some(tunnel =>
        startIndex < tunnel.start + tunnel.length && startIndex + tunnelLength > tunnel.start
      );

      if (!isOverlapping) {
        // 添加隧道标记（在隧道开始位置）
        if (startIndex < simulatedData.length) {
          markers.push({
            type: 'tunnel',
            position: { lat: simulatedData[startIndex].lat, lng: simulatedData[startIndex].lon },
            info: `隧道: 删除${tunnelLength}个GPS点`
          });
        }
        tunnelsToRemove.push({ start: startIndex, length: tunnelLength });
      }
    }

    // 按起始位置倒序排列，从后往前删除避免索引变化
    tunnelsToRemove.sort((a, b) => b.start - a.start);
    tunnelsToRemove.forEach(tunnel => {
      simulatedData.splice(tunnel.start, tunnel.length);
    });

    // 3. 模拟运动中漂移（3-6个位置，每个位置2-5个连续漂移点）
    const movingDriftCount = Math.floor(Math.random() * 4) + 3; // 3-6个位置
    for (let i = 0; i < movingDriftCount; i++) {
      const baseIndex = Math.floor(Math.random() * (simulatedData.length - 10));
      const driftSequenceLength = Math.floor(Math.random() * 4) + 2; // 2-5个点

      // 添加运动漂移标记
      if (baseIndex < simulatedData.length) {
        markers.push({
          type: 'drift',
          position: { lat: simulatedData[baseIndex].lat, lng: simulatedData[baseIndex].lon },
          info: `运动漂移: ${driftSequenceLength}个连续点, 90%在50米内，10%在50-200米`
        });
      }

      // 随机漂移方向
      const driftAngle = Math.random() * 2 * Math.PI;

      for (let j = 0; j < driftSequenceLength && baseIndex + j < simulatedData.length; j++) {
        const basePoint = simulatedData[baseIndex + j];
        // 90%的漂移在50米以内，10%在50-200米
        const driftDistance = Math.random() < 0.9 
          ? Math.random() * 40 + 10  // 90%: 10-50米
          : Math.random() * 150 + 50; // 10%: 50-200米

        // 计算漂移后的坐标
        const latOffset = (driftDistance * Math.cos(driftAngle)) / 111000;
        const lngOffset = (driftDistance * Math.sin(driftAngle)) / (111000 * Math.cos(basePoint.lat * Math.PI / 180));

        simulatedData[baseIndex + j] = {
          ...basePoint,
          lat: basePoint.lat + latOffset,
          lon: basePoint.lon + lngOffset
        };
      }
    }

    // 4. 最后处理高速场景（查找直线段并添加标记）
    const straightSegments = this.findStraightSegments(simulatedData);
    const selectedSegments: Array<{start: number, end: number}> = [];
    const minDistanceThreshold = 200 * 5; // 5倍漂移距离（假设最大漂移距离200米）
    
    // 选择高速场景，确保距离足够远
    for (const segment of straightSegments) {
      if (selectedSegments.length >= 5) break; // 最多5个
      
      const currentPoint = simulatedData[segment.start];
      let isTooClose = false;
      
      // 检查与已选择的高速点的距离
       for (const selected of selectedSegments) {
         const selectedPoint = simulatedData[selected.start];
         const distance = this.calculateDistance(
           { lat: currentPoint.lat, lng: currentPoint.lon },
           { lat: selectedPoint.lat, lng: selectedPoint.lon }
         );
        
        if (distance < minDistanceThreshold) {
          isTooClose = true;
          break;
        }
      }
      
      if (!isTooClose) {
        selectedSegments.push(segment);
      }
    }
    
    // 先添加高速标记（在删除点之前）
    for (const segment of selectedSegments) {
      markers.push({
        type: 'speed',
        position: { lat: simulatedData[segment.start].lat, lng: simulatedData[segment.start].lon },
        info: `高速场景: 删除第2、4、5个点，模拟高速行驶GPS采样间隔`
      });
    }
    
    // 然后删除点（按起始位置倒序排列，从后往前删除避免索引变化）
    selectedSegments.sort((a, b) => b.start - a.start);
    selectedSegments.forEach(segment => {
      // 从后往前删除点，避免索引变化
      const pointsToRemove = [4, 3, 1]; // 第5、4、2个点（0-based索引，倒序）
      pointsToRemove.forEach(offset => {
        const indexToRemove = segment.start + offset;
        if (indexToRemove < simulatedData.length) {
          simulatedData.splice(indexToRemove, 1);
        }
      });
    });

    // 转换为内部格式
    return {
      points: GPSProcessor.convertFromNewFormat(simulatedData),
      markers
    };
  }

  // ==================== 新算法包集成方法 ====================

  /**
   * 创建新的算法包实例（推荐使用）
   * 提供更强大和标准化的GPS处理功能
   */
  public static createAlgorithmPackage(config?: Partial<AlgorithmConfig>): GPSAlgorithmPackage {
    const gpsAnalyzer = new GpsTrajectoryAnalyzer(config);
    const dataConverter = new GPSDataConverter();
    const simulationGenerator = new GPSSimulationGenerator();
    
    return new GPSAlgorithmPackage(
      gpsAnalyzer,
      dataConverter,
      simulationGenerator,
      config
    );
  }

  /**
   * 使用新算法包处理GPS轨迹（推荐使用）
   * 提供更详细的处理结果和统计信息
   */
  public static processWithAlgorithmPackage(
    points: GPSPoint[], 
    config?: Partial<AlgorithmConfig>
  ): AlgorithmProcessingResult {
    const algorithmPackage = this.createAlgorithmPackage(config);
    
    // 转换数据格式
    const algorithmPoints: AlgorithmGPSPoint[] = points.map(p => ({
      lat: p.lat,
      lng: p.lng,
      timestamp: p.timestamp
    }));
    
    return algorithmPackage.processTrajectory(algorithmPoints);
  }

  /**
   * 从扩展格式数据处理GPS轨迹
   */
  public static processExtendedFormat(
    points: ConvertedGPSPoint[],
    config?: Partial<AlgorithmConfig>
  ): AlgorithmProcessingResult {
    const algorithmPackage = this.createAlgorithmPackage(config);
    
    // 转换扩展格式数据
    const extendedPoints: ExtendedGPSPoint[] = points.map(p => ({
      lat: p.lat,
      lng: p.lon,
      timestamp: Date.now(), // 如果没有时间戳，使用当前时间
      spd: p.spd,
      alt: p.alt,
      cog: p.cog
    }));
    
    const basicPoints = algorithmPackage.fromExtendedFormat(extendedPoints);
    return algorithmPackage.processTrajectory(basicPoints);
  }

  /**
   * 生成模拟数据（使用新的模拟器）
   */
  public static generateAdvancedSimulatedData(
    originalData: GPSPoint[],
    options?: {
      staticDriftCount?: number;
      movingDriftCount?: number;
      tunnelCount?: number;
      speedScenarioCount?: number;
    }
  ): { points: GPSPoint[]; markers: any[] } {
    const algorithmPackage = this.createAlgorithmPackage();
    
    // 转换数据格式
    const algorithmPoints: AlgorithmGPSPoint[] = originalData.map(p => ({
      lat: p.lat,
      lng: p.lng,
      timestamp: p.timestamp
    }));
    
    const result = algorithmPackage.generateSimulatedData(algorithmPoints, options);
    
    // 转换回原格式
    return {
      points: result.points.map(p => ({
        lat: p.lat,
        lng: p.lng,
        timestamp: p.timestamp
      })),
      markers: result.markers
    };
  }




}
