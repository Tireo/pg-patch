0.8.6 / 2016-12-30
==================
* fixed possible wrong execution order of multiple patch files for one patch step
* maintenance (code coverage, refactoring etc.)

0.8.5 / 2016-12-30
==================
* added CHANGELOG.md file
* maintenance (code coverage, refactoring etc.)

0.8.4 / 2016-12-29
==================
* added LICENCE file
* maintenance (code coverage, refactoring etc.)

0.8.3 / 2016-12-28
==================
* removed `dbSchema` configuration option (integrated into `dbTable` option)
* maintenance (code coverage, refactoring etc.)

0.8.2 / 2016-12-25
==================
* maintenance release (code coverage, refactoring etc.)

0.8.1 / 2016-12-22
==================
* added $SOURCE-$TARGET patch file template capability
* updated README.md

0.8.0 / 2016-12-22
==================
* now tracking patch history (patch-pg db structure migration is automatic)

0.7.0 / 2016-12-21
==================
* added config file support (`.pgpatchrc.json`)
* updated README.md

0.6.1 / 2016-12-20
==================
* updated README.md

0.6.0 / 2016-12-20
==================
* updated README.md
* command line support

0.5.0 / 2016-12-19
==================
* Initial public npm publish
* Automatic migration from current version (or clean state) to newest version
* Configurable source and target version
* Step by step forward / backward migration
* Transactional migration with transaction strategy setting:
    * per migration step (rollback only failed step and end process)
    * per migration process (rollback whole migration process)
* Dry runs: 
    * log only (no DB manipulation with patch SQL)
    * single transaction with rollback at the end (or first error)
* Recursive subfolder checking for patch files
* Support for splitting migration step SQL into few files
* Configurable patch file name template
* Current version tracking
* Configurable log level
* Promise interface