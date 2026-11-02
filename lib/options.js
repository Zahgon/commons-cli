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
 * A collection of options and option groups that describes a command line.
 *
 * @module options
 */

import { IllegalArgumentException, NullPointerException } from './java/errors.js';
import { javaString } from './java/types.js';
import { Option } from './option.js';
import { stripLeadingHyphens } from './util.js';

/** Map.toString(): "{key=value, ...}". */
function mapToString(map) {
  return `{${[...map].map(([k, v]) => `${javaString(k)}=${javaString(v)}`).join(', ')}}`;
}

/** The options of a command line, by key and by long name, with the required ones and the groups. */
export class Options {
  constructor() {
    this.shortOpts = new Map();
    this.longOpts = new Map();
    this.requiredOpts = [];
    this.optionGroups = new Map();
  }

  /**
   * addOption(option), addOption(opt, description), addOption(opt, hasArg, description) or
   * addOption(opt, longOpt, hasArg, description).
   */
  addOption(...args) {
    if (args.length > 1) {
      return this.addOption(new Option(...args));
    }
    const [opt] = args;
    const key = opt.getKey();
    if (opt.hasLongOpt()) {
      this.longOpts.set(opt.getLongOpt(), opt);
    }
    if (opt.isRequired()) {
      const index = this.requiredOpts.indexOf(key);
      if (index !== -1) {
        this.requiredOpts.splice(index, 1);
      }
      this.requiredOpts.push(key);
    }
    this.shortOpts.set(key, opt);
    return this;
  }

  /** Adds a group: its options lose their own required flag, the group may be required as a whole. */
  addOptionGroup(optionGroup) {
    if (optionGroup.isRequired()) {
      this.requiredOpts.push(optionGroup);
    }
    for (const option of optionGroup.getOptions()) {
      option.setRequired(false);
      const key = option.getKey();
      this.removeRequired(key);
      this.addOption(option);
      this.optionGroups.set(key, optionGroup);
    }
    return this;
  }

  removeRequired(item) {
    const index = this.requiredOpts.indexOf(item);
    if (index !== -1) {
      this.requiredOpts.splice(index, 1);
    }
  }

  /** Adds the options and groups of another Options object; a key both have is an error. */
  addOptions(options) {
    for (const opt of options.getOptions()) {
      if (this.hasOption(opt.getKey())) {
        throw new IllegalArgumentException(`Duplicate key: ${javaString(opt.getKey())}`);
      }
      this.addOption(opt);
    }
    options.getOptionGroups().forEach((group) => this.addOptionGroup(group));
    return this;
  }

  addRequiredOption(opt, longOpt, hasArg, description) {
    const option = new Option(opt, longOpt, hasArg, description);
    option.setRequired(true);
    this.addOption(option);
    return this;
  }

  /** The long options the name matches: itself when it is one, else those it is a prefix of. */
  getMatchingOptions(opt) {
    const clean = stripLeadingHyphens(opt);
    if (this.longOpts.has(clean)) {
      return [clean];
    }
    if (clean == null && this.longOpts.size > 0) {
      throw new NullPointerException(null);
    }
    return [...this.longOpts.keys()].filter((longOpt) => longOpt.startsWith(clean));
  }

  getOption(opt) {
    const clean = stripLeadingHyphens(opt);
    return this.shortOpts.get(clean) ?? this.longOpts.get(clean) ?? null;
  }

  getOptionGroup(option) {
    return this.optionGroups.get(option.getKey()) ?? null;
  }

  getOptionGroups() {
    return [...new Set(this.optionGroups.values())];
  }

  getOptions() {
    return this.helpOptions();
  }

  getRequiredOptions() {
    return [...this.requiredOpts];
  }

  hasLongOption(opt) {
    return this.longOpts.has(stripLeadingHyphens(opt));
  }

  hasOption(opt) {
    const clean = stripLeadingHyphens(opt);
    return this.shortOpts.has(clean) || this.longOpts.has(clean);
  }

  hasShortOption(opt) {
    return this.shortOpts.has(stripLeadingHyphens(opt));
  }

  /** The options in the order they were first added. */
  helpOptions() {
    return [...this.shortOpts.values()];
  }

  toString() {
    return `[ Options: [ short ${mapToString(this.shortOpts)} ] [ long ${mapToString(this.longOpts)} ]`;
  }
}
