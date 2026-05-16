/**
 * MCP 配置文件读写
 * 写入 ~/.metacode/mcp.json，兼容读取 ~/.claude/mcp.json / ~/.cursor/mcp.json
 */

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import type { MCPConfigFile, MCPServerConfig } from "../types";

/** 获取 MCP 配置读取路径（兼容 Claude Code / Cursor 配置） */
function getConfigPaths(): string[] {
  const home = homedir();
  return [
    join(home, ".metacode", "mcp.json"),
    join(home, ".claude", "mcp.json"),
    join(home, ".cursor", "mcp.json"),
  ];
}

/** 默认 MCP 配置 */
export function getDefaultConfig(): MCPConfigFile {
  return { mcpServers: {} };
}

/** 合并多个配置文件（后面的覆盖前面的同名服务器） */
function mergeConfigs(configs: MCPConfigFile[]): MCPConfigFile {
  const merged: MCPConfigFile = { mcpServers: {} };
  for (const config of configs) {
    if (config?.mcpServers && typeof config.mcpServers === "object") {
      Object.assign(merged.mcpServers, config.mcpServers);
    }
  }
  return merged;
}

/** 读取 MCP 配置文件（异步，合并所有来源） */
export async function readMCPConfig(): Promise<MCPConfigFile> {
  const configs: MCPConfigFile[] = [];
  const paths = getConfigPaths();
  for (const filePath of paths) {
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as MCPConfigFile;
      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        configs.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return mergeConfigs(configs);
}

/** 同步读取 MCP 配置文件（初始化时使用） */
export function readMCPConfigSync(): MCPConfigFile {
  const configs: MCPConfigFile[] = [];
  const paths = getConfigPaths();
  for (const filePath of paths) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content) as MCPConfigFile;
      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        configs.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return mergeConfigs(configs);
}

/** 获取写入配置的路径（仅写入 ~/.metacode/mcp.json） */
export function getWritableConfigPath(): string {
  const metacodePath = join(homedir(), ".metacode", "mcp.json");
  const dir = join(homedir(), ".metacode");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return metacodePath;
}

/** 写入 MCP 配置 */
export async function writeMCPConfig(config: MCPConfigFile): Promise<void> {
  const filePath = getWritableConfigPath();
  const dir = resolve(filePath, "..");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/** 添加或更新一个 MCP 服务器 */
export async function upsertMCPServer(
  name: string,
  config: MCPServerConfig
): Promise<MCPConfigFile> {
  const current = await readMCPConfig();
  current.mcpServers[name] = config;
  await writeMCPConfig(current);
  return current;
}

/** 删除一个 MCP 服务器 */
export async function removeMCPServer(name: string): Promise<MCPConfigFile> {
  const current = await readMCPConfig();
  delete current.mcpServers[name];
  await writeMCPConfig(current);
  return current;
}

/** 从本地文件夹导入 MCP 配置文件 */
export async function importMCPConfigFromFile(
  filePath: string
): Promise<{ name: string; config: MCPServerConfig }[]> {
  const content = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as MCPConfigFile | MCPServerConfig;

  // 支持直接导入单个服务器配置（stdio / sse / http）或完整配置文件
  if ("command" in parsed || "url" in parsed) {
    const name = basename(filePath, ".json");
    return [{ name, config: parsed as MCPServerConfig }];
  }

  if ("mcpServers" in parsed && typeof parsed.mcpServers === "object" && parsed.mcpServers !== null) {
    return Object.entries(parsed.mcpServers).map(([name, config]) => ({
      name,
      config,
    }));
  }

  throw new Error("无法识别的 MCP 配置文件格式");
}

/** 读取全局 MCP 配置原始 JSON 文本（仅 ~/.metacode/mcp.json） */
export async function readGlobalMCPConfigRaw(): Promise<string> {
  const filePath = join(homedir(), ".metacode", "mcp.json");
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return JSON.stringify(getDefaultConfig(), null, 2);
  }
}

/** 写入全局 MCP 配置原始 JSON 文本 */
export async function writeGlobalMCPConfigRaw(rawJson: string): Promise<void> {
  const filePath = getWritableConfigPath();
  const dir = join(homedir(), ".metacode");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, rawJson, "utf-8");
}
