/**
 * 插件管理器
 * 统一管理内置插件和本地导入的插件
 * 存放目录：~/.metacode/plugins/（参考 Claude Code ~/.claude/ 架构）
 * 兼容扫描：~/.claude/plugins/（只读）
 * 本地导入：从任意文件夹导入，复制到 ~/.metacode/plugins/
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import type {
  PluginInstance,
  PluginMeta,
  PluginPermissions,
} from "../types";
import type { MCPClient } from "../mcp/client";
import type { SkillManager } from "../skills/manager";

const DEFAULT_PERMISSIONS: PluginPermissions = {
  fileRead: false,
  fileWrite: false,
  network: false,
  terminal: false,
  clipboard: false,
  modelAccess: false,
};

/** 内置插件 */
const BUILT_IN_PLUGINS: Array<{
  meta: PluginMeta;
  permissions: Partial<PluginPermissions>;
}> = [
  {
    meta: {
      id: "plugin-file-system",
      name: "文件系统",
      version: "1.0.0",
      description: "读写文件、目录操作",
      author: "MetaCode",
    },
    permissions: { fileRead: true, fileWrite: true },
  },
  {
    meta: {
      id: "plugin-terminal",
      name: "终端命令",
      version: "1.0.0",
      description: "执行终端命令",
      author: "MetaCode",
    },
    permissions: { terminal: true },
  },
  {
    meta: {
      id: "plugin-system-info",
      name: "系统信息",
      version: "1.0.0",
      description: "获取操作系统信息",
      author: "MetaCode",
    },
    permissions: { fileRead: true },
  },
];

/** 获取插件扫描目录 */
function getPluginDirectories(): string[] {
  const home = homedir();
  const dirs: string[] = [];
  // MetaCode 自有目录（读写）
  const metacodePlugins = join(home, ".metacode", "plugins");
  if (existsSync(metacodePlugins)) dirs.push(metacodePlugins);
  // 兼容扫描 Claude Code（只读）
  const claudePlugins = join(home, ".claude", "plugins");
  if (existsSync(claudePlugins)) dirs.push(claudePlugins);
  return dirs;
}

export class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map();
  private scannedDirs: Set<string> = new Set();
  private mcpClient: MCPClient;
  private skillManager: SkillManager;

  constructor(mcpClient: MCPClient, skillManager: SkillManager) {
    this.mcpClient = mcpClient;
    this.skillManager = skillManager;

    // 注册内置插件
    for (const { meta, permissions } of BUILT_IN_PLUGINS) {
      this.plugins.set(meta.id, {
        meta,
        source: "built-in",
        status: "enabled",
        permissions: { ...DEFAULT_PERMISSIONS, ...permissions },
        boundSkills: [],
        boundTools: [],
      });
    }

    // 扫描本地目录
    this.scanLocalDirectories().catch(() => {});
  }

  /** 获取所有插件 */
  getAll(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /** 获取数量 */
  get count(): number {
    return this.plugins.size;
  }

  /** 获取单个 */
  get(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /** 启用 */
  enable(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    if (!plugin.mcpServerName) {
      plugin.status = "enabled";
      return true;
    }
    this.mcpClient.restartServer(plugin.mcpServerName).then((ok) => {
      plugin.status = ok ? "enabled" : "error";
    }).catch(() => {
      plugin.status = "error";
    });
    return true;
  }

  /** 禁用 */
  disable(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.source === "built-in") return false;
    plugin.status = "disabled";
    return true;
  }

  /** 安装插件（本地导入） */
  async install(
    meta: PluginMeta,
    source: PluginInstance["source"],
    filePath?: string
  ): Promise<PluginInstance> {
    const perms = { ...DEFAULT_PERMISSIONS };
    let mcpServerName: string | undefined;

    // 从文件加载
    if (filePath && existsSync(filePath)) {
      try {
        const content = await readFile(filePath, "utf-8");
        const data = JSON.parse(content);
        if (data.mcpServer) {
          const serverName = `plugin-${meta.id}`;
          await this.mcpClient.addServer(serverName, data.mcpServer);
          mcpServerName = serverName;
        }
        if (data.permissions) {
          Object.assign(perms, data.permissions);
        }
      } catch {
        // 非标准格式
      }
    }

    const plugin: PluginInstance = {
      meta,
      source,
      status: "enabled",
      permissions: perms,
      mcpServerName,
      boundSkills: [],
      boundTools: [],
    };

    this.plugins.set(meta.id, plugin);

    // 持久化到 ~/.metacode/plugins/
    if (source === "local") {
      await this.persistPlugin(plugin);
    }

    return plugin;
  }

  /** 卸载插件 */
  async uninstall(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.source === "built-in") return false;
    if (plugin.mcpServerName) {
      await this.mcpClient.removeServer(plugin.mcpServerName);
    }
    this.plugins.delete(pluginId);
    return true;
  }

  /** 持久化保存插件到 ~/.metacode/plugins/ */
  private async persistPlugin(plugin: PluginInstance): Promise<void> {
    try {
      const pluginDir = join(homedir(), ".metacode", "plugins");
      if (!existsSync(pluginDir)) await mkdir(pluginDir, { recursive: true });
      const filePath = join(pluginDir, `${plugin.meta.id}.json`);
      if (!existsSync(filePath)) {
        const data = {
          meta: plugin.meta,
          permissions: plugin.permissions,
          boundSkills: plugin.boundSkills,
          boundTools: plugin.boundTools,
        };
        await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
      }
    } catch {
      // 保存失败不影响使用
    }
  }

  /** 扫描本地插件目录 */
  async scanLocalDirectories(): Promise<void> {
    const dirs = getPluginDirectories();
    for (const dir of dirs) {
      if (this.scannedDirs.has(dir)) continue;
      this.scannedDirs.add(dir);
      await this.scanDirectory(dir);
    }
  }

  /** 从指定目录导入所有插件 */
  async importFromDirectory(dirPath: string): Promise<PluginInstance[]> {
    const imported: PluginInstance[] = [];
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = extname(entry.name).toLowerCase();
        if (ext !== ".json" && ext !== ".mcplugin") continue;

        const fullPath = join(dirPath, entry.name);
        try {
          const content = await readFile(fullPath, "utf-8");
          const data = JSON.parse(content);
          const meta: PluginMeta = data.meta || {
            id: data.id || entry.name.replace(ext, ""),
            name: data.name || entry.name.replace(ext, ""),
            version: data.version || "1.0.0",
            description: data.description || "",
          };

          if (!meta.id || this.plugins.has(meta.id)) continue;

          const plugin = await this.install(meta, "local", fullPath);
          imported.push(plugin);
        } catch {
          continue;
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
    if (this.scannedDirs.has(dirPath)) {
      await this.scanLocalDirectories();
    }
    return imported;
  }

  /** 扫描单个目录 */
  private async scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = extname(entry.name).toLowerCase();
        if (ext !== ".json" && ext !== ".mcplugin") continue;

        const fullPath = join(dirPath, entry.name);
        try {
          const content = await readFile(fullPath, "utf-8");
          const data = JSON.parse(content);

          if (data.plugins && Array.isArray(data.plugins)) {
            for (const p of data.plugins) {
              if (p.id) this.registerScannedPlugin(p, "local");
            }
          } else if (data.id || data.meta?.id) {
            this.registerScannedPlugin(data, "local");
          }
        } catch {
          // 跳过无法解析的文件
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
  }

  /** 注册扫描到的插件 */
  private registerScannedPlugin(
    data: any,
    source: PluginInstance["source"]
  ): void {
    const meta: PluginMeta = data.meta || {
      id: data.id,
      name: data.name || data.id,
      version: data.version || "1.0.0",
      description: data.description || "",
    };

    if (!meta.id || this.plugins.has(meta.id)) return;

    const perms: PluginPermissions = {
      ...DEFAULT_PERMISSIONS,
      ...(data.permissions || {}),
    };

    this.plugins.set(meta.id, {
      meta,
      source,
      status: "enabled",
      permissions: perms,
      mcpServerName: data.mcpServerName,
      boundSkills: data.boundSkills || [],
      boundTools: data.boundTools || [],
    });
  }

  /** 绑定工具 */
  bindTool(pluginId: string, toolName: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    if (!plugin.boundTools.includes(toolName)) {
      plugin.boundTools.push(toolName);
    }
    return true;
  }

  /** 解绑工具 */
  unbindTool(pluginId: string, toolName: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    plugin.boundTools = plugin.boundTools.filter((t) => t !== toolName);
    return true;
  }

  /** 绑定技能 */
  bindSkill(pluginId: string, skillId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    if (!plugin.boundSkills.includes(skillId)) {
      plugin.boundSkills.push(skillId);
    }
    return true;
  }

  /** 解绑技能 */
  unbindSkill(pluginId: string, skillId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    plugin.boundSkills = plugin.boundSkills.filter((s) => s !== skillId);
    return true;
  }
}
