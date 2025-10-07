# RoboMop Backend

Backend API server for RoboMop autonomous cleaning robot system.

## Setup

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:migrate

# Start development server
npm run dev

# Run tests
npm test
```

## Project Structure

```
backend/
├── src/
│   ├── models/         # TypeORM entities
│   ├── services/       # Business logic
│   ├── api/           # REST routes
│   ├── websocket/     # Socket.io handlers
│   ├── config/        # Configuration
│   ├── migrations/    # Database migrations
│   └── server.ts      # Entry point
└── tests/
    ├── unit/          # Unit tests
    ├── integration/   # Integration tests
    └── contract/      # Contract tests
```

## Development

- Lint: `npm run lint`
- Format: `npm run format`
- Test: `npm test`
- Coverage: `npm run test:coverage`


