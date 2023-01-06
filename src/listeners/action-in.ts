/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Node Modules
import type { Message } from 'amqplib';
import { expect } from 'chai';
import rascal from 'rascal';

// Local Modules
import utils from '../shared/utilities.js';
import type { Listener } from './listener.js';

async function queueActionPending(message: any): Promise<any> {
  expect(_broker != null, 'Invalid _broker Object').to.be.true;

  const publication = await _broker.publish('action-pending', message);

  // Wrap Events in Promise
  return new Promise<any>((resolve, reject) => {
    publication
      .on('success', (mID: string) => {
        resolve(mID);
      })
      .on('return', (message: Message) => {
        reject(new Error('Message Returned'))
      })
      .on('error', (err: Error, messageId: string) => {
        reject(err)
      });
  })
}

async function processAction(actions: string[], message: any): Promise<string> {
  message.type = actions;
  return queueActionPending(message);
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

    // Current Time
    const now: string = (new Date()).toISOString();

    // Mark Message with Time Passed through Listener
    content._times = {};
    content._times[_name] = now;

    // Parse Action Type
    const actions: string[] = (<string>type).split(':');
    expect(actions.length > 1, `[${type}] is not a valid action`).to.be.true;
    expect(actions[0] === 'action', `[${type}] is not a valid action`).to.be.true;

    const id: string = await processAction(actions, content)
    console.info(`Action Processed [${content.id}-${type}]`);
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
      .on('error', onError ? onError : console.error)

    return subscription;
  }
}

// EXPORT Listener
export default listener;
