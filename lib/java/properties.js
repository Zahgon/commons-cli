/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * java.util.Properties with Java's iteration orders. A Properties object keeps its entries in a ConcurrentHashMap
 * (16 bins to start with, doubled at three quarters full), which fixes the order of toString() and of iteration;
 * propertyNames() copies the entries in that order into a Hashtable (11 bins, grown to 2n + 1) and enumerates that
 * table from its last bin to its first. Both orders follow String.hashCode().
 *
 * @module java/properties
 */

import { hashCode } from './string.js';
import { Types } from './types.js';

const spread = (h) => (h ^ (h >>> 16)) & 0x7fffffff;

/** The bins of a ConcurrentHashMap: arrays of [key, value] entries in list order. */
class HashBins {
  constructor() {
    this.bins = new Array(16).fill(null).map(() => []);
    this.count = 0;
    this.sizeCtl = 12;
  }

  find(key) {
    const bin = this.bins[(this.bins.length - 1) & spread(hashCode(key))];
    return bin.find((entry) => entry[0] === key);
  }

  /** Stores a value and grows the table past its threshold; returns the previous value or null. */
  put(key, value) {
    const existing = this.find(key);
    if (existing) {
      const old = existing[1];
      existing[1] = value;
      return old;
    }
    this.bins[(this.bins.length - 1) & spread(hashCode(key))].push([key, value]);
    this.count++;
    while (this.count >= this.sizeCtl) {
      this.transfer();
    }
    return null;
  }

  /** ConcurrentHashMap.transfer: each bin splits into a low and a high bin; nodes before the last run reverse. */
  transfer() {
    const n = this.bins.length;
    const next = new Array(2 * n).fill(null).map(() => []);
    this.bins.forEach((bin, i) => {
      if (bin.length === 0) {
        return;
      }
      const bit = (entry) => spread(hashCode(entry[0])) & n;
      let runBit = bit(bin[0]);
      let lastRun = 0;
      for (let p = 1; p < bin.length; p++) {
        const b = bit(bin[p]);
        if (b !== runBit) {
          runBit = b;
          lastRun = p;
        }
      }
      const low = runBit === 0 ? bin.slice(lastRun) : [];
      const high = runBit !== 0 ? bin.slice(lastRun) : [];
      for (let p = 0; p < lastRun; p++) {
        (bit(bin[p]) === 0 ? low : high).unshift(bin[p]);
      }
      next[i] = low;
      next[i + n] = high;
    });
    this.bins = next;
    this.sizeCtl = 2 * n - n / 2;
  }

  entries() {
    return this.bins.flat();
  }
}

/** A Hashtable's keys in its enumeration order, for keys inserted in the given order. */
function hashtableKeys(keys) {
  let table = new Array(11).fill(null).map(() => []);
  let threshold = 8;
  let count = 0;
  for (const key of keys) {
    const h = hashCode(key);
    let index = (h & 0x7fffffff) % table.length;
    if (table[index].includes(key)) {
      continue;
    }
    if (count >= threshold) {
      const old = table;
      const capacity = old.length * 2 + 1;
      table = new Array(capacity).fill(null).map(() => []);
      for (let i = old.length; i-- > 0;) {
        for (const k of old[i]) {
          table[(hashCode(k) & 0x7fffffff) % capacity].unshift(k);
        }
      }
      threshold = Math.trunc(capacity * 0.75);
      index = (h & 0x7fffffff) % table.length;
    }
    table[index].unshift(key);
    count++;
  }
  const out = [];
  for (let i = table.length; i-- > 0;) {
    out.push(...table[i]);
  }
  return out;
}

/** java.util.Properties holding string keys and values. */
export class Properties {
  constructor() {
    this.map = new HashBins();
  }

  getClass() {
    return Types.PROPERTIES;
  }

  /** Properties.setProperty(key, value) and put(key, value): the previous value or null. */
  setProperty(key, value) {
    return this.map.put(key, value);
  }

  put(key, value) {
    return this.map.put(key, value);
  }

  /** Properties.getProperty(key). */
  getProperty(key) {
    return this.map.find(key)?.[1] ?? null;
  }

  /** The [key, value] entries in iteration order. */
  entries() {
    return this.map.entries().map(([k, v]) => [k, v]);
  }

  /** Properties.propertyNames(): the keys in the order of the Hashtable Java enumerates them from. */
  propertyNames() {
    return hashtableKeys(this.map.entries().map(([k]) => k));
  }

  /** Properties.toString(): "{key=value, ...}" in iteration order. */
  toString() {
    return `{${this.map.entries().map(([k, v]) => `${k}=${v}`).join(', ')}}`;
  }
}
