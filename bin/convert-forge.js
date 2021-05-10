#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { AuthenticationClient } = require('forge-server-utils');
const { downloadProperties } = require('../forge');
const { createDatabase } = require('../database');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET, FORGE_ACCESS_TOKEN } = process.env;

async function convert(urn, outputFile) {
    let token = null;
    if (FORGE_ACCESS_TOKEN) {
        token = FORGE_ACCESS_TOKEN;
    } else if (FORGE_CLIENT_ID && FORGE_CLIENT_SECRET) {
        const client = new AuthenticationClient(FORGE_CLIENT_ID, FORGE_CLIENT_SECRET);
        token = await client.authenticate(['viewables:read']);
    } else {
        throw new Error('Missing authentication. Provide FORGE_CLIENT_ID and FORGE_CLIENT_SECRET env. vars, or FORGE_ACCESS_TOKEN.');
    }
    const pdb = await downloadProperties(urn, token);
    fs.ensureDirSync(path.dirname(outputFile));
    createDatabase(outputFile, pdb);
}

if (process.argv.length < 4) {
    console.log('Usage:');
    console.log('# Set FORGE_CLIENT_ID and FORGE_CLIENT_SECRET env. vars, or a single FORGE_ACCESS_TOKEN env. var');
    console.log('convert-forge <URN> <output sqlite filename>');
} else {
    convert(process.argv[2], process.argv[3])
        .then(() => console.log('Done!'))
        .catch(err => console.error(err));
}
