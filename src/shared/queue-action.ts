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
import { expect } from 'chai';
import _ from 'lodash';

// Local Modules
import utils from './utilities.js';

import type { TQueueMessage } from './queue-message.js';
import { QueueMessage, QueueMessageHeader } from './queue-message.js';

// Dependency Map
export type TNotifications = {
  id: string,
  type: string,
  [key: string]: any
};

// Dependency Map
export type TActionDependents = {
  [id: string]: any
};

// Action Body
export type TActionBody = {
  type: string | string[];
  params?: any;
  props?: any;
  __dependents?: TActionDependents;
  __notify?: TNotifications[];
}

export class ActionMessageBody {
  // WRAPPERS
  private __body: TActionBody;

  public constructor(b: any) {
    // Verify Minimum Requirements for Message
    expect(b != null, 'Message has no Body').to.be.true;
    expect(b, 'Invalid Action Body').to.be.an('object');
    expect(b, 'Action Missing "type"').to.have.own.property('type');

    // Validate Action type
    let type: any = b.type;
    if (_.isString(b.type)) {
      type = utils.strings.nullOnEmpty(type.trim());
      expect(b.type, 'Missing Value for "type"').is.not.empty;

      type = type.split(':');
    }

    if (_.isArray(type)) {
      expect(type.length > 1, `[${b.type}] is not a valid action`).to.be.true;
      expect(type[0] === 'action', `[${b.type}] is not a valid action`).to.be.true;
    } else {
      expect(false, `"type" contains an invalid value`).to.be.true;
    }

    // Save any changes;
    b.type = type;

    this.__body = b;
  }

  public isValid(): boolean {
    return this.__body.type != null;
  }

  public type(): string {
    return (<string[]>(this.__body.type)).join(':');
  }

  public action(): string[] {
    return <string[]>(this.__body.type);
  }

  public params(): any {
    return this.__body.params == null ? null : this.__body.params;
  }

  public props(): any {
    return this.__body.props == null ? null : this.__body.props;
  }

  public dependents(): TActionDependents {
    return this.__body.__dependents == null ? {} : this.__body.__dependents;
  }

  public addDependency(id: string, v: any): TActionDependents {
    if (this.__body.__dependents == null) {
      this.__body.__dependents = {};
    }

    this.__body.__dependents[id] = v;
    return this.__body.__dependents;
  }

  public notifications(): TNotifications[] {
    return this.__body.__notify == null ? [] : this.__body.__notify;
  }

  public notify(id: string, type: string): TNotifications[] {
    if (this.__body.__notify == null) {
      this.__body.__notify = [];
    }

    // Add Notification
    this.__body.__notify.push({
      id,
      type,
    });

    return this.__body.__notify;
  }

  public deleteNotify(id: string): TNotifications[] {
    // TODO: Implement
    return this.__body.__notify == null ? [] : this.__body.__notify;
  }
}

export class ActionMessage {
  // WRAPPERS
  private __message: QueueMessage;
  private __body: ActionMessageBody;

  public constructor(m?: any) {
    if (m != null) {
      // Verify Minimum Requirements for Message
      expect(m, 'Unable to Create Action Message from Parameter').to.be.an('object');

      if (m instanceof QueueMessage) {
        this.__message = m;
      } else {
        // Create Wrapped Message
        this.__message = new QueueMessage();
        this.__message.associate(m);
      }

    } else {
      // Create Wrapped Message
      this.__message = new QueueMessage();
    }

    const _m: any = this.__message.message();
    if (_m.body == null) {
      _m.body = {
        type: ['**MESSAGE BODY NEEDS TYPE**']
      }
    }

    // CACHE: Body Wrapper
    this.__body = new ActionMessageBody(_m.body);
  }

  public associate(m: any) {
    this.__message.associate(m);
    this.__body = new ActionMessageBody(m.body);
  }

  public associateBody(b: any) {
    this.__body = new ActionMessageBody(b);
    this.__message.message().body = b;
  }

  public message(): TQueueMessage {
    return this.__message.message();
  }

  public header(): QueueMessageHeader {
    return this.__message.header();
  }

  public export(): any {
    return this.__message.export();
  }

  public clone(): ActionMessage {
    const m: ActionMessage = new ActionMessage();
    m.associate(this.export());
    return m;
  }

  public isValid(): boolean {
    return this.__message.isValid() && this.__body.isValid();
  }

  public body(): ActionMessageBody {
    return this.__body;;
  }

  public logs(): any[] {
    return this.__message.logs();
  }

  public log(e: any): any[] {
    return this.__message.log(e);
  }

  public logTS(key: string): any[] {
    return this.__message.logTS(key);
  }
}
