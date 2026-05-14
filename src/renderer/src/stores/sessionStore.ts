/**
 * MetaCode  会话状态管理
 */
import { create } from "zustand";
import { useAppStore } from "./appStore";

interface SessionStore {
  /** 所有会话 */
  sessions: SessionData[];
  /** 当前激活的会话 ID */
  activeSessionId: string | null;
  /** 是否已初始化 */
  initialized: boolean;

  /** 加载会话 */
  loadSessions: () => Promise<void>;
  /** 创建新会话 */
  createSession: (title?: string) => Promise<SessionData | null>;
  /** 基于当前项目创建新会话 */
  createSessionForProject: () => Promise<SessionData | null>;
  /** 删除会话 */
  deleteSession: (sessionId: string) => Promise<void>;
  /** 归档会话 */
  archiveSession: (sessionId: string) => Promise<void>;
  /** 设置激活会话 */
  setActiveSession: (sessionId: string) => Promise<void>;
  /** 获取当前激活的会话 */
  getActiveSession: () => SessionData | undefined;
  /** 添加消息到会话 */
  addMessage: (
    sessionId: string,
    message: Omit<ChatMessage, "id" | "timestamp">,
  ) => Promise<void>;
  /** 更新会话元数据（持久化） */
  updateSession: (
    sessionId: string,
    updates: Partial<SessionData>,
  ) => Promise<void>;
  /** 更新指定消息的内容（流式输出用） */
  updateMessageContent: (
    sessionId: string,
    messageId: string,
    content: string,
  ) => void;
  /** 追加消息内容（流式输出用） */
  appendMessageContent: (
    sessionId: string,
    messageId: string,
    text: string,
  ) => void;
  /** 更新消息的工具调用（流式输出用） */
  updateMessageToolCalls: (
    sessionId: string,
    messageId: string,
    toolCalls: ToolCallResult[],
  ) => void;
  /** 获取未归档的会话 */
  getActiveSessions: () => SessionData[];
  /** 获取已归档的会话 */
  getArchivedSessions: () => SessionData[];
  /** 获取指定项目的会话 */
  getSessionsByProject: (projectPath: string) => SessionData[];
  /** 获取所有项目分组 */
  getProjectGroups: () => Map<string, SessionData[]>;
}

/**
 * 会话状态 Store
 */
export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  initialized: false,

  loadSessions: async () => {
    try {
      const sessions = await window.electronAPI.sessions.getAll();
      const activeSession = await window.electronAPI.sessions.getActive();
      const activeId = activeSession?.id || (sessions.length > 0 ? sessions[0].id : null);
      // 持久化 fallback 的 activeSessionId（如首次启动时无活跃会话）
      if (activeId && !activeSession?.id) {
        await window.electronAPI.sessions.setActive(activeId);
      }
      set({
        sessions,
        activeSessionId: activeId,
        initialized: true,
      });
    } catch (error) {
      console.error("[SessionStore] Failed to load sessions:", error);
    }
  },

  createSession: async (title) => {
    try {
      const { currentProjectPath } = useAppStore.getState();
      const session: SessionData = {
        id: `session_${Date.now()}`,
        title: title || `新会话 ${new Date().toLocaleTimeString()}`,
        projectPath: currentProjectPath || undefined,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = await window.electronAPI.sessions.create(session);
      if (result.success && result.data) {
        // 持久化 activeSessionId，确保重启后能正确恢复
        await window.electronAPI.sessions.setActive(result.data.id);
        set((state) => ({
          sessions: [...state.sessions, result.data!],
          activeSessionId: result.data!.id,
        }));
        return result.data;
      }
      return null;
    } catch (error) {
      console.error("[SessionStore] Failed to create session:", error);
      return null;
    }
  },

  /** 基于当前项目创建新会话 */
  createSessionForProject: async () => {
    try {
      const { currentProjectPath } = useAppStore.getState();
      const projectName = currentProjectPath
        ? currentProjectPath.split(/[/\\]/).pop() || "未知项目"
        : "未关联项目";
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const session: SessionData = {
        id: `session_${Date.now()}`,
        title: `${projectName} ${timeStr}`,
        projectPath: currentProjectPath || undefined,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = await window.electronAPI.sessions.create(session);
      if (result.success && result.data) {
        await window.electronAPI.sessions.setActive(result.data.id);
        set((state) => ({
          sessions: [...state.sessions, result.data!],
          activeSessionId: result.data!.id,
        }));
        return result.data;
      }
      return null;
    } catch (error) {
      console.error("[SessionStore] Failed to create project session:", error);
      return null;
    }
  },

  deleteSession: async (sessionId) => {
    try {
      await window.electronAPI.sessions.delete(sessionId);
      set((state) => {
        const newSessions = state.sessions.filter((s) => s.id !== sessionId);
        const newActiveId =
          state.activeSessionId === sessionId
            ? newSessions.length > 0
              ? newSessions[0].id
              : null
            : state.activeSessionId;
        return {
          sessions: newSessions,
          activeSessionId: newActiveId,
        };
      });
    } catch (error) {
      console.error("[SessionStore] Failed to delete session:", error);
    }
  },

  archiveSession: async (sessionId) => {
    try {
      await window.electronAPI.sessions.archive(sessionId);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, archived: true } : s,
        ),
      }));
    } catch (error) {
      console.error("[SessionStore] Failed to archive session:", error);
    }
  },

  setActiveSession: async (sessionId) => {
    try {
      await window.electronAPI.sessions.setActive(sessionId);
      set({ activeSessionId: sessionId });
    } catch (error) {
      console.error("[SessionStore] Failed to set active session:", error);
    }
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId);
  },

  addMessage: async (sessionId, messageData) => {
    try {
      const message: ChatMessage = {
        ...messageData,
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
      };
      await window.electronAPI.sessions.addMessage(sessionId, message);

      // 记录旧标题，用于判断是否需要持久化更新
      const oldTitle = get().sessions.find((s) => s.id === sessionId)?.title;

      set((state) => ({
        sessions: state.sessions.map((s) => {
          if (s.id !== sessionId) return s;
          const newMessages = [...s.messages, message];
          // 自动更新标题：有新用户消息时取前 20 字 + 该消息的时间
          if (message.role === "user") {
            const msgTime = new Date(message.timestamp || Date.now());
            const timeStr = `${msgTime.getHours().toString().padStart(2, "0")}:${msgTime.getMinutes().toString().padStart(2, "0")}`;
            const preview = message.content.slice(0, 20) + (message.content.length > 20 ? "..." : "");
            return {
              ...s,
              messages: newMessages,
              title: `${preview} ${timeStr}`,
              updatedAt: new Date().toISOString(),
            };
          }
          return {
            ...s,
            messages: newMessages,
            updatedAt: new Date().toISOString(),
          };
        }),
      }));

      // 持久化标题更新
      const updatedSession = get().sessions.find((s) => s.id === sessionId);
      if (updatedSession?.title && updatedSession.title !== oldTitle) {
        window.electronAPI.sessions.update(sessionId, {
          title: updatedSession.title,
        });
      }
    } catch (error) {
      console.error("[SessionStore] Failed to add message:", error);
    }
  },

  updateSession: async (sessionId, updates) => {
    try {
      const result = await window.electronAPI.sessions.update(
        sessionId,
        updates,
      );
      if (result.success && result.data) {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? result.data! : s,
          ),
        }));
      }
    } catch (error) {
      console.error("[SessionStore] Failed to update session:", error);
    }
  },

  /** 更新指定消息的内容（流式输出用） */
  updateMessageContent: (sessionId, messageId, content) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId ? { ...m, content } : m,
              ),
            }
          : s,
      ),
    }));
  },

  /** 追加消息内容（流式输出用） */
  appendMessageContent: (sessionId, messageId, text) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId ? { ...m, content: m.content + text } : m,
              ),
            }
          : s,
      ),
    }));
  },

  /** 更新消息的工具调用 */
  updateMessageToolCalls: (sessionId, messageId, toolCalls) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.id === messageId ? { ...m, toolCalls } : m,
              ),
            }
          : s,
      ),
    }));
  },

  getActiveSessions: () => {
    return get().sessions.filter((s) => !s.archived);
  },

  getArchivedSessions: () => {
    return get().sessions.filter((s) => s.archived);
  },

  getSessionsByProject: (projectPath) => {
    return get().sessions.filter(
      (s) => s.projectPath === projectPath && !s.archived,
    );
  },

  getProjectGroups: () => {
    const groups = new Map<string, SessionData[]>();
    for (const session of get().sessions) {
      if (session.archived) continue;
      const key = session.projectPath || "__no_project__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }
    return groups;
  },
}));
