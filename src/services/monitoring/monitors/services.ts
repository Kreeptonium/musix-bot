import { Logger } from '../../../utils/logger';
import { ServiceStatus } from '../types';
import { EventEmitter } from 'events';
import { MusicService } from '../../music';
import { TwitterService } from '../../twitter';
import { PaymentService } from '../../payment';
import { BrowserService } from '../../browser';

export class ServicesMonitor extends EventEmitter {
    private logger: Logger;
    private services: {
        music: MusicService;
        twitter: TwitterService;
        payment: PaymentService;
        browser: BrowserService;
    };
    private checkInterval: NodeJS.Timer | null = null;
    private serviceStatus: Map<string, ServiceStatus>;

    constructor(services: {
        music: MusicService;
        twitter: TwitterService;
        payment: PaymentService;
        browser: BrowserService;
    }) {
        super();
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.services = services;
        this.serviceStatus = new Map();
    }

    async start(checkIntervalMs: number = 60000): Promise<void> {
        try {
            await this.checkServices();
            this.checkInterval = setInterval(() => this.checkServices(), checkIntervalMs);
            this.logger.info('Services monitor started');
        } catch (error) {
            this.logger.error('Failed to start services monitor:', error);
            throw error;
        }
    }

    private async checkServices(): Promise<void> {
        await Promise.all([
            this.checkBrowserService(),
            this.checkTwitterService(),
            this.checkMusicService(),
            this.checkPaymentService()
        ]);
    }

    private async checkBrowserService(): Promise<void> {
        try {
            const page = await this.services.browser.getPage();
            this.updateServiceStatus('browser', page ? 'healthy' : 'degraded');
        } catch (error) {
            this.updateServiceStatus('browser', 'unhealthy', { error: error.message });
        }
    }

    private async checkTwitterService(): Promise<void> {
        try {
            // Add Twitter service checks
            this.updateServiceStatus('twitter', 'healthy');
        } catch (error) {
            this.updateServiceStatus('twitter', 'unhealthy', { error: error.message });
        }
    }

    private async checkMusicService(): Promise<void> {
        try {
            // Add Music service checks
            this.updateServiceStatus('music', 'healthy');
        } catch (error) {
            this.updateServiceStatus('music', 'unhealthy', { error: error.message });
        }
    }

    private async checkPaymentService(): Promise<void> {
        try {
            // Add Payment service checks
            this.updateServiceStatus('payment', 'healthy');
        } catch (error) {
            this.updateServiceStatus('payment', 'unhealthy', { error: error.message });
        }
    }

    private updateServiceStatus(
        serviceName: string,
        status: 'healthy' | 'degraded' | 'unhealthy',
        details?: any
    ): void {
        const healthStatus: ServiceStatus = {
            service: serviceName,
            status,
            lastCheck: new Date(),
            details
        };

        this.serviceStatus.set(serviceName, healthStatus);
        this.emit('statusUpdate', healthStatus);

        if (status !== 'healthy') {
            this.logger.warn(`Service ${serviceName} is ${status}`, details);
        }
    }

    getServiceStatus(serviceName: string): ServiceStatus | undefined {
        return this.serviceStatus.get(serviceName);
    }

    getAllServiceStatus(): Map<string, ServiceStatus> {
        return new Map(this.serviceStatus);
    }

    async stop(): Promise<void> {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.logger.info('Services monitor stopped');
    }
}