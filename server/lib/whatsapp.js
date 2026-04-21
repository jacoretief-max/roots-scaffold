// Roots — WhatsApp Cloud API helper
// Sends plain text messages and approved template messages via the Meta Graph API

const getConfig = () => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    console.warn('[WhatsApp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return null;
  }
  return { phoneNumberId, token };
};

const post = async (phoneNumberId, token, body) => {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    const err = await response.json();
    console.error('[WhatsApp] Send failed:', JSON.stringify(err));
    throw new Error('WhatsApp send failed');
  }
  return response.json();
};

// Free-form text — only works within 24h of user messaging first
const sendWhatsAppMessage = async (to, message) => {
  const config = getConfig();
  if (!config) return;
  const normalizedTo = to.replace(/^\+/, '');
  return post(config.phoneNumberId, config.token, {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'text',
    text: { body: message },
  });
};

// Approved template — works anytime, used for outbound nudges
const sendWhatsAppNudge = async (to, nudgeText) => {
  const config = getConfig();
  if (!config) return;
  const normalizedTo = to.replace(/^\+/, '');
  return post(config.phoneNumberId, config.token, {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'template',
    template: {
      name: 'roots_nudge',
      language: { code: 'en' },
      components: [{
        type: 'body',
        parameters: [{
          type: 'text',
          text: nudgeText,
        }],
      }],
    },
  });
};

module.exports = { sendWhatsAppMessage, sendWhatsAppNudge };
