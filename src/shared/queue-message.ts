/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// cSpell:ignore ampq

// Node Modules
import { expect } from 'chai';
import _ from 'lodash';

// Local Modules
import utils from './utilities.js';
import { QueueDynamicMap } from './queue-dynamic-map.js';

/* THE IDEA:
 * The Classes are Wrappers around a single data structure,
 * the idea being to write the message to ampq, all you have
 * to do is export a root javascript JSON Object, so all of the
 * data a message contains, is stored, in the class, under a
 * single property
 */

// Queue Message: Header Data Template
export type TQueueMessageHeader = {
  version: number;
  id?: string;
  parent?: string;
  created?: string;
  props?: any;
  params?: any;
}

// Queue Message: Basic Data Template
export type TQueueMessage = {
  header: TQueueMessageHeader;
  body?: any;
  __logs?: any[];
}

export class QueueMessageHeader {
  // WRAPPER
  private __header: TQueueMessageHeader;
  private __mapParams: QueueDynamicMap;
  private __mapProps: QueueDynamicMap;

  public constructor(h: any) {
    // Verify Header Valid
    expect(h != null, 'No Message Header').to.be.true;
    expect(h, 'Invalid Message Header').to.be.an('object');
    expect(h, 'Message Missing Header').to.include.all.keys('version');

    // Verify Header Content
    expect(h.version, 'Invalid Value for "version"').to.be.a('number').that.is.gt(0);
    if (h.id != null) {
      expect(h.id, 'Invalid Value for "id"').to.be.a('string').that.is.not.empty;
    }

    this.__header = h;
    this.__mapParams = new QueueDynamicMap(h, 'params');
    this.__mapProps = new QueueDynamicMap(h, 'props');
  }

  public isValid(): boolean {
    return this.__header.id != null;
  }

  public version(): number {
    return this.__header.version;
  }

  public id(): null | string {
    return this.__header.id != null ? this.__header.id : null;
  }

  public setID(id: string): string {
    expect(id, 'Invalid Value for "id"').to.be.a('string').that.is.not.empty;
    this.__header.id = id.trim();
    return this.__header.id;
  }

  public parent(): null | string {
    return this.__header.parent == null ? null : this.__header.parent;
  }

  public created(): null | Date {
    // TODO Improve Performance oo Date Conversion only once
    return this.__header.created == null ? null : new Date(this.__header.created);
  }

  public params(): QueueDynamicMap {
    return this.__mapParams;
  }

  public props(): QueueDynamicMap {
    return this.__mapProps;
  }
}

export class QueueMessage {
  // JSON Message
  private __message: TQueueMessage;

  // WRAPPER
  private __header: QueueMessageHeader;

  // Constructor
  public constructor() {
    this.__message = {
      header: {
        version: 1
      }
    }

    this.__header = new QueueMessageHeader(this.__message.header);
  }

  public associate(m: any) {
    // Verify Minimum Requirements for Message
    expect(m, 'Invalid Message').to.be.an('object');
    expect(m, 'Message Missing Header').to.have.own.property('header');

    // Verify Header Object
    expect(m.header, 'Invalid Message').to.be.an('object');

    // Associate Message
    this.__message = m;
    this.__header = new QueueMessageHeader(this.__message.header);
  }

  public message(): TQueueMessage {
    return this.__message;
  }

  public header(): QueueMessageHeader {
    return this.__header;
  }

  public export(): any {
    return utils.objects.merge({}, this.__message);
  }

  public clone(): QueueMessage {
    const m: QueueMessage = new QueueMessage();
    m.associate(this.export());
    return m;
  }

  public isExpired(): boolean {
    if (this.__header.params().has('expiration')) {
      const now: Date = new Date();
      const e: Date = new Date(this.__header.params().get('expiration'));
      return now >= e;
    }
    return false;
  }

  public isValid(): boolean {
    return this.__header.isValid();
  }

  public logs(): any[] {
    return this.__message.__logs == null ? [] : this.__message.__logs;
  }

  public log(e: any): any[] {
    if (this.__message != null) {
      if (this.__message.__logs == null) {
        this.__message.__logs = [e];
      } else {
        this.__message.__logs.unshift(e);
      }

      return this.__message.__logs;
    } else {
      return [];
    }
  }

  public logTS(key: string): any[] {
    // Current Time
    const now: string = (new Date()).toISOString();

    // Create Log Entry Timestamp for key
    const e: any = {};
    e[key] = now;
    return this.log(e);
  }
}
