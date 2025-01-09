// src/services/music/providers/beatoven.ts
import { Logger } from '../../../utils/logger';
import { RetryManager } from '../../../utils/retry';
import { MusicProvider, MusicGenerationOptions, GeneratedMusic } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class BeatovenProvider implements MusicProvider {
  private logger: Logger;
  private retryManager: RetryManager;
  private apiKey: string;
  private apiEndpoint: string;
  private outputDir: string;

  name = 'beatoven';

  constructor() {
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.retryManager = new RetryManager();
    this.apiKey = process.env.BEATOVEN_API_KEY || '';
    this.apiEndpoint = 'https://api.beatoven.ai/v1';
    this.outputDir = path.join(process.cwd(), 'generated_music', 'beatoven');
  }

  async generateMusic(options: MusicGenerationOptions): Promise<GeneratedMusic> {
    try {
      // Create music generation session
      const session = await this.createSession(options);

      // Generate the music
      const musicBuffer = await this.generateTrack(session.sessionId, options);

      // Save to file
      const outputPath = path.join(
        this.outputDir,
        `beatoven_${Date.now()}.${options.format || 'mp3'}`
      );

      await fs.writeFile(outputPath, musicBuffer);

      return {
        filePath: outputPath,
        duration: options.duration || 30,
        format: options.format || 'mp3',
        metadata: {
          prompt: options.prompt,
          generatedAt: new Date(),
          orderId: `BEAT-${Date.now()}`,
          provider: this.name
        }
      };
    } catch (error) {
      this.logger.error('Beatoven generation failed:', error);
      throw error;
    }
  }

  private async createSession(options: MusicGenerationOptions): Promise<{ sessionId: string }> {
    const response = await this.retryManager.retry(
      async () => await fetch(`${this.apiEndpoint}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey
        },
        body: JSON.stringify({
          prompt: options.prompt,
          duration: options.duration || 30,
          mood: options.mood || this.detectMood(options.prompt),
          genre: options.genre || 'cinematic',
          tempo: options.tempo || 'moderate'
        })
      })
    );

    if (!response.ok) {
      throw new Error(`Beatoven API error: ${response.statusText}`);
    }

    return await response.json();
  }

  private async generateTrack(sessionId: string, options: MusicGenerationOptions): Promise<Buffer> {
    const response = await this.retryManager.retry(
      async () => await fetch(`${this.apiEndpoint}/sessions/${sessionId}/generate`, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Accept': 'audio/mpeg'
        }
      })
    );

    if (!response.ok) {
      throw new Error('Failed to generate track');
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private detectMood(prompt: string): string {
    const moodMap = {
      happy: ['joyful', 'upbeat', 'cheerful', 'happy'],
      sad: ['melancholic', 'sad', 'gloomy', 'depressing'],
      calm: ['peaceful', 'relaxing', 'soothing', 'calm'],
      intense: ['powerful', 'energetic', 'intense', 'dynamic']
    };

    for (const [mood, keywords] of Object.entries(moodMap)) {
      if (keywords.some(keyword => prompt.toLowerCase().includes(keyword))) {
        return mood;
      }
    }

    return 'neutral';
  }

  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.outputDir);
      const ONE_HOUR = 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.outputDir, file);
        const stats = await fs.stat(filePath);

        if (Date.now() - stats.mtimeMs > ONE_HOUR) {
          await fs.unlink(filePath);
          this.logger.debug('Cleaned up file:', filePath);
        }
      }
    } catch (error) {
      this.logger.error('Beatoven cleanup error:', error);
    }
  }
}