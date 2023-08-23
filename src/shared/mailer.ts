/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// cSpell:ignore liquidjs

import fs from 'fs/promises';
import { expect } from 'chai';
import { Liquid } from 'liquidjs';
import nodemailer from 'nodemailer';
import _ from 'lodash';

// Local Modules
import utils from './utilities.js';

// Template Options
type TTemplateOptions = {
  name: string;
  formats?: string | string[];
  locale?: string;
  allowEmptyFormat?: boolean;
}

// Instance of NodeMailer Transport
let nodeMailerTransport: any = null;
let templatesPath: string;

function templatesFromOptions(opts: TTemplateOptions): string[] {
  const { name, formats, locale, allowEmptyFormat = false } = opts;

  // Validate Template Name
  let n: string | null = name != null ? name.trim() : null;
  if (n === null || n.length === 0) {
    throw new Error('ERROR: No Template Name Provided');
  }
  n = n.toLowerCase();

  // Set Locale Possibilities
  let l: string | null = utils.strings.nullOnEmpty(locale);
  let level1: string[] = [''];
  if (l !== null) {
    const parts: string[] = l
      .toLowerCase()
      .split('_')
      .filter((v: string) => (v.length !== 0) && (v[0] !== '_'));

    if (parts.length == 1) {
      level1 = [parts[0], ''];
    } else if (parts.length > 1) {
      level1 = [`${parts[0]}_${parts[1]}`, parts[0], ''];
    }
  }

  // Set Format Possibilities
  let level2: string[] = [];
  if (formats != null) {
    if (Array.isArray(formats)) {
      level2 = formats
        .map((v) => (v != null) && (typeof (v) === 'string') ? v.trim().toLowerCase() : '')
        .filter((v) => v.length);
    } else {
      const s = utils.strings.nullOnEmpty(formats);
      if (s !== null) {
        level2.push(s.toLowerCase());
      }
    }
  }

  if (allowEmptyFormat) {
    level2.push('');
  }

  let levels: string[] = utils.strings.crossJoin(n, level1);
  levels = utils.strings.crossJoin(levels, level2);
  return levels;
}

async function findTemplate(opts: TTemplateOptions): Promise<string | null> {
  // Get Possible Templates Names (Most Specific to Least)
  const templates: string[] = templatesFromOptions(opts);

  // Return 1st Template Found
  for (const t1 of templates) {
    try {
      const data = await fs.readFile(`${templatesPath}/${t1}`, { encoding: 'utf8' });
      return data;
    } catch (e) {
      continue;
    }
  }

  return null;
}

async function renderTemplate(template: string | null, context?: any): Promise<string | null> {
  let rendered: string | null = null;
  if (template != null) {
    const engine = new Liquid();
    const tpl = engine.parse(template);
    rendered = await engine.render(tpl, context);
    console.log(rendered);
  }

  return rendered
}

async function sendMail(m: any): Promise<string> {
  // Verify Minimum Requirements for Email Message
  const headers: any = m.params;
  expect(headers.from, 'Invalid Value for "email.from"').to.be.a('string').that.is.not.empty;
  expect(headers.subject, 'Invalid Value for "email.subject"').to.be.a('string').that.is.not.empty;

  const template: string = headers.template;
  const locale: string = utils.strings.defaultOnEmpty(headers.locale, 'en_US');

  // Find and Render TEXT and HTML Templates
  let t: string | null = await findTemplate(
    {
      name: template, formats: 'text', locale
    }
  );
  let text: string | null = await renderTemplate(t, m.props);

  t = await findTemplate(
    {
      name: template, formats: 'html', locale
    }
  );
  let html: string | null = await renderTemplate(t, m.props);

  // Do we have something to send?
  if ((text != null) || (html != null)) { // YES
    // Create EMAIL Message
    const message: any = {
      from: headers.from,
      to: headers.to,       // list of receivers
      subject: headers.subject
    };

    if (text != null) {
      message.text = text;
    }

    if (html != null) {
      message.html = html;
    }

    // Send Email
    let info = await nodeMailerTransport.sendMail(message);
    return info.messageId;
  } else { // NO: Invalid Template
    throw new Error(`Invalid Template [${template}]`);
  }
}

function config(settings?: any, path?: string | null): any {
  if (settings) {
    nodeMailerTransport = nodemailer.createTransport(settings);
    expect(nodeMailerTransport != null && _.isObject(nodeMailerTransport), 'Invalid Node Mailer Configuration').to.be.true;
  }

  if (path != null) {
    templatesPath = path;
  }

  return nodeMailerTransport;
}

export default {
  config,
  sendMail
}
