import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const rootDir = path.resolve(__dirname, "..", "..");

const commonOptions: Partial<DataSourceOptions> = {
  entities: [path.join(rootDir, "src/models/**/*.{ts,js}")],
  migrations: [path.join(rootDir, "src/migrations/*.{ts,js}")],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === "true"
};

const isTestEnv = process.env.NODE_ENV === "test";

const sqliteOptions: DataSourceOptions = {
  type: "sqlite",
  database: process.env.SQLITE_PATH ?? path.join(rootDir, "data", "robomop.sqlite"),
  ...commonOptions
};

const postgresOptions: DataSourceOptions = {
  type: "postgres",
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  ...commonOptions
};

const selectedOptions = process.env.DATABASE_URL && !isTestEnv ? postgresOptions : sqliteOptions;

export const AppDataSource = new DataSource(selectedOptions);

export default AppDataSource;
