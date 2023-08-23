/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// cSpell:ignore pname

// Node Modules
import { expect } from 'chai';
import _ from 'lodash';

// Local Modules
import utils from './utilities.js';

export class QueueDynamicMap {
  // WRAPPER
  private __parent: any;    // Parent Object
  private __pname: string;  // Parent Object Property Name

  public constructor(pobj: any, pname: string) {
    // Verify Header Valid
    expect(pobj != null, 'No Parent Object').to.be.true;
    expect(pobj, 'Invalid Parent Object').to.be.an('object');

    this.__parent = pobj;
    this.__pname = pname;

  }

  public map(): any {
    return this._get();
  }

  public merge(o: any, overwrite = true) {
    if (o != null) {
      if (overwrite) {
        this._mergeOverwrite(o)
      } else {
        this._mergeNotSet(o);
      }
    }
  }

  public has(p: string): boolean {
    const map: any = this._get();
    if (map) {
      return _.has(map, p);
    }
    return false;
  }

  public get(p: string, d?: any): any {
    const map: any = this._get();
    if (map) {
      return _.get(map, p, d);
    }
    return d;
  }

  public set(p: string, v?: any) {
    if (v === undefined) {
      this.clear(p);
      return;
    }

    const map: any = this._get();
    if (map == null) {
      this._set(_.set({}, p, v));
      return;
    }

    _.set(map, p, v);
  }

  public setIfNotSet(p: string, v: any) {
    if (v === undefined) {
      this.clear(p);
      return;
    }

    const map: any = this._get();
    if (map == null) {
      this._set(_.set({}, p, v));
      return;
    }

    if (!this.has(p)) {
      _.set(map, p, v);
    }
  }

  public clear(p: string) {
    const map: any = this._get();
    if (map) {
      _.unset(map, p)
    }
  }

  protected _get(): any {
    const m: any = this.__parent[this.__pname];
    return m;
  }

  protected _set(m?: any) {
    if (m === undefined) {
      delete this.__parent[this.__pname];
    } else {
      expect(m == null || typeof (m) === 'object', 'Invalid Map Value').to.be.true;
      this.__parent[this.__pname] = m;
    }
  }

  protected _mergeOverwrite(o?: any) {
    const m: any = this.__parent[this.__pname];
    if (m == null) {
      this.__parent[this.__pname] = o;
    } else {
      this.__parent[this.__pname] = utils.objects.merge(m, o)
    }
  }

  protected _mergeNotSet(o?: any) {
    const m: any = this.__parent[this.__pname];
    if (m == null) {
      this.__parent[this.__pname] = o;
    } else {
      this.__parent[this.__pname] = utils.objects.merge(o, m)
    }
  }
}

