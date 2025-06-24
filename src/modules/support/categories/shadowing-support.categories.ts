// Support ticket categories for YouTube Shadowing

import { Service } from 'typedi';
import { SupportService } from '@modules/support/support.service';
import { logger } from '@shared/logger';

export interface SupportCategory {
  id: string;
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  autoTags: string[];
  commonIssues: string[];
  slaHours: number;
  assignToTeam: string;
  autoResponses?: {
    immediate?: string;
    followUp?: string;
  };
}

export interface TicketTemplate {
  categoryId: string;
  title: string;
  description: string;
  fields: Array<{
    name: string;
    type: 'text' | 'select' | 'multiselect' | 'file';
    required: boolean;
    options?: string[];
  }>;
}

@Service()
export class ShadowingSupportCategories {
  // Support categories specific to YouTube Shadowing
  private readonly CATEGORIES: Record<string, SupportCategory> = {
    // Technical Issues
    TRANSCRIPT_LOADING: {
      id: 'transcript_loading',
      name: 'Transcript Loading Issues',
      description: 'Problems with loading or displaying YouTube transcripts',
      priority: 'high',
      autoTags: ['transcript', 'youtube', 'loading', 'technical'],
      commonIssues: [
        'Transcript not loading',
        'Wrong language displayed',
        'Transcript out of sync',
        'Missing sentences'
      ],
      slaHours: 4,
      assignToTeam: 'technical_support',
      autoResponses: {
        immediate: 'We\'re looking into your transcript loading issue. In the meantime, try refreshing the page or clearing your browser cache.',
        followUp: 'Our technical team is investigating the transcript issue. We\'ll update you within 4 hours.'
      }
    },

    AUDIO_RECORDING: {
      id: 'audio_recording',
      name: 'Audio Recording Problems',
      description: 'Issues with recording, uploading, or processing audio',
      priority: 'high',
      autoTags: ['audio', 'recording', 'microphone', 'technical'],
      commonIssues: [
        'Microphone not detected',
        'Recording fails to upload',
        'Audio quality issues',
        'Processing takes too long',
        'Waveform not displaying'
      ],
      slaHours: 6,
      assignToTeam: 'technical_support',
      autoResponses: {
        immediate: 'We understand you\'re having audio recording issues. Please ensure your microphone permissions are enabled for our site.'
      }
    },

    EXTENSION_ISSUES: {
      id: 'extension_issues',
      name: 'Chrome Extension Problems',
      description: 'Issues with the YouTube Shadowing Chrome extension',
      priority: 'medium',
      autoTags: ['extension', 'chrome', 'browser', 'technical'],
      commonIssues: [
        'Extension not working on YouTube',
        'Buttons not appearing',
        'Extension crashes',
        'Sync issues with web app'
      ],
      slaHours: 8,
      assignToTeam: 'technical_support'
    },

    // Billing & Subscription
    LIMIT_EXCEEDED: {
      id: 'limit_exceeded',
      name: 'Practice Limit Issues',
      description: 'Questions about daily limits and usage restrictions',
      priority: 'medium',
      autoTags: ['billing', 'limits', 'subscription', 'upgrade'],
      commonIssues: [
        'Daily limit reached unexpectedly',
        'Usage not tracking correctly',
        'Want to increase limits',
        'Upgrade questions'
      ],
      slaHours: 12,
      assignToTeam: 'billing_support',
      autoResponses: {
        immediate: 'We see you have questions about practice limits. Free plans include 30 minutes daily. You can upgrade anytime for unlimited practice.'
      }
    },

    SUBSCRIPTION_ISSUES: {
      id: 'subscription_issues',
      name: 'Subscription & Billing',
      description: 'Payment, upgrade, downgrade, and billing questions',
      priority: 'high',
      autoTags: ['billing', 'payment', 'subscription', 'upgrade'],
      commonIssues: [
        'Payment failed',
        'Want to change plan',
        'Refund request',
        'Billing questions'
      ],
      slaHours: 4,
      assignToTeam: 'billing_support'
    },

    // Feature Requests & Feedback
    FEATURE_REQUEST: {
      id: 'feature_request',
      name: 'Feature Requests',
      description: 'Suggestions for new features or improvements',
      priority: 'low',
      autoTags: ['feature', 'suggestion', 'feedback', 'improvement'],
      commonIssues: [
        'Support for new video platform',
        'Additional language support',
        'New practice modes',
        'UI/UX improvements'
      ],
      slaHours: 48,
      assignToTeam: 'product_team',
      autoResponses: {
        immediate: 'Thank you for your feature suggestion! We review all requests and consider them for future updates.'
      }
    },

    // Learning & Content
    VIDEO_RECOMMENDATIONS: {
      id: 'video_recommendations',
      name: 'Video & Content Issues',
      description: 'Problems with video recommendations or content',
      priority: 'low',
      autoTags: ['content', 'video', 'recommendations', 'learning'],
      commonIssues: [
        'Poor video recommendations',
        'Difficulty level incorrect',
        'Want specific content',
        'Content not appropriate'
      ],
      slaHours: 24,
      assignToTeam: 'content_team'
    },

    PRONUNCIATION_SCORING: {
      id: 'pronunciation_scoring',
      name: 'Pronunciation & Scoring',
      description: 'Issues with pronunciation analysis or scoring',
      priority: 'medium',
      autoTags: ['pronunciation', 'scoring', 'analysis', 'ai'],
      commonIssues: [
        'Scores seem incorrect',
        'Analysis not working',
        'Feedback not helpful',
        'Comparison issues'
      ],
      slaHours: 12,
      assignToTeam: 'ai_support'
    },

    // Account & Data
    DATA_EXPORT: {
      id: 'data_export',
      name: 'Data Export & Privacy',
      description: 'Requests for data export or privacy concerns',
      priority: 'medium',
      autoTags: ['data', 'privacy', 'export', 'gdpr'],
      commonIssues: [
        'Export my data',
        'Delete my recordings',
        'Privacy concerns',
        'Data usage questions'
      ],
      slaHours: 24,
      assignToTeam: 'privacy_team'
    },

    ACCOUNT_ACCESS: {
      id: 'account_access',
      name: 'Account Access Issues',
      description: 'Problems logging in or accessing account',
      priority: 'urgent',
      autoTags: ['account', 'login', 'access', 'password'],
      commonIssues: [
        'Cannot log in',
        'Forgot password',
        'Account locked',
        'Two-factor issues'
      ],
      slaHours: 2,
      assignToTeam: 'account_support'
    },

    // General Support
    OTHER: {
      id: 'other',
      name: 'Other Issues',
      description: 'General questions or issues not covered above',
      priority: 'low',
      autoTags: ['general', 'other', 'misc'],
      commonIssues: [],
      slaHours: 48,
      assignToTeam: 'general_support'
    }
  };

  // Ticket templates for common issues
  private readonly TICKET_TEMPLATES: TicketTemplate[] = [
    {
      categoryId: 'transcript_loading',
      title: 'Transcript Not Loading for Video',
      description: 'I\'m trying to practice with a YouTube video but the transcript won\'t load.',
      fields: [
        {
          name: 'video_url',
          type: 'text',
          required: true
        },
        {
          name: 'browser',
          type: 'select',
          required: true,
          options: ['Chrome', 'Firefox', 'Safari', 'Edge', 'Other']
        },
        {
          name: 'error_message',
          type: 'text',
          required: false
        },
        {
          name: 'screenshot',
          type: 'file',
          required: false
        }
      ]
    },
    {
      categoryId: 'audio_recording',
      title: 'Microphone Not Working',
      description: 'My microphone is not being detected when I try to record.',
      fields: [
        {
          name: 'device_type',
          type: 'select',
          required: true,
          options: ['Desktop', 'Laptop', 'Tablet', 'Phone']
        },
        {
          name: 'operating_system',
          type: 'select',
          required: true,
          options: ['Windows', 'Mac', 'Linux', 'iOS', 'Android']
        },
        {
          name: 'microphone_type',
          type: 'select',
          required: true,
          options: ['Built-in', 'USB', 'Bluetooth', 'Other']
        },
        {
          name: 'other_apps_work',
          type: 'select',
          required: true,
          options: ['Yes', 'No', 'Not tested']
        }
      ]
    },
    {
      categoryId: 'limit_exceeded',
      title: 'Daily Limit Reached Too Soon',
      description: 'I reached my daily practice limit but I don\'t think I used that much time.',
      fields: [
        {
          name: 'expected_usage',
          type: 'text',
          required: true
        },
        {
          name: 'actual_shown',
          type: 'text',
          required: true
        },
        {
          name: 'date_occurred',
          type: 'text',
          required: true
        }
      ]
    }
  ];

  constructor(private supportService: SupportService) {
    this.registerCategories();
  }

  /**
   * Register all YouTube Shadowing support categories
   */
  async registerCategories(): Promise<void> {
    try {
      for (const category of Object.values(this.CATEGORIES)) {
        await this.supportService.registerCategory({
          id: `shadowing_${category.id}`,
          module: 'youtube_shadowing',
          ...category
        });
      }

      logger.info('YouTube Shadowing support categories registered', {
        count: Object.keys(this.CATEGORIES).length
      });
    } catch (error) {
      logger.error('Failed to register support categories', error as Error);
    }
  }

  /**
   * Get category by issue type
   */
  getCategoryForIssue(issueDescription: string): SupportCategory | null {
    const lowerDescription = issueDescription.toLowerCase();

    // Keywords mapping to categories
    const keywordMap: Record<string, string[]> = {
      transcript_loading: ['transcript', 'subtitle', 'caption', 'sync', 'loading'],
      audio_recording: ['microphone', 'recording', 'audio', 'sound', 'voice'],
      extension_issues: ['extension', 'chrome', 'browser', 'addon'],
      limit_exceeded: ['limit', 'minutes', 'quota', 'restricted'],
      subscription_issues: ['payment', 'billing', 'subscription', 'upgrade', 'refund'],
      pronunciation_scoring: ['score', 'pronunciation', 'feedback', 'analysis'],
      video_recommendations: ['recommend', 'suggestion', 'difficulty', 'content'],
      data_export: ['export', 'data', 'privacy', 'delete', 'gdpr'],
      account_access: ['login', 'password', 'access', 'locked', 'signin']
    };

    for (const [categoryId, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(keyword => lowerDescription.includes(keyword))) {
        return this.CATEGORIES[categoryId.toUpperCase()];
      }
    }

    return this.CATEGORIES.OTHER;
  }

  /**
   * Get ticket template
   */
  getTicketTemplate(categoryId: string): TicketTemplate | undefined {
    return this.TICKET_TEMPLATES.find(t => t.categoryId === categoryId);
  }

  /**
   * Create auto-response for category
   */
  async createAutoResponse(
    ticketId: string,
    categoryId: string,
    issueDetails: Record<string, any>
  ): Promise<string> {
    const category = this.CATEGORIES[categoryId.replace('shadowing_', '').toUpperCase()];
    if (!category) {
      return 'Thank you for contacting support. We\'ll review your issue and respond soon.';
    }

    let response = category.autoResponses?.immediate ||
      `Thank you for reporting this ${category.name.toLowerCase()} issue. Our ${category.assignToTeam.replace('_', ' ')} will review and respond within ${category.slaHours} hours.`;

    // Add specific guidance based on issue
    if (categoryId === 'transcript_loading' && issueDetails.video_url) {
      response += '\n\nPlease note that some videos may not have transcripts available, especially if they are very new or have disabled captions.';
    }

    if (categoryId === 'audio_recording') {
      response += '\n\nTroubleshooting steps:\n1. Check browser microphone permissions\n2. Try a different browser\n3. Test your microphone at https://webcammictest.com/';
    }

    if (categoryId === 'limit_exceeded') {
      response += `\n\nYour current plan includes ${issueDetails.plan === 'free' ? '30' : 'unlimited'} minutes of daily practice. View your usage at: /settings/usage`;
    }

    return response;
  }

  /**
   * Get escalation rules for category
   */
  getEscalationRules(categoryId: string): {
    autoEscalateAfterHours: number;
    escalateToTeam: string;
    conditions: string[];
  } {
    const category = this.CATEGORIES[categoryId.replace('shadowing_', '').toUpperCase()];

    return {
      autoEscalateAfterHours: category?.slaHours || 48,
      escalateToTeam: category?.priority === 'urgent' ? 'senior_support' : category?.assignToTeam || 'general_support',
      conditions: [
        'No response within SLA',
        'Customer dissatisfied with resolution',
        'Technical issue affecting multiple users',
        'Payment or billing dispute'
      ]
    };
  }

  /**
   * Generate FAQ based on common issues
   */
  generateFAQ(): Array<{ question: string; answer: string; category: string }> {
    const faqs: Array<{ question: string; answer: string; category: string }> = [];

    for (const category of Object.values(this.CATEGORIES)) {
      category.commonIssues.forEach(issue => {
        faqs.push({
          question: issue,
          answer: this.generateFAQAnswer(category.id, issue),
          category: category.name
        });
      });
    }

    return faqs;
  }

  private generateFAQAnswer(categoryId: string, issue: string): string {
    // Generate contextual FAQ answers
    const answers: Record<string, Record<string, string>> = {
      transcript_loading: {
        'Transcript not loading': 'Ensure the video has captions enabled. Try refreshing the page or using a different browser.',
        'Wrong language displayed': 'Click the settings icon and select your preferred transcript language.',
        'Transcript out of sync': 'This may happen with auto-generated captions. Try a different video or report the issue.',
        'Missing sentences': 'Some videos have incomplete captions. We recommend videos marked as "Verified Transcript".'
      },
      audio_recording: {
        'Microphone not detected': 'Check your browser permissions and ensure no other app is using the microphone.',
        'Recording fails to upload': 'Check your internet connection. Recordings are limited to 5 minutes.',
        'Audio quality issues': 'Use a dedicated microphone and record in a quiet environment for best results.',
        'Processing takes too long': 'Audio processing typically takes 10-30 seconds. Longer recordings may take more time.'
      },
      limit_exceeded: {
        'Daily limit reached unexpectedly': 'Practice time includes video playback and recording. Check your usage details.',
        'Usage not tracking correctly': 'Ensure you\'re logged into the same account. Contact support if the issue persists.',
        'Want to increase limits': 'Upgrade to Pro for unlimited daily practice time and additional features.'
      }
    };

    return answers[categoryId]?.[issue] || 'Please contact our support team for assistance with this issue.';
  }

  /**
   * Get analytics for support categories
   */
  async getCategoryAnalytics(timeframe: 'day' | 'week' | 'month' = 'week'): Promise<{
    mostCommonCategory: string;
    averageResolutionTime: number;
    satisfactionByCategory: Record<string, number>;
    ticketVolume: Record<string, number>;
  }> {
    // This would query actual support ticket data
    return {
      mostCommonCategory: 'transcript_loading',
      averageResolutionTime: 4.5,
      satisfactionByCategory: {
        transcript_loading: 4.2,
        audio_recording: 4.0,
        subscription_issues: 4.5
      },
      ticketVolume: {
        transcript_loading: 145,
        audio_recording: 89,
        limit_exceeded: 67,
        subscription_issues: 45
      }
    };
  }
}
