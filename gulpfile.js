const gulp = require('gulp');

const jshint = require('gulp-jshint');
const jasmine = require('gulp-jasmine');
const JasmineConsoleReporter = require('jasmine-console-reporter');


gulp.task('lint', () =>
    gulp.src(['lib/*.js'])
        .pipe(jshint())
        .pipe(jshint.reporter('default'))
);

gulp.task('test', () =>
    gulp.src(['test/unit/*.js'])
        .pipe(jasmine({
            reporter: new JasmineConsoleReporter({
                colors: 1,           // (0|false)|(1|true)|2
                cleanStack: 1,       // (0|false)|(1|true)|2|3
                verbosity: 4,        // (0|false)|1|2|(3|true)|4
                listStyle: 'indent', // "flat"|"indent"
                activity: false
            })
        }))
);