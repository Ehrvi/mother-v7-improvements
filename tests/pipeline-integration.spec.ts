/**
 * Integration tests: application-registry, tool-registry, pipeline
 * No real LLM/DB/network calls — all external dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock the logger so we don't hit the real logger setup ──
vi.mock('../server/_core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { toolRegistry } from '../server/mother/tool-registry';
import type { ToolPlugin, ToolDefinition, ToolContext } from '../server/mother/tool-registry';
import { pipeline } from '../server/mother/pipeline';
import type { PipelineLayer, PipelineRequest } from '../server/mother/pipeline';
import { applicationRegistry } from '../server/mother/application-registry';
import type { MotherApplication } from '../server/mother/application-registry';

// ─────────────────────────────────────────────────────────────────────────────
// Shared factory helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTool(name: string): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `Mock tool ${name}`,
      parameters: { type: 'object', properties: {}, required: [] },
    },
  };
}

function makePlugin(
  id: string,
  domain: string,
  toolNames: string[],
  executeResult = { success: true, data: 'ok' },
): ToolPlugin {
  return {
    id,
    name: `Plugin ${id}`,
    domain,
    version: '1.0.0',
    tools: toolNames.map(makeTool),
    execute: vi.fn().mockResolvedValue(executeResult),
  };
}

function makeApp(
  id: string,
  plugins: ToolPlugin[] = [],
  layers: PipelineLayer[] = [],
): MotherApplication {
  return {
    id,
    name: `App ${id}`,
    version: '1.0.0',
    description: 'Test application',
    domain: 'test',
    memoryNamespace: id,
    toolPlugins: plugins,
    pipelineLayers: layers,
    initialize: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, uptime: 0, lastCheck: new Date() }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

function makeLayer(name: string, group: string, order: number): PipelineLayer & { execute: ReturnType<typeof vi.fn> } {
  return {
    name,
    group,
    order,
    execute: vi.fn().mockResolvedValue({ response: `response-from-${name}` }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup singletons between tests so tests are independent
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Drain any registered apps
  for (const entry of applicationRegistry.list()) {
    await applicationRegistry.unregister(entry.id);
  }
  // Drain any remaining pipeline layers
  for (const l of pipeline.getLayers()) {
    pipeline.removeLayer(l.name);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. tool-registry
// ─────────────────────────────────────────────────────────────────────────────

describe('tool-registry', () => {
  beforeEach(() => {
    // Unregister any plugins carried over (belt-and-suspenders)
    const stats = toolRegistry.getStats();
    // getStats gives us the domains, not IDs — use listPlugins
    for (const p of toolRegistry.listPlugins()) {
      toolRegistry.unregister(p.id);
    }
  });

  it('register() adds the plugin and its tools', () => {
    const plugin = makePlugin('p1', 'test', ['tool_a', 'tool_b']);
    toolRegistry.register(plugin);

    const stats = toolRegistry.getStats();
    expect(stats.plugins).toBeGreaterThanOrEqual(1);
    expect(stats.tools).toBeGreaterThanOrEqual(2);
  });

  it('getAllTools() returns all tools across registered plugins', () => {
    toolRegistry.register(makePlugin('pa', 'domain-a', ['alpha', 'beta']));
    toolRegistry.register(makePlugin('pb', 'domain-b', ['gamma']));

    const all = toolRegistry.getAllTools();
    const names = all.map(t => t.function.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
  });

  it('getToolsForDomain() returns only tools from the matching domain', () => {
    toolRegistry.register(makePlugin('px', 'shms', ['shms_tool']));
    toolRegistry.register(makePlugin('py', 'finance', ['finance_tool']));

    const shmsTools = toolRegistry.getToolsForDomain('shms');
    const finTools = toolRegistry.getToolsForDomain('finance');

    expect(shmsTools.map(t => t.function.name)).toContain('shms_tool');
    expect(shmsTools.map(t => t.function.name)).not.toContain('finance_tool');
    expect(finTools.map(t => t.function.name)).toContain('finance_tool');
  });

  it('execute() routes to the correct plugin', async () => {
    const executeFn = vi.fn().mockResolvedValue({ success: true, data: 'pong' });
    const plugin: ToolPlugin = { ...makePlugin('pe', 'test', ['ping']), execute: executeFn };
    toolRegistry.register(plugin);

    const ctx: ToolContext = { applicationId: 'test-app' };
    const result = await toolRegistry.execute('ping', { value: 1 }, ctx);

    expect(result.success).toBe(true);
    expect(result.data).toBe('pong');
    expect(executeFn).toHaveBeenCalledWith('ping', { value: 1 }, ctx);
  });

  it('execute() returns error result for unknown tool', async () => {
    const result = await toolRegistry.execute('no_such_tool', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('unregister() removes the plugin and its tools', () => {
    toolRegistry.register(makePlugin('pu', 'test', ['removable']));
    toolRegistry.unregister('pu');

    const all = toolRegistry.getAllTools();
    expect(all.map(t => t.function.name)).not.toContain('removable');
  });

  it('getStats() returns correct tool count', () => {
    toolRegistry.register(makePlugin('ps', 'test', ['s1', 's2', 's3']));
    const stats = toolRegistry.getStats();
    expect(stats.tools).toBeGreaterThanOrEqual(3);
    expect(stats.plugins).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe('pipeline', () => {
  it('addLayer() adds a layer and getLayers() returns it', () => {
    const layer = makeLayer('layer-one', 'grp-a', 1);
    pipeline.addLayer(layer);

    const layers = pipeline.getLayers();
    expect(layers.some(l => l.name === 'layer-one')).toBe(true);
  });

  it('removeLayer() removes by name', () => {
    pipeline.addLayer(makeLayer('to-remove', 'grp-b', 5));
    pipeline.removeLayer('to-remove');

    expect(pipeline.getLayers().some(l => l.name === 'to-remove')).toBe(false);
  });

  it('getLayers() reflects insertion order sorted by order field', () => {
    pipeline.addLayer(makeLayer('high-order', 'grp-c', 10));
    pipeline.addLayer(makeLayer('low-order', 'grp-c', 1));

    const layers = pipeline.getLayers();
    const idx1 = layers.findIndex(l => l.name === 'low-order');
    const idx2 = layers.findIndex(l => l.name === 'high-order');
    expect(idx1).toBeLessThan(idx2);
  });

  it('process() executes layers and merges their responses', async () => {
    const layer = makeLayer('responder', 'grp-d', 1);
    layer.execute.mockResolvedValue({ response: 'hello world' });
    pipeline.addLayer(layer);

    const req: PipelineRequest = { query: 'test query' };
    const res = await pipeline.process(req);

    expect(layer.execute).toHaveBeenCalled();
    expect(res.response).toBe('hello world');
    expect(res.traces.some(t => t.layer === 'responder')).toBe(true);
  });

  it('parallel layers (same group) both execute', async () => {
    const layerA = makeLayer('par-a', 'parallel-grp', 1);
    const layerB = makeLayer('par-b', 'parallel-grp', 1);
    layerA.execute.mockResolvedValue({ context: { a: true } });
    layerB.execute.mockResolvedValue({ context: { b: true } });

    pipeline.addLayer(layerA);
    pipeline.addLayer(layerB);

    await pipeline.process({ query: 'parallel test' });

    expect(layerA.execute).toHaveBeenCalled();
    expect(layerB.execute).toHaveBeenCalled();
  });

  it('layer with condition() returning false is skipped', async () => {
    const conditionalLayer: PipelineLayer = {
      name: 'conditional-layer',
      group: 'grp-e',
      order: 1,
      condition: (_req) => false,
      execute: vi.fn().mockResolvedValue({ response: 'should not run' }),
    };
    pipeline.addLayer(conditionalLayer);

    const res = await pipeline.process({ query: 'anything' });

    expect(conditionalLayer.execute).not.toHaveBeenCalled();
    const trace = res.traces.find(t => t.layer === 'conditional-layer');
    expect(trace?.status).toBe('skipped');
  });

  it('traces include a record for every layer that ran', async () => {
    pipeline.addLayer(makeLayer('trace-layer', 'grp-f', 1));
    const res = await pipeline.process({ query: 'trace test' });

    const trace = res.traces.find(t => t.layer === 'trace-layer');
    expect(trace).toBeDefined();
    expect(trace?.status).toBe('ok');
    expect(trace?.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. application-registry
// ─────────────────────────────────────────────────────────────────────────────

describe('application-registry', () => {
  const mockApp: MotherApplication = {
    id: 'test-app',
    name: 'Test App',
    version: '1.0.0',
    description: 'Test',
    domain: 'test',
    memoryNamespace: 'test',
    toolPlugins: [],
    pipelineLayers: [],
    initialize: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, uptime: 0, lastCheck: new Date() }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('register() calls initialize() on the app', async () => {
    await applicationRegistry.register(mockApp);
    expect(mockApp.initialize).toHaveBeenCalledTimes(1);
  });

  it('register() calls toolRegistry.register() for each plugin', async () => {
    const plugin = makePlugin('reg-plugin', 'test', ['reg-tool']);
    const appWithPlugin = makeApp('app-with-plugin', [plugin]);

    await applicationRegistry.register(appWithPlugin);

    const tools = toolRegistry.getAllTools();
    expect(tools.map(t => t.function.name)).toContain('reg-tool');
  });

  it('unregister() calls shutdown() and removes the app', async () => {
    await applicationRegistry.register(mockApp);
    await applicationRegistry.unregister(mockApp.id);

    expect(mockApp.shutdown).toHaveBeenCalledTimes(1);
    expect(applicationRegistry.list().some(a => a.id === mockApp.id)).toBe(false);
  });

  it('list() returns only registered apps', async () => {
    await applicationRegistry.register(mockApp);

    const listed = applicationRegistry.list();
    const found = listed.find(a => a.id === mockApp.id);

    expect(found).toBeDefined();
    expect(found?.name).toBe('Test App');
    expect(found?.domain).toBe('test');
  });

  it('healthCheckAll() returns health status for all registered apps', async () => {
    await applicationRegistry.register(mockApp);

    const health = await applicationRegistry.healthCheckAll();

    expect(health[mockApp.id]).toBeDefined();
    expect(health[mockApp.id].healthy).toBe(true);
  });

  it('healthCheckAll() reports unhealthy when healthCheck() throws', async () => {
    const faultyApp = makeApp('faulty-app');
    faultyApp.healthCheck = vi.fn().mockRejectedValue(new Error('service down'));
    await applicationRegistry.register(faultyApp);

    const health = await applicationRegistry.healthCheckAll();

    expect(health['faulty-app'].healthy).toBe(false);
    expect(health['faulty-app'].details?.error).toMatch(/service down/);
  });

  it('getStats() returns correct application and tool counts', async () => {
    const plugin = makePlugin('stats-plugin', 'test', ['tool-x', 'tool-y']);
    const app = makeApp('stats-app', [plugin]);
    await applicationRegistry.register(app);

    const stats = applicationRegistry.getStats();

    expect(stats.applicationCount).toBeGreaterThanOrEqual(1);
    expect(stats.totalTools).toBeGreaterThanOrEqual(2);
    expect(stats.applications.some(a => a.id === 'stats-app')).toBe(true);
  });

  it('registering an app with pipeline layers adds them to the pipeline', async () => {
    const layer = makeLayer('app-layer', 'app-grp', 1);
    const app = makeApp('pipeline-app', [], [layer]);
    await applicationRegistry.register(app);

    expect(pipeline.getLayers().some(l => l.name === 'app-layer')).toBe(true);
  });
});
