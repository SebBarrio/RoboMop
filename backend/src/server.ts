import 'reflect-metadata';
import express, { Application } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import * as dotenv from 'dotenv';
import helmet from 'helmet';

import { initializeDatabase, closeDatabase } from './config/database';
import { corsMiddleware } from './api/middleware/cors';
import { requestLogger } from './api/middleware/requestLogger';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import apiRoutes from './api/routes';
import { logger } from './utils/logger';
import {
  ConnectionHandler,
  RobotEventHandler,
  CommandHandler,
  FrontendEventHandler,
} from './websocket';
import {
  RobotService,
  MapService,
  SessionService,
  ZoneService,
  LogService,
} from './services';

/**
 * Main Server
 * Implements T114
 * Initializes Express, Socket.io, and database connections
 */

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create Express app
const app: Application = express();
const httpServer = createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet()); // Security headers
app.use(corsMiddleware); // CORS
app.use(express.json({ limit: '10mb' })); // JSON body parser
app.use(express.raw({ limit: '10mb', type: 'application/octet-stream' })); // Binary data
app.use(requestLogger); // Request logging

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', apiRoutes);

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize WebSocket handlers (T071-T074)
let connectionHandler: ConnectionHandler | null = null;
let robotEventHandler: RobotEventHandler | null = null;
let commandHandler: CommandHandler | null = null;
let frontendEventHandler: FrontendEventHandler | null = null;

// Socket.io connection handling
io.on('connection', async (socket) => {
  // Ensure handlers are initialized
  if (!connectionHandler || !robotEventHandler || !commandHandler || !frontendEventHandler) {
    logger.error('WebSocket handlers not initialized');
    socket.disconnect();
    return;
  }

  // Handle new connection
  await connectionHandler.handleConnection(socket);

  // Register robot event handlers
  robotEventHandler.registerHandlers(socket);

  // Register frontend event handlers
  frontendEventHandler.registerHandlers(socket);

  // Register command acknowledgement handler
  const cmdHandler = commandHandler; // Capture in const to satisfy TypeScript
  socket.on('command:ack', (data) => cmdHandler.handleCommandAck(socket, data));
});

/**
 * Initialize WebSocket handlers
 */
export function initializeWebSocketHandlers(): void {
  // Initialize services
  const robotService = new RobotService();
  const mapService = new MapService();
  const sessionService = new SessionService();
  const zoneService = new ZoneService();
  const logService = new LogService();

  // Initialize WebSocket handlers
  connectionHandler = new ConnectionHandler(io, robotService);
  commandHandler = new CommandHandler(io, connectionHandler);
  robotEventHandler = new RobotEventHandler(
    io,
    robotService,
    mapService,
    sessionService,
    logService,
    connectionHandler
  );
  frontendEventHandler = new FrontendEventHandler(
    io,
    commandHandler,
    zoneService,
    connectionHandler
  );

  logger.info('WebSocket handlers initialized');
}

/**
 * Start server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized');

    // Initialize WebSocket handlers
    initializeWebSocketHandlers();

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      logger.info(`WebSocket server ready`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  logger.info('Shutting down gracefully...');
  
  // Close HTTP server
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Close database connection
  await closeDatabase();

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// Export for testing
export { app, io, httpServer };

