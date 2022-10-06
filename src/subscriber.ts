/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// NODE Modules
import type { OptionValues } from 'commander';
import { program, InvalidArgumentError } from 'commander';
import rascal from 'rascal';
import { expect } from 'chai';

// Local Modules
import { Config } from './config/config.js';
import type { Listener } from './listeners/listener.js';

// PARAMETER Helpers //
function paramInteger(v: string) {
  // parseInt takes a string and a radix
  const i: number = parseInt(v, 10);
  if (isNaN(i) || i < 1) {
    throw new InvalidArgumentError('Not a number.');
  }
  return i;
}

function paramPositiveInteger(v: string) {
  const i: number = paramInteger(v)
  if (i < 1) {
    throw new InvalidArgumentError('Not a positive integer.');
  }
  return i;
}

function sleep(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
    .description('Node Message Queue Listener')
    .version('0.0.3')
    .option('-c, --config <path>', '(OPTIONAL) path to JSON Configuration File', './app.config.json')
    .option('-e, --dotenv <path>', '(OPTIONAL) path to Environment File')
    .option('-s, --subscribe <csv-list>', '(OPTIONAL) Comma Separated List of Subscriptions [DEFAULT all]')
    .option('-t, --tries <integer>', '(OPTIONAL) Number of Connection Retries before Giving Up [DEFAULT 5]', paramPositiveInteger, 5)
    .option('-w, --wait  <integer>', '(OPTIONAL) Number of Seconds to wait before Connection Retries [DEFAULT 5]', paramPositiveInteger, 5)

  // Parse Command Line
  program
    .parse();

  // Validate Command Line Options //
  const options: OptionValues = program.opts();
  console.info(options);

  // Application Configuration
  let path: string | null = null;
  const config: Config = Config.instance()

  // Load Environment File (if any)
  try {
    path = Config.env('DOTENV_PATH', options.dotenv)
    if (path !== null) {
      config.loadDOTENV(true, path);
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

  // CONFIGURE AMQP Broker //
  // Configure Transport for Node Mailer
  brokerConfig = config.property('broker', null);
  expect(brokerConfig, 'Missing Rascal Configuration Settings').not.to.be.null;
  expect(brokerConfig, 'Invalid Rascal Configuration Settings').to.be.an('object');

  // Try Parameters
  const tries: number = options.tries;
  const wait: number = options.wait;

  // Get Rascal Configuration
  brokerConfig = rascal.withDefaultConfig(brokerConfig);

  // LOOP: Try 'tries' times to connect
  for (let i = 0; i < tries; ++i) {
    try {
      // Delay Connection Attempt
      await sleep(wait * 1000);

      // Create Broker and Attach to Server
      broker = await rascal.BrokerAsPromised.create(brokerConfig);
    } catch (e) {
      console.warn(`Try [${i+1}] - Failed to Connect`)
      console.error(e);
    }
  }
  expect(broker != null, 'Invalid Broker Object').to.be.true;

  // @ts-ignore: Attach Broker Error Listener
  broker.on('error', console.error);

  // START SUBSCRIPTIONS //
  // @ts-ignore: Consume Messages from Broker Subscription
  const subscriptions = await broker.subscribeAll((c: rascal.SubscriptionConfig) => !c.autoCreated);
  subscriptions.forEach(async (s: rascal.SubscriberSessionAsPromised) => {
    try {
      // Import Subscription Listener
      const m: any = await import(`./listeners/${s.name}.js`);
      const l: Listener = m.default;

      // Set Configuration for Listener
      if (l.setConfig) {
        l.setConfig(config);
      }

      // Set Configuration for Listener
      if (l.setBroker) {
        // @ts-ignore: Verified broker !== null
        l.setBroker(broker);
      }

      // Attach Subscriber
      l.attach(s, console.error);
      console.info(`Listener for [${s.name}] attached`);
    } catch (e: any) {
      // Is ERR_MODULE_NOT_FOUND?
      if (e.code === 'ERR_MODULE_NOT_FOUND') { // YES: Warn but ignore
        console.warn(`Listener for [${s.name}] doesn't exist`);
      } else { // NO: rethrow
        throw e
      }
    }
  })
} catch (e) {
  console.error(e);
  process.exit(1);
}
