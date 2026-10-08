import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";

interface Client {
  id: string;
  ws: WebSocket;
  userId?: string;
  rooms: Set<string>;
  lastSeen: number;
}

const clients = new Map<string, Client>();
const rooms = new Map<string, Set<string>>(); // room -> clientIds

let clientIdCounter = 0;

export function setupRealtime(server: any) {
  const wss = new WebSocketServer({ server, path: "/realtime/v1" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const id = `client_${++clientIdCounter}_${Date.now()}`;
    const client: Client = { id, ws, rooms: new Set(), lastSeen: Date.now() };
    clients.set(id, client);

    console.log(`[Realtime] + ${id} | Total clients: ${clients.size}`);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        client.lastSeen = Date.now();

        if (msg.type === "auth" && msg.token) {
          try {
            const payload = jwt.verify(msg.token, JWT_SECRET) as any;
            client.userId = payload.sub;
            ws.send(JSON.stringify({ type: "auth", status: "ok", clientId: id }));
          } catch {
            ws.send(JSON.stringify({ type: "auth", status: "error", error: "Invalid token" }));
          }
          return;
        }

        if (msg.type === "join" && msg.room) {
          joinRoom(client, msg.room);
          return;
        }

        if (msg.type === "leave" && msg.room) {
          leaveRoom(client, msg.room);
          return;
        }

        if (msg.type === "broadcast" && msg.room && msg.payload !== undefined) {
          broadcast(msg.room, {
            type: "message",
            event: "broadcast",
            room: msg.room,
            payload: msg.payload,
            from: client.userId || client.id,
            timestamp: new Date().toISOString()
          }, id);
          return;
        }

        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          return;
        }

      } catch (err) {
        console.error("[Realtime] bad message", err);
      }
    });

    ws.on("close", () => {
      for (const room of client.rooms) leaveRoom(client, room);
      clients.delete(id);
      console.log(`[Realtime] - ${id} | Total clients: ${clients.size}`);
    });

    // heartbeat
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(interval);
      }
    }, 25000);
  });

  console.log("[Realtime] WebSocket ready → /realtime/v1");
}

function joinRoom(client: Client, room: string) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(client.id);
  client.rooms.add(room);

  client.ws.send(JSON.stringify({
    type: "joined",
    room,
    clients: rooms.get(room)!.size
  }));

  broadcast(room, {
    type: "presence",
    event: "join",
    room,
    userId: client.userId || client.id,
    clients: rooms.get(room)!.size
  }, client.id);
}

function leaveRoom(client: Client, room: string) {
  const set = rooms.get(room);
  if (!set) return;

  set.delete(client.id);
  client.rooms.delete(room);

  if (set.size === 0) {
    rooms.delete(room);
  } else {
    broadcast(room, {
      type: "presence",
      event: "leave",
      room,
      userId: client.userId || client.id,
      clients: set.size
    });
  }
}

function broadcast(room: string, message: any, excludeId?: string) {
  const set = rooms.get(room);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const clientId of set) {
    if (clientId === excludeId) continue;
    const client = clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

export function getRealtimeStats() {
  return {
    totalClients: clients.size,
    rooms: Array.from(rooms.entries()).map(([name, set]) => ({
      name,
      clients: set.size,
      clientIds: Array.from(set)
    }))
  };
}
