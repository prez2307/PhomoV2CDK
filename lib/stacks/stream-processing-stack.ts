import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';
import { DatabaseStack } from './database-stack';

export interface StreamProcessingStackProps extends cdk.StackProps {
  stageName: string;
  databaseStack: DatabaseStack;
}

export class StreamProcessingStack extends cdk.Stack {
  public readonly feedEntrySyncFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: StreamProcessingStackProps) {
    super(scope, id, props);

    const { stageName, databaseStack } = props;

    // ==================== LAMBDA FUNCTION ====================

    // Lambda: Sync RecipientEdge → FeedEntry
    // Triggered by DynamoDB stream on RecipientEdge table
    this.feedEntrySyncFunction = new lambdaNodejs.NodejsFunction(
      this,
      'FeedEntrySyncFunction',
      {
        functionName: `phomo-feed-entry-sync-${stageName}`,
        entry: path.join(__dirname, '../lambdas/stream-processing/feed-entry-sync.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        environment: {
          STAGE_NAME: stageName,
          FEED_ENTRY_TABLE_NAME: databaseStack.feedEntryTable.tableName,
          CONTENT_TABLE_NAME: databaseStack.contentTable.tableName,
        },
        bundling: {
          minify: true,
          sourceMap: true,
        },
      }
    );

    // ==================== DYNAMODB STREAM EVENT SOURCE ====================

    // Trigger on RecipientEdge table stream
    this.feedEntrySyncFunction.addEventSource(
      new lambdaEventSources.DynamoEventSource(databaseStack.recipientEdgeTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10, // Process up to 10 records at once
        bisectBatchOnError: true, // If batch fails, split and retry
        retryAttempts: 3,
      })
    );

    // ==================== IAM PERMISSIONS ====================

    // Grant read permissions on Content table (to fetch metadata)
    databaseStack.contentTable.grantReadData(this.feedEntrySyncFunction);

    // Grant write permissions on FeedEntry table
    databaseStack.feedEntryTable.grantWriteData(this.feedEntrySyncFunction);

    // ==================== OUTPUTS ====================

    new cdk.CfnOutput(this, 'FeedEntrySyncFunctionArn', {
      value: this.feedEntrySyncFunction.functionArn,
      exportName: `Phomo-FeedEntrySyncFunctionArn-${stageName}`,
    });
  }
}
