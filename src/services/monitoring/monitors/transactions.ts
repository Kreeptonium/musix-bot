import { Logger } from '../../../utils/logger';
import { EventEmitter } from 'events';
import { MonitoredTransaction, TransactionMonitorConfig } from '../types';
import Web3 from 'web3';

export class TransactionMonitor extends EventEmitter {
    private logger: Logger;
    private config: TransactionMonitorConfig;
    private providers: Map<string, any>;
    private watchedTransactions: Map<string, MonitoredTransaction>;
    private checkInterval: NodeJS.Timer | null = null;

    constructor(config: TransactionMonitorConfig) {
        super();
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.config = config;
        this.providers = new Map();
        this.watchedTransactions = new Map();
        this.initializeProviders();
    }

    private initializeProviders(): void {
        // Initialize Ethereum provider
        if (process.env.ETH_RPC_URL) {
            const web3 = new Web3(process.env.ETH_RPC_URL);
            this.providers.set('eth', web3);
        }

        // Initialize other chain providers here
        // Solana, Bitcoin, etc.
    }

    async start(): Promise<void> {
        try {
            await this.checkTransactions();
            this.checkInterval = setInterval(
                () => this.checkTransactions(),
                this.config.checkInterval
            );
            this.logger.info('Transaction monitor started');
        } catch (error) {
            this.logger.error('Failed to start transaction monitor:', error);
            throw error;
        }
    }

    async addTransaction(transaction: MonitoredTransaction): Promise<void> {
        this.watchedTransactions.set(transaction.hash, transaction);
        this.logger.info(`Started monitoring transaction: ${transaction.hash}`);
    }

    private async checkTransactions(): Promise<void> {
        for (const [hash, tx] of this.watchedTransactions) {
            try {
                await this.checkTransaction(tx);
            } catch (error) {
                this.logger.error(`Error checking transaction ${hash}:`, error);
            }
        }
    }

    private async checkTransaction(tx: MonitoredTransaction): Promise<void> {
        switch (tx.chain) {
            case 'eth':
                await this.checkEthereumTransaction(tx);
                break;
            case 'sol':
                await this.checkSolanaTransaction(tx);
                break;
            // Add other chains as needed
        }
    }

    private async checkEthereumTransaction(tx: MonitoredTransaction): Promise<void> {
        const web3 = this.providers.get('eth');
        if (!web3) {
            this.logger.error('Ethereum provider not initialized');
            return;
        }

        try {
            const receipt = await web3.eth.getTransactionReceipt(tx.hash);
            if (receipt) {
                const currentBlock = await web3.eth.getBlockNumber();
                const confirmations = currentBlock - receipt.blockNumber;

                if (confirmations >= this.config.minConfirmations.eth) {
                    tx.status = receipt.status ? 'confirmed' : 'failed';
                    tx.confirmations = confirmations;
                    
                    this.emit('transactionConfirmed', tx);
                    this.watchedTransactions.delete(tx.hash);
                } else {
                    tx.confirmations = confirmations;
                    this.emit('transactionUpdated', tx);
                }
            }
        } catch (error) {
            this.logger.error(`Error checking Ethereum transaction ${tx.hash}:`, error);
        }
    }

    private async checkSolanaTransaction(tx: MonitoredTransaction): Promise<void> {
        // Implement Solana transaction checking
        // Similar to Ethereum but using Solana's web3.js
    }

    async stop(): Promise<void> {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.watchedTransactions.clear();
        this.logger.info('Transaction monitor stopped');
    }
}