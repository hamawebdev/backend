import "reflect-metadata";
import express, { Application, Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { container } from "./config/container";
import routes from "./routes";
import ResponseUtils from "./core/utils/response.utils";
import GlobalErrorHandler from "./core/middlewares/errors.middleware";
import { TFindInput } from "./types/types";
import parseQueryParams from "./core/middlewares/parseQueryParams.middleware";
import listEndpoints = require("express-list-endpoints");
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

// CORS configuration for development
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.CLIENT_URL || 'http://localhost:3000'
  ],
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
app.use(bodyParser.urlencoded({ extended: true }));
// @ts-ignore
app.use(bodyParser.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; }, }));

// Middleware to capture raw body for webhook verification
app.use('/api/v1/payments/webhook', bodyParser.raw({ type: 'application/json' }));

// Logging middleware
app.use(morgan("dev"));

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
  app.listen(Number(PORT), HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });
}

export default app;
