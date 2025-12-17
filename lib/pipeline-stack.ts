import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { PhomoStage } from "./phomo-stage";
import { stages } from "../config/stages";

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // GitHub CodeStar connection
    const githubConnectionArn =
      "arn:aws:codestar-connections:us-east-1:948676469219:connection/d95b4a92-691d-4645-a685-c39a5b365ab7";

    // Source 1: CDK Infrastructure code
    const cdkSource = pipelines.CodePipelineSource.connection(
      "prez2307/PhomoV2CDK",
      "main",
      {
        connectionArn: githubConnectionArn,
      }
    );

    // Source 2: Lambda handler code
    const lambdaSource = pipelines.CodePipelineSource.connection(
      "prez2307/PhomoV2Lambdas",
      "main",
      {
        connectionArn: githubConnectionArn,
      }
    );

    // CDK Pipeline
    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      pipelineName: "PhomoV2",
      synth: new pipelines.ShellStep("Synth", {
        input: cdkSource,
        additionalInputs: {
          PhomoV2Lambdas: lambdaSource,
        },
        commands: [
          "npm ci",
          "npm run build",
          "npx cdk synth",
        ],
      }),
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        },
      },
      selfMutation: true, // Pipeline updates itself
    });

    // Add deployment stages for each environment
    stages.forEach((stageConfig) => {
      const appStage = new PhomoStage(this, `Phomo-${stageConfig.stageName}`, {
        env: {
          account: stageConfig.account || process.env.CDK_DEFAULT_ACCOUNT,
          region: stageConfig.region,
        },
        stageName: stageConfig.stageName,
      });

      pipeline.addStage(appStage);

      // TODO: Add manual approval gates when needed
      // if (stageConfig.stageName === 'staging' || stageConfig.stageName === 'prod') {
      //   stageDeployment.addPre(new pipelines.ManualApprovalStep(`Approve-${stageConfig.stageName}`));
      // }
    });
  }
}
