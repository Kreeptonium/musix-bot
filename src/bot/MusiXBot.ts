// src/bot/MusiXBot.ts

import { TwitterService } from '../services/twitter';
import { MusicService } from '../services/music';

import { StorageService } from '../services/storage';
import { Logger } from '../utils/logger';
import { BrowserService } from '../services/browser';
import { RecoverySystem } from '../utils/recovery';
import { SystemMonitor } from '../services/monitoring/monitors/system';
import { PaymentService } from '../services/payment';


export class MusiXBot {
  private logger: Logger;
  private twitterService: TwitterService;
  private musicService: MusicService;
  private paymentService: PaymentService;
  private storageService: StorageService;
  private browserService: BrowserService;
  private isRunning: boolean = false;
  private recoverySystem: RecoverySystem;
  private checkpointInterval: NodeJS.Timer | null = null;
  private systemMonitor: SystemMonitor;

  constructor() {
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.browserService = new BrowserService();
    this.storageService = new StorageService();
    this.paymentService = new PaymentService(this.storageService);
    this.musicService = new MusicService();
    this.twitterService = new TwitterService(this.browserService);
    this.recoverySystem = new RecoverySystem(this.storageService);
    this.systemMonitor = new SystemMonitor();

    this.systemMonitor.on('healthCheckFailed', async (data) => {
      this.logger.error('Health check failed:', data);
    });

    this.systemMonitor.on('healthCheckError', async (data) => {
      this.logger.error('Health check error:', data);
    });
  }

  async start(): Promise<void> {
    try {
      this.logger.info('Starting MusiXBot...');
      
      await this.browserService.initialize();
      await this.twitterService.login();
      await this.musicService.initialize();
      await this.recoverySystem.recoverFromLastCheckpoint();
      await this.systemMonitor.startMonitoring();
      await this.startMentionMonitoring();
      this.startCheckpointSystem();
      
      this.isRunning = true;
      this.logger.info('MusiXBot started successfully');
    } catch (error) {
      this.logger.error('Failed to start MusiXBot:', error);
      await this.shutdown();
      throw error;
    }
  }

  private startCheckpointSystem(): void {
    this.checkpointInterval = setInterval(
      () => this.recoverySystem.saveCheckpoint(),
      5 * 60 * 1000  // 5 minutes
    );
  }

  private async startMentionMonitoring(): Promise<void> {
    if (!this.twitterService) {
      throw new Error('Twitter service not initialized');
    }

    await this.twitterService.monitorMentions(async (mention) => {
      await this.handleMention(mention);
    });
  }

  private async handleMention(mention: any): Promise<void> {
    try {
      if (!mention.text.toLowerCase().includes('/music')) {
        return;
      }

      const prompt = this.extractPrompt(mention.text);
      if (!prompt) {
        await this.twitterService.replyToTweet(
          mention.id,
          'Please include a description of the music you want to generate. Example: /music lofi beats with piano'
        );
        return;
      }

      const payment = await this.paymentService.createPaymentRequest(
        mention.author_id,
        mention.id
      );

      await this.storageService.storeRequest({
        tweetId: mention.id,
        userId: mention.author_id,
        prompt,
        payment,
        timestamp: new Date()
      });

      await this.twitterService.replyToTweet(
        mention.id,
        this.formatPaymentInstructions(payment)
      );
    } catch (error) {
      this.logger.error('Error handling mention:', error);
      await this.sendErrorResponse(mention.id);
    }
  }

  private async handlePaymentConfirmation(tweet: any): Promise<void> {
    try {
      const request = await this.storageService.getRequest(tweet.referenced_tweet_id);
      if (!request) {
        await this.twitterService.replyToTweet(
          tweet.id,
          "Couldn't find your original request. Please create a new request."
        );
        return;
      }

      const isVerified = await this.paymentService.verifyPayment(
        request.payment.orderId,
        tweet.text.includes('tx:') ? tweet.text.split('tx:')[1].trim() : undefined
      );

      if (isVerified) {
        await this.generateAndSendMusic(request, tweet.id);
      } else {
        await this.twitterService.replyToTweet(
          tweet.id,
          "Payment not found or not confirmed yet. Please ensure you've sent the correct amount and wait for blockchain confirmation."
        );
      }
    } catch (error) {
      this.logger.error('Error handling payment confirmation:', error);
      await this.sendErrorResponse(tweet.id);
    }
  }

  private async handlePaymentRecovery(tweet: any): Promise<void> {
    try {
      const orderId = tweet.text.match(/retry:(\S+)/)?.[1];
      if (!orderId) return;

      const isVerified = await this.paymentService.retryFailedPayment(orderId);
      
      if (isVerified) {
        const request = await this.storageService.getRequest(tweet.referenced_tweet_id);
        if (!request) return;
        await this.generateAndSendMusic(request, tweet.id);
      } else {
        await this.twitterService.replyToTweet(
          tweet.id,
          "Payment verification failed. Please ensure payment was sent correctly and try again."
        );
      }
    } catch (error) {
      this.logger.error('Error in payment recovery:', error);
      await this.sendErrorResponse(tweet.id);
    }
  }

  private async generateAndSendMusic(request: any, replyToId: string): Promise<void> {
    try {
      await this.twitterService.replyToTweet(
        replyToId,
        "Payment confirmed! Generating your music... 🎵"
      );

      const generatedMusic = await this.musicService.generateMusic({
        prompt: request.prompt,
        duration: 30
      });

      await this.twitterService.replyWithMedia(
        replyToId,
        `✨ Here's your AI-generated music!\nPrompt: "${request.prompt}"`,
        generatedMusic.filePath
      );

      await this.musicService.cleanup();
    } catch (error) {
      this.logger.error('Error generating music:', error);
      await this.twitterService.replyToTweet(
        replyToId,
        "Sorry, there was an error generating your music. Our team has been notified."
      );
    }
  }

  private extractPrompt(text: string): string | null {
    const match = text.match(/\/music\s+(.+)/i);
    return match ? match[1].trim() : null;
  }

  private formatPaymentInstructions(payment: any): string {
    return `
🎵 Music Generation Request
Order ID: ${payment.orderId}

💰 Price: $10 USD
Accept payments in:

BTC: ${payment.walletAddresses.btc}
ETH: ${payment.walletAddresses.eth}
SOL: ${payment.walletAddresses.sol}
USDT: ${payment.walletAddresses.usdt}

Reply 'paid' after sending payment.
`.trim();
  }

  private async sendErrorResponse(tweetId: string): Promise<void> {
    try {
      await this.twitterService.replyToTweet(
        tweetId,
        'Sorry, there was an error processing your request. Please try again later.'
      );
    } catch (error) {
      this.logger.error('Failed to send error response:', error);
    }
  }

  async shutdown(): Promise<void> {
    try {
      this.isRunning = false;
      if (this.checkpointInterval) {
        clearInterval(this.checkpointInterval);
      }
      await this.systemMonitor.stop();
      await this.browserService.close();
      await this.musicService.cleanup();
      this.logger.info('MusiXBot shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
    }
  }
}