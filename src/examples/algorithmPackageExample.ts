/**
 * GPS算法包使用示例
 * 展示如何使用标准化的GPS处理接口
 */

import GPSAlgorithmPackage, {
  GPSPoint,
  ExtendedGPSPoint,
  AlgorithmConfig,
  ProcessingResult,
  SimulationOptions
} from '../utils/gpsAlgorithmPackage';
import DTUGpsAlgorithm from '../utils/dtuGpsAlgorithm';
import GPSDataConverter from '../utils/gpsDataConverter';
import GPSSimulationGenerator from '../utils/gpsSimulationGenerator';

/**
 * 基础使用示例
 */
export function basicUsageExample(): void {
  console.log('=== GPS算法包基础使用示例 ===');
  
  // 1. 创建算法包实例
  const dtuAlgorithm = new DTUGpsAlgorithm();
  const dataConverter = new GPSDataConverter();
  const simulationGenerator = new GPSSimulationGenerator();
  
  const gpsPackage = new GPSAlgorithmPackage(
    dtuAlgorithm,
    dataConverter,
    simulationGenerator
  );
  
  // 2. 查看算法信息
  const algorithmInfo = gpsPackage.getAlgorithmInfo();
  console.log('算法信息:', algorithmInfo);
  
  // 3. 准备测试数据
  const testPoints: GPSPoint[] = [
    { lat: 39.9042, lng: 116.4074, timestamp: Date.now() },
    { lat: 39.9043, lng: 116.4075, timestamp: Date.now() + 1000 },
    { lat: 39.9044, lng: 116.4076, timestamp: Date.now() + 2000 },
    { lat: 39.9045, lng: 116.4077, timestamp: Date.now() + 3000 },
    { lat: 39.9046, lng: 116.4078, timestamp: Date.now() + 4000 }
  ];
  
  // 4. 处理GPS轨迹
  const result = gpsPackage.processTrajectory(testPoints);
  console.log('处理结果:', {
    输入点数: result.statistics.totalInputPoints,
    输出点数: result.statistics.validOutputPoints,
    过滤点数: result.statistics.filteredPointsCount,
    处理耗时: result.statistics.processingTimeMs + 'ms'
  });
  
  // 5. 查看算法状态
  const status = gpsPackage.getStatus();
  console.log('算法状态:', status);
}

/**
 * 配置管理示例
 */
export function configurationExample(): void {
  console.log('\n=== 配置管理示例 ===');
  
  const gpsPackage = new GPSAlgorithmPackage(new DTUGpsAlgorithm());
  
  // 1. 查看默认配置
  console.log('默认配置:', gpsPackage.getConfig());
  
  // 2. 更新配置
  gpsPackage.updateConfig({
    windowSize: 15,
    driftThresholdMultiplier: 2.5,
    enableLogging: true,
    logLevel: 'debug'
  });
  
  console.log('更新后配置:', gpsPackage.getConfig());
  
  // 3. 重置配置
  gpsPackage.resetConfig();
  console.log('重置后配置:', gpsPackage.getConfig());
}

/**
 * 数据转换示例
 */
export function dataConversionExample(): void {
  console.log('\n=== 数据转换示例 ===');
  
  const gpsPackage = new GPSAlgorithmPackage(
    new DTUGpsAlgorithm(),
    new GPSDataConverter()
  );
  
  // 1. 从字符串解析GPS数据
  const gpsString = `
    39.9042,116.4074,1640995200000
    39.9043,116.4075,1640995201000
    39.9044,116.4076,1640995202000
  `;
  
  const pointsFromString = gpsPackage.parseFromString(gpsString);
  console.log('从字符串解析的点数:', pointsFromString.length);
  
  // 2. 从JSON加载数据
  const jsonData = [
    { lat: 39.9042, lng: 116.4074, timestamp: Date.now() },
    { lat: 39.9043, lng: 116.4075, timestamp: Date.now() + 1000 }
  ];
  
  const pointsFromJSON = gpsPackage.loadFromJSON(jsonData);
  console.log('从JSON加载的点数:', pointsFromJSON.length);
  
  // 3. 扩展格式转换
  const extendedPoints: ExtendedGPSPoint[] = [
    { lat: 39.9042, lng: 116.4074, timestamp: Date.now(), spd: 60, alt: 100, cog: 90 },
    { lat: 39.9043, lng: 116.4075, timestamp: Date.now() + 1000, spd: 65, alt: 105, cog: 95 }
  ];
  
  const basicPoints = gpsPackage.fromExtendedFormat(extendedPoints);
  console.log('转换为基础格式的点数:', basicPoints.length);
  
  // 4. 导出为JSON
  const jsonString = gpsPackage.exportToJSON(basicPoints);
  console.log('导出的JSON长度:', jsonString.length);
}

/**
 * 模拟数据生成示例
 */
export function simulationExample(): void {
  console.log('\n=== 模拟数据生成示例 ===');
  
  const gpsPackage = new GPSAlgorithmPackage(
    new DTUGpsAlgorithm(),
    new GPSDataConverter(),
    new GPSSimulationGenerator()
  );
  
  // 1. 准备原始数据
  const originalData: GPSPoint[] = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < 100; i++) {
    originalData.push({
      lat: 39.9042 + i * 0.0001,
      lng: 116.4074 + i * 0.0001,
      timestamp: baseTime + i * 1000
    });
  }
  
  // 2. 生成模拟数据
  const simulationOptions: SimulationOptions = {
    staticDriftCount: 2,
    movingDriftCount: 1,
    tunnelCount: 1,
    speedScenarioCount: 1,
    driftDistanceRange: [100, 400]
  };
  
  const { points: simulatedPoints, markers } = gpsPackage.generateSimulatedData(
    originalData,
    simulationOptions
  );
  
  console.log('模拟数据生成结果:', {
    原始点数: originalData.length,
    模拟点数: simulatedPoints.length,
    标记数量: markers.length,
    标记类型: markers.map(m => m.type)
  });
  
  // 3. 处理模拟数据
  const result = gpsPackage.processTrajectory(simulatedPoints);
  console.log('模拟数据处理结果:', {
    输入点数: result.statistics.totalInputPoints,
    输出点数: result.statistics.validOutputPoints,
    过滤率: (result.statistics.filteringRate * 100).toFixed(2) + '%',
    基准点重建次数: result.statistics.basePointRebuildsCount
  });
}

/**
 * 流式处理示例
 */
export function streamProcessingExample(): void {
  console.log('\n=== 流式处理示例 ===');
  
  const gpsPackage = new GPSAlgorithmPackage(new DTUGpsAlgorithm());
  
  // 重置算法状态
  gpsPackage.reset();
  
  let validCount = 0;
  let totalCount = 0;
  
  // 模拟实时GPS数据流
  const baseTime = Date.now();
  for (let i = 0; i < 50; i++) {
    const point: GPSPoint = {
      lat: 39.9042 + i * 0.0001 + (Math.random() - 0.5) * 0.001, // 添加一些噪声
      lng: 116.4074 + i * 0.0001 + (Math.random() - 0.5) * 0.001,
      timestamp: baseTime + i * 1000
    };
    
    const isValid = gpsPackage.processPoint(point);
    totalCount++;
    
    if (isValid) {
      validCount++;
      console.log(`点 ${i + 1}: 有效 (${point.lat.toFixed(6)}, ${point.lng.toFixed(6)})`);
    } else {
      console.log(`点 ${i + 1}: 过滤 (${point.lat.toFixed(6)}, ${point.lng.toFixed(6)})`);
    }
    
    // 每10个点显示一次状态
    if ((i + 1) % 10 === 0) {
      const status = gpsPackage.getStatus();
      console.log(`--- 状态更新 (${i + 1}/50) ---`);
      console.log(`有效点数: ${status.validPointsCount}`);
      console.log(`滑动窗口大小: ${status.slidingWindowSize}`);
      console.log(`基准点状态: ${status.hasBasePoint ? '存在' : '不存在'}`);
      console.log(`连续漂移数: ${status.consecutiveDriftCount}`);
    }
  }
  
  console.log(`\n流式处理完成: ${validCount}/${totalCount} 点有效 (${(validCount/totalCount*100).toFixed(1)}%)`);
}

/**
 * 算法对比示例
 */
export function algorithmComparisonExample(): void {
  console.log('\n=== 算法对比示例 ===');
  
  // 准备测试数据
  const testData: GPSPoint[] = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < 200; i++) {
    testData.push({
      lat: 39.9042 + i * 0.0001,
      lng: 116.4074 + i * 0.0001,
      timestamp: baseTime + i * 1000
    });
  }
  
  // 生成模拟数据
  const simulationGenerator = new GPSSimulationGenerator();
  const { points: simulatedData } = simulationGenerator.generateSimulatedData(testData, {
    staticDriftCount: 3,
    movingDriftCount: 2,
    tunnelCount: 1,
    speedScenarioCount: 1
  });
  
  // 测试不同配置的DTU算法
  const configs = [
    { name: '保守配置', config: { driftThresholdMultiplier: 1.5, maxDriftSequence: 5 } },
    { name: '标准配置', config: { driftThresholdMultiplier: 2.0, maxDriftSequence: 10 } },
    { name: '宽松配置', config: { driftThresholdMultiplier: 3.0, maxDriftSequence: 15 } }
  ];
  
  console.log('测试数据:', {
    原始点数: testData.length,
    模拟点数: simulatedData.length
  });
  
  for (const { name, config } of configs) {
    const gpsPackage = new GPSAlgorithmPackage(new DTUGpsAlgorithm(config));
    const result = gpsPackage.processTrajectory(simulatedData);
    
    console.log(`\n${name}结果:`, {
      输出点数: result.statistics.validOutputPoints,
      过滤点数: result.statistics.filteredPointsCount,
      过滤率: (result.statistics.filteringRate * 100).toFixed(2) + '%',
      基准点重建: result.statistics.basePointRebuildsCount,
      处理耗时: result.statistics.processingTimeMs + 'ms'
    });
  }
}

/**
 * 数据验证示例
 */
export function dataValidationExample(): void {
  console.log('\n=== 数据验证示例 ===');
  
  // 测试数据（包含有效和无效数据）
  const testData = [
    { lat: 39.9042, lng: 116.4074, timestamp: Date.now() }, // 有效
    { lat: 91, lng: 116.4074, timestamp: Date.now() }, // 无效：纬度超范围
    { lat: 39.9042, lng: 181, timestamp: Date.now() }, // 无效：经度超范围
    { lat: 39.9042, lng: 116.4074 }, // 无效：缺少时间戳
    { lat: 'invalid', lng: 116.4074, timestamp: Date.now() }, // 无效：纬度非数字
    { lat: 39.9043, lng: 116.4075, timestamp: Date.now() + 1000 } // 有效
  ];
  
  // 验证GPS点
  const validPoints = GPSAlgorithmPackage.validateGPSPoints(testData);
  console.log('数据验证结果:', {
    输入数据数量: testData.length,
    有效点数量: validPoints.length,
    无效点数量: testData.length - validPoints.length
  });
  
  // 显示有效点
  console.log('有效点:', validPoints);
}

/**
 * 性能测试示例
 */
export function performanceTestExample(): void {
  console.log('\n=== 性能测试示例 ===');
  
  const gpsPackage = new GPSAlgorithmPackage(new DTUGpsAlgorithm());
  
  // 生成大量测试数据
  const largeDataset: GPSPoint[] = [];
  const baseTime = Date.now();
  
  console.log('生成测试数据...');
  for (let i = 0; i < 10000; i++) {
    largeDataset.push({
      lat: 39.9042 + i * 0.00001,
      lng: 116.4074 + i * 0.00001,
      timestamp: baseTime + i * 100
    });
  }
  
  console.log(`测试数据生成完成: ${largeDataset.length} 个点`);
  
  // 性能测试
  const startTime = Date.now();
  const result = gpsPackage.processTrajectory(largeDataset);
  const endTime = Date.now();
  
  const processingTime = endTime - startTime;
  const pointsPerSecond = Math.round(largeDataset.length / (processingTime / 1000));
  
  console.log('性能测试结果:', {
    数据点数: largeDataset.length,
    处理耗时: processingTime + 'ms',
    处理速度: pointsPerSecond + ' 点/秒',
    输出点数: result.statistics.validOutputPoints,
    过滤点数: result.statistics.filteredPointsCount,
    内存使用: process.memoryUsage().heapUsed / 1024 / 1024 + 'MB'
  });
}

/**
 * 运行所有示例
 */
export function runAllExamples(): void {
  console.log('🚀 GPS算法包示例演示开始\n');
  
  try {
    basicUsageExample();
    configurationExample();
    dataConversionExample();
    simulationExample();
    streamProcessingExample();
    algorithmComparisonExample();
    dataValidationExample();
    performanceTestExample();
    
    console.log('\n✅ 所有示例演示完成！');
  } catch (error) {
    console.error('❌ 示例运行出错:', error);
  }
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
  runAllExamples();
}