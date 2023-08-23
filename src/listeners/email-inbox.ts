/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { Message } from 'amqplib';
import { expect } from 'chai';
import rascal from 'rascal';

// Local Modules
import { EmailMessage, EmailMessageBody } from '../shared/queue-email.js';
import type { Listener } from './listener.js';

async function queueForProcessing(em: EmailMessage): Promise<any> {
  expect(_broker != null, 'Invalid _broker Object').to.be.true;

  // Initialize Retries if not Set
  em.header().params().setIfNotSet('max-retries', 5);
  em.header().props().set('retries', 0);

  const publication = await _broker.publish('email-process', em.message());

  // Wrap Events in Promise
  return new Promise<any>((resolve, reject) => {
    publication
      .on('success', (messageId: string) => {
        resolve(em);
      })
      .on('return', (message: Message) => {
        reject(new Error('Message Returned'))
      })
      .on('error', (err: Error, messageId: string) => {
        reject(err)
      });
  })
}

async function processMessage(types: string[], message: EmailMessage): Promise<string> {
  const body: EmailMessageBody = message.body()

  // Verify Minimums for Email Message
  expect(body.params().map() != null, 'Missing Email "params"').to.be.true;
  expect(body.params().map(), 'Invalid Value for "params"').to.be.an('object');
  expect(body.params().get('to'), 'Missing "to" address for email').to.be.a('string').that.is.not.empty;

  // Is Generic Email Message?
  if (types.length > 1) { // YES: Has to have Template
    if (types[1] === 'invite') {
      switch (types[2]) {
        case 'store': // Store Invitation
          if (!body.params().has('template')) {
            body.params().set('template', 'invite-store')
          }
          break;
        case 'organization': // Organization Invitation
          if (!body.params().has('template')) {
            body.params().set('template', 'invite-org')
          }
      }
    }
  }

  expect(body.params().get('template'), 'Missing "template" for email').to.be.a('string').that.is.not.empty;
  return queueForProcessing(message);
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {
  try {
    // Verify Minimum Requirements for Message
    const email: EmailMessage = new EmailMessage(content);
    console.log(content)

    // Mark Message with Time Passed through Listener
    email.logTS(_name);

    const id: string = await processMessage(email.body().action(), email)
    console.info(`Message Processed [${email.header().id()}-${email.body().type()}]`);
    ackOrNack();
  } catch (e: any) {
    console.error(e);
    ackOrNack(e);
  }
}

let _broker: rascal.BrokerAsPromised;
let _name: string;

let listener: Listener = {
  setBroker: (b: rascal.BrokerAsPromised) => {
    expect(b != null, 'Invalid _broker Object').to.be.true;
    _broker = b;
  },
  attach: (subscription: rascal.SubscriberSessionAsPromised, onError?: (err: Error) => void): rascal.SubscriberSessionAsPromised => {
    // Save Listener Name
    _name = subscription.name;

    // Attach Message Listener
    subscription
      .on('message', messageListener)
      // TODO on error move message to message:nok instead o dropping message
      .on('error', onError ? onError : console.error)

    return subscription;
  }
}

// EXPORT Listener
export default listener;
