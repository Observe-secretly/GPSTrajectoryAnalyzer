/**
 * GPS核心处理模块
 * 集成了GPS数据转换和处理功能
 */

import GPSAlgorithmPackage, {
  GPSPoint as AlgorithmGPSPoint,
  ExtendedGPSPoint,
  ProcessingResult as AlgorithmProcessingResult,
  AlgorithmConfig,
  IDataConverter
} from './gpsAlgorithmPackage';
import GpsTrajectoryAnalyzer from './gpsTrajectoryAnalyzer';
import GPSSimulationGenerator from './gpsSimulationGenerator';

// 基础GPS点接口
export interface GPSPoint {
  lat: number;
  lng: number;
  timestamp: number;
}

// 扩展GPS数据格式
export interface ConvertedGPSPoint extends GPSPoint {
  alt: number | null;
  cog: number;
  spd: number;
}

// 处理结果接口
export interface ProcessedResult {
  originalPoints: GPSPoint[];
  processedPoints: GPSPoint[];
  filteredPoints: GPSPoint[];
}

// 处理器配置接口
export interface ProcessorConfig {
  windowSize: number; // 滑动窗口大小
  validityPeriod: number; // 基准点有效期（毫秒）
  maxDriftSequence: number; // 最大连续漂移点数量
  driftThresholdMultiplier: number; // 漂移判定阈值倍数
  linearMotionAngleThreshold: number; // 直线漂移点误判角度阈值（度）
}

/**
 * GPS核心处理类
 * 集成了数据转换和轨迹处理功能
 */
export class GPSCore implements IDataConverter {
  private slidingWindow: GPSPoint[] = [];
  private validPoints: GPSPoint[] = [];
  private lastBasePointTime = 0;
  private basePoint: GPSPoint | null = null;
  private basePointRadius = 0;
  private consecutiveDriftPoints: GPSPoint[] = [];

  // 统计信息
  private discardedDriftPointsCount = 0;
  private basePointRebuildsCount = 0;
  private basePointRebuildPositions: GPSPoint[] = [];

  // 处理器配置
  public config: ProcessorConfig = {
    windowSize: 10,
    validityPeriod: 15000,
    maxDriftSequence: 10,
    driftThresholdMultiplier: 2,
    linearMotionAngleThreshold: 30
  };

  constructor(config?: Partial<ProcessorConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  // =============== 数据转换方法 ===============

  /**
   * 从字符串解析GPS点
   */
  parseFromString(gpsString: string): GPSPoint[] {
    const points: GPSPoint[] = [];
    const lines = gpsString.trim().split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) {
        continue;
      }
      
      try {
        const point = this.parseGPSLine(line, i);
        if (point) {
          points.push(point);
        }
      } catch (error) {
        console.warn(`解析第${i + 1}行GPS数据失败: ${line}`, error);
      }
    }
    
    return points;
  }

  /**
   * 解析单行GPS数据
   */
  private parseGPSLine(line: string, lineIndex: number): GPSPoint | null {
    const parts = line.split(/[,\s;\t]+/).map(s => s.trim()).filter(s => s);
    
    if (parts.length < 2) {
      return null;
    }
    
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    
    if (isNaN(lat) || isNaN(lng)) {
      return null;
    }
    
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn(`第${lineIndex + 1}行坐标超出有效范围: lat=${lat}, lng=${lng}`);
      return null;
    }
    
    let timestamp: number;
    if (parts.length >= 3) {
      timestamp = this.parseTimestamp(parts[2]);
      if (isNaN(timestamp)) {
        timestamp = Date.now() + lineIndex * 1000;
      }
    } else {
      timestamp = Date.now() + lineIndex * 1000;
    }
    
    return { lat, lng, timestamp };
  }

  /**
   * 解析时间戳
   */
  private parseTimestamp(timestampStr: string): number {
    const numericTimestamp = parseFloat(timestampStr);
    if (!isNaN(numericTimestamp)) {
      const year2000Timestamp = 946684800;
      if (numericTimestamp > year2000Timestamp && numericTimestamp < year2000Timestamp * 1000) {
        return numericTimestamp * 1000;
      } else if (numericTimestamp > year2000Timestamp * 1000) {
        return numericTimestamp;
      }
    }
    
    const date = new Date(timestampStr);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
    
    return NaN;
  }

  /**
   * 从扩展格式转换为基础格式
   */
  fromExtendedFormat(points: ExtendedGPSPoint[]): GPSPoint[] {
    return points.map(point => ({
      lat: point.lat,
      lng: point.lng,
      timestamp: point.timestamp
    }));
  }

  /**
   * 转换为扩展格式
   */
  toExtendedFormat(points: GPSPoint[]): ExtendedGPSPoint[] {
    return points.map(point => ({
      ...point,
      spd: null,
      alt: null,
      cog: null
    }));
  }

  /**
   * 导出为JSON字符串
   */
  exportToJSON(points: GPSPoint[]): string {
    return JSON.stringify(points, null, 2);
  }

  /**
   * 从JSON数据加载GPS点
   */
  loadFromJSON(jsonData: any): GPSPoint[] {
    try {
      if (Array.isArray(jsonData)) {
        return this.parseGPSArray(jsonData);
      }
      
      if (typeof jsonData === 'object' && jsonData !== null) {
        const possibleArrayFields = [
          'points', 'data', 'locations', 'coordinates', 'trajectory', 'path'
        ];
        
        for (const field of possibleArrayFields) {
          if (Array.isArray(jsonData[field])) {
            return this.parseGPSArray(jsonData[field]);
          }
        }
        
        if (Array.isArray(jsonData.data) && jsonData.data.length > 0) {
          const firstDataItem = jsonData.data[0];
          if (Array.isArray(firstDataItem.locations)) {
            return this.parseGPSArray(firstDataItem.locations);
          }
          if (Array.isArray(firstDataItem.section?.locations)) {
            return this.parseGPSArray(firstDataItem.section.locations);
          }
        }
      }
      
      throw new Error('无法识别的JSON数据格式');
    } catch (error) {
      throw new Error(`JSON数据解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 解析GPS点数组
   */
  private parseGPSArray(array: any[]): GPSPoint[] {
    const points: GPSPoint[] = [];
    
    for (let i = 0; i < array.length; i++) {
      try {
        const point = this.parseGPSObject(array[i], i);
        if (point) {
          points.push(point);
        }
      } catch (error) {
        console.warn(`解析第${i + 1}个GPS点失败:`, array[i], error);
      }
    }
    
    return points;
  }

  /**
   * 解析GPS点对象
   */
  private parseGPSObject(obj: any, index: number): GPSPoint | null {
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }
    
    const latFields = ['lat', 'latitude', 'latitude1', 'y'];
    const lngFields = ['lng', 'lon', 'longitude', 'longitude1', 'x'];
    const timestampFields = ['timestamp', 'time', 'currentTime', 'date', 'datetime'];
    
    let lat: number | undefined;
    let lng: number | undefined;
    let timestamp: number | undefined;
    
    for (const field of latFields) {
      if (typeof obj[field] === 'number') {
        lat = obj[field];
        break;
      }
    }
    
    for (const field of lngFields) {
      if (typeof obj[field] === 'number') {
        lng = obj[field];
        break;
      }
    }
    
    for (const field of timestampFields) {
      if (obj[field] !== undefined && obj[field] !== null) {
        if (typeof obj[field] === 'number') {
          timestamp = obj[field];
        } else if (typeof obj[field] === 'string') {
          timestamp = this.parseTimestamp(obj[field]);
        }
        if (!isNaN(timestamp!)) {
          break;
        }
      }
    }
    
    if (lat === undefined || lng === undefined) {
      return null;
    }
    
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn(`第${index + 1}个点坐标超出有效范围: lat=${lat}, lng=${lng}`);
      return null;
    }
    
    if (timestamp === undefined || isNaN(timestamp)) {
      timestamp = Date.now() + index * 1000;
    }
    
    return { lat, lng, timestamp };
  }

  // =============== GPS处理方法 ===============

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<ProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取当前运行时状态
   */
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
      discardedDriftPointsCount: this.discardedDriftPointsCount,
      basePointRebuildsCount: this.basePointRebuildsCount,
      basePointRebuildPositions: this.basePointRebuildPositions
    };
  }

  /**
   * 计算两点间的Haversine距离（米）
   */
  private haversineDistance(point1: GPSPoint, point2: GPSPoint): number {
    const R = 6371000;
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
      return false;
    }

    const distance = this.haversineDistance(point, this.basePoint);
    const threshold = this.basePointRadius * this.config.driftThresholdMultiplier;

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
    const a = this.haversineDistance(p2, p3);
    const b = this.haversineDistance(p1, p3);
    const c = this.haversineDistance(p1, p2);

    const angleA = Math.acos((b * b + c * c - a * a) / (2 * b * c));
    const angleB = Math.acos((a * a + c * c - b * b) / (2 * a * c));
    const angleC = Math.acos((a * a + b * b - c * c) / (2 * a * b));

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

    const recentThree = points.slice(-3);
    const minAngle = this.calculateMinAngleInTriangle(recentThree[0], recentThree[1], recentThree[2]);

    if (minAngle < this.config.linearMotionAngleThreshold) {
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
    if (this.slidingWindow.length >= this.config.windowSize) {
      this.basePoint = this.calculateMedianPoint(this.slidingWindow);
      this.lastBasePointTime = Date.now();
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
    if (this.slidingWindow.length < this.config.windowSize) {
      this.slidingWindow.push(point);
      this.validPoints.push(point);

      if (this.slidingWindow.length === this.config.windowSize) {
        this.updateBasePoint();
        console.log(`滑动窗口已满，开始基准点计算`);
      }

      return true;
    }

    if (this.isBasePointExpired()) {
      console.log(`基准点过期，重新开始收集点`);
      this.slidingWindow = [point];
      this.validPoints.push(point);
      this.basePoint = null;
      this.basePointRadius = 0;
      this.consecutiveDriftPoints = [];
      return true;
    }

    if (this.isDriftPoint(point)) {
      this.consecutiveDriftPoints.push(point);

      if (this.consecutiveDriftPoints.length > this.config.maxDriftSequence) {
        this.consecutiveDriftPoints.shift();
      }

      console.log(`漂移点被记录: lat=${point.lat}, lng=${point.lng}, 连续漂移点数=${this.consecutiveDriftPoints.length}`);

      if (this.consecutiveDriftPoints.length >= 3) {
        if (this.isLinearMotion(this.consecutiveDriftPoints)) {
          console.log(`检测到直线运动误判，恢复漂移点并更新基准点`);

          for (const driftPoint of this.consecutiveDriftPoints) {
            this.validPoints.push(driftPoint);
            this.slidingWindow.push(driftPoint);
            if (this.slidingWindow.length > this.config.windowSize) {
              this.slidingWindow.shift();
            }
          }

          this.consecutiveDriftPoints = [];
          this.updateBasePoint();
          this.basePointRebuildsCount++;
          this.basePointRebuildPositions.push(point);

          return true;
        }
      }

      if (this.consecutiveDriftPoints.length >= this.config.maxDriftSequence) {
        console.log(`连续${this.config.maxDriftSequence}个漂移点，基准点失效，基于漂移点重新计算基准点`);
        this.slidingWindow = [...this.consecutiveDriftPoints];
        this.consecutiveDriftPoints = [];
        this.updateBasePoint();
        this.basePointRebuildsCount++;
        this.basePointRebuildPositions.push(point);
        this.validPoints.push(point);
        return true;
      }

      this.discardedDriftPointsCount++;
      return false;
    }

    if (this.consecutiveDriftPoints.length > 0) {
      console.log(`有效点出现，清空${this.consecutiveDriftPoints.length}个连续漂移点记录`);
      this.consecutiveDriftPoints = [];
    }

    this.slidingWindow.push(point);
    if (this.slidingWindow.length > this.config.windowSize) {
      this.slidingWindow.shift();
    }

    this.validPoints.push(point);
    this.updateBasePoint();

    return true;
  }

  /**
   * 处理GPS轨迹数据
   */
  public processTrajectory(originalPoints: GPSPoint[]): ProcessedResult {
    this.slidingWindow = [];
    this.validPoints = [];
    this.basePoint = null;
    this.lastBasePointTime = 0;
    this.basePointRadius = 0;
    this.consecutiveDriftPoints = [];
    this.discardedDriftPointsCount = 0;
    this.basePointRebuildsCount = 0;
    this.basePointRebuildPositions = [];

    const filteredPoints: GPSPoint[] = [];

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

  // =============== 静态工具方法 ===============

  /**
   * 转换新格式的GPS数据为内部格式
   */
  public static convertFromNewFormat(convertedPoints: ConvertedGPSPoint[]): GPSPoint[] {
    return convertedPoints.map((point, index) => ({
      lat: point.lat,
      lng: point.lng,
      timestamp: point.timestamp || Date.now() + index * 1000
    }));
  }

  /**
   * 创建新的算法包实例
   */
  public static createAlgorithmPackage(config?: Partial<AlgorithmConfig>): GPSAlgorithmPackage {
    const gpsAnalyzer = new GpsTrajectoryAnalyzer(config);
    const dataConverter = new GPSCore(config);
    const simulationGenerator = new GPSSimulationGenerator();
    
    return new GPSAlgorithmPackage(
      gpsAnalyzer,
      dataConverter,
      simulationGenerator,
      config
    );
  }

  /**
   * 使用新算法包处理GPS轨迹
   */
  public static processWithAlgorithmPackage(
    points: GPSPoint[], 
    config?: Partial<AlgorithmConfig>
  ): AlgorithmProcessingResult {
    const algorithmPackage = this.createAlgorithmPackage(config);
    
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
    
    const extendedPoints: ExtendedGPSPoint[] = points.map(p => ({
      lat: p.lat,
      lng: p.lng,
      timestamp: p.timestamp || Date.now(),
      spd: p.spd,
      alt: p.alt,
      cog: p.cog
    }));
    
    const basicPoints = algorithmPackage.fromExtendedFormat(extendedPoints);
    return algorithmPackage.processTrajectory(basicPoints);
  }
}

export default GPSCore;