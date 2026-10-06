import { App, Tags } from "aws-cdk-lib";

import { BackendStack } from "../lib/backend";

// Every stack is named TheNameGame*: the tng deploy role is pinned to those
// names (infra/setup), and the tag drives the project's cost budget.
const app = new App();
Tags.of(app).add("project", "the-name-game");

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" };
new BackendStack(app, "TheNameGameStagingBackend", { env });
new BackendStack(app, "TheNameGameProdBackend", { env });
