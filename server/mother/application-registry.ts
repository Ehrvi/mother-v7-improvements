/**
 * Application Registry — MOTHER as a platform hosting child applications
 * SHMS is the first child application. Future apps register here.
 * All apps share: memory, learning, quality pipeline, LLM providers
 * All apps isolate: tools, routes, domain data
 *
 * Scientific basis: Plugin architecture pattern (Fowler, PEAA 2002)
 * Vision: MOTHER as meta-system that creates, deploys and manages AI applications
 */

import { createLogger } from '../_core/logger';
import { toolRegistry, type ToolPlugin } from './tool-registry';
import { pipeline, type PipelineLayer } from './pipeline';
import type { Router as ExpressRouter } from 'express';

const log = createLogger('APP_REGISTRY');

export interface HealthStatus {
  healthy: boolean;
  uptime: number;
  lastCheck: Date;
  details?: Record<string, any>;
}

export interface MotherApplication {
  id: string;
  name: string;
  version: string;
  description: string;
  domain: string;
  toolPlugins?: ToolPlugin[];
  pipelineLayers?: PipelineLayer[];
  routes?: ExpressRouter;
  memoryNamespace: string;
  initialize(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  shutdown?(): Promise<void>;
}

class ApplicationRegistryImpl {
  private applications: Map<string, MotherApplication> = new Map();
  private startTimes: Map<string, Date> = new Map();

  async register(app: MotherApplication): Promise<void> {
    if (this.applications.has(app.id)) {
      log.warn(`[AppRegistry] Application '${app.id}' already registered, replacing`);
      await this.unregister(app.id);
    }

    try {
      await app.initialize();
      log.info(`[AppRegistry] Application '${app.id}' (${app.name} v${app.version}) initialized`);
    } catch (err) {
      log.error(`[AppRegistry] Application '${app.id}' initialization failed:`, (err as Error).message);
      throw err;
    }

    if (app.toolPlugins) {
      for (const plugin of app.toolPlugins) {
        toolRegistry.register(plugin);
      }
    }

    if (app.pipelineLayers) {
      for (const layer of app.pipelineLayers) {
        pipeline.addLayer(layer);
      }
    }

    this.applications.set(app.id, app);
    this.startTimes.set(app.id, new Date());

    const toolCount = app.toolPlugins?.reduce((n, p) => n + p.tools.length, 0) || 0;
    log.info(`[AppRegistry] '${app.id}' registered — tools: ${toolCount}, layers: ${app.pipelineLayers?.length || 0}`);
  }

  async unregister(appId: string): Promise<void> {
    const app = this.applications.get(appId);
    if (!app) return;

    if (app.shutdown) {
      try { await app.shutdown(); } catch (err) {
        log.warn(`[AppRegistry] Shutdown error for '${appId}':`, (err as Error).message);
      }
    }

    if (app.toolPlugins) {
      for (const plugin of app.toolPlugins) toolRegistry.unregister(plugin.id);
    }
    if (app.pipelineLayers) {
      for (const layer of app.pipelineLayers) pipeline.removeLayer(layer.name);
    }

    this.applications.delete(appId);
    this.startTimes.delete(appId);
    log.info(`[AppRegistry] Application '${appId}' unregistered`);
  }

  get(appId: string): MotherApplication | undefined {
    return this.applications.get(appId);
  }

  list(): Array<{ id: string; name: string; version: string; domain: string }> {
    return Array.from(this.applications.values()).map(app => ({
      id: app.id,
      name: app.name,
      version: app.version,
      domain: app.domain,
    }));
  }

  async healthCheckAll(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};
    for (const [id, app] of this.applications) {
      try {
        results[id] = await app.healthCheck();
        const startTime = this.startTimes.get(id);
        if (startTime) results[id].uptime = Date.now() - startTime.getTime();
      } catch (err) {
        results[id] = {
          healthy: false,
          uptime: 0,
          lastCheck: new Date(),
          details: { error: (err as Error).message },
        };
      }
    }
    return results;
  }

  getRoutes(): Array<{ appId: string; router: ExpressRouter }> {
    const routes: Array<{ appId: string; router: ExpressRouter }> = [];
    for (const [id, app] of this.applications) {
      if (app.routes) routes.push({ appId: id, router: app.routes });
    }
    return routes;
  }

  getStats(): {
    applicationCount: number;
    totalTools: number;
    totalPipelineLayers: number;
    applications: Array<{ id: string; name: string; version: string; domain: string }>;
  } {
    const registryStats = toolRegistry.getStats();
    const pipelineLayers = pipeline.getLayers();
    return {
      applicationCount: this.applications.size,
      totalTools: registryStats.tools,
      totalPipelineLayers: pipelineLayers.length,
      applications: this.list(),
    };
  }
}

export const applicationRegistry = new ApplicationRegistryImpl();
