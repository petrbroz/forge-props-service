#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { PropertyDbReader } = require('../forge');
const { createDatabase } = require('../database');

async function convert(inputDir, outputFile) {
    const read = (filename) => fs.readFileSync(path.join(inputDir, filename));
    const pdb = new PropertyDbReader(
        read('objects_ids.json.gz'),
        read('objects_offs.json.gz'),
        read('objects_avs.json.gz'),
        read('objects_attrs.json.gz'),
        read('objects_vals.json.gz')
    );
    fs.ensureDirSync(path.dirname(outputFile));
    await createDatabase(outputFile, pdb);
}

if (process.argv.length < 4) {
    console.log('Usage:');
    console.log('convert-local <input folder with *.json.gz files> <output sqlite filename>');
} else {
    convert(process.argv[2], process.argv[3])
        .then(() => console.log('Done!'))
        .catch(err => console.error(err));
}
