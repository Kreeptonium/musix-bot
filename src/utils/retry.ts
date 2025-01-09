import { Logger } from './logger';

interface RetryOptions {
  maxAttempts: number;
  delay: number;
  backoff?: boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

export class RetryManager {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
  }

  async retry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = { maxAttempts: 3, delay: 1000, backoff: true }
  ): Promise<T> {
    let lastError: Error = new Error('No attempts made');
    
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        // Convert unknown error to Error type
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;
        
        if (attempt === options.maxAttempts) {
          this.logger.error(`All retry attempts failed:`, error);
          throw error;
        }

        const delayTime = options.backoff ? 
          options.delay * Math.pow(2, attempt - 1) : 
          options.delay;
        
        this.logger.warn(`Attempt ${attempt} failed, retrying in ${delayTime}ms`, {
          error: error.message,
          attempt,
          nextDelay: delayTime
        });

        if (options.onRetry) {
          options.onRetry(error, attempt);
        }

        await new Promise(resolve => setTimeout(resolve, delayTime));
      }
    }

    throw lastError;
  }

  async retryWithCondition<T>(
    operation: () => Promise<T>,
    condition: (result: T) => boolean,
    options: RetryOptions = { maxAttempts: 3, delay: 1000, backoff: true }
  ): Promise<T> {
    let lastError: Error = new Error('No attempts made');

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        if (condition(result)) {
          return result;
        }

        if (attempt === options.maxAttempts) {
          throw new Error('Condition not met after all attempts');
        }

        const delayTime = options.backoff ? 
          options.delay * Math.pow(2, attempt - 1) : 
          options.delay;

        this.logger.warn(`Attempt ${attempt} condition not met, retrying in ${delayTime}ms`);
        
        if (options.onRetry) {
          options.onRetry(new Error('Condition not met'), attempt);
        }

        await new Promise(resolve => setTimeout(resolve, delayTime));
      } catch (err) {
        // Convert unknown error to Error type
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        if (attempt === options.maxAttempts) {
          this.logger.error(`All retry attempts failed:`, error);
          throw error;
        }

        const delayTime = options.backoff ? 
          options.delay * Math.pow(2, attempt - 1) : 
          options.delay;
        
        this.logger.warn(`Attempt ${attempt} failed, retrying in ${delayTime}ms`, {
          error: error.message,
          attempt,
          nextDelay: delayTime
        });

        if (options.onRetry) {
          options.onRetry(error, attempt);
        }

        await new Promise(resolve => setTimeout(resolve, delayTime));
      }
    }

    throw lastError;
  }
}