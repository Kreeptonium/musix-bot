// src/services/media.ts

import { Logger } from '../utils/logger';
import { RetryManager } from '../utils/retry';
import * as fs from 'fs/promises';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';

interface MediaOptions {
  outputFormat: 'mp4' | 'mp3' | 'wav';
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: string;
}

interface FileInfo {
  size: number;
  duration?: number;
  format?: string;
}

export class MediaHandler {
  private logger: Logger;
  private retryManager: RetryManager;
  private outputDir: string;
  private tempDir: string;

  constructor() {
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.retryManager = new RetryManager();
    this.outputDir = path.join(process.cwd(), 'media', 'output');
    this.tempDir = path.join(process.cwd(), 'media', 'temp');
  }

  async initialize(): Promise<void> {
    try {
      // Create necessary directories
      await fs.mkdir(this.outputDir, { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });
      this.logger.info('Media handler initialized');
    } catch (error) {
      this.logger.error('Failed to initialize media handler:', error);
      throw error;
    }
  }

  async createVideoFromAudio(
    audioPath: string,
    options: MediaOptions = { outputFormat: 'mp4' }
  ): Promise<string> {
    try {
      const outputPath = path.join(
        this.outputDir,
        `video_${Date.now()}.${options.outputFormat}`
      );

      return await this.retryManager.retry(async () => {
        return new Promise((resolve, reject) => {
          const command = ffmpeg()
            .input(audioPath)
            .input(this.generateWaveformCanvas(options))
            .videoBitrate(options.bitrate || '1000k')
            .videoCodec('libx264')
            .size(`${options.width || 1280}x${options.height || 720}`)
            .fps(options.fps || 30)
            .duration(options.duration)
            .on('end', () => {
              this.logger.info('Video creation completed');
              resolve(outputPath);
            })
            .on('error', (err) => {
              this.logger.error('Error creating video:', err);
              reject(err);
            })
            .save(outputPath);
        });
      });
    } catch (error) {
      this.logger.error('Failed to create video:', error);
      throw error;
    }
  }

  private generateWaveformCanvas(options: MediaOptions): string {
    // Create a canvas with waveform visualization
    // This is a placeholder - implement actual waveform generation
    const canvasPath = path.join(this.tempDir, `waveform_${Date.now()}.png`);
    // Implementation needed
    return canvasPath;
  }

  async combineAudioAndVideo(
    audioPath: string,
    videoPath: string,
    options: MediaOptions = { outputFormat: 'mp4' }
  ): Promise<string> {
    try {
      const outputPath = path.join(
        this.outputDir,
        `combined_${Date.now()}.${options.outputFormat}`
      );

      return await this.retryManager.retry(async () => {
        return new Promise((resolve, reject) => {
          ffmpeg()
            .input(videoPath)
            .input(audioPath)
            .videoCodec('copy')
            .audioCodec('aac')
            .on('end', () => {
              this.logger.info('Media combination completed');
              resolve(outputPath);
            })
            .on('error', (err) => {
              this.logger.error('Error combining media:', err);
              reject(err);
            })
            .save(outputPath);
        });
      });
    } catch (error) {
      this.logger.error('Failed to combine media:', error);
      throw error;
    }
  }

  async applyWatermark(
    videoPath: string,
    watermarkText: string
  ): Promise<string> {
    try {
      const outputPath = path.join(this.outputDir, `watermarked_${Date.now()}.mp4`);

      return await this.retryManager.retry(async () => {
        return new Promise((resolve, reject) => {
          ffmpeg()
            .input(videoPath)
            .videoFilters({
              filter: 'drawtext',
              options: {
                text: watermarkText,
                fontsize: 24,
                fontcolor: 'white',
                x: '(w-text_w)/2',
                y: 'h-th-10',
                alpha: 0.8
              }
            })
            .on('end', () => {
              this.logger.info('Watermark applied successfully');
              resolve(outputPath);
            })
            .on('error', (err) => {
              this.logger.error('Error applying watermark:', err);
              reject(err);
            })
            .save(outputPath);
        });
      });
    } catch (error) {
      this.logger.error('Failed to apply watermark:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Clean up temp files older than 1 hour
      const ONE_HOUR = 60 * 60 * 1000;
      const now = Date.now();

      for (const dir of [this.tempDir, this.outputDir]) {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtimeMs > ONE_HOUR) {
            await fs.unlink(filePath);
            this.logger.debug(`Cleaned up file: ${filePath}`);
          }
        }
      }

      this.logger.info('Media cleanup completed');
    } catch (error) {
      this.logger.error('Error during media cleanup:', error);
    }
  }

  
  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const stats = await fs.stat(filePath);
      
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) {
            reject(err);
            return;
          }

          resolve({
            size: stats.size,
            duration: metadata.format.duration,
            format: metadata.format.format_name
          });
        });
      });
    } catch (error) {
      this.logger.error('Failed to get file info:', error);
      throw error;
    }
  }
}