/**
 * Expose Tunnel Manager — NC-SENS-008
 * Base: arXiv:2512.09458 (Agentic AI Architectures)
 */

export interface TunnelInfo {
  port: number;
  url: string;
  active: boolean;
  createdAt: Date;
}

export interface TunnelStatus {
  port: number;
  active: boolean;
  url?: string;
}

export class ExposeTunnelManager {
  private tunnels = new Map<number, TunnelInfo>();

  async openTunnel(port: number): Promise<TunnelInfo> {
    const info: TunnelInfo = {
      port,
      url: `https://tunnel-${port}.localhost.run`,
      active: true,
      createdAt: new Date(),
    };
    this.tunnels.set(port, info);
    return info;
  }

  async closeTunnel(port: number): Promise<void> {
    this.tunnels.delete(port);
  }

  listTunnels(): TunnelInfo[] {
    return Array.from(this.tunnels.values());
  }

  async getTunnelStatus(port: number): Promise<TunnelStatus> {
    const tunnel = this.tunnels.get(port);
    if (!tunnel) {
      return { port, active: false };
    }
    return { port, active: tunnel.active, url: tunnel.url };
  }
}

export const exposeTunnelManager = new ExposeTunnelManager();
