import { Logger } from './logger';

interface RateLimit {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimit>;
  private logger: Logger;
  private maxRequestsPerHour: number;

  constructor(maxRequestsPerHour: number = 10) {
    this.limits = new Map();
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.maxRequestsPerHour = maxRequestsPerHour;
  }

  async checkLimit(userId: string): Promise<boolean> {
    const now = Date.now();
    const userLimit = this.limits.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new limit
      this.limits.set(userId, {
        count: 1,
        resetTime: now + (60 * 60 * 1000) // 1 hour
      });
      return true;
    }

    if (userLimit.count >= this.maxRequestsPerHour) {
      this.logger.warn(`Rate limit exceeded for user: ${userId}`);
      return false;
    }

    userLimit.count++;
    this.limits.set(userId, userLimit);
    return true;
  }

  async getTimeUntilReset(userId: string): Promise<number> {
    const userLimit = this.limits.get(userId);
    if (!userLimit) return 0;
    
    const now = Date.now();
    return Math.max(0, userLimit.resetTime - now);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [userId, limit] of this.limits) {
      if (now > limit.resetTime) {
        this.limits.delete(userId);
      }
    }
  }
}