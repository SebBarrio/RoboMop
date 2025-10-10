import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import type { SqliteConnectionOptions } from "typeorm/driver/sqlite/SqliteConnectionOptions";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const rootDir = path.resolve(__dirname, "..", "..");

const baseOptions = {
  entities: [path.join(rootDir, "src/models/**/*.{ts,js}")],
  migrations: [path.join(rootDir, "src/migrations/*.{ts,js}")],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === "true"
} satisfies Pick<DataSourceOptions, "entities" | "migrations" | "synchronize" | "logging">;

const isTestEnv = process.env.NODE_ENV === "test";

const sqliteOptions: SqliteConnectionOptions = {
  type: "sqlite",
  database: process.env.SQLITE_PATH ?? path.join(rootDir, "data", "robomop.sqlite"),
  ...baseOptions
};

const postgresOptions: PostgresConnectionOptions = {
  type: "postgres",
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  ...baseOptions
};

const selectedOptions = process.env.DATABASE_URL && !isTestEnv ? postgresOptions : sqliteOptions;

export const AppDataSource = new DataSource(selectedOptions);

export default AppDataSource;
