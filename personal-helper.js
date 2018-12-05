'use latest';
import express from 'express';
import Webtask from 'webtask-tools';
import bodyParser from 'body-parser';
import {
  middleware,
  Client,
} from '@line/bot-sdk';
import {
  get,
  head,
} from 'lodash/fp';

const app = express();

app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const event = head(get(['body', 'events'])(req));
  const text = get(['message', 'text'])(event);
  const lineConfig = getLineConfig(req);
  console.log(text);
  console.log(lineConfig);
  res.sendStatus(200);
});

const getLineConfig = (req) => {
  const context = get(['webtaskContext'])(req);
  console.log(context);
  return {
    channelAccessToken: get(['secrets', 'LINE_CHANNEL_ACCESS_TOKEN'])(context),
    channelSecret: get(['secrets', 'LINE_CHANNEL_SECRET'])(context),
  };
};

module.exports = Webtask.fromExpress(app);
