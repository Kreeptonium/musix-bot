import { Logger } from '../../../utils/logger';
import { RetryManager } from '../../../utils/retry';
import { MusicProvider, MusicGenerationOptions, GeneratedMusic } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class MubertProvider implements MusicProvider {
    private logger: Logger;
    private retryManager: RetryManager;
    private apiKey: string;
    private apiEndpoint: string;
    private outputDir: string;

    name = 'mubert';

    constructor() {
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.retryManager = new RetryManager();
        this.apiKey = process.env.MUBERT_API_KEY || '';
        this.apiEndpoint = 'https://api-b2b.mubert.com/v2';
        this.outputDir = path.join(process.cwd(), 'generated_music', 'mubert');
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.outputDir, { recursive: true });
    }

    async generateMusic(options: MusicGenerationOptions): Promise<GeneratedMusic> {
        try {
            // Get track token
            const trackToken = await this.getTrackToken(options);

            // Generate music
            const musicBuffer = await this.generateTrack(trackToken, options);

            // Save to file
            const outputPath = path.join(
                this.outputDir,
                `mubert_${Date.now()}.${options.format || 'mp3'}`
            );

            await fs.writeFile(outputPath, musicBuffer);

            return {
                filePath: outputPath,
                duration: options.duration || 30,
                format: options.format || 'mp3',
                metadata: {
                    prompt: options.prompt,
                    generatedAt: new Date(),
                    orderId: `MUB-${Date.now()}`,
                    provider: this.name
                }
            };
        } catch (error) {
            this.logger.error('Mubert generation failed:', error);
            throw error;
        }
    }

    private async getTrackToken(options: MusicGenerationOptions): Promise<string> {
        const response = await this.retryManager.retry(
            async () => await fetch(`${this.apiEndpoint}/TTM/GetNextTrack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'License': this.apiKey
                },
                body: JSON.stringify({
                    prompt: options.prompt,
                    duration: options.duration || 30,
                    mood: options.mood || 'neutral',
                    genre: options.genre || 'electronic'
                })
            })
        );

        if (!response.ok) {
            throw new Error(`Mubert API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.track_token;
    }

    private async generateTrack(trackToken: string, options: MusicGenerationOptions): Promise<Buffer> {
        const response = await this.retryManager.retry(
            async () => await fetch(`${this.apiEndpoint}/TTM/StreamTrack`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg',
                    'License': this.apiKey
                },
                body: JSON.stringify({
                    track_token: trackToken,
                    format: options.format || 'mp3',
                })
            })
        );

        if (!response.ok) {
            throw new Error(`Mubert track generation failed: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
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
            this.logger.error('Mubert cleanup error:', error);
        }
    }
}