/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import rascal from 'rascal';

// Local Modules
import type { Config } from '../config/config.js';

// Define Listener Interface
export interface Listener {
  setConfig?: (config: Config) => void;
  setBroker?: (broker: rascal.BrokerAsPromised) => void;
  attach: (subscription: rascal.SubscriberSessionAsPromised, onError?: (err: Error) => void) => rascal.SubscriberSessionAsPromised
};
