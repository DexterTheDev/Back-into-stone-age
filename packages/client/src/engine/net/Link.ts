/** Transport abstraction: a Web Worker in solo, a WebSocket in co-op. Everything above is identical. */
import { PROTOCOL_VERSION, decodeSnapshot, type ClientMsg, type SaveData, type ServerEvent, type Snapshot } from '@dino/shared';

export interface Link {
  send(m: ClientMsg): void;
  onEvent: (e: ServerEvent) => void;
  onSnapshot: (s: Snapshot) => void;
  onClose: (reason: string) => void;
  close(): void;
}

export class WorkerLink implements Link {
  onEvent: Link['onEvent'] = () => {};
  onSnapshot: Link['onSnapshot'] = () => {};
  onClose: Link['onClose'] = () => {};
  private worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  ready: Promise<void>;
  constructor(name: string, character: number, save?: SaveData) {
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (ev: MessageEvent) => {
        const d = ev.data;
        if (d === 'ready') { this.worker.postMessage({ t: 'hello', name, character, version: PROTOCOL_VERSION, save }); resolve(); return; }
        if (d instanceof ArrayBuffer) this.onSnapshot(decodeSnapshot(d));
        else this.onEvent(d as ServerEvent);
      };
      this.worker.onerror = (e) => { console.error('sim worker', e.message); reject(new Error(e.message)); };
    });
  }
  send(m: ClientMsg) { this.worker.postMessage(m); }
  close() { this.worker.terminate(); }
}

export class SocketLink implements Link {
  onEvent: Link['onEvent'] = () => {};
  onSnapshot: Link['onSnapshot'] = () => {};
  onClose: Link['onClose'] = () => {};
  code = '';
  private ws: WebSocket;
  ready: Promise<void>;
  constructor(url: string, party: string | null, name: string, character: number, save?: SaveData) {
    this.ws = new WebSocket(`${url}${party ? `?party=${party}` : ''}`);
    this.ws.binaryType = 'arraybuffer';
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => this.send({ t: 'hello', name, character, version: PROTOCOL_VERSION, save });
      this.ws.onerror = () => reject(new Error('Could not reach the game server'));
      this.ws.onclose = (e) => { reject(new Error(e.reason || 'Connection closed')); this.onClose(e.reason || 'Connection lost'); };
      this.ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') { this.onSnapshot(decodeSnapshot(ev.data as ArrayBuffer)); return; }
        const m = JSON.parse(ev.data);
        if (m.t === 'party') { this.code = m.code; resolve(); return; }
        this.onEvent(m as ServerEvent);
      };
    });
  }
  send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  close() { this.ws.close(); }
}
