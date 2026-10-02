import type { FastifyInstance } from "fastify";
import type { ClientEvent, ServerEvent } from "@latex/shared";
import type { CompilerManager } from "../compiler/manager.js";

interface Client {
  send: (data: string) => void;
  projectId: string | null;
}

/** Registry klien WebSocket per project. */
export class WsHub {
  private readonly clients = new Set<Client>();

  add(client: Client): void {
    this.clients.add(client);
  }

  remove(client: Client): void {
    this.clients.delete(client);
  }

  broadcast(event: ServerEvent): void {
    let projectId: string | undefined;
    if ("projectId" in event) projectId = event.projectId;
    const payload = JSON.stringify(event);
    for (const c of this.clients) {
      if (projectId && c.projectId && c.projectId !== projectId) continue;
      try {
        c.send(payload);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function wsRoutes(
  app: FastifyInstance,
  compiler: CompilerManager,
): Promise<void> {
  const hub = new WsHub();
  compiler.onEvent((e) => hub.broadcast(e));

  app.get("/ws", { websocket: true }, (socket) => {
    const client: Client = {
      projectId: null,
      send: (data) => {
        if (socket.readyState === socket.OPEN) socket.send(data);
      },
    };
    hub.add(client);

    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientEvent;
        if (msg.type === "subscribe") client.projectId = msg.projectId;
        else if (msg.type === "unsubscribe") client.projectId = null;
      } catch {
        /* ignore invalid */
      }
    });

    socket.on("close", () => hub.remove(client));
    socket.on("error", () => hub.remove(client));

    client.send(JSON.stringify({ type: "hello" }));
  });
}
