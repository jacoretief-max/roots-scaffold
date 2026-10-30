// SMS consent for Twilio Verify OTPs (CTIA / Twilio Messaging Policy).
// The backend stores the exact text for each version as consent evidence —
// if you change the wording below, bump SMS_CONSENT_VERSION and add the new
// text to SMS_CONSENT_TEXTS in server/server.js.

export const SMS_CONSENT_VERSION = '2026-10-30';

export const LEGAL_URL = 'https://rooikatlabs.com/roots/legal';

export const SMS_CONSENT_AGREE = 'I agree to receive a one-time security code by text at this number.';

export const SMS_RATES_NOTICE = 'Standard message and data rates may apply.';

export const LEGAL_LINK_LABEL = 'Privacy Policy and Terms';

// Payload the server expects alongside every send-code request
export const smsConsentPayload = () => ({
  smsConsent: true,
  consentVersion: SMS_CONSENT_VERSION,
});
