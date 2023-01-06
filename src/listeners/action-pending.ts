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
import { v4 as uuidv4 } from 'uuid';

// Local Modules
import utils from '../shared/utilities.js';
import type { Listener } from './listener.js';

async function queueEmailIn(message: any): Promise<any> {
  expect(_broker != null, 'Invalid Broker Object').to.be.true;

  const publication = await _broker.publish('email-in', message);

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

async function queueActionProcessing(message: any): Promise<any> {
  expect(_broker != null, 'Invalid Broker Object').to.be.true;

  const publication: rascal.PublicationSession = await _broker.publish('action-processing', message);

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

async function processEmailAction(type: string[], message: any): Promise<string> {
  // Create Email Message
  const emailMessage: any = utils.objects.merge({}, message);

  // Create New Message ID
  emailMessage.id = uuidv4();
  emailMessage.type = type;

  // Create Notification Information
  emailMessage._notify = {
    object: 'action',
    id: message.id
  };

  return queueEmailIn(emailMessage);
}

async function processAction(type: string[], message: any): Promise<string> {
  switch (type[0]) {
    case 'email': // Email Action
      const em: any = await processEmailAction(type, message);
      message._pending = {};
      message._pending[em.id] = -1;
      return queueActionProcessing(message);
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
    expect(content.type, 'Invalid Value for "type"').to.be.an('array').that.is.not.empty;
    console.log(content)

    // Current Time
    const now: string = (new Date()).toISOString();

    // Mark Message with Time Passed through Listener
    content._times[_name] = now;

    // Extract Message Type
    console.info(`Processing Message [${content.version}:${content.id}]`);
    const type: string[] = content.type;

    const id: string = await processAction(type.slice(1), content)
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
