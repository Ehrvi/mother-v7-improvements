/**
 * Pipeline — Extensible layer-based processing pipeline for MOTHER
 * Each layer can be added/removed dynamically. Applications register custom layers.
 * Supports parallel execution groups and conditional activation.
 */

import { createLogger } from '../_core/logger';

const log = createLogger('PIPELINE');

export interface PipelineRequest {
  query: string;
  response?: string;
  userId?: string;
  userEmail?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface PipelineResult {
  response?: string;
  context?: Record<string, any>;
  metadata?: Record<string, any>;
  skipped?: boolean;
  error?: string;
}

export interface LayerTrace {
  layer: string;
  group: string;
  durationMs: number;
  status: 'ok' | 'skipped' | 'error';
  detail?: string;
}

export interface PipelineLayer {
  name: string;
  group: string;          // Layers in same group run in parallel
  order: number;          // Execution order (lower = earlier)
  condition?(request: PipelineRequest): boolean;
  execute(request: PipelineRequest): Promise<PipelineResult>;
}

export interface PipelineResponse {
  response: string;
  traces: LayerTrace[];
  totalDurationMs: number;
  metadata: Record<string, any>;
}

class PipelineEngine {
  private layers: PipelineLayer[] = [];

  /**
   * Add a layer to the pipeline.
   */
  addLayer(layer: PipelineLayer): void {
    this.layers.push(layer);
    this.layers.sort((a, b) => a.order - b.order);
    log.info(`[Pipeline] Added layer '${layer.name}' (group: ${layer.group}, order: ${layer.order})`);
  }

  /**
   * Remove a layer by name.
   */
  removeLayer(name: string): void {
    this.layers = this.layers.filter(l => l.name !== name);
    log.info(`[Pipeline] Removed layer '${name}'`);
  }

  /**
   * Get all registered layers.
   */
  getLayers(): Array<{ name: string; group: string; order: number }> {
    return this.layers.map(l => ({ name: l.name, group: l.group, order: l.order }));
  }

  /**
   * Process a request through the pipeline.
   * Layers in the same group execute in parallel.
   * Groups execute sequentially in order.
   */
  async process(request: PipelineRequest): Promise<PipelineResponse> {
    const start = Date.now();
    const traces: LayerTrace[] = [];
    let currentRequest = { ...request };

    // Group layers by their group name, maintaining order
    const groups: Map<string, PipelineLayer[]> = new Map();
    const groupOrder: string[] = [];

    for (const layer of this.layers) {
      if (!groups.has(layer.group)) {
        groups.set(layer.group, []);
        groupOrder.push(layer.group);
      }
      groups.get(layer.group)!.push(layer);
    }

    // Execute groups sequentially, layers within groups in parallel
    for (const groupName of groupOrder) {
      const groupLayers = groups.get(groupName)!;

      // Filter layers by condition
      const activeLayers = groupLayers.filter(layer => {
        if (layer.condition && !layer.condition(currentRequest)) {
          traces.push({
            layer: layer.name,
            group: groupName,
            durationMs: 0,
            status: 'skipped',
            detail: 'condition not met',
          });
          return false;
        }
        return true;
      });

      if (activeLayers.length === 0) continue;

      // Execute all active layers in this group in parallel
      const results = await Promise.allSettled(
        activeLayers.map(async (layer) => {
          const layerStart = Date.now();
          try {
            const result = await layer.execute(currentRequest);
            traces.push({
              layer: layer.name,
              group: groupName,
              durationMs: Date.now() - layerStart,
              status: result.skipped ? 'skipped' : 'ok',
              detail: result.skipped ? 'layer skipped internally' : undefined,
            });
            return result;
          } catch (err) {
            traces.push({
              layer: layer.name,
              group: groupName,
              durationMs: Date.now() - layerStart,
              status: 'error',
              detail: (err as Error).message,
            });
            return { error: (err as Error).message } as PipelineResult;
          }
        })
      );

      // Merge results into current request
      for (const result of results) {
        if (result.status === 'fulfilled' && !result.value.error) {
          if (result.value.response) {
            currentRequest.response = result.value.response;
          }
          if (result.value.context) {
            currentRequest.context = { ...currentRequest.context, ...result.value.context };
          }
          if (result.value.metadata) {
            currentRequest.metadata = { ...currentRequest.metadata, ...result.value.metadata };
          }
        }
      }
    }

    return {
      response: currentRequest.response || '',
      traces,
      totalDurationMs: Date.now() - start,
      metadata: currentRequest.metadata || {},
    };
  }
}

// Singleton instance
export const pipeline = new PipelineEngine();
