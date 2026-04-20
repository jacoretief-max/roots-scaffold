const express = require('express');
const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Meta calls this to verify your webhook is real
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Meta sends message events here
router.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  body.entry?.forEach(entry => {
    entry.changes?.forEach(change => {
      const value = change.value;

      // Incoming message
      if (value.messages) {
        value.messages.forEach(msg => {
          const from = msg.from; // sender's phone number
          const type = msg.type; // text, image, etc.
          const text = msg.text?.body;
          console.log(`Message from ${from}: ${text}`);
          // TODO: match to a Roots connection and update last_contact
        });
      }

      // Delivery/read status
      if (value.statuses) {
        value.statuses.forEach(status => {
          console.log(`Message ${status.id} status: ${status.status}`);
        });
      }
    });
  });

  res.sendStatus(200); // always respond 200 quickly
});

module.exports = router;
