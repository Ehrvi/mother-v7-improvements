/**
 * MOTHER Omniscient - Knowledge Area Management UI
 * 
 * Allows users to:
 * - Create new study jobs (study knowledge areas)
 * - Monitor job progress in real-time
 * - Search papers semantically
 * - View knowledge area details
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Search, Brain, BookOpen, Database } from 'lucide-react';
import { toast } from 'sonner';

export default function Omniscient() {
  const [studyName, setStudyName] = useState('');
  const [studyDescription, setStudyDescription] = useState('');
  const [maxPapers, setMaxPapers] = useState(50);
  const [searchQuery, setSearchQuery] = useState('');

  // Queries
  const { data: areas, isLoading: areasLoading, refetch: refetchAreas } = trpc.omniscient.listAreas.useQuery();
  const { data: jobs, isLoading: jobsLoading } = trpc.omniscient.getAllJobs.useQuery();
  const { data: searchResults, isLoading: searchLoading } = trpc.omniscient.search.useQuery(
    { query: searchQuery, topK: 5, minSimilarity: 0.3 },
    { enabled: searchQuery.length > 0 }
  );

  // Mutations
  const createStudyJob = trpc.omniscient.createStudyJob.useMutation({
    onSuccess: () => {
      toast.success('Study job started!');
      setStudyName('');
      setStudyDescription('');
      refetchAreas();
    },
    onError: (error) => {
      toast.error(`Failed to start study job: ${error.message}`);
    },
  });

  const handleCreateStudy = () => {
    if (!studyName.trim()) {
      toast.error('Please enter a knowledge area name');
      return;
    }
    createStudyJob.mutate({
      name: studyName,
      query: studyName, // Use studyName as arXiv query
      description: studyDescription || undefined,
      maxPapers,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'in_progress':
      case 'discovering':
      case 'retrieving':
      case 'processing':
      case 'indexing':
      case 'validating':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Brain className="w-10 h-10 text-purple-500" />
        <div>
          <h1 className="text-3xl font-bold">MOTHER Omniscient</h1>
          <p className="text-muted-foreground">Study knowledge areas from academic papers</p>
        </div>
      </div>

      {/* Create Study Job */}
      <Card>
        <CardHeader>
          <CardTitle>Study New Knowledge Area</CardTitle>
          <CardDescription>
            Enter a topic to study. MOTHER will search arXiv, download papers, extract text, and index them for semantic search.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Knowledge Area Name</label>
            <Input
              placeholder="e.g., quantum computing, machine learning, neuroscience"
              value={studyName}
              onChange={(e) => setStudyName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              placeholder="e.g., Study quantum computing algorithms and applications"
              value={studyDescription}
              onChange={(e) => setStudyDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Max Papers</label>
            <Input
              type="number"
              min={1}
              max={200}
              value={maxPapers}
              onChange={(e) => setMaxPapers(parseInt(e.target.value) || 50)}
            />
          </div>
          <Button
            onClick={handleCreateStudy}
            disabled={createStudyJob.isPending || !studyName.trim()}
            className="w-full"
          >
            {createStudyJob.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting Study...
              </>
            ) : (
              <>
                <BookOpen className="w-4 h-4 mr-2" />
                Start Study
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      {jobs && jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Jobs</CardTitle>
            <CardDescription>Monitor study job progress in real-time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{job.knowledgeAreaName}</div>
                  <Badge className={getStatusColor(job.status)}>
                    {job.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">{job.currentStep}</div>
                {job.total > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{job.progress}/{job.total} papers</span>
                    </div>
                    <Progress value={(job.progress / job.total) * 100} />
                  </div>
                )}
                {job.errorMessage && (
                  <div className="text-sm text-red-500">{job.errorMessage}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Knowledge Areas */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Areas</CardTitle>
          <CardDescription>View studied knowledge areas and their metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {areasLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : areas && areas.length > 0 ? (
            <div className="space-y-4">
              {areas.map((area) => (
                <div key={area.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{area.name}</div>
                    <Badge className={getStatusColor(area.status)}>
                      {area.status}
                    </Badge>
                  </div>
                  {area.description && (
                    <div className="text-sm text-muted-foreground mb-3">{area.description}</div>
                  )}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Papers</div>
                      <div className="font-medium">{area.papersCount || 0}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Chunks</div>
                      <div className="font-medium">{area.chunksCount || 0}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Cost</div>
                      <div className="font-medium">${area.cost || '0.00'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No knowledge areas yet. Create your first study above!
            </div>
          )}
        </CardContent>
      </Card>

      {/* Semantic Search */}
      <Card>
        <CardHeader>
          <CardTitle>Semantic Search</CardTitle>
          <CardDescription>Search across all indexed papers using natural language</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="e.g., What are the applications of quantum computing?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchQuery.trim()}
            />
            <Button disabled={!searchQuery.trim() || searchLoading}>
              {searchLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>

          {searchResults && searchResults.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-medium">Found {searchResults.length} results</div>
              {searchResults.map((result, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{result.paperTitle}</div>
                    <Badge variant="outline">
                      {(result.similarity * 100).toFixed(1)}% match
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-3">
                    {result.content}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Chunk {result.chunkIndex + 1}
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchQuery && searchResults && searchResults.length === 0 && !searchLoading && (
            <div className="text-center py-8 text-muted-foreground">
              No results found. Try a different query or study more knowledge areas.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
