// SmartAntiSpamSystem - Intelligent anti-spam system for Telegram bot
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

// System users that should never be checked for spam
const SPAM_CHECK_WHITELIST = new Set<number>([
  777000,  // Telegram service account (auto-forwards from channels)
  // Admin IDs will be added dynamically from config
]);

interface SpamCheckResult {
  isSpam: boolean;
  reason: string;
  action: 'none' | 'delete' | 'ban';
  violationType?: string;
}

interface AntiSpamConfig {
  stop_words_profanity: string[];
  stop_phrases_provocation: string[];
  stop_phrases_flirt: string[];
  spam_keywords: string[];
  flood_limit: { messages: number; period_seconds: number };
  similarity_threshold: number;
  violation_threshold: number;
  recent_messages_check: number;
}

interface SeverityLevel {
  types: string[];
  ban_durations: number[]; // in seconds, 0 = warning only
  permanent_after: number;
  description: string;
}

interface ViolationSeverityConfig {
  light: SeverityLevel;
  medium: SeverityLevel;
  severe: SeverityLevel;
}

export class MessageAnalyzer {
  normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s\u0400-\u04FF]/g, '') // Keep only letters, numbers, spaces (including Cyrillic)
      .replace(/\s+/g, ' ');
  }

  calculateHash(text: string): string {
    const normalized = this.normalizeText(text);
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = Array.from({ length: len1 + 1 }, () => 
      Array(len2 + 1).fill(0)
    );

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[len1][len2];
  }

  calculateSimilarity(text1: string, text2: string): number {
    const normalized1 = this.normalizeText(text1);
    const normalized2 = this.normalizeText(text2);
    
    if (normalized1.length === 0 || normalized2.length === 0) return 0;
    
    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    return 1 - (distance / maxLength);
  }

  isNearDuplicate(text: string, recentMessages: string[], threshold: number): { isDuplicate: boolean; similarity: number } {
    const normalized = this.normalizeText(text);
    let maxSimilarity = 0;

    for (const recentMsg of recentMessages) {
      const similarity = this.calculateSimilarity(normalized, recentMsg);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
      if (similarity >= threshold) {
        return { isDuplicate: true, similarity };
      }
    }

    return { isDuplicate: false, similarity: maxSimilarity };
  }
}

export class ContentFilter {
  private config: AntiSpamConfig | null = null;

  async loadConfig(supabase: SupabaseClient): Promise<void> {
    const { data, error } = await supabase
      .from('antispam_config')
      .select('config_key, config_value');

    if (error) {
      console.error('[ANTISPAM] Error loading config:', error);
      return;
    }

    const configObj: any = {};
    data?.forEach((item: any) => {
      configObj[item.config_key] = item.config_value;
    });

    this.config = configObj as AntiSpamConfig;
  }

  checkProfanity(text: string): boolean {
    if (!this.config) return false;
    const normalized = text.toLowerCase();
    return this.config.stop_words_profanity.some(word => 
      normalized.includes(word.toLowerCase())
    );
  }

  checkProvocation(text: string): boolean {
    if (!this.config) return false;
    const normalized = text.toLowerCase();
    return this.config.stop_phrases_provocation.some(phrase => 
      normalized.includes(phrase.toLowerCase())
    );
  }

  checkFlirt(text: string): boolean {
    if (!this.config) return false;
    const normalized = text.toLowerCase();
    return this.config.stop_phrases_flirt.some(phrase => 
      normalized.includes(phrase.toLowerCase())
    );
  }

  checkLinks(text: string): boolean {
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(@[a-zA-Z0-9_]+)/g;
    return urlRegex.test(text);
  }

  checkAdvertising(text: string): boolean {
    if (!this.config) return false;
    const normalized = text.toLowerCase();
    return this.config.spam_keywords.some(keyword => 
      normalized.includes(keyword.toLowerCase())
    );
  }

  getConfig(): AntiSpamConfig | null {
    return this.config;
  }
}

export class FloodDetector {
  private userActivity: Map<number, number[]> = new Map();

  checkFlood(userId: number, periodSeconds: number, messageLimit: number): boolean {
    const now = Date.now();
    const timestamps = this.userActivity.get(userId) || [];
    
    // Remove old timestamps
    const recentTimestamps = timestamps.filter(ts => 
      now - ts < periodSeconds * 1000
    );
    
    // Add current timestamp
    recentTimestamps.push(now);
    this.userActivity.set(userId, recentTimestamps);
    
    // Check if flood
    return recentTimestamps.length > messageLimit;
  }

  cleanup(userId: number): void {
    this.userActivity.delete(userId);
  }
}

export class ViolationTracker {
  private severityConfig: ViolationSeverityConfig | null = null;

  constructor(private supabase: SupabaseClient) {}

  async loadSeverityConfig(): Promise<void> {
    const { data, error } = await this.supabase
      .from('antispam_config')
      .select('config_value')
      .eq('config_key', 'violation_severity')
      .single();

    if (error) {
      console.error('[ANTISPAM] Error loading severity config:', error);
      return;
    }

    this.severityConfig = data?.config_value as ViolationSeverityConfig;
  }

  getSeverityLevel(violationType: string): 'light' | 'medium' | 'severe' | null {
    if (!this.severityConfig) return null;
    
    if (this.severityConfig.light.types.includes(violationType)) return 'light';
    if (this.severityConfig.medium.types.includes(violationType)) return 'medium';
    if (this.severityConfig.severe.types.includes(violationType)) return 'severe';
    
    return null;
  }

  getBanDuration(violationType: string, violationCount: number): number | null {
    if (!this.severityConfig) return null;
    
    const severity = this.getSeverityLevel(violationType);
    if (!severity) return null;
    
    const config = this.severityConfig[severity];
    
    // Check if should be permanent ban
    if (violationCount >= config.permanent_after) {
      return -1; // -1 means permanent
    }
    
    // Get ban duration for this violation count (array is 0-indexed)
    const durationIndex = violationCount - 1;
    if (durationIndex < 0 || durationIndex >= config.ban_durations.length) {
      return null; // No ban, just warning
    }
    
    return config.ban_durations[durationIndex];
  }

  formatBanDuration(seconds: number): string {
    if (seconds === -1) return 'постоянный бан';
    if (seconds === 0) return 'предупреждение';
    if (seconds === 3600) return 'бан на 1 час';
    if (seconds === 86400) return 'бан на 1 день';
    if (seconds === 604800) return 'бан на 7 дней';
    
    const hours = Math.floor(seconds / 3600);
    const days = Math.floor(seconds / 86400);
    
    if (days > 0) return `бан на ${days} дн.`;
    if (hours > 0) return `бан на ${hours} ч.`;
    return `бан на ${seconds} сек.`;
  }

  async recordViolation(userId: number, violationType: string): Promise<number> {
    const { data: existing, error: fetchError } = await this.supabase
      .from('antispam_violations')
      .select('*')
      .eq('telegram_user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[ANTISPAM] Error fetching violation:', fetchError);
      return 1;
    }

    if (existing) {
      const newCount = existing.violation_count + 1;
      const { error: updateError } = await this.supabase
        .from('antispam_violations')
        .update({
          violation_count: newCount,
          violation_type: violationType,
          last_violation_at: new Date().toISOString()
        })
        .eq('telegram_user_id', userId);

      if (updateError) {
        console.error('[ANTISPAM] Error updating violation:', updateError);
      }
      return newCount;
    } else {
      const { error: insertError } = await this.supabase
        .from('antispam_violations')
        .insert({
          telegram_user_id: userId,
          violation_type: violationType,
          violation_count: 1,
          last_violation_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('[ANTISPAM] Error inserting violation:', insertError);
      }
      return 1;
    }
  }

  async getViolationCount(userId: number): Promise<number> {
    const { data, error } = await this.supabase
      .from('antispam_violations')
      .select('violation_count')
      .eq('telegram_user_id', userId)
      .single();

    if (error) {
      return 0;
    }

    return data?.violation_count || 0;
  }

  async shouldBanUser(userId: number, threshold: number): Promise<boolean> {
    const count = await this.getViolationCount(userId);
    return count >= threshold;
  }

  async banUser(userId: number, username: string | undefined, firstName: string, reason: string, banDurationSeconds: number = -1, chatId?: number): Promise<void> {
    const now = new Date();
    let banExpiresAt = null;
    
    // Calculate expiry time for temporary bans
    if (banDurationSeconds > 0) {
      banExpiresAt = new Date(now.getTime() + banDurationSeconds * 1000).toISOString();
    }
    
    const { error: banError } = await this.supabase
      .from('antispam_banned_users')
      .upsert({
        telegram_user_id: userId,
        username: username || null,
        first_name: firstName,
        ban_reason: reason,
        banned_by: 'auto',
        banned_at: now.toISOString(),
        ban_expires_at: banExpiresAt,
        chat_id: chatId || null
      }, { onConflict: 'telegram_user_id' });

    if (banError) {
      console.error('[ANTISPAM] Error inserting ban record:', banError);
    }

    // Mark as banned in violations
    const { error: updateError } = await this.supabase
      .from('antispam_violations')
      .update({
        is_banned: true,
        banned_at: now.toISOString()
      })
      .eq('telegram_user_id', userId);

    if (updateError) {
      console.error('[ANTISPAM] Error updating ban status:', updateError);
    }
  }

  async isUserBanned(userId: number): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('antispam_banned_users')
      .select('id, ban_expires_at')
      .eq('telegram_user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[ANTISPAM] Error checking ban status:', error);
      return false;
    }

    if (!data) return false;

    // Check if temporary ban has expired
    if (data.ban_expires_at) {
      const expiresAt = new Date(data.ban_expires_at);
      const now = new Date();
      
      if (now > expiresAt) {
        // Ban expired, remove it
        console.log(`[ANTISPAM] Temporary ban for user ${userId} has expired, removing...`);
        await this.supabase
          .from('antispam_banned_users')
          .delete()
          .eq('telegram_user_id', userId);
        
        // Update violations
        await this.supabase
          .from('antispam_violations')
          .update({ is_banned: false })
          .eq('telegram_user_id', userId);
        
        return false;
      }
    }

    return true;
  }
}

export class SmartAntiSpamSystem {
  private analyzer: MessageAnalyzer;
  private filter: ContentFilter;
  private floodDetector: FloodDetector;
  private violationTracker: ViolationTracker;
  private configLoaded: boolean = false;

  constructor(
    private supabase: SupabaseClient,
    private botToken: string
  ) {
    this.analyzer = new MessageAnalyzer();
    this.filter = new ContentFilter();
    this.floodDetector = new FloodDetector();
    this.violationTracker = new ViolationTracker(supabase);
  }

  private async ensureConfigLoaded(): Promise<void> {
    if (!this.configLoaded) {
      await this.filter.loadConfig(this.supabase);
      await this.violationTracker.loadSeverityConfig();
      this.configLoaded = true;
    }
  }

  async processMessage(
    userId: number,
    chatId: number,
    messageId: number,
    text: string,
    username: string | undefined,
    firstName: string
  ): Promise<SpamCheckResult> {
    await this.ensureConfigLoaded();
    const config = this.filter.getConfig();
    
    if (!config) {
      console.error('[ANTISPAM] Config not loaded');
      return { isSpam: false, reason: '', action: 'none' };
    }

    // Check whitelist first - system users and admins are never checked
    if (SPAM_CHECK_WHITELIST.has(userId)) {
      console.log(`[ANTISPAM] User ${userId} is in whitelist, skipping spam check`);
      return { isSpam: false, reason: '', action: 'none' };
    }

    // Check if user is already banned
    const isBanned = await this.violationTracker.isUserBanned(userId);
    if (isBanned) {
      console.log(`[ANTISPAM] Banned user ${userId} tried to send message`);
      return { isSpam: true, reason: 'User is banned', action: 'delete' };
    }

    // Check flood
    const isFlood = this.floodDetector.checkFlood(
      userId,
      config.flood_limit.period_seconds,
      config.flood_limit.messages
    );

    if (isFlood) {
      console.log(`[ANTISPAM] Flood detected from user ${userId}`);
      const violationCount = await this.violationTracker.recordViolation(userId, 'flood');
      const banDuration = this.violationTracker.getBanDuration('flood', violationCount);
      
      if (banDuration !== null && banDuration !== 0) {
        await this.violationTracker.banUser(userId, username, firstName, 'Flood spam', banDuration, chatId);
        const banMsg = this.violationTracker.formatBanDuration(banDuration);
        return { isSpam: true, reason: `Flood - ${banMsg}`, action: 'ban', violationType: 'flood' };
      }
      
      return { isSpam: true, reason: 'Flood detected (предупреждение)', action: 'delete', violationType: 'flood' };
    }

    // Check profanity
    if (this.filter.checkProfanity(text)) {
      console.log(`[ANTISPAM] Profanity detected from user ${userId}`);
      const violationCount = await this.violationTracker.recordViolation(userId, 'profanity');
      const banDuration = this.violationTracker.getBanDuration('profanity', violationCount);
      
      if (banDuration !== null && banDuration !== 0) {
        await this.violationTracker.banUser(userId, username, firstName, 'Profanity', banDuration, chatId);
        const banMsg = this.violationTracker.formatBanDuration(banDuration);
        return { isSpam: true, reason: `Profanity - ${banMsg}`, action: 'ban', violationType: 'profanity' };
      }
      
      return { isSpam: true, reason: 'Profanity detected (предупреждение)', action: 'delete', violationType: 'profanity' };
    }

    // Check provocation
    if (this.filter.checkProvocation(text)) {
      console.log(`[ANTISPAM] Provocation detected from user ${userId}`);
      const violationCount = await this.violationTracker.recordViolation(userId, 'provocation');
      const banDuration = this.violationTracker.getBanDuration('provocation', violationCount);
      
      if (banDuration !== null && banDuration !== 0) {
        await this.violationTracker.banUser(userId, username, firstName, 'Provocation', banDuration, chatId);
        const banMsg = this.violationTracker.formatBanDuration(banDuration);
        return { isSpam: true, reason: `Provocation - ${banMsg}`, action: 'ban', violationType: 'provocation' };
      }
      
      return { isSpam: true, reason: 'Provocation detected (предупреждение)', action: 'delete', violationType: 'provocation' };
    }

    // Check flirt
    if (this.filter.checkFlirt(text)) {
      console.log(`[ANTISPAM] Flirt detected from user ${userId}`);
      const violationCount = await this.violationTracker.recordViolation(userId, 'flirt');
      const banDuration = this.violationTracker.getBanDuration('flirt', violationCount);
      
      if (banDuration !== null && banDuration !== 0) {
        await this.violationTracker.banUser(userId, username, firstName, 'Flirt', banDuration, chatId);
        const banMsg = this.violationTracker.formatBanDuration(banDuration);
        return { isSpam: true, reason: `Flirt - ${banMsg}`, action: 'ban', violationType: 'flirt' };
      }
      
      return { isSpam: true, reason: 'Flirt detected (предупреждение)', action: 'delete', violationType: 'flirt' };
    }

    // Check links
    if (this.filter.checkLinks(text)) {
      console.log(`[ANTISPAM] Link detected from user ${userId}`);
      const violationCount = await this.violationTracker.recordViolation(userId, 'link');
      const banDuration = this.violationTracker.getBanDuration('link', violationCount);
      
      if (banDuration !== null && banDuration !== 0) {
        await this.violationTracker.banUser(userId, username, firstName, 'Link spam', banDuration, chatId);
        const banMsg = this.violationTracker.formatBanDuration(banDuration);
        return { isSpam: true, reason: `Link spam - ${banMsg}`, action: 'ban', violationType: 'link' };
      }
      
      return { isSpam: true, reason: 'Link detected (предупреждение)', action: 'delete', violationType: 'link' };
    }

    // Check advertising
    if (this.filter.checkAdvertising(text)) {
      console.log(`[ANTISPAM] Advertising detected from user ${userId}`);
      const violationCount = await this.violationTracker.recordViolation(userId, 'advertising');
      const banDuration = this.violationTracker.getBanDuration('advertising', violationCount);
      
      if (banDuration !== null && banDuration !== 0) {
        await this.violationTracker.banUser(userId, username, firstName, 'Advertising', banDuration, chatId);
        const banMsg = this.violationTracker.formatBanDuration(banDuration);
        return { isSpam: true, reason: `Advertising - ${banMsg}`, action: 'ban', violationType: 'advertising' };
      }
      
      return { isSpam: true, reason: 'Advertising detected (предупреждение)', action: 'delete', violationType: 'advertising' };
    }

    // Check duplicate messages
    const { data: recentMessages } = await this.supabase
      .from('antispam_messages')
      .select('message_text')
      .eq('telegram_user_id', userId)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(config.recent_messages_check);

    if (recentMessages && recentMessages.length > 0) {
      const recentTexts = recentMessages.map(m => m.message_text);
      const { isDuplicate, similarity } = this.analyzer.isNearDuplicate(
        text,
        recentTexts,
        config.similarity_threshold
      );

      if (isDuplicate) {
        console.log(`[ANTISPAM] Duplicate message detected from user ${userId}, similarity: ${similarity}`);
        const violationCount = await this.violationTracker.recordViolation(userId, 'duplicate');
        
        // Store message as spam
        await this.supabase
          .from('antispam_messages')
          .insert({
            telegram_user_id: userId,
            chat_id: chatId,
            message_id: messageId,
            message_text: text,
            message_hash: this.analyzer.calculateHash(text),
            similarity_score: similarity,
            is_spam: true
          });

        const banDuration = this.violationTracker.getBanDuration('duplicate', violationCount);
        
        if (banDuration !== null && banDuration !== 0) {
          await this.violationTracker.banUser(userId, username, firstName, 'Duplicate spam', banDuration, chatId);
          const banMsg = this.violationTracker.formatBanDuration(banDuration);
          return { isSpam: true, reason: `Duplicate - ${banMsg}`, action: 'ban', violationType: 'duplicate' };
        }
        
        return { isSpam: true, reason: 'Duplicate message (предупреждение)', action: 'delete', violationType: 'duplicate' };
      }
    }

    // Store message as clean
    await this.supabase
      .from('antispam_messages')
      .insert({
        telegram_user_id: userId,
        chat_id: chatId,
        message_id: messageId,
        message_text: text,
        message_hash: this.analyzer.calculateHash(text),
        is_spam: false
      });

    return { isSpam: false, reason: '', action: 'none' };
  }

  addToWhitelist(userId: number): void {
    SPAM_CHECK_WHITELIST.add(userId);
    console.log(`[ANTISPAM] Added user ${userId} to whitelist`);
  }

  async deleteMessage(chatId: number, messageId: number): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/deleteMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId })
      });

      const result = await response.json();
      return result.ok;
    } catch (error) {
      console.error('[ANTISPAM] Error deleting message:', error);
      return false;
    }
  }

  async banUser(chatId: number, userId: number): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/banChatMember`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          user_id: userId,
          until_date: 0 // Permanent ban
        })
      });

      const result = await response.json();
      return result.ok;
    } catch (error) {
      console.error('[ANTISPAM] Error banning user:', error);
      return false;
    }
  }

  async unbanUserInTelegram(chatId: number, userId: number): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/unbanChatMember`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          user_id: userId,
          only_if_banned: true
        })
      });

      const result = await response.json();
      console.log(`[ANTISPAM] Unbanned user ${userId} in chat ${chatId}: ${JSON.stringify(result)}`);
      return result.ok;
    } catch (error) {
      console.error('[ANTISPAM] Error unbanning user:', error);
      return false;
    }
  }

  async deleteUserMessages(chatId: number, userId: number, count: number): Promise<void> {
    // Get user's recent messages
    const { data: messages } = await this.supabase
      .from('antispam_messages')
      .select('message_id')
      .eq('telegram_user_id', userId)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(count);

    if (messages) {
      for (const msg of messages) {
        await this.deleteMessage(chatId, msg.message_id);
      }
    }
  }
}
