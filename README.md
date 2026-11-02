<!---
 Licensed to the Apache Software Foundation (ASF) under one or more
 contributor license agreements.  See the NOTICE file distributed with
 this work for additional information regarding copyright ownership.
 The ASF licenses this file to You under the Apache License, Version 2.0
 (the "License"); you may not use this file except in compliance with
 the License.  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
-->
Apache Commons CLI for JavaScript
=================================

[![Node.js CI](https://github.com/apache/commons-cli/actions/workflows/node.yml/badge.svg)](https://github.com/apache/commons-cli/actions/workflows/node.yml)
[![CodeQL](https://github.com/apache/commons-cli/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/apache/commons-cli/actions/workflows/codeql-analysis.yml)

Apache Commons CLI provides a simple API for presenting, processing, and validating a Command Line Interface.

This is a JavaScript port of Commons CLI 1.11.0 (ECMAScript modules, Node.js 22 or later, no dependencies). It keeps
the Java library's model, method names and behaviour exactly, down to its messages, its help layout and the Java
runtime behaviour the library relies on (number parsing and printing, `String.format`, `java.net.URL`, dates,
`Properties` ordering, Unicode character tables), so that programs and tests written against the Java library carry
over.

Usage
-----

```js
import { DefaultParser, HelpFormatter, Option, Options } from 'commons-cli';

const options = new Options()
  .addOption('v', 'verbose', false, 'print more')
  .addOption(Option.builder('f').longOpt('file').hasArg().argName('path').desc('the input file').get());

const line = new DefaultParser().parse(options, ['-v', '--file', 'in.txt', 'rest']);
line.hasOption('verbose');       // true
line.getOptionValue('f');        // 'in.txt'
line.getArgs();                  // ['rest']

new HelpFormatter().printHelp('app', options);
```

The modules follow the Java packages: `lib/` holds `org.apache.commons.cli` (options, parsers, command lines, the
deprecated `HelpFormatter`, type conversion), `lib/help/` holds `org.apache.commons.cli.help` (the new help
formatter, `TextHelpAppendable`, `TextStyle`, `OptionFormatter`), and `lib/java/` the parts of the Java runtime the
library depends on. Java values the library hands out (converted option values, classes) are objects with
`getClass()` and `toString()`; strings and booleans are JavaScript strings and booleans. Java overloads become one
method that looks at its arguments (an `Option` or a name; a default value or a supplier function).

The `commons-cli` command
-------------------------

`bin/commons-cli.js` drives the whole library through JSON lines: it reads one JSON request per line on standard input
and writes one JSON response per line on standard output. A request names an operation (`parse`, `commandLine`,
`option`, `options`, `group`, `pattern`, `convert`, `helpFormatter`, `help`, `optionFormatter`, `textHelp`,
`textStyle`), the objects to build and the calls to make, each by its Java signature:

```sh
$ echo '{"op":"parse","options":[["addOption(String,String)","v","verbose"]],"parses":[{"args":["-v","x"],"queries":[["hasOption(char)","v"]]}]}' | commons-cli
{"results":[{"args":["x"],"options":[{"opt":"v","longOpt":null,"values":[]}],"queries":[true]}]}
```

Errors are reported as `{"error":{"name":...,"message":...}}` with the Java exception's binary name and message.
Whatever the library prints to standard output or standard error while it handles a request comes back as the
response's `stdout` and `stderr` members. The exit status is 0 when no error was reported, 1 when one was, and 2 for
any command-line argument (with usage text on standard error). The protocol in full (every operation, member, value,
result and error) is documented in the header of `lib/cli/request.js`, the module that implements it.

Building and testing
--------------------

There is nothing to build. With Node.js 22:

```sh
npm run check   # node --check on every source file
npm test        # node --test
```

The tests are the Java test suite ported to `node:test`; they run offline.

Contributing
------------

We accept Pull Requests via GitHub. The [developer mailing list](https://commons.apache.org/mail-lists.html) is the main channel of communication for contributors.
There are some guidelines which will make applying PRs easier for us:
+ No tabs! Please use spaces for indentation.
+ Respect the existing code style for each file.
+ Create minimal diffs - disable on save actions like reformat source code or organize imports. If you feel the source code should be reformatted create a separate PR for this change.
+ Provide tests for your changes and make sure your changes don't break any existing tests by running `npm test`.
+ Before you push a PR, run `npm run check` and `npm test`.

If you plan to contribute on a regular basis, please consider filing a [contributor license agreement](https://www.apache.org/licenses/#clas).
You can learn more about contributing via GitHub in our [contribution guidelines](CONTRIBUTING.md).

License
-------
This code is licensed under the [Apache License v2](https://www.apache.org/licenses/LICENSE-2.0).

See the `NOTICE.txt` file for required notices and attributions.

Donating
--------
You like Apache Commons CLI? Then [donate back to the ASF](https://www.apache.org/foundation/contributing.html) to support development.

Additional Resources
--------------------

+ [Apache Commons Homepage](https://commons.apache.org/)
+ [Apache Issue Tracker (JIRA)](https://issues.apache.org/jira/browse/CLI)
+ [Apache Commons Slack Channel](https://the-asf.slack.com/archives/C60NVB8AD)
+ [Apache Commons Twitter Account](https://twitter.com/ApacheCommons)

Apache Commons Components
-------------------------

Please see the [list of components](https://commons.apache.org/components.html)
