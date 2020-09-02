try {
    require('dotenv').config();
  } catch (e) { }
  
  module.exports = {
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      apiKey: process.env.TWILIO_API_KEY,
      apiSecret: process.env.TWILIO_API_SECRET,
      chatServiceSid: process.env.TWILIO_CHAT_SERVICE_SID,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID
    },
    mailchimp: {
      apiKey: process.env.MAILCHIMP_API_KEY,
      serverPrefix: process.env.MAILCHIMP_SERVER_PREFIX
    },
    port: process.env.PORT || 3001,
    // ngrokSubdomain: 'ajtack'
  }
  