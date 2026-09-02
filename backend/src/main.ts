import { createApp } from './app';
import { getConfig } from './config';

async function bootstrap() {
  const app = await createApp();
  const { port } = getConfig();
  app.listen(port, () => {
    console.log(`GBL Office API running on http://localhost:${port}/api/v1`);
  });
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
