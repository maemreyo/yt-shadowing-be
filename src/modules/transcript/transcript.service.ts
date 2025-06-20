import { Service } from 'typedi';
import { PrismaService } from '@shared/services/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { YouTubeIntegrationService } from '@modules/youtube-integration';
import { logger } from '@shared/logger';
import {
  GetTranscriptDTO,
  ProcessTranscriptDTO,
  SearchTranscriptDTO,
  TranscriptDataDTO,
  TranscriptSentence,
  SpeechToTextDTO,
  TranscriptAnalysisDTO,
  TranscriptSearchResult,
  WordTimestamp
} from './transcript.dto';
import { BadRequestException, NotFoundException } from '@shared/exceptions';
import OpenAI from 'openai';
import { config } from '@config';

@Service()
export class TranscriptService {
  private openai: OpenAI | null = null;
  private readonly CACHE_TTL = 7 * 24 * 60 * 60; // 7 days

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private youtubeService: YouTubeIntegrationService
  ) {
    if (config.openaiWhisperApiKey) {
      this.openai = new OpenAI({
        apiKey: config.openaiWhisperApiKey
      });
    }
  }

  /**
   * Get transcript for a video
   */
  async getTranscript(dto: GetTranscriptDTO): Promise<TranscriptDataDTO> {
    const cacheKey = `transcript:${dto.videoId}:${dto.language}`;

    // Check cache unless force refresh
    if (!dto.forceRefresh) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug(`Transcript cache hit for ${dto.videoId}`);
        return JSON.parse(cached);
      }
    }

    // Check database
    const transcript = await this.prisma.transcript.findFirst({
      where: {
        video: { youtubeVideoId: dto.videoId },
        language: dto.language
      },
      include: {
        video: true
      }
    });

    if (transcript) {
      const transcriptData = this.formatTranscriptData(transcript);

      // Update cache
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(transcriptData));

      return transcriptData;
    }

    // If not found, try to fetch from YouTube
    try {
      const captions = await this.youtubeService.getCaptions({
        videoId: dto.videoId,
        language: dto.language,
        format: 'json',
        autoGenerated: true
      });

      // Process and save the transcript
      const processed = await this.processYouTubeTranscript({
        videoId: dto.videoId,
        language: dto.language,
        source: 'youtube',
        sentences: captions.segments.map(seg => ({
          text: seg.text,
          startTime: seg.startTime,
          endTime: seg.endTime
        })),
        fullText: captions.fullText,
        autoSegment: false,
        saveToDatabase: true
      });

      return processed;
    } catch (error) {
      logger.error('Failed to fetch transcript', error as Error);
      throw new NotFoundException('Transcript not found for this video');
    }
  }

  /**
   * Process and save YouTube transcript
   */
  async processYouTubeTranscript(dto: ProcessTranscriptDTO): Promise<TranscriptDataDTO> {
    // Ensure video exists in database
    let video = await this.prisma.video.findUnique({
      where: { youtubeVideoId: dto.videoId }
    });

    if (!video) {
      // Create video entry
      const videoInfo = await this.youtubeService.getVideoInfo({
        videoId: dto.videoId,
        includeCaptions: false,
        includeMetadata: true
      });

      video = await this.prisma.video.create({
        data: {
          youtubeVideoId: dto.videoId,
          title: videoInfo.title,
          duration: videoInfo.duration,
          language: dto.language,
          difficultyLevel: videoInfo.difficultyLevel,
          transcriptAvailable: true,
          channelId: videoInfo.channelId,
          channelName: videoInfo.channelName,
          thumbnailUrl: videoInfo.thumbnailUrl,
          tags: videoInfo.tags,
          metadata: videoInfo as any
        }
      });
    }

    // Process sentences
    let sentences: TranscriptSentence[];

    if (dto.sentences && dto.sentences.length > 0) {
      sentences = dto.sentences.map((sent, index) => ({
        index,
        text: sent.text.trim(),
        startTime: sent.startTime,
        endTime: sent.endTime,
        duration: sent.endTime - sent.startTime,
        wordCount: sent.text.split(/\s+/).length,
        difficulty: this.calculateSentenceDifficulty(sent.text),
        speakingRate: this.calculateSpeakingRate(sent.text, sent.endTime - sent.startTime)
      }));
    } else if (dto.fullText && dto.autoSegment) {
      // Auto-segment the full text
      sentences = await this.segmentTranscript(dto.fullText, dto.videoId);
    } else {
      throw new BadRequestException('Either sentences or fullText must be provided');
    }

    // Calculate overall metrics
    const fullText = sentences.map(s => s.text).join(' ');
    const wordCount = fullText.split(/\s+/).length;
    const duration = sentences[sentences.length - 1]?.endTime || 0;
    const difficulty = this.calculateOverallDifficulty(sentences);

    // Save to database if requested
    if (dto.saveToDatabase) {
      await this.prisma.transcript.upsert({
        where: {
          videoId_language: {
            videoId: video.id,
            language: dto.language
          }
        },
        update: {
          sentences: sentences as any,
          fullText,
          source: dto.source,
          confidence: dto.source === 'manual' ? 1.0 : 0.9,
          updatedAt: new Date()
        },
        create: {
          videoId: video.id,
          language: dto.language,
          sentences: sentences as any,
          fullText,
          source: dto.source,
          confidence: dto.source === 'manual' ? 1.0 : 0.9
        }
      });

      // Update video difficulty if needed
      if (video.difficultyLevel !== difficulty) {
        await this.prisma.video.update({
          where: { id: video.id },
          data: { difficultyLevel: difficulty }
        });
      }
    }

    const transcriptData: TranscriptDataDTO = {
      videoId: dto.videoId,
      language: dto.language,
      source: dto.source,
      confidence: dto.source === 'manual' ? 1.0 : 0.9,
      sentences,
      fullText,
      wordCount,
      duration,
      difficulty,
      metadata: {
        processedAt: new Date(),
        processingTime: 0,
        enhancementsApplied: []
      }
    };

    // Cache the result
    const cacheKey = `transcript:${dto.videoId}:${dto.language}`;
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(transcriptData));

    return transcriptData;
  }

  /**
   * Segment transcript into sentences with estimated timestamps
   */
  async segmentTranscript(text: string, videoId?: string): Promise<TranscriptSentence[]> {
    // Split text into sentences
    const sentenceRegex = /[.!?]+[\s]+/g;
    const rawSentences = text.split(sentenceRegex).filter(s => s.trim().length > 0);

    // If we have video duration, estimate timestamps
    let totalDuration = 0;
    if (videoId) {
      const video = await this.prisma.video.findUnique({
        where: { youtubeVideoId: videoId }
      });
      totalDuration = video?.duration || 0;
    }

    // Calculate total words for time distribution
    const totalWords = text.split(/\s+/).length;
    const averageWPM = 150; // Average speaking rate
    const estimatedDuration = totalDuration || (totalWords / averageWPM) * 60;

    let currentTime = 0;
    const sentences: TranscriptSentence[] = rawSentences.map((sentence, index) => {
      const words = sentence.trim().split(/\s+/).length;
      const duration = (words / totalWords) * estimatedDuration;
      const startTime = currentTime;
      const endTime = currentTime + duration;

      currentTime = endTime;

      return {
        index,
        text: sentence.trim(),
        startTime: Math.round(startTime * 10) / 10,
        endTime: Math.round(endTime * 10) / 10,
        duration: Math.round(duration * 10) / 10,
        wordCount: words,
        difficulty: this.calculateSentenceDifficulty(sentence),
        speakingRate: this.calculateSpeakingRate(sentence, duration)
      };
    });

    return sentences;
  }

  /**
   * Search transcripts for practice content
   */
  async searchTranscripts(dto: SearchTranscriptDTO): Promise<TranscriptSearchResult[]> {
    const cacheKey = `transcript:search:${JSON.stringify(dto)}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Build search query
    const whereClause: any = {
      fullText: {
        contains: dto.query,
        mode: 'insensitive'
      }
    };

    if (dto.language) {
      whereClause.language = dto.language;
    }

    if (dto.difficultyLevel) {
      whereClause.video = {
        difficultyLevel: dto.difficultyLevel
      };
    }

    if (dto.minDuration || dto.maxDuration) {
      whereClause.video = {
        ...whereClause.video,
        duration: {
          gte: dto.minDuration || 0,
          lte: dto.maxDuration || 3600
        }
      };
    }

    // Search transcripts
    const transcripts = await this.prisma.transcript.findMany({
      where: whereClause,
      include: {
        video: true
      },
      take: dto.limit,
      skip: dto.offset,
      orderBy: this.getSortOrder(dto.sortBy)
    });

    // Process results
    const results: TranscriptSearchResult[] = transcripts.map(transcript => {
      const sentences = transcript.sentences as any[];
      const matchedSentences = sentences
        .filter(sent => sent.text.toLowerCase().includes(dto.query.toLowerCase()))
        .slice(0, 3)
        .map(sent => ({
          index: sent.index,
          text: sent.text,
          startTime: sent.startTime,
          score: this.calculateRelevanceScore(sent.text, dto.query)
        }));

      return {
        video: {
          id: transcript.video.youtubeVideoId,
          title: transcript.video.title,
          duration: transcript.video.duration,
          thumbnailUrl: transcript.video.thumbnailUrl || ''
        },
        transcript: {
          id: transcript.id,
          language: transcript.language,
          matchedSentences
        },
        relevanceScore: this.calculateRelevanceScore(transcript.fullText, dto.query)
      };
    });

    // Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(results));

    return results;
  }

  /**
   * Convert audio to text using speech-to-text services
   */
  async speechToText(dto: SpeechToTextDTO): Promise<string> {
    let audioBuffer: Buffer;

    // Get audio data
    if (dto.audioUrl) {
      // Download audio from URL
      const response = await fetch(dto.audioUrl);
      audioBuffer = Buffer.from(await response.arrayBuffer());
    } else if (dto.audioData) {
      // Decode base64 audio
      audioBuffer = Buffer.from(dto.audioData, 'base64');
    } else {
      throw new BadRequestException('No audio data provided');
    }

    // Select service based on preference or availability
    switch (dto.service) {
      case 'whisper':
        return this.transcribeWithWhisper(audioBuffer, dto);
      case 'google':
        return this.transcribeWithGoogle(audioBuffer, dto);
      case 'assemblyai':
        return this.transcribeWithAssemblyAI(audioBuffer, dto);
      case 'auto':
      default:
        // Try services in order of preference
        try {
          if (this.openai) {
            return await this.transcribeWithWhisper(audioBuffer, dto);
          }
        } catch (error) {
          logger.warn('Whisper transcription failed, trying alternatives', error as Error);
        }

        throw new BadRequestException('No speech-to-text service available');
    }
  }

  /**
   * Analyze transcript for learning insights
   */
  async analyzeTranscript(videoId: string, language: string = 'en'): Promise<TranscriptAnalysisDTO> {
    const transcript = await this.getTranscript({
      videoId,
      language,
      forceRefresh: false,
      includeTimestamps: true,
      includeWordLevel: false
    });

    const sentences = transcript.sentences;
    const words = transcript.fullText.split(/\s+/);

    // Calculate metrics
    const totalDuration = transcript.duration;
    const totalWords = transcript.wordCount;
    const totalSentences = sentences.length;
    const averageSpeakingRate = (totalWords / totalDuration) * 60;

    // Analyze vocabulary
    const wordFrequency = this.calculateWordFrequency(words);
    const difficultWords = this.identifyDifficultWords(wordFrequency);
    const vocabularyLevel = this.assessVocabularyLevel(wordFrequency);

    // Analyze sentence complexity
    const sentenceComplexity = this.calculateAverageSentenceComplexity(sentences);
    const overallDifficulty = Math.round(
      (transcript.difficulty + sentenceComplexity + this.mapVocabularyToNumber(vocabularyLevel)) / 3
    );

    // Extract topics and key phrases
    const topics = await this.extractTopics(transcript.fullText);
    const keyPhrases = this.extractKeyPhrases(transcript.fullText);

    // Generate recommendations
    const suitableForLevels = this.determineSuitableLevels(overallDifficulty, vocabularyLevel);
    const practiceRecommendations = this.generatePracticeRecommendations(
      overallDifficulty,
      averageSpeakingRate,
      sentenceComplexity
    );

    return {
      videoId,
      language,
      totalDuration,
      totalWords,
      totalSentences,
      averageSpeakingRate,
      overallDifficulty,
      vocabularyLevel,
      sentenceComplexity,
      topics,
      keyPhrases,
      difficultWords,
      suitableForLevels,
      practiceRecommendations
    };
  }

  /**
   * Private helper methods
   */
  private formatTranscriptData(transcript: any): TranscriptDataDTO {
    const sentences = transcript.sentences as TranscriptSentence[];

    return {
      videoId: transcript.video.youtubeVideoId,
      language: transcript.language,
      source: transcript.source,
      confidence: transcript.confidence,
      sentences,
      fullText: transcript.fullText,
      wordCount: transcript.fullText.split(/\s+/).length,
      duration: sentences[sentences.length - 1]?.endTime || 0,
      difficulty: transcript.video.difficultyLevel,
      metadata: {
        processedAt: transcript.updatedAt,
        processingTime: 0,
        enhancementsApplied: []
      }
    };
  }

  private calculateSentenceDifficulty(sentence: string): number {
    const words = sentence.split(/\s+/);
    const wordCount = words.length;
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / wordCount;
    const complexWords = words.filter(word => word.length > 8).length;

    // Simple difficulty calculation
    if (wordCount < 8 && avgWordLength < 5) return 1;
    if (wordCount < 12 && avgWordLength < 6) return 2;
    if (wordCount < 16 && avgWordLength < 7) return 3;
    if (wordCount < 20 && avgWordLength < 8) return 4;
    return 5;
  }

  private calculateSpeakingRate(text: string, duration: number): number {
    if (duration === 0) return 0;
    const words = text.split(/\s+/).length;
    return Math.round((words / duration) * 60); // words per minute
  }

  private calculateOverallDifficulty(sentences: TranscriptSentence[]): number {
    if (sentences.length === 0) return 1;

    const avgDifficulty = sentences.reduce((sum, sent) => sum + (sent.difficulty || 1), 0) / sentences.length;
    return Math.round(avgDifficulty);
  }

  private calculateRelevanceScore(text: string, query: string): number {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    let score = 0;

    // Exact match
    if (textLower.includes(queryLower)) {
      score += 50;
    }

    // Word matches
    queryWords.forEach(word => {
      if (textLower.includes(word)) {
        score += 10;
      }
    });

    // Position bonus (earlier matches score higher)
    const position = textLower.indexOf(queryLower);
    if (position !== -1) {
      score += Math.max(0, 20 - (position / text.length) * 20);
    }

    return Math.min(100, score);
  }

  private getSortOrder(sortBy: string): any {
    switch (sortBy) {
      case 'difficulty':
        return { video: { difficultyLevel: 'asc' } };
      case 'duration':
        return { video: { duration: 'asc' } };
      case 'date':
        return { createdAt: 'desc' };
      case 'relevance':
      default:
        return { createdAt: 'desc' };
    }
  }

  private async transcribeWithWhisper(audioBuffer: Buffer, dto: SpeechToTextDTO): Promise<string> {
    if (!this.openai) {
      throw new BadRequestException('OpenAI Whisper not configured');
    }

    try {
      // Create a File object from buffer
      const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

      const transcription = await this.openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: dto.language,
        response_format: dto.includeWordTimestamps ? 'verbose_json' : 'text'
      });

      if (typeof transcription === 'string') {
        return transcription;
      } else {
        return transcription.text;
      }
    } catch (error) {
      logger.error('Whisper transcription failed', error as Error);
      throw new BadRequestException('Failed to transcribe audio with Whisper');
    }
  }

  private async transcribeWithGoogle(audioBuffer: Buffer, dto: SpeechToTextDTO): Promise<string> {
    // Implementation for Google Speech-to-Text
    throw new BadRequestException('Google Speech-to-Text not implemented');
  }

  private async transcribeWithAssemblyAI(audioBuffer: Buffer, dto: SpeechToTextDTO): Promise<string> {
    // Implementation for AssemblyAI
    throw new BadRequestException('AssemblyAI not implemented');
  }

  private calculateWordFrequency(words: string[]): Map<string, number> {
    const frequency = new Map<string, number>();

    words.forEach(word => {
      const normalized = word.toLowerCase().replace(/[^a-z]/g, '');
      if (normalized.length > 2) {
        frequency.set(normalized, (frequency.get(normalized) || 0) + 1);
      }
    });

    return frequency;
  }

  private identifyDifficultWords(wordFrequency: Map<string, number>): Array<any> {
    // This would use a word difficulty database
    // For now, use word length as a proxy
    const difficultWords: Array<any> = [];

    wordFrequency.forEach((frequency, word) => {
      if (word.length > 8) {
        difficultWords.push({
          word,
          frequency,
          difficulty: Math.min(5, Math.floor(word.length / 3))
        });
      }
    });

    return difficultWords.sort((a, b) => b.difficulty - a.difficulty).slice(0, 10);
  }

  private assessVocabularyLevel(wordFrequency: Map<string, number>): string {
    // Simplified vocabulary level assessment
    const avgWordLength = Array.from(wordFrequency.keys())
      .reduce((sum, word) => sum + word.length, 0) / wordFrequency.size;

    if (avgWordLength < 4) return 'A1';
    if (avgWordLength < 5) return 'A2';
    if (avgWordLength < 6) return 'B1';
    if (avgWordLength < 7) return 'B2';
    if (avgWordLength < 8) return 'C1';
    return 'C2';
  }

  private calculateAverageSentenceComplexity(sentences: TranscriptSentence[]): number {
    const avgComplexity = sentences.reduce((sum, sent) => sum + (sent.difficulty || 1), 0) / sentences.length;
    return Math.round(avgComplexity);
  }

  private mapVocabularyToNumber(level: string): number {
    const mapping: { [key: string]: number } = {
      'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 5
    };
    return mapping[level] || 3;
  }

  private async extractTopics(text: string): Promise<string[]> {
    // Simple topic extraction - would use NLP in production
    const commonTopics = [
      'technology', 'education', 'travel', 'food', 'health',
      'business', 'science', 'culture', 'sports', 'entertainment'
    ];

    const textLower = text.toLowerCase();
    return commonTopics.filter(topic => textLower.includes(topic));
  }

  private extractKeyPhrases(text: string): string[] {
    // Simple key phrase extraction
    const sentences = text.split(/[.!?]/);
    const phrases: string[] = [];

    sentences.forEach(sentence => {
      // Extract 3-5 word phrases
      const words = sentence.trim().split(/\s+/);
      for (let i = 0; i < words.length - 2; i++) {
        if (words[i].length > 3) {
          phrases.push(words.slice(i, i + 3).join(' '));
        }
      }
    });

    // Return top 5 unique phrases
    return [...new Set(phrases)].slice(0, 5);
  }

  private determineSuitableLevels(difficulty: number, vocabularyLevel: string): string[] {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const vocIndex = levels.indexOf(vocabularyLevel);

    // Suitable for current level and one below/above
    const suitable: string[] = [];
    if (vocIndex > 0) suitable.push(levels[vocIndex - 1]);
    suitable.push(vocabularyLevel);
    if (vocIndex < levels.length - 1) suitable.push(levels[vocIndex + 1]);

    return suitable;
  }

  private generatePracticeRecommendations(
    difficulty: number,
    speakingRate: number,
    complexity: number
  ): string[] {
    const recommendations: string[] = [];

    if (speakingRate > 180) {
      recommendations.push('Start with 0.75x playback speed to better catch all words');
    }

    if (difficulty >= 4) {
      recommendations.push('Focus on understanding context before attempting shadowing');
      recommendations.push('Practice difficult sentences multiple times before moving on');
    }

    if (complexity >= 4) {
      recommendations.push('Break down complex sentences into smaller chunks');
    }

    recommendations.push('Record yourself and compare with the original');
    recommendations.push('Pay attention to intonation and rhythm patterns');

    return recommendations;
  }
}