import { z } from 'zod';

/**
 * DTO for uploading a recording
 */
export class UploadRecordingDTO {
  static schema = z.object({
    sessionId: z.string(),
    sentenceIndex: z.number().min(0),
    sentenceStartTime: z.number().min(0),
    sentenceEndTime: z.number().min(0),
    audioData: z.string(), // Base64 encoded audio
    mimeType: z.enum(['audio/webm', 'audio/wav', 'audio/mp3', 'audio/ogg']).default('audio/webm'),
    metadata: z.object({
      duration: z.number().min(0).optional(),
      sampleRate: z.number().optional(),
      channels: z.number().optional(),
      deviceInfo: z.string().optional()
    }).optional()
  });

  sessionId!: string;
  sentenceIndex!: number;
  sentenceStartTime!: number;
  sentenceEndTime!: number;
  audioData!: string;
  mimeType!: 'audio/webm' | 'audio/wav' | 'audio/mp3' | 'audio/ogg';
  metadata?: {
    duration?: number;
    sampleRate?: number;
    channels?: number;
    deviceInfo?: string;
  };
}

/**
 * DTO for processing audio
 */
export class ProcessAudioDTO {
  static schema = z.object({
    recordingId: z.string(),
    operations: z.array(z.enum([
      'convert',
      'normalize',
      'denoise',
      'transcribe',
      'waveform',
      'analyze'
    ])).default(['convert', 'waveform']),
    targetFormat: z.enum(['wav', 'mp3', 'webm', 'ogg']).optional(),
    transcriptionLanguage: z.string().length(2).default('en')
  });

  recordingId!: string;
  operations!: Array<'convert' | 'normalize' | 'denoise' | 'transcribe' | 'waveform' | 'analyze'>;
  targetFormat?: 'wav' | 'mp3' | 'webm' | 'ogg';
  transcriptionLanguage!: string;
}

/**
 * DTO for audio comparison
 */
export class CompareAudioDTO {
  static schema = z.object({
    userRecordingId: z.string(),
    referenceAudioUrl: z.string().url().optional(),
    originalText: z.string(),
    analysisTypes: z.array(z.enum([
      'pronunciation',
      'fluency',
      'timing',
      'emotion',
      'pitch',
      'pace'
    ])).default(['pronunciation', 'fluency', 'timing']),
    strictMode: z.boolean().default(false)
  });

  userRecordingId!: string;
  referenceAudioUrl?: string;
  originalText!: string;
  analysisTypes!: Array<'pronunciation' | 'fluency' | 'timing' | 'emotion' | 'pitch' | 'pace'>;
  strictMode!: boolean;
}

/**
 * DTO for waveform generation
 */
export class WaveformRequestDTO {
  static schema = z.object({
    audioUrl: z.string().url().optional(),
    recordingId: z.string().optional(),
    resolution: z.number().min(100).max(5000).default(1000),
    format: z.enum(['json', 'svg', 'png']).default('json'),
    normalize: z.boolean().default(true),
    color: z.string().regex(/^#[0-9A-F]{6}$/i).default('#1E40AF')
  }).refine((data) => data.audioUrl || data.recordingId, {
    message: 'Either audioUrl or recordingId must be provided'
  });

  audioUrl?: string;
  recordingId?: string;
  resolution!: number;
  format!: 'json' | 'svg' | 'png';
  normalize!: boolean;
  color!: string;
}

/**
 * DTO for audio analysis results
 */
export class AudioAnalysisResultDTO {
  recordingId!: string;
  overallScore!: number; // 0-100

  scores!: {
    pronunciation: number; // 0-100
    fluency: number; // 0-100
    timing: number; // 0-100
    clarity: number; // 0-100
  };

  issues?: Array<{
    type: 'pronunciation' | 'fluency' | 'timing' | 'pace';
    severity: 'low' | 'medium' | 'high';
    word?: string;
    position?: number;
    issue: string;
    suggestion: string;
    timestamp?: number;
  }>;

  transcription?: {
    text: string;
    confidence: number;
    words?: Array<{
      word: string;
      startTime: number;
      endTime: number;
      confidence: number;
    }>;
  };

  waveformComparison?: {
    user: number[];
    reference: number[];
    similarity: number;
  };

  recommendations?: string[];
  processedAt!: Date;
}

/**
 * DTO for recording metadata
 */
export class RecordingMetadataDTO {
  id!: string;
  userId!: string;
  sessionId!: string;
  sentenceIndex!: number;

  audioUrl!: string;
  format!: string;
  duration!: number; // seconds
  fileSize!: number; // bytes

  waveformData?: number[];
  transcription?: string;
  qualityScore?: number;

  status!: 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;

  createdAt!: Date;
  processedAt?: Date;
}

/**
 * DTO for bulk operations
 */
export class BulkAudioOperationDTO {
  static schema = z.object({
    recordingIds: z.array(z.string()).min(1).max(50),
    operation: z.enum(['delete', 'reprocess', 'export']),
    options: z.object({
      exportFormat: z.enum(['zip', 'tar']).optional(),
      includeAnalysis: z.boolean().default(false)
    }).optional()
  });

  recordingIds!: string[];
  operation!: 'delete' | 'reprocess' | 'export';
  options?: {
    exportFormat?: 'zip' | 'tar';
    includeAnalysis?: boolean;
  };
}

/**
 * DTO for audio export
 */
export class ExportRecordingDTO {
  static schema = z.object({
    recordingId: z.string(),
    includeAnalysis: z.boolean().default(true),
    includeWaveform: z.boolean().default(true),
    format: z.enum(['original', 'wav', 'mp3']).default('original')
  });

  recordingId!: string;
  includeAnalysis!: boolean;
  includeWaveform!: boolean;
  format!: 'original' | 'wav' | 'mp3';
}

/**
 * DTO for audio quality settings
 */
export class AudioQualitySettingsDTO {
  static schema = z.object({
    bitrate: z.number().min(32).max(320).default(128), // kbps
    sampleRate: z.number().min(8000).max(48000).default(44100), // Hz
    channels: z.number().min(1).max(2).default(1), // mono/stereo
    noiseReduction: z.boolean().default(true),
    echoCancellation: z.boolean().default(true),
    autoGainControl: z.boolean().default(true)
  });

  bitrate!: number;
  sampleRate!: number;
  channels!: number;
  noiseReduction!: boolean;
  echoCancellation!: boolean;
  autoGainControl!: boolean;
}

/**
 * DTO for recording limits
 */
export class RecordingLimitsDTO {
  maxDuration!: number; // seconds
  maxFileSize!: number; // MB
  dailyLimit!: number; // number of recordings
  storageQuota!: number; // GB

  currentUsage!: {
    dailyCount: number;
    totalStorage: number; // GB
  };

  canRecord!: boolean;
  limitReason?: 'duration' | 'size' | 'daily' | 'storage';
}