import { useMother } from '@/contexts/MotherContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, AlertCircle, TrendingUp, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function ApolloPanel() {
  const { apolloStats } = useMother();

  if (!apolloStats) return null;

  const handleAction = (action: string) => {
    toast.info(`${action} - Feature coming soon`, {
      description: 'This action will be implemented in the next update.',
    });
  };

  return (
    <div className="w-full lg:w-96 border-l border-border bg-card/50 backdrop-blur p-4 overflow-y-auto">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Apollo Project</h2>
            <p className="text-sm text-muted-foreground">APAC Market Intelligence</p>
          </div>
        </div>

        {/* Database Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4" />
              Database Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Companies</span>
              <span className="text-lg font-bold text-foreground">{apolloStats.totalCompanies.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Data Quality Issues</span>
              <Badge variant="destructive">{apolloStats.dataQualityIssues}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Top Countries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Top Opportunities
            </CardTitle>
            <CardDescription>By composite score</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {apolloStats.topCountries.map((country, index) => (
              <div key={country.country} className="flex items-center gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold">
                  {index + 1}
                </div>
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">{country.country}</span>
                    <span className="text-sm font-bold text-blue-400">{country.score}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{country.companies.toLocaleString()} companies</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Quick Actions
            </CardTitle>
            <CardDescription>Critical fixes needed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction('Fix Industry Field')}
            >
              Fix Industry Field (99.8% empty)
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction('Extract Contacts')}
            >
              Extract Top 100 Contacts
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction('Indonesia Deep Dive')}
            >
              Indonesia Deep Dive
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
