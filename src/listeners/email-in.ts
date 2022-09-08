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
import utils from '../utilities.js';
import type { Listener } from './listener.js';

async function queueForSend(message: any): Promise<any> {
  const publication = await broker.publish('email-send', message);
  publication
    .on('success', (messageId) => {
      return Promise.resolve(`OK [${messageId}]`);
    })
    .on('error', (err) => {
      return Promise.reject(err)
    })
}

async function processMessage(types: string[], message: any): Promise<string> {
  // Verify Minimums for Email Message
  expect(message.params != null, 'Missing Email "params"').to.be.true;
  expect(message.params, 'Invalid Value for "params"').to.be.an('object');
  expect(message.params.to, 'Missing "to" address for email').to.be.a('string').that.is.not.empty;

  // Is Generic Email Message?
  if (types.length > 1) { // YES: Has to have Template
    if (types[1] === 'invite') {
      switch (types[2]) {
        case 'store': // Store Invitation
          if (message.params.template === undefined) {
            message.params.template = 'invite-store'
          }
          break;
        case 'organization': // Organization Invitation
          if (message.params.template === undefined) {
            message.params.template = 'invite-org'
          }
      }
    }
  }

  expect(message.params.template, 'Missing "template" for email').to.be.a('string').that.is.not.empty;
  return queueForSend(message);
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {
  try {
    // Verify Minimum Requirements for Message
    expect(content, 'Invalid Message').to.be.an('object');
    expect(content.version, 'Invalid Value for "version"').to.be.a('number').that.is.gt(0);
    expect(content.id, 'Invalid Value for "id"').to.be.a('string').that.is.not.empty;
    expect(content.type, 'Invalid Value for "type"').to.be.a('string').that.is.not.empty;
    console.log(content)

    // Extract Message Type
    console.info(`Processing Message [${content.version}:${content.id}]`);
    const type: string | null = utils.strings.nullOnEmpty(content.type.trim());
    expect(type, '"type" has no value').not.to.be.null;

    // Parse Action Type
    const types: string[] = (<string>type).split(':');
    expect(types.length >= 1, `[${type}] is not a valid email type`).to.be.true;
    expect(types[0] === 'email', `[${type}] is not a valid email message`).to.be.true;

    const id: string = await processMessage(types, content)
    console.info(`Email Message Processed [${content.id}-${type}]`);
    ackOrNack();
  } catch (e: any) {
    console.error(e);
    ackOrNack(e);
  }
}

let broker: rascal.BrokerAsPromised;

let listener: Listener = {
  setBroker: (b: rascal.BrokerAsPromised) => {
    expect(b != null, 'Invalid Broker Object').to.be.true;
    broker = b;
  },
  attach: (subscription: rascal.SubscriberSessionAsPromised, onError?: (err: Error) => void): rascal.SubscriberSessionAsPromised => {
    // Attach Message Listener
    subscription
      .on('message', messageListener)
      .on('error', onError ? onError : console.error)

    return subscription;
  }
}

// EXPORT Listener
export default listener;
