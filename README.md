# pg-patch

Node PostgreSQL patching utility.

[![npm version](https://badge.fury.io/js/pg-patch.svg)](https://badge.fury.io/js/pg-patch)
[![Build Status](https://travis-ci.org/Tireo/pg-patch.svg?branch=master)](https://travis-ci.org/Tireo/pg-patch)
[![Test Coverage](https://codeclimate.com/github/Tireo/pg-patch/badges/coverage.svg)](https://codeclimate.com/github/Tireo/pg-patch/coverage)
[![Code Climate](https://codeclimate.com/github/Tireo/pg-patch/badges/gpa.svg)](https://codeclimate.com/github/Tireo/pg-patch)
[![Issue Count](https://codeclimate.com/github/Tireo/pg-patch/badges/issue_count.svg)](https://codeclimate.com/github/Tireo/pg-patch)
[![Dependencies Status](https://david-dm.org/Tireo/pg-patch/status.svg)](https://david-dm.org/Tireo/pg-patch)   

[![NPM](https://nodei.co/npm/pg-patch.png?downloadRank=true)](https://nodei.co/npm/pg-patch/)

## Features

* Automatic migration from current version (or clean state) to newest version
* [Configurable source and target version](#configuration-cheatsheet)
* [Step by step forward / backward migration](#step-by-step-migration)
* [Support for custom patch data sources](#custom-patch-data-sources) (e.g. not files)
* [Transactional migration with transaction strategy setting](#transaction-control):
    * per migration step (rollback **<u>only</u>** failed step and end process)
    * per migration process (rollback **<u>whole</u>** migration process)
* [Dry runs](#dry-runs)
    * log only (no DB manipulation with patch SQL)
    * single transaction with rollback at the end (or first error)
* [Configurable patch file name template](#custom-patch-file-template)
* [Command line](#command-line-tool) and JS interface
* Patch history
* Recursive subfolder checking for patch files
* [Support for splitting migration step SQL into few files](#multiple-patch-files-per-updaterollback-step)
    * patch files for the same migration step can be in different subdirectories
* [Configurable log level](#configurable-log)
* [Promise interface](#working-with-async-api)

## Preparation

### Installing pg-patch

To install **pg-patch** in your node project just run this command:

```
npm i pg-patch --save-dev
```

### Patch files
By default all patch files need to:

* Be inside patch directory: `pg-patch` (or in any subdirectory)
* Follow naming convention: `patch-$VERSION-$ACTION[-$DESCRIPTION].sql`, where:
       
    * `$VERSION` - positive non-zero integer (leading zeros accepted)
    * `$ACTION` - up/rb for update to version and rollback from version respectively
    * `$DESCRIPTION` - any string matching `[0-9a-zA-Z\-\_]+`
    
    Example of valid patch file names:
    
    * `patch_1_up-update-to-version-1.sql`
    * `patch_1_rb-rollback-from-version-1.sql`
    * `patch_2_up.sql`
 
Above parameters [can be configured](#configuration-cheatsheet).

## Basic usage

### Smallest working example

Easiest way to use pg-patch is:

```node
//use default configuration and patch DB to the newest version possible
require("pg-patch").run();
```

Above code would use [default configuration settings](#configuration-cheatsheet) and load [DB connection](https://www.npmjs.com/package/pg) settings from ENV variables.

Alternatively you could create patcher instance and run it separately:

```node
let patcher = require("pg-patch").create();

//do something

patcher.run();
```

Both above examples have the same result.

### Configuration

#### Supplying run-time configuration

You can both supply configuration for given run:

```node
require("pg-patch").run(configObject);
```

As well as setting master configuration for pg-patch instance

```node
let patcher = require("pg-patch").create(configObject);
```

#### Master configuration vs run configuration

If you specify both master and run configurations the run configuration properties have priority over master configuration ones:

```node
let patcher = require("pg-patch").create({
    a: 1,
    b: 2
});

patcher.run({
    a: 3
});
```

above code is equal to:

```node
let patcher = require("pg-patch").create();

patcher.run({
    a: 3,
    b: 2
});
```
#### Using configuration file

If you create `.pgpatchrc.json` file **pg-patch** will use it as a source for initial configuration.   
This configuration file needs to be in the same firectory from which node command is run.
 
Example of `.pgpatchrc.json`:

```json
{
  "logLevel": "LOG",
  "client": "postgres://user:password@host:port/database",
  "dryRun": "LOG_ONLY"
}
```


### Working with async API

Any **pg-patch** process returns a promise.

```node
require("pg-patch").run(/*
    any config
*/).then(function(){
    //handle success
}, function(err){
    //handle error
});
```

### Connecting to the PostgreSQL

There are currently 3 ways in which pg-patch will try to connect to PostgreSQL.

#### a) Create **pg.Client** based on ENV variables **(default)**

This happens when no **client** is set in the configuration:

```node
//the same for .run()
require("pg-patch").create({
    //contains no client property
});
```

#### b) Create **pg.Client** based on passed clientConfig

```node
//the same for .run()
require("pg-patch").create({
    client: clientConfig
});
```

Client configuration object work exactly as in **[pg](https://www.npmjs.com/package/pg)** package.

```node
let clientConfig = {
    user: 'foo', //env var: PGUSER
    database: 'my_db', //env var: PGDATABASE
    password: 'secret', //env var: PGPASSWORD
    host: 'localhost', // Server hosting the postgres database
    port: 5432, //env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
};
```

You can also use connection strings:

```node
let clientConfig = 'postgres://user:password@host:port/database';
```

For more about **pg.Client** configuration check **[pg](https://www.npmjs.com/package/pg)** npm package.

#### c) Use passed **pg.Client** instance

```node
let pg = require('pg');
let pgClientInstance = new pg.Client({
    //configuration
});

//the same for .run()
require("pg-patch").create({
    client: pgClientInstance
});
```

**IMPORTANT:** passed **pg.Client** instances are not closed automatically by **pg-patch**.

If You need to close them you can do this using promise handlers.

```node
require("pg-patch").run({
    client: pgClientInstance
}).then(function(){
    pgClientInstance.end();
}, function(err){
    pgClientInstance.end();
});
```

### Step by step migration

To perform migration one step at a time:

```node
let pgPatch = require("pg-patch");

pgPatch.stepUp(/* configuration */); //migrate one version up

pgPatch.stepDown(/* configuration */); //migrate one version down
```

Similarly for the command line tool supply `stepUp`/`stepDown` flag:

```
pg-patch --stepUp
```

```
pg-patch --stepDown
```

Other configuration options can be passed as usual, but for obvious reasons `targetVersion` will be ignored.

    
### Some quick copy'n'run examples

#### a) Custom patch dir & DB table configuration:
```node
require("pg-patch").run({
    patchDir: 'my-db-patches',
    dbTable: 'public.myPatchControlTable'
});
```

#### b) Custom pg.Client config:
```node
require("pg-patch").run({
    client: {
        user: 'me',
        database: 'my_db',
        password: 'pass',
        host: 'localhost',
        port: 5432
    }
});
```

#### c) Custom target version:
```node
require("pg-patch").run({
    targetVersion: 10
});
```

### Command line tool

To use **pg-patch** as a command line tool first install it globally:

```
npm i pg-patch -g
```

Afterwards its as easy as running:

```
pg-patch
```

Supply configuration by using command line arguments:

```
pg-patch --logLevel=INFO --client=postgres://user:password@host:port/database
```

List of possible **[configuration properties](#configuration-cheatsheet)** is the same as usual.

For detailed description about passing command line arguments see **[yargs](https://www.npmjs.com/package/yargs)**

## Advanced usage

So you want more? Granted!

### Custom patch data sources

* added in: `1.2.0`
* **Important:** Supplying custom patch data does not disable standard file-searching behaviour.   
    All found patch data sources will be used when migrating. 

If you don't keep your patch data as files or access to these files is not supported by `pg-patch` (for example FTP) you can supply such data by yourself:

```node
let pgPatch = require("pg-patch");

pgPatch.run({
    customPatchData: [
        customPatchDataObj1,
        customPatchDataObj2
        /* ... */
    ]
})
```

where `customPatchDataObjectX` needs to conform to given format:

```node
//update 0 => 1
{
    description: 'customDescription',  //not required
    action: 'UPDATE',                  //'UPDATE' or 'ROLLBACK'
    version: '1',                      //version to update TO or rollback FROM
    sql: 'select 1234;'                //any valid SQL (without transaction statements)
}
```

Custom patch data objects can be supplied in any order.   

### Transaction control

#### a) `PER_VERSION_STEP` (default)

```node
require("pg-patch").run({
    transactionMode: 'PER_VERSION_STEP'
});
```
    
In this transaction mode when You want to change DB version by more than one version **each update/rollback step will be contained in separate transaction block**. 

So if you want to move from version **X** to version **X+5** and error happens during **X+3**:

* **X+4** and **X+5** updates won't be even tried
* **X+3** update will be tried and rolled back due to an error
* whole patch process will end with error (Promise.reject)
* **BUT** the resulting DB version will be **X+2**

#### b) `SINGLE`

```node
require("pg-patch").run({
    transactionMode: 'SINGLE'
});
```
    
In this transaction mode when You want to change DB version by more than one version **all update/rollback steps will be contained in single transaction block**. 

So if you want to move from version **X** to version **X+5** and error happens during **X+3**:

* **X+4** and **X+5** updates will never be tried
* **X+3**, **X+2** and **X+1** updates will be rolled back
* whole patch process will end with error (Promise.reject)
* the resulting DB version will be **X**

### Multiple patch files per update/rollback step 

Each patch action step (ex. update action to version X) can be comprised of many patch files.
**Those files can be in ANY subdirectory of pg-patch**.

If given action step has multiple patch files they will be run in order of ascending descriptions.

If two or more patch files for given action step have the same description it is assumed they can be run in any order. 

So if **update to X** action has given patch files:

* `patch-X-up-want-this-first.sql`
* `patch-X-up.sql`
* `subdir1/patch-X-up-data-part-2.sql`
* `subdir2/patch-X-up-data-part-1.sql`
* `structure/patch-X-up-0001-structure.sql`
* `data/patch-X-up-0002-data.sql`

they will be joined in this order: 

* `patch-X-up.sql` **(no descriptions first)**
* `structure/patch-X-up-0001-structure.sql` **(subdirectories are ignored)**
* `data/patch-X-up-0002-data.sql`
* `subdir2/patch-X-up-data-part-1.sql`
* `subdir1/patch-X-up-data-part-2.sql`
* `patch-X-up-want-this-first.sql`

### Dry runs

Dry runs are basically test runs to verify validity of patch files (either manually or directly on DB).   
**pg-patch** supports two types of dry run:

#### a) `LOG_ONLY`

```node
require("pg-patch").run({
    dryRun: 'LOG_ONLY'
});
```

This **WILL NOT** execute any patch SQL on DB. Maintenance SQL required for **pg-patch** to work will still be run.   
All patch SQL will be instead written to console on `INFO` level.

#### b) `TEST_SQL`

```node
require("pg-patch").run({
    dryRun: 'TEST_SQL'
});
```

This **WILL** execute patch SQL on DB using transaction mode `SINGLE`.   
Patch process will fully rollback either on first error or after successful execution of patch SQL.

### Configurable log

It is possible to set desired configuration level. **(default: 'INFO')**
```node
require("pg-patch").run({
    logLevel: 'SUCCESS'  //valid values: 'DEBUG', 'LOG', 'INFO', 'WARN', 'SUCCESS', 'ERROR', 'NONE'
});
```

...as well as it being colorful: **(default: true)**
```node
require("pg-patch").run({
    enableColorfulLogs: false
});
```

### Custom patch file template

By default all patch files need to match given regex template: `^patch-$VERSION-$ACTION(?:-$DESCRIPTION)?\\.sql$`   
Each `$VAR` has distinct logic usage but for the regex purposes are shortcuts for:

+ `$VERSION` — `\\d+`   
Version associated with `$ACTION`.
+ `$ACTION` — `up|rb`  
Action to perform. `up` means "update TO `$VERSION`" where `rb` means "rollback FROM `$VERSION`".
+ `$SOURCE` — `\\d+`   
Source version. Can only be used with `$TARGET`.
+ `$TARGET` — `\\d+`  
Target version. Can only be used together with `$SOURCE`.
+ `$DESCRIPTION` — `[0-9a-zA-Z\-\_]+`   
Optional description.

**Important:** template requires (`$VERSION` AND `$ACTION`) OR (`$SOURCE` AND `$TARGET`).   
Those cannot be combined.

Double backslashes in above replacements are required due to how `new Regex()` works.   
Each of those `$VARS` are then inserted are regex groups (that is the reason why `$ACTION` can look like it looks).

So in case of default template `^patch-$VERSION-$ACTION(?:-$DESCRIPTION)?\\.sql$` the final regex is this:   
`^patch-(?:\d+)-(?:up|rb)(?:-(?:[0-9a-zA-Z-_]+))?\.sql$`

Don't worry if You don't fully understand above.   
What matters that You can easily change how it works.

#### Custom patch file template examples

* Patch files should only contain version and action:   
   ```node
   require("pg-patch").run({
       patchFileTemplate : '^$VERSION-$ACTION\\.sql$'
   });
   ```
   
* Patch files should REQUIRE a description and start with patch-:   
  ```node
  require("pg-patch").run({
      patchFileTemplate : '^patch-$VERSION-$ACTION-$DESCRIPTION\\.sql$'
  });
  ```

### Reporters (beta)  
* added in: `1.1.0`
* **IMPORTANT**: reporters API is not set to stone - be aware it can be changed in future **MINOR** versions. 

**pg-patch** supports custom reporters. The easiest way to do this is to just supply notify method:

``` node
let pgPatcher = require("pg-patch");

let patcher = pgPatcher.create({
    notify: [{
        '^PROCESS:.*': function(data, params, combinedParams){
            //do something with 'PROCESS:*' notifications
        },
        '^PATCH.*': function(data, params, combinedParams){
            //do something with 'PATCH*' notifications
        }
    }]
})
```

above is a shortcut to creating `basicReporter`:

``` node
let pgPatcher = require("pg-patch");
let basicReporter = new pgPatcher.reporters.basic({
    '^PROCESS:.*': function(data, params, combinedParams){
        //do something with 'PROCESS:*' notifications
    },
    '^PATCH.*': function(data, params, combinedParams){
        //do something with 'PATCH*' notifications
    }
});

let patcher = pgPatcher.create({
    reporters: [
       basicReporter 
    ]
})
```

If you would like to check all currently possible messages please check `lib/reporters/console-reporter.js` file.


## Configuration cheatsheet

+ **client** — Type: `Object|String` Default: `null`   
DB connection client / settings. See **[Connecting to the PostgreSQL](#connecting-to-the-postgresql)**.

+ **customPatchData** — Type: `Array` Default: `null`   
Supplies `pg-patch` with custom patch data. See **[Custom patch data sources](#custom-patch-data-sources)**.

+ **dbTable** — Type: `String` Default: `public.pgpatch`   
**pg-patch** maintenance table to be used. Can also define schema: **schema.table**. If no `schema` is passed `public` is assumed.

+ **dryRun** — Type: `String` Default: `null`   
Run patch in dry run mode? See **[Dry runs](#dry-runs)**.

+ **enableColorfulLogs** — Type: `Boolean` Default: `true`   
Should colors be used in log?

+ **logLevel** — Type: `String` Default: `INFO`   
Configures how much log information will be shown.

+ **patchDir** — Type: `String` Default: `pg-patch`   
Directory where patch files can be found.

+ **patchFileTemplate** — Type: `String` Default: `^patch-$VERSION-$ACTION(?:-$DESCRIPTION)?\\.sql$`   
Patch file name template. See **[Custom patch file template](#custom-patch-file-template)**.

+ **sourceVersion** — Type: `Integer` Default: `null`   
Version from which patch DB. **When not passed current version is used**.
<br/>**IMPORTANT:** Normally this should not be used as it breaks normal patching route. Use only when really needed.

+ **targetVersion** — Type: `Integer` Default: `null`   
Version to which patch DB. **If not passed newest patch file version is used**.

+ **transactionMode** — Type: `String` Default: `PER_VERSION_STEP`   
Transaction mode to be used when patching DB. See **[Transaction control](#transaction-conrtol)**.

## Common pitfalls

1. Make sure DB user you're using has sufficient priviledges to run patch files.
2. Do **NOT** include transaction control SQL (`BEGIN;` `COMMIT;` `ROLLBACK;` etc.) into your patch files.
3. Patch files need to be incremental and in steps of 1 version.   
Specifying jump from version `1` to version `5` in one file will not work.
4. Initial version number is `0`. So first patch file needs to update to version `1`.

## Testing

To test **pg-patch** simply run:

```
gulp test
```

## Licence

ISC License

Copyright (c) 2016, Łukasz Drożdż

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.