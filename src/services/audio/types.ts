// src/services/audio/types.ts
export interface AudioProcessingOptions {
    normalize?: boolean;
    fadeIn?: number;  // seconds
    fadeOut?: number; // seconds
    equalizer?: {
      bass?: number;   // -20 to 20
      mid?: number;    // -20 to 20
      treble?: number; // -20 to 20
    };
    compress?: {
      threshold?: number; // dB
      ratio?: number;
      attack?: number;    // ms
      release?: number;   // ms
    };
    reverb?: {
      roomSize?: number;  // 0 to 1
      wetLevel?: number;  // 0 to 1
    };
    tempo?: number;      // percentage (e.g., 100 = normal)
    pitch?: number;      // semitones
  }
  
  export interface AudioMetadata {
    duration: number;
    sampleRate: number;
    channels: number;
    format: string;
    bitrate: number;
  }