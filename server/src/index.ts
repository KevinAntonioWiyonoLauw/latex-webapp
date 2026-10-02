import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { HOST, IS_PROD, MAX_UPLOAD_BYTES, PORT, WEB_ORIGINS } from "./config.js";
import { Storage } from "./storage/index.js";
import { CompilerManager } from "./compiler/manager.js";
import { tectonicAvailable } from "./compiler/tectonic.js";
import { closeDb, pingDb, runMigrations } from "./db/index.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { requireAuth } from "./auth/middleware.js";
import { projectRoutes } from "./routes/projects.js";
import { fileRoutes } from "./routes/files.js";
import { compileRoutes } from "./routes/compile.js";
import { pdfRoutes } from "./routes/pdf.js";
import { ioRoutes } from "./routes/io.js";
import { synctexRoutes } from "./routes/synctex.js";
import { shareRoutes } from "./routes/share.js";
import { publicShareRoutes } from "./routes/publicShare.js";
import { historyRoutes } from "./routes/history.js";
import { searchRoutes } from "./routes/search.js";
import { wsRoutes } from "./routes/ws.js";
import { GitHistory } from "./db/git.js";
import { DATA_DIR } from "./config.js";

async function main(): Promise<void> {
  const app = Fastify({
    logger: true,
    bodyLimit: MAX_UPLOAD_BYTES,
    // Percayai reverse proxy (Caddy) untuk header X-Forwarded-*.
    trustProxy: IS_PROD,
  });

  // Rate limit global (proteksi dasar).
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: [],
  });

  // CORS: izinkan origin frontend dengan credentials (cookie auth).
  await app.register(cors, {
    origin: [
      ...WEB_ORIGINS,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });
  await app.register(websocket);

  const storage = new Storage();
  await storage.init();
  const compiler = new CompilerManager(storage);
  const git = new GitHistory(DATA_DIR);

  // Siapkan skema database (idempoten) agar deploy tidak perlu langkah manual.
  if (await pingDb()) {
    await runMigrations();
  } else {
    app.log.error(
      "Tidak bisa konek ke PostgreSQL. Periksa DATABASE_URL / jalankan database.",
    );
  }

  // Snapshot riwayat otomatis setiap compile sukses.
  compiler.setOnSuccess(async (projectId) => {
    await git.snapshot(projectId, "auto-snapshot (compile)", null);
  });

  // Health check
  app.get("/api/health", async () => ({
    ok: true,
    tectonic: tectonicAvailable(),
    db: await pingDb(),
    time: Date.now(),
  }));

  // Auth (Better Auth) — dipasang sebelum route lain.
  await registerAuthRoutes(app);

  // Routes yang butuh login dibungkus dalam scope terpisah agar
  // `preHandler: requireAuth` tidak bocor ke /api/health atau /api/auth.
  await app.register(async (scope) => {
    scope.addHook("preHandler", requireAuth);
    await projectRoutes(scope, storage);
    await fileRoutes(scope, storage);
    await compileRoutes(scope, compiler);
    await pdfRoutes(scope, storage);
    await ioRoutes(scope, storage);
    await synctexRoutes(scope, storage);
    await shareRoutes(scope);
    await historyRoutes(scope, git);
    await searchRoutes(scope, storage);
  });

  // Route publik berbasis share token (tanpa login).
  await publicShareRoutes(app, storage);

  // WebSocket tidak pakai hook ini (auth dilakukan saat subscribe).
  await wsRoutes(app, compiler);

  // Graceful shutdown.
  app.addHook("onClose", async () => {
    await closeDb();
  });

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`LaTeX server siap di http://${HOST}:${PORT}`);
  if (!tectonicAvailable()) {
    app.log.warn(
      "Binary tectonic tidak ditemukan. Set env TECTONIC_BIN atau taruh di tools/tectonic.exe",
    );
  }
  if (!(await pingDb())) {
    app.log.error("Tidak bisa konek ke PostgreSQL. Jalankan docker compose up -d postgres.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
