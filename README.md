# pg-patch

PostgreSQL DB pathing made easy.

## Features

* Automatic migration from current version (or clean state) to newest version
* Configurable source and target version patches (by ID or **[todo]** timestamp)
* Step by step forward / backward migration
* Transactional migration with transaction strategy setting:
    * per migration step (rollback **<u>only</u>** failed step and end process)
    * per migration process (rollback **<u>whole</u>** migration process)
* Dry runs 
    * log only (no DB manipulation with patch SQL)
    * single transaction with rollback at the end
* Configurable patch file name template
* Recursive subfolder checking for patch files
* Support for splitting migration step SQL into few files
    * patch files for the same migration step can be in different subdirectories
* Configurable log level
* Promise interface

### planned in near future:

* Migration history
* Report generation support

## Preparation

* Create patch files firectory: **"pg-patch"**

    ...or 


## Basic usage

If you're using 

For the most common scenario all You need is:
```node
let pgPatcher = require("./lib/pg-patch.js");

(new pgPatcher()).run()
```

## Configuration

* **targetVersion**
* **sourceVersion**
* **logLevel**
* **enableColors**
* **dbTable**
* **dbSchema**
* **actionUpdate**
* **actionRollback**
* **actionUpdate**
* **patchFileTemplate**

## Miscelanous

To generate current complexity report simply use plato:

```node
npm install -g plato
```

```node
plato -r -d report lib
```

## Licence

ISC License

Copyright (c) 2016, Łukasz Drożdż

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.