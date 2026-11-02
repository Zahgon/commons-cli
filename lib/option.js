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
 * A single command line option: its names, arguments, description and type, and the values it received.
 *
 * @module option
 */

import { DeprecatedAttributes } from './deprecated-attributes.js';
import {
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  StringIndexOutOfBoundsException,
  UnsupportedOperationException,
  requireNonNull
} from './java/errors.js';
import { hashCode as stringHashCode } from './java/string.js';
import { Types, javaString } from './java/types.js';
import { validate } from './option-validator.js';
import { TypeHandler } from './type-handler.js';

/** The value separator that is no separator. */
const NO_SEPARATOR = '\u0000';

/** Describes a single command line option. */
export class Option {
  /** The number of arguments of an option that has none. */
  static UNINITIALIZED = -1;

  /** The number of arguments of an option that takes any number. */
  static UNLIMITED_VALUES = -2;

  /** Builds an Option step by step; get() validates it. */
  static Builder = class Builder {
    constructor(option) {
      this.argCountValue = Option.UNINITIALIZED;
      this.option(option);
    }

    argName(argName) {
      this.argNameValue = argName;
      return this;
    }

    build() {
      return this.get();
    }

    converter(converter) {
      this.converterValue = converter;
      return this;
    }

    deprecated(deprecated = DeprecatedAttributes.DEFAULT) {
      this.deprecatedValue = deprecated;
      return this;
    }

    desc(description) {
      this.descriptionValue = description;
      return this;
    }

    get() {
      return Option.fromBuilder(this);
    }

    hasArg(hasArg = true) {
      this.argCountValue = hasArg ? 1 : Option.UNINITIALIZED;
      return this;
    }

    hasArgs() {
      this.argCountValue = Option.UNLIMITED_VALUES;
      return this;
    }

    longOpt(longOption) {
      this.longOptionValue = longOption;
      return this;
    }

    numberOfArgs(argCount) {
      this.argCountValue = argCount;
      return this;
    }

    option(option) {
      this.optionValue = validate(option);
      return this;
    }

    optionalArg(optionalArg) {
      if (optionalArg && this.argCountValue === Option.UNINITIALIZED) {
        this.argCountValue = 1;
      }
      this.optionalArgValue = optionalArg;
      return this;
    }

    required(required = true) {
      this.requiredValue = required;
      return this;
    }

    since(since) {
      this.sinceValue = since;
      return this;
    }

    type(type) {
      this.typeValue = type ?? Types.STRING;
      return this;
    }

    valueSeparator(valueSeparator = '=') {
      this.valueSeparatorValue = valueSeparator;
      return this;
    }
  };

  /** Option.builder(option): a builder for an option with the given short name (or none). */
  static builder(option = null) {
    return new Option.Builder(option);
  }

  /**
   * new Option(option, description), new Option(option, hasArg, description) or
   * new Option(option, longOption, hasArg, description).
   */
  constructor(...args) {
    const [option, longOption, hasArg, description] = args.length === 2 ? [args[0], null, false, args[1]]
      : args.length === 3 ? [args[0], null, args[1], args[2]] : args;
    this.initialize();
    this.deprecated = null;
    this.option = validate(option);
    this.longOption = longOption;
    if (hasArg) {
      this.argCount = 1;
    }
    this.description = description;
  }

  initialize() {
    this.argCount = Option.UNINITIALIZED;
    this.argName = null;
    this.converter = null;
    this.description = null;
    this.longOption = null;
    this.optionalArg = false;
    this.required = false;
    this.since = null;
    this.type = Types.STRING;
    this.values = [];
    this.valueSeparator = NO_SEPARATOR;
  }

  static fromBuilder(builder) {
    const b = builder;
    if (b.optionValue == null && (b.longOptionValue ?? null) == null) {
      throw new IllegalStateException('Either opt or longOpt must be specified');
    }
    const o = Object.create(Option.prototype);
    o.initialize();
    o.argName = b.argNameValue ?? null;
    o.description = b.descriptionValue ?? null;
    o.longOption = b.longOptionValue ?? null;
    o.argCount = b.argCountValue ?? Option.UNINITIALIZED;
    o.option = b.optionValue;
    o.optionalArg = b.optionalArgValue ?? false;
    o.deprecated = b.deprecatedValue ?? null;
    o.required = b.requiredValue ?? false;
    o.since = b.sinceValue ?? null;
    o.type = b.typeValue ?? Types.STRING;
    o.valueSeparator = b.valueSeparatorValue ?? NO_SEPARATOR;
    o.converter = b.converterValue ?? null;
    return o;
  }

  acceptsArg() {
    return (this.hasArg() || this.hasArgs() || this.hasOptionalArg()) && (this.argCount <= 0 || this.values.length < this.argCount);
  }

  add(value) {
    if (!this.acceptsArg()) {
      throw new IllegalArgumentException('Cannot add value, list full.');
    }
    this.values.push(value);
  }

  /** Not for client use: always throws. */
  addValue() {
    throw new UnsupportedOperationException('The addValue method is not intended for client use. Subclasses should use the processValue method instead.');
  }

  clearValues() {
    this.values = [];
  }

  /** A copy of this option with its own list of values. */
  clone() {
    const copy = Object.create(Option.prototype);
    Object.assign(copy, this);
    copy.values = [...this.values];
    return copy;
  }

  /** Options are equal when their short and long names are. */
  equals(other) {
    return this === other || (other instanceof Option && this.longOption === other.longOption && this.option === other.option);
  }

  getArgName() {
    return this.argName;
  }

  getArgs() {
    return this.argCount;
  }

  getConverter() {
    return this.converter ?? TypeHandler.getDefault().getConverter(this.type);
  }

  getDeprecated() {
    return this.deprecated;
  }

  getDescription() {
    return this.description;
  }

  /** The first UTF-16 code unit of the key. */
  getId() {
    const key = this.getKey();
    if (key.length === 0) {
      throw new StringIndexOutOfBoundsException('Index 0 out of bounds for length 0');
    }
    return key.charCodeAt(0);
  }

  getKey() {
    return this.option ?? this.longOption;
  }

  getLongOpt() {
    return this.longOption;
  }

  getOpt() {
    return this.option;
  }

  getSince() {
    return this.since;
  }

  getType() {
    return this.type;
  }

  /** getValue(), getValue(index) or getValue(defaultValue). */
  getValue(indexOrDefault) {
    if (typeof indexOrDefault === 'number') {
      if (this.isValuesEmpty()) {
        return null;
      }
      if (indexOrDefault < 0 || indexOrDefault >= this.values.length) {
        throw new IndexOutOfBoundsException(`Index ${indexOrDefault} out of bounds for length ${this.values.length}`);
      }
      return this.values[indexOrDefault];
    }
    const value = this.isValuesEmpty() ? null : this.values[0];
    return arguments.length === 0 ? value : (value ?? indexOrDefault);
  }

  getValues() {
    return this.isValuesEmpty() ? null : [...this.values];
  }

  /** The value separator, '\u0000' when there is none. */
  getValueSeparator() {
    return this.valueSeparator;
  }

  getValuesList() {
    return this.values;
  }

  hasArg() {
    return this.argCount > 0 || this.argCount === Option.UNLIMITED_VALUES;
  }

  hasArgName() {
    return this.argName != null && this.argName.length > 0;
  }

  hasArgs() {
    return this.argCount > 1 || this.argCount === Option.UNLIMITED_VALUES;
  }

  /** Objects.hash(longOption, option). */
  hashCode() {
    const h = (s) => (s == null ? 0 : stringHashCode(s));
    return (Math.imul(31, (31 + h(this.longOption)) | 0) + h(this.option)) | 0;
  }

  hasLongOpt() {
    return this.longOption != null;
  }

  hasOptionalArg() {
    return this.optionalArg;
  }

  hasValueSeparator() {
    return this.valueSeparator.charCodeAt(0) > 0;
  }

  isDeprecated() {
    return this.deprecated != null;
  }

  isRequired() {
    return this.required;
  }

  isValuesEmpty() {
    return this.values.length === 0;
  }

  /** Adds a value, split at the value separator into at most the remaining number of arguments. */
  processValue(value) {
    if (this.argCount === Option.UNINITIALIZED) {
      throw new IllegalStateException('NO_ARGS_ALLOWED');
    }
    let add = requireNonNull(value, 'value');
    if (this.hasValueSeparator()) {
      const sep = this.valueSeparator;
      let index = add.indexOf(sep);
      while (index !== -1) {
        if (this.values.length === this.argCount - 1) {
          break;
        }
        this.add(add.slice(0, index));
        add = add.slice(index + 1);
        index = add.indexOf(sep);
      }
    }
    this.add(add);
  }

  requiresArg() {
    if (this.optionalArg) {
      return false;
    }
    return this.argCount === Option.UNLIMITED_VALUES ? this.values.length === 0 : this.acceptsArg();
  }

  setArgName(argName) {
    this.argName = argName;
  }

  setArgs(num) {
    this.argCount = num;
  }

  setConverter(converter) {
    this.converter = converter;
  }

  setDescription(description) {
    this.description = description;
  }

  setLongOpt(longOpt) {
    this.longOption = longOpt;
  }

  setOptionalArg(optionalArg) {
    this.optionalArg = optionalArg;
  }

  setRequired(required) {
    this.required = required;
  }

  setType(type) {
    this.type = type ?? Types.STRING;
  }

  setValueSeparator(valueSeparator) {
    this.valueSeparator = valueSeparator;
  }

  /** The deprecation notice the default deprecated handler prints. */
  toDeprecatedString() {
    if (!this.isDeprecated()) {
      return '';
    }
    let s = `Option '${javaString(this.option)}'`;
    if (this.longOption != null) {
      s += `'${this.longOption}'`;
    }
    return `${s}: ${this.deprecated}`;
  }

  toString() {
    let s = `[ Option ${javaString(this.option)}`;
    if (this.longOption != null) {
      s += ` ${this.longOption}`;
    }
    if (this.isDeprecated()) {
      s += ` ${this.deprecated}`;
    }
    if (this.hasArgs()) {
      s += '[ARG...]';
    } else if (this.hasArg()) {
      s += ' [ARG]';
    }
    return `${s} :: ${javaString(this.description)} :: ${this.type} ]`;
  }
}
