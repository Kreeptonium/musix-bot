// src/deploy.ts

import dotenv from 'dotenv';
import { MusiXBot } from './bot/MusiXBot';
import { Logger } from './utils/logger';

dotenv.config();

const REQUIRED_ENV_VARS = [
    'TWITTER_USERNAME',
    'TWITTER_PASSWORD',
    'TWITTER_EMAIL',
    'ETH_RPC_URL',
    'BTC_WALLET',
    'ETH_WALLET',
    'SOL_WALLET',
    'USDT_WALLET'
];

const logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');

async function validateEnvironment(): Promise<boolean> {
    const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        logger.error('Missing required environment variables:', missing);
        return false;
    }

    return true;
}

async function deploy() {
    try {
        logger.info('Starting deployment...');

        // Validate environment
        if (!await validateEnvironment()) {
            process.exit(1);
        }

        // Initialize bot
        const bot = new MusiXBot();

        // Handle shutdown signals
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT. Starting graceful shutdown...');
            await bot.shutdown();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            logger.info('Received SIGTERM. Starting graceful shutdown...');
            await bot.shutdown();
            process.exit(0);
        });

        // Handle uncaught errors
        process.on('uncaughtException', async (error) => {
            logger.error('Uncaught exception:', error);
            await bot.shutdown();
            process.exit(1);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            logger.error('Unhandled rejection at:', promise, 'reason:', reason);
            await bot.shutdown();
            process.exit(1);
        });

        // Start bot
        await bot.start();
        logger.info('Deployment completed successfully');

    } catch (error) {
        logger.error('Deployment failed:', error);
        process.exit(1);
    }
}

deploy();