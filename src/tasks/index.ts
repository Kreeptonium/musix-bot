import { Logger } from '../utils/logger';
import { SchedulerService } from '../services/scheduler';
import { StorageService } from '../services/storage';
import { MusicService } from '../services/music';

export class TaskManager {
    private logger: Logger;
    private scheduler: SchedulerService;
    private storageService: StorageService;
    private musicService: MusicService;

    constructor(
        scheduler: SchedulerService,
        storageService: StorageService,
        musicService: MusicService
    ) {
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.scheduler = scheduler;
        this.storageService = storageService;
        this.musicService = musicService;
        this.registerTasks();
    }

    private registerTasks(): void {
        // Cleanup task - runs every hour
        this.scheduler.registerJob(
            'cleanup',
            'Cleanup Task',
            60 * 60 * 1000,
            async () => {
                await this.cleanup();
            }
        );

        // Health check task - runs every 5 minutes
        this.scheduler.registerJob(
            'health-check',
            'Health Check',
            5 * 60 * 1000,
            async () => {
                await this.healthCheck();
            }
        );

        // Request expiry check - runs every 15 minutes
        this.scheduler.registerJob(
            'request-expiry',
            'Request Expiry Check',
            15 * 60 * 1000,
            async () => {
                await this.checkExpiredRequests();
            }
        );
    }

    private async cleanup(): Promise<void> {
        try {
            await Promise.all([
                this.storageService.cleanup(),
                this.musicService.cleanup()
            ]);
            this.logger.info('Cleanup completed successfully');
        } catch (error) {
            this.logger.error('Cleanup failed:', error);
            throw error;
        }
    }

    private async healthCheck(): Promise<void> {
        try {
            // Implement health checks
            this.logger.info('Health check completed');
        } catch (error) {
            this.logger.error('Health check failed:', error);
            throw error;
        }
    }

    private async checkExpiredRequests(): Promise<void> {
        try {
            const expiredRequests = await this.storageService.getExpiredRequests();
            for (const request of expiredRequests) {
                // Handle expired request
                this.logger.info(`Handling expired request: ${request.id}`);
            }
        } catch (error) {
            this.logger.error('Request expiry check failed:', error);
            throw error;
        }
    }
}