// Roots Nudge Engine
// Runs every 6 hours via setInterval
// Computes connection scores, generates nudge text, sends push notifications

const { Expo } = require('expo-server-sdk');
const { sendWhatsAppMessage } = require('./lib/whatsapp');

const expo = new Expo();

// ── Score decay config ─────────────────────────────────
const DECAY_CONFIG = {
  intimate:   { nudgeMultiplier: 1.5, decayPerDay: 5,  minScore: 20 },
  close:      { nudgeMultiplier: 1.5, decayPerDay: 3,  minScore: 20 },
  active:     { nudgeMultiplier: 2.0, decayPerDay: 2,  minScore: 20 },
  meaningful: { nudgeMultiplier: 2.0, decayPerDay: 1,  minScore: 20 },
};

// ── Nudge message templates ────────────────────────────
const nudgeTemplates = {
  overdue: (name, days, layer) => {
    if (layer === 'intimate') {
      if (days < 7)  return `It's been ${days} days since you caught up with ${name}. Give them a call?`;
      if (days < 14) return `A week since you spoke with ${name}. Drop them a message.`;
      return `${name} hasn't heard from you in ${days} days. They'd love to catch up.`;
    }
    if (layer === 'close') {
      if (days < 30) return `It's been a while since you caught up with ${name}. Maybe give them a call this week?`;
      return `A month since you spoke with ${name}. Don't let too much time pass.`;
    }
    if (days < 60) return `You haven't been in touch with ${name} for ${days} days.`;
    return `It's been ${Math.floor(days / 30)} months since you caught up with ${name}.`;
  },

  birthdayIn21: (name) =>
    `${name}'s birthday is in 3 weeks. Start thinking about something special.`,

  birthdayIn7: (name) =>
    `${name}'s birthday is next week. Don't forget to reach out.`,

  birthdayToday: (name) =>
    `Today is ${name}'s birthday. Wish them a wonderful day!`,
};

// ── Send push notification ─────────────────────────────
const sendPush = async (pushTokens, title, body, data = {}) => {
  const messages = pushTokens
    .filter(token => Expo.isExpoPushToken(token))
    .map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('Push send error:', err);
    }
  }
};

// ── Main nudge computation ─────────────────────────────
const runNudgeEngine = async (db) => {
  console.log('[Nudge Engine] Running at', new Date().toISOString());

  try {
    // Get all connections that are not exempt
    const { rows: connections } = await db.query(`
      SELECT
        c.id,
        c.user_id,
        c.connected_user_id,
        c.layer,
        c.contact_frequency,
        c.score,
        c.last_contact_at,
        c.nudge_sent_at,
        c.always_in_touch,
        c.nudge,
        cu.display_name as connected_name,
        cu.date_of_birth,
        -- Get push tokens for the connection owner
        array_agg(pt.token) FILTER (WHERE pt.token IS NOT NULL) as push_tokens,
        -- WhatsApp details for the connection owner
        uo.whatsapp_number as owner_whatsapp,
        uo.whatsapp_opted_in as owner_whatsapp_opted_in
      FROM connections c
      JOIN users cu ON cu.id = c.connected_user_id
      JOIN users uo ON uo.id = c.user_id
      LEFT JOIN push_tokens pt ON pt.user_id = c.user_id
      WHERE c.always_in_touch = false
      GROUP BY c.id, cu.display_name, cu.date_of_birth, uo.whatsapp_number, uo.whatsapp_opted_in
    `);

    console.log(`[Nudge Engine] Processing ${connections.length} connections`);

    for (const conn of connections) {
      const config = DECAY_CONFIG[conn.layer] ?? DECAY_CONFIG.active;
      const now = new Date();
      let newScore = conn.score ?? 80;
      let nudgeText = null;
      let shouldPush = false;

      // ── Birthday check ──────────────────────────────
      if (conn.date_of_birth) {
        const dob = new Date(conn.date_of_birth);
        const thisYearBirthday = new Date(
          now.getFullYear(), dob.getMonth(), dob.getDate()
        );
        // If birthday already passed this year, check next year
        if (thisYearBirthday < now) {
          thisYearBirthday.setFullYear(now.getFullYear() + 1);
        }
        const daysUntilBirthday = Math.floor(
          (thisYearBirthday - now) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilBirthday === 0) {
          nudgeText = nudgeTemplates.birthdayToday(conn.connected_name);
          shouldPush = true;
        } else if (daysUntilBirthday <= 7 && daysUntilBirthday > 0) {
          nudgeText = nudgeTemplates.birthdayIn7(conn.connected_name);
          shouldPush = true;
        } else if (daysUntilBirthday <= 21 && daysUntilBirthday > 7) {
          nudgeText = nudgeTemplates.birthdayIn21(conn.connected_name);
        }
      }

      // ── Recency decay ───────────────────────────────
      if (conn.last_contact_at) {
        const lastContact = new Date(conn.last_contact_at);
        const daysSinceContact = Math.floor(
          (now - lastContact) / (1000 * 60 * 60 * 24)
        );
        const targetFrequency = conn.contact_frequency ?? 14;
        const nudgeThreshold = Math.floor(targetFrequency * config.nudgeMultiplier);
        const daysOverdue = daysSinceContact - targetFrequency;

        if (daysOverdue > 0) {
          // Apply decay
          const decay = daysOverdue * config.decayPerDay;
          newScore = Math.max(config.minScore, (conn.score ?? 80) - decay);

          // Generate nudge if past threshold and no recent nudge
          if (daysSinceContact >= nudgeThreshold) {
            const lastNudge = conn.nudge_sent_at ? new Date(conn.nudge_sent_at) : null;
            const daysSinceNudge = lastNudge
              ? Math.floor((now - lastNudge) / (1000 * 60 * 60 * 24))
              : 999;

            // Max 1 nudge per connection per 7 days
            if (daysSinceNudge >= 7 && !nudgeText) {
              nudgeText = nudgeTemplates.overdue(
                conn.connected_name,
                daysSinceContact,
                conn.layer
              );
              shouldPush = newScore < 60;
            }
          }
        } else {
          // Contact is recent — recover score slightly
          newScore = Math.min(100, (conn.score ?? 80) + 2);
        }
      } else {
        // No contact ever logged — gentle decay from default
        newScore = Math.max(config.minScore, (conn.score ?? 80) - 1);
      }

      // ── Update connection ───────────────────────────
      const scoreChanged = Math.abs(newScore - (conn.score ?? 80)) >= 1;
      const nudgeChanged = nudgeText !== conn.nudge;

      if (scoreChanged || nudgeChanged) {
        await db.query(
          `UPDATE connections SET
             score = $1,
             nudge = $2,
             nudge_sent_at = CASE WHEN $3 THEN NOW() ELSE nudge_sent_at END
           WHERE id = $4`,
          [Math.round(newScore), nudgeText, nudgeText !== null, conn.id]
        );
      }

      // ── Send push notification ──────────────────────
      if (shouldPush && nudgeText && conn.push_tokens?.length > 0) {
        const validTokens = (conn.push_tokens ?? []).filter(Boolean);
        if (validTokens.length > 0) {
          await sendPush(
            validTokens,
            'Roots',
            nudgeText,
            { connectionId: conn.id }
          );
        }
      }

      // ── Send WhatsApp nudge ─────────────────────────
      if (shouldPush && nudgeText && conn.owner_whatsapp_opted_in && conn.owner_whatsapp) {
        try {
          const waMessage =
            `${nudgeText}\n\n` +
            `Reply "caught up with ${conn.connected_name}" to log it, or "snooze" to skip.`;
          await sendWhatsAppMessage(conn.owner_whatsapp, waMessage);
        } catch (err) {
          console.error('[Nudge Engine] WhatsApp send error:', err.message);
        }
      }
    }

    console.log('[Nudge Engine] Complete');
  } catch (err) {
    console.error('[Nudge Engine] Error:', err);
  }
};

module.exports = { runNudgeEngine };
