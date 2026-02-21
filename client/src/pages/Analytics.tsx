import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Redirect } from "wouter";
import { TrendingDown, TrendingUp, Activity, Database, Zap, Target } from "lucide-react";

/**
 * Analytics Dashboard - Admin Only
 * Displays key MOTHER v14 metrics: cost reduction, quality score, tier distribution, cache hit rate
 */
export default function Analytics() {
  const { user, loading } = useAuth();

  // Redirect non-admin users
  if (!loading && (!user || user.role !== 'admin')) {
    return <Redirect to="/404" />;
  }

  // Fetch analytics data (last 7 days)
  const { data: stats, isLoading } = trpc.analytics.summary.useQuery({
    days: 7
  });

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  // Calculate metrics
  const costReduction = stats?.avgCostReduction || 0;
  const qualityScore = stats?.avgQualityScore || 0;
  const cacheHitRate = stats?.cacheHitRate || 0;
  const totalQueries = stats?.totalQueries || 0;

  // Tier distribution
  const guardianPct = stats?.tierDistribution?.guardian || 0;
  const directPct = stats?.tierDistribution?.direct || 0;
  const parallelPct = stats?.tierDistribution?.parallel || 0;

  // Target validation
  const costTarget = 83;
  const qualityTarget = 90;
  const cacheTarget = 70;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            MOTHER v14 Analytics
          </h1>
          <p className="text-purple-300">
            Performance metrics for the last 7 days
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Cost Reduction */}
          <Card className="bg-black/40 border-purple-500/30 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-purple-300 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Cost Reduction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white mb-1">
                {costReduction.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Target: {costTarget}% {costReduction >= costTarget ? '✅' : '⚠️'}
              </p>
              <div className="mt-2 h-2 bg-purple-900/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                  style={{ width: `${Math.min(100, (costReduction / costTarget) * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Quality Score */}
          <Card className="bg-black/40 border-purple-500/30 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-purple-300 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Quality Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white mb-1">
                {qualityScore.toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground">
                Target: {qualityTarget}+ {qualityScore >= qualityTarget ? '✅' : '⚠️'}
              </p>
              <div className="mt-2 h-2 bg-purple-900/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, qualityScore)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Cache Hit Rate */}
          <Card className="bg-black/40 border-purple-500/30 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-purple-300 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Cache Hit Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white mb-1">
                {cacheHitRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Target: {cacheTarget}% {cacheHitRate >= cacheTarget ? '✅' : '⏳'}
              </p>
              <div className="mt-2 h-2 bg-purple-900/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                  style={{ width: `${Math.min(100, (cacheHitRate / cacheTarget) * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Total Queries */}
          <Card className="bg-black/40 border-purple-500/30 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-purple-300 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Total Queries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white mb-1">
                {totalQueries.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Last 7 days
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
                <TrendingUp className="h-3 w-3" />
                Active system
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tier Distribution Chart */}
        <Card className="bg-black/40 border-purple-500/30 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-400" />
              Tier Distribution
            </CardTitle>
            <CardDescription className="text-purple-300">
              Query routing across Guardian, Direct, and Parallel tiers (Target: 60/30/10)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Guardian Tier */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">Guardian (3-tier routing)</span>
                  <span className="text-sm text-purple-300">
                    {guardianPct.toFixed(1)}% {guardianPct >= 50 && guardianPct <= 70 ? '✅' : '⚠️'}
                  </span>
                </div>
                <div className="h-3 bg-purple-900/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all"
                    style={{ width: `${guardianPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Target: 60% (±10%)
                </p>
              </div>

              {/* Direct Tier */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">Direct (single model)</span>
                  <span className="text-sm text-purple-300">
                    {directPct.toFixed(1)}% {directPct >= 20 && directPct <= 40 ? '✅' : '⚠️'}
                  </span>
                </div>
                <div className="h-3 bg-purple-900/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all"
                    style={{ width: `${directPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Target: 30% (±10%)
                </p>
              </div>

              {/* Parallel Tier */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">Parallel (multi-model)</span>
                  <span className="text-sm text-purple-300">
                    {parallelPct.toFixed(1)}% {parallelPct >= 5 && parallelPct <= 15 ? '✅' : '⚠️'}
                  </span>
                </div>
                <div className="h-3 bg-purple-900/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-pink-600 to-pink-400 transition-all"
                    style={{ width: `${parallelPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Target: 10% (±5%)
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="mt-6 p-4 bg-purple-900/20 rounded-lg border border-purple-500/20">
              <p className="text-sm text-purple-200">
                <strong>Distribution Analysis:</strong> {
                  (guardianPct >= 50 && guardianPct <= 70) &&
                  (directPct >= 20 && directPct <= 40) &&
                  (parallelPct >= 5 && parallelPct <= 15)
                    ? '✅ Within target ranges (60/30/10 ±tolerance)'
                    : '⚠️ Outside target ranges - system may need calibration'
                }
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Note */}
        <div className="mt-6 text-center text-sm text-purple-300/60">
          Data refreshes automatically. Metrics calculated from production queries.
        </div>
      </div>
    </div>
  );
}
