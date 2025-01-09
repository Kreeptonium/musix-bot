import { Logger } from '../../utils/logger';
import { MusicProviderManager } from './providerManager';
import { MusicGenerationOptions, GeneratedMusic } from './types';
import { AudioProcessor } from '../audio/processor';

export class MusicService {
    private logger: Logger;
    private providerManager: MusicProviderManager;
    private audioProcessor: AudioProcessor;

    constructor() {
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.providerManager = new MusicProviderManager();
        this.audioProcessor = new AudioProcessor();
    }

    async initialize(): Promise<void> {
        try {
            await this.audioProcessor.initialize();
            this.logger.info('Music service initialized');
        } catch (error) {
            this.logger.error('Failed to initialize music service:', error);
            throw error;
        }
    }

    async generateMusic(
        options: MusicGenerationOptions,
        enhanceAudio: boolean = false
    ): Promise<GeneratedMusic> {
        try {
            // Generate raw music
            const generatedMusic = await this.providerManager.generateMusic(options);

            // Enhance audio if requested
            if (enhanceAudio) {
                generatedMusic.filePath = await this.audioProcessor.processAudio(
                    generatedMusic.filePath,
                    {
                        normalize: true,
                        fadeIn: 1,
                        fadeOut: 1
                    }
                );
            }

            return generatedMusic;
        } catch (error) {
            this.logger.error('Music generation failed:', error);
            throw error;
        }
    }

    async setProvider(providerName: string): Promise<void> {
        await this.providerManager.setProvider(providerName);
    }

    getAvailableProviders(): string[] {
        return this.providerManager.getAvailableProviders();
    }

    async cleanup(): Promise<void> {
        try {
            await this.providerManager.cleanup();
            await this.audioProcessor.cleanup();
            this.logger.info('Music service cleanup completed');
        } catch (error) {
            this.logger.error('Cleanup failed:', error);
            throw error;
        }
    }
}