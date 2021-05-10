const sqlite3 = require('sqlite3').verbose();

const PAGE_SIZE = 1000;
const DEFAULT_QUERY = `
    SELECT ids.ent_id AS dbid, attrs.category AS prop_category, attrs.name AS prop_name, vals.value AS prop_value
    FROM objects_avs avs
    LEFT JOIN objects_ids ids ON ids.ent_id = avs.ent_id
    LEFT JOIN objects_attrs attrs ON attrs.attr_id = avs.attr_id
    LEFT JOIN objects_vals vals on vals.val_id = avs.val_id
    WHERE prop_category NOT LIKE '\\_\\_%\\_\\_' ESCAPE '\\'
    ORDER BY dbid
`;

function createDatabase(filepath, pdb) {
    console.log('Creating database...');
    const db = new sqlite3.Database(filepath);
    db.serialize(function () {
        db.run('PRAGMA journal_mode = off;');
        db.run('PRAGMA synchronous = off;');

        console.log('Creating tables...');
        db.run('CREATE TABLE objects_avs (ent_id INTEGER, attr_id INTEGER, val_id INTEGER);');
        db.run('CREATE TABLE objects_ids (ent_id INTEGER PRIMARY KEY, external_id TEXT);');
        db.run('CREATE TABLE objects_attrs (attr_id INTEGER PRIMARY KEY, name TEXT, category TEXT);');
        db.run('CREATE TABLE objects_vals (val_id INTEGER PRIMARY KEY, value TEXT);');

        console.log('Inserting objects_ids...');
        for (let i = 1, len = pdb._ids.length; i < len; i += PAGE_SIZE) {
            const page = pdb._ids.slice(i, Math.min(i + PAGE_SIZE, len));
            const query = `INSERT INTO objects_ids VALUES ${page.map(_ => '(?, ?)').join(',')};`;
            const params = page.reduce((prev, curr, index) => { prev.push(i + index, curr); return prev; }, []);
            db.run(query, params);
        }

        console.log('Inserting objects_attrs...');
        for (let i = 1, len = pdb._attrs.length; i < len; i += PAGE_SIZE) {
            const page = pdb._attrs.slice(i, Math.min(i + PAGE_SIZE, len));
            const query = `INSERT INTO objects_attrs VALUES ${page.map(_ => '(?, ?, ?)').join(',')};`;
            const params = page.reduce((prev, curr, index) => { prev.push(i + index, curr[0], curr[1]); return prev; }, []);
            db.run(query, params);
        }

        console.log('Inserting objects_vals...');
        for (let i = 1, len = pdb._vals.length; i < len; i += PAGE_SIZE) {
            const page = pdb._vals.slice(i, Math.min(i + PAGE_SIZE, len));
            const query = `INSERT INTO objects_vals VALUES ${page.map(_ => '(?, ?)').join(',')};`;
            const params = page.reduce((prev, curr, index) => { prev.push(i + index, curr); return prev; }, []);
            db.run(query, params);
        }

        console.log('Inserting objects_avs...');
        for (let i = 1, len = pdb._offsets.length; i < len; i++) {
            const page = pdb._avs.slice(pdb._offsets[i] * 2, i < len - 1 ? pdb._offsets[i + 1] * 2 : pdb._avs.length);
            if (page.length === 0) {
                continue;
            }
            const query = `INSERT INTO objects_avs VALUES ${Array(page.length / 2).fill(`(${i}, ?, ?)`).join(',')};`;
            db.run(query, page);
        }

        console.log('Creating views...');
        db.run(`CREATE VIEW properties AS ${DEFAULT_QUERY};`);

        console.log('Creating indices...');
        db.run('CREATE INDEX idx_external_id ON objects_ids (external_id);');
        db.run('CREATE INDEX idx_attr_category ON objects_attrs (category);');
        db.run('CREATE INDEX idx_attr_name ON objects_attrs (name);');
        db.run('CREATE INDEX idx_attr_value ON objects_vals (value);');
        db.run('CREATE INDEX idx_dbid ON objects_avs (ent_id);');
        db.run('CREATE INDEX idx_attr_id_val_id ON objects_avs (attr_id, val_id);');
    });
    db.close();
    console.log('Database ready...');
}

function queryDatabase(filepath, query, params = []) {
    const db = new sqlite3.Database(filepath, sqlite3.OPEN_READONLY);
    return new Promise(function (resolve, reject) {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = {
    createDatabase,
    queryDatabase,
    DEFAULT_QUERY
};
