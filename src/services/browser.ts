import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { Logger } from '../utils/logger';
import { RetryManager } from '../utils/retry';

export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;  // Added this
  private page: Page | null = null;
  private logger: Logger;
  private retryManager: RetryManager;

  constructor() {
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.retryManager = new RetryManager();
  }

  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: process.env.ENVIRONMENT !== 'development',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080'
        ]
      });

      // Initialize context
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      });

      this.page = await this.context.newPage();

      this.page = await this.browser.newPage();

      // Configure viewport and user agent
      await this.page.setViewportSize({ width: 1920, height: 1080 });
      await this.page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      });

      // Add stealth configuration
      await this.setupStealthMode();

      this.logger.info('Browser initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  private async setupStealthMode(): Promise<void> {
    if (!this.page) return;

    try {
      // Modify WebGL vendor and renderer
      await this.page.addInitScript(() => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
          value: function (type: string, attributes: any) {
            const context = oldGetContext.apply(this, [type, attributes]);
            if (type === 'webgl' || type === 'webgl2') {
              Object.defineProperty(context, 'getParameter', {
                value: function (parameter: number) {
                  if (parameter === 37445) return 'Google Inc. (Intel)';
                  if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                  return oldGetParameter.apply(this, [parameter]);
                }
              });
            }
            return context;
          }
        });
      });

      // Add additional headers
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      });

      this.logger.info('Stealth mode configured successfully');
    } catch (error) {
      this.logger.error('Error setting up stealth mode:', error);
    }
  }

  async getPage(): Promise<Page> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    return this.page;
  }

  async navigateWithRetry(url: string, options: { maxAttempts?: number, timeout?: number } = {}): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    await this.retryManager.retry(
      async () => {
        await this.page?.goto(url, {
          waitUntil: 'networkidle',
          timeout: options.timeout || 30000
        });
      },
      {
        maxAttempts: options.maxAttempts || 3,
        delay: 2000,
        backoff: true
      }
    );
  }

  async executeWithTimeout<T>(
    action: () => Promise<T>,
    timeout: number,
    description: string
  ): Promise<T> {
    try {
      const result = await Promise.race([
        action(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${description}`)), timeout)
        )
      ]);
      return result as T;
    } catch (error) {
      this.logger.error(`Timeout executing ${description}:`, error);
      throw error;
    }
  }

  async waitForSelectorWithRetry(
    selector: string,
    options: { timeout?: number; maxAttempts?: number } = {}
  ): Promise<void> {
    if (!this.page) throw new Error('Browser not initialized');

    await this.retryManager.retry(
      async () => {
        await this.page?.waitForSelector(selector, {
          timeout: options.timeout || 10000
        });
      },
      {
        maxAttempts: options.maxAttempts || 3,
        delay: 1000,
        backoff: true
      }
    );
  }

  async screenshot(path: string): Promise<void> {
    if (this.page) {
      await this.page.screenshot({ path });
      this.logger.info(`Screenshot saved to ${path}`);
    }
  }


  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.logger.info('Browser closed');
    }
  }

  async clearCookies(): Promise<void> {
    if (this.context) {
      await this.context.clearCookies();
      this.logger.info('Cookies cleared');
    }
  }
  

  async reload(): Promise<void> {
    if (this.page) {
      await this.page.reload({ waitUntil: 'networkidle' });
      this.logger.info('Page reloaded');
    }
  }
}