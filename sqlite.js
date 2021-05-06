const sqlite3 = require('sqlite3').verbose();

class Database extends sqlite3.Database {
    constructor(filename) {
        super(filename);
    }

    runAsync(query, params = []) {
        return new Promise((resolve, reject) => {
            this.run(query, params, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    }

    allAsync(query, params = []) {
        return new Promise((resolve, reject) => {
            this.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    closeAsync() {
        return new Promise((resolve, reject) => {
            this.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

module.exports = {
    Database
};