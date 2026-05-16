---
name: image-vision-helper
description: 纯本地识图技能，仅使用本地运行的 minicpm-v:8b 模型解析图片，解析完成后自动切回 deepseek-v4-pro 生成前端代码。全程本地运行，不联网、不使用第三方API。
user-invocable: true
allowed-tools: Read
---

# 本地识图助手（minicpm-v:8b 专用 · 纯本地）

## 核心规则（必须严格遵守）

1. 仅使用 **本地运行的 minicpm-v:8b** 进行图片识别
2. 不使用任何在线API、不使用第三方服务、不联网
3. 识图完成后 **自动切回 deepseek-v4-pro** 写代码
4. 不询问用户、不切换模型、全自动执行

## 触发条件

用户上传：

- UI 设计图
- 截图
- 页面图片
- 指令包含：看图、根据图写代码、还原这个UI、解析图片

## 固定工作流程（全自动）

1. **自动切换到本地识图模型**
   /model minicpm-v:8b

2. **对图片进行完整解析**
   必须输出以下结构，不漏任何细节：
   【页面类型】
   【整体布局】
   【主色调 + 辅助色（尽量给色值）】
   【页面风格】
   【所有组件清单】
   【所有文字内容】
   【交互效果】

3. **解析完成后 自动切回主模型**
   /model deepseek-v4-pro

4. **根据解析结果生成前端代码**
   默认使用：React + Tailwind CSS
   可根据用户需求生成：HTML / Vue / Uniapp / React 等

## 输出格式（严格遵守）

### 【本地图片解析结果】

- 页面类型：xxx
- 整体布局：xxx
- 主色调：xxx
- 辅助色：xxx
- 页面风格：xxx
- 组件清单：
  1. xxx
  2. xxx
- 页面文字：
  xxx
- 交互效果：
  xxx

### 【前端代码（由 deepseek-v4-pro 生成）】

这里输出可直接运行的代码
