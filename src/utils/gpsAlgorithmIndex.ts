/**
 * GPS算法包主入口文件
 * 提供统一的导出接口，方便外部使用
 * 
 * @author GPS Trajectory Analyzer Team
 * @version 1.0.0
 */

// ==================== 核心算法包 ====================
export { GPSAlgorithmPackage } from './gpsAlgorithmPackage';
export { GpsTrajectoryAnalyzer } from './gpsTrajectoryAnalyzer';
export { GPSDataConverter } from './gpsDataConverter';
export { GPSSimulationGenerator } from './gpsSimulationGenerator';

// ==================== 接口定义 ====================
export type {
  // 基础数据结构
  GPSPoint,
  ExtendedGPSPoint,
  ProcessingResult,
  ProcessingStatistics,
  MarkerInfo,
  
  // 配置接口
  AlgorithmConfig,
  
  // 核心算法接口
  IGPSAlgorithm,
  AlgorithmStatus,
  
  // 工具接口
  IDataConverter,
  ISimulationGenerator,
  
  // 处理结果类型
  ProcessingResult as AlgorithmProcessingResult
} from './gpsAlgorithmPackage';

// ==================== 常量导出 ====================
export { DEFAULT_CONFIG } from './gpsAlgorithmPackage';

// ==================== 向后兼容性 ====================
// 导出原有的GPSProcessor以保持向后兼容
export { GPSProcessor } from './gpsProcessor';
export type {
  GPSPoint as LegacyGPSPoint,
  ConvertedGPSPoint,
  ProcessedResult,
  ProcessorConfig
} from './gpsProcessor';

// ==================== 快速创建函数 ====================

/**
 * 快速创建GPS算法包实例
 * @param config 可选的配置参数
 * @returns GPS算法包实例
 */
export function createGPSAlgorithmPackage(config?: Partial<AlgorithmConfig>): GPSAlgorithmPackage {
  const { GpsTrajectoryAnalyzer } = require('./gpsTrajectoryAnalyzer');
  const { GPSDataConverter } = require('./gpsDataConverter');
  const { GPSSimulationGenerator } = require('./gpsSimulationGenerator');
  const { GPSAlgorithmPackage } = require('./gpsAlgorithmPackage');
  
  const algorithm = new GpsTrajectoryAnalyzer(config);
  const converter = new GPSDataConverter();
  const simulator = new GPSSimulationGenerator();
  
  return new GPSAlgorithmPackage(algorithm, converter, simulator, config);
}

/**
 * 快速处理GPS轨迹数据
 * @param points GPS点数组
 * @param config 可选的配置参数
 * @returns 处理结果
 */
export function processGPSTrajectory(
  points: GPSPoint[], 
  config?: Partial<AlgorithmConfig>
): ProcessingResult {
  const algorithmPackage = createGPSAlgorithmPackage(config);
  return algorithmPackage.processTrajectory(points);
}

/**
 * 快速生成模拟GPS数据
 * @param basePoints 基础GPS点数组
 * @param options 模拟选项
 * @returns 模拟数据和标记
 */
export function generateSimulatedGPSData(
  basePoints: GPSPoint[],
  options?: {
    staticDriftCount?: number;
    movingDriftCount?: number;
    tunnelCount?: number;
    speedScenarioCount?: number;
  }
): { points: GPSPoint[]; markers: MarkerInfo[] } {
  const algorithmPackage = createGPSAlgorithmPackage();
  return algorithmPackage.generateSimulatedData(basePoints, options);
}

/**
 * 验证GPS数据格式
 * @param points 待验证的GPS点数组
 * @returns 验证结果
 */
export function validateGPSData(points: any[]): {
  valid: GPSPoint[];
  invalid: any[];
  validCount: number;
  invalidCount: number;
  validRate: number;
} {
  const { GPSAlgorithmPackage } = require('./gpsAlgorithmPackage');
  
  const valid: GPSPoint[] = [];
  const invalid: any[] = [];
  
  for (const point of points) {
    if (GPSAlgorithmPackage.validateGPSPoint(point)) {
      valid.push(point);
    } else {
      invalid.push(point);
    }
  }
  
  return {
    valid,
    invalid,
    validCount: valid.length,
    invalidCount: invalid.length,
    validRate: points.length > 0 ? valid.length / points.length : 0
  };
}

// ==================== 工具函数 ====================

/**
 * 计算两个GPS点之间的距离（米）
 * @param point1 第一个GPS点
 * @param point2 第二个GPS点
 * @returns 距离（米）
 */
export function calculateDistance(point1: GPSPoint, point2: GPSPoint): number {
  const { GPSAlgorithmPackage } = require('./gpsAlgorithmPackage');
  return GPSAlgorithmPackage.calculateDistance(point1, point2);
}

/**
 * 数据格式转换工具
 */
export const DataConverter = {
  /**
   * 从JSON字符串解析GPS数据
   */
  fromJSON: (jsonString: string): GPSPoint[] => {
    const converter = new (require('./gpsDataConverter').GPSDataConverter)();
    return converter.parseFromJSON(jsonString);
  },
  
  /**
   * 从CSV字符串解析GPS数据
   */
  fromCSV: (csvString: string, hasHeader: boolean = true): GPSPoint[] => {
    const converter = new (require('./gpsDataConverter').GPSDataConverter)();
    return converter.parseFromCSV(csvString, hasHeader);
  },
  
  /**
   * 导出为JSON字符串
   */
  toJSON: (points: GPSPoint[]): string => {
    const converter = new (require('./gpsDataConverter').GPSDataConverter)();
    return converter.exportToJSON(points);
  },
  
  /**
   * 导出为CSV字符串
   */
  toCSV: (points: GPSPoint[], includeHeader: boolean = true): string => {
    const converter = new (require('./gpsDataConverter').GPSDataConverter)();
    return converter.exportToCSV(points, includeHeader);
  }
};

// ==================== 版本信息 ====================
export const VERSION = '1.0.0';
export const ALGORITHM_NAME = 'DTU GPS Processing Algorithm Package';

// ==================== 使用示例 ====================
/**
 * 使用示例：
 * 
 * // 1. 基础使用
 * import { processGPSTrajectory } from './gpsAlgorithmIndex';
 * const result = processGPSTrajectory(gpsPoints);
 * 
 * // 2. 自定义配置
 * import { createGPSAlgorithmPackage } from './gpsAlgorithmIndex';
 * const algorithmPackage = createGPSAlgorithmPackage({ windowSize: 20 });
 * const result = algorithmPackage.processTrajectory(gpsPoints);
 * 
 * // 3. 数据转换
 * import { DataConverter } from './gpsAlgorithmIndex';
 * const points = DataConverter.fromJSON(jsonString);
 * const csvString = DataConverter.toCSV(points);
 * 
 * // 4. 模拟数据生成
 * import { generateSimulatedGPSData } from './gpsAlgorithmIndex';
 * const simulated = generateSimulatedGPSData(basePoints, { staticDriftCount: 5 });
 * 
 * // 5. 数据验证
 * import { validateGPSData } from './gpsAlgorithmIndex';
 * const validation = validateGPSData(rawData);
 * console.log(`有效数据率: ${validation.validRate * 100}%`);
 */