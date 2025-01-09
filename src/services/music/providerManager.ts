import { Logger } from '../../utils/logger';
import { MusicProvider, MusicGenerationOptions, GeneratedMusic } from './types';
import { MubertProvider } from './providers/mubert';
import { SunoProvider } from './providers/suno';
import { BeatovenProvider } from './providers/beatoven';

export class MusicProviderManager {
    private logger: Logger;
    private providers: Map<string, MusicProvider>;
    private currentProvider: string;

    constructor() {
        this.logger = Logger.getInstance(process.env.ENVIRONMENT || 'development');
        this.providers = new Map();
        this.currentProvider = process.env.DEFAULT_MUSIC_PROVIDER || 'mubert';
        this.initializeProviders();
    }

    private initializeProviders(): void {
        // Add providers if API keys are available
        if (process.env.MUBERT_API_KEY) {
            this.providers.set('mubert', new MubertProvider());
        }
        
        if (process.env.SUNO_API_KEY) {
            this.providers.set('suno', new SunoProvider());
        }
        
        if (process.env.BEATOVEN_API_KEY) {
            this.providers.set('beatoven', new BeatovenProvider());
        }

        if (this.providers.size === 0) {
            throw new Error('No music providers configured');
        }
    }

    async generateMusic(options: MusicGenerationOptions): Promise<GeneratedMusic> {
        const provider = this.providers.get(this.currentProvider);
        if (!provider) {
            throw new Error(`Provider ${this.currentProvider} not found`);
        }

        try {
            return await provider.generateMusic(options);
        } catch (error) {
            this.logger.error(`Provider ${this.currentProvider} failed:`, error);
            return await this.tryFallbackProviders(options, [this.currentProvider]);
        }
    }

    private async tryFallbackProviders(
        options: MusicGenerationOptions,
        triedProviders: string[]
    ): Promise<GeneratedMusic> {
        for (const [name, provider] of this.providers.entries()) {
            if (!triedProviders.includes(name)) {
                try {
                    this.logger.info(`Trying fallback provider: ${name}`);
                    return await provider.generateMusic(options);
                } catch (error) {
                    this.logger.error(`Fallback provider ${name} failed:`, error);
                    triedProviders.push(name);
                }
            }
        }

        throw new Error('All providers failed');
    }

    async setProvider(providerName: string): Promise<void> {
        if (!this.providers.has(providerName)) {
            throw new Error(`Provider ${providerName} not available`);
        }
        this.currentProvider = providerName;
        this.logger.info(`Set current provider to ${providerName}`);
    }

    getAvailableProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    async cleanup(): Promise<void> {
        for (const provider of this.providers.values()) {
            try {
                await provider.cleanup();
            } catch (error) {
                this.logger.error(`Error cleaning up provider ${provider.name}:`, error);
            }
        }
    }
}