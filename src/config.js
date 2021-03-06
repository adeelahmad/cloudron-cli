/* jshint node:true */

'use strict';

var fs = require('fs'),
    path = require('path'),
    safe = require('safetydance'),
    _ = require('underscore');

exports = module.exports = {
    clear: clear,
    set: set,
    get: get,
    unset: unset,
    has: has,

    // convenience
    token: function () { return get('token'); },
    appStoreToken: function () { return get('appStoreToken'); },
    cloudron: function () { return get('cloudron'); },
    provider: function () { return get('provider'); },
    apiEndpoint: function () { return get('apiEndpoint'); },
    appStoreOrigin: function () { return get('appStoreOrigin'); }
};

var HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
var CONFIG_FILE_PATH = path.join(HOME, '.cloudron.json');

var gConfig = (function () {
    var c = safe.JSON.parse(safe.fs.readFileSync(CONFIG_FILE_PATH)) || {};

    // precedence: env var, config file, default
    if (process.env.APPSTORE_ORIGIN) {
        c.appStoreOrigin = process.env.APPSTORE_ORIGIN;
    } else if (!c.appStoreOrigin) {
        c.appStoreOrigin = 'https://api.cloudron.io';
    }

    return c;
})();

function save() {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(gConfig, null, 4));
}

function clear() {
    safe.fs.unlinkSync(CONFIG_FILE_PATH);
}

function set(key, value) {
    if (typeof key === 'object') {
        _.extend(gConfig, key);
    } else {
        safe.set(gConfig, key, value);
    }
    save();
}

function get(key) {
    return safe.query(gConfig, key);
}

function unset(key /*, .... */) {
    for (var i = 0; i < arguments.length; i++) {
        gConfig = safe.unset(gConfig, arguments[i]);
    }

    save();
}

function has(key /*, ... */) {
    for (var i = 0; i < arguments.length; i++) {
        if (!(arguments[i] in gConfig)) return false;
    }
    return true;
}
