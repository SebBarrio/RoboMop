import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import type { SqliteConnectionOptions } from "typeorm/driver/sqlite/SqliteConnectionOptions";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { Robot } from "../models/Robot.js";
import { RobotState } from "../models/RobotState.js";
import { Map } from "../models/Map.js";
import { RestrictedZone } from "../models/RestrictedZone.js";
import { Session } from "../models/Session.js";
import { Log } from "../models/Log.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

const isTestEnv = process.env.NODE_ENV === "test";

const baseOptions = {
  entities: [Robot, RobotState, Map, RestrictedZone, Session, Log],
  migrations: [],
  synchronize: isTestEnv,
  logging: process.env.TYPEORM_LOGGING === "true"
} satisfies Pick<DataSourceOptions, "entities" | "migrations" | "synchronize" | "logging">;

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

export const initializeDataSource = async (): Promise<DataSource> => {
  if (AppDataSource.isInitialized) {
    return AppDataSource;
  }

  return AppDataSource.initialize();
};

export default AppDataSource;
