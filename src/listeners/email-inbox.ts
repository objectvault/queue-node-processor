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
import utils from '../shared/utilities.js';
import type { Listener } from './listener.js';

async function queueForProcessing(message: any): Promise<any> {
  expect(_broker != null, 'Invalid _broker Object').to.be.true;

  const publication = await _broker.publish('email-pending', message);

  // Wrap Events in Promise
  return new Promise<any>((resolve, reject) => {
    publication
      .on('success', (messageId: string) => {
        resolve(message);
      })
      .on('return', (message: Message) => {
        reject(new Error('Message Returned'))
      })
      .on('error', (err: Error, messageId: string) => {
        reject(err)
      });
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
  return queueForProcessing(message);
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {
  try {
    // Verify Minimum Requirements for Message
    expect(content, 'Invalid Message').to.be.an('object');
    expect(content.version, 'Invalid Value for "version"').to.be.a('number').that.is.gt(0);
    expect(content.id, 'Invalid Value for "id"').to.be.a('string').that.is.not.empty;
    expect(content.type, 'Invalid Value for "type"').to.be.an('array').that.is.not.empty;
    console.log(content)

    // Current Time
    const now: string = (new Date()).toISOString();

    // Mark Message with Time Passed through Listener
    content._times[_name] = now;

    // Extract Message Type
    console.info(`Processing Message [${content.version}:${content.id}]`);
    expect(content.type[0], 'Invalid Value for "type"').to.be.a('string').to.be.equal('email');
    const type: string[] = content.type;

    const id: string = await processMessage(type, content)
    console.info(`Action Processed [${content.id}-${type.join(':')}]`);
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
