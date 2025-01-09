import { Request, Response } from 'express';
import { WebhookService } from '../services/webhook';
import { Logger } from '../utils/logger';

export class WebhookController {
    private webhookService: WebhookService;
    private logger: Logger;

    constructor(webhookService: WebhookService) {
        this.webhookService = webhookService;
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    }

    async handleWebhook(req: Request, res: Response): Promise<void> {
        try {
            const { type } = req.params;
            const signature = req.headers['x-webhook-signature'] as string;

            await this.webhookService.handleWebhook(
                type,
                req.body,
                signature
            );

            res.status(200).json({ status: 'success' });
        } catch (error) {
            this.logger.error('Webhook handling failed:', error);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    }

    async retryWebhook(req: Request, res: Response): Promise<void> {
        try {
            const { type, id } = req.params;

            await this.webhookService.retry(type, {
                id,
                ...req.body
            });

            res.status(200).json({ status: 'success' });
        } catch (error) {
            this.logger.error('Webhook retry failed:', error);
            res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    }
}