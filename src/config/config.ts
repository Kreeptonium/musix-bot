import { BotConfig } from '../types';
import dotenv from 'dotenv';

dotenv.config();

export const config: BotConfig = {
  dryRun: process.env.DRY_RUN === 'true',
  apiKey: process.env.TWITTER_API_KEY || '',
  apiSecret: process.env.TWITTER_API_SECRET || '',
  accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
  accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
  botName: process.env.BOT_NAME || 'MusiXBot',
  environment: process.env.ENVIRONMENT || 'development'
};

// Validate config
Object.entries(config).forEach(([key, value]) => {
  if (!value && key !== 'dryRun') {
    throw new Error(`Missing configuration: ${key}`);
  }
});

export const WALLET_ADDRESSES = {
  btc: process.env.BTC_WALLET,
  eth: process.env.ETH_WALLET,
  sol: process.env.SOL_WALLET,
  usdt: process.env.USDT_WALLET
};

export const MUSIC_CONFIG = {
  apiKey: process.env.MUSIC_API_KEY,
  apiUrl: process.env.MUSIC_API_URL
};