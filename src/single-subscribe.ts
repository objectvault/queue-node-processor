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
import dotenv from 'dotenv';
import type { OptionValues } from 'commander';
import { program, InvalidArgumentError } from 'commander';
import rascal from 'rascal';
import { createClient, RedisClientType } from 'redis';
import { expect } from 'chai';

// Local Modules
import { Config } from './config/config.js';
import type { Listener } from './listeners/listener.js';

// HELPERS
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
let redisConfig: any = null;
let redisClient: RedisClientType | null = null;
let redisConnected: boolean = false;

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
    .option('-s, --subscribe <subscription>', '(REQUIRED) Subscription Channel')
    .option('-t, --tries <integer>', '(OPTIONAL) Number of Connection Retries before Giving Up [DEFAULT 5]', paramPositiveInteger, 5)
    .option('-w, --wait  <integer>', '(OPTIONAL) Number of Seconds to wait before Connection Retries [DEFAULT 5]', paramPositiveInteger, 5)

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

  // Try Parameters
  const tries: number = options.tries;
  const wait: number = options.wait;

  // CONFIGURE REDIS Client //
  // Configure Rascal Broker
  redisConfig = config.property('redis', null);
  expect(redisConfig, 'Missing Redis Configuration Settings').not.to.be.null;
  expect(redisConfig, 'Invalid Redis Configuration Settings').to.be.an('object');

  redisClient = createClient(redisConfig);
  redisClient.on('error', console.error);

  // LOOP: Try 'tries' times to connect
  for (let i = 0; i < tries; ++i) {
    try {
      // Connect to REDIS
      await redisClient.connect()
      console.info(`REDIS Opened on [${i + 1}] try`);
      redisConnected = true;
      break;
    } catch (e) {
      console.warn(`Try [${i + 1}] - Failed to Connect to REDIS`)
      console.error(e);
    }

    // Delay Connection Attempt
    await sleep(wait * 1000);
  }
  expect(redisConnected, 'Failed to Connect to REDIS').to.be.true;

  // CONFIGURE AMQP Broker //
  // Configure Rascal Broker
  brokerConfig = config.property('rascal', null);
  expect(brokerConfig, 'Missing Rascal Configuration Settings').not.to.be.null;
  expect(brokerConfig, 'Invalid Rascal Configuration Settings').to.be.an('object');

  // Get Rascal Configuration
  brokerConfig = rascal.withDefaultConfig(brokerConfig);

  // LOOP: Try 'tries' times to connect
  for (let i = 0; i < tries; ++i) {
    try {
      // Create Broker and Attach to Server
      broker = await rascal.BrokerAsPromised.create(brokerConfig);
      console.info(`Broker Opened on [${i + 1}] try`);
      break;
    } catch (e) {
      console.warn(`Try [${i + 1}] - Failed to Connect`)
      console.error(e);
    }

    // Delay Connection Attempt
    await sleep(wait * 1000);
  }
  expect(broker != null, 'Invalid Broker Object').to.be.true;

  // @ts-ignore: Attach Broker Error Listener
  broker.on('error', console.error);

  // Load Subscription Channel
  const channel: string = Config.env('SUBSCRIBE', options.subscribe)
  if (channel == null) {
    throw new Error('Application Subscription Channel not set');
  }

  // Import Subscription Listener
  const m: any = await import(`./listeners/${channel}.js`);
  let l: Listener = m.default;
  expect(l.setBroker != null, 'Invalid Listener Object').to.be.true;

  // Set Configuration for Listener?
  if (l.setConfig) { // YES
    l.setConfig(config);
  }

  // Set Redis for Listener?
  if (l.setRedis) { // YES
    // @ts-ignore: Verified redisClient !== null
    l.setRedis(redisClient);
  }

  // Set Broker in Listener
  // @ts-ignore (ts2531) listener.setBroker !== null
  l.setBroker(<rascal.BrokerAsPromised>broker)

  // START SUBSCRIPTION //
  // @ts-ignore: Consume Messages from Broker Subscription
  const subscription = await broker.subscribe(channel);
  l.attach(subscription, console.error)
} catch (e) {
  console.error(e);
  process.exit(1);
}
