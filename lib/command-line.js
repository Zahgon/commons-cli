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
 * The result of parsing: the options found, with their values, and the remaining arguments.
 *
 * @module command-line
 */

import { ParseException } from './exceptions.js';
import { requireNonNull } from './java/errors.js';
import { Properties } from './java/properties.js';
import { System } from './java/system.js';
import { JavaArray } from './java/types.js';
import { OptionGroup } from './option-group.js';
import { stripLeadingHyphens } from './util.js';

/** The default deprecated handler: prints the option's deprecation notice to System.out. */
const DEPRECATED_HANDLER = (option) => System.out.println(option.toDeprecatedString());

/** A default value given directly, or computed by a supplier function. */
function resolve(defaultValue) {
  return typeof defaultValue === 'function' ? defaultValue() : (defaultValue ?? null);
}

/** Represents the list of arguments parsed against an Options descriptor. */
export class CommandLine {
  /** Builds a CommandLine. */
  static Builder = class Builder {
    constructor() {
      this.args = [];
      this.options = [];
      this.deprecatedHandler = DEPRECATED_HANDLER;
    }

    addArg(arg) {
      if (arg != null) {
        this.args.push(arg);
      }
      return this;
    }

    addOption(option) {
      if (option != null) {
        this.options.push(option);
      }
      return this;
    }

    build() {
      return this.get();
    }

    get() {
      return new CommandLine(this.args, this.options, this.deprecatedHandler);
    }

    /** Sets the function called with an option whenever a deprecated option is used (null for none). */
    setDeprecatedHandler(deprecatedHandler) {
      this.deprecatedHandler = deprecatedHandler;
      return this;
    }
  };

  /** The handler new CommandLines use by default. */
  static DEPRECATED_HANDLER = DEPRECATED_HANDLER;

  static builder() {
    return new CommandLine.Builder();
  }

  constructor(args = [], options = [], deprecatedHandler = DEPRECATED_HANDLER) {
    this.args = args;
    this.options = options;
    this.deprecatedHandler = deprecatedHandler;
  }

  addArg(arg) {
    if (arg != null) {
      this.args.push(arg);
    }
  }

  addOption(option) {
    if (option != null) {
      this.options.push(option);
    }
  }

  getArgList() {
    return this.args;
  }

  getArgs() {
    return [...this.args];
  }

  /** The number of times an option (given by name, character or Option) was found. */
  getOptionCount(option) {
    const opt = this.toOption(option);
    return this.options.filter((o) => (o == null ? opt == null : o.equals(opt))).length;
  }

  /** Deprecated: the parsed value, or null after printing the conversion failure to System.err. */
  getOptionObject(optionName) {
    try {
      return this.getParsedOptionValue(optionName);
    } catch (e) {
      if (e instanceof ParseException) {
        System.err.println(`Exception found converting ${optionName} to desired type: ${e.getMessage()}`);
        return null;
      }
      throw e;
    }
  }

  /** The values of an option (an Option, or a name) read as key/value pairs; a lone key maps to "true". */
  getOptionProperties(option) {
    if (typeof option === 'string') {
      return this.getOptionPropertiesByName(option);
    }
    const props = new Properties();
    for (const processed of this.options) {
      if (processed.equals(option)) {
        processPropertiesFromValues(props, processed.getValuesList());
      }
    }
    return props;
  }

  /** getOptionProperties for the options whose short or long name is the given name (which must not be null). */
  getOptionPropertiesByName(optionName) {
    const props = new Properties();
    for (const processed of this.options) {
      if (requireNonNull(optionName) === processed.getOpt() || optionName === processed.getLongOpt()) {
        processPropertiesFromValues(props, processed.getValuesList());
      }
    }
    return props;
  }

  getOptions() {
    return [...this.options];
  }

  /** The first value of an option (by name, character, Option or OptionGroup), or the default. */
  getOptionValue(option, defaultValue) {
    const values = this.getOptionValues(option);
    const answer = values == null ? null : values[0];
    if (arguments.length < 2) {
      return answer;
    }
    return answer ?? resolve(defaultValue);
  }

  /** All the values of an option, or null. */
  getOptionValues(option) {
    if (option instanceof OptionGroup) {
      if (!option.isSelected()) {
        return null;
      }
      return this.getOptionValues(option.getSelected());
    }
    const opt = this.toOption(option);
    if (opt == null) {
      return null;
    }
    const values = [];
    for (const processed of this.options) {
      if (processed.equals(opt)) {
        if (opt.isDeprecated()) {
          this.handleDeprecated(opt);
        }
        values.push(...processed.getValuesList());
      }
    }
    return values.length === 0 ? null : values;
  }

  /** The first value converted by the option's converter; conversion failures become ParseExceptions. */
  getParsedOptionValue(option, defaultValue) {
    if (option instanceof OptionGroup) {
      if (!option.isSelected()) {
        return resolve(defaultValue);
      }
      return this.getParsedOptionValue(option.getSelected(), defaultValue);
    }
    const opt = this.toOption(option);
    if (opt == null) {
      return resolve(defaultValue);
    }
    const res = this.getOptionValue(opt);
    try {
      if (res == null) {
        return resolve(defaultValue);
      }
      return opt.getConverter()(res);
    } catch (e) {
      throw ParseException.wrap(e);
    }
  }

  /** All the values converted, as a Java array of the option's type. */
  getParsedOptionValues(option, defaultValue) {
    if (option instanceof OptionGroup) {
      if (!option.isSelected()) {
        return resolve(defaultValue);
      }
      return this.getParsedOptionValues(option.getSelected(), defaultValue);
    }
    const opt = this.toOption(option);
    if (opt == null) {
      return resolve(defaultValue);
    }
    const clazz = opt.getType();
    const values = this.getOptionValues(opt);
    if (values == null) {
      return resolve(defaultValue);
    }
    try {
      return new JavaArray(clazz, values.map((value) => clazz.cast(opt.getConverter()(value))));
    } catch (e) {
      throw ParseException.wrap(e);
    }
  }

  handleDeprecated(option) {
    if (this.deprecatedHandler != null) {
      this.deprecatedHandler(option);
    }
  }

  /** Whether an option (by name, character, Option or OptionGroup) was found. */
  hasOption(option) {
    if (option instanceof OptionGroup) {
      return option.isSelected() && this.hasOption(option.getSelected());
    }
    const opt = this.toOption(option);
    const result = this.options.some((o) => (o == null ? opt == null : o.equals(opt)));
    if (result && opt.isDeprecated()) {
      this.handleDeprecated(opt);
    }
    return result;
  }

  iterator() {
    return this.options[Symbol.iterator]();
  }

  /** An Option as it is, or the first option found whose short or long name is the given name. */
  toOption(option) {
    if (option != null && typeof option === 'object') {
      return option;
    }
    const actual = stripLeadingHyphens(option);
    if (actual == null) {
      return null;
    }
    return this.options.find((opt) => actual === opt.getOpt() || actual === opt.getLongOpt()) ?? null;
  }
}

function processPropertiesFromValues(props, values) {
  for (let i = 0; i < values.length; i += 2) {
    props.put(values[i], i + 1 < values.length ? values[i + 1] : 'true');
  }
}
