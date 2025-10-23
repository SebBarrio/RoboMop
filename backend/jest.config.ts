import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: ["src/**/*.ts"],
  coverageDirectory: "coverage",
  testMatch: ["**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.(ts)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        useESM: true
      }
    ]
  },
  moduleNameMapper: {
    "^(\\.\\.?/.*)\\.js$": "$1"
  }
};

export default config;
