'use strict';

var assert = require('assert'),
    helper = require('../helper.js'),
    readlineSync = require('readline-sync'),
    superagent = require('superagent'),
    Table = require('easy-table'),
    tasks = require('./tasks.js'),
    util = require('util'),
    versions = require('./versions.js');

exports = module.exports = {
    create: create,
    listBackups: listBackups,
    createBackup: createBackup,
    login: helper.login
};

var gCloudronApiEndpoint = null;

function createUrl(api) {
    assert.strictEqual(typeof gCloudronApiEndpoint, 'string');
    assert.strictEqual(typeof api, 'string');

    return 'https://' + gCloudronApiEndpoint + api;
}

function create(options) {
    assert.strictEqual(typeof options, 'object');

    var region = options.region;
    var accessKeyId = options.accessKeyId;
    var secretAccessKey = options.secretAccessKey;
    var backupBucket = options.backupBucket;
    var release = options.release;
    var type = options.type;
    var key = options.key;
    var domain = options.domain;
    var subnet = options.subnet;
    var securityGroup = options.securityGroup;

    if (!region) helper.missing('region');
    if (!accessKeyId) helper.missing('access-key-id');
    if (!secretAccessKey) helper.missing('secret-access-key');
    if (!backupBucket) helper.missing('backup-bucket');
    if (!release) helper.missing('release');
    if (!type) helper.missing('type');
    if (!key) helper.missing('key');
    if (!domain) helper.missing('domain');
    if (!subnet) helper.missing('subnet');
    if (!securityGroup) helper.missing('security-group');

    versions.resolve(release, function (error, result) {
        if (error) helper.exit(error);

        var params = {
            region: region,
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
            backupBucket: backupBucket,
            version: result,
            type: type,
            key: key,
            domain: domain,
            subnet: subnet,
            securityGroup: securityGroup
        };

        tasks.create(params, function (error) {
            if (error) helper.exit(error);

            console.log('Done.'.green, 'You can now use your Cloudron at ', String('https://my.' + domain).bold);
            console.log('');

            helper.exit();
        });
    });
}

function login(cloudron, options, callback) {
    assert.strictEqual(typeof cloudron, 'string');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    helper.detectCloudronApiEndpoint(cloudron, function (error, result) {
        if (error) helper.exit(error);

        gCloudronApiEndpoint = result.apiEndpoint;

        console.log();
        console.log('Enter credentials for ' + cloudron.cyan.bold + ':');

        var username = options.username || readlineSync.question('Username: ', {});
        var password = options.password || readlineSync.question('Password: ', { noEchoBack: true });

        superagent.post(createUrl('/api/v1/developer/login')).send({
            username: username,
            password: password
        }).end(function (error, result) {
            if (error) helper.exit(error);
            if (result.statusCode === 412) {
                helper.showDeveloperModeNotice(cloudron);
                return login(cloudron, options, callback);
            }
            if (result.statusCode !== 200) {
                console.log('Login failed.'.red);
                return login(cloudron, options, callback);
            }

            console.log('Login successful.'.green);

            callback(null, result.body.token);
        });
    });
}

function listBackups(cloudron, options) {
    assert.strictEqual(typeof cloudron, 'string');
    assert.strictEqual(typeof options, 'object');

    login(cloudron, options, function (error, token) {
        if (error) helper.exit(error);

        superagent.get(createUrl('/api/v1/backups')).query({ access_token: token }).end(function (error, result) {
            if (error) helper.exit(error);
            if (result.statusCode !== 200) return helper.exit(util.format('Failed to list backups.'.red, result.statusCode, result.text));

            var t = new Table();

            result.body.backups.forEach(function (backup) {
                t.cell('Id', backup.id);
                t.cell('Creation Time', backup.creationTime);
                t.cell('Version', backup.version);
                // t.cell('Apps', backup.dependsOn.join(' '));

                t.newRow();
            });

            console.log();
            console.log(t.toString());

            helper.exit();
        });
    });
}

function createBackup(cloudron, options) {
    assert.strictEqual(typeof cloudron, 'string');
    assert.strictEqual(typeof options, 'object');

    login(cloudron, options, function (error, token) {
        if (error) helper.exit(error);

        superagent.post(createUrl('/api/v1/backups')).query({ access_token: token }).send({}).end(function (error, result) {
            if (error) helper.exit(error);
            if (result.statusCode !== 202) return helper.exit(util.format('Failed to backup box.'.red, result.statusCode, result.text));

            process.stdout.write('Waiting for box backup to finish...');

            function checkStatus() {
                superagent.get(createUrl('/api/v1/cloudron/progress')).query({ access_token: token }).end(function (error, result) {
                    if (error) return helper.exit(error);
                    if (result.statusCode !== 200) return helper.exit(new Error(util.format('Failed to get backup progress.'.red, result.statusCode, result.text)));

                    if (result.body.backup.percent >= 100) {
                        if (result.body.backup.message) return helper.exit(new Error('Backup failed: ' + result.body.backup.message));

                        console.log('\n\nBox is backed up'.green);
                        helper.exit();
                    }

                    process.stdout.write('.');

                    setTimeout(checkStatus, 1000);
                });
            }

            checkStatus();
        });
    });
}
