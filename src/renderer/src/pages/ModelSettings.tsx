/**
 * 网关配置管理页面
 * 以网关配置卡片为维度，每个卡片可独立编辑、启用/禁用
 */
import React, { useState, useEffect } from "react";
import { cn } from "../utils/cn";
import { useGatewayStore } from "../stores/gatewayStore";
import { useAppStore } from "../stores/appStore";
import {
  Plus,
  Settings,
  Globe,
  Server,
  Cpu,
  Zap,
  Network,
  Shield,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
  ArrowLeft,
  Download,
  Fuel,
  Sparkles,
  Brain,
  Image,
  SearchCode,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

// ========================
// 常量
// ========================

const TYPE_CONFIG = {
  official: {
    label: "官方 Claude",
    icon: Globe,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    description: "Anthropic 官方 API",
  },
  "third-party": {
    label: "第三方 API",
    icon: Server,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    description: "Anthropic 兼容 API（如 DeepSeek）",
  },
  local: {
    label: "本地模型",
    icon: Cpu,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    description: "Ollama 等本地推理服务",
  },
} as const;

const STATUS_CONFIG = {
  unknown: { icon: Wifi, color: "text-muted-foreground", label: "未测试" },
  testing: { icon: Loader2, color: "text-amber-500", label: "测试中..." },
  connected: { icon: Wifi, color: "text-emerald-500", label: "已连接" },
  error: { icon: WifiOff, color: "text-red-500", label: "连接失败" },
} as const;

const SLOT_DEFS = [
  {
    key: "defaultModel" as const,
    label: "默认主模型",
    icon: Sparkles,
    desc: "通用对话",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    key: "expertModel" as const,
    label: "专家模型",
    icon: Brain,
    desc: "复杂推理",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    key: "smallModel" as const,
    label: "小模型",
    icon: Zap,
    desc: "快速响应",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    key: "analysisModel" as const,
    label: "分析模型",
    icon: SearchCode,
    desc: "代码审查",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    key: "imageModel" as const,
    label: "图片模型",
    icon: Image,
    desc: "多模态任务",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
] as const;

// ========================
// 开关组件 (iOS 风格)
// ========================

const Toggle: React.FC<{ checked: boolean; onChange: () => void }> = ({
  checked,
  onChange,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
      checked
        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.25)]"
        : "bg-muted-foreground/20 hover:bg-muted-foreground/30",
    )}
  >
    <span
      className={cn(
        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out",
        checked ? "translate-x-5" : "translate-x-0",
      )}
    />
  </button>
);

// ========================
// 状态指示器
// ========================

const StatusDot: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", cfg.color)}>
      <div
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === "connected"
            ? "bg-emerald-500"
            : status === "error"
              ? "bg-red-500"
              : status === "testing"
                ? "bg-amber-500 animate-pulse"
                : "bg-muted-foreground/30",
        )}
      />
      {cfg.label}
    </span>
  );
};

// ========================
// 代理配置
// ========================

interface ProxyFormProps {
  proxy?: ProxyConfig;
  onChange: (proxy: ProxyConfig | undefined) => void;
}

const ProxyForm: React.FC<ProxyFormProps> = ({ proxy, onChange }) => {
  const [enabled, setEnabled] = useState(!!proxy);
  const handleChange = (field: keyof ProxyConfig, value: string | number) => {
    onChange({
      ...(proxy || { protocol: "http", host: "", port: 8080 }),
      [field]: value,
    });
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => {
          if (enabled) {
            onChange(undefined);
            setEnabled(false);
          } else {
            onChange({ protocol: "http", host: "", port: 8080 });
            setEnabled(true);
          }
        }}
      >
        <Shield className="h-3 w-3" />
        {enabled ? "移除代理" : "代理"}
      </button>
      {enabled && (
        <div className="flex gap-2 pl-3 border-l-2 border-border">
          <select
            className="h-7 rounded border border-input bg-background px-1.5 text-[11px]"
            value={proxy?.protocol || "http"}
            onChange={(e) => handleChange("protocol", e.target.value)}
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="socks5">SOCKS5</option>
          </select>
          <Input
            className="h-7 text-[11px]"
            value={proxy?.host || ""}
            onChange={(e) => handleChange("host", e.target.value)}
            placeholder="host"
          />
          <Input
            className="h-7 text-[11px] w-20"
            type="number"
            value={proxy?.port || 8080}
            onChange={(e) => handleChange("port", Number(e.target.value))}
            placeholder="port"
          />
        </div>
      )}
    </div>
  );
};

// ========================
// 手动添加模型输入
// ========================

const ManualModelInput: React.FC<{ onAdd: (name: string) => void }> = ({
  onAdd,
}) => {
  const [val, setVal] = useState("");
  const handleAdd = () => {
    const trimmed = val.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setVal("");
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        className="flex-1 h-7 rounded-md border border-input bg-background px-2.5 text-[11px] font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
        placeholder="手动输入模型名称，回车添加"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
      />
      <button
        className="h-7 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 disabled:opacity-40 flex items-center gap-0.5"
        onClick={handleAdd}
        disabled={!val.trim()}
      >
        <Plus className="h-3 w-3" />
        添加
      </button>
    </div>
  );
};

// ========================
// 模型槽位选择器
// ========================

interface SlotSelectorProps {
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bg: string;
  value: string;
  models: string[];
  onChange: (val: string) => void;
}

const SlotSelector: React.FC<SlotSelectorProps> = ({
  label,
  icon: Icon,
  color,
  bg,
  value,
  models,
  onChange,
}) => (
  <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/40 hover:border-border/80 transition-colors bg-background">
    <div
      className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
        bg,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", color)} />
    </div>
    <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
    <div className="relative flex-1">
      <select
        className={cn(
          "w-full h-7 rounded-md border border-input bg-background/50 pl-2 pr-6 text-xs appearance-none cursor-pointer",
          "focus:outline-none focus:ring-1 focus:ring-primary/30",
          value ? "text-foreground" : "text-muted-foreground",
          models.length === 0 && "opacity-50 cursor-not-allowed",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={models.length === 0}
      >
        {!value && <option value="">未设置</option>}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50 pointer-events-none" />
    </div>
  </div>
);

// ========================
// 当前启用横幅
// ========================

const ActiveBanner: React.FC<{ profile: GatewayProfile }> = ({ profile }) => {
  const typeCfg = TYPE_CONFIG[profile.type];
  const TypeIcon = typeCfg.icon;
  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/[0.04] to-transparent overflow-hidden">
      <div className="px-5 py-3.5 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              typeCfg.bgColor,
            )}
          >
            <TypeIcon className={cn("h-4.5 w-4.5", typeCfg.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{profile.name}</span>
              <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                使用中
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-xs text-muted-foreground font-mono">
                {profile.baseUrl}
              </code>
              <span className="text-muted-foreground/30">·</span>
              <StatusDot status={profile.connectionStatus || "unknown"} />
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 py-3">
        <div className="grid grid-cols-5 gap-2">
          {SLOT_DEFS.map((s) => {
            const Icon = s.icon;
            const val = profile[s.key];
            return (
              <div key={s.key} className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Icon className={cn("h-3 w-3", s.color)} />
                  <span className="text-[10px] text-muted-foreground">
                    {s.label
                      .replace("模型", "")
                      .replace("默认", "")
                      .replace("图片", "")}
                  </span>
                </div>
                <div
                  className="text-[11px] font-mono font-medium truncate px-1"
                  title={val}
                >
                  {val || <span className="text-muted-foreground/30">-</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ========================
// 网关配置卡片
// ========================

interface GatewayCardProps {
  profile: GatewayProfile;
  isActive: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<GatewayProfile>) => void;
  onDelete: () => void;
  onTest: () => void;
  onPull: () => void;
  testing: boolean;
  pulling: boolean;
}

const GatewayCard: React.FC<GatewayCardProps> = ({
  profile,
  isActive,
  onToggle,
  onUpdate,
  onDelete,
  onTest,
  onPull,
  testing,
  pulling,
}) => {
  const [expanded, setExpanded] = useState(false);
  const typeCfg = TYPE_CONFIG[profile.type];
  const TypeIcon = typeCfg.icon;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200",
        isActive
          ? "border-primary/40 bg-primary/[0.02] shadow-sm shadow-primary/5"
          : "border-border hover:border-muted-foreground/20",
      )}
    >
      {/* 顶部：图标 + 名称 + 开关 + 删除 */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
            typeCfg.bgColor,
          )}
        >
          <TypeIcon className={cn("h-4.5 w-4.5", typeCfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{profile.name}</span>
            <StatusDot status={profile.connectionStatus || "unknown"} />
          </div>
          <code className="text-[11px] text-muted-foreground font-mono truncate block mt-0.5">
            {profile.baseUrl}
          </code>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Toggle checked={isActive} onChange={onToggle} />
            <span
              className={cn(
                "text-xs font-medium",
                isActive ? "text-emerald-500" : "text-muted-foreground/50",
              )}
            >
              {isActive ? "已启用" : "未启用"}
            </span>
          </div>
          <button
            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            onClick={onDelete}
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 操作按钮行 */}
      <div className="px-4 pb-1 flex items-center gap-1.5">
        <button
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
          onClick={onTest}
          disabled={testing}
        >
          <RefreshCw className={cn("h-3 w-3", testing && "animate-spin")} />
          {testing ? "测试中" : "测试"}
        </button>
        <button
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
          onClick={onPull}
          disabled={pulling}
        >
          <Download className={cn("h-3 w-3", pulling && "animate-bounce")} />
          {pulling ? "拉取中" : "拉取"}
        </button>
        <button
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <Settings className="h-3 w-3" />
          {expanded ? "收起" : "更多"}
        </button>
        {profile.availableModels.length > 0 && (
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {profile.availableModels.length} 个模型
          </span>
        )}
      </div>

      {/* 5 个模型槽位 */}
      <div className="px-4 pb-3 pt-2 space-y-1.5">
        {SLOT_DEFS.map((s) => (
          <SlotSelector
            key={s.key}
            label={s.label}
            icon={s.icon}
            color={s.color}
            bg={s.bg}
            value={profile[s.key]}
            models={profile.availableModels}
            onChange={(val) => onUpdate({ [s.key]: val })}
          />
        ))}
      </div>

      {/* 展开的详细配置 */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
          {/* Base URL */}
          <div>
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Base URL
            </label>
            <Input
              className="h-8 text-xs mt-1 font-mono"
              value={profile.baseUrl}
              onChange={(e) => onUpdate({ baseUrl: e.target.value })}
            />
          </div>
          {/* API Key */}
          {(profile.type === "official" || profile.type === "third-party") && (
            <div>
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                API Key
              </label>
              <Input
                className="h-8 text-xs mt-1 font-mono"
                type="password"
                value={profile.apiKey || ""}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
                placeholder={
                  profile.type === "official" ? "sk-ant-..." : "sk-..."
                }
              />
            </div>
          )}
          {/* 代理 */}
          <ProxyForm
            proxy={profile.proxy}
            onChange={(proxy) => onUpdate({ proxy })}
          />
          {/* 已拉取模型 */}
          <div>
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              已拉取模型
            </label>
            {profile.availableModels.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {profile.availableModels.map((m) => (
                  <span
                    key={m}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted/50 border border-border/50 text-muted-foreground"
                  >
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                点击"拉取"获取模型列表
              </p>
            )}
            <div className="mt-2">
              <ManualModelInput
                onAdd={(m) =>
                  onUpdate({ availableModels: [...profile.availableModels, m] })
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ========================
// 新建配置卡片
// ========================

interface NewCardProps {
  onSave: (data: Omit<GatewayProfile, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
}

const NewCard: React.FC<NewCardProps> = ({ onSave, onCancel }) => {
  const [type, setType] = useState<ModelType>("official");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [proxy, setProxy] = useState<ProxyConfig | undefined>();
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [expertModel, setExpertModel] = useState("");
  const [smallModel, setSmallModel] = useState("");
  const [analysisModel, setAnalysisModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [pulling, setPulling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency?: number;
    error?: string;
  } | null>(null);
  const [pullError, setPullError] = useState("");
  const { testConnection, pullModels } = useGatewayStore();

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testConnection({ baseUrl, apiKey, type, proxy }));
    } catch (e: any) {
      setTestResult({ success: false, error: String(e) });
    }
    setTesting(false);
  };

  const handlePull = async () => {
    setPulling(true);
    setPullError("");
    try {
      const result = await pullModels({ baseUrl, apiKey, type, proxy });
      if (result.success && result.models) setAvailableModels(result.models);
      else setPullError(result.error || "拉取失败");
    } catch {
      setPullError("拉取失败");
    }
    setPulling(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !baseUrl.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        type,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey || undefined,
        proxy,
        defaultModel,
        expertModel,
        smallModel,
        analysisModel,
        imageModel,
        availableModels,
        enabled: false,
        connectionStatus: testResult?.success ? "connected" : undefined,
        lastTestedAt: testResult?.success
          ? new Date().toISOString()
          : undefined,
      });
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const typeCfg = TYPE_CONFIG[type];
  const TypeIcon = typeCfg.icon;

  const slotVals = {
    defaultModel,
    expertModel,
    smallModel,
    analysisModel,
    imageModel,
  };
  const slotSetters = {
    setDefaultModel,
    setExpertModel,
    setSmallModel,
    setAnalysisModel,
    setImageModel,
  };
  const slotKeyToSetter: Record<string, (v: string) => void> = {
    defaultModel: setDefaultModel,
    expertModel: setExpertModel,
    smallModel: setSmallModel,
    analysisModel: setAnalysisModel,
    imageModel: setImageModel,
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.02]">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
            typeCfg.bgColor,
          )}
        >
          <TypeIcon className={cn("h-4.5 w-4.5", typeCfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="配置名称"
            className="h-8 text-sm font-medium"
          />
        </div>
      </div>

      <div className="px-4 space-y-3 pb-4">
        {/* 类型 */}
        <div className="flex gap-1.5">
          {(["official", "third-party", "local"] as const).map((t) => {
            const cfg = TYPE_CONFIG[t];
            const Icon = cfg.icon;
            return (
              <button
                key={t}
                type="button"
                className={cn(
                  "flex items-center gap-1.5 py-1.5 px-3 rounded-md border text-[11px] transition-all",
                  type === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent text-muted-foreground",
                )}
                onClick={() => setType(t)}
              >
                <Icon className="h-3.5 w-3.5" /> {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Base URL + API Key */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] text-muted-foreground block mb-1">
              Base URL
            </label>
            <Input
              className="h-8 text-xs font-mono"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                type === "official"
                  ? "https://api.anthropic.com"
                  : "https://..."
              }
            />
          </div>
          {type !== "local" && (
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">
                API Key
              </label>
              <Input
                className="h-8 text-xs"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={type === "official" ? "sk-ant-..." : "sk-..."}
              />
            </div>
          )}
        </div>

        {/* 代理 */}
        <ProxyForm proxy={proxy} onChange={setProxy} />

        {/* 测试+拉取 */}
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1 h-7 px-3 rounded-md text-[11px] border border-border hover:bg-accent transition-colors disabled:opacity-40"
            onClick={handleTest}
            disabled={testing || !baseUrl}
          >
            <RefreshCw className={cn("h-3 w-3", testing && "animate-spin")} />
            {testing ? "测试中" : "测试"}
          </button>
          <button
            className="inline-flex items-center gap-1 h-7 px-3 rounded-md text-[11px] border border-border hover:bg-accent transition-colors disabled:opacity-40"
            onClick={handlePull}
            disabled={pulling || !baseUrl}
          >
            <Download className={cn("h-3 w-3", pulling && "animate-bounce")} />
            {pulling
              ? "拉取中"
              : availableModels.length > 0
                ? "重新拉取"
                : "拉取模型"}
          </button>
          {testResult && (
            <span
              className={cn(
                "text-[11px] font-medium",
                testResult.success ? "text-emerald-500" : "text-red-500",
              )}
            >
              {testResult.success
                ? `✓ ${testResult.latency}ms`
                : `✗ ${testResult.error?.slice(0, 24)}`}
            </span>
          )}
          {pullError && (
            <span className="text-[11px] text-red-500">{pullError}</span>
          )}
        </div>

        {/* 手动添加模型 */}
        <ManualModelInput
          onAdd={(m) =>
            setAvailableModels((prev) =>
              prev.includes(m) ? prev : [...prev, m],
            )
          }
        />

        {/* 可用模型 */}
        {availableModels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {availableModels.map((m) => (
              <span
                key={m}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono border",
                  defaultModel === m ||
                    expertModel === m ||
                    smallModel === m ||
                    analysisModel === m ||
                    imageModel === m
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border/60 bg-background text-muted-foreground",
                )}
              >
                {m}
              </span>
            ))}
          </div>
        )}

        {/* 5 个槽位 */}
        <div className="space-y-1.5">
          {availableModels.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 text-center py-4 border border-dashed border-border/40 rounded-lg">
              <Download className="h-4 w-4 inline-block mr-1 opacity-30" />
              点击"拉取模型"获取可用模型
            </p>
          ) : (
            SLOT_DEFS.map((s) => (
              <SlotSelector
                key={s.key}
                label={s.label}
                icon={s.icon}
                color={s.color}
                bg={s.bg}
                value={slotVals[s.key]}
                models={availableModels}
                onChange={(v) => slotKeyToSetter[s.key](v)}
              />
            ))
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
          <button
            className="h-8 px-4 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="h-8 px-5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 inline-flex items-center gap-1"
            onClick={handleSave}
            disabled={!name.trim() || !baseUrl.trim() || saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> 保存中
              </>
            ) : (
              <>
                <Check className="h-3 w-3" /> 保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ========================
// 用量统计
// ========================

const UsageStatsPanel: React.FC = () => {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    loadStats();
  }, []);
  const loadStats = async () => {
    try {
      setStats(await window.electronAPI.usage.getStats());
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  };
  if (!stats) return null;
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Fuel className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">用量统计</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            总计 {stats.totalTokens.toLocaleString()} Tokens
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 p-3 rounded-lg">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                总 Token
              </div>
              <div className="text-xl font-semibold mt-1">
                {stats.totalTokens.toLocaleString()}
              </div>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                总请求
              </div>
              <div className="text-xl font-semibold mt-1">
                {stats.totalRequests.toLocaleString()}
              </div>
            </div>
          </div>
          {stats.dailyStats.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                最近统计
              </div>
              <div className="space-y-1">
                {stats.dailyStats
                  .slice(-7)
                  .reverse()
                  .map((day, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="text-muted-foreground">{day.date}</span>
                      <div className="flex items-center gap-3">
                        <span>{day.tokens.toLocaleString()} tokens</span>
                        <span className="text-muted-foreground/50">
                          {day.requests} 次请求
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={loadStats}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            刷新
          </Button>
        </div>
      )}
    </div>
  );
};

// ========================
// 主页面
// ========================

const ModelSettings: React.FC = () => {
  const {
    profiles,
    activeProfileId,
    loadProfiles,
    addProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
    deactivateProfile,
    testConnection,
    pullModels,
  } = useGatewayStore();
  const [isAdding, setIsAdding] = useState(false);
  const [pullingMap, setPullingMap] = useState<Record<string, boolean>>({});
  const [testingMap, setTestingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const handleDelete = async (profileId: string) => {
    if (window.confirm("确定删除此配置？")) await deleteProfile(profileId);
  };

  const handleTest = async (profile: GatewayProfile) => {
    setTestingMap((m) => ({ ...m, [profile.id]: true }));
    const result = await testConnection(profile);
    await updateProfile(profile.id, {
      connectionStatus: result.success ? "connected" : "error",
      lastTestedAt: new Date().toISOString(),
    });
    setTestingMap((m) => ({ ...m, [profile.id]: false }));
  };

  const handlePull = async (profile: GatewayProfile) => {
    setPullingMap((m) => ({ ...m, [profile.id]: true }));
    const result = await pullModels(profile);
    if (result.success && result.models) {
      const merged = [
        ...new Set([...profile.availableModels, ...result.models]),
      ];
      await updateProfile(profile.id, { availableModels: merged });
    }
    setPullingMap((m) => ({ ...m, [profile.id]: false }));
  };

  const handleToggle = async (profile: GatewayProfile) => {
    if (activeProfileId === profile.id) {
      await deactivateProfile();
    } else {
      await setActiveProfile(profile.id);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* 顶部 */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => useAppStore.getState().setShowSettings(false)}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h1 className="text-lg font-semibold">网关配置</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  管理 AI 网关，分配多模型策略
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => setIsAdding(true)}
              disabled={isAdding}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              新增配置
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* 当前启用横幅 */}
        {activeProfile && <ActiveBanner profile={activeProfile} />}

        {/* 新建卡片 */}
        {isAdding && (
          <NewCard
            onSave={async (data) => {
              await addProfile(data);
              setIsAdding(false);
            }}
            onCancel={() => setIsAdding(false)}
          />
        )}

        {/* 配置列表 */}
        {profiles.length === 0 && !isAdding ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Network className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-medium text-muted-foreground mb-1">
              还没有网关配置
            </h3>
            <p className="text-sm text-muted-foreground/60 mb-6 max-w-sm">
              新增一个网关配置，连接你的 AI 模型提供商
            </p>
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-1" />
              新增配置
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => (
              <GatewayCard
                key={profile.id}
                profile={profile}
                isActive={activeProfileId === profile.id}
                onToggle={() => handleToggle(profile)}
                onUpdate={(updates) => updateProfile(profile.id, updates)}
                onDelete={() => handleDelete(profile.id)}
                onTest={() => handleTest(profile)}
                onPull={() => handlePull(profile)}
                testing={!!testingMap[profile.id]}
                pulling={!!pullingMap[profile.id]}
              />
            ))}
          </div>
        )}

        <UsageStatsPanel />

        <div className="text-center text-xs text-muted-foreground/40 pb-8">
          MetaCode · 支持多网关配置，每个网关可分配 5 种模型角色
        </div>
      </div>
    </div>
  );
};

export default ModelSettings;
