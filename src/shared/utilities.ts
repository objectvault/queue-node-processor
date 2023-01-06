/*
 * This file is part of the ObjectVault Project.
 * Copyright (C) 2020-2022 Paulo Ferreira <vault at sourcenotes.org>
 *
 * This work is published under the GNU AGPLv3.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { expect } from 'chai';
import _ from 'lodash';

function defaultOnEmpty(s: any, d: string): string {
  const v: string | null = nullOnEmpty(s);
  return v !== null ? v : d;
}

function nullOnEmpty(s: any): string | null {
  if ((s != null) && (typeof s === 'string')) {
    let v: string = s.trim();
    return v.length ? v : null;
  }

  return null;
}

function deepMerge(target: any, ...sources: any[]): any {
  expect(target, 'Target is not an object').to.be.an('object');

  // Do we have more objects to Merge
  if (!sources.length) {
    return target;
  }

  const source: any = sources.shift();
  expect(source, 'Source is not an object').to.be.an('object');

  // Merge Source Properties into Target
  for (const key in source) {
    if (_.isObject(source[key]) && _.isObject(target[key])) {
      deepMerge(target[key], source[key]);
      continue;
    }

    Object.assign(target, { [key]: source[key] });
  }

  // Continue until finished
  return deepMerge(target, ...sources);
}

function crossJoin(level1: string | string[], level2: string[], separator = '.') {
  if (!Array.isArray(level1)) {
    level1 = [level1];
  }

  if (level2.length) {
    const joined: string[] = [];
    for (const l1 of level1) {
      for (const l2 of level2) {
        const m: string = l2.length ? `${l1}${separator}${l2}` : l1;
        joined.push(m);
      }
    }

    return joined
  }

  return level1;
}

function dateNowISO8601(): string {
  return (new Date()).toISOString();
}

function sleep(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default {
  objects: {
    merge: deepMerge
  },
  strings: {
    nullOnEmpty,
    defaultOnEmpty,
    crossJoin
  },
  dates: {
    nowISO: dateNowISO8601
  },
  sleep
}
