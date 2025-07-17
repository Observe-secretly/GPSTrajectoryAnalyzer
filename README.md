# GPS Trajectory Analyzer

一个基于 Vue 3 和 TypeScript 的 GPS 轨迹分析工具，用于处理和可视化 GPS 轨迹数据。

## 主要功能

- GPS 轨迹数据导入和处理
- 轨迹点可视化展示
- 轨迹数据分析和统计
- 模拟数据生成
- 实时轨迹处理

## 技术栈

- Vue 3
- TypeScript
- Vite
- 高德地图 JavaScript API

## 开发环境配置

推荐使用 [VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (需要禁用 Vetur)。

### TypeScript 支持

由于 TypeScript 默认无法处理 `.vue` 文件的类型信息，我们使用 `vue-tsc` 替代 `tsc` CLI 进行类型检查。在编辑器中，需要 [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) 来使 TypeScript 语言服务识别 `.vue` 类型。

## 项目设置

```sh
npm install
```

### 开发模式

```sh
npm run dev
```

### 类型检查、编译和打包

```sh
npm run build
```

### ESLint 代码检查

```sh
npm run lint
```
