# YouTube Shadowing Security Implementation

## Overview

Comprehensive security features implemented for the YouTube Shadowing application to protect against various threats and ensure safe operation.

## 🛡️ Security Features Implemented

### 1. Audio File Validation (`audio-validation.service.ts`)

Validates uploaded audio files to ensure they are safe and meet requirements:

- **File Type Detection**: Uses magic bytes to verify actual file type
- **Format Validation**: Only allows safe audio formats (mp3, wav, webm, ogg, m4a, aac)
- **Size Limits**: Enforces maximum file size (100MB default)
- **Duration Limits**: Restricts audio length (5 minutes default)
- **Metadata Parsing**: Validates audio properties (bitrate, sample rate, channels)
- **Malware Pattern Detection**: Scans for suspicious patterns in file content
- **Integrity Checks**: Verifies file consistency and structure

#### Usage:
```typescript
const result = await audioValidator.validateAudioFile(filePath, {
  maxSizeBytes: 100 * 1024 * 1024,
  maxDurationSeconds: 300,
  scanForMalware: true
});

if (!result.valid) {
  console.error('Validation failed:', result.errors);
}
```

### 2. Virus Scanning (`virus-scanner.service.ts`)

Integrates with ClamAV for comprehensive malware detection:

- **Real-time Scanning**: Scans files during upload
- **Multiple Scan Modes**: Supports both clamdscan (daemon) and clamscan
- **Quarantine System**: Moves infected files to isolated storage
- **Scan Caching**: Caches results by file hash to improve performance
- **Buffer Scanning**: Can scan in-memory buffers without temp files
- **Event Notifications**: Alerts admins of security threats

#### Configuration:
```env
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
VIRUS_QUARANTINE_INFECTED=true
VIRUS_QUARANTINE_DIR=/var/quarantine
```

### 3. Rate Limiting (`shadowing-rate-limiter.service.ts`)

Plan-based rate limiting for all YouTube Shadowing endpoints:

- **Tiered Limits**: Different limits for Free, Starter, Pro, and Enterprise plans
- **Sliding Window**: Uses Redis sorted sets for accurate rate limiting
- **Per-Endpoint Configuration**: Custom limits for each API endpoint
- **Automatic Headers**: Sets X-RateLimit-* headers on all responses
- **Upgrade Prompts**: Suggests plan upgrades when limits are reached

#### Rate Limit Examples:
```typescript
// YouTube search limits
free: 10 requests per 15 minutes
pro: 100 requests per 15 minutes

// Audio upload limits
free: 10 uploads per 15 minutes
pro: 100 uploads per 15 minutes
```

### 4. CORS for Chrome Extension (`extension-cors.service.ts`)

Secure CORS configuration for browser extension integration:

- **Extension Origin Validation**: Validates chrome-extension://, moz-extension://, etc.
- **Extension ID Whitelisting**: Only allows approved extension IDs in production
- **Custom Headers**: Supports extension-specific headers (X-Extension-Id, X-Extension-Version)
- **Preflight Handling**: Proper OPTIONS request handling
- **Security Headers**: Adds X-Frame-Options, CSP, etc.

#### Supported Extensions:
- Chrome: `chrome-extension://[32-character-id]`
- Firefox: `moz-extension://[uuid]`
- Safari: `safari-extension://[id]`
- Edge: `edge-extension://[32-character-id]`

### 5. Comprehensive Security Configuration (`shadowing-security.config.ts`)

Brings all security features together:

- **Easy Integration**: Single function to configure all security features
- **Configurable**: Customize security settings per environment
- **Event Handlers**: Automated responses to security events
- **Security Monitoring**: Track security metrics and incidents
- **CSP Headers**: Content Security Policy for web and extension requests

## 🚀 Integration Guide

### 1. Enable Security Features

```typescript
import { configureShadowingSecurity } from '@config/shadowing-security.config';

// In your app initialization
await configureShadowingSecurity(app, {
  audioValidation: { enabled: true },
  virusScanning: { enabled: true },
  rateLimiting: { enabled: true },
  cors: { enabled: true }
});
```

### 2. Handle Security Events

```typescript
import { setupSecurityEventHandlers } from '@config/shadowing-security.config';

// Setup event handlers
setupSecurityEventHandlers(eventEmitter);

// Listen for security events
eventEmitter.on('security:virus-detected', (event) => {
  console.error('Virus detected:', event);
});
```

### 3. Monitor Security Status

```typescript
import { SecurityMonitor } from '@config/shadowing-security.config';

// Get security metrics
const metrics = await SecurityMonitor.getMetrics();
console.log('Security metrics:', metrics);

// Check component status
const status = await SecurityMonitor.getStatus();
console.log('Scanner available:', status.virusScanner.available);
```

## 📊 Security Headers

All responses include these security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: [dynamic based on request]
```

## 🔧 Environment Variables

```env
# Audio Validation
MAX_AUDIO_SIZE_MB=100
MAX_AUDIO_DURATION_SECONDS=300

# Virus Scanning
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
VIRUS_QUARANTINE_INFECTED=true
VIRUS_REMOVE_INFECTED=false
VIRUS_QUARANTINE_DIR=/var/quarantine

# Rate Limiting
RATE_LIMIT_REDIS_PREFIX=rate-limit:
RATE_LIMIT_SKIP_SUCCESSFUL=false

# CORS
ALLOWED_EXTENSION_IDS=abcdefghijklmnopqrstuvwxyz123456
ALLOWED_ORIGINS=https://app.yourdomain.com
```

## 🚨 Security Best Practices

1. **Always validate files**: Never trust client-side validation
2. **Keep ClamAV updated**: Regular virus definition updates
3. **Monitor rate limits**: Watch for suspicious patterns
4. **Whitelist extensions**: Only allow known extension IDs in production
5. **Review quarantine**: Regularly check quarantined files
6. **Update dependencies**: Keep security libraries up to date

## 📈 Performance Considerations

- **Virus scanning**: Can add 100-500ms per file
- **Audio validation**: Typically 50-200ms for metadata parsing
- **Rate limiting**: Redis operations add ~1-5ms
- **Use caching**: Cache scan results by file hash

## 🔍 Troubleshooting

### Virus Scanner Not Available
- Check ClamAV is installed: `sudo apt-get install clamav clamav-daemon`
- Ensure clamd is running: `sudo systemctl status clamav-daemon`
- Update virus definitions: `sudo freshclam`

### Rate Limits Not Working
- Verify Redis connection
- Check rate limit keys: `redis-cli keys "rate-limit:*"`
- Review rate limit configuration

### CORS Issues with Extension
- Verify extension ID in allowed list
- Check Origin header is sent
- Review browser console for CORS errors

## 🎯 Next Steps

With security implementation complete, the next phase is **Performance Optimization**:
- Redis caching for transcripts
- CDN integration for audio delivery
- Background job queues
- Database query optimization
