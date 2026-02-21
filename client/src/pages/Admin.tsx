import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Settings, Zap } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect } from "wouter";

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const [ctEnabled, setCtEnabled] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Fetch current config
  const { data: config, refetch } = trpc.system.getConfig.useQuery(
    { key: "critical_thinking_enabled" },
    { enabled: !!user && user.role === "admin" }
  );

  // Toggle mutation
  const toggleCT = trpc.system.toggleCriticalThinking.useMutation({
    onSuccess: data => {
      setCtEnabled(data.enabled);
      toast.success(
        `Critical Thinking ${data.enabled ? "enabled" : "disabled"}`
      );
      refetch();
    },
    onError: error => {
      toast.error(`Failed to toggle: ${error.message}`);
    },
  });

  // Load initial state
  useEffect(() => {
    if (config) {
      setCtEnabled(config.value === "true");
      setLoadingConfig(false);
    } else if (config === null) {
      // No config exists yet, default to false
      setCtEnabled(false);
      setLoadingConfig(false);
    }
  }, [config]);

  // Redirect if not admin
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <Redirect to="/" />;
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">MOTHER Admin Panel</h1>
          <p className="text-muted-foreground">
            Manage system configuration and feature flags
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Critical Thinking Central A/B Testing */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              <CardTitle>Critical Thinking Central</CardTitle>
            </div>
            <CardDescription>
              Enable 8-phase meta-learning process for complex queries (A/B
              testing)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="ct-toggle" className="text-base font-medium">
                  Enable Critical Thinking
                </Label>
                <p className="text-sm text-muted-foreground">
                  {ctEnabled
                    ? "✅ Active - 10% of traffic uses Critical Thinking Central"
                    : "⏸️ Disabled - All traffic uses standard processing"}
                </p>
              </div>
              <Switch
                id="ct-toggle"
                checked={ctEnabled}
                onCheckedChange={enabled => {
                  toggleCT.mutate({ enabled });
                }}
                disabled={loadingConfig || toggleCT.isPending}
              />
            </div>

            {ctEnabled && (
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-4">
                <p className="text-sm text-yellow-900 dark:text-yellow-100">
                  <strong>⚠️ A/B Testing Active:</strong> 10% of queries are
                  using Critical Thinking Central. Monitor metrics to validate
                  15-25% quality improvement hypothesis.
                </p>
              </div>
            )}

            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">How it works:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>10% of production traffic is randomly selected</li>
                <li>
                  Selected queries go through 8-phase meta-learning process
                </li>
                <li>Metrics collected: quality, latency, cost</li>
                <li>Goal: Validate 15-25% quality improvement</li>
                <li>Minimum sample size: 1000+ queries per variant</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Future Feature Flags */}
        <Card className="opacity-50">
          <CardHeader>
            <CardTitle>More Features Coming Soon</CardTitle>
            <CardDescription>
              Additional feature flags and configuration options will appear
              here
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Future features: SQLite persistence toggle, analytics dashboard
              settings, knowledge base management
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 flex gap-4">
        <Button variant="outline" onClick={() => refetch()}>
          Refresh Config
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}
