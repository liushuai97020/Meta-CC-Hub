/**
 * MetaCode 记忆系统设置面板
 * RAG 向量记忆开关、参数配置、数据管理
 */
import { useEffect, useState } from "react";
import { Brain, Trash2, RefreshCw, Database, HardDrive, MessageSquare, BarChart3 } from "lucide-react";

interface MemoryConfigData {
  enabled: boolean;
  recentRounds: number;
  maxContextTokens: number;
  similarityThreshold: number;
  maxRetrievedMemories: number;
  embeddingModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;
}

interface MemoryStatsData {
  sessionCount: number;
  messageCount: number;
  vectorCount: number;
  dbSize: number;
  usageLogCount: number;
}

export default function MemorySettingsPanel() {
  const [config, setConfig] = useState<MemoryConfigData | null>(null);
  const [stats, setStats] = useState<MemoryStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfgRes, statRes] = await Promise.all([
        window.electronAPI.memory.getConfig(),
        window.electronAPI.memory.getStats(),
      ]);
      if (cfgRes.success) setConfig(cfgRes.data);
      if (statRes.success) setStats(statRes.data);
    } catch (err) {
      console.error("[MemorySettings] 加载失败:", err);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await window.electronAPI.memory.updateConfig({
        enabled: config.enabled,
        recentRounds: config.recentRounds,
        maxContextTokens: config.maxContextTokens,
        similarityThreshold: config.similarityThreshold,
        maxRetrievedMemories: config.maxRetrievedMemories,
        embeddingModel: config.embeddingModel,
        embeddingBaseUrl: config.embeddingBaseUrl,
        embeddingApiKey: config.embeddingApiKey,
      });
      setSaveMsg("✅ 配置已保存");
    } catch (err) {
      setSaveMsg(`❌ 保存失败: ${String(err)}`);
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleClear = async () => {
    try {
      await window.electronAPI.memory.clearAll();
      setShowClearConfirm(false);
      setSaveMsg("✅ 已清空所有本地记忆数据");
      loadData();
    } catch (err) {
      setSaveMsg(`❌ 清空失败: ${String(err)}`);
    }
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const TSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none ${
        checked ? "bg-emerald-500" : "bg-muted-foreground/20 hover:bg-muted-foreground/30"
      }`}>
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground/50">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 开关 */}
      <div className="p-4 rounded-lg border border-border/40 bg-card/30">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="text-sm font-medium">RAG 向量记忆</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                开启后，系统将对历史对话进行向量化存储，在新对话中检索相关记忆，减少 Token 消耗
              </p>
            </div>
          </div>
          <TSwitch
            checked={config?.enabled ?? false}
            onChange={() => setConfig((c) => c ? { ...c, enabled: !c.enabled } : c)}
          />
        </div>
      </div>

      {/* 数据库统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Database} label="会话数" value={stats?.sessionCount ?? 0} />
        <StatCard icon={MessageSquare} label="消息数" value={stats?.messageCount ?? 0} />
        <StatCard icon={BarChart3} label="向量数" value={stats?.vectorCount ?? 0} />
        <StatCard icon={HardDrive} label="数据库大小" value={formatSize(stats?.dbSize ?? 0)} />
      </div>

      {/* Embedding 服务配置（独立于对话模型） */}
      <div className="p-4 rounded-lg border border-border/40 bg-card/30 space-y-4">
        <h3 className="text-sm font-medium">Embedding 服务配置</h3>
        <p className="text-xs text-muted-foreground">
          向量化服务独立于对话模型，可接入 OpenAI、Ollama 本地模型或任意兼容接口
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">API 地址</label>
            <input
              type="text"
              value={config?.embeddingBaseUrl ?? "https://api.openai.com/v1"}
              onChange={(e) => setConfig((c) => c ? { ...c, embeddingBaseUrl: e.target.value } : c)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30"
            />
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              Ollama 填 http://localhost:11434/v1，其他第三方填对应地址
            </p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
            <input
              type="password"
              value={config?.embeddingApiKey ?? ""}
              onChange={(e) => setConfig((c) => c ? { ...c, embeddingApiKey: e.target.value } : c)}
              placeholder="留空则复用当前对话模型的 API Key"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30"
            />
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              Ollama 等本地模型无需 Key，留空即可
            </p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">模型名称</label>
            <input
              type="text"
              value={config?.embeddingModel ?? "text-embedding-3-small"}
              onChange={(e) => setConfig((c) => c ? { ...c, embeddingModel: e.target.value } : c)}
              placeholder="text-embedding-3-small"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/30"
            />
            <p className="text-xs text-muted-foreground/50 mt-0.5">
              OpenAI: text-embedding-3-small / text-embedding-3-large · Ollama: nomic-embed-text / bge-m3
            </p>
          </div>
        </div>
      </div>

      {/* 参数配置 */}
      <div className="p-4 rounded-lg border border-border/40 bg-card/30 space-y-4">
        <h3 className="text-sm font-medium">上下文参数</h3>

        <div className="space-y-4">
          {/* 保留最近轮数 */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>保留最近对话轮数</span>
              <span className="text-muted-foreground">{config?.recentRounds ?? 5} 轮</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={config?.recentRounds ?? 5}
              onChange={(e) => setConfig((c) => c ? { ...c, recentRounds: Number(e.target.value) } : c)}
              className="w-full h-1.5 bg-muted-foreground/20 rounded-full appearance-none cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">固定保留最近的完整对话轮数，保证连贯性</p>
          </div>

          {/* 最大上下文 Token */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>单次最大上下文 Token</span>
              <span className="text-muted-foreground">{(config?.maxContextTokens ?? 8000).toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={2000}
              max={32000}
              step={1000}
              value={config?.maxContextTokens ?? 8000}
              onChange={(e) => setConfig((c) => c ? { ...c, maxContextTokens: Number(e.target.value) } : c)}
              className="w-full h-1.5 bg-muted-foreground/20 rounded-full appearance-none cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">超出自动裁剪，减少 Token 消耗</p>
          </div>

          {/* 相似度阈值 */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>记忆相似度阈值</span>
              <span className="text-muted-foreground">{config?.similarityThreshold ?? 0.4}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={config?.similarityThreshold ?? 0.4}
              onChange={(e) => setConfig((c) => c ? { ...c, similarityThreshold: Number(e.target.value) } : c)}
              className="w-full h-1.5 bg-muted-foreground/20 rounded-full appearance-none cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">值越高，只召回最相关的记忆；值越低，召回更多但可能引入无关内容</p>
          </div>

          {/* 最大召回数量 */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>最大召回记忆数</span>
              <span className="text-muted-foreground">{config?.maxRetrievedMemories ?? 4} 条</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={config?.maxRetrievedMemories ?? 4}
              onChange={(e) => setConfig((c) => c ? { ...c, maxRetrievedMemories: Number(e.target.value) } : c)}
              className="w-full h-1.5 bg-muted-foreground/20 rounded-full appearance-none cursor-pointer accent-primary"
            />
          </div>

        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors">
          {saving ? "保存中..." : "保存配置"}
        </button>

        {saveMsg && <span className="text-sm text-muted-foreground">{saveMsg}</span>}
      </div>

      {/* 清空数据 */}
      <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5">
        <div className="flex items-start gap-3">
          <Trash2 className="h-5 w-5 text-red-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-400">清空本地记忆</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              删除所有本地存储的向量记忆数据。会话记录不受影响，重启后向量记忆将重新生成。
            </p>
            {showClearConfirm ? (
              <div className="flex items-center gap-2 mt-3">
                <button onClick={handleClear}
                  className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
                  确认清空
                </button>
                <button onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1.5 text-xs bg-muted rounded-md hover:bg-muted/80 transition-colors">
                  取消
                </button>
              </div>
            ) : (
              <button onClick={() => setShowClearConfirm(true)}
                className="mt-3 px-3 py-1.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/20 transition-colors">
                清空所有记忆数据
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 统计小卡片 */
function StatCard({ icon: Icon, label, value }: { icon: React.FC<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="p-3 rounded-lg border border-border/40 bg-card/30">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
