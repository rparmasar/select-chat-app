const config     = require('./config');
const express    = require('express');
const bodyParser = require('body-parser');
const twilio     = require('twilio');
const ngrok      = require('ngrok');
const identities = require('./identities');
const path       = require('path');
const expressStaticGzip = require("express-static-gzip");
//Express Async Handler
const ash = require("express-async-handler");
//Require and Configure Mailchimp API
const mailchimp  = require('@mailchimp/mailchimp_marketing');
mailchimp.setConfig({
  apiKey: config.mailchimp.apiKey,
  server: config.mailchimp.serverPrefix,
});

const app = new express();

app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.append('Access-Control-Allow-Origin', ['*']);
  res.append('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.append('Access-Control-Allow-Headers', 'Content-Type');
  next();
});


app.post('/api/token', (request, response) => {
  console.log("Entered request");
  // console.log(request.body);
  let name = {};
  let valid_identity = false;
  for (x in request.body){ //This gets the name from the server response.
    name = JSON.parse(x).name;
  }
  console.log(name);
  //Authenticate - See if an Identity exists
  for (i in identities.realtors){
    if(identities.realtors[i].identity === name){
      valid_identity = true;
    }
  }
  // console.log(valid_identity);
  if(valid_identity){
    const identity = name;
    const accessToken = new twilio.jwt.AccessToken(config.twilio.accountSid, config.twilio.apiKey, config.twilio.apiSecret);
    const chatGrant = new twilio.jwt.AccessToken.ChatGrant({
    serviceSid: config.twilio.chatServiceSid,
    });
    accessToken.addGrant(chatGrant);
    accessToken.identity = identity;
    response.set('Content-Type', 'application/json');
    response.send(JSON.stringify({
      token: accessToken.toJwt(),
      identity: identity
    }));
  } else {
    response.send(JSON.stringify("Error: Not a valid Identity!"));
  }
})

// const gzipOptions = {
//   enableBrotli: true,
//   customCompressions: [{
//   encodingName: 'deflate',
//   fileExtension: 'zz'
//  }],
//  orderPreference: ['br']
// }

if(process.env.NODE_ENV === 'production'){
  // app.use(url, expressStaticGzip(dir, gzipOptions));
  app.use(express.static(__dirname + 'build'));
  app.get('/', (req, res) => {
    console.log("This works!");
    res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
  });
}

app.get('*', (req, res) => {
  console.log(path.resolve(__dirname, 'client', 'build', 'index.html'));
  res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
});

// app.listen(config.port, () => {
//   console.log(`Application started at localhost:${config.port}`);
// });
app.listen(process.env.PORT || 3001, function(){
  console.log("Express server listening on port %d in %s mode", this.address().port, app.settings.env);
});


// ============================================
// ============================================
// ====== HANDLE NEW-CONVERSATION HOOK ========
// ============================================
// ============================================
let client = new twilio(config.twilio.accountSid, config.twilio.authToken);

app.post('/api/chat', (req, res) => {
  console.log("Received a webhook:", req.body);
  if (req.body.EventType === 'onConversationAdded') {
    const me = "Select";
    client.conversations.v1.conversations(req.body.ConversationSid)
      .participants
      .create({
          identity: me
        })
      .then(participant => console.log(`Added ${participant.identity} to ${req.body.ConversationSid}.`))
      .catch(err => console.error(`Failed to add a member to ${req.body.ConversationSid}!`, err));
  }

  console.log("(200 OK!)");
  res.sendStatus(200);
});

app.post('/outbound-status', (req, res) => {
  console.log(`Message ${req.body.SmsSid} to ${req.body.To} is ${req.body.MessageStatus}`);
  res.sendStatus(200);
})

app.get('/api/mailchimp', (req, res) => {
  console.log("Received Mailchimp webhook [GET]: ", req.body);
  res.send("Hello World");
})

//When MC gets a new subscriber
app.post('/api/mailchimp', ash(async (req, res) => {
  // console.log("Received Mailchimp webhook: ", req.body);
  const me = "Select";
  // Return the List Name based on which audience subscriber came from
  const getListName = async () => {
    result = await mailchimp.lists.getList(req.body.data.list_id);
    return result.name;
  } 
  let audience = await getListName();
  let realtor = { //Create Realtor object with proper audience name
    identity: 'Test',
    audience: audience
  };
  for (x in identities.realtors){ // Assign proper identity for realtor
    if(identities.realtors[x].audience === audience){
      realtor.identity = identities.realtors[x].identity;      
    }
  };
  // Get a list of active Twilio numbers to create conversation
  const getPhoneNums = async () => {
    result = await client.incomingPhoneNumbers.list();
    ph_nums = [];
    result.forEach((ph_num) => {
      if(ph_num.friendlyName === audience) {
          ph_nums.push({
            name: ph_num.friendlyName,
            number: ph_num.phoneNumber
          });
        }
    });
    return ph_nums;
  }
  // Return matching Twilio number (proxybindingaddress)
  let subscriber = await getPhoneNums();
  console.log(subscriber[0].number);
  // Create Conversation
  client.conversations.conversations
      .create({
         messagingServiceSid: config.twilio.messagingServiceSid,
         friendlyName: audience + " - " + req.body.data.merges.FNAME + " " + req.body.data.merges.LNAME
       })
       //Create Participant for New Subscriber and Add to Convo
      .then(conversation => {
        // console.log(conversation);
        client.conversations.conversations(conversation.sid)
          .participants
          .create({
              'messagingBinding.address': `${req.body.data.merges.PHONE}`,
              'messagingBinding.proxyAddress': `${subscriber[0].number}`
            })
          //Add Identities
          .then(participant => {
            console.log(participant);
            let people = {
              admin: identities.realtors.select.identity,
              agent: realtor.identity
            };
            for (x in people) {
              client.conversations.conversations(conversation.sid).participants
              .create({
                identity: people[x]
              })
              console.log(`Added ${people[x]} to ${conversation.sid}.`);
            }
          })
          .then(() => {
            client.conversations.conversations(conversation.sid)
            .messages
            .create({
              author: identities.realtors.select.identity, 
              body: 'Ahoy there!'
            })
            .then(message => console.log(message.sid))
            .catch(err => console.log(err));
          })
          .catch(err => console.log(`Error: Failed to add ${realtor.audience} to ${conversation.sid}. Message: ${err}`));
      });
  res.sendStatus(200);
}))


var ngrokOptions = {
  proto: 'http',
  addr: config.port
};

if (config.ngrokSubdomain) {
  ngrokOptions.subdomain = config.ngrokSubdomain
}

// ngrok.connect(ngrokOptions).then(url => {
//   console.log('ngrok url is ' + url);
// }).catch(console.error);
