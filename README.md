# pg-patch

PostgreSQL DB patching made easy.

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

### planned:

* Migration history
* Report generation support
* Command line support
* Configuration file support

## Preparation

### Patch files
All patch files need to:

1. Be inside patch directory: **'pg-patch'** (or in any subdirectory)
2. Follow naming convention: **'[$TIMESTAMP-]patch-$VERSION-$ACTION[-$DESCRIPTION].sql'**:

    Where:
       
    * **$VERSION** - positive non-zero integer (leading zeros accepted)
    * **$ACTION** - up/rb for update to version and rollback from version respectively
    * **$DESCRIPTION** - any string matching **[0-9a-zA-Z\-\_]+**
    
    Example of valid patch file names:
    
    * **patch_1_up-update-to-version-1.sql**
    * **patch_1_rb-rollback-from-version-1.sql**
    * **patch_2_up.sql**
 
Above parameters can be configured. (check **Configuration** section)

### Configuration file

N/A

## Basic usage

#### Smallest working example

Easiest way to use pg-patch is:

```node
require("pg-patch").run();
```

Above code would use default configuration settings (see: **Configuration** section)
and load DB connection settings from ENV variables. (see **node-postgres** npm package)

It is also possible to create patcher instance and run it separately:

```node
let patcher = require("pg-patch").create();

//do something

patcher.run();
```

Both above examples have the same result.

#### Supplying run-time configuration

You can both supply configuration for given run:

```node
require("pg-patch").run(configObject);
```

As well as setting master configuration for pg-patch instance

```node
let patcher = require("pg-patch").create(configObject);
```

##### Master configuration vs run configuration

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

#### Connecting to the PostgreSQL

There are currently 3 ways in which pg-patch will try to connect to PostgreSQL.

1. Create **pg.Client** based on ENV variables **(default)**

    This happens when no **client** is set in the configuration:

    ```node
    //the same for .run()
    require("pg-patch").create({
        //contains no client property
    });
    ```

2. Create **pg.Client** based on passed clientConfig

    ```node
    //the same for .run()
    require("pg-patch").create({
        client: clientConfig
    });
    ```

    Client configuration object work exactly as in **[node-postgres](http://github.com/brianc/node-postgres)** npm package.

    ```node
    //configObject example
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

    For more about **pg.Client** configuration check **node-postgres** npm package.

3. Use passed **pg.Client** instance

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

    If You need to close them you can do this by using supplied done method.

    ```node
    require("pg-patch").run({
        client: pgClientInstance
    }).then(function(){
        pgClientInstance.end();
    }, function(err){
        pgClientInstance.end();
    });
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

## Miscellaneous

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