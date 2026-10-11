import path from "node:path";

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  ApiMapping,
  DomainName,
  WebSocketApi,
  WebSocketStage,
} from "aws-cdk-lib/aws-apigatewayv2";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
  type IMetric,
} from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGatewayv2DomainProperties } from "aws-cdk-lib/aws-route53-targets";
import { Topic } from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";

import type { Zone } from "./zone";

// The game server: an API Gateway WebSocket API in front of one Lambda, with
// rooms in DynamoDB. Nothing here costs anything while nobody is playing.

export class BackendStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { domainName: string; zone: Zone; alarms: boolean },
  ) {
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

    // The app connects to the game server's own name, e.g. play.whosename.app.
    const zone = HostedZone.fromHostedZoneAttributes(this, "Zone", props.zone);
    const domain = new DomainName(this, "Domain", {
      domainName: props.domainName,
      certificate: new Certificate(this, "Certificate", {
        domainName: props.domainName,
        validation: CertificateValidation.fromDns(zone),
      }),
    });
    new ApiMapping(this, "Mapping", { api, domainName: domain, stage });
    new ARecord(this, "Alias", {
      zone,
      recordName: props.domainName,
      target: RecordTarget.fromAlias(
        new ApiGatewayv2DomainProperties(
          domain.regionalDomainName,
          domain.regionalHostedZoneId,
        ),
      ),
    });

    new CfnOutput(this, "WebSocketUrl", { value: `wss://${props.domainName}` });
    new CfnOutput(this, "ApiEndpoint", { value: stage.url });
    new CfnOutput(this, "TableName", { value: table.tableName });

    if (!props.alarms) return;
    // Alarms email whoever infra/setup subscribes to this topic, which keeps
    // the address out of the repo and CI.
    const topic = new Topic(this, "Alarms");
    const alarm = (
      id: string,
      metric: IMetric,
      threshold: number,
      about: string,
    ) =>
      new Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        alarmDescription: about,
      }).addAlarmAction(new SnsAction(topic));
    const fiveMinutes = { period: Duration.minutes(5), statistic: "Sum" };
    alarm(
      "HandlerErrors",
      handler.metricErrors(fiveMinutes),
      1,
      "The game server failed on a message; its logs say why.",
    );
    alarm(
      "HandlerThrottles",
      handler.metricThrottles(fiveMinutes),
      1,
      "Lambda turned messages away: the account's concurrency ran out.",
    );
    // A busy night of parties sends a few thousand messages an hour; this many
    // is a hit, or someone hammering the API at the stage throttle.
    alarm(
      "MessageSurge",
      new Metric({
        namespace: "AWS/ApiGateway",
        metricName: "MessageCount",
        dimensionsMap: { ApiId: api.apiId, Stage: stage.stageName },
        period: Duration.hours(1),
        statistic: "Sum",
      }),
      50_000,
      "Far more WebSocket messages than usual in the last hour.",
    );
    new CfnOutput(this, "AlarmTopicArn", { value: topic.topicArn });
  }
}
