process.env.SQLITE_PATH = ":memory:";

import AppDataSource, { initializeDataSource } from "../../src/config/database.js";

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await initializeDataSource();
  }
});

beforeEach(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.dropDatabase();
    await AppDataSource.synchronize();
  }
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
