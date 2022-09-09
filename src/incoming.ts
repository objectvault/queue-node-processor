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
import fs from 'fs/promises';
import rascal from 'rascal';

// Local Modules
import mailer from './shared/mailer.js';
import utils from './shared/utilities.js';

// MODULE VARIABLES //
let mixinsPath : string;

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

async function processGenericEmailMessage(message: any): Promise<string> {
  // Generate List of Mixins to Merge
  let mixins: string[];
  if (message.subtype) {
    mixins = generateMixins([message.type, message.subtype], true);
  } else {
    mixins = generateMixins([message.type], true);
  }

  // Get Locales
  const locale: string = utils.strings.defaultOnEmpty(message.locale, 'en_US');

  // Merge Mixins into the Message
  message = mergeMixins(message, mixins, locale);

  // Send EMAIL
  return mailer.sendMail(message);
}

async function processEmailInviteMessage(message: any): Promise<string> {
  // Generate List of Mixins to Merge
  const mixins: string[] = generateMixins([message.type, message.subtype], true);

  // Get Locales
  const email: any = message.email;
  const locale: string = utils.strings.defaultOnEmpty(email.locale, 'en_US');

  // Merge Mixins into the Message
  message = await mergeMixins(message, mixins, locale);

  // Send EMAIL
  return mailer.sendMail(message);
}

async function processEmailMessage(message: any): Promise<string> {
  // Verify Basic Email Requirements
  expect(message, 'Invalid Email Message').to.have.ownPropertyDescriptor('email');
  expect(message.email, 'Invalid Email Message').to.be.an('object');

  const email: any = message.email;
  expect(email.template, 'Invalid Value for "email.template"').to.be.a('string').that.is.not.empty;
  expect(email.to, 'Invalid Value for "email.to"').to.be.a('string').that.is.not.empty;

  const subtype: string | null = utils.strings.nullOnEmpty(message.subtype);
  switch (subtype) {
    case 'invite':
      return processEmailInviteMessage(message);
    case null:
      return processGenericEmailMessage(message);
    default:
      throw new Error('"subtype" has an unrecognized value');
  }
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
  switch (type) {
    case 'email':
      return processEmailMessage(message);
    case null:
      throw new Error('"type" has no value');
    default:
      throw new Error('"type" has an unrecognized value');
  }
}

async function incomingMessageHandler(message: Message, content: any, ackOrNack: rascal.AckOrNack) {
  try {
    const id: string = await processMessage(content)
    console.info(`Message Sent [${id}]`);
    ackOrNack();
  } catch (e: any) {
    console.error(e);
    ackOrNack(e);
  }
}

function config(path: string) {
  mixinsPath = path;
}

export default {
  config,
  subscriptionHandler: incomingMessageHandler
}
