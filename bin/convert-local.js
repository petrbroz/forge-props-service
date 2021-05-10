#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const { createDatabase } = require('../database');

function convert(inputDir, outputFile) {
    const read = (filename) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(inputDir, filename))).toString());
    const pdb = {
        _ids: read('objects_ids.json.gz'),
        _offsets: read('objects_offs.json.gz'),
        _avs: read('objects_avs.json.gz'),
        _attrs: read('objects_attrs.json.gz'),
        _vals: read('objects_vals.json.gz'),
    };
    fs.ensureDirSync(path.dirname(outputFile));
    createDatabase(outputFile, pdb);
}

if (process.argv.length < 4) {
    console.log('Usage:');
    console.log('convert-local <input folder with *.json.gz files> <output sqlite filename>');
} else {
    convert(process.argv[2], process.argv[3]);
}
