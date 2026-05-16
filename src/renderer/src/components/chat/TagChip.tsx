/**
 * 输入框标签组件
 * 展示已选中的 Skill / MCP / Tool / Plugin 标签
 */
import React from "react";
import { X, Zap, Server, Wrench, Puzzle } from "lucide-react";
import type { CommandItem } from "./CommandMenu";

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; bg: string }> = {
  skill: { icon: <Zap size={10} />, label: "技能", bg: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  mcp: { icon: <Server size={10} />, label: "MCP", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  tool: { icon: <Wrench size={10} />, label: "工具", bg: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  plugin: { icon: <Puzzle size={10} />, label: "插件", bg: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

interface TagChipProps {
  item: CommandItem;
  onRemove: (id: string) => void;
}

const TagChip: React.FC<TagChipProps> = ({ item, onRemove }) => {
  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.tool;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.bg} transition-colors shrink-0`}
    >
      {cfg.icon}
      <span className="text-muted-foreground/30 text-[9px]">{cfg.label}</span>
      <span className="text-foreground/80">{item.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
        className="ml-0.5 p-0.5 rounded-sm hover:bg-foreground/10 text-muted-foreground/40 hover:text-foreground/70 transition-colors"
      >
        <X size={10} />
      </button>
    </span>
  );
};

interface TagBarProps {
  tags: CommandItem[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

/** 标签栏：展示在输入框上方 */
const TagBar: React.FC<TagBarProps> = ({ tags, onRemove, onClearAll }) => {
  if (tags.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 px-1 flex-wrap">
      {tags.map((tag) => (
        <TagChip key={`${tag.type}-${tag.id}`} item={tag} onRemove={onRemove} />
      ))}
      {tags.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-[10px] text-muted-foreground/40 hover:text-red-400 transition-colors ml-1"
        >
          清除全部
        </button>
      )}
    </div>
  );
};

export { TagChip, TagBar, TYPE_CONFIG };
export type { CommandItem };
