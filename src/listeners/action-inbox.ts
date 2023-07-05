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
import { ActionMessage } from '../shared/queue-action.js';
import type { Listener } from './listener.js';
import utils from '../shared/utilities.js';


async function queueActionForProcessing(am: ActionMessage): Promise<any> {
  expect(_broker != null, 'Invalid _broker Object').to.be.true;

  // ALL ACTIONS: HAVE TO HAVE Expiration SET
  // Either by: Creator or EXplicitly when being processed
  // DEFAULT: Expire Action in 1 Hour
  am.header().params().setIfNotSet('expiration', utils.dates.nowPlus.hours(1));

  const publication = await _broker.publish('action-process', am.message());

  // Wrap Events in Promise
  return new Promise<any>((resolve, reject) => {
    publication
      .on('success', (messageId: string) => {
        resolve(messageId);
      })
      .on('return', (message: Message) => {
        reject(new Error('Message Returned'))
      })
      .on('error', (err: Error, messageId: string) => {
        reject(err)
      });
  })
}

async function processAction(actions: string[], message: ActionMessage): Promise<string> {
  return queueActionForProcessing(message);
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {

  try {
    // Verify Minimum Requirements for Message
    const action: ActionMessage = new ActionMessage(content);
    console.log(content)

    // Mark Message with Time Passed through Listener
    action.logTS(_name);

    // Parse Action Type
    const id: string = await processAction(action.body().action(), action)
    console.info(`Action Processed [${action.header().id()}-${action.body().type()}]`);
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
