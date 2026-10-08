/**
 * KotahBase SDK
 * Official client for apps, websites and games
 */

export interface KotahClientOptions {
  url: string;
  apiKey?: string;
}

export class KotahClient {
  private url: string;
  private apiKey: string;
  private accessToken: string | null = null;

  constructor(options: KotahClientOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.apiKey = options.apiKey || "";
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {})
    };

    if (this.apiKey) headers["apikey"] = this.apiKey;
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;

    const res = await fetch(`${this.url}${path}`, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { data: null, error: data.error || data.message || "Request failed" };
    }
    return { data, error: null };
  }

  // ========== AUTH (Email + 6-digit code) ==========
  auth = {
    /**
     * Step 1: Request 6-digit code
     */
    sendCode: async (email: string) => {
      return this.request("/auth/v1/otp", {
        method: "POST",
        body: JSON.stringify({ email })
      });
    },

    /**
     * Step 2: Verify 6-digit code and get session
     */
    verifyCode: async (email: string, code: string) => {
      const result = await this.request("/auth/v1/verify", {
        method: "POST",
        body: JSON.stringify({ email, code })
      });

      if (result.data?.access_token) {
        this.accessToken = result.data.access_token;
      }
      return result;
    },

    signOut: async () => {
      this.accessToken = null;
      return { error: null };
    },

    getUser: async () => {
      return this.request("/auth/v1/user");
    },

    getSession: () => {
      return this.accessToken ? { access_token: this.accessToken } : null;
    }
  };

  // ========== PROJECTS ==========
  projects = {
    create: async (name: string, password: string) => {
      return this.request("/projects", {
        method: "POST",
        body: JSON.stringify({ name, password })
      });
    },

    list: async () => {
      return this.request("/projects");
    }
  };

  // ========== DATABASE ==========
  from(table: string) {
    const self = this;
    return {
      select: (columns = "*") => ({
        async then(resolve: any) {
          const result = await self.request(`/rest/v1/${table}?select=${columns}`);
          resolve(result);
        }
      }),
      insert: (data: any) => ({
        async then(resolve: any) {
          const result = await self.request(`/rest/v1/${table}`, {
            method: "POST",
            body: JSON.stringify(data)
          });
          resolve(result);
        }
      })
    };
  }

  // ========== STORAGE ==========
  storage = {
    from: (bucket: string) => ({
      getPublicUrl: (path: string) => {
        return `${this.url}/storage/v1/object/public/${bucket}/${path}`;
      }
    })
  };

  // ========== REALTIME ==========
  channel(name: string) {
    return {
      on: (event: string, callback: (payload: any) => void) => {
        return this;
      },
      subscribe: () => {}
    };
  }
}

export default KotahClient;
