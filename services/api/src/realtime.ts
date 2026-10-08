import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "kotahbase-dev-secret-change-me";

interface Client {
  ws: WebSocket;
  userId?: string;
  rooms: Set<string>;
}

const clients = new Set<Client>();
const rooms = new Map<string, Set<Client>>(); // roomName -> clients

export function setupRealtime(server: any) {
  const wss = new WebSocketServer({ server, path: "/realtime/v1" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const client: Client = { ws, rooms: new Set() };
    clients.add(client);

    console.log(`[Realtime] Client connected. Total: ${clients.size}`);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Authenticate
        if (msg.type === "auth" && msg.token) {
          try {
            const payload = jwt.verify(msg.token, JWT_SECRET) as any;
            client.userId = payload.sub;
            ws.send(JSON.stringify({ type: "auth", status: "ok" }));
          } catch {
            ws.send(JSON.stringify({ type: "auth", status: "error", error: "Invalid token" }));
          }
          return;
        }

        // Join room
        if (msg.type === "join" && msg.room) {
          const room = msg.room;
          if (!rooms.has(room)) rooms.set(room, new Set());
          rooms.get(room)!.add(client);
          client.rooms.add(room);

          ws.send(JSON.stringify({ type: "joined", room }));
          broadcast(room, {
            type: "presence",
            event: "join",
            room,
            userId: client.userId,
            count: rooms.get(room)!.size
          }, client);
          return;
        }

        // Leave room
        if (msg.type === "leave" && msg.room) {
          leaveRoom(client, msg.room);
          return;
        }

        // Broadcast message to room
        if (msg.type === "broadcast" && msg.room && msg.payload) {
          broadcast(msg.room, {
            type: "message",
            room: msg.room,
            payload: msg.payload,
            from: client.userId,
            timestamp: new Date().toISOString()
          }, client);
          return;
        }

      } catch (err) {
        console.error("[Realtime] Invalid message", err);
      }
    });

    ws.on("close", () => {
      // Leave all rooms
      for (const room of client.rooms) {
        leaveRoom(client, room);
      }
      clients.delete(client);
      console.log(`[Realtime] Client disconnected. Total: ${clients.size}`);
    });
  });

  console.log("[Realtime] WebSocket server ready on /realtime/v1");
}

function leaveRoom(client: Client, room: string) {
  const set = rooms.get(room);
  if (set) {
    set.delete(client);
    if (set.size === 0) rooms.delete(room);
    else {
      broadcast(room, {
        type: "presence",
        event: "leave",
        room,
        userId: client.userId,
        count: set.size
      });
    }
  }
  client.rooms.delete(room);
}

function broadcast(room: string, message: any, exclude?: Client) {
  const set = rooms.get(room);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const client of set) {
    if (client !== exclude && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

export function getRealtimeStats() {
  return {
    totalClients: clients.size,
    rooms: Array.from(rooms.entries()).map(([name, set]) => ({
      name,
      clients: set.size
    }))
  };
}
