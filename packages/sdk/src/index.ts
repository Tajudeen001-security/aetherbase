export interface KotahBaseOptions {
  url: string;
  apiKey?: string;
  projectId?: string;
}

export class KotahBase {
  private url: string;
  private apiKey?: string;
  private projectId?: string;
  private accessToken?: string;

  constructor(options: KotahBaseOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.projectId = options.projectId;
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as any),
    };
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;
    if (this.apiKey) headers["apikey"] = this.apiKey;

    const res = await fetch(`${this.url}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  }

  // ========== AUTH ==========
  auth = {
    signUp: async (email: string, password: string) => {
      if (this.projectId) {
        return this.request(`/auth/project/${this.projectId}/signup`, {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
      return this.request("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },

    signIn: async (email: string, password: string) => {
      const path = this.projectId
        ? `/auth/project/${this.projectId}/login`
        : "/auth/v1/login";
      const data = await this.request(path, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.access_token) this.accessToken = data.access_token;
      return data;
    },

    signInWithGoogle: () => {
      if (!this.projectId) throw new Error("projectId required for Google login");
      window.location.href = `${this.url}/auth/project/${this.projectId}/google`;
    },

    signInWithGitHub: () => {
      if (!this.projectId) throw new Error("projectId required for GitHub login");
      window.location.href = `${this.url}/auth/project/${this.projectId}/github`;
    },

    getUser: async () => {
      return this.request("/auth/v1/user");
    },

    setToken: (token: string) => {
      this.accessToken = token;
    },

    signOut: () => {
      this.accessToken = undefined;
    },
  };

  // ========== DATABASE ==========
  from(table: string) {
    const self = this;
    return {
      select: async (columns = "*") => {
        return self.request(`/rest/v1/${table}`);
      },
      insert: async (row: Record<string, any>) => {
        return self.request(`/rest/v1/${table}`, {
          method: "POST",
          body: JSON.stringify(row),
        });
      },
    };
  },

  // ========== SQL ==========
  async sql(query: string) {
    return this.request("/sql", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  }

  // ========== STORAGE ==========
  storage = {
    upload: async (path: string, file: Blob | File, contentType?: string) => {
      const headers: Record<string, string> = {};
      if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;
      if (contentType) headers["Content-Type"] = contentType;
      const res = await fetch(`${this.url}/storage/v1/object/uploads/${path}`, {
        method: "POST",
        headers,
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      return data;
    },
    list: async () => this.request("/storage/v1/list"),
  };

  // ========== FUNCTIONS ==========
  async invoke(name: string, body: any = {}) {
    return this.request(`/functions/${name}/invoke`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ========== VECTOR / AI ==========
  ai = {
    /** Store text + optional embedding vector */
    embed: async (content: string, embedding?: number[], metadata?: Record<string, any>) => {
      return this.request("/ai/embeddings", {
        method: "POST",
        body: JSON.stringify({ content, embedding, metadata }),
      });
    },

    /** Simple keyword search over stored content (vector similarity coming with pgvector) */
    search: async (query: string, limit = 10) => {
      return this.request(`/ai/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    },

    list: async (limit = 50) => {
      return this.request(`/ai/embeddings?limit=${limit}`);
    },
  };

  // ========== REALTIME ==========
  channel(room = "global") {
    const wsUrl = this.url.replace("https://", "wss://").replace("http://", "ws://") + "/realtime/v1";
    let ws: WebSocket | null = null;
    const listeners: Record<string, Function[]> = {};

    return {
      subscribe: (callback?: (msg: any) => void) => {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: "join", room }));
          listeners["open"]?.forEach((fn) => fn());
        };
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          callback?.(msg);
          listeners[msg.type]?.forEach((fn) => fn(msg));
        };
        return this;
      },
      send: (payload: any) => {
        ws?.send(JSON.stringify({ type: "broadcast", payload }));
      },
      on: (event: string, fn: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      },
      unsubscribe: () => ws?.close(),
    };
  }
}

export default KotahBase;
