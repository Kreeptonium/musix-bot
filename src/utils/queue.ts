import { Logger } from './logger';

interface QueueTask {
  id: string;
  task: () => Promise<any>;
  retries: number;
}

export class QueueManager {
  private queue: QueueTask[] = [];
  private processing: boolean = false;
  private logger: Logger;
  private maxRetries: number = 3;
  private retryDelay: number = 5000; // 5 seconds

  constructor() {
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
  }

  async addTask(id: string, task: () => Promise<any>): Promise<void> {
    this.queue.push({ id, task, retries: 0 });
    this.logger.debug(`Task added to queue: ${id}`);
    
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const currentTask = this.queue[0];
      
      try {
        await this.executeTask(currentTask);
        this.queue.shift(); // Remove completed task
      } catch (error) {
        if (currentTask.retries < this.maxRetries) {
          currentTask.retries++;
          this.logger.warn(`Retrying task ${currentTask.id}, attempt ${currentTask.retries}`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        } else {
          this.logger.error(`Task ${currentTask.id} failed after ${this.maxRetries} attempts`);
          this.queue.shift(); // Remove failed task
        }
      }
    }

    this.processing = false;
  }

  private async executeTask(task: QueueTask): Promise<void> {
    try {
      await task.task();
      this.logger.debug(`Task ${task.id} completed successfully`);
    } catch (error) {
      this.logger.error(`Error executing task ${task.id}:`, error);
      throw error;
    }
  }
}