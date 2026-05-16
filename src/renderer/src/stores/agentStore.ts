/**
 * MetaCode Agent 系统 UI 状态管理
 */

import { create } from "zustand";

/** Agent 系统面板类型 */
export type AgentPanel = "tools" | "skills" | "plugins" | "agent-settings" | null;

/** Agent 系统状态 */
interface AgentUIState {
  activePanel: AgentPanel;
  tools: any[];
  builtinTools: any[];
  skills: any[];
  plugins: any[];
  toolLogs: any[];
  config: { agent: any } | null;
  systemStatus: { ready: boolean; serverCount?: number; toolCount?: number; builtinToolCount?: number; skillCount?: number; pluginCount?: number; agentEngine?: string };
  loading: boolean;
  initialized: boolean;

  setActivePanel: (panel: AgentPanel) => void;
  setTools: (tools: any[]) => void;
  setBuiltinTools: (tools: any[]) => void;
  setSkills: (skills: any[]) => void;
  setPlugins: (plugins: any[]) => void;
  setToolLogs: (logs: any[]) => void;
  setConfig: (config: { agent: any } | null) => void;
  setSystemStatus: (status: any) => void;
  setLoading: (loading: boolean) => void;

  /** 从主进程刷新所有数据 */
  refreshAll: () => Promise<void>;
}

export const useAgentStore = create<AgentUIState>((set, get) => ({
  activePanel: null,
  tools: [],
  builtinTools: [],
  skills: [],
  plugins: [],
  toolLogs: [],
  config: null,
  systemStatus: { ready: false },
  loading: false,
  initialized: false,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setTools: (tools) => set({ tools }),
  setBuiltinTools: (builtinTools) => set({ builtinTools }),
  setSkills: (skills) => set({ skills }),
  setPlugins: (plugins) => set({ plugins }),
  setToolLogs: (toolLogs) => set({ toolLogs }),
  setConfig: (config) => set({ config }),
  setSystemStatus: (systemStatus) => set({ systemStatus }),
  setLoading: (loading) => set({ loading }),

  refreshAll: async () => {
    if (!window.electronAPI?.agentV2) {
      console.warn("[AgentStore] electronAPI.agentV2 不可用");
      return;
    }
    set({ loading: true });
    try {
      // 先触发磁盘同步，再读取最新数据
      await window.electronAPI.agentV2.refreshSkills().catch(() => {});

      const [tools, builtinTools, skills, plugins, logs, config, status] = await Promise.all([
        window.electronAPI.agentV2.getTools().catch(e => { console.error("[AgentStore] getTools 失败:", e); return []; }),
        window.electronAPI.agentV2.getBuiltinTools().catch(e => { console.error("[AgentStore] getBuiltinTools 失败:", e); return []; }),
        window.electronAPI.agentV2.getSkills().catch(e => { console.error("[AgentStore] getSkills 失败:", e); return []; }),
        window.electronAPI.agentV2.getPlugins().catch(e => { console.error("[AgentStore] getPlugins 失败:", e); return []; }),
        window.electronAPI.agentV2.getToolLogs().catch(e => { console.error("[AgentStore] getToolLogs 失败:", e); return []; }),
        window.electronAPI.agentV2.getConfig().catch(e => { console.error("[AgentStore] getConfig 失败:", e); return null; }),
        window.electronAPI.agentV2.getStatus().catch(e => { console.error("[AgentStore] getStatus 失败:", e); return { ready: false }; }),
      ]);

      set({
        tools: Array.isArray(tools) ? tools : [],
        builtinTools: Array.isArray(builtinTools) ? builtinTools : [],
        skills: Array.isArray(skills) ? skills : [],
        plugins: Array.isArray(plugins) ? plugins : [],
        toolLogs: Array.isArray(logs) ? logs : [],
        config,
        systemStatus: status || { ready: false },
        initialized: true,
      });
    } catch (err) {
      console.error("[AgentStore] refreshAll 整体失败:", err);
    } finally {
      set({ loading: false });
    }
  },
}));
