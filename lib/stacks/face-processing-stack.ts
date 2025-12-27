import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { DatabaseStack } from './database-stack';

export interface FaceProcessingStackProps extends cdk.StackProps {
  stageName: string;
  photoBucket: s3.Bucket;
  collectionId: string;
  databaseStack: DatabaseStack;
}

export class FaceProcessingStack extends cdk.Stack {
  public readonly processContentFacesFunction: lambda.Function;
  public readonly enrollFaceFunction: lambda.Function;
  public readonly retroactiveMatchFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: FaceProcessingStackProps) {
    super(scope, id, props);

    const { stageName, photoBucket, collectionId, databaseStack } = props;

    // ==================== DEAD LETTER QUEUE ====================

    const photoProcessingDLQ = new sqs.Queue(this, 'PhotoProcessingDLQ', {
      queueName: `phomo-photo-processing-dlq-${stageName}`,
      retentionPeriod: cdk.Duration.days(14), // Keep failed messages for debugging
    });

    // ==================== SQS QUEUE ====================

    // Queue for processing photos (face detection + matching)
    // Note: Face enrollment is synchronous (AppSync mutation), not queued
    const photoProcessingQueue = new sqs.Queue(this, 'PhotoProcessingQueue', {
      queueName: `phomo-photo-processing-${stageName}`,
      visibilityTimeout: cdk.Duration.seconds(30), // Lambda has 30s to process
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: photoProcessingDLQ,
        maxReceiveCount: 3, // After 3 failed attempts, send to DLQ
      },
    });

    // ==================== LAMBDA FUNCTIONS ====================

    // Shared environment variables for all face processing Lambdas
    const sharedEnvironment = {
      STAGE_NAME: stageName,
      REKOGNITION_COLLECTION_ID: collectionId,
      PHOTO_BUCKET_NAME: photoBucket.bucketName,
      USER_TABLE_NAME: databaseStack.userTable.tableName,
      FRIENDSHIP_TABLE_NAME: databaseStack.friendshipTable.tableName,
      CONTENT_TABLE_NAME: databaseStack.contentTable.tableName,
      RECIPIENT_EDGE_TABLE_NAME: databaseStack.recipientEdgeTable.tableName,
      FACE_IDENTITY_TABLE_NAME: databaseStack.faceIdentityTable.tableName,
      CONTENT_FACE_TABLE_NAME: databaseStack.contentFaceTable.tableName,
      EVENT_TABLE_NAME: databaseStack.eventTable.tableName,
    };

    // Lambda: Process photo faces (detect + match) - ASYNC via SQS
    this.processContentFacesFunction = new lambdaNodejs.NodejsFunction(
      this,
      'ProcessContentFacesFunction',
      {
        functionName: `phomo-process-content-faces-${stageName}`,
        entry: path.join(__dirname, '../lambdas/src/face-processing/process-content-faces.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        environment: sharedEnvironment,
        bundling: {
          minify: true,
          sourceMap: true,
          forceDockerBundling: false, // Use local esbuild
        },
      }
    );

    // Lambda: Enroll user face for profile photo - SYNC via AppSync
    this.enrollFaceFunction = new lambdaNodejs.NodejsFunction(this, 'EnrollFaceFunction', {
      functionName: `phomo-enroll-face-${stageName}`,
      entry: path.join(__dirname, '../lambdas/src/face-processing/enroll-face.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: sharedEnvironment,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Lambda: Retroactive face matching (called by AcceptFriendship)
    this.retroactiveMatchFunction = new lambdaNodejs.NodejsFunction(
      this,
      'RetroactiveMatchFunction',
      {
        functionName: `phomo-retroactive-match-${stageName}`,
        entry: path.join(__dirname, '../lambdas/src/face-processing/retroactive-match.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(60), // Can be slow for many unknown faces
        memorySize: 512,
        environment: sharedEnvironment,
        bundling: {
          minify: true,
          sourceMap: true,
          forceDockerBundling: false, // Use local esbuild
        },
      }
    );

    // ==================== SQS EVENT SOURCE ====================

    // Trigger ProcessContentFaces from SQS (async processing)
    this.processContentFacesFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(photoProcessingQueue, {
        batchSize: 1, // Process one photo at a time (Rekognition is slow)
        maxBatchingWindow: cdk.Duration.seconds(0), // No batching delay
      })
    );

    // Note: EnrollFace is NOT triggered by SQS - it's called directly via AppSync

    // ==================== EVENTBRIDGE RULE ====================

    // Rule: S3 photo upload → PhotoProcessingQueue
    new events.Rule(this, 'PhotoUploadRule', {
      ruleName: `phomo-photo-upload-${stageName}`,
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [photoBucket.bucketName],
          },
          object: {
            key: [{ prefix: 'photos/' }], // Only content photos
          },
        },
      },
      targets: [new targets.SqsQueue(photoProcessingQueue)],
    });

    // Note: No EventBridge rule for faces/ - enrollment is synchronous via AppSync

    // ==================== IAM PERMISSIONS ====================

    // Grant Rekognition permissions
    const rekognitionPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rekognition:IndexFaces',
        'rekognition:SearchUsers',
        'rekognition:SearchFaces',
        'rekognition:SearchFacesByImage',
        'rekognition:CreateUser',
        'rekognition:AssociateFaces',
        'rekognition:ListFaces',
        'rekognition:DetectFaces',
      ],
      resources: ['*'], // Rekognition doesn't support resource-level permissions
    });

    this.processContentFacesFunction.addToRolePolicy(rekognitionPolicy);
    this.enrollFaceFunction.addToRolePolicy(rekognitionPolicy);
    this.retroactiveMatchFunction.addToRolePolicy(rekognitionPolicy);

    // Grant S3 read permissions
    photoBucket.grantRead(this.processContentFacesFunction);
    photoBucket.grantRead(this.enrollFaceFunction);

    // Grant DynamoDB permissions
    databaseStack.userTable.grantReadWriteData(this.processContentFacesFunction);
    databaseStack.userTable.grantReadWriteData(this.enrollFaceFunction);
    databaseStack.userTable.grantReadData(this.retroactiveMatchFunction);

    databaseStack.friendshipTable.grantReadData(this.processContentFacesFunction);
    databaseStack.friendshipTable.grantReadData(this.retroactiveMatchFunction);

    databaseStack.contentTable.grantReadData(this.processContentFacesFunction);

    databaseStack.recipientEdgeTable.grantWriteData(this.processContentFacesFunction);
    databaseStack.recipientEdgeTable.grantWriteData(this.retroactiveMatchFunction);

    databaseStack.faceIdentityTable.grantReadWriteData(this.processContentFacesFunction);
    databaseStack.faceIdentityTable.grantReadWriteData(this.retroactiveMatchFunction);

    databaseStack.contentFaceTable.grantReadWriteData(this.processContentFacesFunction);
    databaseStack.contentFaceTable.grantReadData(this.retroactiveMatchFunction);

    databaseStack.eventTable.grantReadData(this.processContentFacesFunction);

    // ==================== OUTPUTS ====================

    new cdk.CfnOutput(this, 'PhotoProcessingQueueUrl', {
      value: photoProcessingQueue.queueUrl,
      exportName: `Phomo-PhotoProcessingQueueUrl-${stageName}`,
    });

    new cdk.CfnOutput(this, 'ProcessContentFacesFunctionArn', {
      value: this.processContentFacesFunction.functionArn,
      exportName: `Phomo-ProcessContentFacesFunctionArn-${stageName}`,
    });

    new cdk.CfnOutput(this, 'EnrollFaceFunctionArn', {
      value: this.enrollFaceFunction.functionArn,
      exportName: `Phomo-EnrollFaceFunctionArn-${stageName}`,
    });

    new cdk.CfnOutput(this, 'RetroactiveMatchFunctionArn', {
      value: this.retroactiveMatchFunction.functionArn,
      exportName: `Phomo-RetroactiveMatchFunctionArn-${stageName}`,
    });
  }
}
