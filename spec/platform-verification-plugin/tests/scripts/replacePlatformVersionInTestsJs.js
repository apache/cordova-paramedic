const fs = require('fs');
const parseJson = require('parse-json');
const path = require('path');

module.exports = async function (ctx) {
    const filePath = path.resolve(ctx.opts.projectRoot, 'plugins', 'fetch.json');
    const json = parseJson(fs.readFileSync(filePath, { encoding: 'utf-8' }));

    var platform = json['platform-verification-plugin-tests'].variables.PLATFORM;
    var version = json['platform-verification-plugin-tests'].variables.VERSION;
    var model = json['platform-verification-plugin-tests'].variables.MODEL;

    const filePath2 = path.resolve(ctx.opts.plugin.dir, 'tests.js');
    var testsJs = fs.readFileSync(filePath2, { encoding: 'utf-8' });

    // replace comparison values in test
    testsJs = testsJs.replace('foo', platform);
    testsJs = testsJs.replace('1.2', version);
    testsJs = testsJs.replace('bar', model);

    // disable tests where we have no useful comparison value
    if (platform === 'undefined') {
        testsJs = testsJs.replace("it('.platform", "xit('.platform");
    }
    if (version === 'undefined') {
        testsJs = testsJs.replace("it('.version", "xit('.version");
    }
    if (model === 'undefined') {
        testsJs = testsJs.replace("it('.model", "xit('.model");
    }

    fs.writeFileSync(filePath2, testsJs);

    console.log('hook: updated `platform` and `version` in `tests.json`: ', platform, version, model);
};
