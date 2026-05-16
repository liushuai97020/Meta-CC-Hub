/**
 * MetaCode 技能中心
 * 极简列表设计 — 专注内容层次，减少视觉装饰
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { useAgentStore } from "../../stores/agentStore";
import {
  Search, FileDown, Play, RefreshCw, Package,
  Sparkles, Terminal, Cpu, Globe, Code, Zap,
} from "lucide-react";

const SKILL_ICONS: Record<string, any> = {
  summarize: Sparkles,
  debug: Terminal,
  search: Globe,
  code: Code,
  lint: Code,
  format: Code,
  test: Cpu,
  deploy: Zap,
};
const DefaultIcon = Package;

function sourceBadge(source: string): { label: string; className: string } {
  switch (source) {
    case "built-in":
      return { label: "内置", className: "bg-indigo-500/10 text-indigo-400" };
    case "marketplace":
      return { label: "市场", className: "bg-teal-500/10 text-teal-400" };
    default:
      return { label: "自定义", className: "bg-amber-500/10 text-amber-400" };
  }
}

export default function AgentSkillCenter() {
  const { skills, refreshAll, systemStatus } = useAgentStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setNotifyMsg(msg);
    setTimeout(() => setNotifyMsg(null), 3000);
  }, []);

  useEffect(() => { refreshAll().catch(console.error); }, []);

  const stats = useMemo(() => ({
    total: skills.length,
    builtIn: skills.filter((s: any) => s.source === "built-in").length,
    custom: skills.filter((s: any) => s.source !== "built-in" && s.source !== "marketplace").length,
  }), [skills]);

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills;
    const q = searchQuery.toLowerCase();
    return skills.filter((s: any) =>
      s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
    );
  }, [skills, searchQuery]);

  const handleExecute = async (skillId: string) => {
    setExecutingId(skillId);
    try {
      await window.electronAPI.agentV2.executeSkill(skillId);
      notify(`已执行: ${skills.find((s: any) => s.id === skillId)?.name || skillId}`);
    } catch (err) { notify(`执行失败: ${String(err)}`); }
    setExecutingId(null);
  };

  const handleImport = async () => {
    try {
      const result = await window.electronAPI.fs.selectDirectory();
      if (!result.success || !result.data) return;
      const res = await window.electronAPI.agentV2.importSkill(result.data);
      if (res.success) {
        const count = res.count ?? 0;
        if (count > 0) {
          await refreshAll();
          notify(`成功导入 ${count} 个技能`);
        } else {
          notify("未找到有效技能文件（需为 子文件夹/SKILL.md 或 .md 含 frontmatter 格式）");
        }
      } else {
        notify(`导入失败: ${res.error}`);
      }
    } catch (err) { notify(`导入出错: ${String(err)}`); }
  };

  const getSkillIcon = (name: string) => {
    const key = Object.keys(SKILL_ICONS).find((k) => name.toLowerCase().includes(k));
    return key ? SKILL_ICONS[key] : DefaultIcon;
  };

  const loading = !systemStatus.ready;

  return (
    <div className="space-y-5">
      {/* Toast */}
      {notifyMsg && (
        <div className="flex items-center gap-2 px-3.5 py-2 text-xs rounded-lg border border-border/40 bg-card/70">
          <span className="text-foreground/80">{notifyMsg}</span>
        </div>
      )}

      {/* ===== 头部 ===== */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <h1 className="text-base font-semibold tracking-tight text-foreground">技能中心</h1>
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground/60 border border-border/30">
              v1
            </span>
          </div>
          <p className="text-xs text-muted-foreground/50">管理和执行本地技能工作流</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground/40">
          <span>{stats.total} 项</span>
          <span className="text-muted-foreground/20">·</span>
          <span>{stats.builtIn} 内置</span>
          <span className="text-muted-foreground/20">·</span>
          <span>{stats.custom} 自定义</span>
        </div>
      </div>

      {/* ===== 操作栏 ===== */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
          <input
            type="text"
            placeholder="搜索技能..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border/30 bg-muted/5 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-border/60 focus:bg-muted/10 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-foreground text-xs leading-none"
            >
              ✕
            </button>
          )}
        </div>
        <button
          onClick={handleImport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border/30 text-muted-foreground/70 hover:text-foreground hover:bg-muted/20 transition-colors"
        >
          <FileDown size={13} /> 导入
        </button>
        <button
          onClick={() => refreshAll()}
          className="p-1.5 rounded-lg border border-border/30 text-muted-foreground/40 hover:text-foreground hover:bg-muted/20 transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ===== 加载状态 ===== */}
      {loading && skills.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-10 h-10 rounded-lg border border-border/30 flex items-center justify-center mb-3">
            <Package className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-sm text-muted-foreground/60">初始化中...</p>
        </div>
      )}

      {/* ===== 空状态 ===== */}
      {!loading && skills.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-12 h-12 rounded-xl border border-border/30 flex items-center justify-center mb-4">
            <Package className="h-6 w-6 text-muted-foreground/25" />
          </div>
          <h3 className="text-sm font-medium text-foreground/70 mb-1">暂无技能</h3>
          <p className="text-xs text-muted-foreground/50 mb-5 max-w-[200px]">
            点击导入按钮选择包含技能的文件夹
          </p>
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <FileDown size={13} /> 导入技能文件夹
          </button>
        </div>
      )}

      {/* ===== 搜索结果为空 ===== */}
      {!loading && skills.length > 0 && filteredSkills.length === 0 && searchQuery && (
        <div className="flex flex-col items-center py-12 text-center">
          <Search className="h-6 w-6 text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground/60">未找到匹配「{searchQuery}」的技能</p>
        </div>
      )}

      {/* ===== 技能列表 ===== */}
      {filteredSkills.length > 0 && (
        <div className="space-y-0.5">
          {filteredSkills.map((skill: any) => {
            const Icon = getSkillIcon(skill.name);
            const isExecuting = executingId === skill.id;
            const badge = sourceBadge(skill.source);

            return (
              <div
                key={skill.id}
                className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-transparent hover:border-border/20 hover:bg-muted/5 transition-all cursor-default"
              >
                {/* 图标 */}
                <div className="w-8 h-8 rounded-lg border border-border/20 bg-muted/5 flex items-center justify-center shrink-0 group-hover:bg-muted/10 transition-colors">
                  <Icon size={14} className="text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" />
                </div>

                {/* 名称 + 描述 */}
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors truncate">
                        {skill.name}
                      </h3>
                      {skill.version && (
                        <span className="text-[10px] text-muted-foreground/30 font-mono shrink-0">
                          v{skill.version}
                        </span>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5 leading-relaxed">
                        {skill.description}
                      </p>
                    )}
                  </div>

                  {/* 来源标签 */}
                  <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                {/* 执行按钮 */}
                <button
                  onClick={() => handleExecute(skill.id)}
                  disabled={isExecuting}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-md opacity-0 group-hover:opacity-100 transition-all text-emerald-400/60 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  {isExecuting ? (
                    <span className="w-3 h-3 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
                  ) : (
                    <><Play size={10} className="fill-current" /> 执行</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
