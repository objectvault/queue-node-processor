/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// cSpell:ignore cpath, ename

import fs from 'fs/promises';
import type { DotenvConfigOptions, DotenvConfigOutput } from 'dotenv';
import dotenv from 'dotenv';
import { expect } from 'chai';
import _ from 'lodash';


// Current Config Instance
let _instance: Config | null = null;

interface MapEnvironmentPath {
  [key: string]: string;
}

export class Config {
  protected _json: any = null;

  public static instance(): Config {
    if (_instance == null) {
      _instance = new Config()
    }

    return _instance;
  }

  public static hasEnv(ename: string): any {
    expect(ename, 'Missing Value for Parameter "ename"').to.be.a('string').that.is.not.empty;

    // Does Environment Variable Exist?
    return process.env[ename] !== undefined;
  }

  public static env(ename: string, d?: any): any {
    expect(ename, 'Missing Value for Parameter "ename"').to.be.a('string').that.is.not.empty;

    // Does Environment Variable Exist?
    if (process.env[ename] !== undefined) { // YES: Return String Value
      return process.env[ename];
    }
    // NO: Return Default
    return d
  }

  public loadDOTENV(path: string | null = null, throwOnError: boolean = false, opts?: DotenvConfigOptions,): Config {
    // Import .env file
    const result: DotenvConfigOutput = dotenv.config(opts != null ? opts : undefined);


    if (!!throwOnError && result.error) {
      throw result.error;
    }

    return this;
  }

  public async loadJSON(path: string, file_opts?: any): Promise<Config> {
    // Is File Options an Object?
    if ((file_opts == null) || !_.isObject(file_opts)) { // NO: Set Defaults
      file_opts = { encoding: 'utf8' };
    } else { // YES: JSON Uses UTF8 Encoding
      (file_opts as any).encoding = 'utf8';
    }

    // Read File (into Buffer)
    const b: Buffer = await fs.readFile(path, file_opts);

    // Save Parsed JSON Parse
    this._json = JSON.parse(b.toString());

    return Promise.resolve(this);
  }

  public hasProperty(cpath: string): boolean {
    expect(cpath, 'Missing Value for Parameter "cpath"').to.be.a('string').that.is.not.empty;

    // Does Value for Path Exist?
    return _.get(this._json, cpath) !== undefined;
  }

  public property(cpath: string, d?: any): any {
    expect(cpath, 'Missing Value for Parameter "cpath"').to.be.a('string').that.is.not.empty;

    // Return value for path (or DEFAULT)
    return _.get(this._json, cpath, d);
  }

  public envOrProperty(ename: string, cpath: string, d?: any): any {
    expect(ename, 'Missing Value for Parameter "ename"').to.be.a('string').that.is.not.empty;
    expect(cpath, 'Missing Value for Parameter "cpath"').to.be.a('string').that.is.not.empty;

    let r: any = Config.env(ename);
    if (r === undefined) {
      r = this.property(cpath, d)
    }
    return r;
  }
}
