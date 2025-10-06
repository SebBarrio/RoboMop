module.exports = {
  root: true,
  ignorePatterns: ["jest.config.ts"],
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.json"],
    tsconfigRootDir: __dirname,
    sourceType: "module"
  },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/typescript",
    "prettier"
  ],
  rules: {
    "import/order": [
      "error",
      {
        "groups": [["builtin", "external"], "internal", "parent", "sibling", "index"],
        "newlines-between": "always"
      }
    ],
    "@typescript-eslint/explicit-module-boundary-types": "off"
  },
  overrides: [
    {
      files: ["tests/**/*.ts"],
      rules: {
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "import/order": "off"
      }
    }
  ]
};
