import { AppDataSource } from '../src/config/database';

// Setup test environment
beforeAll(async () => {
  // Initialize test database
  process.env.DB_TYPE = 'sqlite';
  process.env.DB_PATH = ':memory:'; // In-memory database for tests
  
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  
  // Run migrations
  await AppDataSource.runMigrations();
});

afterAll(async () => {
  // Clean up database connections
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});

// Clear data between tests
afterEach(async () => {
  if (AppDataSource.isInitialized) {
    const entities = AppDataSource.entityMetadatas;

    if (AppDataSource.options.type === 'sqlite') {
      await AppDataSource.query('PRAGMA foreign_keys=OFF');
    }

    for (const entity of entities) {
      const repository = AppDataSource.getRepository(entity.name);
      await repository.query(`DELETE FROM ${entity.tableName}`);
    }

    if (AppDataSource.options.type === 'sqlite') {
      await AppDataSource.query('PRAGMA foreign_keys=ON');
    }
  }
});


