/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import fs from 'fs/promises';
import type { Message } from 'amqplib';
import { expect } from 'chai';
import rascal from 'rascal';

// Local Modules
import { Config } from '../config/config.js';
import mailer from '../shared/mailer.js';
import utils from '../shared/utilities.js';
import type { Listener } from './listener.js';

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

async function mergeMixins(message: any, mixins: string[], locale: string): Promise<any> {
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

    // "message" properties override all of the properties coming in from the files
    return utils.objects.merge(merged, message);
  }

  return message;
}

async function queueForSend(message: any): Promise<any> {
  const publication = await broker.publish('message-ok', message);
  publication
    .on('success', (messageId) => {
      return Promise.resolve(`OK [${messageId}]`);
    })
    .on('error', (err) => {
      return Promise.reject(err)
    })
}

async function processEmailMessage(types: string[], message: any): Promise<string> {
  // Generate List of Mixins to Merge
  let mixins: string[] = generateMixins(types, true);

  // Get Locales
  const locale: string = utils.strings.defaultOnEmpty(message.locale, 'en_US');

  // Merge Mixins into the Message
  message = await mergeMixins(message, mixins, locale);

  // Send EMAIL
  const id: string = await mailer.sendMail(message);

  // Queue Message as OK
  return queueForSend(message);
}

async function processMessage(types: string[], message: any): Promise<string> {
  const subtype: string | null = types.length > 1 ? utils.strings.nullOnEmpty(types[1].trim()) : null;
  switch (subtype) {
    case 'invite':
      return processEmailMessage(['email', 'invite'], message);
    default:
      return processEmailMessage(types, message);
  }
}

async function messageListener(message: Message, content: any, ackOrNack: rascal.AckOrNack) {
  try {
    // Verify Minimum Requirements for Message
    expect(content, 'Invalid Message').to.be.an('object');
    expect(content.version, 'Invalid Value for "version"').to.be.a('number').that.is.gt(0);
    expect(content.id, 'Invalid Value for "id"').to.be.a('string').that.is.not.empty;
    expect(content.type, 'Invalid Value for "type"').to.be.a('string').that.is.not.empty;
    expect(content.params != null, 'Missing Email "params"').to.be.true;
    expect(content.params, 'Invalid Value for "params"').to.be.an('object');
    expect(content.params.to, 'Missing "to" address for email').to.be.a('string').that.is.not.empty;
    expect(content.params.template, 'Missing "to" address for email').to.be.a('string').that.is.not.empty;

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

// MODULE VARIABLES //
let mixinsPath: string | null;
let broker: rascal.BrokerAsPromised;

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
