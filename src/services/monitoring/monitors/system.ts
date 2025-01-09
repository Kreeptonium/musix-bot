import { Logger } from '../../../utils/logger';
import { SystemMetrics } from '../types';
import { EventEmitter } from 'events';

export class SystemMonitor extends EventEmitter {
    private logger: Logger;
    private checkInterval: NodeJS.Timer | null = null;
    private memoryThreshold: number;

    constructor(memoryThresholdMB: number = 512) {
        super();
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.memoryThreshold = memoryThresholdMB;
    }

    async start(checkIntervalMs: number = 60000): Promise<void> {
        try {
            await this.checkSystem();
            this.checkInterval = setInterval(() => this.checkSystem(), checkIntervalMs);
            this.logger.info('System monitor started');
        } catch (error) {
            this.logger.error('Failed to start system monitor:', error);
            throw error;
        }
    }

    private async checkSystem(): Promise<void> {
        try {
            const metrics = this.collectMetrics();
            this.emit('metrics', metrics);

            // Check memory usage
            if (metrics.memory.heapUsed > this.memoryThreshold) {
                this.emit('warning', {
                    type: 'memory',
                    message: `Memory usage above threshold: ${metrics.memory.heapUsed}MB/${this.memoryThreshold}MB`,
                    metrics
                });
            }
        } catch (error) {
            this.logger.error('System check failed:', error);
            this.emit('error', error);
        }
    }

    private collectMetrics(): SystemMetrics {
        const memoryUsage = process.memoryUsage();
        
        return {
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                rss: Math.round(memoryUsage.rss / 1024 / 1024)
            },
            uptime: process.uptime(),
            timestamp: new Date()
        };
    }

    async stop(): Promise<void> {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.logger.info('System monitor stopped');
    }
}