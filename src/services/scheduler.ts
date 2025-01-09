import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

interface Job {
    id: string;
    name: string;
    interval: number;
    lastRun?: Date;
    isRunning: boolean;
    task: () => Promise<void>;
}

export class SchedulerService extends EventEmitter {
    private logger: Logger;
    private jobs: Map<string, Job>;
    private intervals: Map<string, NodeJS.Timer>;
    private isRunning: boolean;

    constructor() {
        super();
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.jobs = new Map();
        this.intervals = new Map();
        this.isRunning = false;
    }

    registerJob(
        id: string,
        name: string,
        interval: number,
        task: () => Promise<void>
    ): void {
        this.jobs.set(id, {
            id,
            name,
            interval,
            task,
            isRunning: false
        });
        this.logger.info(`Registered job: ${name} (${id})`);
    }

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        for (const [jobId, job] of this.jobs) {
            this.scheduleJob(jobId);
        }

        this.logger.info('Scheduler started');
    }

    private scheduleJob(jobId: string): void {
        const job = this.jobs.get(jobId);
        if (!job) return;

        const interval = setInterval(async () => {
            if (job.isRunning) return;

            try {
                job.isRunning = true;
                this.emit('jobStart', job);
                
                await job.task();
                
                job.lastRun = new Date();
                this.emit('jobComplete', job);
            } catch (error) {
                this.logger.error(`Error in job ${job.name}:`, error);
                this.emit('jobError', { job, error });
            } finally {
                job.isRunning = false;
            }
        }, job.interval);

        this.intervals.set(jobId, interval);
    }

    async runJobNow(jobId: string): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job || job.isRunning) {
            throw new Error(`Cannot run job ${jobId}`);
        }

        try {
            job.isRunning = true;
            this.emit('jobStart', job);
            
            await job.task();
            
            job.lastRun = new Date();
            this.emit('jobComplete', job);
        } catch (error) {
            this.logger.error(`Error in job ${job.name}:`, error);
            this.emit('jobError', { job, error });
            throw error;
        } finally {
            job.isRunning = false;
        }
    }

    async runAllJobs(): Promise<void> {
        for (const [jobId] of this.jobs) {
            await this.runJobNow(jobId);
        }
    }

    pauseJob(jobId: string): void {
        const interval = this.intervals.get(jobId);
        if (interval) {
            clearInterval(interval);
            this.intervals.delete(jobId);
            this.logger.info(`Paused job: ${jobId}`);
        }
    }

    resumeJob(jobId: string): void {
        if (this.jobs.has(jobId) && !this.intervals.has(jobId)) {
            this.scheduleJob(jobId);
            this.logger.info(`Resumed job: ${jobId}`);
        }
    }

    removeJob(jobId: string): void {
        this.pauseJob(jobId);
        this.jobs.delete(jobId);
        this.logger.info(`Removed job: ${jobId}`);
    }

    getJobStatus(jobId: string): {
        isRunning: boolean;
        lastRun?: Date;
    } | undefined {
        const job = this.jobs.get(jobId);
        if (!job) return undefined;

        return {
            isRunning: job.isRunning,
            lastRun: job.lastRun
        };
    }

    getAllJobs(): Array<{
        id: string;
        name: string;
        isRunning: boolean;
        lastRun?: Date;
    }> {
        return Array.from(this.jobs.values()).map(job => ({
            id: job.id,
            name: job.name,
            isRunning: job.isRunning,
            lastRun: job.lastRun
        }));
    }

    async stop(): Promise<void> {
        this.isRunning = false;
        for (const interval of this.intervals.values()) {
            clearInterval(interval);
        }
        this.intervals.clear();
        this.logger.info('Scheduler stopped');
    }
}