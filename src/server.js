import { config } from './config.js';
import { app } from './app.js';
import { prisma } from './prisma.js';

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`API đang chạy tại http://localhost:${config.port}`);
  console.log(`Môi trường: ${config.nodeEnv}`);
});

server.on('error', (err) => {
  console.error('Không thể khởi động server:', err.message);
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Nhận ${signal}, đang dừng server.`);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => {
    try {
      await prisma.$disconnect();
      clearTimeout(deadline);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
