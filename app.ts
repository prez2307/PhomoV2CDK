#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from './lib/pipeline-stack';

const app = new cdk.App();

// Create the pipeline stack - it will manage deployments to all stages
new PipelineStack(app, 'PhomoV2-Pipeline', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

app.synth();
