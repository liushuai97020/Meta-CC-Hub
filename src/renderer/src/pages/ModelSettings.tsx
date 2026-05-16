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
  BarChart3,
  PieChart,
  Activity,
  Puzzle,
  Plug,
  Sliders,
  Wrench,
  Bot,
  Sun,
  Moon,
  Type,
  Database,
  Info,
  Power,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import AgentToolCenter from "./agent/AgentToolCenter";
import AgentSkillCenter from "./agent/AgentSkillCenter";
import AgentPluginMarket from "./agent/AgentPluginMarket";
import AgentSettingsPage from "./agent/AgentSettingsPage";
import MemorySettingsPanel from "./agent/MemorySettingsPanel";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

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

/**
 * 已知提供商的 URL 格式映射，用于切换 API 格式时自动切换 baseUrl
 */
const KNOWN_PROVIDER_URLS: Array<{
  match: (url: string) => boolean;
  anthropic: string;
  openai: string;
}> = [
  {
    match: (url) => url.includes("api.deepseek.com"),
    anthropic: "https://api.deepseek.com/anthropic",
    openai: "https://api.deepseek.com",
  },
];

function getBaseUrlForFormat(
  currentUrl: string,
  targetFormat: "anthropic" | "openai",
): string | null {
  for (const provider of KNOWN_PROVIDER_URLS) {
    if (provider.match(currentUrl)) {
      return provider[targetFormat];
    }
  }
  return null;
}

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
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<GatewayProfile | null>(null);

  const isEditing = editing && editData !== null;
  const displayProfile = isEditing ? editData! : profile;

  const startEditing = () => {
    setEditData({ ...profile });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditData(null);
    setEditing(false);
  };

  const saveEditing = () => {
    if (editData) {
      onUpdate(editData);
    }
    setEditData(null);
    setEditing(false);
  };

  const handleUpdate = (updates: Partial<GatewayProfile>) => {
    if (isEditing) {
      setEditData({ ...editData!, ...updates });
    } else {
      onUpdate(updates);
    }
  };

  const handleApiFormatChange = (fmt: "anthropic" | "openai") => {
    if (isEditing) {
      const newUrl = getBaseUrlForFormat(editData!.baseUrl, fmt);
      setEditData({
        ...editData!,
        apiFormat: fmt,
        ...(newUrl ? { baseUrl: newUrl } : {}),
      });
    } else {
      const newUrl = getBaseUrlForFormat(profile.baseUrl, fmt);
      onUpdate({
        apiFormat: fmt,
        ...(newUrl ? { baseUrl: newUrl } : {}),
      });
    }
  };

  const handleSlotChange = (key: string, val: string) => {
    handleUpdate({ [key]: val });
  };

  const typeCfg = TYPE_CONFIG[displayProfile.type];
  const TypeIcon = typeCfg.icon;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200",
        isActive
          ? "border-primary/40 bg-primary/[0.02] shadow-sm shadow-primary/5"
          : "border-border hover:border-muted-foreground/20",
        isEditing && "ring-1 ring-primary/20",
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
            {isEditing ? (
              <Input
                className="h-7 text-sm font-medium"
                value={editData!.name}
                onChange={(e) => setEditData({ ...editData!, name: e.target.value })}
              />
            ) : (
              <span className="text-sm font-medium truncate">{profile.name}</span>
            )}
            <StatusDot status={displayProfile.connectionStatus || "unknown"} />
          </div>
          <code className="text-[11px] text-muted-foreground font-mono truncate block mt-0.5">
            {displayProfile.baseUrl}
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
          className={cn(
            "inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] transition-colors",
            isEditing
              ? "bg-primary/10 text-primary border border-primary/30"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
          onClick={() => (isEditing ? cancelEditing() : startEditing())}
        >
          <Settings className="h-3 w-3" />
          {isEditing ? "取消" : "编辑"}
        </button>
        {profile.availableModels.length > 0 && (
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {profile.availableModels.length} 个模型
          </span>
        )}
        {isEditing && (
          <button
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors ml-auto"
            onClick={saveEditing}
          >
            <Check className="h-3 w-3" />
            保存
          </button>
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
            value={displayProfile[s.key]}
            models={displayProfile.availableModels}
            onChange={(val) => handleSlotChange(s.key, val)}
          />
        ))}
      </div>

      {/* 编辑区 */}
      {isEditing && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
          {/* Base URL */}
          <div>
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              Base URL
            </label>
            <Input
              className="h-8 text-xs mt-1 font-mono"
              value={editData!.baseUrl}
              onChange={(e) =>
                setEditData({ ...editData!, baseUrl: e.target.value })
              }
            />
          </div>
          {/* API Key */}
          {(editData!.type === "official" || editData!.type === "third-party") && (
            <div>
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                API Key
              </label>
              <Input
                className="h-8 text-xs mt-1 font-mono"
                type="password"
                value={editData!.apiKey || ""}
                onChange={(e) =>
                  setEditData({ ...editData!, apiKey: e.target.value })
                }
                placeholder={
                  editData!.type === "official" ? "sk-ant-..." : "sk-..."
                }
              />
            </div>
          )}
          {/* 代理 */}
          <ProxyForm
            proxy={editData!.proxy}
            onChange={(proxy) => setEditData({ ...editData!, proxy })}
          />
          {/* API 格式选择 */}
          {editData!.type !== "local" && (
            <div>
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                API 格式
              </label>
              <div className="flex gap-2 mt-1">
                <button
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[11px] border transition-all",
                    (!editData!.apiFormat || editData!.apiFormat === "anthropic")
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:border-muted-foreground/30",
                  )}
                  onClick={() => handleApiFormatChange("anthropic")}
                >
                  Anthropic Messages API
                </button>
                <button
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[11px] border transition-all",
                    editData!.apiFormat === "openai"
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:border-muted-foreground/30",
                  )}
                  onClick={() => handleApiFormatChange("openai")}
                >
                  OpenAI 兼容格式
                </button>
              </div>
            </div>
          )}
          {/* 已拉取模型 */}
          <div>
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              已拉取模型
            </label>
            {editData!.availableModels.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {editData!.availableModels.map((m) => (
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
                  setEditData({
                    ...editData!,
                    availableModels: [...editData!.availableModels, m],
                  })
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
// 主流模型快捷预设
// ========================

interface QuickPreset {
  label: string;
  type: ModelType;
  /** 不同 API 格式对应的 baseUrl */
  baseUrls: {
    anthropic: string;
    openai: string;
  };
  /** 默认 API 格式 */
  defaultApiFormat: "anthropic" | "openai";
  /** 提供商模式 */
  provider?: "custom" | "deepseek";
  apiKeyHint?: string;
  models: string[];
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: "Anthropic Claude",
    type: "official",
    baseUrls: { anthropic: "https://api.anthropic.com", openai: "https://api.anthropic.com" },
    defaultApiFormat: "anthropic",
    apiKeyHint: "sk-ant-...",
    models: ["claude-sonnet-4-6", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  },
  {
    label: "OpenAI",
    type: "third-party",
    baseUrls: { anthropic: "https://api.openai.com/v1", openai: "https://api.openai.com/v1" },
    defaultApiFormat: "openai",
    apiKeyHint: "sk-...",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o3-mini"],
  },
  {
    label: "Google Gemini",
    type: "third-party",
    baseUrls: { anthropic: "https://generativelanguage.googleapis.com/v1beta", openai: "https://generativelanguage.googleapis.com/v1beta" },
    defaultApiFormat: "openai",
    apiKeyHint: "AIza...",
    models: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
  {
    label: "DeepSeek",
    type: "third-party",
    baseUrls: { anthropic: "https://api.deepseek.com/anthropic", openai: "https://api.deepseek.com" },
    defaultApiFormat: "openai",
    provider: "deepseek",
    apiKeyHint: "sk-...",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    label: "通义千问 (Qwen)",
    type: "third-party",
    baseUrls: { anthropic: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", openai: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
    defaultApiFormat: "openai",
    apiKeyHint: "sk-...",
    models: ["qwen-turbo", "qwen-plus", "qwen-max", "qwen2.5-72b-instruct"],
  },
  {
    label: "智谱 GLM",
    type: "third-party",
    baseUrls: { anthropic: "https://open.bigmodel.cn/api/paas/v4", openai: "https://open.bigmodel.cn/api/paas/v4" },
    defaultApiFormat: "openai",
    apiKeyHint: "",
    models: ["glm-4-plus", "glm-4-0520", "glm-4-air", "glm-4-flash"],
  },
  {
    label: "月之暗面 Moonshot",
    type: "third-party",
    baseUrls: { anthropic: "https://api.moonshot.cn/v1", openai: "https://api.moonshot.cn/v1" },
    defaultApiFormat: "openai",
    apiKeyHint: "sk-...",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  {
    label: "DeepSeek 本地",
    type: "local",
    baseUrls: { anthropic: "http://localhost:11434", openai: "http://localhost:11434" },
    defaultApiFormat: "openai",
    models: ["deepseek-coder", "deepseek-chat"],
  },
  {
    label: "SiliconFlow",
    type: "third-party",
    baseUrls: { anthropic: "https://api.siliconflow.cn/v1", openai: "https://api.siliconflow.cn/v1" },
    defaultApiFormat: "openai",
    apiKeyHint: "sk-...",
    models: ["deepseek-v3", "deepseek-r1", "Qwen/Qwen2.5-72B-Instruct", "THUDM/glm-4-9b-chat"],
  },
  {
    label: "零一万物 Yi",
    type: "third-party",
    baseUrls: { anthropic: "https://api.lingyiwanwu.com/v1", openai: "https://api.lingyiwanwu.com/v1" },
    defaultApiFormat: "openai",
    apiKeyHint: "",
    models: ["yi-lightning", "yi-large", "yi-medium"],
  },
  {
    label: "MiniMax",
    type: "third-party",
    baseUrls: { anthropic: "https://api.minimax.chat/v1", openai: "https://api.minimax.chat/v1" },
    defaultApiFormat: "openai",
    apiKeyHint: "",
    models: ["MiniMax-Text-01", "abab6.5s", "abab5.5"],
  },
  {
    label: "Ollama 本地",
    type: "local",
    baseUrls: { anthropic: "http://localhost:11434", openai: "http://localhost:11434" },
    defaultApiFormat: "openai",
    models: ["llama3", "qwen2", "mistral", "codellama"],
  },
];

// ========================
// 新建配置卡片
// ========================

interface NewCardProps {
  onSave: (data: Omit<GatewayProfile, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
}

function deriveApiFormat(type: ModelType): "anthropic" | "openai" {
  return type === "official" ? "anthropic" : type === "local" ? "openai" : "openai";
}

const NewCard: React.FC<NewCardProps> = ({ onSave, onCancel }) => {
  const [type, setType] = useState<ModelType>("official");
  const [apiFormat, setApiFormat] = useState<"anthropic" | "openai">("anthropic");
  const [provider, setProvider] = useState<"custom" | "deepseek" | undefined>();
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
  const [activePresetLabel, setActivePresetLabel] = useState<string | null>(null);
  const { testConnection, pullModels } = useGatewayStore();

  const applyPreset = (preset: QuickPreset) => {
    setType(preset.type);
    setApiFormat(preset.defaultApiFormat);
    setProvider(preset.provider);
    setBaseUrl(preset.baseUrls[preset.defaultApiFormat]);
    setApiKey("");
    setProxy(undefined);
    setAvailableModels([...preset.models]);
    // 清空模型槽位，让用户手动选择或拉取
    setDefaultModel("");
    setExpertModel("");
    setSmallModel("");
    setAnalysisModel("");
    setImageModel("");
    setName(preset.label);
    setTestResult(null);
    setPullError("");
    setActivePresetLabel(preset.label);
  };

  const handleApiFormatChange = (fmt: "anthropic" | "openai") => {
    setApiFormat(fmt);
    if (activePresetLabel) {
      const preset = QUICK_PRESETS.find((p) => p.label === activePresetLabel);
      if (preset) {
        setBaseUrl(preset.baseUrls[fmt]);
      }
    }
  };

  const handleBaseUrlChange = (val: string) => {
    setBaseUrl(val);
    if (activePresetLabel) setActivePresetLabel(null);
  };

  const handleNameChange = (val: string) => {
    setName(val);
  };

  const handleTypeChange = (t: ModelType) => {
    setType(t);
    setApiFormat(deriveApiFormat(t));
    setProvider(undefined);
    setActivePresetLabel(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testConnection({ baseUrl, apiKey, type, apiFormat, proxy }));
    } catch (e: any) {
      setTestResult({ success: false, error: String(e) });
    }
    setTesting(false);
  };

  const handlePull = async () => {
    setPulling(true);
    setPullError("");
    try {
      const result = await pullModels({ baseUrl, apiKey, type, apiFormat, proxy });
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
        apiFormat,
        provider,
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
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="配置名称"
            className="h-8 text-sm font-medium"
          />
        </div>
      </div>

      <div className="px-4 space-y-3 pb-4">
        {/* 快捷预设 */}
        <div>
          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1.5 block">
            快捷预设
          </label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="px-2.5 py-1 rounded-md border text-[11px] transition-all border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

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
                onClick={() => handleTypeChange(t)}
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
              onChange={(e) => handleBaseUrlChange(e.target.value)}
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

        {/* API 格式选择 */}
        {type !== "local" && (
          <div>
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              API 格式
            </label>
            <div className="flex gap-2 mt-1">
              <button
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] border transition-all",
                  apiFormat === "anthropic"
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:border-muted-foreground/30",
                )}
                onClick={() => handleApiFormatChange("anthropic")}
              >
                Anthropic Messages API
              </button>
              <button
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] border transition-all",
                  apiFormat === "openai"
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:border-muted-foreground/30",
                )}
                onClick={() => handleApiFormatChange("openai")}
              >
                OpenAI 兼容格式
              </button>
            </div>
          </div>
        )}

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

// 生成最近 N 天的图表数据（补零）
function buildChartData(dailyStats: DailyUsage[], days = 14) {
  const map = new Map(dailyStats.map((d) => [d.date, d]));
  const result: { date: string; tokens: number; requests: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = map.get(key);
    result.push({
      date: key.slice(5), // MM-DD
      tokens: found?.tokens ?? 0,
      requests: found?.requests ?? 0,
    });
  }
  return result;
}

function formatTokens(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}

const CHART_COLORS = {
  tokenLine: "hsl(var(--primary))",
  tokenArea: "hsl(var(--primary) / 0.15)",
  requestBar: "hsl(var(--chart-2, 220 70% 50%))",
  gridLine: "hsl(var(--border))",
  text: "hsl(var(--muted-foreground))",
};

/** 折线图卡片组件 */
const TokenChart: React.FC<{
  data: { date: string; tokens: number; requests: number }[];
  accentColor?: string;
}> = ({ data, accentColor }) => {
  const lineColor = accentColor || CHART_COLORS.tokenLine;
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
        Token 消耗趋势
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: CHART_COLORS.text }}
            axisLine={{ stroke: CHART_COLORS.gridLine }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART_COLORS.text }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatTokens}
            width={40}
          />
          <Tooltip
            cursor={false}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            formatter={((value: number) => `${value.toLocaleString()} Tokens`) as any}
          />
          <Area
            type="monotone"
            dataKey="tokens"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#tokenGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/** 请求量柱状图卡片 */
const RequestChart: React.FC<{
  data: { date: string; tokens: number; requests: number }[];
  barColor?: string;
}> = ({ data, barColor }) => {
  const color = barColor || CHART_COLORS.requestBar;
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
        请求数趋势
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: CHART_COLORS.text }}
            axisLine={{ stroke: CHART_COLORS.gridLine }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART_COLORS.text }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={24}
          />
          <Tooltip
            cursor={false}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            formatter={((value: number) => `${value} 次请求`) as any}
          />
          <Bar dataKey="requests" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** 概要统计卡片 */
const StatCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}> = ({ label, value, sub, icon }) => (
  <div className="bg-muted/30 border border-border/40 p-4 rounded-xl flex items-center gap-4 hover:border-border/80 transition-colors">
    {icon && <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground/40 shrink-0">{icon}</div>}
    <div className="min-w-0">
      <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
        {label}
      </div>
      <div className="text-xl font-bold mt-0.5 text-foreground/90">{value}</div>
      {sub && (
        <div className="text-[11px] text-muted-foreground/50 mt-0.5 truncate">{sub}</div>
      )}
    </div>
  </div>
);

/** 单组统计视图（总览 or 单个网关） */
const StatsView: React.FC<{
  totalTokens: number;
  totalRequests: number;
  dailyStats: DailyUsage[];
  accentColor?: string;
}> = ({ totalTokens, totalRequests, dailyStats, accentColor }) => {
  const chartData = buildChartData(dailyStats);
  const hasData = dailyStats.length > 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="总 Token"
          value={totalTokens.toLocaleString()}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="总请求"
          value={totalRequests.toLocaleString()}
          sub={totalRequests > 0 ? `平均 ${(totalTokens / totalRequests).toFixed(0)} tokens/次` : undefined}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>
      {hasData ? (
        <>
          <TokenChart data={chartData} accentColor={accentColor} />
          <RequestChart data={chartData} barColor={accentColor} />
        </>
      ) : (
        <div className="text-center text-xs text-muted-foreground/50 py-6 bg-muted/20 rounded-lg">
          暂无数据，开始对话后将自动记录
        </div>
      )}
    </div>
  );
};

/** 网关预设颜色映射 */
const GATEWAY_COLORS = [
  "hsl(250, 80%, 60%)",
  "hsl(190, 80%, 50%)",
  "hsl(330, 70%, 55%)",
  "hsl(30, 85%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(0, 70%, 55%)",
];

const UsageStatsPanel: React.FC = () => {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const { profiles } = useGatewayStore();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await window.electronAPI.usage.getStats();
      setStats({
        totalTokens: data.totalTokens ?? 0,
        totalRequests: data.totalRequests ?? 0,
        dailyStats: data.dailyStats ?? [],
        gatewayStats: data.gatewayStats ?? {},
      });
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
    setStatsLoading(false);
  };

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground/50">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  // 从实际网关配置生成选项卡，每个配置对应一个选项卡
  const tabItems = profiles.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: GATEWAY_COLORS[i % GATEWAY_COLORS.length],
    record: (stats.gatewayStats || {})[p.id] || {
      gatewayId: p.id,
      gatewayName: p.name,
      totalTokens: 0,
      totalRequests: 0,
      dailyStats: [],
    },
  }));

  const selectedTab = tabItems.find((t) => t.id === activeTab);

  // 当活跃 tab 对应的网关被删除时，切回总览
  if (activeTab !== "overview" && !tabItems.some((t) => t.id === activeTab)) {
    setActiveTab("overview");
  }

  return (
    <div className="space-y-4">
      {/* 概要卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="总 Token 消耗"
          value={stats.totalTokens.toLocaleString()}
          sub={`${tabItems.length} 个网关配置`}
          icon={<Fuel className="h-5 w-5" />}
        />
        <StatCard
          label="总请求数"
          value={stats.totalRequests.toLocaleString()}
          sub={stats.totalRequests > 0 ? `平均 ${(stats.totalTokens / stats.totalRequests).toFixed(0)} tokens/次` : undefined}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatCard
          label="活跃天数"
          value={stats.dailyStats.length.toString()}
          sub="有使用记录的天数"
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      {/* Tab 切换栏 */}
      <div className="flex gap-1 overflow-x-auto border-b border-border/30 pb-1">
        <button
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-lg transition-colors border-b-2 ${
            activeTab === "overview"
              ? "border-primary text-primary font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("overview")}
        >
          <PieChart className="h-3.5 w-3.5" />
          总览
        </button>
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs rounded-t-lg transition-colors border-b-2 ${
              activeTab === tab.id
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: tab.color }}
            />
            {tab.name}
          </button>
        ))}
      </div>

      {/* 总览面板 */}
      {activeTab === "overview" && (
        <StatsView
          totalTokens={stats.totalTokens}
          totalRequests={stats.totalRequests}
          dailyStats={stats.dailyStats}
        />
      )}

      {/* 单个网关面板 */}
      {selectedTab && (
        <StatsView
          totalTokens={selectedTab.record.totalTokens}
          totalRequests={selectedTab.record.totalRequests}
          dailyStats={selectedTab.record.dailyStats}
          accentColor={selectedTab.color}
        />
      )}

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between pt-2 border-t border-border/20">
        <span className="text-[10px] text-muted-foreground/40">
          {activeTab === "overview"
            ? `共 ${tabItems.length} 个网关配置`
            : `网关: ${selectedTab?.name || ""}`}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={loadStats}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          刷新
        </Button>
      </div>
    </div>
  );
};

// ========================
// 高级设置 - 外观设置
// ========================

const AppearanceSection: React.FC = () => {
  const { theme, toggleTheme, fontSize, setFontSize } = useAppStore();

  const FONT_SIZES = [
    { value: 12, label: "小" },
    { value: 14, label: "中" },
    { value: 16, label: "大" },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Settings className="h-4 w-4 text-muted-foreground" />
        外观设置
      </h3>

      {/* 主题模式 */}
      <div className="rounded-xl border border-border/40 bg-card/40 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              theme === "dark" ? "bg-indigo-500/10 text-indigo-400" : "bg-amber-500/10 text-amber-500",
            )}>
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">主题模式</p>
              <p className="text-[11px] text-muted-foreground">
                {theme === "dark" ? "深色模式" : "浅色模式"}
              </p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className={cn(
              "relative h-7 w-14 rounded-full transition-colors duration-300",
              theme === "dark"
                ? "bg-indigo-500/20 border border-indigo-500/30"
                : "bg-amber-100 border border-amber-300",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-300 flex items-center justify-center",
                theme === "dark" ? "left-1 bg-indigo-500" : "left-8 bg-amber-500",
              )}
            >
              {theme === "dark"
                ? <Moon className="h-3 w-3 text-white" />
                : <Sun className="h-3 w-3 text-white" />
              }
            </span>
          </button>
        </div>
      </div>

      {/* 字体大小 */}
      <div className="rounded-xl border border-border/40 bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Type className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">字体大小</p>
              <p className="text-[11px] text-muted-foreground">当前 {fontSize}px</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {FONT_SIZES.map((item) => (
            <button
              key={item.value}
              onClick={() => setFontSize(item.value)}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-medium transition-all border",
                fontSize === item.value
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted/30 border-border/30 text-muted-foreground hover:bg-muted/50",
              )}
            >
              <span style={{ fontSize: `${item.value}px` }}>{item.label}</span>
              <span className="block text-[10px] opacity-60">{item.value}px</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ========================
// 高级设置 - 代理设置
// ========================

const PROXY_PROTOCOLS = [
  { value: "http", label: "HTTP" },
  { value: "https", label: "HTTPS" },
  { value: "socks5", label: "SOCKS5" },
] as const;

const ProxySection: React.FC = () => {
  const { globalProxy, setGlobalProxy } = useAppStore();
  const [enabled, setEnabled] = useState(!!globalProxy);
  const [protocol, setProtocol] = useState<ProxyConfig["protocol"]>(globalProxy?.protocol || "http");
  const [host, setHost] = useState(globalProxy?.host || "");
  const [port, setPort] = useState(globalProxy?.port ? String(globalProxy.port) : "");
  const [username, setUsername] = useState(globalProxy?.username || "");
  const [password, setPassword] = useState(globalProxy?.password || "");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSave = () => {
    if (!enabled) {
      setGlobalProxy(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
    if (!host.trim() || !port.trim()) return;

    const proxy: ProxyConfig = {
      protocol,
      host: host.trim(),
      port: Number(port),
      ...(username.trim() ? { username: username.trim(), password } : {}),
    };
    setGlobalProxy(proxy);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasChanges = (() => {
    if (!enabled && !globalProxy) return false;
    if (!enabled && globalProxy) return true;
    if (enabled && !globalProxy) return true;
    if (!globalProxy) return false;
    return (
      globalProxy.protocol !== protocol ||
      globalProxy.host !== host.trim() ||
      globalProxy.port !== Number(port) ||
      (globalProxy.username || "") !== username.trim() ||
      (globalProxy.password || "") !== password
    );
  })();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        代理设置
      </h3>

      <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-4">
        {/* 启用开关 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-muted/40 text-muted-foreground/40",
            )}>
              <Network className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">全局代理</p>
              <p className="text-[11px] text-muted-foreground">
                {enabled ? "已启用" : "已禁用"}
              </p>
            </div>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled(!enabled)} />
        </div>

        {/* 代理配置表单 */}
        {enabled && (
          <div className="space-y-3 pt-2 border-t border-border/30">
            {/* 协议选择 */}
            <div>
              <label className="text-[11px] text-muted-foreground mb-1.5 block">协议类型</label>
              <div className="flex gap-1.5">
                {PROXY_PROTOCOLS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setProtocol(p.value)}
                    className={cn(
                      "flex-1 py-1.5 rounded-md text-xs font-medium transition-all border",
                      protocol === p.value
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted/30 border-border/30 text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 主机和端口 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground mb-1.5 block">主机地址</label>
                <input
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="127.0.0.1"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1.5 block">端口</label>
                <input
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="7890"
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>

            {/* 认证信息 */}
            <details className="group">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                认证信息（可选）
              </summary>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1.5 block">用户名</label>
                  <input
                    className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                    placeholder="用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1.5 block">密码</label>
                  <input
                    type="password"
                    className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            </details>

            {/* 保存按钮 */}
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={cn(
                "w-full py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                hasChanges
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted/30 text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              {saved ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  已保存
                </>
              ) : (
                "保存代理配置"
              )}
            </button>

            {/* 测试代理按钮 */}
            <button
              onClick={async () => {
                if (!host.trim() || !port.trim()) return;
                const proxy: ProxyConfig = {
                  protocol,
                  host: host.trim(),
                  port: Number(port),
                  ...(username.trim() ? { username: username.trim(), password } : {}),
                };
                setTesting(true);
                setTestResult(null);
                try {
                  const res = await window.electronAPI?.app.testProxy(proxy);
                  if (res?.success) {
                    setTestResult({ ok: true, msg: `连接成功 · ${res.latency}ms · 出口IP: ${res.ip || "—"}` });
                  } else {
                    setTestResult({ ok: false, msg: `${res?.error || "连接失败"}` });
                  }
                } catch (err: any) {
                  setTestResult({ ok: false, msg: `测试异常: ${err.message || err}` });
                }
                setTesting(false);
              }}
              disabled={testing || !host.trim() || !port.trim()}
              className={cn(
                "w-full py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border",
                testResult?.ok
                  ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-500"
                  : testResult && !testResult.ok
                    ? "bg-red-500/5 border-red-500/20 text-red-500"
                    : "bg-muted/20 border-border/30 text-muted-foreground hover:bg-muted/40",
              )}
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  测试中...
                </>
              ) : testResult ? (
                <>
                  {testResult.ok
                    ? <Check className="h-3.5 w-3.5" />
                    : <X className="h-3.5 w-3.5" />}
                  {testResult.msg}
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  测试代理连接
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ========================
// 高级设置 - 应用配置
// ========================

const AppConfigSection: React.FC = () => {
  const { autoLaunch, setAutoLaunch } = useAppStore();
  const [dataPath, setDataPath] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [cacheCleared, setCacheCleared] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    window.electronAPI?.app.getDataPath().then(setDataPath).catch(() => {});
    window.electronAPI?.app.getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const handleClearCache = async () => {
    if (!window.confirm("确定要清除所有用量统计和缓存数据？此操作不可撤销。")) return;
    setClearing(true);
    try {
      await window.electronAPI?.app.clearCache();
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    } catch { /* ignore */ }
    setClearing(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Sliders className="h-4 w-4 text-muted-foreground" />
        应用配置
      </h3>

      {/* 开机自启 */}
      <div className="rounded-xl border border-border/40 bg-card/40 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center",
              autoLaunch ? "bg-emerald-500/10 text-emerald-400" : "bg-muted/40 text-muted-foreground/40",
            )}>
              <Power className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">开机自启</p>
              <p className="text-[11px] text-muted-foreground">
                {autoLaunch ? "系统启动时自动运行" : "手动启动应用"}
              </p>
            </div>
          </div>
          <Toggle checked={autoLaunch} onChange={() => setAutoLaunch(!autoLaunch)} />
        </div>
      </div>

      {/* 数据管理 */}
      <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">数据管理</p>
            <p className="text-[11px] text-muted-foreground">
              {dataPath ? dataPath : "加载中..."}
            </p>
          </div>
        </div>
        <button
          onClick={handleClearCache}
          disabled={clearing}
          className={cn(
            "w-full py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border",
            cacheCleared
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
              : "bg-red-500/5 border-red-500/20 text-red-500 hover:bg-red-500/10",
          )}
        >
          {clearing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              清除中...
            </>
          ) : cacheCleared ? (
            <>
              <Check className="h-3.5 w-3.5" />
              已清除
            </>
          ) : (
            <>
              <Trash2 className="h-3.5 w-3.5" />
              清除用量统计与缓存
            </>
          )}
        </button>
      </div>

      {/* 关于 */}
      <div className="rounded-xl border border-border/40 bg-card/40 p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
            <Info className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">关于 MetaCode</p>
            <p className="text-[11px] text-muted-foreground">
              版本 {appVersion || "—"} · AI 代码助手 · 多模型聚合 · Agent 智能体
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========================
// 设置页面 Tab 定义
// ========================

interface SettingsTab {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  desc: string;
}

const SETTINGS_TABS: SettingsTab[] = [
  { id: "gateway", label: "网关配置", icon: Network, desc: "管理 AI 网关连接与模型分配" },
  { id: "usage", label: "用量统计", icon: BarChart3, desc: "查看 Token 与请求消耗" },
  { id: "memory", label: "记忆与上下文", icon: Brain, desc: "RAG 向量记忆与上下文管理" },
  { id: "tools", label: "工具中心", icon: Wrench, desc: "管理工具、查看调用日志" },
  { id: "skills", label: "技能中心", icon: Puzzle, desc: "预设技能与工作流" },
  { id: "plugins", label: "插件系统", icon: Plug, desc: "管理插件、权限管控" },
  { id: "agent", label: "Agent 设置", icon: Bot, desc: "智能代理与安全配置" },
  { id: "advanced", label: "高级设置", icon: Sliders, desc: "代理、主题与应用配置" },
];

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
  const { settingsInitialTab } = useAppStore();
  const [activeSettingsTab, setActiveSettingsTab] = useState(settingsInitialTab || "gateway");
  const [appVersion, setAppVersion] = useState("");

  // 当 settingsInitialTab 变化时同步（从侧边栏导航进来）
  useEffect(() => {
    if (settingsInitialTab) {
      setActiveSettingsTab(settingsInitialTab);
    }
  }, [settingsInitialTab]);
  const [isAdding, setIsAdding] = useState(false);
  const [pullingMap, setPullingMap] = useState<Record<string, boolean>>({});
  const [testingMap, setTestingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    window.electronAPI?.app.getVersion().then(setAppVersion).catch(() => {});
  }, []);

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
    <div className="h-full flex overflow-hidden" style={{ 'WebkitAppRegion': 'no-drag' } as any}>
      {/* 左侧导航 */}
      <div className="w-52 shrink-0 border-r border-border/40 bg-[hsl(var(--muted)/0.15)] flex flex-col" style={{ 'WebkitAppRegion': 'drag' } as any}>
        <div className="p-4 border-b border-border/20" style={{ 'WebkitAppRegion': 'no-drag' } as any}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sliders className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">设置</h2>
              <p className="text-[10px] text-muted-foreground/50">MetaCode {appVersion ? `v${appVersion}` : ""}</p>
            </div>
          </div>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground w-full text-xs"
            onClick={() => useAppStore.getState().setShowSettings(false)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>返回主界面</span>
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto" style={{ 'WebkitAppRegion': 'no-drag' } as any}>
          {SETTINGS_TABS.map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = activeSettingsTab === tab.id;
            // 在 "用量统计" 和 "技能管理" 之间加分隔线
            const showDivider = idx === 1;
            return (
              <div key={tab.id}>
                {showDivider && <div className="my-2 border-t border-border/20" />}
                <button
                  onClick={() => setActiveSettingsTab(tab.id)}
                  className={cn(
                    "relative flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-xs transition-all text-left group",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-accent/40",
                  )}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
                  )}
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-muted/40 text-muted-foreground/60 group-hover:bg-muted/60",
                  )}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs">{tab.label}</div>
                    <div className="text-[9px] text-muted-foreground/40 truncate">{tab.desc}</div>
                  </div>
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      {/* 右侧内容 — 使用 key 强制切换时重新挂载 */}
      <div key={activeSettingsTab} className="flex-1 overflow-y-auto">

        {/* ===== 网关配置 Tab ===== */}
        {activeSettingsTab === "gateway" && (
          <>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50" style={{ 'WebkitAppRegion': 'drag' } as any}>
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-lg font-semibold">网关配置</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">管理 AI 网关，分配多模型策略</p>
                  </div>
                  <Button size="sm" className="h-8 text-xs" onClick={() => setIsAdding(true)} disabled={isAdding} style={{ 'WebkitAppRegion': 'no-drag' } as any}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> 新增配置
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {activeProfile && <ActiveBanner profile={activeProfile} />}
              {isAdding && (
                <NewCard
                  onSave={async (data) => {
                    await addProfile(data);
                    setIsAdding(false);
                  }}
                  onCancel={() => setIsAdding(false)}
                />
              )}
              {profiles.length === 0 && !isAdding ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <Network className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-base font-medium text-muted-foreground mb-1">还没有网关配置</h3>
                  <p className="text-sm text-muted-foreground/60 mb-6 max-w-sm">新增一个网关配置，连接你的 AI 模型提供商</p>
                  <Button onClick={() => setIsAdding(true)}><Plus className="h-4 w-4 mr-1" /> 新增配置</Button>
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
              <div className="text-center text-xs text-muted-foreground/40 pb-4">
                MetaCode · 支持多网关配置，每个网关可分配 5 种模型角色
              </div>
            </div>
          </>
        )}

        {/* ===== 用量统计 Tab ===== */}
        {activeSettingsTab === "usage" && (
          <>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50" style={{ 'WebkitAppRegion': 'drag' } as any}>
              <div className="px-6 py-4">
                <h1 className="text-lg font-semibold">用量统计</h1>
                <p className="text-sm text-muted-foreground mt-0.5">查看各网关的 Token 与请求消耗</p>
              </div>
            </div>
            <div className="p-6">
              <UsageStatsPanel />
            </div>
          </>
        )}

        {/* ===== 记忆与上下文 Tab ===== */}
        {activeSettingsTab === "memory" && (
          <>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50" style={{ 'WebkitAppRegion': 'drag' } as any}>
              <div className="px-6 py-4">
                <h1 className="text-lg font-semibold">记忆与上下文</h1>
                <p className="text-sm text-muted-foreground mt-0.5">RAG 向量记忆、省 Token 策略与上下文管理</p>
              </div>
            </div>
            <div className="p-6">
              <MemorySettingsPanel />
            </div>
          </>
        )}

        {/* ===== 工具中心 Tab ===== */}
        {activeSettingsTab === "tools" && (
          <>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50" style={{ 'WebkitAppRegion': 'drag' } as any}>
              <div className="px-6 py-4">
                <h1 className="text-lg font-semibold">工具中心</h1>
                <p className="text-sm text-muted-foreground mt-0.5">查看所有已注册工具、开关权限、查看调用日志</p>
              </div>
            </div>
            <div className="p-6">
              <AgentToolCenter />
            </div>
          </>
        )}

        {/* ===== 技能中心 Tab ===== */}
        {activeSettingsTab === "skills" && (
          <>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50" style={{ 'WebkitAppRegion': 'drag' } as any}>
              <div className="px-6 py-4">
                <h1 className="text-lg font-semibold">技能中心</h1>
                <p className="text-sm text-muted-foreground mt-0.5">预设技能工作流、自定义编排</p>
              </div>
            </div>
            <div className="p-6">
              <AgentSkillCenter />
            </div>
          </>
        )}

        {/* ===== 插件系统 Tab ===== */}
        {activeSettingsTab === "plugins" && (
          <>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50" style={{ 'WebkitAppRegion': 'drag' } as any}>
              <div className="px-6 py-4">
                <h1 className="text-lg font-semibold">插件系统</h1>
                <p className="text-sm text-muted-foreground mt-0.5">管理插件、查看权限、启停控制</p>
              </div>
            </div>
            <div className="p-6">
              <AgentPluginMarket />
            </div>
          </>
        )}

        {/* ===== Agent 设置 Tab ===== */}
        {activeSettingsTab === "agent" && (
          <>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50" style={{ 'WebkitAppRegion': 'drag' } as any}>
              <div className="px-6 py-4">
                <h1 className="text-lg font-semibold">Agent 设置</h1>
                <p className="text-sm text-muted-foreground mt-0.5">智能代理配置与权限管控</p>
              </div>
            </div>
            <div className="p-6">
              <AgentSettingsPage />
            </div>
          </>
        )}

        {/* ===== 高级设置 Tab ===== */}
        {activeSettingsTab === "advanced" && (
          <>
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50" style={{ 'WebkitAppRegion': 'drag' } as any}>
              <div className="px-6 py-4">
                <h1 className="text-lg font-semibold">高级设置</h1>
                <p className="text-sm text-muted-foreground mt-0.5">代理、主题与应用配置</p>
              </div>
            </div>
            <div className="p-6 max-w-2xl space-y-8">
              <AppearanceSection />
              <ProxySection />
              <AppConfigSection />
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default ModelSettings;
