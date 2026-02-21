/**
 * MOTHER v7.0 - Universal Data Connector System
 * Enables rapid integration with external data sources
 *
 * Improvement #3 from self-audit:
 * "Desenvolver conectores universais que permitam a integração rápida e eficiente com novas bases de dados"
 */

export interface DataSource {
  id: string;
  name: string;
  type: "rest" | "graphql" | "database" | "file" | "stream";
  config: Record<string, unknown>;
}

export interface ConnectorConfig {
  url?: string;
  headers?: Record<string, string>;
  auth?: {
    type: "bearer" | "basic" | "apikey";
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
  };
  timeout?: number;
  retries?: number;
}

export interface ConnectorResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    responseTime: number;
    statusCode?: number;
    cached?: boolean;
  };
}

/**
 * Base connector class
 * All connectors extend this
 */
export abstract class BaseConnector {
  protected config: ConnectorConfig;
  protected name: string;

  constructor(name: string, config: ConnectorConfig) {
    this.name = name;
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config,
    };
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract query<T = unknown>(
    query: string | Record<string, unknown>
  ): Promise<ConnectorResponse<T>>;

  protected async retry<T>(
    fn: () => Promise<T>,
    retries: number = this.config.retries || 3
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.retry(fn, retries - 1);
      }
      throw error;
    }
  }
}

/**
 * REST API Connector
 */
export class RESTConnector extends BaseConnector {
  async connect(): Promise<boolean> {
    if (!this.config.url) {
      throw new Error("URL is required for REST connector");
    }

    try {
      const response = await fetch(this.config.url, {
        method: "HEAD",
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // REST is stateless, nothing to disconnect
  }

  async query<T = unknown>(options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    path?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  }): Promise<ConnectorResponse<T>> {
    const startTime = Date.now();

    try {
      const url = new URL(options.path || "", this.config.url);

      if (options.params) {
        Object.entries(options.params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      const response = await this.retry(async () => {
        return await fetch(url.toString(), {
          method: options.method || "GET",
          headers: this.buildHeaders(),
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.config.timeout || 30000),
        });
      });

      const data = (await response.json()) as T;
      const responseTime = Date.now() - startTime;

      return {
        success: response.ok,
        data,
        metadata: {
          responseTime,
          statusCode: response.status,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          responseTime,
        },
      };
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.headers,
    };

    if (this.config.auth) {
      switch (this.config.auth.type) {
        case "bearer":
          if (this.config.auth.token) {
            headers["Authorization"] = `Bearer ${this.config.auth.token}`;
          }
          break;
        case "apikey":
          if (this.config.auth.apiKey) {
            headers["X-API-Key"] = this.config.auth.apiKey;
          }
          break;
        case "basic":
          if (this.config.auth.username && this.config.auth.password) {
            const credentials = Buffer.from(
              `${this.config.auth.username}:${this.config.auth.password}`
            ).toString("base64");
            headers["Authorization"] = `Basic ${credentials}`;
          }
          break;
      }
    }

    return headers;
  }
}

/**
 * GraphQL Connector
 */
export class GraphQLConnector extends BaseConnector {
  async connect(): Promise<boolean> {
    if (!this.config.url) {
      throw new Error("URL is required for GraphQL connector");
    }

    try {
      // Test with introspection query
      const response = await this.query("{ __schema { queryType { name } } }");
      return response.success;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // GraphQL is stateless, nothing to disconnect
  }

  async query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<ConnectorResponse<T>> {
    const startTime = Date.now();

    try {
      const response = await this.retry(async () => {
        return await fetch(this.config.url!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...this.config.headers,
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(this.config.timeout || 30000),
        });
      });

      const result = await response.json();
      const responseTime = Date.now() - startTime;

      if (result.errors) {
        return {
          success: false,
          error: result.errors
            .map((e: { message: string }) => e.message)
            .join(", "),
          metadata: {
            responseTime,
            statusCode: response.status,
          },
        };
      }

      return {
        success: true,
        data: result.data as T,
        metadata: {
          responseTime,
          statusCode: response.status,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          responseTime,
        },
      };
    }
  }
}

/**
 * Connector Registry
 * Manages all data source connectors
 */
export class ConnectorRegistry {
  private connectors: Map<string, BaseConnector>;

  constructor() {
    this.connectors = new Map();
  }

  /**
   * Register a new connector
   */
  register(id: string, connector: BaseConnector): void {
    this.connectors.set(id, connector);
  }

  /**
   * Get a connector by ID
   */
  get(id: string): BaseConnector | undefined {
    return this.connectors.get(id);
  }

  /**
   * Remove a connector
   */
  async unregister(id: string): Promise<void> {
    const connector = this.connectors.get(id);
    if (connector) {
      await connector.disconnect();
      this.connectors.delete(id);
    }
  }

  /**
   * List all registered connectors
   */
  list(): string[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Test all connectors
   */
  async testAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, connector] of Array.from(this.connectors.entries())) {
      try {
        results[id] = await connector.connect();
      } catch {
        results[id] = false;
      }
    }

    return results;
  }
}

/**
 * Global connector registry
 */
export const globalConnectorRegistry = new ConnectorRegistry();

/**
 * Helper function to create REST connector
 */
export function createRESTConnector(
  id: string,
  config: ConnectorConfig
): RESTConnector {
  const connector = new RESTConnector(id, config);
  globalConnectorRegistry.register(id, connector);
  return connector;
}

/**
 * Helper function to create GraphQL connector
 */
export function createGraphQLConnector(
  id: string,
  config: ConnectorConfig
): GraphQLConnector {
  const connector = new GraphQLConnector(id, config);
  globalConnectorRegistry.register(id, connector);
  return connector;
}
