// Roots — WhatsApp webhook routes
// GET  /whatsapp/webhook  — Meta verification handshake
// POST /whatsapp/webhook  — Inbound messages & status events

const express = require('express');
const { sendWhatsAppMessage } = require('../lib/whatsapp');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// ── Levenshtein / name similarity (same as server.js) ─────────────
const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
};

const nameSimilarity = (a, b) => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return (maxLen - levenshtein(a, b)) / maxLen;
};

// ── Extract a name from free-text ──────────────────────────────────
const extractName = (text) => {
  // Strip common time prefixes so they don't confuse the match
  // e.g. "last saturday had lunch with James" → "had lunch with James"
  const cleaned = text
    .trim()
    .replace(/^(last\s+\w+|yesterday|this morning|this afternoon|this evening|tonight|today|just now)\s+/i, '')
    .trim();

  const patterns = [
    // "had [anything] with NAME"  — catches braai, bbq, pool day, beers, etc.
    /(?:just |finally )?had\s+.+?\s+with\s+([A-Z][^,\.!?]+)/i,
    // "spoke/chatted/talked with/to NAME"
    /(?:just |finally )?(?:spoke|chatted|talked) (?:with|to)\s+(.+)/i,
    // "called/phoned/rang NAME"
    /(?:just |finally )?(?:called|phoned|rang)\s+(.+)/i,
    // "caught up/connected with NAME"
    /(?:just |finally )?(?:caught up|connected) with\s+(.+)/i,
    // "met/saw/visited NAME"
    /(?:just |finally )?(?:met|saw|visited)\s+(.+)/i,
    // "had a chat/braai/bbq/drinks with NAME"
    /(?:just |finally )?had (?:a )?(?:chat|braai|bbq|drinks|beers|coffee|lunch|dinner|breakfast|brunch|call|meeting|catch-?up) with\s+(.+)/i,
    // "log/logged/noting NAME"
    /(?:logged|log|noting|note)(?: a catch-?up)? with\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      // Trim trailing filler — stop at "it was", "and", comma, or end of name
      const raw = match[1].trim();
      const name = raw
        .replace(/\s+(it was|and then|we |they |which|that|who|,).*/i, '')
        .replace(/[.!?]+$/, '')
        .trim();
      if (name.length > 1) return name;
    }
  }

  // Bare name fallback — short message of 1–3 words, looks like a name
  const words = cleaned.trim().split(/\s+/);
  if (words.length >= 1 && words.length <= 3 && /^[A-Z]/.test(words[0])) {
    return cleaned.trim().replace(/[.!?]+$/, '');
  }

  return null;
};

// ── Find best-matching connection(s) ──────────────────────────────
const matchConnections = (nameQuery, connections) => {
  const query = nameQuery.toLowerCase().trim();
  const scored = connections
    .map(conn => {
      const fullName = conn.display_name.toLowerCase();
      const parts = fullName.split(' ');

      const scores = [
        nameSimilarity(query, fullName),
        ...parts.map(p => nameSimilarity(query, p)),
        nameSimilarity(query, parts.slice(-1).join(' ')), // last name only
      ];

      return { ...conn, score: Math.max(...scores) };
    })
    .filter(c => c.score >= 0.6)
    .sort((a, b) => b.score - a.score);

  return scored;
};

// ── Log a contact event ────────────────────────────────────────────
const logContact = async (db, userId, connectionId, originalText) => {
  await db.query(
    `UPDATE connections
     SET last_contact_at = NOW(),
         score = LEAST(100, score + 5),
         nudge = NULL
     WHERE id = $1 AND user_id = $2`,
    [connectionId, userId]
  );
  await db.query(
    `INSERT INTO contact_events
       (user_id, connection_id, type, title, date, note)
     VALUES ($1, $2, 'whatsapp', 'Caught up', NOW(), $3)`,
    [userId, connectionId, originalText ?? null]
  );
};

// ── Module factory — receives db and redisClient from server.js ────
module.exports = (db, redisClient) => {
  const router = express.Router();

  // ── Webhook verification (GET) ───────────────────────────────────
  router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[WhatsApp] Webhook verified');
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  });

  // ── Inbound messages (POST) ──────────────────────────────────────
  router.post('/webhook', async (req, res) => {
    // Always respond 200 immediately — Meta will retry if we don't
    res.sendStatus(200);

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        // ── Inbound text messages ──────────────────────
        if (value.messages) {
          for (const msg of value.messages) {
            if (msg.type !== 'text') continue;

            const from = msg.from;           // e.g. "27821234567"
            const text = msg.text?.body?.trim();
            if (!text) continue;

            console.log(`[WhatsApp] Message from ${from}: ${text}`);
            await handleInboundMessage(db, redisClient, from, text);
          }
        }

        // ── Delivery / read status ─────────────────────
        if (value.statuses) {
          for (const status of value.statuses) {
            console.log(`[WhatsApp] Message ${status.id} → ${status.status}`);
          }
        }
      }
    }
  });

  return router;
};

// ── Inbound message handler ────────────────────────────────────────
async function handleInboundMessage(db, redisClient, from, text) {
  try {
    // Normalise number for DB lookup (strip leading +)
    const normalizedFrom = from.replace(/^\+/, '');

    // 1. Find the Roots user by their WhatsApp number
    const { rows: [user] } = await db.query(
      `SELECT id, display_name FROM users
       WHERE REPLACE(whatsapp_number, '+', '') = $1
       AND whatsapp_opted_in = true`,
      [normalizedFrom]
    );

    if (!user) {
      await sendWhatsAppMessage(from,
        `Hi! I don't recognise this number as a Roots account. ` +
        `Open the Roots app and enable WhatsApp in your profile settings to get started.`
      );
      return;
    }

    // 2. Check Redis for a pending clarification from a previous message
    const pendingKey = `whatsapp:pending:${from}`;
    const pendingRaw = await redisClient.get(pendingKey);

    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw);
      await redisClient.del(pendingKey);
      await handleClarificationReply(db, from, user, text, pending);
      return;
    }

    // 3. Handle keywords — snooze, done, help
    const lower = text.toLowerCase().trim();

    if (lower === 'snooze') {
      // Silence nudges for this user for 24 hours by bumping nudge_sent_at
      await db.query(
        `UPDATE connections
         SET nudge_sent_at = NOW()
         WHERE user_id = $1
         AND nudge IS NOT NULL`,
        [user.id]
      );
      await sendWhatsAppMessage(from,
        `Got it — I'll leave you alone for today. I'll check in again tomorrow.`
      );
      return;
    }

    if (lower === 'done') {
      await sendWhatsAppMessage(from,
        `Nice one! Who did you catch up with? Just send me their name and I'll log it.`
      );
      return;
    }

    if (lower === 'help' || lower === '?') {
      await sendWhatsAppMessage(from,
        `*Roots commands*\n\n` +
        `• "Just had lunch with Sarah" — log a catch-up\n` +
        `• "Caught up with James" — same thing, different phrasing\n` +
        `• "Snooze" — silence nudges for today\n\n` +
        `Roots will also send you nudges here when it's time to reach out to someone.`
      );
      return;
    }

    // 4. Extract a name from the message
    const nameQuery = extractName(text);

    if (!nameQuery) {
      await sendWhatsAppMessage(from,
        `I didn't quite catch that, ${user.display_name}. ` +
        `Try something like "Just caught up with Sarah" or reply "help" for tips.`
      );
      return;
    }

    // 5. Load this user's connections
    const { rows: connections } = await db.query(
      `SELECT c.id as connection_id, u.display_name
       FROM connections c
       JOIN users u ON u.id = c.connected_user_id
       WHERE c.user_id = $1`,
      [user.id]
    );

    // 6. Fuzzy match
    const matches = matchConnections(nameQuery, connections);

    if (matches.length === 0) {
      await sendWhatsAppMessage(from,
        `I couldn't find "${nameQuery}" in your circle. ` +
        `Check the name in the Roots app and try again.`
      );
      return;
    }

    if (matches[0].score >= 0.85 && (matches.length === 1 || matches[0].score - matches[1].score > 0.15)) {
      // Single clear match — log it
      const match = matches[0];
      await logContact(db, user.id, match.connection_id, text);
      await sendWhatsAppMessage(from,
        `Got it — logged your catch-up with *${match.display_name}* ✓`
      );
      return;
    }

    // 7. Ambiguous — ask for clarification (store in Redis for 5 mins)
    const candidates = matches.slice(0, 4); // max 4 options
    const options = candidates
      .map((c, i) => `${i + 1}. ${c.display_name}`)
      .join('\n');

    await redisClient.set(
      pendingKey,
      JSON.stringify({ userId: user.id, candidates, originalText: text }),
      { EX: 300 } // 5 minute TTL
    );

    await sendWhatsAppMessage(from,
      `Which ${nameQuery} did you mean?\n\n${options}\n\nReply with the number.`
    );

  } catch (err) {
    console.error('[WhatsApp] handleInboundMessage error:', err);
  }
}

// ── Handle reply to a clarification question ───────────────────────
async function handleClarificationReply(db, from, user, text, pending) {
  const choice = parseInt(text.trim(), 10);

  if (!isNaN(choice) && choice >= 1 && choice <= pending.candidates.length) {
    const match = pending.candidates[choice - 1];
    await logContact(db, user.id, match.connection_id, pending.originalText);
    await sendWhatsAppMessage(from,
      `Got it — logged your catch-up with *${match.display_name}* ✓`
    );
  } else {
    await sendWhatsAppMessage(from,
      `No worries — cancelled. Send another message whenever you want to log a catch-up.`
    );
  }
}
