/**
 * KotahBase SDK
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
      ...(options.headers as any || {})
    };

    if (this.apiKey) headers["apikey"] = this.apiKey;
    if (this.accessToken) headers["Authorization"] = `Bearer ${this.accessToken}`;

    const res = await fetch(`${this.url}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { data: null, error: data.error || data.message || "Request failed" };
    }
    return { data, error: null };
  }

  // ========== AUTH ==========
  auth = {
    /**
     * Sign up with Email + Password
     * Then you must verify with 6-digit code
     */
    signUp: async (email: string, password: string) => {
      return this.request("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
    },

    /**
     * Verify the 6-digit code
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

    /**
     * Login with Email + Password
     */
    login: async (email: string, password: string) => {
      const result = await this.request("/auth/v1/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (result.data?.access_token) {
        this.accessToken = result.data.access_token;
      }
      return result;
    },

    resendCode: async (email: string) => {
      return this.request("/auth/v1/resend-code", {
        method: "POST",
        body: JSON.stringify({ email })
      });
    },

    signOut: async () => {
      this.accessToken = null;
      return { error: null };
    },

    getUser: async () => this.request("/auth/v1/user"),

    getSession: () => this.accessToken ? { access_token: this.accessToken } : null
  };

  // ========== PROJECTS ==========
  projects = {
    create: async (name: string, password: string) => {
      return this.request("/projects", {
        method: "POST",
        body: JSON.stringify({ name, password })
      });
    },
    list: async () => this.request("/projects")
  };

  // ========== DATABASE & STORAGE (next) ==========
  from(table: string) {
    return {
      select: () => ({ then: async (r: any) => r(await this.request(`/rest/v1/${table}`)) }),
      insert: (data: any) => ({ then: async (r: any) => r(await this.request(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(data) })) })
    };
  }

  storage = {
    from: (bucket: string) => ({
      getPublicUrl: (path: string) => `${this.url}/storage/v1/object/public/${bucket}/${path}`
    })
  };
}

export default KotahClient;
