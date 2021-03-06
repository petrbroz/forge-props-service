const sqlite3 = require('sqlite3').verbose();
const debug = require('debug')('sqlite');
debug.log = console.log.bind(console);

const DEFAULT_QUERY = `
    SELECT ids.id AS dbid, attrs.category AS category, COALESCE(NULLIF(attrs.display_name, ''), attrs.name) AS name, vals.value AS value
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
        db.run('CREATE TABLE _objects_eav (id INTEGER PRIMARY KEY, entity_id INTEGER, attribute_id INTEGER, value_id INTEGER);');
        db.run('CREATE TABLE _objects_id (id INTEGER PRIMARY KEY, external_id BLOB, viewable_id BLOB);');
        db.run('CREATE TABLE _objects_attr (id INTEGER PRIMARY KEY, name TEXT, category TEXT, data_type INTEGER, data_type_context TEXT, description TEXT, display_name TEXT, flags INTEGER, display_precision INTEGER);');
        db.run('CREATE TABLE _objects_val (id INTEGER PRIMARY KEY, value BLOB);');

        debug('Inserting _objects_id');
        let entityId = 1;
        for (const page of pdb.ids()) {
            const query = `INSERT INTO _objects_id VALUES ${page.map(_ => '(?, ?, ?)').join(',')};`;
            const params = page.reduce((prev, curr) => { prev.push(entityId++, curr, null); return prev; }, []);
            db.run(query, params);
        }

        debug('Inserting _objects_attr');
        let attributeId = 1;
        for (const page of pdb.attrs()) {
            const query = `INSERT INTO _objects_attr VALUES ${page.map(_ => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')};`;
            const params = page.reduce((prev, curr, index) => {
                prev.push(attributeId++, curr[0], curr[1], curr[2], curr[3], curr[4], curr[5], curr[6], curr[7]); return prev;
            }, []);
            db.run(query, params);
        }

        debug('Inserting _objects_val');
        let valueId = 1;
        for (const page of pdb.vals()) {
            const query = `INSERT INTO _objects_val VALUES ${page.map(_ => '(?, ?)').join(',')};`;
            const params = page.reduce((prev, curr) => { prev.push(valueId++, curr); return prev; }, []);
            db.run(query, params);
        }

        debug('Inserting _objects_eav');
        let eavId = 1, dbId = 0;
        for (const page of pdb.eavs()) {
            dbId++;
            if (page.length === 0) {
                continue;
            }
            const values = [];
            for (let i = 0; i < page.length / 2; i++) {
                values.push(`(${eavId++}, ${dbId}, ?, ?)`);
            }
            const query = `INSERT INTO _objects_eav VALUES ${values.join(',')};`;
            db.run(query, page);
        }

        debug('Creating views');
        db.run(`CREATE VIEW properties AS ${DEFAULT_QUERY};`);

        debug('Creating indices');
        db.run('CREATE INDEX idx_external_id ON _objects_id (external_id);');
        db.run('CREATE INDEX idx_attr_category ON _objects_attr (category);');
        db.run('CREATE INDEX idx_attr_name ON _objects_attr (name);');
        db.run('CREATE INDEX idx_attr_display_name ON _objects_attr (display_name);');
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
