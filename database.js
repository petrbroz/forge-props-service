const sqlite3 = require('sqlite3').verbose();
const debug = require('debug')('sqlite');

const PAGE_SIZE = 1000;
const DEFAULT_QUERY = `
    SELECT ids.id AS dbid, attrs.category AS category, IFNULL(attrs.display_name, attrs.name) AS name, vals.value AS value
    FROM _objects_eav eav
    LEFT JOIN _objects_id ids ON ids.id = eav.entity_id
    LEFT JOIN _objects_attr attrs ON attrs.id = eav.attribute_id
    LEFT JOIN _objects_val vals ON vals.id = eav.value_id
    WHERE category NOT LIKE '\\_\\_%\\_\\_' ESCAPE '\\'
    ORDER BY dbid
`;

function createDatabase(filepath, pdb) {
    debug('Creating database');
    const db = new sqlite3.Database(filepath);
    db.serialize(function () {
        db.run('PRAGMA journal_mode = off;');
        db.run('PRAGMA synchronous = off;');

        debug('Creating tables');
        db.run('CREATE TABLE _objects_eav (entity_id INTEGER, attribute_id INTEGER, value_id INTEGER);');
        db.run('CREATE TABLE _objects_id (id INTEGER PRIMARY KEY, external_id TEXT);');
        db.run('CREATE TABLE _objects_attr (id INTEGER PRIMARY KEY, name TEXT, category TEXT, data_type INTEGER, data_type_context TEXT, description TEXT, display_name TEXT, flags INTEGER, display_precision INTEGER);');
        db.run('CREATE TABLE _objects_val (id INTEGER PRIMARY KEY, value TEXT);');

        debug('Inserting _objects_id');
        for (let i = 1, len = pdb._ids.length; i < len; i += PAGE_SIZE) {
            const page = pdb._ids.slice(i, Math.min(i + PAGE_SIZE, len));
            const query = `INSERT INTO _objects_id VALUES ${page.map(_ => '(?, ?)').join(',')};`;
            const params = page.reduce((prev, curr, index) => { prev.push(i + index, curr); return prev; }, []);
            db.run(query, params);
        }

        debug('Inserting _objects_attr');
        for (let i = 1, len = pdb._attrs.length; i < len; i += PAGE_SIZE) {
            const page = pdb._attrs.slice(i, Math.min(i + PAGE_SIZE, len));
            const query = `INSERT INTO _objects_attr VALUES ${page.map(_ => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')};`;
            const params = page.reduce((prev, curr, index) => {
                prev.push(i + index, curr[0], curr[1], curr[2], curr[3], curr[4], curr[5], curr[6], curr[7]); return prev;
            }, []);
            db.run(query, params);
        }

        debug('Inserting _objects_val');
        for (let i = 1, len = pdb._vals.length; i < len; i += PAGE_SIZE) {
            const page = pdb._vals.slice(i, Math.min(i + PAGE_SIZE, len));
            const query = `INSERT INTO _objects_val VALUES ${page.map(_ => '(?, ?)').join(',')};`;
            const params = page.reduce((prev, curr, index) => { prev.push(i + index, curr); return prev; }, []);
            db.run(query, params);
        }

        debug('Inserting _objects_eav');
        for (let i = 1, len = pdb._offsets.length; i < len; i++) {
            const page = pdb._avs.slice(pdb._offsets[i] * 2, i < len - 1 ? pdb._offsets[i + 1] * 2 : pdb._avs.length);
            if (page.length === 0) {
                continue;
            }
            const query = `INSERT INTO _objects_eav VALUES ${Array(page.length / 2).fill(`(${i}, ?, ?)`).join(',')};`;
            db.run(query, page);
        }

        debug('Creating views');
        db.run(`CREATE VIEW properties AS ${DEFAULT_QUERY};`);

        debug('Creating indices');
        db.run('CREATE INDEX idx_external_id ON _objects_id (external_id);');
        db.run('CREATE INDEX idx_attr_category ON _objects_attr (category);');
        db.run('CREATE INDEX idx_attr_name ON _objects_attr (name);');
        db.run('CREATE INDEX idx_attr_value ON _objects_val (value);');
        db.run('CREATE INDEX idx_dbid ON _objects_eav (entity_id);');
        db.run('CREATE INDEX idx_attribute_id_value_id ON _objects_eav (attribute_id, value_id);');
    });
    db.close();
    debug('Database ready');
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
