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
 * One request of the commons-cli command: the specs it builds, the calls it makes and the response it gives.
 *
 * The command reads standard input as UTF-8 and treats every non-empty line (split at "\n") as one request, a JSON
 * object; it writes one response line per request, in order. Responses are JSON objects written in ASCII: strings
 * escape '"', '\' and U+0008, U+0009, U+000A, U+000C, U+000D in their short forms and every other code unit below
 * U+0020 or from U+007F on as a backslash-u escape with four lower-case hex digits. The exit status is 0 when no error
 * was reported, at the top level or inline, and 1 when one was; any command-line argument prints the usage text on
 * standard error and exits with 2.
 *
 * A request names its operation in "op":
 *   parse          a parser ("parser": DefaultParser, PosixParser, GnuParser or BasicParser; "allowPartialMatching" or
 *                  "builder" for a DefaultParser), the "options" (OPTIONS) and the "parses": each with "args",
 *                  "properties" ([[key, value]...]), "stopAtNonOption", "nonOptionAction" and CommandLine "queries";
 *   commandLine    CommandLine.builder() calls ("builder"), then "queries";
 *   option, options, group, pattern, convert, helpFormatter, help, optionFormatter, textHelp, textStyle
 *                  one object (or the static API) and its "calls".
 * Specs: OPTION is {"new": [...]}, {"builder": [CALL...], "of", "terminal"}, {"optionBuilder": [CALL...], "create"} or
 * {"ref": ID}, optionally with "then" setter calls and an "id"; GROUP is {"id", "calls"} or {"ref"}; OPTIONS is an
 * array of Options calls or {"pattern": S}. A CALL is [SIGNATURE, ARG...] with the Java method's name and parameter
 * types (for example ["getOptionValue(String,Supplier)", "f", {"supplies": "x"}]); PrintWriter parameters take no
 * argument and the call's result is what was printed to them. Arguments are JSON values by Java parameter type:
 * strings, integral numbers, booleans, one-code-unit strings for char, class names for Class, named converters,
 * comparators and functions, {"$type": NAME, "value": S} for boxed Java values, STYLE and TABLE objects.
 *
 * Results: null for void and builder methods; booleans, integers and strings as they are; options as
 * {"opt","longOpt","argName","description","args","optionalArg","required","type","valueSeparator","since",
 * "deprecated","values","string"} (CommandLine options as {"opt","longOpt","values"}); groups as
 * {"names","required","selected","string"}; Java objects as {"class", "string"} or {"class", "items"} for arrays.
 * A call that throws gives {"error": ERR}; ERR is {"name": Java binary class name, "message": message or null} plus
 * "option", "matchingOptions", "group" or "missingOptions" for the parse exceptions. Requests that break the grammar
 * give a top-level {"error": {"name": "RequestError", "message": ...}} ("malformed JSON", "request must be an object",
 * "unknown op: ...", "unknown method: SIG", "bad arguments: SIG", "bad member: NAME", "bad ref: ID", "bad value"), as
 * do library exceptions thrown while specs are built. Text the library writes to System.out or System.err during a
 * request is reported in "stdout" and "stderr" (each unpaired surrogate as "?").
 *
 * The protocol is that of the reference command (Commons CLI for Java behind the same front end), which this module
 * reproduces member by member.
 *
 * @module cli/request
 */

import { CommandLine } from '../command-line.js';
import { Converter } from '../converter.js';
import { DefaultParser, NonOptionAction } from '../default-parser.js';
import { DeprecatedAttributes } from '../deprecated-attributes.js';
import {
  AlreadySelectedException,
  AmbiguousOptionException,
  MissingArgumentException,
  MissingOptionException,
  UnrecognizedOptionException
} from '../exceptions.js';
import { HelpFormatter } from '../help-formatter.js';
import { DEFAULT_COMPARATOR, HelpFormatter as NewHelpFormatter } from '../help/help-formatter.js';
import { OptionFormatter } from '../help/option-formatter.js';
import { TableDefinition } from '../help/table-definition.js';
import { TextHelpAppendable } from '../help/text-help-appendable.js';
import { Alignment, TextStyle } from '../help/text-style.js';
import { JavaBigDecimal, JavaBigInteger } from '../java/big-numbers.js';
import { format } from '../java/formatter.js';
import { javaMessageOf, javaNameOf, NumberFormatException } from '../java/errors.js';
import {
  JavaByte,
  JavaCharacter,
  JavaDouble,
  JavaFloat,
  JavaInteger,
  JavaLong,
  JavaShort,
  doubleToString,
  parseByte,
  parseDouble,
  parseFloat,
  parseInt,
  parseLong,
  parseShort
} from '../java/primitives.js';
import { Properties } from '../java/properties.js';
import { equalsIgnoreCase } from '../java/string.js';
import { PrintWriter, StringBuilder, StringWriter } from '../java/system.js';
import { classOf, JavaArray, javaString, Types } from '../java/types.js';
import { Option } from '../option.js';
import { OptionBuilder } from '../option-builder.js';
import { OptionGroup } from '../option-group.js';
import { Options } from '../options.js';
import { BasicParser, GnuParser } from '../parser.js';
import { PatternOptionBuilder } from '../pattern-option-builder.js';
import { PosixParser } from '../posix-parser.js';
import { TypeHandler } from '../type-handler.js';
import { toJson } from './json.js';

/** The front end's own errors. */
export class RequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestError';
  }
}

/** A library error thrown while a spec was built: it makes the whole request an error response. */
class SpecError extends Error {
  constructor(cause) {
    super('spec', { cause });
  }
}

const has = (m, k) => Object.hasOwn(m, k);

/** JSON text of a request value as the reference echoes it: numbers as Java's Double.toString writes them. */
function echo(value) {
  if (typeof value === 'number') {
    return doubleToString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(echo).join(',')}]`;
  }
  if (isMap(value)) {
    return `{${Object.entries(value).map(([k, v]) => `${toJson(k)}:${echo(v)}`).join(',')}}`;
  }
  return toJson(value);
}
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => typeof v === 'number' && v === Math.trunc(v) && v >= -2147483648 && v <= 2147483647;

function map(v, member) {
  if (!isMap(v)) {
    throw new RequestError(`bad member: ${member}`);
  }
  return v;
}

function list(v, member) {
  if (!Array.isArray(v)) {
    throw new RequestError(`bad member: ${member}`);
  }
  return v;
}

function str(v, member) {
  if (v !== null && typeof v !== 'string') {
    throw new RequestError(`bad member: ${member}`);
  }
  return v;
}

function bool(v, member) {
  if (typeof v !== 'boolean') {
    throw new RequestError(`bad member: ${member}`);
  }
  return v;
}

function intValue(v, err) {
  if (!isInt(v)) {
    throw new RequestError(err);
  }
  return v | 0;
}

const TYPES = new Map([
  ['java.lang.String', Types.STRING], ['java.lang.Object', Types.OBJECT], ['java.lang.Number', Types.NUMBER],
  ['java.lang.Class', Types.CLASS], ['java.lang.CharSequence', Types.CHAR_SEQUENCE],
  ['java.lang.StringBuilder', Types.STRING_BUILDER], ['java.lang.Boolean', Types.BOOLEAN],
  ['java.lang.Character', Types.CHARACTER], ['java.lang.Byte', Types.BYTE], ['java.lang.Short', Types.SHORT],
  ['java.lang.Integer', Types.INTEGER], ['java.lang.Long', Types.LONG], ['java.lang.Float', Types.FLOAT],
  ['java.lang.Double', Types.DOUBLE], ['java.math.BigInteger', Types.BIG_INTEGER], ['java.math.BigDecimal', Types.BIG_DECIMAL],
  ['java.util.Date', Types.DATE], ['java.io.File', Types.FILE], ['[Ljava.io.File;', Types.FILE_ARRAY],
  ['java.io.FileInputStream', Types.FILE_INPUT_STREAM], ['java.nio.file.Path', Types.PATH], ['java.net.URL', Types.URL]
]);

const CONVERTERS = new Map(['DEFAULT', 'NUMBER', 'FILE', 'PATH', 'URL', 'DATE', 'CLASS', 'OBJECT'].map((n) => [n, Converter[n]]));

const DEPRECATED_FORMATS = new Map([
  ['SIMPLE_DEPRECATED_FORMAT', OptionFormatter.SIMPLE_DEPRECATED_FORMAT],
  ['COMPLEX_DEPRECATED_FORMAT', OptionFormatter.COMPLEX_DEPRECATED_FORMAT],
  ['NO_DEPRECATED_FORMAT', OptionFormatter.NO_DEPRECATED_FORMAT],
  ['DESCRIPTION_AND_ATTRIBUTES', (o) => format('%s [%s]', HelpFormatter.getDescription(o), o.getDeprecated())]
]);

/** The CommandLine query overloads: name -> the second parameter types it takes ('' for none). */
const QUERY_OVERLOADS = new Map([
  ['hasOption', ['']], ['getOptionValue', ['', 'String', 'Supplier']], ['getOptionValues', ['']], ['getOptionCount', ['']],
  ['getOptionObject', ['']], ['getOptionProperties', ['']], ['getParsedOptionValue', ['', 'Object', 'Supplier']],
  ['getParsedOptionValues', ['', 'Object[]', 'Supplier']]
]);

function selectorAllowed(name, type) {
  switch (name) {
    case 'getOptionCount':
      return type !== 'OptionGroup';
    case 'getOptionObject':
      return type === 'char' || type === 'String';
    case 'getOptionProperties':
      return type === 'String' || type === 'Option';
    default:
      return true;
  }
}

/** One CALL: a signature and its arguments, with typed accessors. */
class Call {
  constructor(raw) {
    const l = list(raw, 'call');
    if (l.length === 0 || typeof l[0] !== 'string') {
      throw new RequestError('bad member: call');
    }
    this.sig = l[0];
    this.args = l.slice(1);
  }

  unknown() {
    return new RequestError(`unknown method: ${this.sig}`);
  }

  badArgs() {
    return new RequestError(`bad arguments: ${this.sig}`);
  }

  get err() {
    return `bad arguments: ${this.sig}`;
  }

  arity(n) {
    if (this.args.length !== n) {
      throw this.badArgs();
    }
  }

  arg(i) {
    return this.args[i];
  }

  s(i) {
    const v = this.args[i];
    if (v !== null && typeof v !== 'string') {
      throw this.badArgs();
    }
    return v;
  }

  i(i) {
    return intValue(this.args[i], this.err);
  }

  d(i) {
    if (typeof this.args[i] !== 'number') {
      throw this.badArgs();
    }
    return this.args[i];
  }

  b(i) {
    if (typeof this.args[i] !== 'boolean') {
      throw this.badArgs();
    }
    return this.args[i];
  }

  c(i) {
    const v = this.args[i];
    if (typeof v !== 'string' || v.length !== 1) {
      throw this.badArgs();
    }
    return v;
  }

  strs(i) {
    const v = this.args[i];
    if (!Array.isArray(v) || v.some((o) => o !== null && typeof o !== 'string')) {
      throw this.badArgs();
    }
    return [...v];
  }

  listArg(i) {
    if (!Array.isArray(this.args[i])) {
      throw this.badArgs();
    }
    return this.args[i];
  }
}

/** Handles one request; failed records whether any error was reported. */
export class Request {
  constructor() {
    this.refs = new Map();
    this.failed = false;
    this.handled = null;
  }

  calls(raw, member) {
    return list(raw, member).map((o) => new Call(o));
  }

  member(req, name) {
    return has(req, name) ? this.calls(req[name], name) : [];
  }

  // ---------------------------------------------------- named values

  type(v, err) {
    if (v === null) {
      return null;
    }
    if (typeof v !== 'string' || !TYPES.has(v)) {
      throw new RequestError(err);
    }
    return TYPES.get(v);
  }

  converter(v, err) {
    if (v === null) {
      return null;
    }
    if (isMap(v)) {
      if (!has(v, 'type') || v.type === null) {
        throw new RequestError(err);
      }
      return TypeHandler.getDefault().getConverter(this.type(v.type, err));
    }
    if (typeof v !== 'string' || !CONVERTERS.has(v)) {
      throw new RequestError(err);
    }
    return CONVERTERS.get(v);
  }

  deprecated(v, err) {
    if (v === null) {
      return null;
    }
    if (!isMap(v)) {
      throw new RequestError(err);
    }
    const d = v.description ?? null;
    const s = v.since ?? null;
    if ((d !== null && typeof d !== 'string') || (has(v, 'forRemoval') && typeof v.forRemoval !== 'boolean')
        || (s !== null && typeof s !== 'string')) {
      throw new RequestError(err);
    }
    const b = DeprecatedAttributes.builder();
    if (has(v, 'description')) {
      b.setDescription(d);
    }
    if (has(v, 'forRemoval')) {
      b.setForRemoval(v.forRemoval);
    }
    if (has(v, 'since')) {
      b.setSince(s);
    }
    return b.get();
  }

  handler(v, err) {
    if (v === null) {
      return null;
    }
    if (v === 'default') {
      return CommandLine.DEPRECATED_HANDLER;
    }
    if (v === 'collect') {
      if (this.handled === null) {
        this.handled = [];
      }
      const sink = this.handled;
      return (o) => sink.push(o.getKey());
    }
    throw new RequestError(err);
  }

  comparator(v, err) {
    if (v === null) {
      return null;
    }
    if (v === 'DEFAULT') {
      return DEFAULT_COMPARATOR;
    }
    if (v === 'REVERSED') {
      return (a, b) => DEFAULT_COMPARATOR(b, a);
    }
    if (v === 'NONE') {
      return () => 0;
    }
    throw new RequestError(err);
  }

  deprecatedFormat(v, err) {
    if (v === null) {
      return null;
    }
    if (typeof v !== 'string' || !DEPRECATED_FORMATS.has(v)) {
      throw new RequestError(err);
    }
    return DEPRECATED_FORMATS.get(v);
  }

  syntaxFormat(v, err) {
    if (v === null) {
      return null;
    }
    if (v === 'BOTH_OPT') {
      return (f, required) => (required ? '' : '?') + f.getBothOpt() + f.getArgName();
    }
    throw new RequestError(err);
  }

  /** An OBJECT: a Java value. */
  object(v, err) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') {
      return v;
    }
    if (typeof v === 'number') {
      if (v === Math.trunc(v) && v >= -2147483648 && v <= 2147483647) {
        return new JavaInteger(v | 0);
      }
      if (v === Math.trunc(v) && v >= -(2 ** 63) && v < 2 ** 63) {
        return new JavaLong(BigInt(v));
      }
      return new JavaDouble(v);
    }
    if (!isMap(v) || typeof v.$type !== 'string' || typeof v.value !== 'string') {
      throw new RequestError(err);
    }
    const value = v.value;
    try {
      switch (v.$type) {
        case 'java.lang.String':
          return value;
        case 'java.lang.Boolean':
          return equalsIgnoreCase('true', value);
        case 'java.lang.Character':
          if (value.length !== 1) {
            throw new RequestError('bad value');
          }
          return new JavaCharacter(value.charCodeAt(0));
        case 'java.lang.Byte':
          return new JavaByte(parseByte(value));
        case 'java.lang.Short':
          return new JavaShort(parseShort(value));
        case 'java.lang.Integer':
          return new JavaInteger(parseInt(value));
        case 'java.lang.Long':
          return new JavaLong(parseLong(value));
        case 'java.lang.Float':
          return new JavaFloat(parseFloat(value));
        case 'java.lang.Double':
          return new JavaDouble(parseDouble(value));
        case 'java.math.BigInteger':
          return JavaBigInteger.parse(value);
        case 'java.math.BigDecimal':
          return JavaBigDecimal.parse(value);
        default:
          throw new RequestError(err);
      }
    } catch (e) {
      if (e instanceof NumberFormatException) {
        throw new RequestError('bad value');
      }
      throw e;
    }
  }

  objects(v, err) {
    if (v === null) {
      return null;
    }
    if (!Array.isArray(v)) {
      throw new RequestError(err);
    }
    return v.map((o) => this.object(o, err));
  }

  /** A Supplier argument: null or {"supplies": V}. */
  supplier(v, err, convert) {
    if (v === null) {
      return null;
    }
    if (!isMap(v) || !has(v, 'supplies')) {
      throw new RequestError(err);
    }
    const value = convert(v.supplies);
    return () => value;
  }

  styleBuilder(v, err) {
    if (!isMap(v)) {
      throw new RequestError(err);
    }
    const b = TextStyle.builder();
    if (has(v, 'textStyle')) {
      b.setTextStyle(this.styleBuilder(v.textStyle, err).get());
    }
    if (has(v, 'alignment')) {
      const a = v.alignment;
      if (a !== null && !Object.hasOwn(Alignment, a)) {
        throw new RequestError(err);
      }
      b.setAlignment(a === null ? null : Alignment[a]);
    }
    if (has(v, 'leftPad')) {
      b.setLeftPad(intValue(v.leftPad, err));
    }
    if (has(v, 'indent')) {
      b.setIndent(intValue(v.indent, err));
    }
    if (has(v, 'scalable')) {
      if (typeof v.scalable !== 'boolean') {
        throw new RequestError(err);
      }
      b.setScalable(v.scalable);
    }
    if (has(v, 'minWidth')) {
      b.setMinWidth(intValue(v.minWidth, err));
    }
    if (has(v, 'maxWidth')) {
      b.setMaxWidth(intValue(v.maxWidth, err));
    }
    return b;
  }

  styles(v, err) {
    if (!Array.isArray(v)) {
      throw new RequestError(err);
    }
    return v.map((o) => this.styleBuilder(o, err).get());
  }

  stringItems(v, err) {
    if (!Array.isArray(v) || v.some((o) => o !== null && typeof o !== 'string')) {
      throw new RequestError(err);
    }
    return [...v];
  }

  table(v, err) {
    if (!isMap(v)) {
      throw new RequestError(err);
    }
    const caption = v.caption ?? null;
    if (caption !== null && typeof caption !== 'string') {
      throw new RequestError(err);
    }
    const styles = this.styles(v.styles, err);
    const headers = this.stringItems(v.headers, err);
    if (!Array.isArray(v.rows)) {
      throw new RequestError(err);
    }
    const rows = v.rows.map((r) => this.stringItems(r, err));
    return TableDefinition.from(caption, styles, headers, rows);
  }

  appendable(v, out, err) {
    if (!isMap(v)) {
      throw new RequestError(err);
    }
    const maxWidth = has(v, 'maxWidth') ? intValue(v.maxWidth, err) : null;
    const leftPad = has(v, 'leftPad') ? intValue(v.leftPad, err) : null;
    const indent = has(v, 'indent') ? intValue(v.indent, err) : null;
    const a = new TextHelpAppendable(out);
    if (maxWidth !== null) {
      a.setMaxWidth(maxWidth);
    }
    if (leftPad !== null) {
      a.setLeftPad(leftPad);
    }
    if (indent !== null) {
      a.setIndent(indent);
    }
    return a;
  }

  // ---------------------------------------------------- specs

  /** Runs a library step of a spec: its exceptions make the request an error response. */
  spec(step) {
    try {
      return step();
    } catch (e) {
      if (e instanceof RequestError || e instanceof SpecError) {
        throw e;
      }
      throw new SpecError(e);
    }
  }

  register(m, built) {
    if (has(m, 'id')) {
      if (typeof m.id !== 'string') {
        throw new RequestError('bad member: id');
      }
      this.refs.set(m.id, built);
    }
  }

  ref(m, Kind) {
    const id = m.ref;
    const r = typeof id === 'string' ? this.refs.get(id) : undefined;
    if (!(r instanceof Kind)) {
      throw new RequestError(`bad ref: ${typeof id === 'string' ? id : echo(id ?? null)}`);
    }
    return r;
  }

  option(v) {
    if (v === null) {
      return null;
    }
    const m = map(v, 'option');
    if (has(m, 'ref')) {
      return this.ref(m, Option);
    }
    let option;
    if (has(m, 'new')) {
      const a = list(m.new, 'new');
      if (a.length === 2) {
        const args = [str(a[0], 'new'), str(a[1], 'new')];
        option = this.spec(() => new Option(...args));
      } else if (a.length === 3) {
        const args = [str(a[0], 'new'), bool(a[1], 'new'), str(a[2], 'new')];
        option = this.spec(() => new Option(...args));
      } else if (a.length === 4) {
        const args = [str(a[0], 'new'), str(a[1], 'new'), bool(a[2], 'new'), str(a[3], 'new')];
        option = this.spec(() => new Option(...args));
      } else {
        throw new RequestError('bad member: new');
      }
    } else if (has(m, 'builder')) {
      const calls = this.calls(m.builder, 'builder');
      const of = has(m, 'of') ? str(m.of, 'of') : undefined;
      const b = this.spec(() => (of === undefined ? Option.builder() : Option.builder(of)));
      for (const c of calls) {
        this.builderCall(b, c);
      }
      const terminal = has(m, 'terminal') ? m.terminal : 'get';
      if (terminal === 'get') {
        option = this.spec(() => b.get());
      } else if (terminal === 'build') {
        option = this.spec(() => b.build());
      } else {
        throw new RequestError('bad member: terminal');
      }
    } else if (has(m, 'optionBuilder')) {
      option = this.optionBuilder(m);
    } else {
      throw new RequestError('bad member: option');
    }
    if (has(m, 'then')) {
      for (const c of this.calls(m.then, 'then')) {
        if (!this.setter(option, c)) {
          throw c.unknown();
        }
      }
    }
    this.register(m, option);
    return option;
  }

  builderCall(b, c) {
    const one = (f) => {
      c.arity(1);
      const v = f();
      this.spec(() => b[c.sig.slice(0, c.sig.indexOf('('))](v));
    };
    const none = () => {
      c.arity(0);
      this.spec(() => b[c.sig.slice(0, c.sig.indexOf('('))]());
    };
    switch (c.sig) {
      case 'argName(String)':
      case 'desc(String)':
      case 'longOpt(String)':
      case 'option(String)':
      case 'since(String)':
        return one(() => c.s(0));
      case 'converter(Converter)':
        return one(() => this.converter(c.arg(0), c.err));
      case 'deprecated()':
      case 'hasArg()':
      case 'hasArgs()':
      case 'required()':
      case 'valueSeparator()':
        return none();
      case 'deprecated(DeprecatedAttributes)':
        return one(() => this.deprecated(c.arg(0), c.err));
      case 'hasArg(boolean)':
      case 'optionalArg(boolean)':
      case 'required(boolean)':
        return one(() => c.b(0));
      case 'numberOfArgs(int)':
        return one(() => c.i(0));
      case 'type(Class)':
        return one(() => this.type(c.arg(0), c.err));
      case 'valueSeparator(char)':
        return one(() => c.c(0));
      default:
        throw c.unknown();
    }
  }

  optionBuilder(m) {
    const calls = this.calls(m.optionBuilder, 'optionBuilder');
    const steps = calls.map((c) => {
      const name = c.sig.slice(0, c.sig.indexOf('('));
      switch (c.sig) {
        case 'hasArg()':
        case 'hasArgs()':
        case 'hasOptionalArg()':
        case 'hasOptionalArgs()':
        case 'isRequired()':
        case 'withValueSeparator()':
          c.arity(0);
          return () => OptionBuilder[name]();
        case 'hasArg(boolean)':
        case 'isRequired(boolean)': {
          c.arity(1);
          const v = c.b(0);
          return () => OptionBuilder[name](v);
        }
        case 'hasArgs(int)':
        case 'hasOptionalArgs(int)': {
          c.arity(1);
          const v = c.i(0);
          return () => OptionBuilder[name](v);
        }
        case 'withArgName(String)':
        case 'withDescription(String)':
        case 'withLongOpt(String)': {
          c.arity(1);
          const v = c.s(0);
          return () => OptionBuilder[name](v);
        }
        case 'withType(Class)': {
          c.arity(1);
          const v = this.type(c.arg(0), c.err);
          return () => OptionBuilder.withType(v);
        }
        case 'withValueSeparator(char)': {
          c.arity(1);
          const v = c.c(0);
          return () => OptionBuilder.withValueSeparator(v);
        }
        default:
          throw c.unknown();
      }
    });
    const create = m.create;
    if (has(m, 'create') && create !== null && typeof create !== 'string') {
      const ch = map(create, 'create').char;
      if (typeof ch !== 'string' || ch.length !== 1) {
        throw new RequestError('bad member: create');
      }
    }
    steps.forEach((step) => step());
    if (!has(m, 'create')) {
      return this.spec(() => OptionBuilder.create());
    }
    const opt = create === null || typeof create === 'string' ? create : create.char;
    return this.spec(() => OptionBuilder.create(opt));
  }

  setter(o, c) {
    const set = (v) => o[c.sig.slice(0, c.sig.indexOf('('))](v);
    switch (c.sig) {
      case 'setArgName(String)':
      case 'setDescription(String)':
      case 'setLongOpt(String)':
        c.arity(1);
        set(c.s(0));
        return true;
      case 'setArgs(int)':
        c.arity(1);
        set(c.i(0));
        return true;
      case 'setConverter(Converter)':
        c.arity(1);
        set(this.converter(c.arg(0), c.err));
        return true;
      case 'setOptionalArg(boolean)':
      case 'setRequired(boolean)':
        c.arity(1);
        set(c.b(0));
        return true;
      case 'setType(Class)':
        c.arity(1);
        set(this.type(c.arg(0), c.err));
        return true;
      case 'setValueSeparator(char)':
        c.arity(1);
        set(c.c(0));
        return true;
      default:
        return false;
    }
  }

  group(v) {
    if (v === null) {
      return null;
    }
    const m = map(v, 'group');
    if (has(m, 'ref')) {
      return this.ref(m, OptionGroup);
    }
    const g = new OptionGroup();
    if (has(m, 'calls')) {
      for (const c of this.calls(m.calls, 'calls')) {
        this.groupMutator(g, c);
      }
    }
    this.register(m, g);
    return g;
  }

  groupMutator(g, c) {
    switch (c.sig) {
      case 'addOption(Option)': {
        c.arity(1);
        const o = this.option(c.arg(0));
        this.spec(() => g.addOption(o));
        return;
      }
      case 'setRequired(boolean)':
        c.arity(1);
        g.setRequired(c.b(0));
        return;
      case 'setSelected(Option)': {
        c.arity(1);
        const o = this.option(c.arg(0));
        this.spec(() => g.setSelected(o));
        return;
      }
      default:
        throw c.unknown();
    }
  }

  options(v) {
    if (isMap(v)) {
      if (!has(v, 'pattern')) {
        throw new RequestError('bad member: options');
      }
      const pattern = str(v.pattern, 'pattern');
      return this.spec(() => PatternOptionBuilder.parsePattern(pattern));
    }
    const options = new Options();
    for (const c of this.calls(v, 'options')) {
      if (!this.optionsMutator(options, c, (step) => this.spec(step))) {
        throw c.unknown();
      }
    }
    return options;
  }

  /** The Options mutators; run executes the library call (as a spec step or a guarded call). */
  optionsMutator(options, c, run) {
    switch (c.sig) {
      case 'addOption(Option)': {
        c.arity(1);
        const o = this.option(c.arg(0));
        run(() => options.addOption(o));
        return true;
      }
      case 'addOption(String,String)': {
        c.arity(2);
        const [a, b] = [c.s(0), c.s(1)];
        run(() => options.addOption(a, b));
        return true;
      }
      case 'addOption(String,boolean,String)': {
        c.arity(3);
        const [a, b, d] = [c.s(0), c.b(1), c.s(2)];
        run(() => options.addOption(a, b, d));
        return true;
      }
      case 'addOption(String,String,boolean,String)':
      case 'addRequiredOption(String,String,boolean,String)': {
        c.arity(4);
        const [a, l, b, d] = [c.s(0), c.s(1), c.b(2), c.s(3)];
        const required = c.sig.startsWith('addRequired');
        run(() => (required ? options.addRequiredOption(a, l, b, d) : options.addOption(a, l, b, d)));
        return true;
      }
      case 'addOptionGroup(OptionGroup)': {
        c.arity(1);
        const g = this.group(c.arg(0));
        run(() => options.addOptionGroup(g));
        return true;
      }
      case 'addOptions(Options)': {
        c.arity(1);
        const other = this.options(c.arg(0));
        run(() => options.addOptions(other));
        return true;
      }
      default:
        return false;
    }
  }

  optionList(v, c) {
    if (!Array.isArray(v)) {
      throw c.badArgs();
    }
    return v.map((o) => this.option(o));
  }

  // ---------------------------------------------------- views

  optView(o) {
    if (o == null) {
      return null;
    }
    return {
      opt: o.getOpt(),
      longOpt: o.getLongOpt(),
      argName: o.getArgName(),
      description: o.getDescription(),
      args: o.getArgs(),
      optionalArg: o.hasOptionalArg(),
      required: o.isRequired(),
      type: javaString(o.getType()),
      valueSeparator: o.getValueSeparator(),
      since: o.getSince(),
      deprecated: this.depView(o.getDeprecated()),
      values: [...o.getValuesList()],
      string: o.toString()
    };
  }

  optViews(options) {
    return [...options].map((o) => this.optView(o));
  }

  compact(o) {
    return { opt: o.getOpt(), longOpt: o.getLongOpt(), values: [...o.getValuesList()] };
  }

  depView(d) {
    if (d == null) {
      return null;
    }
    return { description: d.getDescription(), since: d.getSince(), forRemoval: d.isForRemoval(), string: d.toString() };
  }

  groupView(g) {
    if (g == null) {
      return null;
    }
    return { names: g.getNames(), required: g.isRequired(), selected: g.getSelected(), string: g.toString() };
  }

  requiredView(required) {
    if (required == null) {
      return null;
    }
    return required.map((o) => (o instanceof OptionGroup ? this.groupView(o) : o));
  }

  obj(o) {
    if (o == null) {
      return null;
    }
    if (o instanceof JavaArray) {
      return { class: o.getClass().getName(), items: o.items.map((i) => this.obj(i)) };
    }
    return { class: classOf(o).getName(), string: javaString(o) };
  }

  stringList(a) {
    return a == null ? null : [...a];
  }

  optionsView(options) {
    return {
      options: this.optViews(options.getOptions()),
      required: this.requiredView(options.getRequiredOptions()),
      string: options.toString()
    };
  }

  formatterView(f) {
    return {
      opt: f.getOpt(),
      longOpt: f.getLongOpt(),
      bothOpt: f.getBothOpt(),
      argName: f.getArgName(),
      description: f.getDescription(),
      since: f.getSince(),
      required: f.isRequired(),
      syntax: f.toSyntaxOption()
    };
  }

  tableView(t) {
    return {
      caption: t.caption(),
      styles: t.columnTextStyles().map((s) => s.toString()),
      headers: [...t.headers()],
      rows: [...t.rows()].map((r) => [...r])
    };
  }

  errView(e) {
    const m = { name: e instanceof RequestError ? 'RequestError' : javaNameOf(e), message: e instanceof RequestError ? e.message : javaMessageOf(e) };
    if (e instanceof AmbiguousOptionException) {
      m.option = e.getOption();
      m.matchingOptions = [...e.getMatchingOptions()];
    } else if (e instanceof UnrecognizedOptionException) {
      m.option = e.getOption();
    } else if (e instanceof MissingArgumentException) {
      m.option = e.getOption() == null ? null : e.getOption().getKey();
    } else if (e instanceof AlreadySelectedException) {
      m.option = e.getOption() == null ? null : e.getOption().getKey();
      m.group = this.groupView(e.getOptionGroup());
    } else if (e instanceof MissingOptionException) {
      m.missingOptions = this.requiredView(e.getMissingOptions());
    }
    return m;
  }

  error(e) {
    this.failed = true;
    return { error: this.errView(e instanceof SpecError ? e.cause : e) };
  }

  /** Runs one library call; its exception becomes the call's {"error": ERR} result. */
  guarded(body) {
    try {
      return body();
    } catch (e) {
      if (e instanceof RequestError) {
        throw e;
      }
      return this.error(e);
    }
  }

  /** Runs a call that returns nothing: its result is null, or its error. */
  run(body) {
    return this.guarded(() => {
      body();
      return null;
    });
  }

  // ---------------------------------------------------- operations

  handle(req) {
    if (!has(req, 'op') || typeof req.op !== 'string') {
      throw new RequestError(`unknown op: ${has(req, 'op') ? echo(req.op) : 'undefined'}`);
    }
    const ops = {
      parse: () => this.parseOp(req),
      commandLine: () => this.commandLineOp(req),
      option: () => this.optionOp(req),
      options: () => this.optionsOp(req),
      group: () => this.groupOp(req),
      pattern: () => this.patternOp(req),
      convert: () => this.convertOp(req),
      helpFormatter: () => this.helpFormatterOp(req),
      help: () => this.helpOp(req),
      optionFormatter: () => this.optionFormatterOp(req),
      textHelp: () => this.textHelpOp(req),
      textStyle: () => this.textStyleOp(req)
    };
    if (!Object.hasOwn(ops, req.op)) {
      throw new RequestError(`unknown op: ${echo(req.op)}`);
    }
    return ops[req.op]();
  }

  results(out) {
    return { results: out };
  }

  // ---- parse

  parseOp(req) {
    const kind = has(req, 'parser') ? req.parser : 'DefaultParser';
    let parser;
    if (kind === 'DefaultParser') {
      if (has(req, 'builder')) {
        const b = map(req.builder, 'builder');
        const builder = DefaultParser.builder();
        if (has(b, 'allowPartialMatching')) {
          builder.setAllowPartialMatching(bool(b.allowPartialMatching, 'allowPartialMatching'));
        }
        if (has(b, 'stripLeadingAndTrailingQuotes')) {
          const s = b.stripLeadingAndTrailingQuotes;
          if (s !== null && typeof s !== 'boolean') {
            throw new RequestError('bad member: stripLeadingAndTrailingQuotes');
          }
          builder.setStripLeadingAndTrailingQuotes(s);
        }
        if (has(b, 'deprecatedHandler')) {
          builder.setDeprecatedHandler(this.handler(b.deprecatedHandler, 'bad member: deprecatedHandler'));
        }
        parser = builder.get();
      } else if (has(req, 'allowPartialMatching')) {
        parser = new DefaultParser(bool(req.allowPartialMatching, 'allowPartialMatching'));
      } else {
        parser = new DefaultParser();
      }
    } else if (kind === 'PosixParser') {
      parser = new PosixParser();
    } else if (kind === 'GnuParser') {
      parser = new GnuParser();
    } else if (kind === 'BasicParser') {
      parser = new BasicParser();
    } else {
      throw new RequestError('bad member: parser');
    }
    const options = this.options(has(req, 'options') ? req.options : []);
    const out = list(has(req, 'parses') ? req.parses : [], 'parses').map((p) => this.parseCall(parser, options, map(p, 'parses')));
    return this.results(out);
  }

  parseCall(parser, options, p) {
    let args = null;
    if (has(p, 'args') && p.args !== null) {
      args = list(p.args, 'args').map((a) => str(a, 'args'));
    }
    const hasProps = has(p, 'properties');
    let props = null;
    if (hasProps && p.properties !== null) {
      props = new Properties();
      for (const e of list(p.properties, 'properties')) {
        const kv = list(e, 'properties');
        if (kv.length !== 2 || typeof kv[0] !== 'string' || typeof kv[1] !== 'string') {
          throw new RequestError('bad member: properties');
        }
        props.setProperty(kv[0], kv[1]);
      }
    }
    const hasStop = has(p, 'stopAtNonOption');
    const stop = hasStop && bool(p.stopAtNonOption, 'stopAtNonOption');
    let action = null;
    const hasAction = has(p, 'nonOptionAction');
    if (hasAction) {
      if (!(parser instanceof DefaultParser)) {
        throw new RequestError('bad member: nonOptionAction');
      }
      const a = p.nonOptionAction;
      if (a !== null) {
        if (typeof a !== 'string' || !Object.hasOwn(NonOptionAction, a)) {
          throw new RequestError('bad member: nonOptionAction');
        }
        action = NonOptionAction[a];
      }
    }
    const queries = this.member(p, 'queries');
    const mark = this.handled === null ? 0 : this.handled.length;
    let cl;
    try {
      if (hasAction) {
        cl = parser.parseWithAction(options, props, action, args);
      } else if (hasProps && hasStop) {
        cl = parser.parse(options, args, props, stop);
      } else if (hasProps) {
        cl = parser.parse(options, args, props);
      } else if (hasStop) {
        cl = parser.parse(options, args, stop);
      } else {
        cl = parser.parse(options, args);
      }
    } catch (e) {
      return this.error(e);
    }
    return this.commandLineResult(cl, queries, mark);
  }

  commandLineResult(cl, queries, mark) {
    const results = queries.map((q) => this.query(cl, q));
    const m = {
      args: [...cl.getArgList()],
      options: cl.getOptions().map((o) => this.compact(o)),
      queries: results
    };
    if (this.handled !== null) {
      m.handled = this.handled.slice(mark);
    }
    return m;
  }

  query(cl, c) {
    switch (c.sig) {
      case 'getArgList()':
        c.arity(0);
        return this.guarded(() => [...cl.getArgList()]);
      case 'getArgs()':
        c.arity(0);
        return this.guarded(() => this.stringList(cl.getArgs()));
      case 'getOptions()':
        c.arity(0);
        return this.guarded(() => cl.getOptions().map((o) => this.compact(o)));
      case 'iterator()':
        c.arity(0);
        return this.guarded(() => [...cl.iterator()].map((o) => this.compact(o)));
      default:
        break;
    }
    const open = c.sig.indexOf('(');
    if (open < 0 || !c.sig.endsWith(')')) {
      throw c.unknown();
    }
    const name = c.sig.slice(0, open);
    const types = c.sig.slice(open + 1, -1).split(',');
    const seconds = QUERY_OVERLOADS.get(name);
    if (seconds === undefined || types.length > 2) {
      throw c.unknown();
    }
    const [t0] = types;
    const t1 = types.length === 2 ? types[1] : '';
    if (!['char', 'String', 'Option', 'OptionGroup'].includes(t0) || !selectorAllowed(name, t0)
        || (t1 === '' && types.length === 2) || !seconds.includes(t1)) {
      throw c.unknown();
    }
    c.arity(types.length);
    const err = c.err;
    let sel;
    switch (t0) {
      case 'char':
        sel = c.c(0);
        break;
      case 'String':
        sel = c.s(0);
        break;
      case 'Option':
        sel = this.option(c.arg(0));
        break;
      default:
        sel = this.group(c.arg(0));
    }
    let second;
    switch (t1) {
      case '':
        second = undefined;
        break;
      case 'String':
        second = c.s(1);
        break;
      case 'Object':
        second = this.object(c.arg(1), err);
        break;
      case 'Object[]': {
        const items = this.objects(c.arg(1), err);
        second = items === null ? null : new JavaArray(Types.OBJECT, items);
        break;
      }
      default:
        if (name === 'getParsedOptionValues') {
          second = this.supplier(c.arg(1), err, (v) => {
            const items = this.objects(v, err);
            return items === null ? null : new JavaArray(Types.OBJECT, items);
          });
        } else if (name === 'getParsedOptionValue') {
          second = this.supplier(c.arg(1), err, (v) => this.object(v, err));
        } else {
          second = this.supplier(c.arg(1), err, (v) => {
            if (v !== null && typeof v !== 'string') {
              throw new RequestError(err);
            }
            return v;
          });
        }
    }
    return this.guarded(() => {
      const withSecond = (f) => (t1 === '' ? f(sel) : f(sel, second));
      switch (name) {
        case 'hasOption':
          return cl.hasOption(sel);
        case 'getOptionValues':
          return this.stringList(cl.getOptionValues(sel));
        case 'getOptionCount':
          return cl.getOptionCount(sel);
        case 'getOptionObject':
          return this.obj(cl.getOptionObject(sel));
        case 'getOptionProperties':
          return this.obj(t0 === 'String' ? cl.getOptionPropertiesByName(sel) : cl.getOptionProperties(sel));
        case 'getOptionValue':
          return withSecond((...a) => cl.getOptionValue(...a));
        case 'getParsedOptionValue':
          return this.obj(withSecond((...a) => cl.getParsedOptionValue(...a)));
        default:
          return this.obj(withSecond((...a) => cl.getParsedOptionValues(...a)));
      }
    });
  }

  // ---- commandLine

  commandLineOp(req) {
    const b = CommandLine.builder();
    for (const c of this.member(req, 'builder')) {
      switch (c.sig) {
        case 'addArg(String)':
          c.arity(1);
          b.addArg(c.s(0));
          break;
        case 'addOption(Option)':
          c.arity(1);
          b.addOption(this.option(c.arg(0)));
          break;
        case 'setDeprecatedHandler(Consumer)':
          c.arity(1);
          b.setDeprecatedHandler(this.handler(c.arg(0), c.err));
          break;
        default:
          throw c.unknown();
      }
    }
    const terminal = has(req, 'terminal') ? req.terminal : 'get';
    let cl;
    if (terminal === 'get') {
      cl = b.get();
    } else if (terminal === 'build') {
      cl = b.build();
    } else {
      throw new RequestError('bad member: terminal');
    }
    return this.commandLineResult(cl, this.member(req, 'queries'), 0);
  }

  // ---- option

  optionOp(req) {
    const o = this.option(has(req, 'option') ? req.option : null);
    if (o === null) {
      throw new RequestError('bad member: option');
    }
    return this.results(this.member(req, 'calls').map((c) => this.optionCall(o, c)));
  }

  optionCall(o, c) {
    const plain = {
      'getArgName()': () => o.getArgName(),
      'getArgs()': () => o.getArgs(),
      'getDeprecated()': () => this.depView(o.getDeprecated()),
      'getDescription()': () => o.getDescription(),
      'getId()': () => o.getId(),
      'getKey()': () => o.getKey(),
      'getLongOpt()': () => o.getLongOpt(),
      'getOpt()': () => o.getOpt(),
      'getSince()': () => o.getSince(),
      'getType()': () => this.obj(o.getType()),
      'getValue()': () => o.getValue(),
      'getValueSeparator()': () => o.getValueSeparator(),
      'getValues()': () => this.stringList(o.getValues()),
      'getValuesList()': () => [...o.getValuesList()],
      'hasArg()': () => o.hasArg(),
      'hasArgName()': () => o.hasArgName(),
      'hasArgs()': () => o.hasArgs(),
      'hasLongOpt()': () => o.hasLongOpt(),
      'hasOptionalArg()': () => o.hasOptionalArg(),
      'hasValueSeparator()': () => o.hasValueSeparator(),
      'hashCode()': () => o.hashCode(),
      'isDeprecated()': () => o.isDeprecated(),
      'isRequired()': () => o.isRequired(),
      'toString()': () => o.toString(),
      'clone()': () => this.optView(o.clone())
    };
    if (Object.hasOwn(plain, c.sig)) {
      c.arity(0);
      return this.guarded(plain[c.sig]);
    }
    switch (c.sig) {
      case 'addValue(String)': {
        c.arity(1);
        const v = c.s(0);
        return this.guarded(() => o.addValue(v));
      }
      case 'equals(Option)': {
        c.arity(1);
        const other = this.option(c.arg(0));
        return this.guarded(() => o.equals(other));
      }
      case 'equals(String)': {
        c.arity(1);
        const other = c.s(0);
        return this.guarded(() => o.equals(other));
      }
      case 'getConverter(String)': {
        c.arity(1);
        const v = c.s(0);
        return this.guarded(() => this.obj(o.getConverter()(v)));
      }
      case 'getValue(int)': {
        c.arity(1);
        const i = c.i(0);
        return this.guarded(() => o.getValue(i));
      }
      case 'getValue(String)': {
        c.arity(1);
        const d = c.s(0);
        return this.guarded(() => o.getValue(d));
      }
      default:
        if (this.setter(o, c)) {
          return null;
        }
        throw c.unknown();
    }
  }

  // ---- options

  optionsOp(req) {
    const options = this.options(has(req, 'options') ? req.options : []);
    return this.results(this.member(req, 'calls').map((c) => this.optionsCall(options, c)));
  }

  optionsCall(options, c) {
    let result = null;
    if (this.optionsMutator(options, c, (step) => {
      result = this.run(step);
    })) {
      return result;
    }
    switch (c.sig) {
      case 'getMatchingOptions(String)': {
        c.arity(1);
        const s = c.s(0);
        return this.guarded(() => [...options.getMatchingOptions(s)]);
      }
      case 'getOption(String)': {
        c.arity(1);
        const s = c.s(0);
        return this.guarded(() => this.optView(options.getOption(s)));
      }
      case 'getOptionGroup(Option)': {
        c.arity(1);
        const o = this.option(c.arg(0));
        return this.guarded(() => this.groupView(options.getOptionGroup(o)));
      }
      case 'getOptions()':
        c.arity(0);
        return this.guarded(() => this.optViews(options.getOptions()));
      case 'getRequiredOptions()':
        c.arity(0);
        return this.guarded(() => this.requiredView(options.getRequiredOptions()));
      case 'hasLongOption(String)':
      case 'hasOption(String)':
      case 'hasShortOption(String)': {
        c.arity(1);
        const s = c.s(0);
        const name = c.sig.slice(0, c.sig.indexOf('('));
        return this.guarded(() => options[name](s));
      }
      case 'toString()':
        c.arity(0);
        return this.guarded(() => options.toString());
      default:
        throw c.unknown();
    }
  }

  // ---- group

  groupOp(req) {
    const g = this.group(has(req, 'group') ? req.group : null);
    if (g === null) {
      throw new RequestError('bad member: group');
    }
    return this.results(this.member(req, 'calls').map((c) => {
      switch (c.sig) {
        case 'addOption(Option)': {
          c.arity(1);
          const o = this.option(c.arg(0));
          return this.run(() => g.addOption(o));
        }
        case 'setRequired(boolean)': {
          c.arity(1);
          const b = c.b(0);
          return this.run(() => g.setRequired(b));
        }
        case 'setSelected(Option)': {
          c.arity(1);
          const o = this.option(c.arg(0));
          return this.run(() => g.setSelected(o));
        }
        case 'getNames()':
          c.arity(0);
          return this.guarded(() => g.getNames());
        case 'getOptions()':
          c.arity(0);
          return this.guarded(() => this.optViews(g.getOptions()));
        case 'getSelected()':
          c.arity(0);
          return this.guarded(() => g.getSelected());
        case 'isRequired()':
          c.arity(0);
          return this.guarded(() => g.isRequired());
        case 'isSelected()':
          c.arity(0);
          return this.guarded(() => g.isSelected());
        case 'toString()':
          c.arity(0);
          return this.guarded(() => g.toString());
        default:
          throw c.unknown();
      }
    }));
  }

  // ---- pattern

  patternOp(req) {
    return this.results(this.member(req, 'calls').map((c) => {
      switch (c.sig) {
        case 'parsePattern(String)': {
          c.arity(1);
          const s = c.s(0);
          return this.guarded(() => this.optionsView(PatternOptionBuilder.parsePattern(s)));
        }
        case 'getValueType(char)':
        case 'getValueClass(char)': {
          c.arity(1);
          const ch = c.c(0);
          return this.guarded(() => this.obj(PatternOptionBuilder.getValueType(ch)));
        }
        case 'isValueCode(char)': {
          c.arity(1);
          const ch = c.c(0);
          return this.guarded(() => PatternOptionBuilder.isValueCode(ch));
        }
        default:
          throw c.unknown();
      }
    }));
  }

  // ---- convert

  convertOp(req) {
    const unary = {
      'createNumber(String)': (s) => TypeHandler.createNumber(s),
      'createFile(String)': (s) => TypeHandler.createFile(s),
      'createFiles(String)': (s) => TypeHandler.createFiles(s),
      'createURL(String)': (s) => TypeHandler.createURL(s),
      'createDate(String)': (s) => TypeHandler.createDate(s),
      'createClass(String)': (s) => TypeHandler.createClass(s),
      'createObject(String)': (s) => TypeHandler.createObject(s),
      'openFile(String)': (s) => TypeHandler.openFile(s)
    };
    return this.results(this.member(req, 'calls').map((c) => {
      if (Object.hasOwn(unary, c.sig)) {
        c.arity(1);
        const s = c.s(0);
        return this.guarded(() => this.obj(unary[c.sig](s)));
      }
      switch (c.sig) {
        case 'createValue(String,Class)':
        case 'createValue(String,Object)': {
          c.arity(2);
          const s = c.s(0);
          const t = this.type(c.arg(1), c.err);
          return this.guarded(() => this.obj(TypeHandler.createValue(s, t)));
        }
        case 'getConverter(Class,String)': {
          c.arity(2);
          const t = this.type(c.arg(0), c.err);
          const s = c.s(1);
          return this.guarded(() => this.obj(TypeHandler.getDefault().getConverter(t)(s)));
        }
        case 'apply(Converter,String)': {
          c.arity(2);
          const conv = this.converter(c.arg(0), c.err);
          if (conv === null) {
            throw c.badArgs();
          }
          const s = c.s(1);
          return this.guarded(() => this.obj(conv(s)));
        }
        case 'newTypeHandler(Map,Class,String)': {
          c.arity(3);
          const m = new Map();
          for (const e of c.listArg(0)) {
            if (!Array.isArray(e) || e.length !== 2) {
              throw c.badArgs();
            }
            m.set(this.type(e[0], c.err), this.converter(e[1], c.err));
          }
          const t = this.type(c.arg(1), c.err);
          const s = c.s(2);
          return this.guarded(() => this.obj(new TypeHandler(m).getConverter(t)(s)));
        }
        default:
          throw c.unknown();
      }
    }));
  }

  // ---- deprecated HelpFormatter

  helpFormatterOp(req) {
    let hf;
    let writer = null;
    if (has(req, 'builder')) {
      const b = map(req.builder, 'builder');
      const builder = HelpFormatter.builder();
      if (has(b, 'printWriter') && bool(b.printWriter, 'printWriter')) {
        writer = new StringWriter();
        builder.setPrintWriter(new PrintWriter(writer));
      }
      if (has(b, 'showDeprecated')) {
        const v = b.showDeprecated;
        builder.setShowDeprecated(typeof v === 'boolean' ? v : this.deprecatedFormat(v, 'bad member: showDeprecated'));
      }
      if (has(b, 'showSince')) {
        builder.setShowSince(bool(b.showSince, 'showSince'));
      }
      hf = builder.get();
    } else {
      hf = new HelpFormatter();
    }
    const m = this.results(this.member(req, 'calls').map((c) => this.helpFormatterCall(hf, c)));
    if (writer !== null) {
      m.writer = writer.toString();
    }
    return m;
  }

  printed(body) {
    const sw = new StringWriter();
    const pw = new PrintWriter(sw);
    const r = this.run(() => body(pw));
    return r !== null ? r : sw.toString();
  }

  helpFormatterCall(hf, c) {
    const getters = ['getArgName()', 'getDescPadding()', 'getLeftPadding()', 'getLongOptPrefix()', 'getLongOptSeparator()',
      'getNewLine()', 'getOptPrefix()', 'getSyntaxPrefix()', 'getWidth()'];
    if (getters.includes(c.sig)) {
      c.arity(0);
      return this.guarded(() => hf[c.sig.slice(0, -2)]());
    }
    const stringSetters = ['setArgName(String)', 'setLongOptPrefix(String)', 'setLongOptSeparator(String)', 'setNewLine(String)',
      'setOptPrefix(String)', 'setSyntaxPrefix(String)'];
    if (stringSetters.includes(c.sig)) {
      c.arity(1);
      const s = c.s(0);
      return this.run(() => hf[c.sig.slice(0, c.sig.indexOf('('))](s));
    }
    if (['setDescPadding(int)', 'setLeftPadding(int)', 'setWidth(int)'].includes(c.sig)) {
      c.arity(1);
      const n = c.i(0);
      return this.run(() => hf[c.sig.slice(0, c.sig.indexOf('('))](n));
    }
    switch (c.sig) {
      case 'printHelp(String,Options)': {
        c.arity(2);
        const a = c.s(0);
        const o = this.options(c.arg(1));
        return this.run(() => hf.printHelp(a, o));
      }
      case 'printHelp(String,Options,boolean)': {
        c.arity(3);
        const a = c.s(0);
        const o = this.options(c.arg(1));
        const u = c.b(2);
        return this.run(() => hf.printHelp(a, o, u));
      }
      case 'printHelp(String,String,Options,String)': {
        c.arity(4);
        const [a, h] = [c.s(0), c.s(1)];
        const o = this.options(c.arg(2));
        const f = c.s(3);
        return this.run(() => hf.printHelp(a, h, o, f));
      }
      case 'printHelp(String,String,Options,String,boolean)': {
        c.arity(5);
        const [a, h] = [c.s(0), c.s(1)];
        const o = this.options(c.arg(2));
        const [f, u] = [c.s(3), c.b(4)];
        return this.run(() => hf.printHelp(a, h, o, f, u));
      }
      case 'printHelp(int,String,String,Options,String)': {
        c.arity(5);
        const [w, a, h] = [c.i(0), c.s(1), c.s(2)];
        const o = this.options(c.arg(3));
        const f = c.s(4);
        return this.run(() => hf.printHelp(w, a, h, o, f));
      }
      case 'printHelp(int,String,String,Options,String,boolean)': {
        c.arity(6);
        const [w, a, h] = [c.i(0), c.s(1), c.s(2)];
        const o = this.options(c.arg(3));
        const [f, u] = [c.s(4), c.b(5)];
        return this.run(() => hf.printHelp(w, a, h, o, f, u));
      }
      case 'printHelp(PrintWriter,int,String,String,Options,int,int,String)':
      case 'printHelp(PrintWriter,int,String,String,Options,int,int,String,boolean)': {
        const withUsage = c.sig.endsWith('boolean)');
        c.arity(withUsage ? 8 : 7);
        const [w, a, h] = [c.i(0), c.s(1), c.s(2)];
        const o = this.options(c.arg(3));
        const [lp, dp, f] = [c.i(4), c.i(5), c.s(6)];
        const u = withUsage ? c.b(7) : false;
        return this.printed((pw) => hf.printHelpTo(pw, w, a, h, o, lp, dp, f, u));
      }
      case 'printOptions(PrintWriter,int,Options,int,int)': {
        c.arity(4);
        const w = c.i(0);
        const o = this.options(c.arg(1));
        const [lp, dp] = [c.i(2), c.i(3)];
        return this.printed((pw) => hf.printOptions(pw, w, o, lp, dp));
      }
      case 'printUsage(PrintWriter,int,String)': {
        c.arity(2);
        const [w, a] = [c.i(0), c.s(1)];
        return this.printed((pw) => hf.printUsage(pw, w, a));
      }
      case 'printUsage(PrintWriter,int,String,Options)': {
        c.arity(3);
        const [w, a] = [c.i(0), c.s(1)];
        const o = this.options(c.arg(2));
        return this.printed((pw) => hf.printUsage(pw, w, a, o));
      }
      case 'printWrapped(PrintWriter,int,int,String)': {
        c.arity(3);
        const [w, t, s] = [c.i(0), c.i(1), c.s(2)];
        return this.printed((pw) => hf.printWrapped(pw, w, t, s));
      }
      case 'printWrapped(PrintWriter,int,String)': {
        c.arity(2);
        const [w, s] = [c.i(0), c.s(1)];
        return this.printed((pw) => hf.printWrapped(pw, w, s));
      }
      case 'renderOptions(StringBuffer,int,Options,int,int)': {
        c.arity(5);
        const sb = new StringBuilder(this.nonNull(c.s(0), c));
        const w = c.i(1);
        const o = this.options(c.arg(2));
        const [lp, dp] = [c.i(3), c.i(4)];
        const r = this.run(() => hf.renderOptions(sb, w, o, lp, dp));
        return r !== null ? r : sb.toString();
      }
      case 'renderWrappedText(StringBuffer,int,int,String)': {
        c.arity(4);
        const sb = new StringBuilder(this.nonNull(c.s(0), c));
        const [w, t, s] = [c.i(1), c.i(2), c.s(3)];
        const r = this.run(() => hf.renderWrappedText(sb, w, t, s));
        return r !== null ? r : sb.toString();
      }
      case 'findWrapPos(String,int,int)': {
        c.arity(3);
        const [s, w, p] = [c.s(0), c.i(1), c.i(2)];
        return this.guarded(() => hf.findWrapPos(s, w, p));
      }
      case 'rtrim(String)': {
        c.arity(1);
        const s = c.s(0);
        return this.guarded(() => hf.rtrim(s));
      }
      case 'createPadding(int)': {
        c.arity(1);
        const n = c.i(0);
        return this.guarded(() => hf.createPadding(n));
      }
      case 'getDescription(Option)': {
        c.arity(1);
        const o = this.option(c.arg(0));
        return this.guarded(() => HelpFormatter.getDescription(o));
      }
      case 'getOptionComparator()':
        c.arity(0);
        return this.guarded(() => (hf.getOptionComparator() == null ? null : true));
      case 'setOptionComparator(Comparator)': {
        c.arity(1);
        const cmp = this.comparator(c.arg(0), c.err);
        return this.run(() => hf.setOptionComparator(cmp));
      }
      default:
        throw c.unknown();
    }
  }

  nonNull(s, c) {
    if (s === null) {
      throw c.badArgs();
    }
    return s;
  }

  // ---- help.HelpFormatter

  helpOp(req) {
    const b = has(req, 'builder') ? map(req.builder, 'builder') : {};
    let text = null;
    const builder = NewHelpFormatter.builder();
    if (has(b, 'comparator')) {
      builder.setComparator(this.comparator(b.comparator, 'bad member: comparator'));
    }
    if (has(b, 'helpAppendable')) {
      if (b.helpAppendable === null) {
        builder.setHelpAppendable(null);
      } else {
        text = new StringBuilder();
        builder.setHelpAppendable(this.appendable(b.helpAppendable, text, 'bad member: helpAppendable'));
      }
    }
    if (has(b, 'optionFormatBuilder')) {
      const v = b.optionFormatBuilder;
      builder.setOptionFormatBuilder(v === null ? null : this.formatBuilder(OptionFormatter.builder(), this.calls(v, 'optionFormatBuilder')));
    }
    if (has(b, 'optionGroupSeparator')) {
      builder.setOptionGroupSeparator(str(b.optionGroupSeparator, 'optionGroupSeparator'));
    }
    if (has(b, 'showSince')) {
      builder.setShowSince(bool(b.showSince, 'showSince'));
    }
    const hf = this.spec(() => builder.get());
    const m = this.results(this.member(req, 'calls').map((c) => this.helpCall(hf, c)));
    if (text !== null) {
      m.text = text.toString();
    }
    return m;
  }

  formatBuilder(b, calls) {
    for (const c of calls) {
      const name = c.sig.slice(0, c.sig.indexOf('('));
      switch (c.sig) {
        case 'setArgumentNameDelimiters(String,String)':
        case 'setOptionalDelimiters(String,String)': {
          c.arity(2);
          const [x, y] = [c.s(0), c.s(1)];
          b[name](x, y);
          break;
        }
        case 'setDefaultArgName(String)':
        case 'setLongOptPrefix(String)':
        case 'setOptArgSeparator(String)':
        case 'setOptPrefix(String)':
        case 'setOptSeparator(String)':
          c.arity(1);
          b[name](c.s(0));
          break;
        case 'setDeprecatedFormatFunction(Function)':
          c.arity(1);
          b.setDeprecatedFormatFunction(this.deprecatedFormat(c.arg(0), c.err));
          break;
        case 'setSyntaxFormatFunction(BiFunction)':
          c.arity(1);
          b.setSyntaxFormatFunction(this.syntaxFormat(c.arg(0), c.err));
          break;
        default:
          throw c.unknown();
      }
    }
    return b;
  }

  helpCall(hf, c) {
    switch (c.sig) {
      case 'printHelp(String,String,Options,String,boolean)':
      case 'printHelp(String,String,Iterable,String,boolean)': {
        c.arity(5);
        const [a, h] = [c.s(0), c.s(1)];
        const o = c.sig.includes('Iterable') ? this.optionList(c.arg(2), c) : this.options(c.arg(2));
        const [f, u] = [c.s(3), c.b(4)];
        return this.run(() => hf.printHelp(a, h, o, f, u));
      }
      case 'printOptions(Options)': {
        c.arity(1);
        const o = this.options(c.arg(0));
        return this.run(() => hf.printOptions(o));
      }
      case 'printOptions(Iterable)': {
        c.arity(1);
        const o = this.optionList(c.arg(0), c);
        return this.run(() => hf.printOptions(o));
      }
      case 'printOptions(TableDefinition)': {
        c.arity(1);
        const t = this.table(c.arg(0), c.err);
        return this.run(() => hf.printOptions(t));
      }
      case 'sort(Options)': {
        c.arity(1);
        const o = c.arg(0) === null ? null : this.options(c.arg(0));
        return this.guarded(() => this.optViews(hf.sort(o)));
      }
      case 'sort(Iterable)': {
        c.arity(1);
        const o = c.arg(0) === null ? null : this.optionList(c.arg(0), c);
        return this.guarded(() => this.optViews(hf.sort(o)));
      }
      case 'toArgName(String)': {
        c.arity(1);
        const s = c.s(0);
        return this.guarded(() => hf.toArgName(s));
      }
      case 'toSyntaxOptions(Options)': {
        c.arity(1);
        const o = this.options(c.arg(0));
        return this.guarded(() => hf.toSyntaxOptions(o));
      }
      case 'toSyntaxOptions(Iterable)': {
        c.arity(1);
        const o = this.optionList(c.arg(0), c);
        return this.guarded(() => hf.toSyntaxOptions(o));
      }
      case 'toSyntaxOptions(OptionGroup)': {
        c.arity(1);
        const g = this.group(c.arg(0));
        return this.guarded(() => hf.toGroupSyntax(g));
      }
      case 'getOptionFormatter(Option)': {
        c.arity(1);
        const o = this.option(c.arg(0));
        return this.guarded(() => this.formatterView(hf.getOptionFormatter(o)));
      }
      case 'getSyntaxPrefix()':
        c.arity(0);
        return this.guarded(() => hf.getSyntaxPrefix());
      case 'setSyntaxPrefix(String)': {
        c.arity(1);
        const s = c.s(0);
        return this.run(() => hf.setSyntaxPrefix(s));
      }
      case 'getTableDefinition(Iterable)': {
        c.arity(1);
        const o = this.optionList(c.arg(0), c);
        return this.guarded(() => this.tableView(hf.getTableDefinition(o)));
      }
      default:
        throw c.unknown();
    }
  }

  // ---- OptionFormatter

  optionFormatterOp(req) {
    const option = this.option(has(req, 'option') ? req.option : null);
    let last = null;
    let f;
    if (has(req, 'builder')) {
      last = this.formatBuilder(OptionFormatter.builder(), this.calls(req.builder, 'builder'));
      f = this.spec(() => last.build(option));
    } else {
      f = this.spec(() => OptionFormatter.from(option));
    }
    if (has(req, 'copy')) {
      const copyCalls = this.calls(req.copy, 'copy');
      const base = f;
      last = this.formatBuilder(this.spec(() => new OptionFormatter.Builder(base)), copyCalls);
      const copyBuilder = last;
      f = this.spec(() => copyBuilder.build(option));
    }
    const formatter = f;
    const builder = last ?? OptionFormatter.builder();
    return this.results(this.member(req, 'calls').map((c) => {
      const getters = ['getArgName()', 'getBothOpt()', 'getDescription()', 'getLongOpt()', 'getOpt()', 'getSince()', 'isRequired()',
        'toSyntaxOption()'];
      if (getters.includes(c.sig)) {
        c.arity(0);
        return this.guarded(() => formatter[c.sig.slice(0, -2)]());
      }
      switch (c.sig) {
        case 'toOptional(String)': {
          c.arity(1);
          const s = c.s(0);
          return this.guarded(() => formatter.toOptional(s));
        }
        case 'toSyntaxOption(boolean)': {
          c.arity(1);
          const b = c.b(0);
          return this.guarded(() => formatter.toSyntaxOption(b));
        }
        case 'toArgName(String)': {
          c.arity(1);
          const s = c.s(0);
          return this.guarded(() => builder.toArgName(s));
        }
        default:
          throw c.unknown();
      }
    }));
  }

  // ---- TextHelpAppendable

  textHelpOp(req) {
    const text = new StringBuilder();
    const a = this.appendable(has(req, 'appendable') ? req.appendable : {}, text, 'bad member: appendable');
    const m = this.results(this.member(req, 'calls').map((c) => this.textHelpCall(a, c)));
    m.text = text.toString();
    return m;
  }

  textHelpCall(a, c) {
    if (['getIndent()', 'getLeftPad()', 'getMaxWidth()'].includes(c.sig)) {
      c.arity(0);
      return this.guarded(() => a[c.sig.slice(0, -2)]());
    }
    if (['setIndent(int)', 'setLeftPad(int)', 'setMaxWidth(int)'].includes(c.sig)) {
      c.arity(1);
      const n = c.i(0);
      return this.run(() => a[c.sig.slice(0, c.sig.indexOf('('))](n));
    }
    if (['appendParagraph(CharSequence)', 'appendTitle(CharSequence)', 'printWrapped(String)', 'append(CharSequence)'].includes(c.sig)) {
      c.arity(1);
      const s = c.s(0);
      return this.run(() => a[c.sig.slice(0, c.sig.indexOf('('))](s));
    }
    switch (c.sig) {
      case 'appendHeader(int,CharSequence)': {
        c.arity(2);
        const [level, s] = [c.i(0), c.s(1)];
        return this.run(() => a.appendHeader(level, s));
      }
      case 'appendList(boolean,Collection)': {
        c.arity(2);
        const ordered = c.b(0);
        const l = c.arg(1) === null ? null : c.strs(1);
        return this.run(() => a.appendList(ordered, l));
      }
      case 'appendTable(TableDefinition)': {
        c.arity(1);
        const t = this.table(c.arg(0), c.err);
        return this.run(() => a.appendTable(t));
      }
      case 'appendFormat(String,Object...)':
      case 'appendParagraphFormat(String,Object...)': {
        c.arity(2);
        const fmt = c.s(0);
        if (c.arg(1) === null) {
          throw c.badArgs();
        }
        const args = this.objects(c.arg(1), c.err);
        const paragraph = c.sig.startsWith('appendParagraphFormat');
        return this.run(() => (paragraph ? a.appendParagraphFormat(fmt, ...args) : a.appendFormat(fmt, ...args)));
      }
      case 'printWrapped(String,TextStyle)': {
        c.arity(2);
        const s = c.s(0);
        const st = this.styleBuilder(c.arg(1), c.err).get();
        return this.run(() => a.printWrapped(s, st));
      }
      case 'append(char)': {
        c.arity(1);
        const ch = c.c(0);
        return this.run(() => a.append(ch));
      }
      case 'append(CharSequence,int,int)': {
        c.arity(3);
        const [s, start, end] = [c.s(0), c.i(1), c.i(2)];
        return this.run(() => a.append(s, start, end));
      }
      case 'getTextStyleBuilder()':
        c.arity(0);
        return this.guarded(() => a.getTextStyleBuilder().get().toString());
      case 'indexOfWrap(CharSequence,int,int)': {
        c.arity(3);
        const [s, w, p] = [c.s(0), c.i(1), c.i(2)];
        return this.guarded(() => TextHelpAppendable.indexOfWrap(s, w, p));
      }
      case 'makeColumnQueue(CharSequence,TextStyle)': {
        c.arity(2);
        const s = c.s(0);
        const st = this.styleBuilder(c.arg(1), c.err).get();
        return this.guarded(() => [...a.makeColumnQueue(s, st)]);
      }
      case 'adjustTableFormat(TableDefinition)': {
        c.arity(1);
        const t = this.table(c.arg(0), c.err);
        return this.guarded(() => this.tableView(a.adjustTableFormat(t)));
      }
      case 'resize(TextStyle.Builder,double)': {
        c.arity(2);
        const sb = this.styleBuilder(c.arg(0), c.err);
        const f = c.d(1);
        return this.guarded(() => a.resize(sb, f).get().toString());
      }
      case 'writeColumnQueues(List,List)': {
        c.arity(2);
        const queues = c.listArg(0).map((q) => this.stringItems(q, c.err));
        const st = this.styles(c.arg(1), c.err);
        return this.run(() => a.writeColumnQueues(queues, st));
      }
      default:
        throw c.unknown();
    }
  }

  // ---- TextStyle

  textStyleOp(req) {
    const style = this.styleBuilder(has(req, 'style') ? req.style : {}, 'bad member: style').get();
    return this.results(this.member(req, 'calls').map((c) => {
      const getters = ['getIndent()', 'getLeftPad()', 'getMaxWidth()', 'getMinWidth()', 'isScalable()', 'toString()'];
      if (getters.includes(c.sig)) {
        c.arity(0);
        return this.guarded(() => style[c.sig.slice(0, -2)]());
      }
      switch (c.sig) {
        case 'getAlignment()':
          c.arity(0);
          return this.guarded(() => style.getAlignment());
        case 'pad(boolean,CharSequence)': {
          c.arity(2);
          const [b, s] = [c.b(0), c.s(1)];
          return this.guarded(() => style.pad(b, s));
        }
        default:
          throw c.unknown();
      }
    }));
  }
}

/** The response for one line of input. */
export function respond(line) {
  const request = new Request();
  let response;
  try {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new RequestError('malformed JSON');
    }
    if (!isMap(parsed)) {
      throw new RequestError('request must be an object');
    }
    response = request.handle(parsed);
  } catch (e) {
    response = request.error(e);
  }
  return { response, failed: request.failed };
}
