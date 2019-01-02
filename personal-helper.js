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
  join,
  reduce,
  replace,
  slice,
  split,
  toUpper,
  toLower,
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

  const orderToken = split(' ')(callingMessage)[0];
  switch (toLower(orderToken)) {
    case 'category':
      const reduceObjectWithKey = reduce.convert({ cap: false });
      const toReplyCategory = reduceObjectWithKey((accumulator, value, key) => {
        if(accumulator === '') {
          return `${key}: ${value}`;
        }
        return accumulator + `\n${key}: ${value}`;
      }, '')(getMappingCategory())
      client.replyMessage(replyToken, toLineMessage({ message: toReplyCategory}));
      break;
    case 'delete':
      const recordId = split(' ')(callingMessage)[1];
      deleteSpendingRecord({
        secrets,
        recordId,
        toReply: ({ replyMessage }) => {
          client.replyMessage(replyToken, toLineMessage({ message: replyMessage }));
        }
      })
      break;
    case 'edit':
      try {
        const separatedMessage = split(' ')(callingMessage);
        const recordId = separatedMessage[1];
        const orderDetail = join(' ')(slice(2, separatedMessage.length)(separatedMessage));
        editSpendingRecord({
          secrets,
          recordId,
          toReply: ({ replyMessage }) => {
            client.replyMessage(replyToken, toLineMessage({ message: replyMessage }));
          },
          ...transformIncomingMessage({ message: orderDetail }),
        });
      } catch (error) {
        console.log(error);
        if(error.errorDesc) {
          client.replyMessage(replyToken, toLineMessage({ message: error.errorDesc }));
        }
        return error;
      }
      break;
    default:
      try {
        addSpendingRecord({
          userId: get(['source', 'userId'])(event),
          secrets,
          toReply: ({ replyMessage }) => {
            client.replyMessage(replyToken, toLineMessage({ message: replyMessage }));
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
      break;
  }

  res.sendStatus(200);
});

const getMappingCategory = () => ({
  b: 'bills',
  d: 'drink',
  f: 'food',
  h: 'health',
  m: 'miscellaneous',
  s: 'snack',
  t: 'transportation',
  w: 'washing',
});

const transformIncomingMessage = ({ message }) => {
  const separatedMessage = split(' ')(message);
  const matchedMessage = separatedMessage[0].match(/^([\d.]+)([bdfhmstw])$/i);
  if(!matchedMessage) {
    console.log('Incoming message has incorrect format');
    throw {
      errorCode: 1,
      errorDesc: `Incorrect format for message: \"${message}\" while transforming.\nPlease sending message with this format \"[Number][Category]\".\neg. 100f`
    };
  }
  let transformedMessage = {};
  transformedMessage.category = getMappingCategory()[matchedMessage[2].toLowerCase()];
  transformedMessage.amount = parseFloat(matchedMessage[1]);
  transformedMessage.creditCard = toUpper(separatedMessage[1]);
  return transformedMessage;
};

const addSpendingRecord = ({
  secrets: { AIRTABLE_API_KEY, AIRTABLE_PERSONAL_HELPER_BASE },
  userId,
  category,
  creditCard,
  amount,
  toReply,
}) => {
  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_PERSONAL_HELPER_BASE);
  base('SpendingRecords').create({
    category,
    creditCard,
    amount,
    userId,
    createdDate: moment.tz('Asia/Bangkok').format('YYYY-MM-DD'),
  }, (err, record) => {
    if (err) {
      console.error(err);
      return;
    }
    const recordId = record.getId();
    const {
      amount,
      category,
      creditCard
    } = get(['fields'])(record);
    toReply({
      replyMessage: `Recorded id: ${recordId}\nPay ${amount} baht for ${category}${creditCard ? ` using ${creditCard} card` : ''}`
    });
  });
};

const deleteSpendingRecord = ({
  secrets: { AIRTABLE_API_KEY, AIRTABLE_PERSONAL_HELPER_BASE },
  recordId,
  toReply,
}) => {
  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_PERSONAL_HELPER_BASE);
  base('SpendingRecords').destroy(recordId, function(err, deletedRecord) {
    if (err) {
      console.error(err);
      return;
    }
    toReply({
      replyMessage: `Deleted record ${deletedRecord.id}`,
    });
});
}

const editSpendingRecord = ({
  secrets: { AIRTABLE_API_KEY, AIRTABLE_PERSONAL_HELPER_BASE },
  recordId,
  category,
  creditCard,
  amount,
  toReply,
}) => {
  const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_PERSONAL_HELPER_BASE);
  base('SpendingRecords').update(recordId, {
    category,
    creditCard,
    amount,
    updatedDate: moment.tz('Asia/Bangkok').format(),
  }, (err, record) => {
    if (err) {
      console.error(err);
      return;
    }
    const recordId = record.getId();
    const {
      amount,
      category,
      creditCard
    } = get(['fields'])(record);
    toReply({
      replyMessage: `Updated record ${recordId}\nPay ${amount} baht for ${category}${creditCard ? ` using ${creditCard} card` : ''}`
    });
  })
}

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
