const docker = require('./docker.jake');

const REDIS_PORT = 6379;
const redis_docker_name = "test-redis";

const CLUSTER_PORTS = [6379, 6380, 6381, 6382, 6383, 6384];
const REDIS_CLUSTER_NETWORK_NAME = "redis_cluster_net";

/*
 * Build and start Redis
 */
function start(){
    return docker.start({name: redis_docker_name,
        container: 'redis',
        detached: true,
        ports: [REDIS_PORT],
        environment: {}});
}
namespace('redis', ()=>{
    desc("Start redis");
    task('start', start);
});


/*
 * Destroy and clean up the Redis instance.
 */
function stop(){
    return docker.stop({name: redis_docker_name});
}
namespace('redis', ()=>{
    desc("Stop redis");
    task('stop', stop);
});


async function startCluster(){
    docker.createNetwork({name: REDIS_CLUSTER_NETWORK_NAME});

    let promises = CLUSTER_PORTS.map((cluster_port) => {
        //docker run -d --name "redis-"$port -p $port:6379 --net $network_name $redis_image $start_cmd;
        return docker.start({
            name: `${redis_docker_name}-${cluster_port}`,
            complexArgs: `-p ${cluster_port}:${REDIS_PORT}`,
            network: REDIS_CLUSTER_NETWORK_NAME,
            container: 'redis',
            detached: true,
            environment: {},
            command: `redis-server --port ${REDIS_PORT} --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes`,
        })
    });

    await Promise.all(promises);

    let additionalPromises = CLUSTER_PORTS.map(async (cluster_port) => {
        //docker run -d --name "redis-"$port -p $port:6379 --net $network_name $redis_image $start_cmd;
        let ip = await docker.getIp({network: REDIS_CLUSTER_NETWORK_NAME, name: `${redis_docker_name}-${cluster_port}`});
        ip = ip.trim();
        let cluster_host = `${ip}:${cluster_port}`;
        console.warn(`CLUSTER HOST: ${ip}`);

        return cluster_host;
    });

    let hosts = await Promise.all(additionalPromises);

    docker.run({
        name: `${redis_docker_name}-command`,
        network: REDIS_CLUSTER_NETWORK_NAME,
        container: 'redis',
        command: ''
    })


}
namespace('cluster', ()=>{
    desc("Start redis cluster");
    task('start', startCluster);
});

async function stopCluster(){
    let promises = CLUSTER_PORTS.map((cluster_port) => {
        return docker.stop({
            name: `${redis_docker_name}-${cluster_port}`,
        })
    });

    await Promise.all(promises);
}
namespace('cluster', ()=>{
    desc("Stop redis cluster");
    task('stop', stopCluster);
});

module.exports = {
    start, stop, REDIS_PORT,
    startCluster, stopCluster
};