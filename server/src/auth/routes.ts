import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auth } from "./index.js";

/**
 * Pasang handler Better Auth ke Fastify pada prefix /api/auth/*.
 * Better Auth memakai Web Request/Response, jadi kita konversi
 * request Fastify -> Request dan Response -> balasan Fastify.
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Rute spesifik untuk sign-out (butuh cookie yang benar)
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    // Nonaktifkan parser body bawaan: kita teruskan raw.
    bodyLimit: 10 * 1024 * 1024,
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

      const headers = fromNodeHeaders(req.headers);

      // Bangun Request standar untuk Better Auth.
      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : typeof req.body === "string"
              ? req.body
              : JSON.stringify(req.body ?? {}),
      });

      const response = await auth.handler(request);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        // Fastify: set-cookie perlu penanganan array
        if (key.toLowerCase() === "set-cookie") {
          const existing = reply.getHeader("set-cookie");
          if (existing) {
            reply.header(
              "set-cookie",
              Array.isArray(existing)
                ? [...existing, value]
                : [String(existing), value],
            );
          } else {
            reply.header("set-cookie", value);
          }
        } else {
          reply.header(key, value);
        }
      });

      const text = await response.text();
      return reply.send(text);
    },
  });
}
