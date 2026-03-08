/**
 * VersionBadge.tsx — Dynamic Version Badge
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * NC-UI-001 fix: version must be fetched from /api/version (dynamic),
 * never hardcoded in HTML or static files.
 *
 * Displays: MOTHER v83.0 | C200 | production
 */

import { useEffect, useState } from "react";

interface VersionInfo {
  version: string;
  motherVersion: string;
  cycle: number;
  timestamp: string;
}

interface VersionBadgeProps {
  /** Additional CSS classes */
  className?: string;
  /** Show full details or compact version */
  compact?: boolean;
  /** Refresh interval in ms (default: 60000 = 1 minute) */
  refreshIntervalMs?: number;
}

/**
 * VersionBadge — fetches and displays the current MOTHER version dynamically.
 *
 * Uses /api/version endpoint (lightweight, no DB check).
 * Refreshes every minute to reflect hot deployments.
 *
 * Usage:
 * ```tsx
 * <VersionBadge />
 * // Renders: MOTHER v83.0 | C200
 *
 * <VersionBadge compact />
 * // Renders: v83.0
 * ```
 */
export function VersionBadge({
  className = "",
  compact = false,
  refreshIntervalMs = 60_000,
}: VersionBadgeProps) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchVersion = async () => {
    try {
      const response = await fetch("/api/version");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as VersionInfo;
      setVersionInfo(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersion();

    const interval = setInterval(fetchVersion, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [refreshIntervalMs]);

  if (loading) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-400 animate-pulse ${className}`}
      >
        loading...
      </span>
    );
  }

  if (error || !versionInfo) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-red-50 text-red-400 ${className}`}
        title="Version check failed"
      >
        v?
      </span>
    );
  }

  if (compact) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-600 border border-blue-200 ${className}`}
        title={`MOTHER ${versionInfo.motherVersion} | Cycle ${versionInfo.cycle} | Updated: ${new Date(versionInfo.timestamp).toLocaleString()}`}
      >
        {versionInfo.motherVersion}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200 shadow-sm ${className}`}
      title={`Updated: ${new Date(versionInfo.timestamp).toLocaleString()}`}
    >
      <span className="font-semibold">MOTHER</span>
      <span className="text-blue-500">{versionInfo.motherVersion}</span>
      <span className="text-gray-400">|</span>
      <span className="text-indigo-600">C{versionInfo.cycle}</span>
    </div>
  );
}

export default VersionBadge;
