import cors from 'cors';

/**
 * CORS Configuration
 * Implements T117
 * Allows frontend origin
 */

const allowedOrigins = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000', // Backend dev server
  process.env.CORS_ORIGIN || '',
].filter(Boolean);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
});

