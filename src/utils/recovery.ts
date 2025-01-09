// src/utils/recovery.ts

import { Logger } from './logger';
import { StorageService } from '../services/storage';

interface SystemState {
    timestamp: Date;
    pendingRequests: any[];
    pendingPayments: any[];
    activeServices: string[];
}

export class RecoverySystem {
    private logger: Logger;
    private storageService: StorageService;
    private lastCheckpoint: Date;
    private checkpointKey = 'system_checkpoint';

    constructor(storageService: StorageService) {
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.storageService = storageService;
        this.lastCheckpoint = new Date();
    }

    async saveCheckpoint(): Promise<void> {
        try {
            const state: SystemState = {
                timestamp: new Date(),
                pendingRequests: await this.storageService.getPendingRequests(),
                pendingPayments: await this.storageService.getPendingPayments(),
                activeServices: ['twitter', 'music', 'payment']
            };

            await this.storageService.setValue(this.checkpointKey, JSON.stringify(state));
            this.lastCheckpoint = state.timestamp;
            this.logger.info('Checkpoint saved successfully');
        } catch (error) {
            this.logger.error('Failed to save checkpoint:', error);
        }
    }

    async recoverFromLastCheckpoint(): Promise<void> {
        try {
            const checkpointData = await this.storageService.getValue(this.checkpointKey);
            if (!checkpointData) {
                this.logger.info('No checkpoint found for recovery');
                return;
            }

            const state: SystemState = JSON.parse(checkpointData);
            
            // Recover pending requests
            for (const request of state.pendingRequests) {
                await this.recoverRequest(request);
            }

            // Recover pending payments
            for (const payment of state.pendingPayments) {
                await this.recoverPayment(payment);
            }

            this.logger.info('Recovery completed successfully');
        } catch (error) {
            this.logger.error('Failed to recover from checkpoint:', error);
            throw error;
        }
    }

    private async recoverRequest(request: any): Promise<void> {
        try {
            // Update request status
            await this.storageService.storeRequest(request);
            this.logger.info('Recovered request:', request.id);
        } catch (error) {
            this.logger.error('Failed to recover request:', error);
        }
    }

    private async recoverPayment(payment: any): Promise<void> {
        try {
            // Update payment status
            await this.storageService.updatePaymentStatus(payment.orderId, payment.status);
            this.logger.info('Recovered payment:', payment.orderId);
        } catch (error) {
            this.logger.error('Failed to recover payment:', error);
        }
    }
}