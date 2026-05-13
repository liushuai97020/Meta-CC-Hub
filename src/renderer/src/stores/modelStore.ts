/**
 * MetaCode  模型配置状态管理
 */
import { create } from "zustand";

interface ModelStore {
  /** 所有模型配置 */
  models: ModelConfig[];
  /** 当前激活的模型 ID */
  activeModelId: string | null;
  /** 是否已初始化 */
  initialized: boolean;

  /** 加载模型配置 */
  loadModels: () => Promise<void>;
  /** 添加模型 */
  addModel: (model: Omit<ModelConfig, "id" | "createdAt">) => Promise<void>;
  /** 更新模型 */
  updateModel: (
    modelId: string,
    updates: Partial<ModelConfig>,
  ) => Promise<void>;
  /** 删除模型 */
  deleteModel: (modelId: string) => Promise<void>;
  /** 切换激活模型 */
  setActiveModel: (modelId: string) => Promise<void>;
  /** 获取当前激活的模型 */
  getActiveModel: () => ModelConfig | undefined;
  /** 测试模型连接 */
  testConnection: (
    modelId: string,
  ) => Promise<{ success: boolean; latency?: number; error?: string }>;
}

/**
 * 模型配置状态 Store
 */
export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  activeModelId: null,
  initialized: false,

  loadModels: async () => {
    try {
      const models = await window.electronAPI.models.getAll();
      const activeModel = await window.electronAPI.models.getActive();
      set({
        models,
        activeModelId: activeModel?.id || null,
        initialized: true,
      });
    } catch (error) {
      console.error("[ModelStore] Failed to load models:", error);
    }
  },

  addModel: async (modelData) => {
    try {
      const model: ModelConfig = {
        ...modelData,
        id: `model_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      const result = await window.electronAPI.models.add(model);
      if (result.success && result.data) {
        set((state) => ({
          models: [...state.models, result.data!],
        }));
      }
    } catch (error) {
      console.error("[ModelStore] Failed to add model:", error);
      throw error;
    }
  },

  updateModel: async (modelId, updates) => {
    try {
      const result = await window.electronAPI.models.update(modelId, updates);
      if (result.success && result.data) {
        set((state) => ({
          models: state.models.map((m) =>
            m.id === modelId ? result.data! : m,
          ),
        }));
      }
    } catch (error) {
      console.error("[ModelStore] Failed to update model:", error);
      throw error;
    }
  },

  deleteModel: async (modelId) => {
    try {
      await window.electronAPI.models.delete(modelId);
      set((state) => {
        const newModels = state.models.filter((m) => m.id !== modelId);
        const newActiveId =
          state.activeModelId === modelId ? null : state.activeModelId;
        return {
          models: newModels,
          activeModelId: newActiveId,
        };
      });
    } catch (error) {
      console.error("[ModelStore] Failed to delete model:", error);
      throw error;
    }
  },

  setActiveModel: async (modelId) => {
    try {
      await window.electronAPI.models.setActive(modelId);
      set({ activeModelId: modelId });
      // models:setActive 已在主进程中初始化/切换 Agent，无需重复调用
    } catch (error) {
      console.error("[ModelStore] Failed to set active model:", error);
      throw error;
    }
  },

  getActiveModel: () => {
    const { models, activeModelId } = get();
    return models.find((m) => m.id === activeModelId);
  },

  testConnection: async (modelId) => {
    const model = get().models.find((m) => m.id === modelId);
    if (!model) return { success: false, error: "模型不存在" };

    // 设置测试中状态
    get().updateModel(modelId, { connectionStatus: "testing" });

    try {
      const result = await window.electronAPI.models.testConnection(model);
      get().updateModel(modelId, {
        connectionStatus: result.success ? "connected" : "error",
        lastTestedAt: new Date().toISOString(),
      });
      return result;
    } catch (error: any) {
      get().updateModel(modelId, {
        connectionStatus: "error",
        lastTestedAt: new Date().toISOString(),
      });
      return { success: false, error: String(error) };
    }
  },
}));
