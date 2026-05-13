/// <reference types="vite/client" />

/**
 * Vite 环境变量类型声明
 */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_DEV_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
