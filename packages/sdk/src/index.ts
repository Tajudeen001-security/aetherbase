/**
 * KoraBase SDK
 * Official client for apps, websites and games
 */

export interface KoraClientOptions {
  url: string;
  apiKey: string;
}

export class KoraClient {
  private url: string;
  private apiKey: string;

  constructor(options: KoraClientOptions) {
    this.url = options.url;
    this.apiKey = options.apiKey;
  }

  // Auth (email only)
  auth = {
    signUp: async (email: string, password: string) => {
      // TODO: implement
      return { user: null, error: null };
    },
    signIn: async (email: string, password: string) => {
      // TODO: implement
      return { user: null, session: null, error: null };
    },
    signInWithMagicLink: async (email: string) => {
      // TODO: implement
      return { error: null };
    },
    signOut: async () => {
      // TODO: implement
    },
    getUser: async () => {
      // TODO: implement
      return { user: null };
    }
  };

  // Database
  from(table: string) {
    return {
      select: (columns = "*") => ({
        // chainable query builder - TODO
      }),
      insert: (data: any) => ({
        // TODO
      }),
      update: (data: any) => ({
        // TODO
      }),
      delete: () => ({
        // TODO
      })
    };
  }

  // Storage
  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: File | Blob) => {
        // TODO
        return { data: null, error: null };
      },
      download: async (path: string) => {
        // TODO
        return { data: null, error: null };
      },
      getPublicUrl: (path: string) => {
        return `${this.url}/storage/v1/object/public/${bucket}/${path}`;
      }
    })
  };

  // Realtime
  channel(name: string) {
    return {
      on: (event: string, callback: Function) => {
        // TODO: websocket
        return this;
      },
      subscribe: () => {
        // TODO
      }
    };
  }
}

export default KoraClient;
