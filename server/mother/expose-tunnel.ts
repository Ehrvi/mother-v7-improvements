/**
 * NC-SENS-008: Expose Tunnel — ngrok/cloudflared para URL pública (S-08)
 *
 * Conselho dos 6 — PHASE 4 C219 — Sensorium Coverage: 88% → 95%
 * Base científica:
 * - arXiv:2512.09458 Agentic AI Architectures: public URL exposure for webhooks
 * - ngrok API v3: https://ngrok.com/docs/api/
 * - Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
 *
 * Casos de uso:
 * - Demos SHMS para clientes (URL pública temporária)
 * - Webhooks de alertas para sistemas externos
 * - Integração com MQTT brokers externos
 * - Testes de integração com APIs externas
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================
// INTERFACES
// ============================================================

export interface TunnelConfig {
  provider: 'ngrok' | 'cloudflared' | 'auto';
  port: number;
  subdomain?: string;
  authToken?: string;
  region?: string;
}

export interface TunnelResult {
  url: string;
  provider: 'ngrok' | 'cloudflared';
  port: number;
  startedAt: Date;
  pid?: number;
}

export interface TunnelStatus {
  active: boolean;
  url?: string;
  provider?: string;
  uptime?: number;
  bytesIn?: number;
  bytesOut?: number;
  connections?: number;
}

// ============================================================
// NGROK TUNNEL MANAGER
// ============================================================

async function startNgrokTunnel(config: TunnelConfig): Promise<TunnelResult> {
  const authToken = config.authToken ?? process.env.NGROK_AUTH_TOKEN;

  // Check if ngrok is installed
  try {
    await execAsync('which ngrok');
  } catch {
    // Try to install ngrok
    try {
      await execAsync('npm install -g ngrok 2>/dev/null || true');
    } catch {
      throw new Error('ngrok not available. Install with: npm install -g ngrok');
    }
  }

  // Set auth token if provided
  if (authToken) {
    await execAsync(`ngrok config add-authtoken ${authToken}`).catch(() => {});
  }

  // Start ngrok in background
  const subdomain = config.subdomain ? `--subdomain=${config.subdomain}` : '';
  const region = config.region ? `--region=${config.region}` : '';

  const proc = exec(`ngrok http ${config.port} ${subdomain} ${region} --log=stdout --log-format=json`);
  const pid = proc.pid;

  // Wait for tunnel to be ready by polling ngrok API
  let url = '';
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch('http://localhost:4040/api/tunnels');
      if (response.ok) {
        const data = (await response.json()) as { tunnels: Array<{ public_url: string; proto: string }> };
        const httpsTunnel = data.tunnels.find((t) => t.proto === 'https');
        if (httpsTunnel) {
          url = httpsTunnel.public_url;
          break;
        }
      }
    } catch {
      // ngrok API not ready yet
    }
  }

  if (!url) {
    proc.kill();
    throw new Error('ngrok tunnel failed to start within 15 seconds');
  }

  return {
    url,
    provider: 'ngrok',
    port: config.port,
    startedAt: new Date(),
    pid,
  };
}

// ============================================================
// CLOUDFLARED TUNNEL MANAGER
// ============================================================

async function startCloudflaredTunnel(config: TunnelConfig): Promise<TunnelResult> {
  // Check if cloudflared is installed
  try {
    await execAsync('which cloudflared');
  } catch {
    // Try to install cloudflared
    try {
      await execAsync(
        'curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared && chmod +x /tmp/cloudflared && sudo mv /tmp/cloudflared /usr/local/bin/cloudflared',
      );
    } catch {
      throw new Error('cloudflared not available. Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    }
  }

  // Start cloudflared quick tunnel (no auth needed for temporary URLs)
  return new Promise((resolve, reject) => {
    let url = '';
    const proc = exec(`cloudflared tunnel --url http://localhost:${config.port} --no-autoupdate 2>&1`);

    const timeout = setTimeout(() => {
      if (!url) {
        proc.kill();
        reject(new Error('cloudflared tunnel failed to start within 30 seconds'));
      }
    }, 30000);

    proc.stdout?.on('data', (data: string) => {
      // Parse cloudflared output for URL
      const match = data.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !url) {
        url = match[0];
        clearTimeout(timeout);
        resolve({
          url,
          provider: 'cloudflared',
          port: config.port,
          startedAt: new Date(),
          pid: proc.pid,
        });
      }
    });

    proc.stderr?.on('data', (data: string) => {
      const match = data.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !url) {
        url = match[0];
        clearTimeout(timeout);
        resolve({
          url,
          provider: 'cloudflared',
          port: config.port,
          startedAt: new Date(),
          pid: proc.pid,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ============================================================
// TUNNEL MANAGER (Main Class)
// ============================================================

export class ExposeTunnelManager {
  private activeTunnels: Map<number, TunnelResult> = new Map();

  /**
   * Start a tunnel for the given port
   * Auto-selects provider based on availability
   */
  async startTunnel(config: TunnelConfig): Promise<TunnelResult> {
    // Check if tunnel already active for this port
    const existing = this.activeTunnels.get(config.port);
    if (existing) {
      console.log(`[EXPOSE-TUNNEL] Reusing existing tunnel for port ${config.port}: ${existing.url}`);
      return existing;
    }

    let result: TunnelResult;
    const provider = config.provider === 'auto' ? await this.detectProvider() : config.provider;

    try {
      if (provider === 'ngrok') {
        result = await startNgrokTunnel(config);
      } else {
        result = await startCloudflaredTunnel(config);
      }

      this.activeTunnels.set(config.port, result);
      console.log(`[EXPOSE-TUNNEL] Tunnel started: ${result.url} (${result.provider})`);
      return result;
    } catch (err) {
      // Try fallback provider
      if (provider === 'ngrok') {
        console.warn('[EXPOSE-TUNNEL] ngrok failed, trying cloudflared...');
        result = await startCloudflaredTunnel(config);
      } else {
        console.warn('[EXPOSE-TUNNEL] cloudflared failed, trying ngrok...');
        result = await startNgrokTunnel(config);
      }

      this.activeTunnels.set(config.port, result);
      console.log(`[EXPOSE-TUNNEL] Fallback tunnel started: ${result.url} (${result.provider})`);
      return result;
    }
  }

  /**
   * Stop tunnel for a port
   */
  async stopTunnel(port: number): Promise<void> {
    const tunnel = this.activeTunnels.get(port);
    if (!tunnel) return;

    if (tunnel.pid) {
      try {
        process.kill(tunnel.pid, 'SIGTERM');
      } catch {
        // Process may already be dead
      }
    }

    this.activeTunnels.delete(port);
    console.log(`[EXPOSE-TUNNEL] Tunnel stopped for port ${port}`);
  }

  /**
   * Get status of a tunnel
   */
  async getTunnelStatus(port: number): Promise<TunnelStatus> {
    const tunnel = this.activeTunnels.get(port);
    if (!tunnel) {
      return { active: false };
    }

    // Check if tunnel process is still alive
    if (tunnel.pid) {
      try {
        process.kill(tunnel.pid, 0); // Signal 0 = check if process exists
      } catch {
        this.activeTunnels.delete(port);
        return { active: false };
      }
    }

    // Get ngrok stats if available
    if (tunnel.provider === 'ngrok') {
      try {
        const response = await fetch('http://localhost:4040/api/tunnels');
        if (response.ok) {
          const data = (await response.json()) as { tunnels: Array<{ metrics?: { conns?: { count?: number }; http?: { count?: number } } }> };
          const stats = data.tunnels[0]?.metrics;
          return {
            active: true,
            url: tunnel.url,
            provider: tunnel.provider,
            uptime: Date.now() - tunnel.startedAt.getTime(),
            connections: stats?.conns?.count ?? 0,
          };
        }
      } catch {
        // ngrok API not available
      }
    }

    return {
      active: true,
      url: tunnel.url,
      provider: tunnel.provider,
      uptime: Date.now() - tunnel.startedAt.getTime(),
    };
  }

  /**
   * List all active tunnels
   */
  listTunnels(): TunnelResult[] {
    return Array.from(this.activeTunnels.values());
  }

  /**
   * Quick expose: start tunnel for default MOTHER API port
   */
  async exposeMotherAPI(): Promise<TunnelResult> {
    const port = parseInt(process.env.PORT ?? '3000');
    return this.startTunnel({
      provider: 'auto',
      port,
    });
  }

  private async detectProvider(): Promise<'ngrok' | 'cloudflared'> {
    try {
      await execAsync('which ngrok');
      return 'ngrok';
    } catch {
      return 'cloudflared';
    }
  }
}

export const exposeTunnelManager = new ExposeTunnelManager();
