/**
 * 技能管理器
 * 统一管理内置技能和本地导入的技能
 * 存放目录：~/.metacode/skills/<技能名>/SKILL.md
 * 格式：YAML frontmatter + Markdown 正文（与 Cursor 兼容）
 */

import { readFile, readdir, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SkillDefinition, SkillStep } from "../types";
import type { MCPClient } from "../mcp/client";

/** 从 YAML 风格 frontmatter 解析元数据 */
function parseFrontMatter(content: string): { meta: Record<string, unknown>; body: string } {
  const meta: Record<string, unknown> = {};
  let body = content;
  if (content.startsWith("---")) {
    const end = content.indexOf("---", 3);
    if (end !== -1) {
      const raw = content.slice(3, end).trim();
      body = content.slice(end + 3).trim();
      for (const line of raw.split("\n")) {
        const idx = line.indexOf(":");
        if (idx !== -1) {
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
          meta[key] = value;
        }
      }
    }
  }
  return { meta, body };
}

/** 将 SKILL.md 内容转换为 SkillDefinition */
function parseSkillMarkdown(filePath: string, content: string): SkillDefinition | null {
  const { meta, body } = parseFrontMatter(content);
  const folderName = basename(filePath.replace(/[/\\]SKILL\.md$/i, ""));
  const name = (meta.name as string) || folderName;
  if (!name) return null;

  return {
    id: `skill-${name.replace(/\s+/g, "-").toLowerCase()}`,
    name,
    description: (meta.description as string) || body.slice(0, 100).replace(/\n/g, " "),
    version: (meta.version as string) || "1.0.0",
    source: (meta.source as SkillDefinition["source"]) || "custom",
    executeMode: (meta.executeMode as SkillDefinition["executeMode"]) || "serial",
    steps: meta.steps
      ? JSON.parse(meta.steps as string) as SkillStep[]
      : [{
          id: "step-1",
          toolName: meta.tool as string || "prompt",
          description: "执行技能任务",
          params: { prompt: body },
        }],
  };
}

/** 将 SkillDefinition 序列化为 SKILL.md 内容 */
function serializeSkillMarkdown(skill: SkillDefinition): string {
  // 提取正文：优先取首个 step 的 prompt 参数
  let body = "";
  const firstStep = skill.steps[0];
  if (firstStep?.params?.prompt && typeof firstStep.params.prompt === "string") {
    body = firstStep.params.prompt as string;
  }

  const lines = [
    "---",
    `name: "${skill.name}"`,
    `description: "${skill.description}"`,
    `version: "${skill.version}"`,
    `source: "${skill.source}"`,
    `executeMode: "${skill.executeMode}"`,
  ];

  // steps 不含正文（正文已提取到 Markdown body）
  const stepsWithoutBody = skill.steps.map((s) => {
    if (s.params?.prompt && typeof s.params.prompt === "string" && s.params.prompt === body) {
      const { prompt, ...rest } = s.params as Record<string, unknown>;
      return { ...s, params: rest };
    }
    return s;
  });

  if (stepsWithoutBody.length > 0 && stepsWithoutBody.some((s) => Object.keys(s.params).length > 0 || s.toolName !== "prompt")) {
    lines.push(`steps: ${JSON.stringify(stepsWithoutBody)}`);
  }

  lines.push("---");
  lines.push("");
  if (body) lines.push(body);

  return lines.join("\n");
}

/** 获取 MetaCode 自有技能目录 */
function getMetaCodeSkillsDir(): string {
  return join(homedir(), ".metacode", "skills");
}

/** 内置技能 */
const BUILT_IN_SKILLS: SkillDefinition[] = [
  {
    id: "skill-summarize",
    name: "智能总结",
    description: "总结当前文件或选中内容",
    version: "1.0.0",
    source: "built-in",
    executeMode: "serial",
    steps: [
      {
        id: "step-1",
        toolName: "read",
        description: "读取内容并总结",
        params: {},
      },
    ],
  },
];

export class SkillManager {
  private skills: Map<string, SkillDefinition> = new Map();
  private scannedDirs: Set<string> = new Set();
  private mcpClient: MCPClient;

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;

    for (const skill of BUILT_IN_SKILLS) {
      this.skills.set(skill.id, skill);
    }

    this.scanLocalDirectories().catch(() => {});
  }

  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  get count(): number {
    return this.skills.size;
  }

  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  register(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill);
  }

  remove(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  // ============ 本地扫描 ============

  async scanLocalDirectories(): Promise<void> {
    const skillsDir = getMetaCodeSkillsDir();
    if (!existsSync(skillsDir)) return;
    if (this.scannedDirs.has(skillsDir)) return;
    this.scannedDirs.add(skillsDir);

    // 一次性迁移：将旧版平铺 JSON 文件转为新版文件夹+SKILL.md 格式
    await this.migrateLegacyJSONFiles(skillsDir);

    await this.scanDirectory(skillsDir);
  }

  /** 刷新：清除扫描缓存并重新扫描，移除磁盘上已删除的技能 */
  async refresh(): Promise<void> {
    this.scannedDirs.clear();
    // 保留内置技能
    const builtinIds = new Set(BUILT_IN_SKILLS.map((s) => s.id));
    for (const id of this.skills.keys()) {
      if (!builtinIds.has(id)) this.skills.delete(id);
    }
    for (const skill of BUILT_IN_SKILLS) {
      this.skills.set(skill.id, skill);
    }
    await this.scanLocalDirectories();
  }

  /** 将旧版 ~/.metacode/skills/*.json 迁移到新版文件夹+SKILL.md 格式 */
  private async migrateLegacyJSONFiles(skillsDir: string): Promise<void> {
    try {
      const entries = await readdir(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const jsonPath = join(skillsDir, entry.name);
        try {
          const content = await readFile(jsonPath, "utf-8");
          const skill = this.importFromJSON(content);
          if (skill) {
            await this.persistSkill(skill);
            console.log(`[SkillManager] 已迁移旧版技能: ${entry.name} → ${skill.id}/`);
          }
          // 迁移完成后删除旧 JSON 文件
          await unlink(jsonPath).catch(() => {});
        } catch {
          // 跳过无效文件
        }
      }
    } catch {
      // 目录不可读时跳过
    }
  }

  /** 扫描 ~/.metacode/skills/ 下的子文件夹，每个子文件夹内找 SKILL.md */
  private async scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMd = join(dirPath, entry.name, "SKILL.md");
        if (existsSync(skillMd)) {
          try {
            const content = await readFile(skillMd, "utf-8");
            const skill = parseSkillMarkdown(skillMd, content);
            if (skill && !this.skills.has(skill.id)) {
              this.skills.set(skill.id, skill);
            }
          } catch {
            // 跳过无效文件
          }
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
  }

  // ============ 导入 ============

  /** 从 JSON 字符串导入技能 */
  importFromJSON(json: string): SkillDefinition | null {
    try {
      const data = JSON.parse(json) as SkillDefinition;
      if (!data.id || !data.name || !data.steps) return null;
      const skill: SkillDefinition = {
        id: data.id,
        name: data.name,
        description: data.description || "",
        version: data.version || "1.0.0",
        source: "custom",
        executeMode: data.executeMode || "serial",
        steps: data.steps.map((s: SkillStep, i: number) => ({
          id: s.id || `step-${i + 1}`,
          toolName: s.toolName,
          description: s.description || "",
          params: s.params || {},
          outputMap: s.outputMap,
        })),
      };
      this.skills.set(skill.id, skill);
      return skill;
    } catch {
      return null;
    }
  }

  /** 从单个 SKILL.md 文件导入 */
  async importFromFile(filePath: string): Promise<SkillDefinition | null> {
    try {
      const content = await readFile(filePath, "utf-8");
      if (!content.includes("---")) return this.importFromJSON(content);

      const skill = parseSkillMarkdown(filePath, content);
      if (skill) {
        this.skills.set(skill.id, skill);
        return skill;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** 从目录导入所有技能（扫描 子文件夹/SKILL.md 和 根目录/*.md） */
  async importFromDirectory(dirPath: string): Promise<SkillDefinition[]> {
    const imported: SkillDefinition[] = [];

    const tryImportMd = async (mdPath: string): Promise<void> => {
      try {
        const content = await readFile(mdPath, "utf-8");
        if (!content.includes("---")) return;
        const skill = parseSkillMarkdown(mdPath, content);
        if (skill) {
          this.skills.set(skill.id, skill);
          imported.push(skill);
          await this.persistSkill(skill);
        }
      } catch {
        // 跳过无效文件
      }
    };

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          // 子目录模式：<dir>/SKILL.md
          const skillMdPath = join(dirPath, entry.name, "SKILL.md");
          if (existsSync(skillMdPath)) await tryImportMd(skillMdPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          // 根目录直接放置 .md 文件
          await tryImportMd(join(dirPath, entry.name));
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
    return imported;
  }

  // ============ 持久化 ============

  /** 持久化技能到 ~/.metacode/skills/<技能名>/SKILL.md */
  private async persistSkill(skill: SkillDefinition): Promise<void> {
    try {
      const skillsDir = getMetaCodeSkillsDir();
      const skillName = skill.name.replace(/\s+/g, "-").toLowerCase();
      const skillDir = join(skillsDir, skillName);
      if (!existsSync(skillDir)) await mkdir(skillDir, { recursive: true });

      const filePath = join(skillDir, "SKILL.md");
      const mdContent = serializeSkillMarkdown(skill);
      await writeFile(filePath, mdContent, "utf-8");
    } catch (e) {
      console.error(`[SkillManager] 持久化技能 "${skill.name}" 失败:`, e);
    }
  }

  /** 导出技能为 JSON */
  exportToJSON(skillId: string): string | null {
    const skill = this.skills.get(skillId);
    if (!skill) return null;
    return JSON.stringify(skill, null, 2);
  }

  // ============ 执行 ============

  async execute(skillId: string, params?: Record<string, unknown>): Promise<unknown> {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`技能 "${skillId}" 不存在`);
    if (skill.executeMode === "parallel") {
      return this.executeParallel(skill, params);
    }
    return this.executeSerial(skill, params);
  }

  private async executeSerial(skill: SkillDefinition, params?: Record<string, unknown>): Promise<unknown[]> {
    const results: unknown[] = [];
    const context = { ...params };
    for (const step of skill.steps) {
      const resolvedParams = this.resolveParams(step.params, context);
      const result = await this.callToolWithFallback(step, resolvedParams);
      results.push(result);
      if (step.outputMap && typeof result === "object" && result !== null) {
        for (const [fromKey, toKey] of Object.entries(step.outputMap)) {
          context[toKey] = (result as Record<string, unknown>)[fromKey];
        }
      }
    }
    return results;
  }

  private async executeParallel(skill: SkillDefinition, params?: Record<string, unknown>): Promise<unknown[]> {
    const context = { ...params };
    return Promise.all(
      skill.steps.map(async (step) => {
        const resolvedParams = this.resolveParams(step.params, context);
        return this.callToolWithFallback(step, resolvedParams);
      }),
    );
  }

  private resolveParams(params: Record<string, unknown>, context: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.startsWith("{{") && value.endsWith("}}")) {
        const varName = value.slice(2, -2);
        resolved[key] = context[varName] ?? value;
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  private async callToolWithFallback(step: SkillStep, params: Record<string, unknown>): Promise<unknown> {
    const tools = this.mcpClient.getAllTools();
    const tool = tools.find((t) => t.name === step.toolName);
    if (!tool) {
      throw new Error(`工具 "${step.toolName}" 在已连接的 MCP 服务器中不存在`);
    }
    return this.mcpClient.callTool(tool.serverName, step.toolName, params);
  }
}
