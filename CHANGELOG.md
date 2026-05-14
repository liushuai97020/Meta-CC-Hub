# Changelog

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
