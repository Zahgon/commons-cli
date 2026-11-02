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
 * A group of mutually exclusive options.
 *
 * @module option-group
 */

import { AlreadySelectedException } from './exceptions.js';
import { DEFAULT_LONG_OPT_PREFIX, DEFAULT_OPT_PREFIX } from './util.js';

/** Mutually exclusive options; at most one of them may be selected. */
export class OptionGroup {
  constructor() {
    this.optionMap = new Map();
    this.selected = null;
    this.required = false;
  }

  /** Adds an option (replacing one with the same key). */
  addOption(option) {
    this.optionMap.set(option.getKey(), option);
    return this;
  }

  getNames() {
    return [...this.optionMap.keys()];
  }

  getOptions() {
    return [...this.optionMap.values()];
  }

  getSelected() {
    return this.selected;
  }

  isRequired() {
    return this.required;
  }

  isSelected() {
    return this.selected != null;
  }

  setRequired(required) {
    this.required = required;
  }

  /**
   * Selects an option of the group, or clears the selection when option is null.
   *
   * @throws {AlreadySelectedException} when another option is already selected
   */
  setSelected(option) {
    if (option == null) {
      this.selected = null;
      return;
    }
    if (this.selected != null && this.selected !== option.getKey()) {
      throw new AlreadySelectedException(this, option);
    }
    this.selected = option.getKey();
  }

  toString() {
    const parts = this.getOptions().map((option) => {
      const name = option.getOpt() != null ? DEFAULT_OPT_PREFIX + option.getOpt() : `${DEFAULT_LONG_OPT_PREFIX}${option.getLongOpt()}`;
      return option.getDescription() != null ? `${name} ${option.getDescription()}` : name;
    });
    return `[${parts.join(', ')}]`;
  }
}
