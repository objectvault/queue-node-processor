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
import fs from 'fs/promises';
import type { Message } from 'amqplib';
import { expect } from 'chai';
import rascal from 'rascal';
import { v4 as uuidv4 } from 'uuid';

// Local Modules
import { Config } from '../config/config.js';
import mailer from '../shared/mailer.js';
import utils from '../shared/utilities.js';
import type { Listener } from './listener.js';
import { EmailMessage, EmailMessageBody } from '../shared/queue-email.js';

function createNotification(message: any, code = 0): any {
  expect(code, 'Invalid Value for "version"').to.be.a('number').that.is.gte(0);

  const notify: any = message._notify
  if (notify == null) {
    return null;
  }

  const ot: string = notify.object;
  const oid: string = notify.id;
  expect(ot, 'Missing Notification Object Type').to.be.a('string').that.is.not.empty;
  expect(oid, 'Missing ID of Object to Notify').to.be.a('string').that.is.not.empty;

  // Create Basic Notification Message
  return {
    version: 1, // Notification Message Version
    id: uuidv4(), // Notification ID
    sourceType: 'email', // Source Object Type
    sourceID: message.id, // Source Object ID
    objectType: ot,  // Object Type
    objectID: oid, // Object ID
    code // Notification Code (>= 0  == SUCCESS, < 0 === FAILURE)
  };
}

async function queueNotifyPending(message: any): Promise<any> {
  expect(_broker != null, 'Invalid _broker Object').to.be.true;

  const publication = await _broker.publish('notify-pending', message);

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

async function readMostSpecificFile(files: string[], ext: string | null, file_opts: any): Promise<string | null> {
  // Return 1st Template Found
  let filename: string;
  for (const file of files) {
    try {
      filename = ext != null ? `${file}.${ext}` : file;
      const data = await fs.readFile(filename, { encoding: 'utf8' });
      return data.toString();
    } catch (e) {
      continue;
    }
  }

  return null;
}

async function readLocalizedMixin(basename: string, locale: string): Promise<string | null> {
  // Get Locale Possibilities
  let l: string | null = utils.strings.nullOnEmpty(locale);
  let locales: string[] = [''];
  if (l !== null) {
    const parts: string[] = l
      .toLowerCase()
      .split('_')
      .filter((v: string) => (v.length !== 0) && (v[0] !== '_'));

    if (parts.length == 1) {
      locales = [parts[0], ''];
    } else if (parts.length > 1) {
      locales = [`${parts[0]}_${parts[1]}`, parts[0], ''];
    }
  }

  // Possible Files from Most Specific (localized) to Least
  const files: string[] = utils.strings.crossJoin(`${mixinsPath}/${basename}`, locales);
  return readMostSpecificFile(files, 'json', { encoding: 'utf8' })
}

function generateMixins(options: string[], includeAll = true): string[] {
  const mixins: string[] = includeAll ? ['all'] : [];

  let parent: string | null = null;
  for (const o of options) {
    if (parent === null) {
      mixins.push(o);
      parent = o;
    } else {
      parent = `${parent}.${o}`;
      mixins.push(parent);
    }
  }

  return mixins;
}

async function mergeMixins(message: EmailMessageBody, mixins: string[], locale: string): Promise<EmailMessageBody> {
  if (mixins.length) {
    let merged: any = {};

    // Merge in Files to Expand Message Properties
    let merge: any = null;
    let content: string | null = null;
    for (const mixin of mixins) {
      content = await readLocalizedMixin(mixin, locale);
      if (content !== null) {
        merge = JSON.parse(content);
        merged = utils.objects.merge(merged, merge);
      }
    }

    // "merged" file properties don't override existing message properties
    return message.merge(merged, false);
  }

  return message;
}

async function readyEmailMessage(types: string[], message: EmailMessage): Promise<EmailMessage> {
  const body: EmailMessageBody = message.body()

  // Generate List of Mixins to Merge
  let mixins: string[] = generateMixins(types, true);

  // Get Locales
  const locale: string = utils.strings.defaultOnEmpty(body.params().get('locale'), 'en_US');

  // Merge Mixins into the Message Body
  await mergeMixins(body, mixins, locale);
  return message;
}

function incRetry(em: EmailMessage): number {
  const max: number = em.header().params().get('max-retries', 5);
  let current: number = em.header().props().get('retries', 0);

  // Have we Reached Max Retries?
  current++
  if (current > max) {
    throw new Error(`Action [${em.header().id()}] reached retry limit of [${max}]`);
  }

  // Update Retry Counter
  em.header().props().set('retries', current);
  return current;
}

async function processMessage(types: string[], em: EmailMessage): Promise<number> {
  const body: EmailMessageBody = em.body()

  // Verify Minimums for Email Message
  expect(body.params().map() != null, 'Missing Email "params"').to.be.true;
  expect(body.params().map(), 'Invalid Value for "params"').to.be.an('object');
  expect(body.params().get('to'), 'Missing "to" address for email').to.be.a('string').that.is.not.empty;
  expect(body.params().get('template'), 'Missing "template" for email').to.be.a('string').that.is.not.empty;

  // Test Retry Counter
  incRetry(em);

  const subtype: string | null = types.length > 1 ? utils.strings.nullOnEmpty(types[1].trim()) : null;
  switch (subtype) {
    case 'invite':
      await readyEmailMessage(['email', 'invite'], em);
      break;
    default:
      await readyEmailMessage(types, em);
  }

  // Send EMAIL
  const id: string = await mailer.sendMail(body.body());
  console.info(`Sent Email ID [${id}]`);
  return 0
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {
  let code: number = 0;
  try {
    // Verify Minimum Requirements for Message
    const email: EmailMessage = new EmailMessage(content);
    console.log(content)

    // Mark Message with Time Passed through Listener
    email.logTS(_name);

    const id: number = await processMessage(email.body().action(), email);
    console.info(`Message Processed [${email.header().id()}-${email.body().type()}]`);
    ackOrNack();
  } catch (e: any) {
    code = 1;  // Mailer Error
    console.error(e);
    ackOrNack(e);
  }

  const notice: any = createNotification(content, code);
  if (notice !== null) {
    try {
      queueNotifyPending(notice);
    } catch (e) {
      console.error('Failed to Queue Notification');
      console.info(notice);
    }
  }
}

// MODULE VARIABLES //
let mixinsPath: string | null;
let _broker: rascal.BrokerAsPromised;
let _name: string;

let listener: Listener = {
  setConfig: (c: Config) => {
    expect(c != null, 'Invalid Config Object').to.be.true;

    // CONFIGURE MAILER //
    // Get Templates Path
    let templatesPath: string | null = c.envOrProperty('TEMPLATES_PATH', 'paths.templates', null)
    templatesPath = utils.strings.defaultOnEmpty(templatesPath, './templates')

    // Configure Transport for Node Mailer
    const t: any = c.property('nodemailer', null);
    expect(t, 'Missing Node Mailer Configuration Settings').not.to.be.null;
    expect(t, 'Invalid Node Mailer Configuration Settings').to.be.an('object');
    mailer.config(t, templatesPath);

    // CONFIGURE INCOMING MESSAGE HANDLER //
    mixinsPath = c.envOrProperty('MIXINS_PATH', 'paths.mixins', null);
    mixinsPath = utils.strings.defaultOnEmpty(mixinsPath, './mixins')
  },
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
