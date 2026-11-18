import 'dotenv/config';
import { connectDB, closeDB } from './src/config/db.js';
import { createApp } from './src/app.js';

const port = Number(process.env.PORT) || 5000;

async function main() {
  await connectDB();

  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`FixMate API listening on http://localhost:${port}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down…`);
    server.close(async () => {
      await closeDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start FixMate API:', err);
  process.exit(1);
});
