/**
 * GPS轨迹分析算法包
 * 提供标准化的GPS数据处理接口
 * 支持多种算法实现的插拔式架构
 */

// ==================== 基础数据类型定义 ====================

/** GPS点数据结构 */
export interface GPSPoint {
  lat: number;        // 纬度
  lng: number;        // 经度
  timestamp: number;  // 时间戳（毫秒）
  isDeleted?: boolean; // 标记是否被删除（用于隧道场景）
}

/** 扩展GPS点数据结构（包含速度、高度、航向角） */
export interface ExtendedGPSPoint extends GPSPoint {
  spd?: number | null;  // 速度（km/h）
  alt?: number | null;  // 高度（米）
  cog?: number | null;  // 航向角（度，0-360）
}

/** 处理结果数据结构 */
export interface ProcessingResult {
  originalPoints: GPSPoint[];     // 原始输入点
  processedPoints: GPSPoint[];    // 处理后的有效点
  filteredPoints: GPSPoint[];     // 过滤掉的点
  statistics: ProcessingStatistics; // 处理统计信息
  markers?: MarkerInfo[];         // 标记信息（可选）
}

/** 处理统计信息 */
export interface ProcessingStatistics {
  totalInputPoints: number;           // 输入点总数
  validOutputPoints: number;          // 输出有效点数
  filteredPointsCount: number;        // 过滤点数
  discardedDriftPointsCount: number;  // 丢弃的漂移点数
  basePointRebuildsCount: number;     // 基准点重建次数
  processingTimeMs: number;           // 处理耗时（毫秒）
  filteringRate: number;              // 过滤率（0-1）
}

/** 标记信息 */
export interface MarkerInfo {
  type: 'tunnel' | 'drift' | 'speed' | 'rebuild';
  position: { lat: number; lng: number };
  info: string;
  timestamp?: number;
}

// ==================== 算法配置参数 ====================

/** 算法配置参数接口 */
export interface AlgorithmConfig {
  // 滑动窗口参数
  windowSize: number;                    // 滑动窗口大小（默认：10）
  
  // 基准点参数
  validityPeriod: number;                // 基准点有效期（毫秒，默认：15000）
  
  // 漂移检测参数
  maxDriftSequence: number;              // 最大连续漂移点数量（默认：10）
  driftThresholdMultiplier: number;      // 漂移判定阈值倍数（默认：2）
  
  // 直线运动检测参数
  linearMotionAngleThreshold: number;    // 直线漂移点误判角度阈值（度，默认：30）
  
  // 距离计算参数
  earthRadius: number;                   // 地球半径（米，默认：6371000）
  
  // 调试参数
  enableLogging: boolean;                // 是否启用日志输出（默认：false）
  logLevel: 'debug' | 'info' | 'warn' | 'error'; // 日志级别（默认：'info'）
}

/** 默认配置 */
export const DEFAULT_CONFIG: AlgorithmConfig = {
  windowSize: 10,
  validityPeriod: 15000,
  maxDriftSequence: 10,
  driftThresholdMultiplier: 2,
  linearMotionAngleThreshold: 30,
  earthRadius: 6371000,
  enableLogging: false,
  logLevel: 'info'
};

// ==================== 算法接口定义 ====================

/** GPS处理算法接口 */
export interface IGPSAlgorithm {
  /** 获取算法名称 */
  getName(): string;
  
  /** 获取算法版本 */
  getVersion(): string;
  
  /** 获取算法描述 */
  getDescription(): string;
  
  /** 设置配置参数 */
  setConfig(config: Partial<AlgorithmConfig>): void;
  
  /** 获取当前配置 */
  getConfig(): AlgorithmConfig;
  
  /** 重置算法状态 */
  reset(): void;
  
  /** 处理单个GPS点（流式处理） */
  processPoint(point: GPSPoint): boolean;
  
  /** 批量处理GPS轨迹 */
  processTrajectory(points: GPSPoint[]): ProcessingResult;
  
  /** 获取当前处理状态 */
  getStatus(): AlgorithmStatus;
}

/** 算法运行状态 */
export interface AlgorithmStatus {
  isInitialized: boolean;           // 是否已初始化
  slidingWindowSize: number;        // 当前滑动窗口大小
  validPointsCount: number;         // 有效点数量
  hasBasePoint: boolean;            // 是否有基准点
  basePointRadius: number;          // 基准点半径
  consecutiveDriftCount: number;    // 连续漂移点数量
  basePointAge: number;             // 基准点年龄（毫秒）
  isBasePointExpired: boolean;      // 基准点是否过期
  basePoint: { lat: number; lng: number } | null; // 当前基准点
  statistics: Partial<ProcessingStatistics>; // 统计信息
}

// ==================== 工具函数接口 ====================

/** 数据转换工具接口 */
export interface IDataConverter {
  /** 从字符串解析GPS点 */
  parseFromString(gpsString: string): GPSPoint[];
  
  /** 从扩展格式转换 */
  fromExtendedFormat(points: ExtendedGPSPoint[]): GPSPoint[];
  
  /** 转换为扩展格式 */
  toExtendedFormat(points: GPSPoint[]): ExtendedGPSPoint[];
  
  /** 从JSON文件加载 */
  loadFromJSON(jsonData: any): GPSPoint[];
  
  /** 导出为JSON */
  exportToJSON(points: GPSPoint[]): string;
}

/** 模拟数据生成器接口 */
export interface ISimulationGenerator {
  /** 生成模拟测试数据 */
  generateSimulatedData(originalData: GPSPoint[], options?: SimulationOptions): {
    points: GPSPoint[];
    markers: MarkerInfo[];
  };
}

/** 模拟选项 */
export interface SimulationOptions {
  staticDriftCount?: number;        // 静态漂移位置数量
  movingDriftCount?: number;        // 运动漂移位置数量
  tunnelCount?: number;             // 隧道数量
  speedScenarioCount?: number;      // 高速场景数量
  driftDistanceRange?: [number, number]; // 漂移距离范围
  driftDistribution?: { ratio: number; range: [number, number] }[]; // 漂移距离分布
}

// ==================== 主算法包类 ====================

/**
 * GPS算法包主类
 * 提供统一的算法管理和调用接口
 */
export class GPSAlgorithmPackage {
  private algorithm: IGPSAlgorithm;
  private dataConverter: IDataConverter;
  private simulationGenerator: ISimulationGenerator;
  private config: AlgorithmConfig;
  
  constructor(
    algorithm: IGPSAlgorithm,
    dataConverter?: IDataConverter,
    simulationGenerator?: ISimulationGenerator,
    config?: Partial<AlgorithmConfig>
  ) {
    this.algorithm = algorithm;
    this.dataConverter = dataConverter || new DefaultDataConverter();
    this.simulationGenerator = simulationGenerator || new DefaultSimulationGenerator();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 设置算法配置
    this.algorithm.setConfig(this.config);
  }
  
  // ==================== 配置管理 ====================
  
  /** 更新配置 */
  public updateConfig(newConfig: Partial<AlgorithmConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.algorithm.setConfig(this.config);
  }
  
  /** 获取当前配置 */
  public getConfig(): AlgorithmConfig {
    return { ...this.config };
  }
  
  /** 重置为默认配置 */
  public resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.algorithm.setConfig(this.config);
  }
  
  // ==================== 数据处理 ====================
  
  /** 处理GPS轨迹数据 */
  public processTrajectory(points: GPSPoint[]): ProcessingResult {
    const startTime = Date.now();
    
    try {
      const result = this.algorithm.processTrajectory(points);
      
      // 补充统计信息
      result.statistics.processingTimeMs = Date.now() - startTime;
      result.statistics.filteringRate = result.statistics.totalInputPoints > 0 
        ? result.statistics.filteredPointsCount / result.statistics.totalInputPoints 
        : 0;
      
      return result;
    } catch (error) {
      throw new Error(`GPS处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /** 流式处理单个GPS点 */
  public processPoint(point: GPSPoint): boolean {
    return this.algorithm.processPoint(point);
  }
  
  /** 重置算法状态 */
  public reset(): void {
    this.algorithm.reset();
  }
  
  // ==================== 数据转换 ====================
  
  /** 从字符串解析GPS数据 */
  public parseFromString(gpsString: string): GPSPoint[] {
    return this.dataConverter.parseFromString(gpsString);
  }
  
  /** 从扩展格式转换 */
  public fromExtendedFormat(points: ExtendedGPSPoint[]): GPSPoint[] {
    return this.dataConverter.fromExtendedFormat(points);
  }
  
  /** 从JSON加载数据 */
  public loadFromJSON(jsonData: any): GPSPoint[] {
    return this.dataConverter.loadFromJSON(jsonData);
  }
  
  /** 导出为JSON */
  public exportToJSON(points: GPSPoint[]): string {
    return this.dataConverter.exportToJSON(points);
  }
  
  // ==================== 模拟数据生成 ====================
  
  /** 生成模拟测试数据 */
  public generateSimulatedData(
    originalData: GPSPoint[], 
    options?: SimulationOptions
  ): { points: GPSPoint[]; markers: MarkerInfo[] } {
    return this.simulationGenerator.generateSimulatedData(originalData, options);
  }
  
  // ==================== 状态查询 ====================
  
  /** 获取算法信息 */
  public getAlgorithmInfo(): {
    name: string;
    version: string;
    description: string;
  } {
    return {
      name: this.algorithm.getName(),
      version: this.algorithm.getVersion(),
      description: this.algorithm.getDescription()
    };
  }
  
  /** 获取当前状态 */
  public getStatus(): AlgorithmStatus {
    return this.algorithm.getStatus();
  }
  
  // ==================== 工具方法 ====================
  
  /** 计算两点间距离（米） */
  public static calculateDistance(
    point1: { lat: number; lng: number }, 
    point2: { lat: number; lng: number },
    earthRadius: number = DEFAULT_CONFIG.earthRadius
  ): number {
    const lat1Rad = point1.lat * Math.PI / 180;
    const lat2Rad = point2.lat * Math.PI / 180;
    const deltaLatRad = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLngRad = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
  }
  
  /** 验证GPS点数据格式 */
  public static validateGPSPoint(point: any): point is GPSPoint {
    return (
      typeof point === 'object' &&
      point !== null &&
      typeof point.lat === 'number' &&
      typeof point.lng === 'number' &&
      typeof point.timestamp === 'number' &&
      point.lat >= -90 && point.lat <= 90 &&
      point.lng >= -180 && point.lng <= 180 &&
      point.timestamp > 0
    );
  }
  
  /** 验证GPS点数组 */
  public static validateGPSPoints(points: any[]): GPSPoint[] {
    if (!Array.isArray(points)) {
      throw new Error('输入数据必须是数组');
    }
    
    const validPoints: GPSPoint[] = [];
    const invalidIndices: number[] = [];
    
    points.forEach((point, index) => {
      if (this.validateGPSPoint(point)) {
        validPoints.push(point);
      } else {
        invalidIndices.push(index);
      }
    });
    
    if (invalidIndices.length > 0) {
      console.warn(`发现 ${invalidIndices.length} 个无效GPS点，索引: ${invalidIndices.join(', ')}`);
    }
    
    return validPoints;
  }
}

// ==================== 默认实现类（占位符） ====================

/** 默认数据转换器 */
class DefaultDataConverter implements IDataConverter {
  parseFromString(gpsString: string): GPSPoint[] {
    // 实现基础的字符串解析逻辑
    const points: GPSPoint[] = [];
    const lines = gpsString.trim().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const coords = line.split(/[,\s]+/).map(s => parseFloat(s.trim()));

      if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        points.push({
          lat: coords[0],
          lng: coords[1],
          timestamp: Date.now() + i * 1000
        });
      }
    }

    return points;
  }
  
  fromExtendedFormat(points: ExtendedGPSPoint[]): GPSPoint[] {
    return points.map(point => ({
      lat: point.lat,
      lng: point.lng,
      timestamp: point.timestamp
    }));
  }
  
  toExtendedFormat(points: GPSPoint[]): ExtendedGPSPoint[] {
    return points.map(point => ({
      ...point,
      spd: null,
      alt: null,
      cog: null
    }));
  }
  
  loadFromJSON(jsonData: any): GPSPoint[] {
    if (Array.isArray(jsonData)) {
      return GPSAlgorithmPackage.validateGPSPoints(jsonData);
    }
    throw new Error('JSON数据格式不正确，期望数组格式');
  }
  
  exportToJSON(points: GPSPoint[]): string {
    return JSON.stringify(points, null, 2);
  }
}

/** 默认模拟数据生成器 */
class DefaultSimulationGenerator implements ISimulationGenerator {
  generateSimulatedData(
    originalData: GPSPoint[], 
    options?: SimulationOptions
  ): { points: GPSPoint[]; markers: MarkerInfo[] } {
    // 基础实现，返回原始数据
    return {
      points: [...originalData],
      markers: []
    };
  }
}

// ==================== 导出 ====================

export default GPSAlgorithmPackage;