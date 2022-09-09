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

// NODE Modules
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { program } from 'commander';
import type { BrokerConfig } from 'rascal';
import rascal from 'rascal';
import { expect } from 'chai';
import _ from 'lodash';

// Local Modules
import incoming from './incoming.js';
import utils from './shared/utilities.js';
import mailer from './shared/mailer.js';

async function readJSONFile(path: string, file_opts?: any): Promise<any> {
  // Is File Options an Object?
  if ((file_opts == null) || !_.isObject(file_opts)) { // NO: Set Defaults
    file_opts = { encoding: 'utf8' };
  } else { // YES: JSON Uses UTF8 Encoding
    (file_opts as any).encoding = 'utf8';
  }

  // Read File (into Buffer)
  const b: Buffer = await fs.readFile(path, file_opts);

  // JSON Parse
  return JSON.parse(b.toString());
}

function getEnvSettingString(name: string, d?: string): string | null {
  // VERIFY: Parameter
  expect(name, 'Invalid Value for "name"').to.be.a('string').that.is.not.empty;
  let v: string | undefined = process.env[name] !== undefined ? process.env[name] : d;
  return v === undefined ? null : utils.strings.nullOnEmpty(v);
}

// Current Application Configuration
let gConfig: any = null;

// Rascal Broker Configuration
let brokerConfig: any = null;
let broker: rascal.BrokerAsPromised | null = null;

// TODO: Handle SIGTERM Different (i.e. kill the broker)
// SIGNALs to Handle
const signals: any = {
  'SIGHUP': 1,
  'SIGINT': 2,
  'SIGTERM': 15
};

// Signal Handler
const shutdown = async (name: string, id: number) => {
  console.log('shutdown!');
  console.log(`server stopped by ${name} with value ${id}`);
  if (broker != null) {
    console.log('Shutting Down Rascal');
    await broker.shutdown();
  }
  process.exit(128 + id);
};

// Attach Handler to Node Process
Object.keys(signals).forEach((name: string) => {
  process.on(name, () => {
    console.log(`process received a ${name} signal`);
    shutdown(name, signals[name]);
  });
});

try {
  // Initialize Command Line Settings
  program
    .name('mailer')
    .description('Node Mailer Program')
    .version('0.0.1')
    .option('-c, --config <path>', '(OPTIONAL) path to JSON Configuration File', './app.config.json')

  // Parse Command Line
  program
    .parse();

  // Validate Command Line Options //
  const options = program.opts();
  console.info(options);

  // Import .env file
  // TODO: Error Handling
  dotenv.config();

  // Load App Configuration
  let path: string | null = null;
  try {
    path = getEnvSettingString('CONFIG_PATH', options.config);
    if (path !== null) {
      gConfig = await readJSONFile(path);
    } else {
      throw new Error('Application has no config path set');
    }
  } catch (e) {
    console.error(`ERROR: No or Invalid Config at path [${path}]`);
    throw e;
  }

  // CONFIGURE MAILER //
  // Get Templates Path
  let templatesPath: string | null = getEnvSettingString('TEMPLATES_PATH', _.get(gConfig, 'paths.templates'));
  templatesPath = utils.strings.defaultOnEmpty(templatesPath, './templates')

  // Configure Transport for Node Mailer
  const t: any = _.get(gConfig, 'nodemailer', null);
  expect(t, 'Missing Node Mailer Configuration Settings').not.to.be.null;
  expect(t, 'Invalid Node Mailer Configuration Settings').to.be.an('object');
  mailer.config(t, templatesPath);

  // CONFIGURE INCOMING MESSAGE HANDLER //
  let mixinsPath: string | null = getEnvSettingString('MIXINS_PATH', _.get(gConfig, 'paths.mixins', './mixins'));
  mixinsPath = utils.strings.defaultOnEmpty(mixinsPath, './mixins')
  incoming.config(mixinsPath);

  // CONFIGURE AMQP Broker //
  // Configure Transport for Node Mailer
  brokerConfig = _.get(gConfig, 'broker', null);
  expect(brokerConfig, 'Missing Rascal Configuration Settings').not.to.be.null;
  expect(brokerConfig, 'Invalid Rascal Configuration Settings').to.be.an('object');

  // Create Broker and Attach to Server
  brokerConfig = rascal.withDefaultConfig(brokerConfig);
  broker = await rascal.BrokerAsPromised.create(brokerConfig);
  broker.on('error', console.error);

  // START SUBSCRIPTION //
  // Consume Messages from Broker Subscription
  const subscription = await broker.subscribe('email_send');
  subscription
    .on('message', incoming.subscriptionHandler)
    .on('error', console.error);
} catch (e) {
  console.error(e);
  process.exit(1);
}
