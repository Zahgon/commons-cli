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
 * The deprecated static option builder: the settings accumulate in shared state until create() makes an option and
 * resets them.
 *
 * @deprecated use Option.builder
 * @module option-builder
 */

import { IllegalStateException } from './java/errors.js';
import { Types } from './java/types.js';
import { Option } from './option.js';
import { TypeHandler } from './type-handler.js';

const state = {};

/** Sets the static settings back to their defaults, as every create does. */
function reset() {
  state.description = null;
  state.argName = null;
  state.longOption = null;
  state.type = Types.STRING;
  state.required = false;
  state.argCount = Option.UNINITIALIZED;
  state.optionalArg = false;
  state.valueSeparator = '\u0000';
}

reset();

/** OptionBuilder's static methods; each returns the builder itself. */
export const OptionBuilder = {
  /** create(): an option with only a long name; create(opt) for a short name too. */
  create(opt) {
    if (arguments.length === 0) {
      if (state.longOption == null) {
        reset();
        throw new IllegalStateException('longopt missing');
      }
      return OptionBuilder.create(null);
    }
    try {
      const option = new Option(opt, state.description);
      option.setLongOpt(state.longOption);
      option.setRequired(state.required);
      option.setOptionalArg(state.optionalArg);
      option.setArgs(state.argCount);
      option.setType(state.type);
      option.setConverter(TypeHandler.getDefault().getConverter(state.type));
      option.setValueSeparator(state.valueSeparator);
      option.setArgName(state.argName);
      return option;
    } finally {
      reset();
    }
  },

  hasArg(hasArg = true) {
    state.argCount = hasArg ? 1 : Option.UNINITIALIZED;
    return OptionBuilder;
  },

  /** hasArgs(): any number of values; hasArgs(num): num values. */
  hasArgs(num = Option.UNLIMITED_VALUES) {
    state.argCount = num;
    return OptionBuilder;
  },

  hasOptionalArg() {
    state.argCount = 1;
    state.optionalArg = true;
    return OptionBuilder;
  },

  hasOptionalArgs(numArgs = Option.UNLIMITED_VALUES) {
    state.argCount = numArgs;
    state.optionalArg = true;
    return OptionBuilder;
  },

  isRequired(required = true) {
    state.required = required;
    return OptionBuilder;
  },

  withArgName(name) {
    state.argName = name;
    return OptionBuilder;
  },

  withDescription(description) {
    state.description = description;
    return OptionBuilder;
  },

  withLongOpt(longOpt) {
    state.longOption = longOpt;
    return OptionBuilder;
  },

  withType(type) {
    state.type = type;
    return OptionBuilder;
  },

  withValueSeparator(sep = '=') {
    state.valueSeparator = sep;
    return OptionBuilder;
  }
};
