'use strict';

const gulp = require('gulp');

const jshint = require('gulp-jshint');
const jasmine = require('gulp-jasmine');
const JasmineConsoleReporter = require('jasmine-console-reporter');
const argv = require('yargs').argv;

gulp.task('lint', () =>
    gulp.src(['lib/*.js'])
        .pipe(jshint())
        .pipe(jshint.reporter('default'))
);

gulp.task('test', () => {

    let files = argv.subset ? `test/unit/*${argv.subset}*.js` : `test/unit/*.js`;

    return gulp.src([files])
        .pipe(jasmine({
            reporter: new JasmineConsoleReporter({
                colors: 1,
                cleanStack: 1,
                verbosity: 4,
                listStyle: 'indent',
                activity: false
            })
        }));
});