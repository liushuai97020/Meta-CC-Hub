# Changelog

## [1.1.0] - 2026-05-17

### Added
- **Agent V2 增强系统** — 全新模块化 Agent 架构，支持 MCP 协议、技能/插件/工具热插拔
- **MCP 服务器管理** — 支持 stdio/SSE/Streamable HTTP 三种传输协议，可视化增删改重启
- **工具中心** — 统一管理 MCP 工具 + 内置工具 + 本地导入工具，支持搜索、启用/禁用
- **调用日志系统** — SQLite 持久化存储，支持按来源级联删除、状态筛选、服务器筛选、日期范围查询
- **自定义日历组件** — 暗色/亮色主题自适应日期范围选择器，完整适配项目设计系统
- **技能管理中心** — 本地技能导入、查看、刷新，支持 Claude Code 兼容的 SKILL.md 格式
- **插件市场** — 本地插件管理，支持启用/禁用，关联技能与工具
- **RAG 向量记忆系统** — 本地嵌入向量记忆，长期会话上下文持久化，省 Token
- **对话命令菜单** — 输入 `/` 触发命令面板，支持技能/工具/插件标签系统
- **安装向导** — 全新安装引导界面

### Changed
- 重构工具中心日志模块 UI，日志条目可展开查看完整输入输出
- 下拉筛选器改为自定义组件，适配主题色
- 日期筛选从客户端过滤改为后端 SQLite 时间范围查询
- 会话管理新增消息内容更新能力

## [1.0.4] - 2026-05-15

### Added
- 重新设计设置页面 UI，布局更清晰直观
- 新增 Token 消耗统计面板，实时追踪 API 用量
- 新增 ResizeHandle 组件支持面板自由拖拽调整

### Fixed
- 面板拖拽卡顿与样式异常
- 会话列表状态不同步问题
- Agent 流式输出中断与状态不同步
- 应用商店状态持久化异常
- 窗口关闭后重建时 preload 加载失败问题

## [1.0.3] - 2026-05-14

### Added
- 新增 12 个主流模型快捷预设（Anthropic Claude、OpenAI、Gemini、DeepSeek、Qwen、GLM、Moonshot、SiliconFlow、Yi、MiniMax、DeepSeek 本地、Ollama 本地）
- 网关配置编辑/保存/取消工作流
- 双 API 格式兼容（Anthropic Messages API / OpenAI 兼容格式）
- 自定义应用图标
- GitHub Actions Windows 自动构建与发布

### Changed
- API 格式切换时自动切换 baseUrl
- 编辑保存后自动同步 agent 配置
- 移除 Linux/macOS 构建目标，仅支持 Windows

### Fixed
- 网关配置编辑后 agent 仍使用旧配置的问题
- API 格式与 baseUrl 不联动的问题
- 编辑后诊断面板显示错误的 API 格式
- winCodeSign 下载失败问题（使用 npmmirror 镜像）

## [1.0.0] - 2026-05-14

### Added
- 双 API 格式兼容（Anthropic Messages API / OpenAI 兼容格式）
- 12 个主流模型快捷预设（Claude, OpenAI, Gemini, DeepSeek, Qwen, GLM, Moonshot, SiliconFlow, Yi, MiniMax, Ollama）
- 快捷预设一键填充配置
- 网关配置编辑/保存/取消工作流
- 编辑 API 格式时自动切换 baseUrl
- 编辑保存后自动同步 agent 配置
- 本地打包测试支持（npm run pack）

### Changed
- 重构网关配置持久化，编辑后即时同步激活的 ModelConfig
- 状态消息明确显示当前请求的 API 格式
- 移除 Linux 构建目标

### Fixed
- 网关配置编辑后 agent 仍使用旧配置的问题
- API 格式与 baseUrl 不联动的问题
- winCodeSign 在 Windows 上的权限问题（GitHub Actions 不受影响）

## [0.1.0] - 2026-05-12

### Added
- 基础 Electron + React 应用框架
- 多网关 AI 配置管理
- 5 种模型角色分配
- Agent 工具链（Read / Edit / Write / Bash）
- 流式对话输出
- 多会话管理
- 三栏布局
- Monaco Editor 集成
- Web 预览面板
- 元素标注功能
- 暗色/亮色主题
- 用量统计
- 代理配置
- Ollama 本地模型支持
