/**
 * MetaCode 插件管理页面
 * 内置插件、导入本地插件，去除了远程市场功能
 */

import { useEffect, useState } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { Puzzle, RefreshCw, ToggleLeft, ToggleRight, Shield, FileDown } from "lucide-react";

const PERM_LABELS: Record<string, { label: string; color: string }> = {
  fileRead: { label: "读文件", color: "text-blue-400 bg-blue-500/10" },
  fileWrite: { label: "写文件", color: "text-orange-400 bg-orange-500/10" },
  network: { label: "联网", color: "text-green-400 bg-green-500/10" },
  terminal: { label: "终端", color: "text-red-400 bg-red-500/10" },
  clipboard: { label: "剪贴板", color: "text-purple-400 bg-purple-500/10" },
  modelAccess: { label: "模型", color: "text-cyan-400 bg-cyan-500/10" },
};

const SOURCE_LABELS: Record<string, string> = {
  "built-in": "内置", "local": "本地",
};

export default function AgentPluginMarket() {
  const { plugins, refreshAll, systemStatus } = useAgentStore();
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    refreshAll().catch(console.error);
  }, []);

  const handleToggle = async (pluginId: string, currentStatus: string) => {
    if (currentStatus === "enabled") {
      await window.electronAPI.agentV2.disablePlugin(pluginId);
    } else {
      await window.electronAPI.agentV2.enablePlugin(pluginId);
    }
    refreshAll();
  };

  const handleImportPlugin = async () => {
    try {
      const result = await window.electronAPI.fs.selectDirectory();
      if (!result.success || !result.data) return;
      const res = await window.electronAPI.agentV2.importPlugin(result.data);
      if (res.success) {
        const count = res.count || 1;
        setImportResult(`成功导入 ${count} 个插件`);
        refreshAll();
      } else {
        setImportResult(`导入失败: ${res.error}`);
      }
    } catch (err) {
      setImportResult(`导入出错: ${String(err)}`);
    }
    setTimeout(() => setImportResult(null), 3000);
  };

  return (
    <div className="space-y-4">
      {/* 空状态 */}
      {!systemStatus.ready && plugins.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Puzzle className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground/60">Agent 系统正在初始化...</p>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "全部", count: plugins.length, color: "text-primary" },
          { label: "已启用", count: plugins.filter((p: any) => p.status === "enabled").length, color: "text-emerald-400" },
          { label: "内置", count: plugins.filter((p: any) => p.source === "built-in").length, color: "text-purple-400" },
        ].map((stat) => (
          <div key={stat.label} className="p-3 rounded-lg border bg-card border-border/40 text-center">
            <div className={`text-lg font-semibold ${stat.color}`}>{stat.count}</div>
            <div className="text-xs text-muted-foreground/50 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 操作栏 */}
      <div className="flex items-center gap-2">
        <button onClick={handleImportPlugin} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border/30 hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors">
          <FileDown size={14} /> 导入插件文件夹
        </button>
        <button onClick={() => refreshAll()} className="p-1.5 rounded-lg hover:bg-accent/40 text-muted-foreground transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* 导入结果提示 */}
      {importResult && (
        <div className="px-3 py-2 text-xs rounded-lg bg-muted border border-border/40">{importResult}</div>
      )}

      {/* 插件列表 */}
      <div className="space-y-2">
        {plugins.map((plugin: any) => {
          const isEnabled = plugin.status === "enabled";
          return (
            <div key={plugin.meta.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card border-border/40 hover:border-border/60 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Puzzle size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-foreground">{plugin.meta.name}</h3>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground/60">v{plugin.meta.version}</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground/60">{SOURCE_LABELS[plugin.source] || plugin.source}</span>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{plugin.meta.description}</p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {Object.entries(plugin.permissions).filter(([, v]) => v).map(([key]) => {
                    const p = PERM_LABELS[key];
                    return p ? <span key={key} className={`px-1.5 py-0.5 text-[10px] rounded ${p.color}`}>{p.label}</span> : null;
                  })}
                  <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1 ml-1">
                    <Shield size={10} /> 安全沙箱
                  </span>
                </div>
              </div>
              <button onClick={() => handleToggle(plugin.meta.id, plugin.status)} disabled={plugin.source === "built-in"}
                className={`p-2 rounded-lg transition-colors ${isEnabled ? "text-emerald-400 hover:bg-emerald-500/10" : "text-muted-foreground/40 hover:bg-muted"} ${plugin.source === "built-in" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                title={plugin.source === "built-in" ? "内置插件不可禁用" : isEnabled ? "禁用" : "启用"}>
                {isEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              </button>
            </div>
          );
        })}
        {plugins.length === 0 && systemStatus.ready && (
          <div className="text-center py-12 text-muted-foreground/50 text-sm">暂无插件，点击上方「导入插件文件夹」导入本地插件</div>
        )}
      </div>
    </div>
  );
}
