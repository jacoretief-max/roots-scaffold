// Roots — WhatsApp Cloud API helper
// Sends a plain text message via the Meta Graph API

const sendWhatsAppMessage = async (to, message) => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    console.warn('[WhatsApp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return;
  }

  // Meta expects numbers without the + prefix
  const normalizedTo = to.replace(/^\+/, '');

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'text',
        text: { body: message },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    console.error('[WhatsApp] Send failed:', JSON.stringify(err));
    throw new Error('WhatsApp send failed');
  }

  return response.json();
};

module.exports = { sendWhatsAppMessage };
