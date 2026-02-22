/**
 * MOTHER Omniscient - Job Queue
 * 
 * Simple in-memory job queue for Phase 1 MVP
 * TODO (Phase 2): Migrate to Bull/BullMQ for production persistence
 */

export type JobStatus = 
  | 'pending'
  | 'discovering'
  | 'retrieving'
  | 'processing'
  | 'indexing'
  | 'validating'
  | 'completed'
  | 'failed';

export interface StudyJob {
  id: string;
  knowledgeAreaId: number;
  knowledgeAreaName: string;
  status: JobStatus;
  progress: number; // 0-100
  total: number; // Total papers to process
  currentStep: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface JobUpdate {
  status?: JobStatus;
  progress?: number;
  total?: number;
  currentStep?: string;
  errorMessage?: string;
}

class JobQueue {
  private jobs: Map<string, StudyJob> = new Map();
  private listeners: Map<string, Set<(job: StudyJob) => void>> = new Map();

  /**
   * Create a new study job
   */
  createJob(knowledgeAreaId: number, knowledgeAreaName: string): StudyJob {
    const job: StudyJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      knowledgeAreaId,
      knowledgeAreaName,
      status: 'pending',
      progress: 0,
      total: 0,
      currentStep: 'Initializing...',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.jobs.set(job.id, job);
    console.log(`[Queue] Created job ${job.id} for "${knowledgeAreaName}"`);
    return job;
  }

  /**
   * Update job status and progress
   */
  updateJob(jobId: string, update: JobUpdate): StudyJob | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      console.error(`[Queue] Job ${jobId} not found`);
      return null;
    }

    // Update fields
    if (update.status) job.status = update.status;
    if (update.progress !== undefined) job.progress = update.progress;
    if (update.total !== undefined) job.total = update.total;
    if (update.currentStep) job.currentStep = update.currentStep;
    if (update.errorMessage) job.errorMessage = update.errorMessage;
    job.updatedAt = new Date();

    // Mark completion
    if (update.status === 'completed' || update.status === 'failed') {
      job.completedAt = new Date();
    }

    this.jobs.set(jobId, job);

    // Notify listeners
    this.notifyListeners(jobId, job);

    console.log(`[Queue] Updated job ${jobId}: ${job.status} (${job.progress}/${job.total})`);
    return job;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): StudyJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs for a knowledge area
   */
  getJobsByKnowledgeArea(knowledgeAreaId: number): StudyJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.knowledgeAreaId === knowledgeAreaId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get all jobs
   */
  getAllJobs(): StudyJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Subscribe to job updates
   */
  subscribe(jobId: string, callback: (job: StudyJob) => void): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, new Set());
    }
    this.listeners.get(jobId)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(jobId)?.delete(callback);
    };
  }

  /**
   * Notify all listeners for a job
   */
  private notifyListeners(jobId: string, job: StudyJob): void {
    const listeners = this.listeners.get(jobId);
    if (listeners) {
      listeners.forEach(callback => callback(job));
    }
  }

  /**
   * Clean up old completed jobs (keep last 100)
   */
  cleanup(): void {
    const allJobs = this.getAllJobs();
    const completedJobs = allJobs.filter(
      job => job.status === 'completed' || job.status === 'failed'
    );

    if (completedJobs.length > 100) {
      const toDelete = completedJobs.slice(100);
      toDelete.forEach(job => {
        this.jobs.delete(job.id);
        this.listeners.delete(job.id);
      });
      console.log(`[Queue] Cleaned up ${toDelete.length} old jobs`);
    }
  }
}

// Singleton instance
export const jobQueue = new JobQueue();
