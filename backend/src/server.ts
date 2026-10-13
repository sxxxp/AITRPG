import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { createSocketServer } from './socket/index.js';

const httpServer = createServer(createApp());
createSocketServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`API server listening on http://localhost:${env.port}`);
});
