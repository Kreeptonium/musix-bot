import { Logger } from '../../../utils/logger';
import { RetryManager } from '../../../utils/retry';
import { MusicProvider, MusicGenerationOptions, GeneratedMusic } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class SunoProvider implements MusicProvider {
    private logger: Logger;
    private retryManager: RetryManager;
    private apiKey: string;
    private apiEndpoint: string;
    private outputDir: string;

    name = 'suno';

    constructor() {
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.retryManager = new RetryManager();
        this.apiKey = process.env.SUNO_API_KEY || '';
        this.apiEndpoint = 'https://api.suno.ai/v1';
        this.outputDir = path.join(process.cwd(), 'generated_music', 'suno');
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.outputDir, { recursive: true });
    }

    async generateMusic(options: MusicGenerationOptions): Promise<GeneratedMusic> {
        try {
            // Create generation
            const generation = await this.createGeneration(options);

            // Wait for completion and get music
            const musicBuffer = await this.waitForGeneration(generation.id);

            // Save to file
            const outputPath = path.join(
                this.outputDir,
                `suno_${Date.now()}.${options.format || 'mp3'}`
            );

            await fs.writeFile(outputPath, musicBuffer);

            return {
                filePath: outputPath,
                duration: options.duration || 30,
                format: options.format || 'mp3',
                metadata: {
                    prompt: options.prompt,
                    generatedAt: new Date(),
                    orderId: `SUNO-${Date.now()}`,
                    provider: this.name
                }
            };
        } catch (error) {
            this.logger.error('Suno generation failed:', error);
            throw error;
        }
    }

    private async createGeneration(options: MusicGenerationOptions): Promise<{ id: string }> {
        const response = await this.retryManager.retry(
            async () => await fetch(`${this.apiEndpoint}/generations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    prompt: this.formatPrompt(options),
                    duration: options.duration || 30,
                    format: options.format || 'mp3'
                })
            })
        );

        if (!response.ok) {
            throw new Error(`Suno API error: ${response.statusText}`);
        }

        return await response.json();
    }

    private async waitForGeneration(generationId: string, maxAttempts = 30): Promise<Buffer> {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const response = await fetch(`${this.apiEndpoint}/generations/${generationId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to check generation status: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.status === 'completed') {
                return await this.downloadGeneration(data.downloadUrl);
            } else if (data.status === 'failed') {
                throw new Error('Generation failed: ' + data.error);
            }

            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        throw new Error('Generation timed out');
    }

    private async downloadGeneration(url: string): Promise<Buffer> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to download generated music');
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    private formatPrompt(options: MusicGenerationOptions): string {
        let prompt = options.prompt;

        if (options.genre) {
            prompt += ` in ${options.genre} style`;
        }

        if (options.mood) {
            prompt += ` with ${options.mood} mood`;
        }

        if (options.instruments?.length) {
            prompt += ` featuring ${options.instruments.join(', ')}`;
        }

        return prompt;
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
            this.logger.error('Suno cleanup error:', error);
        }
    }
}