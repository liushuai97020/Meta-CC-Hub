/**
 * MetaCode Agent 设置页面
 * Agent 开关、多轮调用、沙箱安全、权限管控
 */

import { useEffect, useState } from "react";
import { useAgentStore } from "../../stores/agentStore";

export default function AgentSettingsPage() {
  const { config, systemStatus, refreshAll } = useAgentStore();
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [agentEnabled, setAgentEnabled] = useState(true);
  const [sandboxEnabled, setSandboxEnabled] = useState(true);
  const [confirmEachTool, setConfirmEachTool] = useState(false);
  const [maxIterations, setMaxIterations] = useState(20);
  const [composioKey, setComposioKey] = useState("");

  useEffect(() => {
    refreshAll().catch(console.error);
  }, []);

  useEffect(() => {
    if (config?.agent) {
      setAgentEnabled(config.agent.enabled ?? true);
      setSandboxEnabled(config.agent.sandboxEnabled ?? true);
      setConfirmEachTool(config.agent.confirmEachTool ?? false);
      setMaxIterations(config.agent.maxIterations ?? 20);
      setComposioKey(config.agent.composioApiKey ?? "");
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await window.electronAPI.agentV2.updateConfig({
        agent: { enabled: agentEnabled, sandboxEnabled, confirmEachTool, maxIterations, composioApiKey: composioKey || undefined },
      });
      await refreshAll();
      setSaveMsg("✅ 配置已保存");
    } catch (err) {
      setSaveMsg(`❌ 保存失败: ${String(err)}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  /** 开关组件 */
  const TSwitch = ({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange} disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none ${
        checked ? "bg-emerald-500" : "bg-muted-foreground/20 hover:bg-muted-foreground/30"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* 系统状态 */}
      <div className="flex items-center gap-3 p-4 rounded-lg border bg-card border-border/40">
        <div className={`w-2 h-2 rounded-full ${systemStatus.ready ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
        <span className="text-sm text-foreground font-medium">Agent 系统</span>
        <span className="text-xs text-muted-foreground/50">
          {systemStatus.ready
            ? `${systemStatus.toolCount || 0} 工具 · ${systemStatus.skillCount || 0} 技能 · ${systemStatus.pluginCount || 0} 插件`
            : "未就绪"}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${
          systemStatus.agentEngine === "idle" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
        }`}>
          {systemStatus.agentEngine === "idle" ? "空闲" : systemStatus.agentEngine || "未知"}
        </span>
      </div>

      {/* 配置项 */}
      <div className="space-y-2">
        {[
          { label: "Agent 智能决策", desc: "启用后 AI 可自动判断是否调用工具", val: agentEnabled, set: setAgentEnabled },
          { label: "沙箱隔离", desc: "禁止第三方工具访问敏感路径和密钥", val: sandboxEnabled, set: setSandboxEnabled },
          { label: "每次工具调用需确认", desc: "工具执行前需要用户手动确认", val: confirmEachTool, set: setConfirmEachTool },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between p-4 rounded-lg border bg-card border-border/40">
            <div>
              <h3 className="text-sm font-medium text-foreground">{item.label}</h3>
              <p className="text-xs text-muted-foreground/50 mt-0.5">{item.desc}</p>
            </div>
            <TSwitch checked={item.val} onChange={() => item.set(!item.val)} />
          </div>
        ))}

        {/* 迭代次数 */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card border-border/40">
          <div>
            <h3 className="text-sm font-medium text-foreground">最大工具调用轮次</h3>
            <p className="text-xs text-muted-foreground/50 mt-0.5">限制 AI 连续调用工具的迭代次数（1-50）</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={50} value={maxIterations}
              onChange={(e) => setMaxIterations(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="w-16 px-2 py-1 text-xs rounded bg-muted/30 border border-border/50 text-foreground text-center outline-none focus:border-primary/30" />
            <span className="text-xs text-muted-foreground/50">轮</span>
          </div>
        </div>
      </div>

        {/* Composio API Key */}
        <div className="p-4 rounded-lg border bg-card border-border/40">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-medium text-foreground">Composio API Key</h3>
              <p className="text-xs text-muted-foreground/50 mt-0.5">用于搜索和安装 Composio 市场的技能和插件</p>
            </div>
          </div>
          <input type="password" value={composioKey}
            onChange={(e) => setComposioKey(e.target.value)}
            placeholder="输入 Composio API Key 或留空"
            className="mt-2 w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30" />
        </div>

      {/* 保存 */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors disabled:opacity-50">
          {saving ? "保存中..." : "保存配置"}
        </button>
        {saveMsg && <span className="text-xs text-muted-foreground/60">{saveMsg}</span>}
      </div>
    </div>
  );
}
