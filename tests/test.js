#!/usr/bin/env node

/* global it:false */
/* global xit:false */
/* global describe:false */
/* global before:false */
/* global xdescribe:false */
/* global after:false */

'use strict';

var child_process = require('child_process'),
    crypto = require('crypto'),
    expect = require('expect.js'),
    fs = require('fs'),
    path = require('path'),
    safe = require('safetydance'),
    util = require('util');

var cloudron = process.env.CLOUDRON;
var username = process.env.USERNAME;
var password = process.env.PASSWORD;
var applocation = 'loctest';
var app;

var CLI = path.resolve(__dirname + '/../main.js');

function md5(file) {
    var data = fs.readFileSync(file);
    var hash = crypto.createHash('md5').update(data).digest('hex');
    return hash;
}

function cli(args, options) {
    // https://github.com/nodejs/node-v0.x-archive/issues/9265
    options = options || { };
    args = util.isArray(args) ? args : args.match(/[^\s]+|"[^"]+"/g); // http://stackoverflow.com/questions/2817646/javascript-split-string-on-space-or-on-quotes-to-array

    // we cannot capture stdout and also use 'inherit' flags. because of this we force tty mode to fake tty code path in cli tool
    if (args[0] === 'exec' && options.stdin) {
        args.splice(1, 0, '--track-stdin');
    }

    console.log('cloudron ' + args.join(' '));

    try {
        var cp = child_process.spawnSync(CLI, args, { stdio: [ options.stdin || 'pipe', options.stdout || 'pipe', 'pipe' ], encoding: options.encoding || 'utf8' });
        return cp;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

before(function (done) {
    if (!process.env.CLOUDRON) return done(new Error('CLOUDRON env var not set'));
    if (!process.env.USERNAME) return done(new Error('USERNAME env var not set'));
    if (!process.env.PASSWORD) return done(new Error('PASSWORD env var not set'));

    done();
});

after(function (done) {
    done();
});

describe('Login', function () {
    it('can login', function (done) {
        var out = cli(util.format('login %s --username %s --password %s', cloudron, username, password));
        expect(out.stdout.indexOf('Login successful')).to.not.be(-1);
        done();
    });
});

describe('App install', function () {
    this.timeout(0);

    it('can install app', function () {
        console.log('Installing app, this can take a while');
        var out = cli('install --appstore-id com.hastebin.cloudronapp --new --wait --location ' + applocation);
        expect(out.stdout).to.contain('App is installed');
    });
});

describe('Inspect', function () {
    it('can inspect app', function () {
        var inspect = JSON.parse(cli('inspect').stdout);
        app = inspect.apps.filter(function (a) { return a.location === applocation; })[0];
        expect(app).to.not.be(null);
    });
});

describe('Exec', function () {
    it('can execute a command and see stdout', function () {
        var out = cli(util.format('exec --app %s -- ls -l /app/code', app.id));
        expect(out.stdout).to.contain('total');
    });

    it('can execute a command and see stderr', function () {
        var out = cli(util.format('exec --app %s -- ls /blah', app.id));
        expect(out.stderr).to.contain('ls: cannot access');
    });

    it('can get binary file in stdout', function (done) {
        var outstream = fs.createWriteStream('/tmp/clitest.ls');
        outstream.on('open', function () { // execSync underlying stream needs an fd which is available only after open event
            cli(util.format('exec --app %s -- cat /bin/ls', app.id), { stdout: outstream, encoding: 'binary' });
            expect(md5('/tmp/clitest.ls')).to.contain('7a92ef62f96553224faece68289b4fc3');
            fs.unlinkSync('/tmp/clitest.ls');
            done();
        });
    });

    xit('can pipe stdin to exec command', function () {
        var randomBytes = require('crypto').randomBytes(256);
        fs.writeFileSync('/tmp/randombytes', randomBytes);
        var randomBytesMd5 = crypto.createHash('md5').update(randomBytes).digest('hex');

        cli(util.format('exec --app %s -- bash -c "cat - > /app/data/sauce"', app.id), { stdin: randomBytes });
        cli(util.format('exec --app %s md5sum /app/data/sauce', app.id)).stdout.to.contain(randomBytesMd5);
    });
});

describe('Push', function () {
    it('can push a file', function () {
        var testFile = __dirname + '/test.js';
        cli(util.format('push --app %s %s /tmp/test2.js', app.id, testFile));
        var out = cli(util.format('exec --app %s md5sum /tmp/test2.js', app.id));
        expect(out.stdout).to.contain(md5(testFile));
    });

    it('can push to directory', function () {
        var testFile = __dirname + '/test.js';
        cli(util.format('push --app %s %s /tmp/', app.id, testFile));
        var out = cli(util.format('exec --app %s md5sum /tmp/test.js', app.id));
        expect(out.stdout).to.contain(md5(testFile));
    });

    it('can push stdin', function () {
        var testFile = __dirname + '/test.js';
        var istream = fs.createReadStream(testFile);
        istream.on('open', function () { // exec requires underlying fd
            cli(util.format('push --app %s - /run/testcopy.js', app.id), { stdin: istream });
            var out = cli(util.format('exec --app %s md5sum /run/testcopy.js', app.id));
            expect(out.stdout).to.contain(md5(testFile));
        });
    });

    xit('can push a directory', function () {
        var testDir = __dirname, testFile = __dirname + '/test.js';
        cli(util.format('push --app %s %s /run', app.id, testDir));
        var out = cli(util.format('exec --app %s md5sum /run/test.js', app.id));
        expect(out.stdout).to.contain(md5(testFile));
    });

    xit('can push a large file', function () {
    });
});

describe('Pull', function () {
    it('can pull a file', function () {
        safe.fs.unlinkSync('/tmp/ls');
        cli(util.format('pull --app %s /bin/ls /tmp/ls', app.id));
        expect(md5('/tmp/ls')).to.be('7a92ef62f96553224faece68289b4fc3');
    });

    xit('can pull a directory', function () {

    });

    xit('can pull to directory', function () {

    });

    xit('can pull to stdout', function () {

    });

    xit('can pull a large file', function () {

    });
});

describe('Status', function () {
    it('can get status', function () {
        var out = cli('status --app ' + app.id);
        expect(out.stdout).to.contain('Run state:  running');
    });
});

describe('Uninstall', function () {
    this.timeout(0);

    it('can uninstall', function () {
        var out = cli('uninstall --app ' + app.id);
        expect(out.stdout).to.contain('successfully uninstalled');
    });
});

describe('Logout', function () {
    it('can logout', function () {
        console.log('Uninstalling app, this can take a while');
        var out = cli('logout');
        expect(out.stdout).to.contain('Logged out');
    });
});
