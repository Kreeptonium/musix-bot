// src/services/payment.ts

import { Logger } from '../utils/logger';
import Web3 from 'web3';
import { StorageService } from './storage';

interface PaymentDetails {
    orderId: string;
    amount: number;
    userId: string;
    tweetId: string;
    walletAddresses: {
        btc: string;
        eth: string;
        sol: string;
        usdt: string;
    };
    status: 'pending' | 'completed' | 'failed';
    timestamp: Date;
}

interface PaymentRetryConfig {
    maxAttempts: number;
    delayBetweenAttempts: number;
    maxVerificationTime: number;
}

interface PaymentError {
    orderId: string;
    error: string;
    attempts: number;
    lastAttempt: Date;
}

export class PaymentService {
    private logger: Logger;
    private web3: Web3;
    private storageService: StorageService;
    private payments: Map<string, PaymentDetails>;
    private failedPayments: Map<string, PaymentError>;
    private retryConfig: PaymentRetryConfig;

    constructor(storageService: StorageService) {
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.storageService = storageService;
        this.payments = new Map();
        this.failedPayments = new Map();
        this.initializeWeb3();
        
        this.retryConfig = {
            maxAttempts: 3,
            delayBetweenAttempts: 5 * 60 * 1000, // 5 minutes
            maxVerificationTime: 30 * 60 * 1000   // 30 minutes
        };
    }

    private initializeWeb3(): void {
        if (process.env.ETH_RPC_URL) {
            this.web3 = new Web3(process.env.ETH_RPC_URL);
        } else {
            this.logger.warn('ETH_RPC_URL not configured');
        }
    }

    async createPaymentRequest(userId: string, tweetId: string): Promise<PaymentDetails> {
        try {
            const orderId = `PAY-${Date.now()}-${userId.slice(-4)}`;
            
            const payment: PaymentDetails = {
                orderId,
                amount: 10, // Fixed amount for MVP
                userId,
                tweetId,
                walletAddresses: {
                    btc: process.env.BTC_WALLET || '',
                    eth: process.env.ETH_WALLET || '',
                    sol: process.env.SOL_WALLET || '',
                    usdt: process.env.USDT_WALLET || ''
                },
                status: 'pending',
                timestamp: new Date()
            };

            this.payments.set(orderId, payment);
            this.logger.info('Created payment request:', { orderId });

            return payment;
        } catch (error) {
            this.logger.error('Error creating payment request:', error);
            throw error;
        }
    }

    async verifyPayment(orderId: string, txHash?: string): Promise<boolean> {
        try {
            const payment = this.payments.get(orderId);
            if (!payment) {
                throw new Error(`Payment not found: ${orderId}`);
            }

            if (this.hasPaymentExpired(payment)) {
                await this.handleExpiredPayment(payment);
                return false;
            }

            return await this.retryVerification(payment, txHash);

        } catch (error) {
            await this.handlePaymentError(orderId, error);
            return false;
        }
    }

    private async verifyEthereumTransaction(txHash: string, payment: PaymentDetails): Promise<boolean> {
        try {
            const tx = await this.web3.eth.getTransaction(txHash);
            if (!tx) return false;

            if (tx.to?.toLowerCase() !== payment.walletAddresses.eth.toLowerCase()) {
                return false;
            }

            const amount = this.web3.utils.fromWei(tx.value, 'ether');
            const etherPrice = await this.getEtherPrice();
            const expectedAmount = payment.amount / etherPrice;

            return Math.abs(parseFloat(amount) - expectedAmount) / expectedAmount <= 0.05;
        } catch (error) {
            this.logger.error('Error verifying Ethereum transaction:', error);
            return false;
        }
    }

    private async checkPaymentAddresses(payment: PaymentDetails): Promise<boolean> {
        try {
            const balance = await this.web3.eth.getBalance(payment.walletAddresses.eth);
            const currentBalance = parseFloat(this.web3.utils.fromWei(balance, 'ether'));

            const lastBalance = parseFloat(await this.storageService.getValue(`balance_${payment.walletAddresses.eth}`) || '0');
            await this.storageService.setValue(`balance_${payment.walletAddresses.eth}`, currentBalance.toString());

            return currentBalance > lastBalance;
        } catch (error) {
            this.logger.error('Error checking payment addresses:', error);
            return false;
        }
    }

    private async retryVerification(payment: PaymentDetails, txHash?: string): Promise<boolean> {
        const failedPayment = this.failedPayments.get(payment.orderId);
        const attempts = failedPayment ? failedPayment.attempts : 0;

        if (attempts >= this.retryConfig.maxAttempts) {
            await this.handleMaxRetriesExceeded(payment);
            return false;
        }

        try {
            const isValid = txHash ? 
                await this.verifyEthereumTransaction(txHash, payment) :
                await this.checkPaymentAddresses(payment);

            if (isValid) {
                await this.handleSuccessfulPayment(payment);
                return true;
            }

            await this.handleFailedVerification(payment);
            return false;

        } catch (error) {
            await this.handlePaymentError(payment.orderId, error);
            return false;
        }
    }

    private async handleSuccessfulPayment(payment: PaymentDetails): Promise<void> {
        payment.status = 'completed';
        this.payments.set(payment.orderId, payment);
        this.failedPayments.delete(payment.orderId);
        
        await this.storageService.updatePaymentStatus(payment.orderId, 'completed');
        this.logger.info('Payment completed successfully:', payment.orderId);
    }

    private async handleFailedVerification(payment: PaymentDetails): Promise<void> {
        const failedPayment = this.failedPayments.get(payment.orderId);
        
        this.failedPayments.set(payment.orderId, {
            orderId: payment.orderId,
            error: 'Payment verification failed',
            attempts: failedPayment ? failedPayment.attempts + 1 : 1,
            lastAttempt: new Date()
        });

        this.logger.warn('Payment verification failed:', {
            orderId: payment.orderId,
            attempts: this.failedPayments.get(payment.orderId)?.attempts
        });
    }

    private async handleMaxRetriesExceeded(payment: PaymentDetails): Promise<void> {
        payment.status = 'failed';
        this.payments.set(payment.orderId, payment);
        
        await this.storageService.updatePaymentStatus(payment.orderId, 'failed');
        this.logger.error('Max retry attempts exceeded for payment:', payment.orderId);
    }

    private async handleExpiredPayment(payment: PaymentDetails): Promise<void> {
        payment.status = 'failed';
        this.payments.set(payment.orderId, payment);
        
        await this.storageService.updatePaymentStatus(payment.orderId, 'failed');
        this.logger.warn('Payment expired:', payment.orderId);
    }

    private async handlePaymentError(orderId: string, error: any): Promise<void> {
        const failedPayment = this.failedPayments.get(orderId);
        
        this.failedPayments.set(orderId, {
            orderId,
            error: error.message,
            attempts: failedPayment ? failedPayment.attempts + 1 : 1,
            lastAttempt: new Date()
        });

        this.logger.error('Payment error:', {
            orderId,
            error: error.message,
            attempts: this.failedPayments.get(orderId)?.attempts
        });
    }

    private hasPaymentExpired(payment: PaymentDetails): boolean {
        const now = Date.now();
        const paymentAge = now - payment.timestamp.getTime();
        return paymentAge > this.retryConfig.maxVerificationTime;
    }

    private async getEtherPrice(): Promise<number> {
        return 2000; // Hardcoded for MVP
    }

    async getPaymentStatus(orderId: string): Promise<string> {
        return this.payments.get(orderId)?.status || 'not_found';
    }

    async retryFailedPayment(orderId: string): Promise<boolean> {
        const failedPayment = this.failedPayments.get(orderId);
        if (!failedPayment) {
            this.logger.warn('No failed payment found for retry:', orderId);
            return false;
        }

        failedPayment.attempts = 0;
        this.failedPayments.set(orderId, failedPayment);
        return await this.verifyPayment(orderId);
    }

    async getFailedPayments(): Promise<PaymentError[]> {
        return Array.from(this.failedPayments.values());
    }
}