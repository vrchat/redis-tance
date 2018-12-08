/*
 * run.jake
 *
 * Jake's 'exec' function is event driven, but a Promise model is much
 * easier to reason about when we're doing stuff like this, so our
 * 'run' function wraps the exec environment with a Promise.
 *
 */


/*
 * This run function runs shellcmd, returning a Promise
 * that contains
 *  - the concatenated stdout & stderr on success, and
 *  - the error message on failure.
 */
async function run(shellcmd){
    return new Promise(function(resolve, reject){
        console.log(">>>", shellcmd);

        let ex = jake.createExec([shellcmd])
        let output = [];
        let interval = setInterval(() => {
            process.stdout.write('.')
        }, 1000);
        ex.addListener('stdout', (data)=>{
            console.log(String(data))
            output.push(data);
        });
        ex.addListener('stderr', (data)=>{
            console.error(String(data))
            output.push(data);
        });
        ex.addListener('error', (msg, code)=>{
            console.error(code, msg);
            clearInterval(interval);
            reject(msg);
        });
        ex.addListener('cmdEnd', (command)=>{
            //console.log(output.join(""));
            clearInterval(interval);
            resolve(output.join(""));
        });
        ex.run();
    });
}


/*
 * Run a shell command.. interactively!
 */
async function irun(shellcmd){
    return new Promise(function(resolve, reject){
        jake.exec([shellcmd], {interactive: true}, () => { resolve(); });
    })
}

async function wait(delay_milliseconds){
    return new Promise(function(resolve, reject){
        setTimeout((arg)=>{
            resolve(arg);
        }, delay_milliseconds)
    });
}

module.exports = {run, irun, wait};