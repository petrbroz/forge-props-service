const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const { checkAccess, downloadProperties } = require('./forge');
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
    downloadProperties(urn, token)
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
