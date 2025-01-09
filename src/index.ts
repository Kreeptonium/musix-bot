import dotenv from 'dotenv';
import { MusiXBot } from './bot/MusiXBot';
import { Logger } from './utils/logger';

// Load environment variables
dotenv.config();

const logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
const bot = new MusiXBot();

async function main() {
  try {
    await bot.start();

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await bot.shutdown();
      process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught Exception:', error);
      await bot.shutdown();
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();