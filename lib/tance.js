'use strict';

const redis = require('redis');
const PromisifyAll = require('es6-promisify-all');

async function Tance(redisUri, options){
    return new Promise((resolve, reject) => {
        let client = PromisifyAll(redis.createClient(redisUri, options));
        client.on('ready', ()=>{
            resolve(client);
        });
        client.on('error', (err)=>{
            reject(err);
        });
    });
};
