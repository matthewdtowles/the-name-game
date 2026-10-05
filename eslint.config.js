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
];
