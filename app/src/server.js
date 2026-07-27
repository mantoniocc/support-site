import {createApp} from './app.js';

const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, () => {
    console.log(JSON.stringify({
        msg: 'listening',
        port,
        appEnv: process.env.APP_ENV ?? 'local',
        commitSha: process.env.COMMIT_SHA ?? 'unknown',
    }));
});

// Container Apps envía SIGTERM al escalar a cero o al cambiar de revisión.
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        console.log(JSON.stringify({msg: 'shutting down', signal}));
        server.close(() => process.exit(0));
    })
}