# MetaCode

跨平台桌面 AI 编程助手，基于 Electron + React + TypeScript 构建。

![MetaCode 设置页](/public/setting.png)

## 功能特性

- **多模型支持** — 内置 Anthropic Claude、OpenAI、Google Gemini、Ollama 本地模型预设，支持自定义 API 端点
- **网关管理** — 每个提供商可配置 5 个模型槽位（默认、专家、小模型、分析、图片处理），灵活切换
- **Agent 工具链** — 集成本地 Read / Edit / Write / Bash 工具，Agent 可直接读写文件系统
- **流式对话** — 实时流式输出，支持中途中断，显示 Token 用量
- **多会话管理** — 标签页式会话切换，按项目自动分组，支持归档
- **三栏布局** — 左侧文件树/会话列表 | 中间对话区 | 右侧预览/轨迹面板，均支持拖拽调整宽度
- **内置编辑器** — 集成 Monaco Editor，支持代码高亮与查看
- **内置预览** — 右侧面板内嵌 Web 预览，支持 URL 历史记录
- **暗色/亮色主题** — 一键切换，自动持久化
- **用量统计** — 可视化 Token 消耗与请求次数
- **跨平台** — 支持 Windows（NSIS / 便携版）、macOS（DMG / ZIP）、Linux（AppImage / deb）

![MetaCode 代码预览标注](/public/code_preview.png)

![MetaCode 页面预览标注](/public/dev_preview.png)

## 技术栈

| 层面       | 技术                                      |
| ---------- | ----------------------------------------- |
| 框架       | Electron 39                               |
| 前端       | React 19 + TypeScript 6                   |
| 构建       | Vite 8                                    |
| 样式       | Tailwind CSS 4                            |
| 状态管理   | Zustand                                   |
| 代码编辑器 | Monaco Editor                             |
| AI SDK     | @anthropic-ai/sdk (直接调用 Messages API) |
| 图表       | Recharts                                  |
| 打包       | electron-builder                          |

## 项目结构

```
src/
├── main/               # Electron 主进程
│   ├── main.ts         # 窗口管理、IPC 注册
│   ├── claude-agent.ts # AI Agent 管理（API 调用 + 本地工具执行）
│   └── types.d.ts      # 主进程类型
├── preload/            # 预加载脚本（contextBridge 安全暴露 API）
│   ├── preload.ts
│   └── types.d.ts
├── renderer/           # 渲染进程（React）
│   └── src/
│       ├── main.tsx            # 入口
│       ├── App.tsx             # 根组件（三栏布局 + 主题）
│       ├── components/         # UI 组件
│       │   ├── ChatArea.tsx    # 对话区域
│       │   ├── Sidebar.tsx     # 左侧边栏（会话/文件树）
│       │   ├── RightPanel.tsx  # 右侧面板（预览/轨迹）
│       │   ├── TitleBar.tsx    # 自定义标题栏
│       │   ├── SessionTabs.tsx # 会话标签页
│       │   ├── CodeViewer.tsx  # 代码查看器
│       │   ├── ResizeHandle.tsx# 拖拽调整手柄
│       │   └── ui/             # 基础 UI 组件
│       ├── pages/
│       │   └── ModelSettings.tsx # 模型配置页
│       ├── stores/             # Zustand 状态管理
│       │   ├── appStore.ts      # 应用全局状态
│       │   ├── sessionStore.ts  # 会话状态
│       │   ├── modelStore.ts    # 模型配置状态
│       │   └── gatewayStore.ts  # 网关配置状态
│       └── utils/              # 工具函数
└── shared/             # 共享类型定义
    └── types.ts
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
git clone <repo-url>
cd Meta-CC-Hub
npm install
```

### 开发

```bash
npm run dev
```

这将同时启动 Vite 开发服务器（渲染进程）和 Electron 主进程。

### 构建

```bash
# 编译所有模块
npm run build

# 打包为桌面应用
npm run dist
```

构建产物在 `release/` 目录。

### 直接运行（生产模式）

```bash
npm run build
npm start
```

## 模型配置

支持四种模型来源：

| 类型          | 说明               | 示例                               |
| ------------- | ------------------ | ---------------------------------- |
| `official`    | 官方 Anthropic API | `https://api.anthropic.com`        |
| `third-party` | 第三方 API         | OpenAI、Gemini 等兼容接口          |
| `local`       | 本地模型           | Ollama（`http://localhost:11434`） |
| `custom`      | 自定义端点         | 任意兼容 OpenAI 格式的 API         |

在应用设置中配置 API Key 和端点后，即可在对话中使用。

## License

MIT
