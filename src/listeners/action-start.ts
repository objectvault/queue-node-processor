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
  expect(broker != null, 'Invalid Broker Object').to.be.true;

  // Change Message Type to (email:...)
  message.type = actions.join(':')

  const publication = await broker.publish('email-in', message);
  publication
    .on('success', (messageId) => {
      return Promise.resolve(`OK [${messageId}]`);
    })
    .on('error', (err) => {
      return Promise.reject(err)
    })
}

async function processAction(actions: string[], message: any): Promise<string> {
  switch (actions[0]) {
    case 'email': // Email Action
      return processEmailAction(actions, message);
    default:
      throw new Error('"type" has an unrecognized value');
  }
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
    const actions: string[] = (<string>type).split(':');
    expect(actions.length > 1, `[${type}] is not a valid action`).to.be.true;
    expect(actions[0] === 'action', `[${type}] is not a valid action`).to.be.true;

    const id: string = await processAction(actions.slice(1), content)
    console.info(`Action Processed [${content.id}-${type}]`);
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
