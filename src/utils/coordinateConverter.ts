/**
 * 坐标转换工具类
 * 实现WGS84（GPS）坐标到GCJ-02（国内坐标系）的转换
 */

// 椭球参数
const a = 6378245.0; // 长半轴
const ee = 0.00669342162296594323; // 偏心率平方

/**
 * 判断是否在国内，不在国内则不做偏移
 * @param lng 经度
 * @param lat 纬度
 * @returns 是否在国内
 */
function outOfChina(lng: number, lat: number): boolean {
  return (lng < 72.004 || lng > 137.8347) || (lat < 0.8293 || lat > 55.8271);
}

/**
 * 转换纬度
 * @param lng 经度
 * @param lat 纬度
 * @returns 转换后的纬度偏移量
 */
function transformLat(lng: number, lat: number): number {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

/**
 * 转换经度
 * @param lng 经度
 * @param lat 纬度
 * @returns 转换后的经度偏移量
 */
function transformLng(lng: number, lat: number): number {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}

/**
 * WGS84坐标转GCJ02坐标
 * @param wgsLng WGS84经度
 * @param wgsLat WGS84纬度
 * @returns GCJ02坐标 {lng, lat}
 */
export function wgs84ToGcj02(wgsLng: number, wgsLat: number): { lng: number; lat: number } {
  if (outOfChina(wgsLng, wgsLat)) {
    return { lng: wgsLng, lat: wgsLat };
  }
  
  let dLat = transformLat(wgsLng - 105.0, wgsLat - 35.0);
  let dLng = transformLng(wgsLng - 105.0, wgsLat - 35.0);
  
  const radLat = wgsLat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  
  const mgLat = wgsLat + dLat;
  const mgLng = wgsLng + dLng;
  
  return { lng: mgLng, lat: mgLat };
}

/**
 * 批量转换GPS坐标到GCJ02坐标
 * @param points GPS坐标点数组
 * @returns 转换后的GCJ02坐标点数组
 */
export function convertGpsPointsToGcj02<T extends { lng: number; lat: number }>(points: T[]): T[] {
  return points.map(point => {
    const converted = wgs84ToGcj02(point.lng, point.lat);
    return {
      ...point,
      lng: converted.lng,
      lat: converted.lat
    };
  });
}

/**
 * 计算两点间距离（米）
 * @param lng1 点1经度
 * @param lat1 点1纬度
 * @param lng2 点2经度
 * @param lat2 点2纬度
 * @returns 距离（米）
 */
export function calculateDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const radLat1 = lat1 * Math.PI / 180.0;
  const radLat2 = lat2 * Math.PI / 180.0;
  const deltaLat = radLat1 - radLat2;
  const deltaLng = (lng1 - lng2) * Math.PI / 180.0;
  
  const distance = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin(deltaLat / 2), 2) + 
    Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(deltaLng / 2), 2)
  ));
  
  return distance * 6378137; // 地球半径（米）
}