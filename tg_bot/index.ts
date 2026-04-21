import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';
import { SmartAntiSpamSystem } from './smart_antispam.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramUpdate {
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
}
 
const sendMessage = async (chatId: number, text: string, botToken: string) => {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error(`Failed to send message to ${chatId}:`, error);
    return { ok: false, error: error?.message || 'Unknown error' };
  }
};

const isAdmin = (userId: number, adminIds: string): boolean => {
  const admins = adminIds.split(',').map(id => parseInt(id.trim()));
  return admins.includes(userId);
};

// Helper function to get known user descriptions
const getKnownUserDescription = (userId: number): string | null => {
  const knownUsers: Record<number, string> = {
    777000: '🤖 Telegram (служебный аккаунт для пересылки из каналов)'
  };
  return knownUsers[userId] || null;
};

const getSocialLinks = async (supabase: any) => {
  const { data: links } = await supabase
    .from('social_links')
    .select('*')
    .eq('is_active', true)
    .order('order_index');
  
  return links || [];
};

const getNextStreamTime = () => {
  const now = new Date();
  const kstOffset = 9 * 60; // KST = UTC+9
  const nowKST = new Date(now.getTime() + (kstOffset * 60 * 1000));
  
  const streamHour = 22;
  let nextStream = new Date(nowKST);
  nextStream.setHours(streamHour, 0, 0, 0);
  
  if (nowKST.getHours() >= streamHour) {
    nextStream.setDate(nextStream.getDate() + 1);
  }
  
  const timeUntilStream = nextStream.getTime() - nowKST.getTime();
  const hoursUntil = Math.floor(timeUntilStream / (1000 * 60 * 60));
  const minutesUntil = Math.floor((timeUntilStream % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hoursUntil, minutesUntil };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    const adminIds = Deno.env.get('TELEGRAM_ADMIN_IDS')!;
    const channelId = Deno.env.get('TELEGRAM_CHANNEL_ID')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const update: TelegramUpdate = await req.json();
    console.log('Received update:', JSON.stringify(update));

    if (!update.message?.text || !update.message?.from) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatId = update.message.chat.id;
    const userId = update.message.from.id;
    const text = update.message.text;
    const userName = update.message.from.first_name;
    const username = update.message.from.username;

    console.log(`Message from ${userName} (${userId}): ${text}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userIsAdmin = isAdmin(userId, adminIds);

    // Initialize anti-spam system and add admins to whitelist
    const antiSpam = new SmartAntiSpamSystem(supabase, botToken);
    const adminIdArray = adminIds.split(',').map(id => parseInt(id.trim()));
    adminIdArray.forEach(adminId => {
      antiSpam.addToWhitelist(adminId);
    });

    // Anti-spam check (only for group/channel messages, not for commands)
    const chatType = update.message.chat.type;
    const isGroupMessage = chatType === 'group' || chatType === 'supergroup' || chatType === 'channel';
    
    if (isGroupMessage && !text.startsWith('/')) {
      const spamCheckResult = await antiSpam.processMessage(
        userId,
        chatId,
        update.message.message_id,
        text,
        username,
        userName
      );

      if (spamCheckResult.isSpam) {
        console.log(`[ANTISPAM] Detected spam from user ${userId} (${userName}): ${spamCheckResult.reason}`);
        
        if (spamCheckResult.action === 'delete') {
          await antiSpam.deleteMessage(chatId, update.message.message_id);
          console.log(`[ANTISPAM] Deleted message from user ${userId}`);
        }
        
        if (spamCheckResult.action === 'ban') {
          await antiSpam.deleteUserMessages(chatId, userId, 10);
          await antiSpam.banUser(chatId, userId);
          console.log(`[ANTISPAM] Banned user ${userId} (${userName}) for ${spamCheckResult.violationType}`);
          
          // Notify admins
          const adminIdsList = adminIds.split(',').map(id => parseInt(id.trim()));
          for (const adminId of adminIdsList) {
            await sendMessage(
              adminId,
              `⛔️ <b>Пользователь заблокирован</b>\n\n👤 Пользователь: ${userName} (${username || 'без username'})\n🆔 ID: ${userId}\n📛 Причина: ${spamCheckResult.reason}\n🔍 Тип: ${spamCheckResult.violationType}`,
              botToken
            );
          }
        }
        
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle commands
    if (text === '/start') {
      if (userIsAdmin) {
        const welcomeMessage = `
👋 Привет, ${userName}!

Я бот для управления уведомлениями о стримах ARUBY.

<b>👤 Команды для всех:</b>
/social - Получить все социальные ссылки
/subscribe - Подписаться на уведомления о стримах
/unsubscribe - Отписаться от уведомлений
/about - Информация об ARUBY
/schedule - Расписание стримов
/status - Проверить статус стрима

<b>⚡ Команды администратора:</b>
/notify - Включить стрим и отправить уведомление
/off - Выключить статус стрима
/test - Отправить тестовое уведомление
/stats - Статистика уведомлений
/help - Показать эту справку
        `.trim();

        await sendMessage(chatId, welcomeMessage, botToken);
      } else {
        const welcomeMessage = `
👋 Привет, ${userName}!

Добро пожаловать в бот ARUBY!

📱 <b>Доступные команды:</b>
/social - Получить все социальные ссылки
/subscribe - Подписаться на уведомления о стримах
/unsubscribe - Отписаться от уведомлений
/about - Информация об ARUBY
/schedule - Расписание стримов

💎 <b>Присоединяйся к сообществу ARUBY!</b>
🔗 Telegram канал: https://t.me/arubylee
        `.trim();

        await sendMessage(chatId, welcomeMessage, botToken);
      }
    }
    else if (text === '/social') {
      const links = await getSocialLinks(supabase);
      
      if (links.length > 0) {
        const linksMessage = `
📱 <b>Социальные сети ARUBY:</b>

${links.map((link: any) => `${link.icon} ${link.display_name}: ${link.url}`).join('\n\n')}

✨ Подписывайся везде!
        `.trim();

        await sendMessage(chatId, linksMessage, botToken);
      } else {
        await sendMessage(chatId, '❌ Не удалось загрузить ссылки', botToken);
      }
    }
    else if (text === '/subscribe') {
      const { data: existingSubscriber } = await supabase
        .from('telegram_subscribers')
        .select('*')
        .eq('telegram_user_id', userId)
        .maybeSingle();

      if (existingSubscriber) {
        if (existingSubscriber.is_subscribed) {
          await sendMessage(chatId, '✅ Вы уже подписаны на уведомления!', botToken);
        } else {
          await supabase
            .from('telegram_subscribers')
            .update({
              is_subscribed: true,
              subscribed_at: new Date().toISOString(),
              unsubscribed_at: null,
            })
            .eq('telegram_user_id', userId);

          const message = `
✅ <b>Вы снова подписались на уведомления о стримах ARUBY!</b>

Вы будете получать уведомления когда начнется прямой эфир.

Отписаться: /unsubscribe
          `.trim();

          await sendMessage(chatId, message, botToken);
        }
      } else {
        await supabase
          .from('telegram_subscribers')
          .insert({
            telegram_user_id: userId,
            username: username,
            first_name: userName,
            is_subscribed: true,
          });

        const message = `
✅ <b>Вы успешно подписались на уведомления о стримах ARUBY!</b>

Вы будете получать уведомления когда начнется прямой эфир.

Отписаться: /unsubscribe
        `.trim();

        await sendMessage(chatId, message, botToken);
      }
    }
    else if (text === '/unsubscribe') {
      const { data: subscriber } = await supabase
        .from('telegram_subscribers')
        .select('*')
        .eq('telegram_user_id', userId)
        .maybeSingle();

      if (subscriber && subscriber.is_subscribed) {
        await supabase
          .from('telegram_subscribers')
          .update({
            is_subscribed: false,
            unsubscribed_at: new Date().toISOString(),
          })
          .eq('telegram_user_id', userId);

        const message = `
😔 <b>Вы отписались от уведомлений.</b>

Мы будем скучать! Вы всегда можете вернуться: /subscribe
        `.trim();

        await sendMessage(chatId, message, botToken);
      } else {
        await sendMessage(chatId, 'ℹ️ Вы не подписаны на уведомления.', botToken);
      }
    }
    else if (text === '/about') {
      const aboutMessage = `
💎 <b>О ARUBY</b>

ARUBY (ARuby, arubylee) — стримерша на TikTok, создающая светлую атмосферу и вдохновение.

✨ <i>"Свет не выбирает сторону, он просто рядом"</i>

🎭 Контент: прямые эфиры, общение, позитив
🌟 Платформа: TikTok
📅 График: ежедневно с 22:00 (KST)

Используй /social чтобы найти ARUBY во всех соцсетях!
      `.trim();

      await sendMessage(chatId, aboutMessage, botToken);
    }
    else if (text === '/schedule') {
      const { hoursUntil, minutesUntil } = getNextStreamTime();

      const scheduleMessage = `
📅 <b>Расписание стримов ARUBY:</b>

🕐 Время: 22:00 (KST / UTC+9)
📆 Дни: Ежедневно

🌍 <b>Твой часовой пояс:</b>
• Москва: 16:00 (MSK)
• Киев: 15:00 (EET)

⏰ <b>До следующего стрима:</b> ${hoursUntil}ч ${minutesUntil}мин

🔔 Подпишись на уведомления: /subscribe
      `.trim();

      await sendMessage(chatId, scheduleMessage, botToken);
    }
    else if (text === '/status') {
      const { data: status } = await supabase
        .from('stream_status')
        .select('*')
        .eq('platform', 'tiktok')
        .maybeSingle();

      if (status) {
        const statusMessage = `
📊 <b>Статус стрима</b>

${status.is_live ? '🔴 LIVE' : '⚫ Offline'}
${status.stream_title ? `\n📺 ${status.stream_title}` : ''}
${status.viewer_count ? `\n👥 Зрителей: ${status.viewer_count}` : ''}
\n🔗 <a href="${status.stream_url}">Ссылка на стрим</a>
\n⏰ Обновлено: ${new Date(status.updated_at).toLocaleString('ru-RU')}
        `.trim();

        await sendMessage(chatId, statusMessage, botToken);
      } else {
        await sendMessage(chatId, '❌ Не удалось получить статус стрима', botToken);
      }
    }
    else if (text === '/notify' && userIsAdmin) {
      // Устанавливаем статус стрима как LIVE
      const { error: updateError } = await supabase
        .from('stream_status')
        .upsert({
          platform: 'tiktok',
          is_live: true,
          stream_url: 'https://www.tiktok.com/@arubylee/live',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'platform' });

      if (updateError) {
        await sendMessage(chatId, '❌ Ошибка обновления статуса стрима', botToken);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: status } = await supabase
        .from('stream_status')
        .select('*')
        .eq('platform', 'tiktok')
        .maybeSingle();

      // Delete old notifications from channel before sending new one
      const { data: oldNotifications } = await supabase
        .from('telegram_notifications')
        .select('telegram_message_id')
        .order('sent_at', { ascending: false })
        .limit(10);

      if (oldNotifications && oldNotifications.length > 0) {
        console.log(`Deleting ${oldNotifications.length} old notifications`);
        for (const notif of oldNotifications) {
          if (notif.telegram_message_id) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: channelId,
                  message_id: parseInt(notif.telegram_message_id)
                })
              });
              console.log(`Deleted message: ${notif.telegram_message_id}`);
            } catch (e) {
              console.log(`Failed to delete message ${notif.telegram_message_id}:`, e);
            }
          }
        }

        // Clear from database
        await supabase
          .from('telegram_notifications')
          .delete()
          .in('telegram_message_id', oldNotifications.map(n => n.telegram_message_id).filter(Boolean));
      }

      // Create beautiful caption with inline buttons
      const caption = `
🔴 <b>Прямой эфир начался!</b>

🎭 <b>ARUBY</b> сейчас в прямом эфире!

${status?.stream_title ? `📺 ${status.stream_title}\n` : ''}
⚡ Присоединяйтесь прямо сейчас!
      `.trim();

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔗 Смотреть прямой эфир', url: 'https://www.tiktok.com/@arubylee/live' }
          ],
          [
            { text: '📱 TikTok профиль', url: 'https://www.tiktok.com/@arubylee' }
          ]
        ]
      };

      // Send photo notification to channel
      // TODO: Replace with your own hosted image URL
      const photoUrl = 'https://via.placeholder.com/1200x630/FF1B6B/FFFFFF?text=ARUBY+LIVE';
      
      console.log(`Attempting to send photo to channel ${channelId}`);
      const channelPhotoResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channelId,
          photo: photoUrl,
          caption: caption,
          parse_mode: 'HTML',
          reply_markup: keyboard
        })
      });

      let channelResult = await channelPhotoResponse.json();
      console.log('Channel photo send result:', JSON.stringify(channelResult, null, 2));
      
      // Fallback: If photo fails, try sending text message
      if (!channelResult.ok) {
        console.log(`Photo send failed (${channelResult.error_code}: ${channelResult.description}), trying text message...`);
        
        const textCaption = `${caption}\n\n🔗 Смотреть: https://www.tiktok.com/@arubylee/live\n📱 Профиль: https://www.tiktok.com/@arubylee`;
        
        const channelTextResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channelId,
            text: textCaption,
            parse_mode: 'HTML',
            reply_markup: keyboard,
            disable_web_page_preview: false
          })
        });
        
        channelResult = await channelTextResponse.json();
        console.log('Channel text send result:', JSON.stringify(channelResult, null, 2));
      }

      // Get all active subscribers
      const { data: subscribers } = await supabase
        .from('telegram_subscribers')
        .select('*')
        .eq('is_subscribed', true);

      let successCount = 0;
      let failCount = 0;

      // Send to all subscribers
      if (subscribers && subscribers.length > 0) {
        console.log(`Sending notifications to ${subscribers.length} subscribers`);
        
        for (const subscriber of subscribers) {
          const subscriberResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: subscriber.telegram_user_id,
              photo: photoUrl,
              caption: caption,
              parse_mode: 'HTML',
              reply_markup: keyboard
            })
          });
          
          const subscriberResult = await subscriberResponse.json();
          
          if (subscriberResult.ok) {
            successCount++;
          } else {
            failCount++;
            // If bot was blocked, unsubscribe user
            if (subscriberResult.error_code === 403 || subscriberResult.description?.includes('blocked')) {
              console.log(`User ${subscriber.telegram_user_id} blocked the bot, unsubscribing...`);
              await supabase
                .from('telegram_subscribers')
                .update({
                  is_subscribed: false,
                  unsubscribed_at: new Date().toISOString(),
                })
                .eq('telegram_user_id', subscriber.telegram_user_id);
            }
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      if (channelResult.ok) {
        await supabase.from('telegram_notifications').insert({
          stream_title: status?.stream_title,
          viewer_count: successCount,
          stream_url: 'https://www.tiktok.com/@arubylee/live',
          telegram_message_id: channelResult.result?.message_id?.toString(),
        });

        await sendMessage(
          chatId, 
          `✅ Стрим включен и уведомления отправлены!\n\n📊 Статистика:\n✅ Доставлено: ${successCount}\n❌ Не доставлено: ${failCount}\n📢 Канал: ✅`, 
          botToken
        );
      } else {
        const errorMsg = `❌ Ошибка отправки уведомления в канал\n\nКод: ${channelResult.error_code}\nОписание: ${channelResult.description}`;
        console.error('Failed to send to channel:', errorMsg);
        await sendMessage(chatId, errorMsg, botToken);
      }
    }
    else if (text === '/off' && userIsAdmin) {
      const { error: updateError } = await supabase
        .from('stream_status')
        .update({
          is_live: false,
          updated_at: new Date().toISOString(),
        })
        .eq('platform', 'tiktok');

      if (updateError) {
        await sendMessage(chatId, '❌ Ошибка обновления статуса стрима', botToken);
      } else {
        await sendMessage(chatId, '✅ Статус стрима выключен!', botToken);
      }
    }
    else if (text === '/test' && userIsAdmin) {
      const testMessage = `
🔴 <b>ТЕСТОВОЕ УВЕДОМЛЕНИЕ</b>

🎭 <b>ARUBY</b> - тестовое сообщение

📺 Это тестовое уведомление от администратора

🔗 <a href="https://www.tiktok.com/@arubylee/live">Профиль TikTok</a>
      `.trim();

      console.log(`Sending test message to channel: ${channelId}`);
      const result = await sendMessage(parseInt(channelId), testMessage, botToken);
      console.log('Telegram API response:', JSON.stringify(result));

      if (result.ok) {
        await sendMessage(chatId, '✅ Тестовое уведомление отправлено в канал!', botToken);
      } else {
        const errorMsg = `❌ Ошибка: ${result.description || 'Неизвестная ошибка'}\n\nПроверьте:\n1. Бот добавлен в канал как администратор\n2. ID канала правильный (должен начинаться с -100)`;
        console.error('Send message error:', result);
        await sendMessage(chatId, errorMsg, botToken);
      }
    }
    else if (text === '/stats' && userIsAdmin) {
      const { data: notifications, count } = await supabase
        .from('telegram_notifications')
        .select('*', { count: 'exact' })
        .order('sent_at', { ascending: false })
        .limit(5);

      const { data: subscribersData, count: subsCount } = await supabase
        .from('telegram_subscribers')
        .select('*', { count: 'exact' })
        .eq('is_subscribed', true);

      const statsMessage = `
📊 <b>Статистика</b>

👥 Активных подписчиков: ${subsCount || 0}
📨 Всего уведомлений: ${count || 0}

${notifications && notifications.length > 0 ? `\n<b>Последние 5 уведомлений:</b>\n${notifications.map((n, i) => 
  `${i + 1}. ${n.stream_title || 'Без названия'} - ${new Date(n.sent_at).toLocaleDateString('ru-RU')}`
).join('\n')}` : '\nУведомлений еще не было'}
      `.trim();

      await sendMessage(chatId, statsMessage, botToken);
    }
    else if (text === '/help' && userIsAdmin) {
      const helpMessage = `
📚 <b>Справка по командам</b>

<b>👤 Для всех пользователей:</b>
/social - Все социальные ссылки
/subscribe - Подписаться на уведомления
/unsubscribe - Отписаться
/about - Информация об ARUBY
/schedule - Расписание стримов
/status - Текущий статус стрима

<b>⚡ Только для администраторов:</b>
/notify - Включить стрим и отправить уведомление
/off - Выключить статус стрима
/test - Отправить тестовое уведомление
/stats - Подробная статистика
/antispam_stats - Статистика антиспама
/banned_list - Список заблокированных
/user_history [ID] - Детальная история пользователя
/unban [ID] - Разблокировать пользователя
/check_bans - Очистить истекшие временные баны
/help - Эта справка

💡 Используйте /notify когда начинаете стрим, /off когда заканчиваете.

🔐 <b>Система банов:</b>
• Легкие нарушения (флуд, дубликаты, флирт): предупреждение → 1ч → 1д → 7д → постоянный
• Средние (провокации, реклама): 1ч → 1д → 7д → постоянный
• Серьезные (мат, ссылки): 1д → постоянный
      `.trim();

      await sendMessage(chatId, helpMessage, botToken);
    }
    else if (text === '/antispam_stats' && userIsAdmin) {
      const { data: violations, count: violationsCount } = await supabase
        .from('antispam_violations')
        .select('*', { count: 'exact' })
        .order('last_violation_at', { ascending: false })
        .limit(10);

      const { data: banned, count: bannedCount } = await supabase
        .from('antispam_banned_users')
        .select('*', { count: 'exact' });

      const { data: messages, count: messagesCount } = await supabase
        .from('antispam_messages')
        .select('*', { count: 'exact' })
        .eq('is_spam', true);

      const statsMessage = `
📊 <b>Статистика антиспама</b>

🚫 Заблокировано пользователей: ${bannedCount || 0}
⚠️ Всего нарушений: ${violationsCount || 0}
🗑 Удалено спам-сообщений: ${messagesCount || 0}

${violations && violations.length > 0 ? `\n<b>Последние нарушения:</b>\n${violations.map((v, i) => 
  `${i + 1}. ID: ${v.telegram_user_id}\n   Тип: ${v.violation_type}\n   Количество: ${v.violation_count}\n   ${v.is_banned ? '🚫 Забанен' : '⚠️ Предупреждение'}`
).join('\n\n')}` : '\nНарушений пока нет'}
      `.trim();

      await sendMessage(chatId, statsMessage, botToken);
    }
    else if (text === '/banned_list' && userIsAdmin) {
      // Get banned users with violation stats and last messages
      const { data: banned } = await supabase
        .from('antispam_banned_users')
        .select(`
          *,
          violations:antispam_violations!telegram_user_id(violation_count, violation_type),
          messages:antispam_messages!telegram_user_id(message_text, created_at)
        `)
        .order('banned_at', { ascending: false })
        .limit(20);

      if (banned && banned.length > 0) {
        const bannedList = await Promise.all(banned.map(async (b: any, i: number) => {
          const knownDesc = getKnownUserDescription(b.telegram_user_id);
          const displayName = knownDesc || `${b.first_name} ${b.username ? `(@${b.username})` : ''}`;
          
          // Get violation count
          const violationCount = b.violations?.[0]?.violation_count || 0;
          const violationType = b.violations?.[0]?.violation_type || 'unknown';
          
          // Get last message (first 80 chars)
          const lastMessage = b.messages?.[0]?.message_text 
            ? `💬 Последнее сообщение: "${b.messages[0].message_text.substring(0, 80)}${b.messages[0].message_text.length > 80 ? '...' : ''}"`
            : '';
          
          // Check ban type and calculate remaining time
          let banStatus = '';
          if (b.ban_expires_at) {
            const expiresAt = new Date(b.ban_expires_at);
            const now = new Date();
            const secondsRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
            
            if (secondsRemaining > 0) {
              const hours = Math.floor(secondsRemaining / 3600);
              const days = Math.floor(secondsRemaining / 86400);
              const timeLeft = days > 0 ? `${days} дн.` : `${hours} ч.`;
              banStatus = `⏰ Временный бан (осталось: ${timeLeft})`;
            } else {
              banStatus = `⏰ Бан истек`;
            }
          } else {
            banStatus = `♾️ Постоянный бан`;
          }
          
          return `${i + 1}. ${displayName}
   🆔 ID: <a href="tg://user?id=${b.telegram_user_id}">${b.telegram_user_id}</a>
   📛 Причина: ${b.ban_reason}
   📊 Нарушений: ${violationCount} (тип: ${violationType})
   ${lastMessage}
   📅 Забанен: ${new Date(b.banned_at).toLocaleString('ru-RU')}
   ${banStatus}`;
        }));

        const message = `
🚫 <b>Заблокированные пользователи (${banned.length}):</b>

${bannedList.join('\n\n')}

💡 Для разблокировки: /unban [ID]
💡 Для детальной истории: /user_history [ID]
💡 Для очистки истекших банов: /check_bans
        `.trim();

        await sendMessage(chatId, message, botToken);
      } else {
        await sendMessage(chatId, 'ℹ️ Заблокированных пользователей нет', botToken);
      }
    }
    else if (text.startsWith('/user_history ') && userIsAdmin) {
      const parts = text.split(' ');
      if (parts.length < 2) {
        await sendMessage(chatId, '❌ Использование: /user_history [ID пользователя]', botToken);
      } else {
        const targetUserId = parseInt(parts[1]);
        
        if (isNaN(targetUserId)) {
          await sendMessage(chatId, '❌ Неверный ID пользователя', botToken);
        } else {
          // Get user info from banned list
          const { data: bannedUser } = await supabase
            .from('antispam_banned_users')
            .select('*')
            .eq('telegram_user_id', targetUserId)
            .maybeSingle();
          
          // Get violation history
          const { data: violations } = await supabase
            .from('antispam_violations')
            .select('*')
            .eq('telegram_user_id', targetUserId)
            .order('last_violation_at', { ascending: false });
          
          // Get message history
          const { data: messages } = await supabase
            .from('antispam_messages')
            .select('*')
            .eq('telegram_user_id', targetUserId)
            .order('created_at', { ascending: false })
            .limit(10);
          
          if (!bannedUser && (!violations || violations.length === 0) && (!messages || messages.length === 0)) {
            await sendMessage(chatId, `ℹ️ История для пользователя ${targetUserId} не найдена`, botToken);
          } else {
            const knownDesc = getKnownUserDescription(targetUserId);
            const userName = bannedUser ? 
              (knownDesc || `${bannedUser.first_name} ${bannedUser.username ? `(@${bannedUser.username})` : ''}`) : 
              (knownDesc || `ID ${targetUserId}`);
            
            let historyMessage = `📊 <b>История пользователя: ${userName}</b>\n`;
            historyMessage += `🆔 ID: <a href="tg://user?id=${targetUserId}">${targetUserId}</a>\n\n`;
            
            // Ban status
            if (bannedUser) {
              historyMessage += `🚫 <b>Статус:</b> Заблокирован\n`;
              historyMessage += `📛 Причина: ${bannedUser.ban_reason}\n`;
              historyMessage += `📅 Дата бана: ${new Date(bannedUser.banned_at).toLocaleString('ru-RU')}\n`;
              if (bannedUser.ban_expires_at) {
                historyMessage += `⏱ Истекает: ${new Date(bannedUser.ban_expires_at).toLocaleString('ru-RU')}\n`;
              }
              historyMessage += `👤 Забанил: ${bannedUser.banned_by}\n\n`;
            } else {
              historyMessage += `✅ <b>Статус:</b> Не заблокирован\n\n`;
            }
            
            // Violations
            if (violations && violations.length > 0) {
              historyMessage += `⚠️ <b>Нарушения (${violations.length}):</b>\n`;
              violations.forEach((v: any, i: number) => {
                historyMessage += `${i + 1}. ${v.violation_type} (×${v.violation_count})\n`;
                historyMessage += `   Последнее: ${new Date(v.last_violation_at).toLocaleString('ru-RU')}\n`;
              });
              historyMessage += '\n';
            }
            
            // Recent messages
            if (messages && messages.length > 0) {
              historyMessage += `💬 <b>Последние сообщения (${messages.length}):</b>\n`;
              messages.slice(0, 5).forEach((m: any, i: number) => {
                const msgText = m.message_text.substring(0, 100);
                const spamFlag = m.is_spam ? '🚨' : '';
                historyMessage += `${i + 1}. ${spamFlag} "${msgText}${m.message_text.length > 100 ? '...' : ''}"\n`;
                historyMessage += `   ${new Date(m.created_at).toLocaleString('ru-RU')}\n`;
                if (m.similarity_score > 0) {
                  historyMessage += `   Схожесть: ${(m.similarity_score * 100).toFixed(1)}%\n`;
                }
              });
            }
            
            await sendMessage(chatId, historyMessage.trim(), botToken);
          }
        }
      }
    }
    else if (text.startsWith('/unban ') && userIsAdmin) {
      const parts = text.split(' ');
      if (parts.length < 2) {
        await sendMessage(chatId, '❌ Использование:\n/unban [ID пользователя]\n/unban [ID пользователя] [ID чата]\n\n💡 Если пользователь не разблокирован, укажите ID чата вручную', botToken);
      } else {
        const targetUserId = parseInt(parts[1]);
        const manualChatId = parts.length >= 3 ? parseInt(parts[2]) : null;
        
        if (isNaN(targetUserId)) {
          await sendMessage(chatId, '❌ Неверный ID пользователя', botToken);
        } else if (manualChatId !== null && isNaN(manualChatId)) {
          await sendMessage(chatId, '❌ Неверный ID чата', botToken);
        } else {
          // Get ban info including chat_id
          const { data: banInfo } = await supabase
            .from('antispam_banned_users')
            .select('chat_id, first_name, username')
            .eq('telegram_user_id', targetUserId)
            .maybeSingle();
          
          // Priority: manual chat_id > stored chat_id > channel fallback
          const targetChatId = manualChatId || banInfo?.chat_id || parseInt(channelId);
          
          console.log(`[UNBAN] Attempting to unban user ${targetUserId} from chat ${targetChatId} (manual: ${manualChatId}, stored: ${banInfo?.chat_id}, channel: ${channelId})`);
          
          // UNBAN IN TELEGRAM FIRST!
          let telegramUnbanned = false;
          if (targetChatId) {
            telegramUnbanned = await antiSpam.unbanUserInTelegram(targetChatId, targetUserId);
            console.log(`[UNBAN] Telegram unban result for user ${targetUserId} in chat ${targetChatId}: ${telegramUnbanned}`);
          }

          // Remove from banned list in database
          const { error: deleteBannedError } = await supabase
            .from('antispam_banned_users')
            .delete()
            .eq('telegram_user_id', targetUserId);

          // Reset violations
          const { error: updateViolationsError } = await supabase
            .from('antispam_violations')
            .update({
              is_banned: false,
              violation_count: 0
            })
            .eq('telegram_user_id', targetUserId);

          const userName = banInfo ? `${banInfo.first_name}${banInfo.username ? ` (@${banInfo.username})` : ''}` : `ID ${targetUserId}`;
          const telegramStatus = telegramUnbanned ? '✅ Telegram' : '⚠️ Telegram (не удалось)';
          
          await sendMessage(
            chatId, 
            `✅ Пользователь ${userName} разблокирован\n\n${telegramStatus} (чат: ${targetChatId})\n✅ База данных\n\n💡 Теперь пользователь может снова присоединиться к чату/каналу`,
            botToken
          );
        }
      }
    }
    else if (text === '/check_bans' && userIsAdmin) {
      // Delete expired bans
      const { data: expiredBans, error: deleteError } = await supabase
        .from('antispam_banned_users')
        .delete()
        .lt('ban_expires_at', new Date().toISOString())
        .not('ban_expires_at', 'is', null)
        .select('telegram_user_id, first_name, username');
      
      if (deleteError) {
        await sendMessage(chatId, '❌ Ошибка при проверке банов', botToken);
      } else if (expiredBans && expiredBans.length > 0) {
        // Update violations for unbanned users
        for (const user of expiredBans) {
          await supabase
            .from('antispam_violations')
            .update({ is_banned: false })
            .eq('telegram_user_id', user.telegram_user_id);
        }
        
        const unbannedList = expiredBans.map((u: any) => 
          `• ${u.first_name}${u.username ? ` (@${u.username})` : ''} (ID: ${u.telegram_user_id})`
        ).join('\n');
        
        await sendMessage(
          chatId, 
          `✅ Удалено истекших банов: ${expiredBans.length}\n\n${unbannedList}`,
          botToken
        );
      } else {
        await sendMessage(chatId, 'ℹ️ Истекших банов не найдено', botToken);
      }
    }
    else if (text.startsWith('/') && !userIsAdmin) {
      await sendMessage(
        chatId,
        '❓ Неизвестная команда. Используйте /start для списка доступных команд.',
        botToken
      );
    }
    else if (text.startsWith('/')) {
      await sendMessage(
        chatId,
        '❓ Неизвестная команда. Используйте /help для списка доступных команд.',
        botToken
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in telegram-bot function:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
