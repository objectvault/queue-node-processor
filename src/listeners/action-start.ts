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

async function processEmailAction(actions: string[], message: any): Promise<any> {
  const publication = await broker.publish('email-in', message);
  publication
    .on('success', (messageId) => {
      return Promise.resolve(`OK [${messageId}]`);
    })
    .on('error', (err) => {
      return Promise.reject(err)
    })
}

async function processMessage(message: any): Promise<string> {
  console.log(message)

  // Verify Minimum Requirements for Message
  expect(message, 'Invalid Message').to.be.an('object');
  expect(message.version, 'Invalid Value for "version"').to.be.a('number').that.is.gt(0);
  expect(message.id, 'Invalid Value for "id"').to.be.a('string').that.is.not.empty;
  expect(message.type, 'Invalid Value for "type"').to.be.a('string').that.is.not.empty;

  console.info(`Processing Message [${message.version}:${message.id}]`);
  const type: string | null = utils.strings.nullOnEmpty(message.type.trim());
  expect(type, '"type" has no value').not.to.be.null;

  // Parse Action Type
  const actions: string[] = (<string>type).split(':');
  expect(actions.length > 1, `[${type}] is not a valid action`).to.be.true;
  expect(actions[0] === 'action', `[${type}] is not a valid action`).to.be.true;

  switch (actions[1]) {
    case 'email': // Email Action
      return processEmailAction(actions.slice(2), message);
    default:
      throw new Error('"type" has an unrecognized value');
  }
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {
  expect(broker != null, 'Invalid Broker Object').to.be.true;

  try {
    const id: string = await processMessage(content)
    console.info(`Message Sent [${id}]`);
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
