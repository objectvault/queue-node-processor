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
import { RedisClientType } from 'redis';

// Local Modules
import type { Listener } from './listener.js';

async function processMessage(sourceID: string, exitCode: number, message: any): Promise<string|null> {
  const key: string = `END:${sourceID}`;

  // Register End of Process with 24 hour Expiration Period
  return await _redis.set(key, exitCode,{
    EX: 24*3600
  });
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {
  try {
    // Verify Minimum Requirements for Message
    expect(content, 'Invalid Message').to.be.an('object');
    expect(content.version, 'Invalid Value for "version"').to.be.a('number').that.is.gt(0);
    expect(content.id, 'Invalid Value for "id"').to.be.a('string').that.is.not.empty;
    expect(content.sourceID, 'Invalid Value for "sourceID"').to.be.a('string').that.is.not.empty;
    expect(content.code, 'Invalid Value for "code"').to.be.a('number');
    console.log(content)

    // Notification Source
    const sourceID: string = content.sourceID;
    // Notification Code
    const code: number = content.code;

    // Process Message
    const r: string|null = await processMessage(sourceID, code, content)
    console.info(`Notification Processed [${sourceID}:${code}]`);
    ackOrNack();
  } catch (e: any) {
    console.error(e);
    ackOrNack(e);
  }
}

let _redis: RedisClientType;
let _broker: rascal.BrokerAsPromised;
let _name: string;

let listener: Listener = {
  setRedis: (c: RedisClientType) => {
    expect(c != null, 'Invalid _broker Object').to.be.true;
    _redis = c;
  },
  setBroker: (b: rascal.BrokerAsPromised) => {
    expect(b != null, 'Invalid Rascal Broker Object').to.be.true;
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
