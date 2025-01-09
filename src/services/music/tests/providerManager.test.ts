import { MusicProviderManager } from '../providerManager';
import { MusicGenerationOptions } from '../types';

jest.mock('../providers/mubert');
jest.mock('../providers/suno');
jest.mock('../providers/beatoven');

describe('MusicProviderManager', () => {
    let providerManager: MusicProviderManager;

    beforeEach(() => {
        process.env.MUBERT_API_KEY = 'test-key';
        process.env.SUNO_API_KEY = 'test-key';
        providerManager = new MusicProviderManager();
    });

    it('should initialize with available providers', () => {
        const providers = providerManager.getAvailableProviders();
        expect(providers).toContain('mubert');
        expect(providers).toContain('suno');
    });

    it('should generate music using current provider', async () => {
        const options: MusicGenerationOptions = {
            prompt: 'Test music',
            duration: 30
        };

        const result = await providerManager.generateMusic(options);
        expect(result).toBeDefined();
        expect(result.filePath).toBeDefined();
    });

    it('should try fallback providers on failure', async () => {
        const options: MusicGenerationOptions = {
            prompt: 'Test music',
            duration: 30
        };

        // Mock first provider failure
        await providerManager.setProvider('mubert');
        jest.spyOn(providerManager['providers'].get('mubert')!, 'generateMusic')
            .mockRejectedValueOnce(new Error('Provider failed'));

        const result = await providerManager.generateMusic(options);
        expect(result).toBeDefined();
    });
});