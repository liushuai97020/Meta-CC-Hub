# MetaCode

跨平台桌面 AI 编程助手，基于 Electron + React + TypeScript + Vite 构建。

![MetaCode 设置页](/public/setting.png)

## 功能特性

- **多网关 AI 配置** — 支持多个 AI 提供商网关，每个网关可配置 5 种模型角色（默认、专家、小模型、分析、图片处理）
- **双 API 格式兼容** — Anthropic Messages API 与 OpenAI 兼容格式一键切换，切换时自动适配端点地址
- **快捷预设** — 内置 Anthropic Claude、OpenAI、Google Gemini、DeepSeek、通义千问、智谱 GLM、月之暗面 Moonshot、SiliconFlow、零一万物 Yi、MiniMax、Ollama 等主流模型一键填充
- **编辑/保存/取消工作流** — 已有配置支持编辑模式，所有改动本地暂存，确认后统一保存
- **Agent 工具链** — 集成本地 Read / Edit / Write / Bash 工具，支持多轮工具调用
- **Agent V2 增强系统** — MCP 协议服务器管理（stdio/SSE/HTTP），技能与插件热插拔，工具调用日志 SQLite 持久化
- **工具中心** — 一站式管理 MCP 工具 + 内置工具 + 本地导入工具，可视化日志查询与筛选
- **技能 & 插件** — 支持 Claude Code 兼容的 SKILL.md 格式，本地导入与热加载
- **RAG 向量记忆** — 本地嵌入向量记忆，跨会话上下文持久化，节省 Token
- **安装向导** — 全新用户引导流程
- **流式对话** — 实时流式输出，支持中途中断，显示 Token 用量
- **多会话管理** — 标签页式会话切换，按项目自动分组，支持归档
- **三栏布局** — 左侧文件树/会话列表 | 中间对话区 | 右侧预览/轨迹面板，均支持拖拽调整宽度
- **内置编辑器** — 集成 Monaco Editor，支持代码高亮与查看
- **内置预览** — 右侧面板内嵌 Web 预览，支持多标签、URL 历史
- **元素标注** — 页面元素选取与截图标注，自动关联源码位置与组件栈
- **暗色/亮色主题** — 一键切换，自动持久化
- **用量统计** — 可视化 Token 消耗与请求次数
- **代理配置** — HTTP / HTTPS / SOCKS5 代理支持
- **跨平台** — 支持 Windows（NSIS / 便携版）、macOS（DMG / ZIP）、Linux（AppImage / deb）

![MetaCode 代码预览标注](/public/code_preview.png)
![MetaCode 页面预览标注](/public/dev_preview.png)

## 技术栈

| 层面     | 技术                                 |
| -------- | ------------------------------------ |
| 框架     | Electron                             |
| 前端     | React + TypeScript + Vite            |
| 样式     | Tailwind CSS                         |
| 状态管理 | Zustand                              |
| AI 请求  | 原生 fetch（Anthropic / OpenAI 双格式） |
| 代码编辑器 | Monaco Editor                      |
| 图表     | Recharts                             |
| 打包     | electron-builder                     |

## 项目结构

```
src/
├── agent/                   # Agent V2 系统核心
│   ├── index.ts             # 系统初始化与模块聚合
│   ├── engine.ts            # Agent 执行引擎
│   ├── types.ts             # 类型定义（ToolCallLog, AgentConfig 等）
│   ├── mcp/                 # MCP 协议客户端
│   │   ├── client.ts        # 连接管理 + 工具调用 + 日志记录
│   │   ├── config.ts        # 全局 MCP 配置（JSON 读写）
│   │   └── server-manager.ts # 服务器进程管理（stdio/HTTP/SSE）
│   ├── tools/               # 工具管理
│   │   └── manager.ts       # 内置工具 + 本地导入/启用/禁用
│   ├── skills/              # 技能管理
│   │   └── manager.ts       # SKILL.md 解析 + 本地导入/执行
│   ├── plugins/             # 插件管理
│   │   └── manager.ts       # 插件安装/启用/禁用 + 工具/技能绑定
│   ├── memory/              # RAG 向量记忆
│   │   ├── memory-manager.ts # 记忆系统核心（会话/消息/向量化）
│   │   ├── rag-engine.ts    # 检索增强生成引擎
│   │   ├── embedding/       # 嵌入向量提供者
│   │   └── vector-db/       # 向量数据库
│   └── logger/              # 调用日志持久化
│       ├── database.ts      # SQLite（建表/查询/级联删除/时间范围）
│       └── log-manager.ts   # 日志管理器
├── main/                    # Electron 主进程
│   ├── main.ts              # 窗口管理、IPC 通信、配置持久化
│   ├── claude-agent.ts      # AI Agent 核心（双 API 格式 + 工具执行）
│   ├── agent-ipc.ts         # Agent V2 IPC 处理器
│   └── types.d.ts
├── renderer/                # 渲染进程（React）
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── ChatArea.tsx      # 对话区域（流式消息 + 标签）
│       │   ├── Sidebar.tsx       # 左侧边栏
│       │   ├── RightPanel.tsx    # 右侧面板（预览/标注）
│       │   ├── TitleBar.tsx      # 自定义标题栏
│       │   ├── ResizeHandle.tsx  # 拖拽调整手柄
│       │   ├── chat/
│       │   │   ├── CommandMenu.tsx  # `/` 命令面板
│       │   │   └── TagChip.tsx      # 标签组件
│       │   └── ui/
│       │       └── Dialog.tsx
│       ├── pages/
│       │   ├── ModelSettings.tsx       # 网关配置页
│       │   └── agent/
│       │       ├── AgentToolCenter.tsx     # 工具中心
│       │       ├── AgentSkillCenter.tsx    # 技能管理
│       │       ├── AgentPluginMarket.tsx   # 插件市场
│       │       ├── AgentSettingsPage.tsx   # Agent 设置
│       │       └── MemorySettingsPanel.tsx # 记忆系统设置
│       ├── stores/
│       │   ├── appStore.ts       # 应用全局状态
│       │   ├── sessionStore.ts   # 会话状态
│       │   └── agentStore.ts     # Agent V2 系统状态
│       └── types/
│           └── global.d.ts
├── preload/                 # 预加载脚本
│   └── preload.ts
└── shared/                  # 共享类型
    └── types.ts
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装与开发

```bash
git clone <repo-url>
cd Meta-CC-Hub
npm install

# 开发模式启动（Vite + Electron 热更新）
npm run dev
```

### 构建与打包

```bash
# 1. 编译所有模块
npm run build

# 2. 打包为安装程序
npm run dist
```

构建产物在 `release/` 目录：
- **Windows**: `MetaCode Setup x.x.x.exe` (NSIS) + `MetaCode x.x.x.exe` (便携版)
- **macOS**: `MetaCode x.x.x.dmg` + `MetaCode x.x.x.zip`
- **Linux**: `MetaCode x.x.x.AppImage` + `MetaCode x.x.x.deb`

如需快速测试打包后的应用（不生成安装包）：
```bash
npm run pack
```
产物在 `release/` 下未打包的目录中，可直接运行。

### 生产模式运行

```bash
npm run build
npm start
```

## 模型配置

### 网关配置

通过应用设置页的"网关配置"管理 AI 提供商：

1. 点击 **"新增配置"** 或使用 **快捷预设** 一键填充主流模型参数
2. 选择 **API 格式**：Anthropic Messages API 或 OpenAI 兼容格式
3. 填写 API Key，点击 **"测试"** 验证连接
4. 点击 **"拉取"** 获取可用模型列表
5. 为 5 个模型槽位分配具体模型
6. 保存并启用配置

### 内置快捷预设

| 预设             | 类型        | 默认格式       |
| ---------------- | ----------- | -------------- |
| Anthropic Claude | official    | Anthropic      |
| OpenAI           | third-party | OpenAI         |
| Google Gemini    | third-party | OpenAI         |
| DeepSeek         | third-party | OpenAI         |
| 通义千问 Qwen    | third-party | OpenAI         |
| 智谱 GLM         | third-party | OpenAI         |
| 月之暗面 Moonshot| third-party | OpenAI         |
| SiliconFlow      | third-party | OpenAI         |
| 零一万物 Yi      | third-party | OpenAI         |
| MiniMax          | third-party | OpenAI         |
| DeepSeek 本地    | local       | Ollama         |
| Ollama 本地      | local       | Ollama         |

### API 格式说明

**Anthropic Messages API**
- 端点：`POST {baseUrl}/v1/messages`
- 认证头：`x-api-key`
- 协议版本：`anthropic-version: 2023-06-01`
- 支持：工具调用多轮迭代、Thinking、流式 SSE
- 适用：Anthropic Claude 官方、DeepSeek Anthropic 兼容端点

**OpenAI 兼容格式**
- 端点：`POST {baseUrl}/v1/chat/completions`
- 认证头：`Authorization: Bearer`
- 支持：流式 SSE、用量统计
- 适用：OpenAI、Google Gemini、通义千问、智谱 GLM、Moonshot 等

> 两种格式均使用原生 `fetch` 直接调用，不依赖第三方 SDK，确保打包后兼容性。

## License

MIT
