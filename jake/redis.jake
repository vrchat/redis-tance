const docker = require('./docker.jake');

const REDIS_PORT = 6379;
const redis_docker_name = "local-redis";

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
    return docker.kill({name: redis_docker_name});
}
namespace('redis', ()=>{
    desc("Stop redis");
    task('stop', stop);
});

module.exports = {
    start, stop, REDIS_PORT
};