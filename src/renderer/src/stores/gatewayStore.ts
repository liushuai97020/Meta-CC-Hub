/**
 * MetaCode  网关配置状态管理
 */
import { create } from "zustand";
import { useModelStore } from "./modelStore";

interface GatewayStore {
  profiles: GatewayProfile[];
  activeProfileId: string | null;
  initialized: boolean;

  loadProfiles: () => Promise<void>;
  addProfile: (
    profile: Omit<GatewayProfile, "id" | "createdAt">,
  ) => Promise<void>;
  updateProfile: (
    profileId: string,
    updates: Partial<GatewayProfile>,
  ) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  setActiveProfile: (profileId: string) => Promise<void>;
  deactivateProfile: () => Promise<void>;
  testConnection: (
    profile: Partial<GatewayProfile>,
  ) => Promise<{ success: boolean; latency?: number; error?: string }>;
  pullModels: (
    profile: Partial<GatewayProfile>,
  ) => Promise<{ success: boolean; models?: string[]; error?: string }>;
  getActiveProfile: () => GatewayProfile | undefined;
}

export const useGatewayStore = create<GatewayStore>((set, get) => ({
  profiles: [],
  activeProfileId: null,
  initialized: false,

  loadProfiles: async () => {
    try {
      const profiles = await window.electronAPI.gateway.getAll();
      const activeProfile = await window.electronAPI.gateway.getActive();
      set({
        profiles,
        activeProfileId: activeProfile?.id || null,
        initialized: true,
      });
    } catch (error) {
      console.error("[GatewayStore] Failed to load profiles:", error);
    }
  },

  addProfile: async (profileData) => {
    try {
      const profile: GatewayProfile = {
        ...profileData,
        id: `gateway_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      const result = await window.electronAPI.gateway.add(profile);
      if (result.success && result.data) {
        set((state) => ({
          profiles: [...state.profiles, result.data!],
        }));
      }
    } catch (error) {
      console.error("[GatewayStore] Failed to add profile:", error);
      throw error;
    }
  },

  updateProfile: async (profileId, updates) => {
    try {
      const result = await window.electronAPI.gateway.update(
        profileId,
        updates,
      );
      if (result.success && result.data) {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === profileId ? result.data! : p,
          ),
        }));
      }
    } catch (error) {
      console.error("[GatewayStore] Failed to update profile:", error);
      throw error;
    }
  },

  deleteProfile: async (profileId) => {
    try {
      await window.electronAPI.gateway.delete(profileId);
      set((state) => ({
        profiles: state.profiles.filter((p) => p.id !== profileId),
        activeProfileId:
          state.activeProfileId === profileId ? null : state.activeProfileId,
      }));
    } catch (error) {
      console.error("[GatewayStore] Failed to delete profile:", error);
      throw error;
    }
  },

  setActiveProfile: async (profileId) => {
    try {
      const result = await window.electronAPI.gateway.setActive(profileId);
      if (result.success && result.data) {
        set((state) => ({
          profiles: state.profiles.map((p) => ({
            ...p,
            enabled: p.id === profileId,
          })),
          activeProfileId: profileId,
        }));
        // 同步模型 store，确保 activeModelId 即时更新
        await useModelStore.getState().loadModels();
      }
    } catch (error) {
      console.error("[GatewayStore] Failed to set active profile:", error);
      throw error;
    }
  },

  deactivateProfile: async () => {
    try {
      await window.electronAPI.gateway.deactivate();
      set((state) => ({
        profiles: state.profiles.map((p) => ({ ...p, enabled: false })),
        activeProfileId: null,
      }));
      // 同步模型 store，清除 activeModelId
      await useModelStore.getState().loadModels();
    } catch (error) {
      console.error("[GatewayStore] Failed to deactivate profile:", error);
      throw error;
    }
  },

  testConnection: async (profile) => {
    try {
      return await window.electronAPI.gateway.testConnection(profile);
    } catch (error: any) {
      return { success: false, error: String(error) };
    }
  },

  pullModels: async (profile) => {
    try {
      return await window.electronAPI.gateway.pullModels(profile);
    } catch (error: any) {
      return { success: false, error: String(error) };
    }
  },

  getActiveProfile: () => {
    const { profiles, activeProfileId } = get();
    return profiles.find((p) => p.id === activeProfileId);
  },
}));
