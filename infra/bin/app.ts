import { App, Tags } from "aws-cdk-lib";

import { BackendStack } from "../lib/backend";
import { WebStack } from "../lib/web";

// Every stack is named TheNameGame*: the tng deploy role is pinned to those
// names (infra/setup), and the tag drives the project's cost budget.
const app = new App();
Tags.of(app).add("project", "the-name-game");

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" };
const domain: string = app.node.getContext("domain");
const zone = {
  hostedZoneId: app.node.getContext("hostedZoneId"),
  zoneName: domain,
};

for (const [stage, host] of [
  ["Staging", `staging.${domain}`],
  ["Prod", domain],
] as const) {
  new BackendStack(app, `TheNameGame${stage}Backend`, {
    env,
    zone,
    domainName: `play.${host}`,
  });
  new WebStack(app, `TheNameGame${stage}Web`, { env, zone, domainName: host });
}
