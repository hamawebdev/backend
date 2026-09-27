import "reflect-metadata";
import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { container } from "./config/container";
import PrismaService from "./config/db";
import routes from "./routes";
import ResponseUtils from "./core/utils/response.utils";
import GlobalErrorHandler from "./core/middlewares/errors.middleware";
import { TFindInput } from "./types/types";
import parseQueryParams from "./core/middlewares/parseQueryParams.middleware";
// Extend Express Request type to include queryParams
declare module "express-serve-static-core" {
  interface Request {
    queryParams: TFindInput;
  }
}

const app: Application = express();

// Configure rate limiting
/*
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  headers: true, // Send rate limit headers in responses
});

// Apply rate limiter globally
app.use(limiter);

*/

// Behind Traefik: trust the first proxy hop so req.ip and rate limits use the client address
app.set("trust proxy", 1);

// CORS: only the MedADN web app may call the API from a browser.
// CORS_ORIGINS is a comma-separated allowlist; it defaults to CLIENT_URL.
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
if (!isProduction) {
  allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
}
if (isProduction && allowedOrigins.length === 0) {
  throw new Error("CORS_ORIGINS or CLIENT_URL must be set in production");
}

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Client-Version',
    'User-Agent'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
};

// Enable CORS for all routes - must be before helmet
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Apply Helmet for security headers (with CORS-compatible settings)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
}));

// Middleware to parse JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));


// Logging middleware
app.use(morgan(isProduction ? "combined" : "dev"));

// Apply query parameter parsing middleware
app.use(parseQueryParams);

// Apply API routes
app.use("/api/v1", routes);

// 404 Handler
app.use("*", (_req: Request, res: Response, _next: NextFunction) => {
  const responseUtils = container.resolve(ResponseUtils);
  responseUtils.sendNotFoundResponse(res, "Endpoint not found");
});

//console.log(listEndpoints(app));

// Global Error Handler
const globalErrorHandler = container.resolve(GlobalErrorHandler);
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  globalErrorHandler.handle(err, req, res, next);
});

// Start the server only when this file is executed directly, not when imported
if (require.main === module) {
  const PORT = process.env.PORT || 8080;
  const HOST = '0.0.0.0'; // Listen on all interfaces (required for Docker)
  const server = app.listen(Number(PORT), HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });

  // Graceful shutdown: finish in-flight requests, then close the DB pool
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await container.resolve(PrismaService).disconnect().catch(() => undefined);
      process.exit(0);
    });
    // Exit before Docker's default 10s stop grace period ends in SIGKILL
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;
