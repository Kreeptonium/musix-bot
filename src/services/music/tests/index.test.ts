import { MusicService } from '../index';
import { MusicGenerationOptions } from '../types';

jest.mock('../providerManager');
jest.mock('../../audio/processor');

describe('MusicService', () => {
    let musicService: MusicService;

    beforeEach(() => {
        musicService = new MusicService();
    });

    afterEach(async () => {
        await musicService.cleanup();
    });

    it('should initialize successfully', async () => {
        await expect(musicService.initialize()).resolves.not.toThrow();
    });

    it('should generate music successfully', async () => {
        const options: MusicGenerationOptions = {
            prompt: 'Test music',
            duration: 30
        };

        const result = await musicService.generateMusic(options);
        
        expect(result).toBeDefined();
        expect(result.filePath).toBeDefined();
        expect(result.duration).toBe(30);
    });

    it('should handle provider failures', async () => {
        const options: MusicGenerationOptions = {
            prompt: 'Test music',
            duration: 30
        };

        // Mock provider failure
        jest.spyOn(musicService['providerManager'], 'generateMusic')
            .mockRejectedValueOnce(new Error('Provider failed'));

        await expect(musicService.generateMusic(options))
            .rejects.toThrow('All providers failed');
    });
});