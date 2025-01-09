// src/services/audio/processor.ts
import { Logger } from '../../utils/logger';
import { RetryManager } from '../../utils/retry';
import { AudioProcessingOptions, AudioMetadata } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { Lame } from 'node-lame';
import Sox from 'sox-stream';

export class AudioProcessor {
  private logger: Logger;
  private retryManager: RetryManager;
  private workDir: string;

  constructor() {
    this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
    this.retryManager = new RetryManager();
    this.workDir = path.join(process.cwd(), 'audio_processing');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.workDir, { recursive: true });
  }

  async processAudio(
    inputPath: string,
    options: AudioProcessingOptions
  ): Promise<string> {
    try {
      let currentPath = inputPath;
      const steps: Array<() => Promise<string>> = [];

      // Build processing pipeline
      if (options.normalize) {
        steps.push(() => this.normalize(currentPath));
      }

      if (options.fadeIn || options.fadeOut) {
        steps.push(() => this.applyFades(currentPath, options.fadeIn, options.fadeOut));
      }

      if (options.equalizer) {
        steps.push(() => this.applyEQ(currentPath, options.equalizer));
      }

      if (options.compress) {
        steps.push(() => this.applyCompression(currentPath, options.compress));
      }

      if (options.reverb) {
        steps.push(() => this.applyReverb(currentPath, options.reverb));
      }

      if (options.tempo) {
        steps.push(() => this.adjustTempo(currentPath, options.tempo));
      }

      if (options.pitch) {
        steps.push(() => this.adjustPitch(currentPath, options.pitch));
      }

      // Execute pipeline
      for (const step of steps) {
        currentPath = await step();
      }

      return currentPath;
    } catch (error) {
      this.logger.error('Audio processing failed:', error);
      throw error;
    }
  }

  private async normalize(inputPath: string): Promise<string> {
    const outputPath = this.getOutputPath(inputPath, 'normalized');
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters('volumedetect')
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async applyFades(
    inputPath: string,
    fadeIn?: number,
    fadeOut?: number
  ): Promise<string> {
    const outputPath = this.getOutputPath(inputPath, 'faded');
    
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);
      
      if (fadeIn) {
        command = command.audioFilters(`afade=t=in:ss=0:d=${fadeIn}`);
      }
      
      if (fadeOut) {
        const duration = this.getAudioDuration(inputPath);
        command = command.audioFilters(`afade=t=out:st=${duration - fadeOut}:d=${fadeOut}`);
      }
      
      command
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async applyEQ(
    inputPath: string,
    eq: NonNullable<AudioProcessingOptions['equalizer']>
  ): Promise<string> {
    const outputPath = this.getOutputPath(inputPath, 'eq');
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters([
          eq.bass ? `equalizer=f=100:width_type=o:width=2:g=${eq.bass}` : '',
          eq.mid ? `equalizer=f=1000:width_type=o:width=2:g=${eq.mid}` : '',
          eq.treble ? `equalizer=f=8000:width_type=o:width=2:g=${eq.treble}` : ''
        ].filter(Boolean))
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async applyCompression(
    inputPath: string,
    compress: NonNullable<AudioProcessingOptions['compress']>
  ): Promise<string> {
    const outputPath = this.getOutputPath(inputPath, 'compressed');
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters(`acompressor=threshold=${compress.threshold}:ratio=${compress.ratio}:attack=${compress.attack}:release=${compress.release}`)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async applyReverb(
    inputPath: string,
    reverb: NonNullable<AudioProcessingOptions['reverb']>
  ): Promise<string> {
    const outputPath = this.getOutputPath(inputPath, 'reverb');
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters(`aecho=0.8:0.9:1000|1800:0.3|0.25`)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async adjustTempo(inputPath: string, tempo: number): Promise<string> {
    const outputPath = this.getOutputPath(inputPath, 'tempo');
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters(`atempo=${tempo/100}`)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private async adjustPitch(inputPath: string, pitch: number): Promise<string> {
    const outputPath = this.getOutputPath(inputPath, 'pitch');
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters(`asetrate=44100*2^(${pitch}/12)`)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  async getMetadata(filePath: string): Promise<AudioMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else {
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
          resolve({
            duration: metadata.format.duration || 0,
            sampleRate: audioStream?.sample_rate || 44100,
            channels: audioStream?.channels || 2,
            format: metadata.format.format_name,
            bitrate: metadata.format.bit_rate
          });
        }
      });
    });
  }

  private getOutputPath(inputPath: string, suffix: string): string {
    const parsedPath = path.parse(inputPath);
    return path.join(
      this.workDir,
      `${parsedPath.name}_${suffix}${parsedPath.ext}`
    );
  }

  private async getAudioDuration(filePath: string): Promise<number> {
    const metadata = await this.getMetadata(filePath);
    return metadata.duration;
  }

  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.workDir);
      const ONE_HOUR = 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.workDir, file);
        const stats = await fs.stat(filePath);

        if (Date.now() - stats.mtimeMs > ONE_HOUR) {
          await fs.unlink(filePath);
          this.logger.debug('Cleaned up processed file:', filePath);
        }
      }
    } catch (error) {
      this.logger.error('Audio cleanup error:', error);
    }
  }
}