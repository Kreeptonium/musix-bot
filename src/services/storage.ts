import { Logger } from '../utils/logger';

interface StoredRequest {
    tweetId: string;
    userId: string;
    prompt: string;
    payment: {
        orderId: string;
        status: 'pending' | 'completed' | 'failed';
        amount: number;
        walletAddresses: {
            btc: string;
            eth: string;
            sol: string;
            usdt: string;
        };
    };
    timestamp: Date;
}

interface Checkpoint {
    timestamp: Date;
    pendingRequests: StoredRequest[];
    pendingPayments: any[];
}

export class StorageService {
    private logger: Logger;
    private requests: Map<string, StoredRequest>;
    private checkpoints: Checkpoint[];

    constructor() {
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.requests = new Map();
        this.checkpoints = [];
    }

    async storeRequest(request: StoredRequest): Promise<void> {
        try {
            this.requests.set(request.tweetId, request);
            this.logger.debug('Stored request:', { tweetId: request.tweetId });
        } catch (error) {
            this.logger.error('Error storing request:', error);
            throw error;
        }
    }

    async getRequest(tweetId: string): Promise<StoredRequest | undefined> {
        return this.requests.get(tweetId);
    }

    async updatePaymentStatus(
        orderId: string, 
        status: 'pending' | 'completed' | 'failed'
    ): Promise<void> {
        for (const request of this.requests.values()) {
            if (request.payment.orderId === orderId) {
                request.payment.status = status;
                this.requests.set(request.tweetId, request);
                break;
            }
        }
    }

    async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
        this.checkpoints.push(checkpoint);
        // Keep only last 5 checkpoints
        if (this.checkpoints.length > 5) {
            this.checkpoints.shift();
        }
    }

    async getLastCheckpoint(): Promise<Checkpoint | undefined> {
        return this.checkpoints[this.checkpoints.length - 1];
    }

    async getExpiredRequests(): Promise<StoredRequest[]> {
        const ONE_HOUR = 60 * 60 * 1000;
        const now = Date.now();

        return Array.from(this.requests.values()).filter(request => {
            const age = now - request.timestamp.getTime();
            return age > ONE_HOUR && request.payment.status === 'pending';
        });
    }

    async cleanup(): Promise<void> {
        const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        for (const [tweetId, request] of this.requests) {
            const age = now - request.timestamp.getTime();
            if (age > TWO_DAYS) {
                this.requests.delete(tweetId);
            }
        }
    }
}