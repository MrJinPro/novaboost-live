import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { Logger } from "../../lib/logger.js";
import type { TrackingSnapshot } from "../../repositories/tracking-repository.js";

type ClientState = {
  socket: WebSocket;
  streamerIds: Set<string> | null;
};

export class TrackingSocketHub {
  private readonly clients = new Set<ClientState>();
  private readonly server: WebSocketServer;

  constructor(httpServer: HttpServer, private readonly logger: Logger) {
    this.server = new WebSocketServer({ server: httpServer, path: "/ws/tracking" });
    this.server.on("connection", (socket) => this.handleConnection(socket));
  }

  getHealth() {
    return {
      service: "tracking-ws",
      status: "ready",
      clients: this.clients.size,
      path: "/ws/tracking",
    };
  }

  broadcastSnapshots(snapshots: TrackingSnapshot[]) {
    if (snapshots.length === 0) {
      return;
    }

    for (const client of this.clients) {
      const visible = client.streamerIds
        ? snapshots.filter((snapshot) => client.streamerIds?.has(snapshot.streamerId))
        : snapshots;

      if (visible.length === 0) {
        continue;
      }

      client.socket.send(JSON.stringify({
        type: "tracking.snapshot",
        snapshots: visible,
      }));
    }
  }

  close() {
    this.server.close();
    this.clients.clear();
  }

  private handleConnection(socket: WebSocket) {
    const client: ClientState = {
      socket,
      streamerIds: null,
    };

    this.clients.add(client);
    this.logger.info("Tracking WS client connected", { clients: this.clients.size });

    socket.send(JSON.stringify({
      type: "tracking.connected",
      path: "/ws/tracking",
    }));

    socket.on("message", (raw) => {
      try {
        const payload = JSON.parse(raw.toString()) as { type?: string; streamerIds?: string[] };
        if (payload.type === "subscribe") {
          client.streamerIds = Array.isArray(payload.streamerIds)
            ? new Set(payload.streamerIds.filter(Boolean))
            : null;
          socket.send(JSON.stringify({
            type: "tracking.subscribed",
            streamerIds: client.streamerIds ? [...client.streamerIds] : [],
          }));
        }
      } catch (error) {
        this.logger.warn("Invalid WS payload for tracking hub", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    socket.on("close", () => {
      this.clients.delete(client);
      this.logger.info("Tracking WS client disconnected", { clients: this.clients.size });
    });
  }
}