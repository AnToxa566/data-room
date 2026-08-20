/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Relative in every environment — see vite.config.mts and the root vercel.json. */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
