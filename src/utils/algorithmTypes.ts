/**
 * 算法类型定义文件
 * 提供统一的类型导出
 */

// 从主包导出所有类型
export type {
  GPSPoint,
  ExtendedGPSPoint,
  ProcessingResult,
  ProcessingStatistics,
  MarkerInfo,
  AlgorithmConfig,
  IGPSAlgorithm,
  AlgorithmStatus,
  IDataConverter,
  ISimulationGenerator,
  SimulationOptions
} from './gpsAlgorithmPackage';

// 导出默认配置
export { DEFAULT_CONFIG } from './gpsAlgorithmPackage';