import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';
import Web3 from 'web3';

interface ChainConfig {
  name: string;
  rpcUrl: string;
  confirmations: number;
}

export class BlockchainMonitor extends EventEmitter {
  private logger: Logger;
  private chains: Map<string, Web3>;
  private watching: Map<string, Set<string>>;
  private intervals: Map<string, NodeJS.Timer>;

  constructor() {
    super();
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.chains = new Map();
    this.watching = new Map();
    this.intervals = new Map();

    // Initialize supported chains
    const chains: ChainConfig[] = [
      {
        name: 'ETH',
        rpcUrl: process.env.ETH_RPC_URL || '',
        confirmations: 12
      },
      {
        name: 'SOL',
        rpcUrl: process.env.SOL_RPC_URL || '',
        confirmations: 1
      },
      {
        name: 'BTC',
        rpcUrl: process.env.BTC_RPC_URL || '',
        confirmations: 2
      }
    ];

    chains.forEach(chain => this.initializeChain(chain));
  }

  private async initializeChain(config: ChainConfig): Promise<void> {
    try {
      const web3 = new Web3(config.rpcUrl);
      this.chains.set(config.name, web3);
      this.watching.set(config.name, new Set());

      // Start monitoring
      const interval = setInterval(
        () => this.checkTransactions(config.name),
        10000 // Check every 10 seconds
      );
      this.intervals.set(config.name, interval);

      this.logger.info(`Initialized ${config.name} monitoring`);
    } catch (error) {
      this.logger.error(`Failed to initialize ${config.name} monitoring:`, error);
    }
  }

  async watchAddress(chain: string, address: string): Promise<void> {
    const addresses = this.watching.get(chain);
    if (addresses) {
      addresses.add(address.toLowerCase());
      this.logger.debug(`Started watching ${chain} address: ${address}`);
    }
  }

  async stopWatchingAddress(chain: string, address: string): Promise<void> {
    const addresses = this.watching.get(chain);
    if (addresses) {
      addresses.delete(address.toLowerCase());
      this.logger.debug(`Stopped watching ${chain} address: ${address}`);
    }
  }

  private async checkTransactions(chain: string): Promise<void> {
    try {
      const web3 = this.chains.get(chain);
      const addresses = this.watching.get(chain);

      if (!web3 || !addresses || addresses.size === 0) return;

      const latestBlock = await web3.eth.getBlockNumber();
      const block = await web3.eth.getBlock(latestBlock, true);

      if (!block || !block.transactions) return;

      for (const tx of block.transactions) {
        if (addresses.has(tx.to?.toLowerCase() || '')) {
          this.emit('transaction', {
            chain,
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            blockNumber: tx.blockNumber
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error checking ${chain} transactions:`, error);
    }
  }

  async stop(): Promise<void> {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    this.watching.clear();
    this.logger.info('Blockchain monitoring stopped');
  }
}