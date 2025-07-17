/**
 * GPS数据转换器实现
 * 支持多种GPS数据格式的解析和转换
 */

import {
  IDataConverter,
  GPSPoint,
  ExtendedGPSPoint,
  GPSAlgorithmPackage
} from './gpsAlgorithmPackage';

/**
 * 完整的GPS数据转换器实现
 */
export class GPSDataConverter implements IDataConverter {
  
  /**
   * 从字符串解析GPS点
   * 支持多种格式：
   * - "lat,lng" 或 "lat lng"
   * - "lat,lng,timestamp" 或 "lat lng timestamp"
   * - 每行一个点
   */
  parseFromString(gpsString: string): GPSPoint[] {
    const points: GPSPoint[] = [];
    const lines = gpsString.trim().split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) {
        continue; // 跳过空行和注释
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
    // 支持多种分隔符：逗号、空格、制表符、分号
    const parts = line.split(/[,\s;\t]+/).map(s => s.trim()).filter(s => s);
    
    if (parts.length < 2) {
      return null;
    }
    
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    
    if (isNaN(lat) || isNaN(lng)) {
      return null;
    }
    
    // 验证坐标范围
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn(`第${lineIndex + 1}行坐标超出有效范围: lat=${lat}, lng=${lng}`);
      return null;
    }
    
    // 解析时间戳
    let timestamp: number;
    if (parts.length >= 3) {
      const timestampStr = parts[2];
      
      // 尝试解析不同的时间格式
      timestamp = this.parseTimestamp(timestampStr);
      
      if (isNaN(timestamp)) {
        // 如果时间戳解析失败，使用当前时间 + 索引
        timestamp = Date.now() + lineIndex * 1000;
      }
    } else {
      // 没有时间戳，使用当前时间 + 索引
      timestamp = Date.now() + lineIndex * 1000;
    }
    
    return { lat, lng, timestamp };
  }
  
  /**
   * 解析时间戳
   * 支持多种格式：
   * - Unix时间戳（秒或毫秒）
   * - ISO 8601格式
   * - 常见日期格式
   */
  private parseTimestamp(timestampStr: string): number {
    // 尝试直接解析为数字（Unix时间戳）
    const numericTimestamp = parseFloat(timestampStr);
    if (!isNaN(numericTimestamp)) {
      // 判断是秒还是毫秒（假设2000年后的时间戳）
      const year2000Timestamp = 946684800; // 2000-01-01 00:00:00 UTC
      if (numericTimestamp > year2000Timestamp && numericTimestamp < year2000Timestamp * 1000) {
        return numericTimestamp * 1000; // 秒转毫秒
      } else if (numericTimestamp > year2000Timestamp * 1000) {
        return numericTimestamp; // 已经是毫秒
      }
    }
    
    // 尝试解析为日期字符串
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
   * 支持多种JSON格式
   */
  loadFromJSON(jsonData: any): GPSPoint[] {
    try {
      // 直接是GPS点数组
      if (Array.isArray(jsonData)) {
        return this.parseGPSArray(jsonData);
      }
      
      // 包装在对象中的数组
      if (typeof jsonData === 'object' && jsonData !== null) {
        // 尝试常见的字段名
        const possibleArrayFields = [
          'points', 'data', 'locations', 'coordinates', 'trajectory', 'path'
        ];
        
        for (const field of possibleArrayFields) {
          if (Array.isArray(jsonData[field])) {
            return this.parseGPSArray(jsonData[field]);
          }
        }
        
        // 检查嵌套结构（如 data[0].locations）
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
    
    // 尝试不同的字段名组合
    const latFields = ['lat', 'latitude', 'latitude1', 'y'];
    const lngFields = ['lng', 'lon', 'longitude', 'longitude1', 'x'];
    const timestampFields = ['timestamp', 'time', 'currentTime', 'date', 'datetime'];
    
    let lat: number | undefined;
    let lng: number | undefined;
    let timestamp: number | undefined;
    
    // 查找纬度
    for (const field of latFields) {
      if (typeof obj[field] === 'number') {
        lat = obj[field];
        break;
      }
    }
    
    // 查找经度
    for (const field of lngFields) {
      if (typeof obj[field] === 'number') {
        lng = obj[field];
        break;
      }
    }
    
    // 查找时间戳
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
    
    // 验证必需字段
    if (lat === undefined || lng === undefined) {
      return null;
    }
    
    // 验证坐标范围
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn(`第${index + 1}个点坐标超出有效范围: lat=${lat}, lng=${lng}`);
      return null;
    }
    
    // 如果没有时间戳，生成一个
    if (timestamp === undefined || isNaN(timestamp)) {
      timestamp = Date.now() + index * 1000;
    }
    
    return { lat, lng, timestamp };
  }
  

  

}

export default GPSDataConverter;