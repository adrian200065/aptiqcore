import Fastify from "fastify";
import cors from "@fastify/cors";
import { fileURLToPath } from "node:url";
import { registerPublicRoutes } from "./routes/public.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerUiRoutes } from "./routes/ui.js";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true }));

  app.register(registerPublicRoutes);
  app.register(registerAdminRoutes);
  app.register(registerUiRoutes);

  return app;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  app
    .listen({ port, host })
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
