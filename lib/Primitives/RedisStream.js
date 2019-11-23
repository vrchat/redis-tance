'use strict';
/*
    RedisStream.js
 */
const DocumentValidationError = require('../Errors').DocumentValidationError;

const incrementRedisId = (redisId) => {
    let [start, end] = redisId.split("-");
    return `${start}-${parseInt(end, 10)+1}`;
};

class RedisStream {

    constructor({tance, channel, streamLength, streamLifespanInSeconds, maximumNumberOfItemsToRead}){
        if(tance == null){
            throw new DocumentValidationError("Can't create stream without a database");
        }
        if(channel == null){
            throw new DocumentValidationError("Can't create stream without a channel");
        }
        this.tance = tance;
        this.channel = channel;
        this.streamLength = streamLength;
        this.streamLifespanInSeconds = streamLifespanInSeconds;
        this.maximumNumberOfItemsToRead = maximumNumberOfItemsToRead;
    }

    async write(object){
        let args = [];
        Object.keys(object).forEach((key)=>{
            args.push(key);
            args.push(object[key].toString());
        });
        await this.tance.xadd(`channel-${this.channel}`, `MAXLEN`, `~`, this.streamLength, "*", ...args);
        if(this.streamLifespanInSeconds != null){
            await this.tance.expire(`channel-${this.channel}`, this.streamLifespanInSeconds);
        }
    }

    async readFn(){
        var highestIdWeHaveEverSeen = await this.tance.get(`channel-${this.channel}-highest`);
        return async ()=> {

            if(highestIdWeHaveEverSeen == null || highestIdWeHaveEverSeen === ""){
                highestIdWeHaveEverSeen = "0";  // \o_o/
            }

            let read;
            if(this.maximumNumberOfItemsToRead && this.maximumNumberOfItemsToRead > 0){
                read = await this.tance.xrange(`channel-${this.channel}`, highestIdWeHaveEverSeen, "+", "COUNT", this.maximumNumberOfItemsToRead);
            } else {
                read = await this.tance.xrange(`channel-${this.channel}`, highestIdWeHaveEverSeen, "+");
            }
            if(read != null){
                let returnVals = [];
                let newHighestIdWeHaveEverSeen = highestIdWeHaveEverSeen;
                read.forEach(([higherId, zippedObject]) => {
                    newHighestIdWeHaveEverSeen = incrementRedisId(higherId);
                    let createdObj = {};
                    while(zippedObject.length > 0){
                        if(zippedObject.length == 1){
                            console.error("Something bad has happened; We've unchunked an unchunkable");
                        }
                        else{
                            let val = zippedObject.pop();
                            let key = zippedObject.pop();
                            createdObj[key] = val;
                        }
                    }
                    returnVals.push(createdObj);
                });
                if(newHighestIdWeHaveEverSeen !== highestIdWeHaveEverSeen){
                    highestIdWeHaveEverSeen = newHighestIdWeHaveEverSeen;
                    await this.tance.set(`channel-${this.channel}-highest`, newHighestIdWeHaveEverSeen);
                }

                return returnVals;
            }
            else{
                return [];
            }
        };
    }

}

module.exports = RedisStream;
