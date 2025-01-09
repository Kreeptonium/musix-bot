import { BrowserService } from '../services/browser';
import { TwitterService } from '../services/twitter';
import { MusicService } from '../services/music';
import { PaymentService } from '../services/payment';
import { MediaHandler } from '../services/media';
import { QueueManager } from '../utils/queue';
import { Logger } from '../utils/logger';
import { StorageService, StoredRequest } from '../services/storage';
import { RateLimiter } from '../utils/rateLimiter';
import { RetryManager } from '../utils/retry';
import { MonitoringService } from '../services/monitor';
import { WebhookHandler, WebhookEvent } from '../services/webhook';
import { MusicGenerator, MusicGenerationConfig } from '../services/musicGenerator'
import { BlockchainMonitor } from '../services/blockchain';
import { AudioVisualizer } from '../services/visualizer';
import { Scheduler } from '../services/scheduler';
import { TaskManager } from '../tasks';

export class MusiXBot {
  private browserService: BrowserService;
  private twitterService: TwitterService;
  private musicService: MusicService;
  private paymentService: PaymentService;
  private mediaHandler: MediaHandler;
  private queueManager: QueueManager;
  private logger: Logger;
  private storageService: StorageService;
  private rateLimiter: RateLimiter;
  private requests: Map<string, any> = new Map();
  private retryManager: RetryManager;
  private monitoringService: MonitoringService;
  private webhookHandler: WebhookHandler;
  private musicGenerator: MusicGenerator;
  private blockchainMonitor: BlockchainMonitor;
  private audioVisualizer: AudioVisualizer;
  private scheduler: Scheduler;
  private taskManager: TaskManager;

  constructor() {
    this.browserService = new BrowserService();
    this.twitterService = new TwitterService(this.browserService);
    this.musicService = new MusicService();
    this.paymentService = new PaymentService();
    this.mediaHandler = new MediaHandler();
    this.queueManager = new QueueManager();
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.requests = new Map(); // Initialize the requests Map
    this.storageService = new StorageService();
    this.rateLimiter = new RateLimiter();
    this.retryManager = new RetryManager();
    this.monitoringService = new MonitoringService();
    this.blockchainMonitor = new BlockchainMonitor();
    this.audioVisualizer = new AudioVisualizer();
    this.scheduler = new Scheduler();
    this.taskManager = new TaskManager(
      this.storageService,
      this.musicService,
      this.audioVisualizer,
      this.paymentService
    );
    this.setupScheduledTasks();

    const musicConfig: MusicGenerationConfig = {
      apiKey: process.env.MUSIC_API_KEY || '',
      apiEndpoint: process.env.MUSIC_API_ENDPOINT || '',
      maxDuration: 300, // 5 minutes
      outputFormat: 'mp3'
    };

    this.musicGenerator = new MusicGenerator(musicConfig);
    this.webhookHandler = new WebhookHandler(
      this.paymentService,
      this.storageService
    );

    // Set up webhook event handling
    this.webhookHandler.on('payment_verified', async (data) => {
      await this.handleVerifiedPayment(data);
    });

    // Set up blockchain monitoring events
    this.blockchainMonitor.on('transaction', async (tx) => {
      await this.handleTransaction(tx);
    });
    
  }

  async initialize(): Promise<void> {
    try {
      await this.browserService.initialize();
      await this.musicService.initialize();
      await this.mediaHandler.initialize();
      await this.twitterService.login();
      await this.startMonitoringMentions();
      await this.browserService.initialize();
      await this.musicService.initialize();
      await this.mediaHandler.initialize();
      await this.audioVisualizer.initialize();
      await this.scheduler.start();

      try {
        // ... other initializations ...
        await this.scheduler.start();
        this.logger.info('Scheduled tasks initialized');
      } catch (error) {
        this.logger.error('Failed to initialize scheduled tasks:', error);
        throw error;
      }

      this.startCleanupInterval();

      // Start monitoring
      await this.monitoringService.start();
      
      // Start watching payment addresses
      const addresses = this.paymentService.getPaymentAddresses();
      for (const [chain, address] of Object.entries(addresses)) {
        await this.blockchainMonitor.watchAddress(chain, address);
      }

      this.logger.info('All services initialized successfully');

      // Login with retry
      await this.retryManager.retry(
        async () => await this.twitterService.login(),
        {
          maxAttempts: 3,
          delay: 2000,
          onRetry: (error, attempt) => {
            this.monitoringService.updateServiceStatus('twitter', 'degraded', {
              error: error.message,
              attempt
            });
          }
        }

        
      );


      await this.startMonitoringMentions();
      this.startCleanupInterval();
      this.monitoringService.updateServiceStatus('bot', 'healthy');
      this.logger.info('MusiXBot initialized successfully');
    } catch (error) {
      this.monitoringService.updateServiceStatus('bot', 'unhealthy', error);
      this.logger.error('Failed to initialize MusiXBot:', error);
      throw error;
    }
  }

  private async handleMention(mention: any): Promise<void> {
    const mentionId = `mention-${mention.id}`;
    
    await this.queueManager.addTask(mentionId, async () => {
      try {
        await this.retryManager.retry(async () => {
          // Check rate limit
          const canProceed = await this.rateLimiter.checkLimit(mention.author_id);
          if (!canProceed) {
            const timeUntilReset = await this.rateLimiter.getTimeUntilReset(mention.author_id);
            await this.twitterService.replyToTweet(
              mention.url,
              `You've reached the maximum requests per hour. Please try again in ${Math.ceil(timeUntilReset / (60 * 1000))} minutes.`
            );
            return;
          }

          // Extract and validate prompt
          const prompt = this.extractPrompt(mention.text);
          if (!prompt) {
            await this.twitterService.replyToTweet(
              mention.url,
              "Please use the format: /music [your prompt]. Example: /music lofi beats with piano"
            );
            return;
          }

          // Check for existing request
          const existingRequest = await this.storageService.getRequest(mention.id);
          if (existingRequest) {
            await this.twitterService.replyToTweet(
              mention.url,
              `This request is already being processed.\nOrder ID: ${existingRequest.payment.orderId}`
            );
            return;
          }

          // Create payment request
          const payment = await this.paymentService.createPaymentRequest(mention.id);

          // Store request
          await this.storageService.storeRequest({
            tweetId: mention.id,
            userId: mention.author_id,
            prompt,
            payment,
            timestamp: new Date()
          });

          // Reply with payment instructions
          await this.twitterService.replyToTweet(
            mention.url,
            this.formatPaymentInstructions(payment)
          );

        }, {
          maxAttempts: 3,
          delay: 2000,
          backoff: true,
          onRetry: (error, attempt) => {
            this.logger.warn(`Retrying mention handling: Attempt ${attempt}`, {
              mentionId,
              error: error.message
            });
          }
        });

      } catch (error) {
        this.logger.error('Error handling mention:', error);
        
        // Try to notify the user about the error
        try {
          await this.twitterService.replyToTweet(
            mention.url,
            "Sorry, we encountered an error processing your request. Please try again later."
          );
        } catch (replyError) {
          this.logger.error('Failed to send error notification:', replyError);
        }
        
        throw error;
      }
    });
  }

  private async handlePaymentConfirmation(tweet: any): Promise<void> {
    const confirmationId = `payment-${tweet.id}`;
    
    await this.queueManager.addTask(confirmationId, async () => {
      try {
        const request = await this.storageService.getRequest(tweet.reference_tweet_id);
        if (!request) {
          this.logger.warn('Payment confirmation received for unknown request:', tweet.reference_tweet_id);
          return;
        }

        // Check if payment was already processed
        if (request.payment.status === 'completed') {
          await this.twitterService.replyToTweet(
            tweet.url,
            "This payment was already processed. Please check your previous replies for the generated music."
          );
          return;
        }

        // Verify payment
        const isVerified = await this.paymentService.verifyPayment(request.payment.orderId);

        if (isVerified) {
          try {
            // Update payment status
            await this.storageService.updateRequestStatus(tweet.reference_tweet_id, 'completed');

            // Generate music
            const generatedMusic = await this.musicService.generateMusic({
              prompt: request.prompt,
              duration: 30
            });

            // Upload and reply with music
            const mediaPath = await this.mediaHandler.prepareMediaForUpload(generatedMusic.filePath);
            
            await this.twitterService.replyWithMedia(
              tweet.url,
              `✨ Your music is ready! 🎵\nPrompt: "${request.prompt}"\nOrder ID: ${request.payment.orderId}`,
              mediaPath
            );

            // Cleanup
            await this.mediaHandler.cleanup();
          } catch (error) {
            // If any error occurs during music generation or upload
            this.logger.error('Error processing verified payment:', error);
            await this.storageService.updateRequestStatus(tweet.reference_tweet_id, 'failed');
            
            await this.twitterService.replyToTweet(
              tweet.url,
              "We encountered an error while generating your music. Our team has been notified. Please contact support with your Order ID."
            );
            throw error;
          }
        } else {
          // Update payment status to failed
          await this.storageService.updateRequestStatus(tweet.reference_tweet_id, 'failed');
          
          await this.twitterService.replyToTweet(
            tweet.url,
            `Payment verification failed ❌\nPlease ensure you've:\n1. Sent the exact amount\n2. Used the correct wallet address\n3. Waited for transaction confirmation\n\nOrder ID: ${request.payment.orderId}`
          );
        }

      } catch (error) {
        this.logger.error('Error handling payment confirmation:', error);
        // If we haven't already handled the error specifically
        if (error.message !== 'Already handled') {
          await this.twitterService.replyToTweet(
            tweet.url,
            "An unexpected error occurred. Please try again later or contact support."
          );
        }
        throw error;
      }
    });
  }

  private formatPaymentInstructions(payment: any): string {
    return `
🎵 Music Generation Request
Order ID: ${payment.orderId}

💰 Price: $${payment.amount} USD
Accept payments in:

BTC: ${payment.walletAddresses.btc}
ETH: ${payment.walletAddresses.eth}
SOL: ${payment.walletAddresses.sol}
USDT: ${payment.walletAddresses.usdt}

Reply 'paid' to this tweet after sending payment.
`.trim();
  }

  // ... (previous methods remain the same)

  async shutdown(): Promise<void> {
    try {
      await this.musicService.cleanup();
      await this.mediaHandler.cleanup();
      await this.browserService.close();
      await this.scheduler.stop();
      this.logger.info('MusiXBot shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
    }
  }


  private async startMonitoringMentions(): Promise<void> {
    try {
      this.logger.info('Starting to monitor mentions');
      await this.twitterService.monitorMentions(async (mention) => {
        await this.handleMention(mention);
      });
    } catch (error) {
      this.logger.error('Error starting mention monitoring:', error);
      throw error;
    }
  }
  
  private startCleanupInterval(): void {
    const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
    setInterval(async () => {
      try {
        await this.musicService.cleanup();
        await this.mediaHandler.cleanup();
        this.logger.info('Cleanup completed successfully');
      } catch (error) {
        this.logger.error('Error during cleanup:', error);
      }
    }, CLEANUP_INTERVAL);
  }
  
  private extractPrompt(text: string): string | null {
    const match = text.match(/\/music\s+(.+)/i);
    return match ? match[1].trim() : null;
  }
  
  private async storeRequest(tweetId: string, requestData: {
    prompt: string;
    payment: any;
    timestamp: Date;
  }): Promise<void> {
    try {
      // Store request data in memory (could be replaced with database)
      this.requests.set(tweetId, requestData);
      this.logger.debug('Stored request:', { tweetId, requestData });
    } catch (error) {
      this.logger.error('Error storing request:', error);
      throw error;
    }
  }
  
  private async getStoredRequest(tweetId: string): Promise<any> {
    try {
      return this.requests.get(tweetId);
    } catch (error) {
      this.logger.error('Error getting stored request:', error);
      throw error;
    }
  }

  // private async handleVerifiedPayment(data: { orderId: string; request: any }): Promise<void> {
  //   try {
  //     // Generate music
  //     const musicPath = await this.musicGenerator.generateMusic({
  //       prompt: data.request.prompt,
  //       duration: 30
  //     });

  //     // Upload and reply
  //     await this.twitterService.replyWithMedia(
  //       data.request.tweetId,
  //       `✨ Your music is ready! 🎵\nPrompt: "${data.request.prompt}"\nOrder ID: ${data.orderId}`,
  //       musicPath
  //     );

  //     // Cleanup
  //     await fs.unlink(musicPath);

  //   } catch (error) {
  //     this.logger.error('Error handling verified payment:', error);
      
  //     await this.twitterService.replyToTweet(
  //       data.request.tweetId,
  //       "We encountered an error generating your music. Our team has been notified. Please contact support."
  //     );
  //   }
  // }

  private async handleTransaction(tx: any): Promise<void> {
    try {
      const payment = await this.paymentService.findPaymentByAddress(tx.to);
      if (!payment) return;

      // Verify transaction amount
      if (await this.paymentService.verifyTransactionAmount(tx)) {
        await this.handleVerifiedPayment(payment);
      }
    } catch (error) {
      this.logger.error('Error handling transaction:', error);
    }
  }
  private async handleVerifiedPayment(payment: any): Promise<void> {
    try {
      // Generate music
      const musicPath = await this.musicGenerator.generateMusic({
        prompt: payment.request.prompt,
        duration: 30
      });

      // Create visualization
      const vizPath = await this.audioVisualizer.createVisualization(
        musicPath,
        {
          width: 1280,
          height: 720,
          backgroundColor: '#000000',
          waveColor: '#00ff00',
          style: 'wave'
        }
      );

      // Combine audio and video
      const finalPath = await this.combineAudioAndVideo(musicPath, vizPath);

      // Upload and reply
      await this.twitterService.replyWithMedia(
        payment.request.tweetId,
        `✨ Your music is ready! 🎵\nPrompt: "${payment.request.prompt}"`,
        finalPath
      );

      // Cleanup
      await Promise.all([
        fs.unlink(musicPath),
        fs.unlink(vizPath),
        fs.unlink(finalPath)
      ]);

    } catch (error) {
      this.logger.error('Error handling verified payment:', error);
      throw error;
    }
  }

  private async combineAudioAndVideo(audioPath: string, videoPath: string): Promise<string> {
    // Implementation for combining audio and video
    // This would use ffmpeg to merge the files
    return '';
  }

  private setupScheduledTasks(): void {
    // Register cleanup tasks
    this.scheduler.registerJob({
      id: 'storage-cleanup',
      name: 'Storage Cleanup',
      interval: 60 * 60 * 1000, // Every hour
      task: () => this.taskManager.cleanupStorageTask()
    });

    this.scheduler.registerJob({
      id: 'media-cleanup',
      name: 'Media Cleanup',
      interval: 30 * 60 * 1000, // Every 30 minutes
      task: () => this.taskManager.cleanupMediaTask()
    });

    this.scheduler.registerJob({
      id: 'payment-check',
      name: 'Payment Check',
      interval: 5 * 60 * 1000, // Every 5 minutes
      task: () => this.taskManager.checkPendingPaymentsTask()
    });

    this.scheduler.registerJob({
      id: 'health-check',
      name: 'Health Check',
      interval: 15 * 60 * 1000, // Every 15 minutes
      task: () => this.taskManager.healthCheckTask()
    });

    // Set up scheduler event handlers
    this.scheduler.on('jobStart', (job) => {
      this.logger.debug(`Started job: ${job.name}`);
    });

    this.scheduler.on('jobComplete', (job) => {
      this.logger.debug(`Completed job: ${job.name}`);
    });

    this.scheduler.on('jobError', ({ job, error }) => {
      this.logger.error(`Error in job ${job.name}:`, error);
    });
  }



}
