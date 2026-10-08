/**
 * KotahBase SDK
 * Official client for apps, websites and games
 */

export interface KotahClientOptions {
  url: string;
  apiKey: string;
}

export class KotahClient {
  private url: string;
  private apiKey: string;
  private accessToken: string | null = null;

  constructor(options: KotahClientOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "apikey": this.apiKey,
      ...(options.headers as Record<string, string> || {})
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

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

  // ========== AUTH (Email only) ==========
  auth = {
    signUp: async (email: string, password: string) => {
      return this.request("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
    },

    signIn: async (email: string, password: string) => {
      const result = await this.request("/auth/v1/token", {
        method: "POST",
        body: JSON.stringify({ email, password, grant_type: "password" })
      });
      if (result.data?.access_token) {
        this.accessToken = result.data.access_token;
      }
      return result;
    },

    signInWithMagicLink: async (email: string) => {
      return this.request("/auth/v1/magiclink", {
        method: "POST",
        body: JSON.stringify({ email })
      });
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
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => ({
          async then(resolve: any) {
            const result = await self.request(`/rest/v1/${table}?${column}=eq.${value}`, {
              method: "PATCH",
              body: JSON.stringify(data)
            });
            resolve(result);
          }
        })
      }),
      delete: () => ({
        eq: (column: string, value: any) => ({
          async then(resolve: any) {
            const result = await self.request(`/rest/v1/${table}?${column}=eq.${value}`, {
              method: "DELETE"
            });
            resolve(result);
          }
        })
      })
    };
  }

  // ========== STORAGE ==========
  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: File | Blob) => {
        // Will be implemented with real multipart later
        return { data: null, error: "Upload coming soon" };
      },
      getPublicUrl: (path: string) => {
        return `${this.url}/storage/v1/object/public/${bucket}/${path}`;
      }
    })
  };

  // ========== REALTIME ==========
  channel(name: string) {
    return {
      on: (event: string, callback: (payload: any) => void) => {
        console.log(`[KotahBase] Subscribed to ${name}:${event}`);
        return this;
      },
      subscribe: () => {
        console.log(`[KotahBase] Channel ${name} subscribed`);
      }
    };
  }
}

export default KotahClient;
