const fs = require('fs');
const path = require('path');
const express = require('express')
const bodyParser = require('body-parser');
const appDir = path.dirname(require.main.filename);

module.exports = class PigPen {

    constructor(config) {
        this.app = express()
        this.app.use(bodyParser.urlencoded({ extended: false }));
        this.app.use(bodyParser.json());
        this.config = configDefaults;
        this.config = Object.assign(this.config, config);
        this.store = new ApiStore();
    }

    start() {
        setup(this.app, this.config, this.store)
            .then(result => {
                this.store.data = result;
                logApis(this.config, result);
                this.app.listen(this.config.port);
                logListen(this.config);
            })
            .catch(err => {
                console.log(err);
            })
    }
}

const logApis = function (config, data) {
    if (config.log) {
        data.forEach(d => {
            console.log(`Registered /api/${d.name}`);
        });
    }
}

const logListen = function (config) {
    if (config.log) {
        console.log(`Listening on port ${config.port}`);
    }
}

const setup = function (app, config, store) {
    return new Promise((res, rej) => {
        Promise.all(registerApis(app, config, store))
            .then(result => {
                app.get('/api', (req, res) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.send(JSON.stringify(store.getData()));
                });
                res(result);
            })
            .catch(error => {
                rej(error);
            })
    });
}

const registerApis = function (app, config, store) {
    const apis = Object.keys(config.apis);
    return apis.map(api => {
        return registerApi(api, config, app, store);
    });
}

const registerApi = function (apiName, config, app, store) {
    return new Promise((res, rej) => {
        const jsonPath = config.apis[apiName];
        getData(config, jsonPath)
            .then(data => {
                configureResponse(app, apiName, store);
                res({
                    name: apiName,
                    filePath: path.join(appDir, config.data, jsonPath),
                    data: data
                });
            })
            .catch(error => {
                rej(error);
            })
    });
}

const configureResponse = function (app, apiName, store) {
    app.get(`/api/${apiName}/:id?`, (req, res) => {
        var data = store.get(apiName, req.params.id);
        if (data) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(data));
        } else {
            res.setHeader('Content-Type', 'text/plain');
            res.status(404).send(`${apiName}/${req.params.id} not found.`);
        }
    });
    app.post(`/api/${apiName}`, (req, res) => {
        const record = store.post(apiName, req.body);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(record));
    });
    app.put(`/api/${apiName}/:id`, (req, res) => {
        const record = store.put(apiName, req.body);
        if (record) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(record));
        } else {
            res.setHeader('Content-Type', 'text/plain');
            res.status(404).send(`${apiName}/${req.params.id} not found.`);
        }
    });
    app.delete(`/api/${apiName}/:id`, (req, res) => {
        if (store.delete(apiName, req.params.id)) {
            res.status(200).end();
        } else {
            res.setHeader('Content-Type', 'text/plain');
            res.status(404).send(`${apiName}/${req.params.id} not found.`);
        }
    });
}

const getData = function (config, jsonPath) {
    return new Promise((res, rej) => {
        const dataPath = path.join(appDir, config.data, jsonPath);
        const seedDataPath = path.join(appDir, config.seed, jsonPath);
        if (fs.existsSync(dataPath)) {
            res(readFileToJson(dataPath));
        } else if (fs.existsSync(seedDataPath)) {
            res(readFileToJson(seedDataPath));
        } else {
            rej(`Could not find data file at ${dataPath} or ${seedDataPath}`);
        }
    })
}

const readFileToJson = function (path) {
    const file = fs.readFileSync(path, 'utf8');
    return JSON.parse(file);
}


class ApiStore {

    constructor() {
        this.flushed = true;
        setInterval(() => {
            if (!this.flushed) {
                this.flush();
            }
        }, 2000);
    }

    getData() {
        const storeData = {};
        this.data.forEach(d => {
            storeData[d.name] = d.data;
        });
        return storeData;
    }

    get(api, id) {
        const records = this.data.find(d => d.name.toLowerCase() == api.toLowerCase()).data;
        const convertedId = isNaN(parseInt(id)) ? id : parseInt(id);
        if (id) {
            return records.filter(r => r.id == convertedId)[0];
        }
        return records;
    }

    post(api, data) {
        const records = this.data.find(d => d.name.toLowerCase() == api.toLowerCase()).data;
        const intIds = records.map(r => r.id).filter(id => Number.isInteger(id)).sort();
        if (intIds.length > 0) {
            const maxId = intIds[intIds.length - 1];
            data.id = maxId + 1;
        } else {
            data.id = 1;
        }
        records.push(data);
        this.flushed = false;
        return data;
    }

    put(api, data) {
        if (!data && !data.id) {
            return null;
        }
        const records = this.data.find(d => d.name.toLowerCase() == api.toLowerCase()).data;
        const record = records.filter(r => r.id === data.id)[0];
        if (!record) {
            return null;
        }
        Object.assign(record, data);
        this.flushed = false;
        return record;
    }

    delete(api, id) {
        if (!id) {
            return null;
        }
        const convertedId = isNaN(parseInt(id)) ? id : parseInt(id);
        const records = this.data.find(d => d.name.toLowerCase() == api.toLowerCase());
        const filteredRecords = records.data.filter(r => r.id !== convertedId);
        if (records.data.length <= filteredRecords.length) {
            return false;
        } else {
            records.data = filteredRecords;
            this.flushed = false;
            return true;
        }
    }

    flush() {
        this.data.forEach(d => {
            fs.writeFileSync(d.filePath, JSON.stringify(d.data));
        });
        this.flushed = true;
    }

}

const configDefaults = {
    port: 3000,
    log: true,
    apis: {},
    data: 'data',
    seed: 'seed'
}