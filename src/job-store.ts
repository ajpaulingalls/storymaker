import { TableClient, type TableEntity } from "@azure/data-tables";

// Job status types
export type JobStatus = "pending" | "processing" | "completed" | "failed";

// Job data structure
export interface Job {
  id: string;
  status: JobStatus;
  request: {
    site: string;
    slug: string;
    postType: string;
    template: string;
  };
  progress?: string;
  result?: {
    url: string;
    thumbnailUrl?: string;
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Job store interface
export interface JobStore {
  create(job: Omit<Job, "createdAt" | "updatedAt">): Promise<Job>;
  get(id: string): Promise<Job | null>;
  update(id: string, updates: Partial<Omit<Job, "id" | "createdAt">>): Promise<Job | null>;
  delete(id: string): Promise<boolean>;
  cleanup(maxAgeMs: number): Promise<number>;
}

// Generate a unique job ID
export function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * In-memory job store for local development
 */
export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, Job>();

  async create(job: Omit<Job, "createdAt" | "updatedAt">): Promise<Job> {
    const now = new Date();
    const fullJob: Job = {
      ...job,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, fullJob);
    console.log(`[Job Store] Created job: ${job.id}`);
    return fullJob;
  }

  async get(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  async update(id: string, updates: Partial<Omit<Job, "id" | "createdAt">>): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) {
      return null;
    }

    const updatedJob: Job = {
      ...job,
      ...updates,
      updatedAt: new Date(),
    };
    this.jobs.set(id, updatedJob);
    console.log(`[Job Store] Updated job ${id}: status=${updatedJob.status}`);
    return updatedJob;
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.jobs.has(id);
    this.jobs.delete(id);
    if (existed) {
      console.log(`[Job Store] Deleted job: ${id}`);
    }
    return existed;
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    const cutoff = now - maxAgeMs;
    let deleted = 0;

    for (const [id, job] of this.jobs.entries()) {
      // Only clean up completed or failed jobs
      if (
        (job.status === "completed" || job.status === "failed") &&
        job.updatedAt.getTime() < cutoff
      ) {
        this.jobs.delete(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[Job Store] Cleaned up ${deleted} old jobs`);
    }
    return deleted;
  }
}

/**
 * Azure Table Storage job store for production
 */
export class AzureTableJobStore implements JobStore {
  private tableClient: TableClient;
  private initialized = false;

  constructor(connectionString: string, tableName: string = "jobs") {
    this.tableClient = TableClient.fromConnectionString(connectionString, tableName);
  }

  private async ensureTable(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.tableClient.createTable();
      console.log(`[Job Store] Created Azure Table`);
    } catch (error: any) {
      // Table already exists is fine
      if (error.statusCode !== 409) {
        throw error;
      }
    }
    this.initialized = true;
  }

  private jobToEntity(job: Job): TableEntity<{
    status: string;
    request: string;
    progress: string;
    result: string;
    error: string;
    createdAt: string;
    updatedAt: string;
  }> {
    return {
      partitionKey: "jobs",
      rowKey: job.id,
      status: job.status,
      request: JSON.stringify(job.request),
      progress: job.progress || "",
      result: job.result ? JSON.stringify(job.result) : "",
      error: job.error || "",
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private entityToJob(entity: Record<string, unknown>): Job {
    return {
      id: entity.rowKey as string,
      status: entity.status as JobStatus,
      request: JSON.parse(entity.request as string),
      progress: (entity.progress as string) || undefined,
      result: entity.result ? JSON.parse(entity.result as string) : undefined,
      error: (entity.error as string) || undefined,
      createdAt: new Date(entity.createdAt as string),
      updatedAt: new Date(entity.updatedAt as string),
    };
  }

  async create(job: Omit<Job, "createdAt" | "updatedAt">): Promise<Job> {
    await this.ensureTable();

    const now = new Date();
    const fullJob: Job = {
      ...job,
      createdAt: now,
      updatedAt: now,
    };

    await this.tableClient.createEntity(this.jobToEntity(fullJob));
    console.log(`[Job Store] Created job: ${job.id}`);
    return fullJob;
  }

  async get(id: string): Promise<Job | null> {
    await this.ensureTable();

    try {
      const entity = await this.tableClient.getEntity("jobs", id);
      return this.entityToJob(entity as Record<string, unknown>);
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async update(id: string, updates: Partial<Omit<Job, "id" | "createdAt">>): Promise<Job | null> {
    await this.ensureTable();

    const existingJob = await this.get(id);
    if (!existingJob) {
      return null;
    }

    const updatedJob: Job = {
      ...existingJob,
      ...updates,
      updatedAt: new Date(),
    };

    await this.tableClient.updateEntity(this.jobToEntity(updatedJob), "Replace");
    console.log(`[Job Store] Updated job ${id}: status=${updatedJob.status}`);
    return updatedJob;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureTable();

    try {
      await this.tableClient.deleteEntity("jobs", id);
      console.log(`[Job Store] Deleted job: ${id}`);
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    await this.ensureTable();

    const cutoff = new Date(Date.now() - maxAgeMs);
    const cutoffStr = cutoff.toISOString();
    let deleted = 0;

    // Query for old completed/failed jobs
    const query = this.tableClient.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'jobs' and updatedAt lt '${cutoffStr}' and (status eq 'completed' or status eq 'failed')`,
      },
    });

    for await (const entity of query) {
      try {
        await this.tableClient.deleteEntity("jobs", entity.rowKey as string);
        deleted++;
      } catch {
        // Ignore deletion errors
      }
    }

    if (deleted > 0) {
      console.log(`[Job Store] Cleaned up ${deleted} old jobs`);
    }
    return deleted;
  }
}

// Configuration
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

/**
 * Check if Azure Table Storage is configured
 */
export function isTableStorageEnabled(): boolean {
  return !!connectionString;
}

/**
 * Create a job store instance based on environment configuration
 */
export function createJobStore(): JobStore {
  if (connectionString) {
    console.log("[Job Store] Using Azure Table Storage");
    return new AzureTableJobStore(connectionString);
  } else {
    console.log("[Job Store] Using in-memory storage (Azure not configured)");
    return new InMemoryJobStore();
  }
}
