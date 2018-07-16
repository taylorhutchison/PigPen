const fs = require('fs');
const path = require('path');
const express = require('express')
const bodyParser = require('body-parser');

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
                this.app.listen(this.config.port);
            })
            .catch(rejection => {
                console.log(`${rejection.type}: ${rejection.message}`);
            })
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
                    filePath: path.join(__dirname, config.data, jsonPath), 
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
        res.setHeader('Content-Type', 'application/json');
        var data = store.get(apiName, req.params.id);
        if (data) {
            res.send(JSON.stringify(data));
        } else {
            res.status(404).end(`${apiName}/${req.params.id} not found.`);
        }
    });
    app.post(`/api/${apiName}`, (req, res) => {
        const record = store.post(apiName, req.body);
        res.send(JSON.stringify(record));
    });
}

const getData = function (config, jsonPath) {
    return new Promise((res, rej) => {
        const dataPath = path.join(__dirname, config.data, jsonPath);
        const seedDataPath = path.join(__dirname, config.seed, jsonPath);
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

    constructor(config) {
        this.config = config;
        this.flushed = true;
        setInterval(() => {
            if(!this.flushed) {
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
        if (id) {
            return records.find(r => r.id == id);
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
        this.flushed = false;
    }

    delete(api, id) {
        this.flushed = false;
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
    apis: {

    },
    data: 'data',
    seed: 'seed'
}