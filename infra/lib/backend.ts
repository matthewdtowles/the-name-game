import path from "node:path";

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import { WebSocketApi, WebSocketStage } from "aws-cdk-lib/aws-apigatewayv2";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

// The game server: an API Gateway WebSocket API in front of one Lambda, with
// rooms in DynamoDB. Nothing here costs anything while nobody is playing.

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // Rooms are ephemeral: TTL removes each one a day after its last activity,
    // so there is nothing worth keeping if the stack goes away.
    const table = new Table(this, "Rooms", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const handler = new NodejsFunction(this, "Handler", {
      entry: path.join(__dirname, "../../server/src/lambda.ts"),
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup: new LogGroup(this, "HandlerLogs", {
        retention: RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      bundling: { format: OutputFormat.ESM, minify: true, sourceMap: true },
      environment: {
        TABLE_NAME: table.tableName,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    table.grantReadWriteData(handler);

    const integration = new WebSocketLambdaIntegration("Game", handler);
    const api = new WebSocketApi(this, "Api", {
      connectRouteOptions: { integration },
      disconnectRouteOptions: { integration },
      defaultRouteOptions: { integration },
    });
    // Generous for a party game, and a ceiling on what abuse could cost.
    const stage = new WebSocketStage(this, "Live", {
      webSocketApi: api,
      stageName: "live",
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
    });
    handler.addEnvironment("CONNECTIONS_URL", stage.callbackUrl);
    api.grantManageConnections(handler);

    new CfnOutput(this, "WebSocketUrl", { value: stage.url });
  }
}
