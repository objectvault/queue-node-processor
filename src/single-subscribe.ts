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
import type { OptionValues } from 'commander';
import { program } from 'commander';
import rascal from 'rascal';
import { expect } from 'chai';

// Local Modules
import { Config } from './config/config.js';
import type { Listener } from './listeners/listener.js';

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
    .description('Node "action-start" listener')
    .version('0.0.2')
    .option('-c, --config <path>', '(OPTIONAL) path to JSON Configuration File', './app.config.json')
    .option('-e, --dotenv <path>', '(OPTIONAL) path to Environment File')
    .option('-s, --subscribe <subscription>', '(REQUIRED) Subscription Channel');

  // Parse Command Line
  program
    .parse();

  // Validate Command Line Options //
  const options: OptionValues = program.opts();
  console.info(options);

  // Import .env file
  // TODO: Error Handling
  dotenv.config();

  // Application Configuration
  let path: string | null = null;
  const config: Config = Config.instance()

  // Load Environment File (if any)
  try {
    path = Config.env('DOTENV_PATH', options.dotenv)
    if (path !== null) {
      config.loadDOTENV(path, true);
    } else {
      config.loadDOTENV();
    }
  } catch (e) {
    console.error(`ERROR: Missing or Invalid Environment File at path [${path}]`);
    throw e;
  }

  // Load App Configuration
  try {
    path = Config.env('CONFIG_PATH', options.config)
    if (path !== null) {
      await config.loadJSON(path)
    } else {
      throw new Error('Application has no config path set');
    }
  } catch (e) {
    console.error(`ERROR: No or Invalid Config at path [${path}]`);
    throw e;
  }

  // Load Subscription Channel
  let listener: Listener | null = null;
  try {
    const channel: string = Config.env('SUBSCRIBE', options.subscribe)
    if (channel !== null) {
      // Import Subscription Listener
      const m: any = await import(`./listeners/${channel}.js`);
      listener = m.default
    } else {
      throw new Error('Application Subscription Channel not set');
    }
  } catch (e) {
    console.error('Missing Channel or Channel Listener does not Exist');
    throw e;
  }

  // CONFIGURE AMQP Broker //
  // Configure Transport for Node Mailer
  brokerConfig = config.property('broker', null);
  expect(brokerConfig, 'Missing Rascal Configuration Settings').not.to.be.null;
  expect(brokerConfig, 'Invalid Rascal Configuration Settings').to.be.an('object');

  // Create Broker and Attach to Server
  brokerConfig = rascal.withDefaultConfig(brokerConfig);
  broker = await rascal.BrokerAsPromised.create(brokerConfig);
  expect(broker != null, 'Invalid Broker Object').to.be.true;

  // Attach Broker Error Listener
  broker.on('error', console.error);

  // START SUBSCRIPTION //
  // Set Broker for Listener
  // @ts-ignore (ts2531) listener !== null
  expect(listener.setBroker != null, 'Invalid Listener Object').to.be.true;
  // @ts-ignore
  listener.setBroker(<rascal.BrokerAsPromised>broker)

  // Consume Messages from Broker Subscription
  const subscription = await broker.subscribe('action-start');
  // @ts-ignore (ts2531) listener !== null
  listener.attach(subscription, console.error)
} catch (e) {
  console.error(e);
  process.exit(1);
}
