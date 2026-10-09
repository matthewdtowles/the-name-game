const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    ignores: ["**/dist/*", "**/.expo/*", "**/node_modules/*", "**/cdk.out/*"],
  },
  {
    // Each zod schema shares its name with its inferred type (`RoomView` the
    // schema, `RoomView` the type). TypeScript already rejects real
    // redeclarations, so this rule only flags that idiom.
    files: ["shared/**"],
    rules: { "@typescript-eslint/no-redeclare": "off" },
  },
  {
    // Expo inlines EXPO_PUBLIC_* vars into app bundles, so it forbids dynamic
    // env reads. Server and infra code reads a real process.env at runtime.
    files: ["server/**", "infra/**"],
    rules: { "expo/no-dynamic-env-var": "off" },
  },
  {
    // `jest.mock` factories are hoisted above the imports, so they can only
    // reach a module through `require()`.
    files: ["app/__tests__/**"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
