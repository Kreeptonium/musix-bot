import { Page } from 'playwright';
import { Logger } from '../utils/logger';
import { BrowserService } from './browser';
import { StorageService } from './storage';
import { RateLimiter } from '../utils/rateLimiter';
import { MediaHandler } from './media';
import { RetryManager } from '../utils/retry';

interface TweetHandlers {
    onMusicRequest: (tweet: any) => Promise<void>;
    onPaymentConfirmation: (tweet: any) => Promise<void>;
}

export class TwitterService {
    private logger: Logger;
    private browserService: BrowserService;
    private storageService: StorageService;
    private rateLimiter: RateLimiter;
    private mediaHandler: MediaHandler;
    private retryManager: RetryManager;
    private isAuthenticated: boolean = false;
    private page: Page | null = null;
    private handlers: TweetHandlers | null = null;

    constructor(
        browserService: BrowserService,
        storageService: StorageService,
        mediaHandler: MediaHandler
    ) {
        this.browserService = browserService;
        this.storageService = storageService;
        this.mediaHandler = mediaHandler;
        this.rateLimiter = new RateLimiter();
        this.retryManager = new RetryManager();
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    }

    async initialize(handlers: TweetHandlers): Promise<void> {
        try {
            this.handlers = handlers;
            await this.login();
            await this.setupMentionMonitoring();
            this.logger.info('Twitter service initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Twitter service:', error);
            throw error;
        }
    }

    async login(): Promise<boolean> {
        try {
            this.page = await this.browserService.getPage();
            
            await this.page.goto('https://twitter.com/login', {
                waitUntil: 'networkidle'
            });

            await this.page.waitForSelector('input[autocomplete="username"]');
            await this.page.fill('input[autocomplete="username"]', process.env.TWITTER_USERNAME || '');
            
            await this.page.click('div[role="button"]:has-text("Next")');
            await this.handleVerification();

            await this.page.waitForSelector('input[type="password"]');
            await this.page.fill('input[type="password"]', process.env.TWITTER_PASSWORD || '');

            await this.page.click('div[role="button"]:has-text("Log in")');
            await this.page.waitForSelector('a[aria-label="Profile"]', { timeout: 30000 });
            
            this.isAuthenticated = true;
            this.logger.info('Successfully logged into Twitter');
            
            return true;
        } catch (error) {
            this.logger.error('Failed to login to Twitter:', error);
            throw error;
        }
    }

    private async handleVerification(): Promise<void> {
        try {
            const emailPrompt = await this.page?.waitForSelector(
                'text=verify your identity by entering the email address',
                { timeout: 5000 }
            ).catch(() => null);
            
            if (emailPrompt) {
                await this.page?.fill('input[autocomplete="email"]', process.env.TWITTER_EMAIL || '');
                await this.page?.click('div[role="button"]:has-text("Next")');
                this.logger.info('Handled email verification');
            }
        } catch (error) {
            this.logger.error('Error handling verification:', error);
            throw error;
        }
    }

    private async setupMentionMonitoring(): Promise<void> {
        if (!this.isAuthenticated || !this.page) {
            throw new Error('Not authenticated');
        }

        try {
            await this.page.goto('https://twitter.com/notifications/mentions', {
                waitUntil: 'networkidle'
            });

            await this.page.evaluate(() => {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList') {
                            const mentions = document.querySelectorAll('article[data-testid="tweet"]');
                            mentions.forEach(mention => {
                                window.dispatchEvent(new CustomEvent('newMention', {
                                    detail: {
                                        id: mention.getAttribute('data-tweet-id'),
                                        text: mention.textContent,
                                        authorId: mention.getAttribute('data-user-id')
                                    }
                                }));
                            });
                        }
                    });
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            });

            await this.page.exposeFunction('handleNewMention', async (data: any) => {
                await this.processMention(data);
            });

            this.logger.info('Mention monitoring setup completed');
        } catch (error) {
            this.logger.error('Error setting up mention monitoring:', error);
            throw error;
        }
    }

    private async processMention(mention: any): Promise<void> {
        if (!this.handlers) return;

        try {
            const canProceed = await this.rateLimiter.checkLimit(mention.authorId);
            if (!canProceed) {
                const timeUntilReset = await this.rateLimiter.getTimeUntilReset(mention.authorId);
                await this.replyToTweet(
                    mention.id,
                    `Rate limit reached. Please try again in ${Math.ceil(timeUntilReset / 60000)} minutes.`
                );
                return;
            }

            if (mention.text.toLowerCase().includes('/music')) {
                await this.handlers.onMusicRequest(mention);
            } else if (mention.text.toLowerCase().includes('paid')) {
                await this.handlers.onPaymentConfirmation(mention);
            }
        } catch (error) {
            this.logger.error('Error processing mention:', error);
        }
    }

    async replyToTweet(tweetId: string, content: string): Promise<boolean> {
        return await this.retryManager.retry(async () => {
            if (!this.isAuthenticated || !this.page) {
                throw new Error('Not authenticated');
            }

            await this.page.goto(`https://twitter.com/tweet/${tweetId}`);
            await this.page.click('div[aria-label="Reply"]');
            await this.page.fill('div[role="textbox"]', content);
            await this.page.click('div[role="button"]:has-text("Reply")');
            
            this.logger.info('Reply posted successfully');
            return true;
        });
    }

    async replyWithMedia(tweetId: string, content: string, mediaPath: string): Promise<boolean> {
        return await this.retryManager.retry(async () => {
            if (!this.isAuthenticated || !this.page) {
                throw new Error('Not authenticated');
            }

            await this.page.goto(`https://twitter.com/tweet/${tweetId}`);
            await this.page.click('div[aria-label="Reply"]');
            
            await this.page.fill('div[role="textbox"]', content);

            const fileInput = await this.page.waitForSelector('input[type="file"]');
            await fileInput?.setInputFiles(mediaPath);
            await this.page.waitForSelector('[aria-label="Media upload completed"]');

            await this.page.click('div[role="button"]:has-text("Reply")');
            
            this.logger.info('Reply with media posted successfully');
            return true;
        });
    }

    async isLoggedIn(): Promise<boolean> {
        return this.isAuthenticated;
    }

    async cleanup(): Promise<void> {
        if (this.page) {
            await this.page.close();
            this.page = null;
            this.isAuthenticated = false;
        }
    }
}