#!/usr/bin/env node
"use strict";
const typescript_service_1 = require("./typescript-service");
const server = require("./server");
const util = require("./util");
const program = require('commander');
const packageJson = require('../package.json');
const defaultLspPort = 2089;
const numCPUs = require('os').cpus().length;
process.on('uncaughtException', (err) => {
    console.error(err);
});
program
    .version(packageJson.version)
    .option('-s, --strict', 'enabled strict mode')
    .option('-p, --port [port]', 'specifies LSP port to use (' + defaultLspPort + ')', parseInt)
    .option('-c, --cluster [num]', 'number of concurrent cluster workers (defaults to number of CPUs, ' + numCPUs + ')', parseInt)
    .option('-t, --trace', 'print all requests and responses')
    .option('-l, --logfile [file]', 'also log to this file (in addition to stderr)')
    .parse(process.argv);
util.setStrict(program.strict);
const lspPort = program.port || defaultLspPort;
const clusterSize = program.cluster || numCPUs;
const options = {
    clusterSize: clusterSize,
    lspPort: lspPort,
    strict: program.strict,
    trace: program.trace,
    logfile: program.logfile
};
server.serve(options, () => new typescript_service_1.TypeScriptService());
//# sourceMappingURL=language-server.js.map