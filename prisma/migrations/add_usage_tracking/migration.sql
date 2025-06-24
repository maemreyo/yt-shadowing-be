-- Add usage tracking for YouTube Shadowing billing

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  type            TEXT NOT NULL, -- 'minutes', 'recordings', 'speech_to_text'
  amount          INTEGER NOT NULL DEFAULT 1,
  metadata        JSONB,

  -- Billing period tracking
  billing_period_start  TIMESTAMP,
  billing_period_end    TIMESTAMP,

  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX idx_usage_tracking_type ON usage_tracking(type);
CREATE INDEX idx_usage_tracking_created_at ON usage_tracking(created_at);
CREATE INDEX idx_usage_tracking_billing_period ON usage_tracking(billing_period_start, billing_period_end);

-- Create daily usage summary table for faster aggregations
CREATE TABLE IF NOT EXISTS daily_usage_summary (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  date            DATE NOT NULL,

  -- Usage metrics
  minutes_used          INTEGER DEFAULT 0,
  recordings_created    INTEGER DEFAULT 0,
  speech_to_text_calls  INTEGER DEFAULT 0,

  -- Cost tracking
  estimated_cost        DECIMAL(10, 2) DEFAULT 0,

  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_date UNIQUE (user_id, date)
);

-- Indexes for daily summary
CREATE INDEX idx_daily_usage_user_id ON daily_usage_summary(user_id);
CREATE INDEX idx_daily_usage_date ON daily_usage_summary(date);

-- Create function to update daily summary
CREATE OR REPLACE FUNCTION update_daily_usage_summary()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO daily_usage_summary (user_id, date, minutes_used, recordings_created, speech_to_text_calls)
  VALUES (
    NEW.user_id,
    DATE(NEW.created_at),
    CASE WHEN NEW.type = 'minutes' THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.type = 'recordings' THEN NEW.amount ELSE 0 END,
    CASE WHEN NEW.type = 'speech_to_text' THEN NEW.amount ELSE 0 END
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    minutes_used = daily_usage_summary.minutes_used +
      CASE WHEN NEW.type = 'minutes' THEN NEW.amount ELSE 0 END,
    recordings_created = daily_usage_summary.recordings_created +
      CASE WHEN NEW.type = 'recordings' THEN NEW.amount ELSE 0 END,
    speech_to_text_calls = daily_usage_summary.speech_to_text_calls +
      CASE WHEN NEW.type = 'speech_to_text' THEN NEW.amount ELSE 0 END,
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update daily summary
CREATE TRIGGER trigger_update_daily_usage
AFTER INSERT ON usage_tracking
FOR EACH ROW
EXECUTE FUNCTION update_daily_usage_summary();

-- Add YouTube Shadowing specific columns to subscriptions table if not exists
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shadowing_features JSONB DEFAULT '{}';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS usage_limits JSONB DEFAULT '{}';

-- Create usage alerts table
CREATE TABLE IF NOT EXISTS usage_alerts (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  alert_type      TEXT NOT NULL, -- 'limit_warning', 'limit_exceeded', 'cost_alert'
  resource_type   TEXT NOT NULL, -- 'minutes', 'recordings', 'speech_to_text'
  threshold       INTEGER,
  current_usage   INTEGER,
  message         TEXT,

  sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP,

  -- Foreign keys
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for alerts
CREATE INDEX idx_usage_alerts_user_id ON usage_alerts(user_id);
CREATE INDEX idx_usage_alerts_sent_at ON usage_alerts(sent_at);
CREATE INDEX idx_usage_alerts_acknowledged ON usage_alerts(acknowledged_at) WHERE acknowledged_at IS NULL;
