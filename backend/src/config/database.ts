import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

// PostgreSQL configuration for production
const postgresConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'robomop',
  password: process.env.DB_PASSWORD || 'robomop',
  database: process.env.DB_NAME || 'robomop',
  entities: [path.join(__dirname, '../models/**/*.{ts,js}')],
  migrations: [path.join(__dirname, '../migrations/**/*.{ts,js}')],
  synchronize: process.env.NODE_ENV !== 'production', // Auto-create tables in dev
  logging: process.env.DB_LOGGING === 'true',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

// SQLite configuration for development/testing
const sqliteConfig: DataSourceOptions = {
  type: 'sqlite',
  database: process.env.DB_PATH || path.join(__dirname, '../../data/robomop.db'),
  entities: [path.join(__dirname, '../models/**/*.{ts,js}')],
  migrations: [path.join(__dirname, '../migrations/**/*.{ts,js}')],
  synchronize: process.env.NODE_ENV !== 'production', // Auto-create tables in dev
  logging: process.env.DB_LOGGING === 'true',
};

// Select configuration based on environment
const config: DataSourceOptions =
  process.env.DB_TYPE === 'postgres' || process.env.NODE_ENV === 'production' ? postgresConfig : sqliteConfig;

export const AppDataSource = new DataSource(config);

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<DataSource> {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('Database connection initialized successfully');
    }
    return AppDataSource;
  } catch (error) {
    console.error('Error initializing database connection:', error);
    throw error;
  }
}

/**
 * Close database connection gracefully
 */
export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('Database connection closed');
  }
}

export default config;


