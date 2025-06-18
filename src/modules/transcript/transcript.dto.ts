import { z } from 'zod';

/**
 * DTO for getting transcript
 */
export class GetTranscriptDTO {
  static schema = z.object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/, 'Invalid YouTube video ID'),
    language: z.string().length(2).optional().default('en'),
    forceRefresh: z.boolean().optional().default(false),
    includeTimestamps: z.boolean().optional().default(true),
    includeWordLevel: z.boolean().optional().default(false)
  });

  videoId!: string;
  language!: string;
  forceRefresh!: boolean;
  includeTimestamps!: boolean;
  includeWordLevel!: boolean;
}

/**
 * DTO for processing transcript
 */
export class ProcessTranscriptDTO {
  static schema = z.object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/),
    language: z.string().length(2).default('en'),
    source: z.enum(['youtube', 'whisper', 'manual', 'assemblyai']).default('youtube'),
    sentences: z.array(z.object({
      text: z.string().min(1),
      startTime: z.number().min(0),
      endTime: z.number().min(0),
      confidence: z.number().min(0).max(1).optional()
    })).optional(),
    fullText: z.string().optional(),
    autoSegment: z.boolean().default(true),
    saveToDatabase: z.boolean().default(true)
  });

  videoId!: string;
  language!: string;
  source!: 'youtube' | 'whisper' | 'manual' | 'assemblyai';
  sentences?: Array<{
    text: string;
    startTime: number;
    endTime: number;
    confidence?: number;
  }>;
  fullText?: string;
  autoSegment!: boolean;
  saveToDatabase!: boolean;
}

/**
 * DTO for searching transcripts
 */
export class SearchTranscriptDTO {
  static schema = z.object({
    query: z.string().min(2).max(100),
    language: z.string().length(2).optional(),
    difficultyLevel: z.number().min(1).max(5).optional(),
    minDuration: z.number().min(0).optional(),
    maxDuration: z.number().max(3600).optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().min(1).max(50).default(20),
    offset: z.number().min(0).default(0),
    sortBy: z.enum(['relevance', 'difficulty', 'duration', 'date']).default('relevance')
  });

  query!: string;
  language?: string;
  difficultyLevel?: number;
  minDuration?: number;
  maxDuration?: number;
  tags?: string[];
  limit!: number;
  offset!: number;
  sortBy!: 'relevance' | 'difficulty' | 'duration' | 'date';
}

/**
 * DTO for transcript segments
 */
export class TranscriptSegmentDTO {
  static schema = z.object({
    sentences: z.array(z.object({
      index: z.number().min(0),
      text: z.string(),
      startTime: z.number(),
      endTime: z.number(),
      duration: z.number(),
      difficulty: z.number().min(1).max(5).optional(),
      words: z.array(z.object({
        word: z.string(),
        startTime: z.number(),
        endTime: z.number(),
        confidence: z.number().optional()
      })).optional()
    }))
  });

  sentences!: Array<{
    index: number;
    text: string;
    startTime: number;
    endTime: number;
    duration: number;
    difficulty?: number;
    words?: Array<{
      word: string;
      startTime: number;
      endTime: number;
      confidence?: number;
    }>;
  }>;
}

/**
 * DTO for speech-to-text processing
 */
export class SpeechToTextDTO {
  static schema = z.object({
    audioUrl: z.string().url().optional(),
    audioData: z.string().optional(), // Base64 encoded audio
    language: z.string().length(2).default('en'),
    service: z.enum(['whisper', 'google', 'assemblyai', 'auto']).default('auto'),
    enhanceAccuracy: z.boolean().default(true),
    includeWordTimestamps: z.boolean().default(false),
    speakerDiarization: z.boolean().default(false)
  }).refine((data) => data.audioUrl || data.audioData, {
    message: 'Either audioUrl or audioData must be provided'
  });

  audioUrl?: string;
  audioData?: string;
  language!: string;
  service!: 'whisper' | 'google' | 'assemblyai' | 'auto';
  enhanceAccuracy!: boolean;
  includeWordTimestamps!: boolean;
  speakerDiarization!: boolean;
}

/**
 * Response DTO for transcript data
 */
export class TranscriptDataDTO {
  videoId!: string;
  language!: string;
  source!: string;
  confidence!: number;
  sentences!: TranscriptSentence[];
  fullText!: string;
  wordCount!: number;
  duration!: number;
  difficulty!: number;
  metadata?: {
    processedAt: Date;
    processingTime: number;
    enhancementsApplied: string[];
  };
}

/**
 * Individual sentence in transcript
 */
export interface TranscriptSentence {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
  wordCount: number;
  difficulty?: number;
  speakingRate?: number; // words per minute
  words?: WordTimestamp[];
}

/**
 * Word-level timestamp
 */
export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
  confidence?: number;
  phoneticTranscription?: string;
}

/**
 * DTO for transcript analysis
 */
export class TranscriptAnalysisDTO {
  videoId!: string;
  language!: string;

  // Overall metrics
  totalDuration!: number;
  totalWords!: number;
  totalSentences!: number;
  averageSpeakingRate!: number; // words per minute

  // Difficulty analysis
  overallDifficulty!: number; // 1-5
  vocabularyLevel!: string; // A1-C2
  sentenceComplexity!: number; // 1-5

  // Content analysis
  topics!: string[];
  keyPhrases!: string[];
  difficultWords!: Array<{
    word: string;
    frequency: number;
    difficulty: number;
  }>;

  // Recommendations
  suitableForLevels!: string[]; // ['A2', 'B1', 'B2']
  practiceRecommendations!: string[];
}

/**
 * DTO for transcript export
 */
export class ExportTranscriptDTO {
  static schema = z.object({
    videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/),
    format: z.enum(['srt', 'vtt', 'txt', 'json', 'pdf']).default('srt'),
    includeTranslation: z.boolean().default(false),
    targetLanguage: z.string().length(2).optional(),
    includeTimestamps: z.boolean().default(true),
    includeDifficulty: z.boolean().default(false)
  });

  videoId!: string;
  format!: 'srt' | 'vtt' | 'txt' | 'json' | 'pdf';
  includeTranslation!: boolean;
  targetLanguage?: string;
  includeTimestamps!: boolean;
  includeDifficulty!: boolean;
}

/**
 * DTO for batch transcript processing
 */
export class BatchProcessTranscriptDTO {
  static schema = z.object({
    videoIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{11}$/)).min(1).max(10),
    language: z.string().length(2).default('en'),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    notifyOnComplete: z.boolean().default(false)
  });

  videoIds!: string[];
  language!: string;
  priority!: 'low' | 'normal' | 'high';
  notifyOnComplete!: boolean;
}

/**
 * Search result item
 */
export interface TranscriptSearchResult {
  video: {
    id: string;
    title: string;
    duration: number;
    thumbnailUrl: string;
  };
  transcript: {
    id: string;
    language: string;
    matchedSentences: Array<{
      index: number;
      text: string;
      startTime: number;
      score: number;
    }>;
  };
  relevanceScore: number;
}