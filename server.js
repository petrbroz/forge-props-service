const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader } = require('forge-convert-utils');
const { Database } = require('./sqlite');

const PORT = env.PORT || 3000;
const CACHE_FOLDER = path.join(__dirname, 'cache');
const DEFAULT_QUERY = `
    SELECT ids.ent_id AS dbid, attrs.category AS prop_category, attrs.name AS prop_name, vals.value AS prop_value
    FROM objects_avs avs
    LEFT JOIN objects_ids ids ON ids.ent_id = avs.ent_id
    LEFT JOIN objects_attrs attrs ON attrs.attr_id = avs.attr_id
    LEFT JOIN objects_vals vals on vals.val_id = avs.val_id
    WHERE prop_category NOT LIKE '\\_\\_%\\_\\_' ESCAPE '\\'
    ORDER BY dbid
`;

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

async function preparePropertyDB(urn, token) {
    updateMetadata(urn, m => { m.status = 'running'; m.logs.push('Converting property database into sqlite.'); });
    try {
        const modelDerivativeClient = new ModelDerivativeClient({ token });
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const viewables = helper.search({ type: 'resource', role: 'graphics' }).filter(d => d.mime === 'application/autodesk-svf');
        if (viewables.length === 0) {
            throw new Error('No viewables found.');
        }
        const svf = await SvfReader.FromDerivativeService(urn, viewables[0].guid, { token });
        const pdb = await svf.getPropertyDb();
        const ids = pdb._ids;
        const offs = pdb._offsets;
        const avs = pdb._avs;
        const attrs = pdb._attrs;
        const vals = pdb._vals;

        const db = new Database(path.join(CACHE_FOLDER, urn, 'properties.sqlite'));
        await db.runAsync('CREATE TABLE objects_avs (ent_id INTEGER, attr_id INTEGER, val_id INTEGER)');
        await db.runAsync('CREATE TABLE objects_ids (ent_id INTEGER PRIMARY KEY, external_id TEXT)');
        await db.runAsync('CREATE TABLE objects_attrs (attr_id INTEGER PRIMARY KEY, name TEXT, category TEXT)');
        await db.runAsync('CREATE TABLE objects_vals (val_id INTEGER PRIMARY KEY, value TEXT)');
    
        for (let i = 1, len = ids.length; i < len; i += 100) {
            const page = ids.slice(i, Math.min(i + 100, len));
            const query = 'INSERT INTO objects_ids VALUES ' + page.map(_ => '(?, ?)').join(',');
            const params = page.reduce((prev, curr, index) => { prev.push(i + index, curr); return prev; }, []);
            await db.runAsync(query, params);
        }
        for (let i = 1, len = attrs.length; i < len; i += 1000) {
            const page = attrs.slice(i, Math.min(i + 1000, len));
            const query = 'INSERT INTO objects_attrs VALUES ' + page.map(_ => '(?, ?, ?)').join(',');
            const params = page.reduce((prev, curr, index) => { prev.push(i + index, curr[0], curr[1]); return prev; }, []);
            await db.runAsync(query, params);
        }
        for (let i = 1, len = vals.length; i < len; i += 1000) {
            const page = vals.slice(i, Math.min(i + 1000, len));
            const query = 'INSERT INTO objects_vals VALUES ' + page.map(_ => '(?, ?)').join(',');
            const params = page.reduce((prev, curr, index) => { prev.push(i + index, curr); return prev; }, []);
            await db.runAsync(query, params);
        }
        for (let i = 1, len = offs.length; i < len; i++) {
            const page = avs.slice(offs[i] * 2, i < len - 1 ? offs[i + 1] * 2 : avs.length);
            if (page.length === 0) {
                continue;
            }
            const query = 'INSERT INTO objects_avs VALUES ' + Array(page.length / 2).fill(`(${i}, ?, ?)`).join(',');
            await db.runAsync(query, page);
        }
        await db.closeAsync();
    } catch (err) {
        updateMetadata(urn, m => { m.status = 'failed'; m.logs.push('Could not create sqlite.'); m.error = err; });
        return;
    }
    updateMetadata(urn, m => { m.status = 'complete'; m.logs.push('Sqlite is ready to be queried.'); });
}

async function queryPropertyDB(urn, query) {
    const db = new Database(path.join(__dirname, 'cache', urn, 'properties.sqlite'));
    const rows = await db.allAsync(query);
    await db.closeAsync();
    return rows;
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
    updateMetadata(req.urn, m => { m.status = 'started'; m.logs = []; });
    preparePropertyDB(req.urn, req.token);
    res.status(202).end();
});

app.get('/:urn', function (req, res) {
    res.sendFile(path.join(CACHE_FOLDER, req.urn, 'metadata.json'));
});

app.get('/:urn/properties', async function (req, res) {
    const query = req.query['q'] || DEFAULT_QUERY;

    try {
        res.json(await queryPropertyDB(req.urn, query));
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
        return;
    }
});

app.listen(PORT, () => { console.log(`Server listening on port ${PORT}`); });