/**
 * 工具管理器
 * 统一管理内置工具和本地导入的工具
 * 存放目录：~/.metacode/tools/（参考 Claude Code ~/.claude/ 架构）
 * 兼容扫描：~/.claude/tools/（只读，不写入）
 * 本地导入：从任意文件夹导入，复制到 ~/.metacode/tools/
 */

import { readFile, readdir, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";

import type { ToolDefinition } from "../types";
import type { LogManager } from "../logger";

function getMetaCodeToolsDir(): string {
  return join(homedir(), ".metacode", "tools");
}

/** 获取工具扫描目录 */
function getToolDirectories(): string[] {
  const dirs: string[] = [];
  const metaDir = getMetaCodeToolsDir();
  if (existsSync(metaDir)) dirs.push(metaDir);
  return dirs;
}

/** 内置工具 */
const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    name: "Read",
    description: "读取指定文件的内容",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "要读取的文件绝对路径" },
      },
      required: ["filePath"],
    },
    source: "built-in",
  },
  {
    name: "Edit",
    description: "编辑文件内容（搜索替换方式），oldString 必须在文件中唯一匹配",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "文件绝对路径" },
        oldString: { type: "string", description: "要被替换的原文" },
        newString: { type: "string", description: "替换后的新内容" },
      },
      required: ["filePath", "oldString", "newString"],
    },
    source: "built-in",
  },
  {
    name: "Write",
    description: "将内容写入文件（创建新文件或覆盖已有文件）",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "文件绝对路径" },
        content: { type: "string", description: "写入的文件内容" },
      },
      required: ["filePath", "content"],
    },
    source: "built-in",
  },
  {
    name: "Bash",
    description: "在 shell 中执行命令",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的 shell 命令" },
        cwd: { type: "string", description: "工作目录（可选）" },
      },
      required: ["command"],
    },
    source: "built-in",
  },
  {
    name: "getCurrentTime",
    description: "获取当前日期和时间，当用户询问时间、日期时使用此工具",
    inputSchema: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "时区（可选），例如 Asia/Shanghai" },
      },
    },
    source: "built-in",
  },
];

export class ToolManager {
  private tools: Map<string, ToolDefinition> = new Map();
  private scannedDirs: Set<string> = new Set();
  private logManager: LogManager | null = null;

  constructor() {
    for (const tool of BUILT_IN_TOOLS) {
      this.tools.set(tool.name, tool);
    }
    this.scanLocalDirectories().catch(() => {});
  }

  /** 设置日志管理器（由 AgentSystem 注入） */
  setLogManager(lm: LogManager): void {
    this.logManager = lm;
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getBuiltIn(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => t.source === "built-in");
  }

  getLocal(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => t.source === "local");
  }

  get count(): number {
    return this.tools.size;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  remove(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    const result = this.tools.delete(name);
    // 级联删除关联日志
    if (result && this.logManager) {
      this.logManager.deleteLogsBySource(tool.source === "built-in" ? "built-in" : "local-tool", name);
    }
    return result;
  }

  setEnabled(name: string, enabled: boolean): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    tool.enabled = enabled;
    return true;
  }

  isEnabled(name: string): boolean {
    const tool = this.tools.get(name);
    return tool?.enabled !== false;
  }

  // ============ 本地扫描 ============

  /** 扫描本地目录加载工具 */
  async scanLocalDirectories(): Promise<void> {
    const dirs = getToolDirectories();
    for (const dir of dirs) {
      if (this.scannedDirs.has(dir)) continue;
      this.scannedDirs.add(dir);
      await this.scanDirectory(dir);
    }
  }

  private async scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = extname(entry.name).toLowerCase();
        if (ext !== ".json") continue;
        const fullPath = join(dirPath, entry.name);
        try {
          const content = await readFile(fullPath, "utf-8");
          const data = JSON.parse(content);
          const toolList: any[] = Array.isArray(data) ? data : (data.tools ? data.tools : [data]);
          for (const item of toolList) {
            if (item.name && !this.tools.has(item.name)) {
              this.tools.set(item.name, {
                name: item.name,
                description: item.description || "",
                inputSchema: item.inputSchema || item.input_schema || {},
                source: "local",
                filePath: fullPath,
              });
            }
          }
        } catch {
          // 跳过无法解析的文件
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
  }

  // ============ 本地导入 ============

  /** 从目录导入所有工具（复制到 ~/.metacode/tools/） */
  async importFromDirectory(dirPath: string): Promise<ToolDefinition[]> {
    const imported: ToolDefinition[] = [];
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        const ext = extname(entry.name).toLowerCase();
        if (ext !== ".json") continue;
        const fullPath = join(dirPath, entry.name);
        try {
          const content = await readFile(fullPath, "utf-8");
          const data = JSON.parse(content);
          const toolList: any[] = Array.isArray(data) ? data : (data.tools ? data.tools : [data]);
          for (const item of toolList) {
            if (!item.name || this.tools.has(item.name)) continue;
            const tool: ToolDefinition = {
              name: item.name,
              description: item.description || "",
              inputSchema: item.inputSchema || item.input_schema || {},
              source: "local",
            };
            this.tools.set(tool.name, tool);
            imported.push(tool);
            await this.persistTool(tool);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
    return imported;
  }

  /** 从 JSON 文件导入工具 */
  async importFromFile(filePath: string): Promise<ToolDefinition | null> {
    try {
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      if (!data.name) return null;
      const tool: ToolDefinition = {
        name: data.name,
        description: data.description || "",
        inputSchema: data.inputSchema || data.input_schema || {},
        source: "local",
      };
      this.tools.set(tool.name, tool);
      await this.persistTool(tool);
      return tool;
    } catch {
      return null;
    }
  }

  /** 持久化到 ~/.metacode/tools/ */
  async persistTool(tool: ToolDefinition): Promise<void> {
    try {
      const toolDir = getMetaCodeToolsDir();
      if (!existsSync(toolDir)) await mkdir(toolDir, { recursive: true });
      const filePath = join(toolDir, `${tool.name}.json`);
      if (!existsSync(filePath)) {
        await writeFile(filePath, JSON.stringify(tool, null, 2), "utf-8");
      }
    } catch {
      // 保存失败不影响使用
    }
  }
}
