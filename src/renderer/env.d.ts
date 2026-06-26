/// <reference types="vite/client" />

// Global type for the contextBridge-exposed API
// Source: src/preload/index.ts LISTEN_CHANNELS + INVOKE_CHANNELS
interface Window {
  electronAPI: {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
    on(channel: string, callback: (...args: unknown[]) => void): void;
    off(channel: string, callback: (...args: unknown[]) => void): void;
  };
}
