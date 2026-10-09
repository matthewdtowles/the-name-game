import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  AaaaRecord,
  ARecord,
  HostedZone,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

import type { Zone } from "./zone";

// The web app (the Expo web export) in a private bucket behind CloudFront.
// Files are published by CI after the stack deploys, not by CloudFormation.

export class WebStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { domainName: string; zone: Zone },
  ) {
    super(scope, id, props);
    const zone = HostedZone.fromHostedZoneAttributes(this, "Zone", props.zone);

    const bucket = new Bucket(this, "Site", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    const certificate = new Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: CertificateValidation.fromDns(zone),
    });

    // App routes such as /j/ABCD have no file behind them: serve the app shell
    // and let the router take over. Files (anything with an extension) and
    // /.well-known/ (app links) are served as-is.
    const appRoutes = new Function(this, "AppRoutes", {
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var last = request.uri.split("/").pop();
  if (request.uri.indexOf("/.well-known/") !== 0 && last.indexOf(".") === -1) {
    request.uri = "/index.html";
  }
  return request;
}`),
    });

    const distribution = new Distribution(this, "Cdn", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          { function: appRoutes, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      defaultRootObject: "index.html",
      domainNames: [props.domainName],
      certificate,
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
    });

    const target = RecordTarget.fromAlias(new CloudFrontTarget(distribution));
    new ARecord(this, "Alias", { zone, recordName: props.domainName, target });
    new AaaaRecord(this, "AliasV6", {
      zone,
      recordName: props.domainName,
      target,
    });

    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
    new CfnOutput(this, "Url", { value: `https://${props.domainName}` });
  }
}
