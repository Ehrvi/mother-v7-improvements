/**
 * useDynamicFOS.ts — React hook for real-time FOS computation
 *
 * Connects DynamicFOSEngine to the SHMS backend via useShmsApi hooks.
 * Recomputes FOS every time dashboard data refreshes (30s poll).
 *
 * Scientific basis:
 *   - Bishop (1955) via DynamicFOS.ts engine
 *   - React Query SWR pattern (RFC 5861) for sensor data freshness
 */

import { useMemo, useEffect, useRef } from 'react';
import { useShmsDashboardAll } from '@/hooks/useShmsApi';
import { DynamicFOSEngine, DEFAULT_SENSOR_CONFIGS } from '@/components/shms/analysis/DynamicFOS';
import type { DynamicFOSResult } from '@/components/shms/analysis/DynamicFOS';
import { CLASSIC_EXAMPLES } from '@/components/shms/analysis/ClassicExamples';

/**
 * Hook that provides real-time FOS computation.
 * Ingests live sensor data from useShmsDashboardAll and recomputes FOS on each update.
 */
export function useDynamicFOS(structureId?: string): DynamicFOSResult | null {
  const { data: dashboard } = useShmsDashboardAll();
  const engineRef = useRef<DynamicFOSEngine | null>(null);
  const resultRef = useRef<DynamicFOSResult | null>(null);

  // Initialize engine with first classic example profile (or structure-specific if available)
  const engine = useMemo(() => {
    const example = CLASSIC_EXAMPLES[0];
    const profile = example?.profile ?? {
      surfacePoints: [{ x: 0, y: 20 }, { x: 30, y: 20 }, { x: 50, y: 5 }, { x: 80, y: 5 }],
      layers: [{
        id: 'default', name: 'Default', cohesion: 20, frictionAngle: 30,
        unitWeight: 18, saturatedUnitWeight: 20, ru: 0.2, color: '#888',
        points: [{ x: 0, y: 20 }, { x: 80, y: 20 }, { x: 80, y: -5 }, { x: 0, y: -5 }],
      }],
    };
    const eng = new DynamicFOSEngine(profile, DEFAULT_SENSOR_CONFIGS);
    engineRef.current = eng;
    return eng;
  }, []);

  // Feed live dashboard data into engine whenever it updates
  useEffect(() => {
    if (!dashboard?.structures || !engineRef.current) return;

    const structure = structureId
      ? dashboard.structures.find(s => s.structureId === structureId)
      : dashboard.structures[0];

    if (structure?.sensors) {
      engineRef.current.updateFromDashboard(
        structure.sensors.map(s => ({
          sensorId: s.sensorId,
          sensorType: s.sensorType,
          lastReading: s.lastReading,
          unit: s.unit,
          lastUpdated: s.lastUpdated,
        }))
      );
    }

    resultRef.current = engineRef.current.computeCurrentFOS();
  }, [dashboard, structureId, engine]);

  return resultRef.current;
}
