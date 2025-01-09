import { MubertProvider } from '../mubert';
import { MusicGenerationOptions } from '../../types';

describe('MubertProvider', () => {
    let provider: MubertProvider;

    beforeEach(() => {
        provider = new MubertProvider();
    });

    afterEach(async () => {
        await provider.cleanup();
    });

    it('should generate music successfully', async () => {
        const options: MusicGenerationOptions = {
            prompt: 'Test music',
            duration: 30
        };

        const result = await provider.generateMusic(options);
        expect(result).toBeDefined();
        expect(result.filePath).toBeDefined();
        expect(result.metadata.provider).toBe('mubert');
    });

    it('should handle API errors', async () => {
        const options: MusicGenerationOptions = {
            prompt: 'Test music',
            duration: 30
        };

        // Mock API failure
        global.fetch = jest.fn().mockRejectedValueOnce(new Error('API Error'));

        await expect(provider.generateMusic(options))
            .rejects.toThrow('Mubert generation failed');
    });
});