'use strict';

const redis = require('redis');
const Tance = require('./lib/tance').Tance;

const redisClient = redis.createClient();

const tanceTanceRevolution = new Tance(redisClient);


tanceTanceRevolution.set("argle", "bargle").then(console.log);




module.exports = Tance;