'use latest';
import express from 'express';
import Webtask from 'webtask-tools';
import bodyParser from 'body-parser';
import Airtable from 'airtable';
import {
  middleware,
  Client,
} from '@line/bot-sdk';
import {
  get,
  head,
  split,
} from 'lodash/fp';

const app = express();

app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const lineConfig = getLineConfig(req);
  const client = new Client(lineConfig);
  const event = head(get(['body', 'events'])(req));
  const callingMessage = get(['message', 'text'])(event);
  const { replyToken } = event;

  addSpendingRecord({ secrets: get(['webtaskContext', 'secrets'])(req) })

  client.replyMessage(replyToken, toLineMessage(callingMessage));
  res.sendStatus(200);
});

const transformIncomingMessage = (message) => {
  split(' ')(message);
};

const addSpendingRecord = ({ secrets: { AIRTABLE_API_KEY, AIRTABLE_PERSONAL_HELPER_BASE } }) => {
  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_PERSONAL_HELPER_BASE);
  base('SpendingRecords').create({
    "category": "food",
    "amount": 100,
    "recordType": "expense",
    "userId": "3"
  }, (err, record) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(record.getId());
  });
};

const toLineMessage = (message) => {
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
