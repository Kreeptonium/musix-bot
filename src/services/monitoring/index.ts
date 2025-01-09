import { Logger } from '../../utils/logger';
import { SystemMonitor } from './monitors/system';
import { ServicesMonitor } from './monitors/services';
import { TransactionMonitor } from './monitors/transactions';
import { ServiceStatus, TransactionMonitorConfig } from './types';
import { EventEmitter } from 'events';

export class MonitoringService extends EventEmitter {
    private logger: Logger;
    private systemMonitor: SystemMonitor;
    private servicesMonitor: ServicesMonitor;
    private transactionMonitor: TransactionMonitor;

    constructor(
        services: any,
        config: {
            memoryThreshold?: number;
            transactionConfig: TransactionMonitorConfig;
        }
    ) {
        super();
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        
        this.systemMonitor = new SystemMonitor(config.memoryThreshold);
        this.servicesMonitor = new ServicesMonitor(services);
        this.transactionMonitor = new TransactionMonitor(config.transactionConfig);

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        // System Monitor Events
        this.systemMonitor.on('metrics', (metrics) => {
            this.emit('systemMetrics', metrics);
        });

        this.systemMonitor.on('warning', (warning) => {
            this.emit('systemWarning', warning);
            this.logger.warn('System warning:', warning);
        });

        // Services Monitor Events
        this.servicesMonitor.on('statusUpdate', (status: ServiceStatus) => {
            this.emit('serviceStatus', status);
        });

        // Transaction Monitor Events
        this.transactionMonitor.on('transactionConfirmed', (tx) => {
            this.emit('transactionConfirmed', tx);
            this.logger.info(`Transaction confirmed: ${tx.hash}`);
        });

        this.transactionMonitor.on('transactionUpdated', (tx) => {
            this.emit('transactionUpdated', tx);
        });
    }

    async start(): Promise<void> {
        try {
            await Promise.all([
                this.systemMonitor.start(),
                this.servicesMonitor.start(),
                this.transactionMonitor.start()
            ]);
            
            this.logger.info('Monitoring service started successfully');
        } catch (error) {
            this.logger.error('Failed to start monitoring service:', error);
            throw error;
        }
    }

    async monitorTransaction(transaction: any): Promise<void> {
        await this.transactionMonitor.addTransaction(transaction);
    }

    getServiceStatus(serviceName: string): ServiceStatus | undefined {
        return this.servicesMonitor.getServiceStatus(serviceName);
    }

    getAllServiceStatus(): Map<string, ServiceStatus> {
        return this.servicesMonitor.getAllServiceStatus();
    }

    async stop(): Promise<void> {
        try {
            await Promise.all([
                this.systemMonitor.stop(),
                this.servicesMonitor.stop(),
                this.transactionMonitor.stop()
            ]);
            
            this.logger.info('Monitoring service stopped');
        } catch (error) {
            this.logger.error('Error stopping monitoring service:', error);
            throw error;
        }
    }
}