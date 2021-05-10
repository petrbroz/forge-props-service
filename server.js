const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader } = require('forge-convert-utils');
const { createDatabase, queryDatabase, DEFAULT_QUERY } = require('./database');

const PORT = process.env.PORT || 3000;
const CACHE_FOLDER = path.join(__dirname, 'cache');

function updateMetadata(urn, callback) {
    const metadataPath = path.join(CACHE_FOLDER, urn, 'metadata.json');
    let metadata = {};
    if (fs.existsSync(metadataPath)) {
        metadata = fs.readJsonSync(metadataPath);
    }
    callback(metadata);
    fs.ensureDirSync(path.dirname(metadataPath));
    fs.writeJsonSync(metadataPath, metadata);
}

async function checkAccess(urn, token) {
    const client = new ModelDerivativeClient({ token });
    await client.getManifest(urn);
}

async function downloadPropertyDB(urn, token) {
    const modelDerivativeClient = new ModelDerivativeClient({ token });
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const viewables = helper.search({ type: 'resource', role: 'graphics' }).filter(d => d.mime === 'application/autodesk-svf');
    if (viewables.length === 0) {
        throw new Error('No viewables found.');
    }
    const svf = await SvfReader.FromDerivativeService(urn, viewables[0].guid, { token });
    const pdb = await svf.getPropertyDb();
    return pdb;
}

const app = express();

app.use('/:urn', async function (req, res, next) {
    req.urn = req.params.urn;
    req.token = req.headers['authorization']?.replace('Bearer ', '');
    try {
        await checkAccess(req.urn, req.token);
    } catch (err) {
        console.error(err);
        res.status(401).end();
        return;
    }
    next();
});

app.post('/:urn', function (req, res) {
    const { urn, token } = req;
    updateMetadata(urn, m => { m.status = 'running'; m.logs = ['Downloading property database.']; });
    downloadPropertyDB(urn, token)
        .then(pdb => {
            updateMetadata(urn, m => { m.logs.push('Creating local sqlite database.'); });
            createDatabase(path.join(CACHE_FOLDER, urn, 'properties.sqlite'), pdb);
            updateMetadata(urn, m => { m.status = 'complete'; m.logs.push('Sqlite database ready to be queried.'); });
        })
        .catch(err => {
            updateMetadata(urn, m => { m.status = 'failed'; m.error = err; });
        });
    res.status(202).end();
});

app.get('/:urn', function (req, res) {
    res.sendFile(path.join(CACHE_FOLDER, req.urn, 'metadata.json'));
});

app.get('/:urn/properties', async function (req, res) {
    const { urn } = req;
    const query = req.query['q'] || DEFAULT_QUERY;
    try {
        res.json(await queryDatabase(path.join(CACHE_FOLDER, urn, 'properties.sqlite'), query));
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
        return;
    }
});

app.listen(PORT, () => { console.log(`Server listening on port ${PORT}`); });
