-- CreateEnum
CREATE TYPE "EmailListStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailCampaignType" AS ENUM ('REGULAR', 'AUTOMATED', 'DRIP', 'TRANSACTIONAL', 'AB_TEST');

-- CreateEnum
CREATE TYPE "EmailSegmentOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'GREATER_THAN', 'LESS_THAN', 'IN', 'NOT_IN');

-- CreateEnum
CREATE TYPE "EmailAutomationTrigger" AS ENUM ('USER_SIGNUP', 'LIST_SUBSCRIBE', 'TAG_ADDED', 'DATE_BASED', 'CUSTOM_EVENT', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'OPENED', 'CLICKED', 'UNSUBSCRIBED', 'COMPLAINED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailAutomationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailAutomationDelayUnit" AS ENUM ('MINUTES', 'HOURS', 'DAYS');

-- CreateEnum
CREATE TYPE "EmailAutomationAction" AS ENUM ('SEND_EMAIL', 'WAIT', 'CONDITION', 'TAG', 'UNTAG', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "EmailEngagementLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "EmailVariableType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'LIST');

-- CreateEnum
CREATE TYPE "EmailActivityType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'UNSUBSCRIBED', 'COMPLAINED', 'BOUNCED', 'FAILED');

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "apiEndpoint" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_api_keys" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "currentUsage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "latency" INTEGER NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_templates" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "prompt" TEXT NOT NULL,
    "variables" JSONB,
    "userId" TEXT,
    "tenantId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" VARCHAR(255),
    "model" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "messages" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_lists" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "EmailListStatus" NOT NULL DEFAULT 'ACTIVE',
    "doubleOptIn" BOOLEAN NOT NULL DEFAULT true,
    "welcomeEmailId" TEXT,
    "confirmationPageUrl" TEXT,
    "defaultFromName" VARCHAR(255),
    "defaultFromEmail" VARCHAR(255),
    "defaultReplyTo" VARCHAR(255),
    "customFields" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "email_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_list_subscribers" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "subscribed" BOOLEAN NOT NULL DEFAULT true,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmationToken" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "source" VARCHAR(100),
    "ipAddress" VARCHAR(45),
    "location" VARCHAR(255),
    "customData" JSONB,
    "tags" TEXT[],
    "lastEngagedAt" TIMESTAMP(3),
    "engagementScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagementLevel" "EmailEngagementLevel" NOT NULL DEFAULT 'MEDIUM',
    "metadata" JSONB,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_list_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "preheader" VARCHAR(255),
    "fromName" VARCHAR(255) NOT NULL,
    "fromEmail" VARCHAR(255) NOT NULL,
    "replyTo" VARCHAR(255),
    "type" "EmailCampaignType" NOT NULL DEFAULT 'REGULAR',
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "htmlContent" TEXT NOT NULL,
    "textContent" TEXT,
    "segmentIds" TEXT[],
    "excludeSegmentIds" TEXT[],
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "isABTest" BOOLEAN NOT NULL DEFAULT false,
    "abTestConfig" JSONB,
    "winningVariantId" TEXT,
    "trackOpens" BOOLEAN NOT NULL DEFAULT true,
    "trackClicks" BOOLEAN NOT NULL DEFAULT true,
    "googleAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "utmParams" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_messages" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "variantId" TEXT,
    "subject" VARCHAR(500) NOT NULL,
    "preheader" VARCHAR(255),
    "htmlContent" TEXT NOT NULL,
    "textContent" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_campaign_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_stats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueOpenCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueClickCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribeCount" INTEGER NOT NULL DEFAULT 0,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clickRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clickToOpenRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unsubscribeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complaintRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaign_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "subject" VARCHAR(500) NOT NULL,
    "preheader" VARCHAR(255),
    "htmlContent" TEXT NOT NULL,
    "textContent" TEXT,
    "variables" JSONB,
    "defaultVariableType" "EmailVariableType" NOT NULL DEFAULT 'TEXT',
    "thumbnail" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_segments" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "conditions" JSONB NOT NULL,
    "defaultOperator" "EmailSegmentOperator" NOT NULL DEFAULT 'EQUALS',
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "trigger" "EmailAutomationTrigger" NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "totalEnrolled" INTEGER NOT NULL DEFAULT 0,
    "totalCompleted" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automation_steps" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "order" INTEGER NOT NULL,
    "delayAmount" INTEGER NOT NULL DEFAULT 0,
    "delayUnit" "EmailAutomationDelayUnit" NOT NULL DEFAULT 'HOURS',
    "templateId" TEXT,
    "subject" VARCHAR(500) NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "textContent" TEXT,
    "action" "EmailAutomationAction" NOT NULL DEFAULT 'SEND_EMAIL',
    "actionConfig" JSONB,
    "conditions" JSONB,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_automation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automation_step_runs" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "email_automation_step_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automation_enrollments" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "status" "EmailAutomationStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStepId" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "email_automation_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_activities" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "subscriberId" TEXT NOT NULL,
    "type" "EmailActivityType" NOT NULL,
    "clickedUrl" TEXT,
    "userAgent" TEXT,
    "ipAddress" VARCHAR(45),
    "location" VARCHAR(255),
    "device" VARCHAR(100),
    "os" VARCHAR(100),
    "browser" VARCHAR(100),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_unsubscribes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "listId" TEXT,
    "reason" TEXT,
    "feedback" TEXT,
    "globalUnsubscribe" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_unsubscribes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_ab_test_variants" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "subject" VARCHAR(500),
    "fromName" VARCHAR(255),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clickRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_ab_test_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" VARCHAR(20) NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "difficultyLevel" INTEGER NOT NULL DEFAULT 1,
    "transcriptAvailable" BOOLEAN NOT NULL DEFAULT false,
    "channelId" VARCHAR(50),
    "channelName" VARCHAR(255),
    "thumbnailUrl" TEXT,
    "tags" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "sentences" JSONB NOT NULL,
    "fullText" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'youtube',
    "confidence" DOUBLE PRECISION DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "totalDuration" INTEGER,
    "settings" JSONB NOT NULL,
    "progress" JSONB NOT NULL,

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sentenceIndex" INTEGER NOT NULL,
    "sentenceStartTime" DOUBLE PRECISION NOT NULL,
    "sentenceEndTime" DOUBLE PRECISION NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "audioDuration" DOUBLE PRECISION NOT NULL,
    "audioSize" INTEGER NOT NULL,
    "waveformData" JSONB,
    "transcription" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "pronunciationScore" DOUBLE PRECISION,
    "fluencyScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "sentenceIndex" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "difficultyMarked" BOOLEAN NOT NULL DEFAULT false,
    "attemptsCount" INTEGER NOT NULL DEFAULT 1,
    "bestScore" DOUBLE PRECISION,
    "timeSpent" INTEGER NOT NULL,

    CONSTRAINT "learning_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_api_usage" (
    "id" TEXT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "quotaCost" INTEGER NOT NULL,
    "requestData" JSONB,
    "responseCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "youtube_api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_name_key" ON "ai_providers"("name");

-- CreateIndex
CREATE INDEX "ai_api_keys_userId_tenantId_idx" ON "ai_api_keys"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "ai_api_keys_providerId_idx" ON "ai_api_keys"("providerId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_userId_createdAt_idx" ON "ai_usage_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_tenantId_createdAt_idx" ON "ai_usage_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_providerId_model_idx" ON "ai_usage_logs"("providerId", "model");

-- CreateIndex
CREATE INDEX "ai_prompt_templates_userId_tenantId_idx" ON "ai_prompt_templates"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "ai_prompt_templates_category_idx" ON "ai_prompt_templates"("category");

-- CreateIndex
CREATE INDEX "ai_prompt_templates_isPublic_idx" ON "ai_prompt_templates"("isPublic");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_createdAt_idx" ON "ai_conversations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_conversations_tenantId_idx" ON "ai_conversations"("tenantId");

-- CreateIndex
CREATE INDEX "email_lists_tenantId_idx" ON "email_lists"("tenantId");

-- CreateIndex
CREATE INDEX "email_lists_status_idx" ON "email_lists"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_list_subscribers_confirmationToken_key" ON "email_list_subscribers"("confirmationToken");

-- CreateIndex
CREATE INDEX "email_list_subscribers_email_idx" ON "email_list_subscribers"("email");

-- CreateIndex
CREATE INDEX "email_list_subscribers_confirmed_idx" ON "email_list_subscribers"("confirmed");

-- CreateIndex
CREATE INDEX "email_list_subscribers_subscribedAt_idx" ON "email_list_subscribers"("subscribedAt");

-- CreateIndex
CREATE INDEX "email_list_subscribers_engagementLevel_idx" ON "email_list_subscribers"("engagementLevel");

-- CreateIndex
CREATE UNIQUE INDEX "email_list_subscribers_listId_email_key" ON "email_list_subscribers"("listId", "email");

-- CreateIndex
CREATE INDEX "email_campaigns_tenantId_idx" ON "email_campaigns"("tenantId");

-- CreateIndex
CREATE INDEX "email_campaigns_listId_idx" ON "email_campaigns"("listId");

-- CreateIndex
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");

-- CreateIndex
CREATE INDEX "email_campaigns_scheduledAt_idx" ON "email_campaigns"("scheduledAt");

-- CreateIndex
CREATE INDEX "email_campaign_messages_campaignId_idx" ON "email_campaign_messages"("campaignId");

-- CreateIndex
CREATE INDEX "email_campaign_recipients_status_idx" ON "email_campaign_recipients"("status");

-- CreateIndex
CREATE INDEX "email_campaign_recipients_sentAt_idx" ON "email_campaign_recipients"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_recipients_campaignId_subscriberId_key" ON "email_campaign_recipients"("campaignId", "subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_stats_campaignId_key" ON "email_campaign_stats"("campaignId");

-- CreateIndex
CREATE INDEX "email_templates_tenantId_idx" ON "email_templates"("tenantId");

-- CreateIndex
CREATE INDEX "email_templates_category_idx" ON "email_templates"("category");

-- CreateIndex
CREATE INDEX "email_templates_isPublic_idx" ON "email_templates"("isPublic");

-- CreateIndex
CREATE INDEX "email_templates_isArchived_idx" ON "email_templates"("isArchived");

-- CreateIndex
CREATE INDEX "email_segments_listId_idx" ON "email_segments"("listId");

-- CreateIndex
CREATE INDEX "email_segments_tenantId_idx" ON "email_segments"("tenantId");

-- CreateIndex
CREATE INDEX "email_automations_tenantId_idx" ON "email_automations"("tenantId");

-- CreateIndex
CREATE INDEX "email_automations_listId_idx" ON "email_automations"("listId");

-- CreateIndex
CREATE INDEX "email_automations_active_idx" ON "email_automations"("active");

-- CreateIndex
CREATE INDEX "email_automation_steps_automationId_idx" ON "email_automation_steps"("automationId");

-- CreateIndex
CREATE INDEX "email_automation_steps_order_idx" ON "email_automation_steps"("order");

-- CreateIndex
CREATE INDEX "email_automation_step_runs_stepId_idx" ON "email_automation_step_runs"("stepId");

-- CreateIndex
CREATE INDEX "email_automation_step_runs_enrollmentId_idx" ON "email_automation_step_runs"("enrollmentId");

-- CreateIndex
CREATE INDEX "email_automation_step_runs_executedAt_idx" ON "email_automation_step_runs"("executedAt");

-- CreateIndex
CREATE INDEX "email_automation_enrollments_status_idx" ON "email_automation_enrollments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_automation_enrollments_automationId_subscriberId_key" ON "email_automation_enrollments"("automationId", "subscriberId");

-- CreateIndex
CREATE INDEX "email_activities_campaignId_idx" ON "email_activities"("campaignId");

-- CreateIndex
CREATE INDEX "email_activities_subscriberId_idx" ON "email_activities"("subscriberId");

-- CreateIndex
CREATE INDEX "email_activities_type_idx" ON "email_activities"("type");

-- CreateIndex
CREATE INDEX "email_activities_createdAt_idx" ON "email_activities"("createdAt");

-- CreateIndex
CREATE INDEX "email_unsubscribes_tenantId_idx" ON "email_unsubscribes"("tenantId");

-- CreateIndex
CREATE INDEX "email_unsubscribes_email_idx" ON "email_unsubscribes"("email");

-- CreateIndex
CREATE INDEX "email_unsubscribes_globalUnsubscribe_idx" ON "email_unsubscribes"("globalUnsubscribe");

-- CreateIndex
CREATE UNIQUE INDEX "email_unsubscribes_tenantId_email_listId_key" ON "email_unsubscribes"("tenantId", "email", "listId");

-- CreateIndex
CREATE INDEX "email_ab_test_variants_campaignId_idx" ON "email_ab_test_variants"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "videos_youtubeVideoId_key" ON "videos"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "videos_youtubeVideoId_idx" ON "videos"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "videos_language_idx" ON "videos"("language");

-- CreateIndex
CREATE INDEX "videos_difficultyLevel_idx" ON "videos"("difficultyLevel");

-- CreateIndex
CREATE INDEX "transcripts_videoId_idx" ON "transcripts"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_videoId_language_key" ON "transcripts"("videoId", "language");

-- CreateIndex
CREATE INDEX "practice_sessions_userId_idx" ON "practice_sessions"("userId");

-- CreateIndex
CREATE INDEX "practice_sessions_videoId_idx" ON "practice_sessions"("videoId");

-- CreateIndex
CREATE INDEX "practice_sessions_startTime_idx" ON "practice_sessions"("startTime");

-- CreateIndex
CREATE INDEX "recordings_userId_idx" ON "recordings"("userId");

-- CreateIndex
CREATE INDEX "recordings_sessionId_idx" ON "recordings"("sessionId");

-- CreateIndex
CREATE INDEX "recordings_createdAt_idx" ON "recordings"("createdAt");

-- CreateIndex
CREATE INDEX "learning_progress_userId_idx" ON "learning_progress"("userId");

-- CreateIndex
CREATE INDEX "learning_progress_videoId_idx" ON "learning_progress"("videoId");

-- CreateIndex
CREATE INDEX "learning_progress_completedAt_idx" ON "learning_progress"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "learning_progress_userId_videoId_sentenceIndex_key" ON "learning_progress"("userId", "videoId", "sentenceIndex");

-- CreateIndex
CREATE INDEX "youtube_api_usage_createdAt_idx" ON "youtube_api_usage"("createdAt");

-- CreateIndex
CREATE INDEX "youtube_api_usage_endpoint_idx" ON "youtube_api_usage"("endpoint");

-- AddForeignKey
ALTER TABLE "ai_api_keys" ADD CONSTRAINT "ai_api_keys_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_api_keys" ADD CONSTRAINT "ai_api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_api_keys" ADD CONSTRAINT "ai_api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_list_subscribers" ADD CONSTRAINT "email_list_subscribers_listId_fkey" FOREIGN KEY ("listId") REFERENCES "email_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_listId_fkey" FOREIGN KEY ("listId") REFERENCES "email_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_messages" ADD CONSTRAINT "email_campaign_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_messages" ADD CONSTRAINT "email_campaign_messages_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "email_ab_test_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "email_list_subscribers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_stats" ADD CONSTRAINT "email_campaign_stats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_segments" ADD CONSTRAINT "email_segments_listId_fkey" FOREIGN KEY ("listId") REFERENCES "email_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_segments" ADD CONSTRAINT "email_segments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_listId_fkey" FOREIGN KEY ("listId") REFERENCES "email_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automation_steps" ADD CONSTRAINT "email_automation_steps_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "email_automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automation_steps" ADD CONSTRAINT "email_automation_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automation_step_runs" ADD CONSTRAINT "email_automation_step_runs_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "email_automation_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automation_enrollments" ADD CONSTRAINT "email_automation_enrollments_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "email_automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automation_enrollments" ADD CONSTRAINT "email_automation_enrollments_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "email_list_subscribers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_activities" ADD CONSTRAINT "email_activities_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "email_list_subscribers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_ab_test_variants" ADD CONSTRAINT "email_ab_test_variants_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
