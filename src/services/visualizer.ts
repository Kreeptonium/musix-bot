import { Logger } from '../utils/logger';
import { createCanvas } from 'canvas';
import * as fs from 'fs/promises';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';

interface VisualizationOptions {
  width: number;
  height: number;
  backgroundColor: string;
  waveColor: string;
  style: 'wave' | 'bars' | 'circular';
}

export class AudioVisualizer {
  private logger: Logger;
  private outputDir: string;

  constructor() {
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.outputDir = path.join(process.cwd(), 'visualizations');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  async createVisualization(
    audioPath: string,
    options: VisualizationOptions = {
      width: 1280,
      height: 720,
      backgroundColor: '#000000',
      waveColor: '#00ff00',
      style: 'wave'
    }
  ): Promise<string> {
    try {
      // Create unique output path
      const outputPath = path.join(
        this.outputDir,
        `viz_${Date.now()}.mp4`
      );

      // Generate visualization based on style
      switch (options.style) {
        case 'wave':
          await this.createWaveform(audioPath, outputPath, options);
          break;
        case 'bars':
          await this.createBars(audioPath, outputPath, options);
          break;
        case 'circular':
          await this.createCircular(audioPath, outputPath, options);
          break;
      }

      return outputPath;
    } catch (error) {
      this.logger.error('Error creating visualization:', error);
      throw error;
    }
  }

  private async createWaveform(
    audioPath: string,
    outputPath: string,
    options: VisualizationOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(audioPath)
        .complexFilter([
          `[0:a]showwaves=s=${options.width}x${options.height}:mode=line:colors=${options.waveColor}[v]`
        ])
        .map('[v]')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  private async createBars(
    audioPath: string,
    outputPath: string,
    options: VisualizationOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(audioPath)
        .complexFilter([
          `[0:a]showfreqs=s=${options.width}x${options.height}:mode=bar:ascale=log[v]`
        ])
        .map('[v]')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  private async createCircular(
    audioPath: string,
    outputPath: string,
    options: VisualizationOptions
  ): Promise<void> {
    // Implementation for circular visualization
    // This would be more complex and require custom canvas drawing
    this.logger.info('Creating circular visualization...');
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
          this.logger.debug('Cleaned up visualization:', filePath);
        }
      }
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }
}