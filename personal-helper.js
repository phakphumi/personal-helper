'use latest';
import express from 'express';
import Webtask from 'webtask-tools';
import bodyParser from 'body-parser';
import Airtable from 'airtable';
import moment from 'moment-timezone';
import {
  middleware,
  Client,
} from '@line/bot-sdk';
import {
  get,
  head,
  isObject,
} from 'lodash/fp';

const app = express();

app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const lineConfig = getLineConfig(req);
  const client = new Client(lineConfig);
  const event = head(get(['body', 'events'])(req));
  const callingMessage = get(['message', 'text'])(event);
  const secrets = get(['webtaskContext', 'secrets'])(req);
  const { replyToken } = event;

  try {
    addSpendingRecord({
      userId: get(['source', 'userId'])(event),
      secrets,
      callback: ({ amount, category }) => {
        client.replyMessage(replyToken, toLineMessage({ message: `Recorded expense ${amount} baht on ${category}`}));
      },
      ...transformIncomingMessage({ message: callingMessage }),
    });
  } catch (error) {
    console.log(error);
    if(error.errorDesc) {
      client.replyMessage(replyToken, toLineMessage({ message: error.errorDesc }));
    }
    return error;
  }
  res.sendStatus(200);
});

const transformIncomingMessage = ({ message }) => {
  const matchedMessage = message.match(/^([\d.]+)([tfghmol])$/i);
  if(!matchedMessage) {
    console.log('Incoming message has incorrect format');
    throw {
      errorCode: 1,
      errorDesc: `Incorrect format for message: \"${message}\" while transforming.\nPlease sending message with this format \"[Number][Category]\".\neg. 100f`
    };
  }
  let transformedMessage = {};
  transformedMessage.category = {
    d: 'drink',
    f: 'food',
    h: 'health',
    m: 'miscellaneous',
    o: 'occasion',
    s: 'snack',
    t: 'transportation',
  }[matchedMessage[2].toLowerCase()];
  transformedMessage.amount = parseFloat(matchedMessage[1]);
  return transformedMessage;
};

const addSpendingRecord = ({
  secrets: { AIRTABLE_API_KEY, AIRTABLE_PERSONAL_HELPER_BASE },
  userId,
  category,
  amount,
  callback,
}) => {
  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_PERSONAL_HELPER_BASE);
  base('SpendingRecords').create({
    category,
    amount,
    userId,
    createdDate: moment.tz('Asia/Bangkok').format('YYYY-MM-DD'),
  }, (err, record) => {
    if (err) {
      console.error(err);
      return;
    }
    callback({ amount: get(['fields', 'amount'])(record), category: get(['fields', 'category'])(record) });
  });
};

const toLineMessage = ({ message }) => {
  if(!message) { message = '...'; }
  return [{
    type: 'text',
    text: message,
  }];
};

const getLineConfig = ({ webtaskContext }) => ({
  // get env which set on webtask secrets
  channelAccessToken: get(['secrets', 'LINE_CHANNEL_ACCESS_TOKEN'])(webtaskContext),
  channelSecret: get(['secrets', 'LINE_CHANNEL_SECRET'])(webtaskContext),
});

module.exports = Webtask.fromExpress(app);
