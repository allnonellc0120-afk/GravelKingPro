import { spawn } from 'child_process';
const child = spawn('sleep', ['10'], { detached: true, stdio: 'ignore' });
child.unref();
console.log("Spawned");
