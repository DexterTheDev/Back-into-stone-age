/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
declare module 'xatlasjs/dist/node/api.mjs';
declare module 'xatlasjs/dist/node/xatlas.js';
