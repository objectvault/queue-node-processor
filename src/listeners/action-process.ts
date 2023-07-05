/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// cSpell:ignore uuidv4

// Node Modules
import type { Message } from 'amqplib';
import { expect } from 'chai';
import rascal from 'rascal';

// Local Modules
import { ActionMessage } from '../shared/queue-action.js';
import { EmailMessage } from '../shared/queue-email.js';
import type { Listener } from './listener.js';

async function queueEmailIn(qm: EmailMessage): Promise<any> {
  expect(_broker != null, 'Invalid Broker Object').to.be.true;

  const publication = await _broker.publish('email-inbox', qm.message());

  // Wrap Events in Promise
  return new Promise<any>((resolve, reject) => {
    publication
      .on('success', (messageId: string) => {
        resolve(qm);
      })
      .on('return', (message: Message) => {
        reject(new Error('Message Returned'))
      })
      .on('error', (err: Error, messageId: string) => {
        reject(err)
      });
  })
}

async function queueActionSleep(qm: ActionMessage): Promise<any> {
  expect(_broker != null, 'Invalid Broker Object').to.be.true;

  const publication: rascal.PublicationSession = await _broker.publish('action-sleep', qm.message());

  // Wrap Events in Promise
  return new Promise<any>((resolve, reject) => {
    publication
      .on('success', (messageId: string) => {
        resolve(qm);
      })
      .on('return', (m: Message) => {
        reject(new Error('Message Returned'))
      })
      .on('error', (err: Error, messageId: string) => {
        reject(err)
      });
  })
}

async function processEmailAction(type: string[], message: any): Promise<any> {
  // Create Email Message
  //  const emailMessage: any = utils.objects.merge({}, message);
  const email: EmailMessage = EmailMessage.fromAction(message);

  // Create Notification Information
  return queueEmailIn(email);
}

async function processAction(actions: string[], message: ActionMessage): Promise<string> {

  // Is Message Expired
  if(message.isExpired()) { // YES: Abort
    throw new Error(`Action [${message.header().id()}] expired`);
  }

  switch (actions[0]) {
    case 'email': // Email Action
      const em: EmailMessage = await processEmailAction(actions, message);
      // @ts-ignore (ts2531) Already Verified Message is Valid
      message.body().addDependency(em.header().id(), -1);
      return queueActionSleep(message);
    default:
      throw new Error(`Action "type" [${actions[0]}] unrecognized`);
  }
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {

  try {
    // Verify Minimum Requirements for Message
    const action: ActionMessage = new ActionMessage(content);
    console.log(content)

    // Mark Message with Time Passed through Listener
    action.logTS(_name);

    // Process Message
    console.info(`Processing Message [${action.header().id()}-${action.body().type()}]`);
    const id: string = await processAction(action.body().action().slice(1), action)
    console.info(`Action Processed [${action.header().id()}]`);
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
    expect(b != null, 'Invalid Broker Object').to.be.true;
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
