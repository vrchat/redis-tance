/*
 * docker.jake
 *
 * Functionality having to do with running Docker locally.
 * Mostly helper functions.
 */

const run = require('./run.jake').run;
const irun = require('./run.jake').irun;


async function isRunning ({name}){
    return new Promise(async (resolve, reject) => {
        let val = await run(`docker ps -aq --filter=name=${name}`).catch((err)=>{reject(err);});

        if (val && val !== "") {
            console.error(`${name} is running`);
            resolve(true);
        } else {
            console.error(`${name} is not running`);
            resolve(false);
        }
    });
}


/*
 * List running docker processes.
 */
async function list(){
    return run('docker ps -a');
}
namespace('docker', ()=>{
    desc("Show all running docker processes");
    task('list', list);
});

async function runningList() {
    return new Promise((resolve, reject) => {
        run('docker ps -aq').then((val) => {
            if (val && val !== ""){
                let runningContainerList = val.split("\n").filter((value) => {return value !== "";});
                resolve(runningContainerList);
            } else {
                console.error("There are no running docker containers");
                reject("There are no running docker containers");
            }
        }).catch((err)=>{reject(err);});
    });
}

/*
 * Display logs for all docker processes.
 */
async function logs(){
    let runningContainerList = await runningList();
    return Promise.all(runningContainerList.map(container => run(`docker logs ${container}`)));
}
namespace('docker', ()=>{
    desc("Display logs for all docker images.");
    task('logs', logs);
});

/*
 * List available docker images.
 */
async function images(){
    return run('docker images');
}
namespace('docker', ()=>{
    desc("Show all available docker images");
    task('images', images);
});

/*
 * Kill the docker container with name {name}
 */
async function kill({name}){
    if(!await isRunning({name: name})){
        return Promise.resolve();
    }

    return run(`docker kill ${name}`);
}


/*
 * Start running a docker container.
 *
 * e.g. start({name:'mocha-test',
 *             container:'vrchat-parse',
 *             environment: {DATABASE_URI: 'mongodb://localhost:1234', REDIS_URI: 'redis://localhost:12345... },
 *             detached: true,
 *             ports: [1337])
 */
async function start ({name, container, environment, detached, ports}) {
    if(await isRunning({name: name})){
        console.log(`${name} is already running!`);
        return Promise.resolve();
    }

    let environmentString = "";
    Object.keys(environment).forEach((key)=>{
        let value = environment[key];
        environmentString = environmentString + `-e ${key}=${value} `;
    });

    let portString = "";
    ports.forEach((port)=>{
        portString = portString + `-p ${port}:${port} `;
    });

    if(detached) {
        return run(`docker run -d --log-driver=json-file ${portString} ${environmentString} --name=${name} ${container}`);
    } else {
        return irun(`docker run -d ${portString} ${environmentString} --name=${name} ${container}`);
    }
}


module.exports = {start, kill}