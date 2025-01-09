export interface MusicGenerationOptions {
  prompt: string;
  duration?: number;
  tempo?: number;
  style?: string;
  format?: 'mp3' | 'wav';
  genre?: string;
  instruments?: string[];
  mood?: string;
}

export interface GeneratedMusic {
  filePath: string;
  duration: number;
  format: string;
  metadata: {
      prompt: string;
      generatedAt: Date;
      orderId: string;
      provider: string;
  };
}

export interface MusicProvider {
  name: string;
  generateMusic(options: MusicGenerationOptions): Promise<GeneratedMusic>;
  enhanceAudio?(filePath: string): Promise<string>;
  cleanup(): Promise<void>;
}