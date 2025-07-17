/**
 * GPS算法包完整使用示例
 * 展示如何使用新的标准化GPS处理接口
 * 
 * @author DTU GPS Team
 * @version 1.0.0
 */

import {
  // 核心类
  GPSAlgorithmPackage,
  DTUGpsAlgorithm,
  GPSDataConverter,
  GPSSimulationGenerator,
  
  // 快速函数
  createGPSAlgorithmPackage,
  processGPSTrajectory,
  generateSimulatedGPSData,
  validateGPSData,
  calculateDistance,
  DataConverter,
  
  // 类型定义
  GPSPoint,
  ExtendedGPSPoint,
  ProcessingResult,
  AlgorithmConfig,
  DEFAULT_CONFIG,
  
  // 向后兼容
  GPSProcessor
} from '../utils/gpsAlgorithmIndex';

// ==================== 示例数据 ====================

const sampleGPSPoints: GPSPoint[] = [
  { lat: 55.7858, lng: 12.5233, timestamp: Date.now() - 60000 },
  { lat: 55.7859, lng: 12.5234, timestamp: Date.now() - 50000 },
  { lat: 55.7860, lng: 12.5235, timestamp: Date.now() - 40000 },
  { lat: 55.7861, lng: 12.5236, timestamp: Date.now() - 30000 },
  { lat: 55.7862, lng: 12.5237, timestamp: Date.now() - 20000 },
  { lat: 55.7863, lng: 12.5238, timestamp: Date.now() - 10000 },
  { lat: 55.7864, lng: 12.5239, timestamp: Date.now() }
];

const sampleExtendedPoints: ExtendedGPSPoint[] = [
  { lat: 55.7858, lng: 12.5233, timestamp: Date.now() - 60000, spd: 10.5, alt: 25.0, cog: 45 },
  { lat: 55.7859, lng: 12.5234, timestamp: Date.now() - 50000, spd: 12.3, alt: 26.0, cog: 47 },
  { lat: 55.7860, lng: 12.5235, timestamp: Date.now() - 40000, spd: 11.8, alt: 24.5, cog: 46 }
];

// ==================== 基础使用示例 ====================

/**
 * 示例1：快速处理GPS轨迹
 */
export function example1_QuickProcessing() {
  console.log('=== 示例1：快速处理GPS轨迹 ===');
  
  // 使用默认配置快速处理
  const result = processGPSTrajectory(sampleGPSPoints);
  
  console.log('处理结果：', {
    总点数: result.processedPoints.length,
    有效点数: result.statistics.validPointsCount,
    漂移点数: result.statistics.driftPointsCount,
    处理时间: result.statistics.processingTimeMs + 'ms'
  });
  
  // 显示标记信息
  if (result.markers.length > 0) {
    console.log('检测到的异常：');
    result.markers.forEach((marker, index) => {
      console.log(`  ${index + 1}. ${marker.type}: ${marker.description}`);
    });
  }
  
  return result;
}

/**
 * 示例2：自定义配置处理
 */
export function example2_CustomConfig() {
  console.log('\n=== 示例2：自定义配置处理 ===');
  
  // 自定义配置
  const customConfig: Partial<AlgorithmConfig> = {
    windowSize: 20,
    validityPeriod: 300000, // 5分钟
    maxDriftSequence: 8,
    driftThresholdMultiplier: 2.5,
    linearMotionAngleThreshold: 15
  };
  
  console.log('使用配置：', customConfig);
  
  // 创建算法包实例
  const algorithmPackage = createGPSAlgorithmPackage(customConfig);
  
  // 处理数据
  const result = algorithmPackage.processTrajectory(sampleGPSPoints);
  
  console.log('处理结果：', {
    配置: algorithmPackage.getConfig(),
    状态: algorithmPackage.getStatus(),
    统计: result.statistics
  });
  
  return result;
}

/**
 * 示例3：扩展格式数据处理
 */
export function example3_ExtendedFormat() {
  console.log('\n=== 示例3：扩展格式数据处理 ===');
  
  const algorithmPackage = createGPSAlgorithmPackage();
  
  // 处理扩展格式数据
  const basicPoints = algorithmPackage.fromExtendedFormat(sampleExtendedPoints);
  console.log('转换后的基础点数：', basicPoints.length);
  
  // 转换回扩展格式
  const extendedResult = algorithmPackage.toExtendedFormat(basicPoints, {
    defaultSpeed: 15.0,
    defaultAltitude: 30.0,
    defaultCourse: 90
  });
  
  console.log('扩展格式结果：', extendedResult.slice(0, 2));
  
  return extendedResult;
}

/**
 * 示例4：数据格式转换
 */
export function example4_DataConversion() {
  console.log('\n=== 示例4：数据格式转换 ===');
  
  // 导出为JSON
  const jsonString = DataConverter.toJSON(sampleGPSPoints);
  console.log('JSON格式（前100字符）：', jsonString.substring(0, 100) + '...');
  
  // 从JSON解析
  const parsedFromJSON = DataConverter.fromJSON(jsonString);
  console.log('从JSON解析的点数：', parsedFromJSON.length);
  
  // 导出为CSV
  const csvString = DataConverter.toCSV(sampleGPSPoints, true);
  console.log('CSV格式：');
  console.log(csvString);
  
  // 从CSV解析
  const parsedFromCSV = DataConverter.fromCSV(csvString, true);
  console.log('从CSV解析的点数：', parsedFromCSV.length);
  
  return { jsonString, csvString, parsedFromJSON, parsedFromCSV };
}

/**
 * 示例5：模拟数据生成
 */
export function example5_SimulationGeneration() {
  console.log('\n=== 示例5：模拟数据生成 ===');
  
  // 生成模拟数据
  const simulatedData = generateSimulatedGPSData(sampleGPSPoints, {
    staticDriftCount: 3,
    movingDriftCount: 2,
    tunnelCount: 1,
    speedScenarioCount: 2
  });
  
  console.log('模拟数据统计：', {
    原始点数: sampleGPSPoints.length,
    模拟点数: simulatedData.points.length,
    标记数量: simulatedData.markers.length
  });
  
  // 显示生成的标记
  console.log('生成的异常场景：');
  simulatedData.markers.forEach((marker, index) => {
    console.log(`  ${index + 1}. ${marker.type}: ${marker.description}`);
  });
  
  return simulatedData;
}

/**
 * 示例6：数据验证
 */
export function example6_DataValidation() {
  console.log('\n=== 示例6：数据验证 ===');
  
  // 创建包含无效数据的测试数组
  const mixedData = [
    ...sampleGPSPoints,
    { lat: 'invalid', lng: 12.5233, timestamp: Date.now() }, // 无效纬度
    { lat: 55.7858, lng: null, timestamp: Date.now() }, // 无效经度
    { lat: 55.7858, lng: 12.5233 }, // 缺少时间戳
    { lat: 200, lng: 12.5233, timestamp: Date.now() }, // 超出范围的纬度
  ];
  
  const validation = validateGPSData(mixedData);
  
  console.log('验证结果：', {
    总数据量: mixedData.length,
    有效数据: validation.validCount,
    无效数据: validation.invalidCount,
    有效率: (validation.validRate * 100).toFixed(2) + '%'
  });
  
  if (validation.invalid.length > 0) {
    console.log('无效数据示例：');
    validation.invalid.forEach((item, index) => {
      console.log(`  ${index + 1}.`, item);
    });
  }
  
  return validation;
}

/**
 * 示例7：流式处理
 */
export function example7_StreamProcessing() {
  console.log('\n=== 示例7：流式处理 ===');
  
  const algorithmPackage = createGPSAlgorithmPackage();
  
  console.log('开始流式处理...');
  
  // 模拟逐个处理GPS点
  sampleGPSPoints.forEach((point, index) => {
    const result = algorithmPackage.processPoint(point);
    
    console.log(`处理点 ${index + 1}:`, {
      输入: `(${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
      结果: result ? `(${result.lat.toFixed(4)}, ${result.lng.toFixed(4)})` : '被过滤',
      状态: algorithmPackage.getStatus().currentState
    });
  });
  
  // 获取最终统计
  const finalStats = algorithmPackage.getStatistics();
  console.log('流式处理统计：', finalStats);
  
  return finalStats;
}

/**
 * 示例8：算法对比
 */
export function example8_AlgorithmComparison() {
  console.log('\n=== 示例8：算法对比 ===');
  
  // 使用新算法包
  const startTime1 = Date.now();
  const newResult = processGPSTrajectory(sampleGPSPoints);
  const newTime = Date.now() - startTime1;
  
  // 使用旧处理器（向后兼容）
  const startTime2 = Date.now();
  const oldProcessor = new GPSProcessor();
  const oldResult = oldProcessor.processTrajectory(sampleGPSPoints);
  const oldTime = Date.now() - startTime2;
  
  console.log('算法对比结果：');
  console.log('新算法包：', {
    处理时间: newTime + 'ms',
    有效点数: newResult.statistics.validPointsCount,
    漂移点数: newResult.statistics.driftPointsCount,
    标记数量: newResult.markers.length
  });
  
  console.log('旧处理器：', {
    处理时间: oldTime + 'ms',
    有效点数: oldResult.validPoints.length,
    漂移点数: oldResult.driftPoints.length,
    标记数量: oldResult.markers?.length || 0
  });
  
  return { newResult, oldResult, newTime, oldTime };
}

/**
 * 示例9：性能测试
 */
export function example9_PerformanceTest() {
  console.log('\n=== 示例9：性能测试 ===');
  
  // 生成大量测试数据
  const largeDataset: GPSPoint[] = [];
  const baseTime = Date.now() - 3600000; // 1小时前
  
  for (let i = 0; i < 1000; i++) {
    largeDataset.push({
      lat: 55.7858 + (Math.random() - 0.5) * 0.01,
      lng: 12.5233 + (Math.random() - 0.5) * 0.01,
      timestamp: baseTime + i * 1000 // 每秒一个点
    });
  }
  
  console.log(`生成测试数据：${largeDataset.length} 个GPS点`);
  
  // 性能测试
  const startTime = Date.now();
  const result = processGPSTrajectory(largeDataset);
  const processingTime = Date.now() - startTime;
  
  console.log('性能测试结果：', {
    数据量: largeDataset.length,
    处理时间: processingTime + 'ms',
    平均每点: (processingTime / largeDataset.length).toFixed(3) + 'ms',
    吞吐量: Math.round(largeDataset.length / (processingTime / 1000)) + ' 点/秒',
    有效点数: result.statistics.validPointsCount,
    漂移点数: result.statistics.driftPointsCount
  });
  
  return result;
}

/**
 * 示例10：工具函数使用
 */
export function example10_UtilityFunctions() {
  console.log('\n=== 示例10：工具函数使用 ===');
  
  // 距离计算
  const point1 = sampleGPSPoints[0];
  const point2 = sampleGPSPoints[1];
  const distance = calculateDistance(point1, point2);
  
  console.log('距离计算：', {
    点1: `(${point1.lat}, ${point1.lng})`,
    点2: `(${point2.lat}, ${point2.lng})`,
    距离: distance.toFixed(2) + '米'
  });
  
  // 配置信息
  console.log('默认配置：', DEFAULT_CONFIG);
  
  // 算法包信息
  const algorithmPackage = createGPSAlgorithmPackage();
  console.log('算法包状态：', algorithmPackage.getStatus());
  
  return { distance, config: DEFAULT_CONFIG };
}

// ==================== 运行所有示例 ====================

/**
 * 运行所有示例
 */
export function runAllExamples() {
  console.log('🚀 开始运行GPS算法包示例...');
  console.log('=' .repeat(50));
  
  try {
    const results = {
      example1: example1_QuickProcessing(),
      example2: example2_CustomConfig(),
      example3: example3_ExtendedFormat(),
      example4: example4_DataConversion(),
      example5: example5_SimulationGeneration(),
      example6: example6_DataValidation(),
      example7: example7_StreamProcessing(),
      example8: example8_AlgorithmComparison(),
      example9: example9_PerformanceTest(),
      example10: example10_UtilityFunctions()
    };
    
    console.log('\n' + '=' .repeat(50));
    console.log('✅ 所有示例运行完成！');
    
    return results;
  } catch (error) {
    console.error('❌ 示例运行出错：', error);
    throw error;
  }
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
  runAllExamples();
}