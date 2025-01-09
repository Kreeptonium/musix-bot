import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { PaymentService } from './payment';
import { StorageService } from './storage';

interface WebhookEvent {
    type: string;
    action: string;
    data: any;
    timestamp: Date;
    signature?: string;
}

interface WebhookHandler {
    handleEvent(event: WebhookEvent): Promise<void>;
}

export class WebhookService extends EventEmitter {
    private logger: Logger;
    private handlers: Map<string, WebhookHandler>;
    private paymentService: PaymentService;
    private storageService: StorageService;

    constructor(
        paymentService: PaymentService,
        storageService: StorageService
    ) {
        super();
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.handlers = new Map();
        this.paymentService = paymentService;
        this.storageService = storageService;
        this.initializeHandlers();
    }

    private initializeHandlers(): void {
        // Payment handlers
        this.handlers.set('payment.confirmed', {
            handleEvent: async (event) => this.handlePaymentConfirmed(event)
        });

        this.handlers.set('payment.failed', {
            handleEvent: async (event) => this.handlePaymentFailed(event)
        });

        // Transaction handlers
        this.handlers.set('transaction.confirmed', {
            handleEvent: async (event) => this.handleTransactionConfirmed(event)
        });
    }

    async handleWebhook(
        type: string,
        payload: any,
        signature?: string
    ): Promise<void> {
        try {
            this.logger.info('Received webhook:', { type, payload });

            // Verify webhook signature if provided
            if (signature && !this.verifySignature(payload, signature)) {
                throw new Error('Invalid webhook signature');
            }

            const event: WebhookEvent = {
                type,
                action: payload.action,
                data: payload.data,
                timestamp: new Date(),
                signature
            };

            // Find and execute handler
            const handler = this.handlers.get(type);
            if (!handler) {
                this.logger.warn(`No handler found for webhook type: ${type}`);
                return;
            }

            await handler.handleEvent(event);
            this.emit('webhookProcessed', { type, success: true });

        } catch (error) {
            this.logger.error('Error handling webhook:', error);
            this.emit('webhookError', { type, error });
            throw error;
        }
    }

    private async handlePaymentConfirmed(event: WebhookEvent): Promise<void> {
        try {
            const { orderId, transactionHash } = event.data;

            // Verify payment
            await this.paymentService.verifyPayment(orderId, transactionHash);

            // Get stored request
            const request = await this.storageService.getRequest(orderId);
            if (!request) {
                throw new Error(`Request not found for order: ${orderId}`);
            }

            // Emit event for payment confirmation
            this.emit('paymentConfirmed', {
                orderId,
                request,
                transactionHash
            });

        } catch (error) {
            this.logger.error('Error handling payment confirmation:', error);
            throw error;
        }
    }

    private async handlePaymentFailed(event: WebhookEvent): Promise<void> {
        try {
            const { orderId, reason } = event.data;

            await this.paymentService.markPaymentFailed(orderId, reason);
            this.emit('paymentFailed', { orderId, reason });

        } catch (error) {
            this.logger.error('Error handling payment failure:', error);
            throw error;
        }
    }

    private async handleTransactionConfirmed(event: WebhookEvent): Promise<void> {
        try {
            const { chain, hash, status } = event.data;

            // Update transaction status
            await this.paymentService.updateTransactionStatus(chain, hash, status);

            this.emit('transactionConfirmed', {
                chain,
                hash,
                status
            });

        } catch (error) {
            this.logger.error('Error handling transaction confirmation:', error);
            throw error;
        }
    }

    private verifySignature(payload: any, signature: string): boolean {
        // Implement signature verification based on your requirements
        // Example: HMAC verification
        try {
            // Add signature verification logic
            return true;
        } catch (error) {
            this.logger.error('Signature verification failed:', error);
            return false;
        }
    }

    async retry(type: string, payload: any): Promise<void> {
        try {
            await this.handleWebhook(type, payload);
            this.logger.info('Webhook retry successful:', { type });
        } catch (error) {
            this.logger.error('Webhook retry failed:', error);
            throw error;
        }
    }

    registerHandler(type: string, handler: WebhookHandler): void {
        this.handlers.set(type, handler);
        this.logger.info(`Registered handler for webhook type: ${type}`);
    }

    removeHandler(type: string): void {
        this.handlers.delete(type);
        this.logger.info(`Removed handler for webhook type: ${type}`);
    }
}