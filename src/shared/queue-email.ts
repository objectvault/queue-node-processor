/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// cSpell:ignore uuidv4

// Node Modules
import { expect } from 'chai';
import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

// Local Modules
import utils from './utilities.js';
import { QueueDynamicMap } from './queue-dynamic-map.js';
import type { TQueueMessage } from './queue-message.js';
import { QueueMessage, QueueMessageHeader } from './queue-message.js';
import { ActionMessage, TNotifications } from './queue-action.js';

// Email Body
type TEmailBody = {
  type: string | string[];
  params?: any;
  props?: any;
  __notify?: TNotifications[];
}

export class EmailMessageBody {
  // WRAPPERS
  private __body: TEmailBody;
  private __mapParams: QueueDynamicMap;
  private __mapProps: QueueDynamicMap;

  public constructor(b: any) {
    // Verify Minimum Requirements for Message
    expect(b != null, 'Message has no Body').to.be.true;
    expect(b, 'Invalid Email Body').to.be.an('object');
    expect(b, 'Email Missing "type"').to.have.own.property('type');

    // Validate Action type
    let type: any = b.type;
    if (_.isString(b.type)) {
      type = utils.strings.nullOnEmpty(type.trim());
      expect(b.type, 'Missing Value for "type"').is.not.empty;

      type = type.split(':');
    }

    if (_.isArray(type)) {
      expect(type.length > 1, `type [${b.type.join(':')}] is not a valid`).to.be.true;
      expect(type[0] === 'email', `type [${b.type}] is not a valid`).to.be.true;
    } else {
      expect(false, `"type" contains an invalid value`).to.be.true;
    }

    // Save any changes;
    b.type = type;

    this.__body = b;
    this.__mapParams = new QueueDynamicMap(b, 'params');
    this.__mapProps = new QueueDynamicMap(b, 'props');

  }

  public isValid(): boolean {
    return this.__body.type != null;
  }

  public body(): any {
    return this.__body;
  }

  public type(): string {
    return (<string[]>(this.__body.type)).join(':');
  }

  public action(): string[] {
    return <string[]>(this.__body.type);
  }

  public merge(o: any, overwrite = true) : EmailMessageBody{
    if(o != null) {
      // Do we have Body Parameters to merge?
      if(o.params != null) { // YES
        this.params().merge(o.params, overwrite);
      }

      // Do we have Body Properties to merge?
      if(o.props != null) {
        this.props().merge(o.props, overwrite);
      }
    }

    return this;
  }

  public params(): QueueDynamicMap {
    return this.__mapParams;
  }

  public props(): QueueDynamicMap {
    return this.__mapProps;
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

export class EmailMessage {
  // WRAPPERS
  private __message: QueueMessage;
  private __body: EmailMessageBody;


  static fromAction(m: ActionMessage): EmailMessage {
    // Verify Expectations
    expect(m != null, 'No Action Message Provided').to.be.true;
    expect(m, 'Action Message Invalid').to.be.an('object');
    expect(m.isValid(), 'Invalid Action Message Provided').to.be.true;

    // Get a Clone of the Message
    const _m: any = m.export();
    delete _m.__logs; // Remove Logs

    // Remove Action Dependencies and Notifications
    const _b: any = _m.body;
    delete _b._notify; // Remove Notifications
    delete _b._dependents; // Remove Dependents

    // Set Correct type
    _b.type = m.body().action().slice(1);

    // Create Email Message (Based on Action)
    const email: EmailMessage = new EmailMessage(_m);
    // @ts-ignore (ts2531) Already Verified Message is Valid
    email.__body.notify(m.header().id(), 'action')

    // Create New Message ID
    email.header().setID(uuidv4());
    return email;
  }

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
    this.__body = new EmailMessageBody(_m.body);
  }

  public associate(m: any) {
    this.__message.associate(m);
    this.__body = new EmailMessageBody(m.body);
  }

  public associateBody(b: any) {
    this.__body = new EmailMessageBody(b);
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

  public isExpired(): boolean {
    return this.__message.isExpired();
  }

  public isValid(): boolean {
    return this.__message.isValid() && this.__body.isValid();
  }

  public body(): EmailMessageBody {
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
