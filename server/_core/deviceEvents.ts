// EventEmitter compartilhado pra publicar eventos em tempo real ao ESP
// via SSE (Server-Sent Events). Cada evento e' direcionado a um tentId.
//
// Tipos de evento atuais:
//   - "alert"  — alerta novo gerado pelo alertChecker
//   - "photo"  — usuario subiu nova foto de uma planta da estufa.
//                ESP usa isso pra prefetch a foto em background, deixando
//                em cache pra exibicao instantanea quando user clicar.
//
// Uso:
//   deviceEvents.emit(`tent:${tentId}`, { type: 'photo', plantId, photoId });
//   deviceEvents.on(`tent:${tentId}`, (evt) => res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`));
//
// Importante: cada subscriber DEVE chamar off() ao desconectar pra evitar
// leak. O endpoint SSE faz isso no req.on('close').
//
// Como nao usamos Redis pub/sub (deploy single-instance hoje), o emitter
// e' in-process. Quando escalar pra multi-instance, trocar por Redis.
import { EventEmitter } from "node:events";

export interface DeviceEvent {
  type: "alert" | "photo";
  // Payload depende do tipo. Para 'alert': id, type, metric, message, etc.
  // Para 'photo': plantId, photoId (id do plantPhotos), photoDate.
  [key: string]: unknown;
}

class DeviceEventBus extends EventEmitter {
  // Aumenta limite default (10) — com varios devices conectados a uma estufa
  // (multi-tela) pode passar facilmente.
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // Helper tipado. Channel = `tent:<tentId>`.
  emitForTent(tentId: number, event: DeviceEvent): void {
    this.emit(`tent:${tentId}`, event);
  }

  onTent(tentId: number, handler: (event: DeviceEvent) => void): () => void {
    const channel = `tent:${tentId}`;
    this.on(channel, handler);
    // Retorna funcao de cleanup pra evitar leak.
    return () => this.off(channel, handler);
  }
}

export const deviceEvents = new DeviceEventBus();
