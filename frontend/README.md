# RoboMop Frontend

Web-based user interface for monitoring and controlling RoboMop cleaning robots.

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/    # React components
│   ├── services/      # API & WebSocket clients
│   ├── stores/        # State management
│   ├── hooks/         # Custom hooks
│   ├── types/         # TypeScript types
│   └── App.tsx        # Entry point
└── tests/
    ├── unit/          # Component tests
    └── e2e/           # Playwright E2E tests
```

## Development

- Lint: `npm run lint`
- Format: `npm run format`
- Test: `npm test`
- E2E: `npm run test:e2e`

## Technologies

- React 18
- TypeScript 5
- Vite 4
- Socket.io Client
- Vitest & Playwright


