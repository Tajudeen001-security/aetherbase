/**
 * KotahBase SDK v0.2
 */

export interface KotahClientOptions {
  url: string;
  apiKey?: string;
}

export class KotahClient {
  private url: string;
  private apiKey: string;
  private accessToken: string | null = null;
  private ws: WebSocket | null = null;
  private channels: Map<string, Set<(payload: any) => void>> = new Map();

  constructor(options: KotahClientOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.apiKey = options.apiKey || "";
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as any || {})
    };
    if (this.apiKey) headers["apikey"] = this.apiKey;
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;

    const res = await fetch(`${this.url}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: data.error || data.message || "Request failed" };
    return { data, error: null };
  }

  // ========== AUTH ==========
  auth = {
    signUp: async (email: string, password: string) => {
      return this.request("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password }) });
    },
    verifyCode: async (email: string, code: string) => {
      const result = await this.request("/auth/v1/verify", { method: "POST", body: JSON.stringify({ email, code }) });
      if (result.data?.access_token) this.accessToken = result.data.access_token;
      return result;
    },
    login: async (email: string, password: string) => {
      const result = await this.request("/auth/v1/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (result.data?.access_token) this.accessToken = result.data.access_token;
      return result;
    },
    signOut: async () => { this.accessToken = null; this.disconnectRealtime(); return { error: null }; },
    getUser: async () => this.request("/auth/v1/user"),
    getSession: () => this.accessToken ? { access_token: this.accessToken } : null,
    setToken: (token: string) => { this.accessToken = token; }
  };

  // ========== PROJECTS ==========
  projects = {
    create: async (name: string, password: string) => this.request("/projects", { method: "POST", body: JSON.stringify({ name, password }) }),
    list: async () => this.request("/projects")
  };

  // ========== DATABASE ==========
  from(table: string) {
    return {
      select: async () => this.request(`/rest/v1/${table}`),
      insert: async (data: any) => this.request(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(data) })
    };
  }

  // ========== STORAGE ==========
  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: Blob) => {
        const res = await fetch(`${this.url}/storage/v1/object/${bucket}/${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": file.type || "application/octet-stream"
          },
          body: file
        });
        return res.json();
      },
      getPublicUrl: (path: string) => `${this.url}/storage/v1/object/${bucket}/${path}`
    })
  };

  // ========== REALTIME ==========
  private connectRealtime() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    const wsUrl = this.url.replace(/^http/, "ws") + "/realtime/v1";
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      if (this.accessToken) {
        this.ws?.send(JSON.stringify({ type: "auth", token: this.accessToken }));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.room && this.channels.has(msg.room)) {
          this.channels.get(msg.room)?.forEach(cb => cb(msg));
        }
        // also global listeners if needed
      } catch {}
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connectRealtime(), 3000); // auto reconnect
    };
  }

  channel(room: string) {
    this.connectRealtime();

    if (!this.channels.has(room)) this.channels.set(room, new Set());

    const channel = {
      on: (event: string, callback: (payload: any) => void) => {
        this.channels.get(room)?.add(callback);
        return channel;
      },
      subscribe: () => {
        this.ws?.send(JSON.stringify({ type: "join", room }));
        return channel;
      },
      unsubscribe: () => {
        this.ws?.send(JSON.stringify({ type: "leave", room }));
        this.channels.delete(room);
      },
      send: (payload: any) => {
        this.ws?.send(JSON.stringify({ type: "broadcast", room, payload }));
      }
    };

    return channel;
  }

  disconnectRealtime() {
    this.ws?.close();
    this.ws = null;
    this.channels.clear();
  }
}

export default KotahClient;
