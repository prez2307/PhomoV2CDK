import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { DatabaseStack } from './database-stack';
import { FaceProcessingStack } from './face-processing-stack';

export interface ApiStackProps extends cdk.StackProps {
  stageName: string;
  userPool: cognito.UserPool;
  identityPool: cognito.CfnIdentityPool;
  photoBucket: s3.Bucket;
  collectionId: string;
  databaseStack: DatabaseStack;
  faceProcessingStack: FaceProcessingStack;
}

export class ApiStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stageName, databaseStack, faceProcessingStack, photoBucket } = props;

    // ==================== APPSYNC GRAPHQL API ====================

    this.api = new appsync.GraphqlApi(this, 'PhomoApi', {
      name: `Phomo-API-${stageName}`,

      // Schema from separate file (client-facing API contract)
      definition: appsync.Definition.fromFile(
        path.join(__dirname, '../graphql/schema.graphql')
      ),

      // Authorization
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: props.userPool,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.IAM,
          },
        ],
      },

      // Logging
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
        excludeVerboseContent: false,
      },

      // X-Ray tracing
      xrayEnabled: true,
    });

    // ==================== DATASOURCES ====================

    // DynamoDB data sources for direct VTL/JS resolvers
    const userTableDataSource = this.api.addDynamoDbDataSource(
      'UserTableDataSource',
      databaseStack.userTable
    );

    const friendshipTableDataSource = this.api.addDynamoDbDataSource(
      'FriendshipTableDataSource',
      databaseStack.friendshipTable
    );

    const contentTableDataSource = this.api.addDynamoDbDataSource(
      'ContentTableDataSource',
      databaseStack.contentTable
    );

    const feedEntryTableDataSource = this.api.addDynamoDbDataSource(
      'FeedEntryTableDataSource',
      databaseStack.feedEntryTable
    );

    const eventTableDataSource = this.api.addDynamoDbDataSource(
      'EventTableDataSource',
      databaseStack.eventTable
    );

    const eventMemberTableDataSource = this.api.addDynamoDbDataSource(
      'EventMemberTableDataSource',
      databaseStack.eventMemberTable
    );

    // ==================== LAMBDA FUNCTIONS ====================
    // API Resolver Lambdas (only complex operations that need orchestration)

    // Shared environment variables for all Lambda functions
    const sharedEnvironment = {
      STAGE_NAME: stageName,
      PHOTO_BUCKET_NAME: photoBucket.bucketName,
      REKOGNITION_COLLECTION_ID: props.collectionId,
      USER_TABLE_NAME: databaseStack.userTable.tableName,
      FRIENDSHIP_TABLE_NAME: databaseStack.friendshipTable.tableName,
      CONTENT_TABLE_NAME: databaseStack.contentTable.tableName,
      RECIPIENT_EDGE_TABLE_NAME: databaseStack.recipientEdgeTable.tableName,
      FEED_ENTRY_TABLE_NAME: databaseStack.feedEntryTable.tableName,
      FACE_IDENTITY_TABLE_NAME: databaseStack.faceIdentityTable.tableName,
      CONTENT_FACE_TABLE_NAME: databaseStack.contentFaceTable.tableName,
      EVENT_TABLE_NAME: databaseStack.eventTable.tableName,
      EVENT_MEMBER_TABLE_NAME: databaseStack.eventMemberTable.tableName,
    };

    // Lambda 1: Accept friend request + trigger retroactive matching
    const acceptFriendshipFunction = new lambdaNodejs.NodejsFunction(
      this,
      'AcceptFriendshipFunction',
      {
        functionName: `phomo-accept-friendship-${stageName}`,
        entry: path.join(__dirname, '../lambdas/api-resolvers/accept-friendship.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(90), // Retroactive matching may take time
        memorySize: 512,
        environment: sharedEnvironment,
        bundling: {
          minify: true,
          sourceMap: true,
        },
      }
    );

    // Lambda 2: Generate presigned S3 URLs for content (1-hour expiry)
    const getContentUrlFunction = new lambdaNodejs.NodejsFunction(
      this,
      'GetContentUrlFunction',
      {
        functionName: `phomo-get-content-url-${stageName}`,
        entry: path.join(__dirname, '../lambdas/api-resolvers/get-content-url.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        environment: sharedEnvironment,
        bundling: {
          minify: true,
          sourceMap: true,
        },
      }
    );

    // Lambda 3: Contact discovery - find friends by phone numbers
    const findFriendsByPhoneFunction = new lambdaNodejs.NodejsFunction(
      this,
      'FindFriendsByPhoneFunction',
      {
        functionName: `phomo-find-friends-by-phone-${stageName}`,
        entry: path.join(__dirname, '../lambdas/api-resolvers/find-friends-by-phone.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: sharedEnvironment,
        bundling: {
          minify: true,
          sourceMap: true,
        },
      }
    );

    // ==================== LAMBDA DATA SOURCES ====================

    // Data source for AcceptFriendship resolver
    const acceptFriendshipDataSource = this.api.addLambdaDataSource(
      'AcceptFriendshipDataSource',
      acceptFriendshipFunction
    );

    // Data source for GetContentUrl resolver
    const getContentUrlDataSource = this.api.addLambdaDataSource(
      'GetContentUrlDataSource',
      getContentUrlFunction
    );

    // Data source for FindFriendsByPhone resolver
    const findFriendsByPhoneDataSource = this.api.addLambdaDataSource(
      'FindFriendsByPhoneDataSource',
      findFriendsByPhoneFunction
    );

    // Data source for EnrollFace resolver (from FaceProcessingStack)
    const enrollFaceDataSource = this.api.addLambdaDataSource(
      'EnrollFaceDataSource',
      faceProcessingStack.enrollFaceFunction
    );

    // ==================== IAM PERMISSIONS ====================

    // AcceptFriendship: Read/write Friendship, read User, invoke RetroactiveMatch
    databaseStack.friendshipTable.grantReadWriteData(acceptFriendshipFunction);
    databaseStack.userTable.grantReadData(acceptFriendshipFunction);
    faceProcessingStack.retroactiveMatchFunction.grantInvoke(acceptFriendshipFunction);

    // GetContentUrl: Read Content table, generate S3 presigned URLs
    databaseStack.contentTable.grantReadData(getContentUrlFunction);
    photoBucket.grantRead(getContentUrlFunction);

    // FindFriendsByPhone: Read User table (PhoneNumberIndex)
    databaseStack.userTable.grantReadData(findFriendsByPhoneFunction);

    // ==================== VTL RESOLVERS (Simple CRUD) ====================
    // TODO: Add VTL resolvers for simple DynamoDB operations:
    // - Query.getUser → UserTable GetItem
    // - Query.getFeed → FeedEntryTable Query (UserFeedIndex)
    // - Query.getMyFriends → FriendshipTable Query (User1Index + User2Index)
    // - Query.getMyEvents → EventMemberTable Query (UserEventsIndex)
    // - Query.getEventContent → ContentTable Query (EventContentIndex)
    // - Mutation.updateUser → UserTable UpdateItem
    // - Mutation.blockUser → UserTable UpdateItem (append to blockedUserIds)
    // - Mutation.sendFriendRequest → FriendshipTable PutItem
    // - Mutation.createEvent → Pipeline: EventTable PutItem + EventMemberTable PutItem
    // - Mutation.inviteToEvent → EventMemberTable PutItem
    // - Mutation.createContent → ContentTable PutItem
    // - Mutation.shareContentManually → RecipientEdgeTable PutItem
    // - Mutation.removeRecipient → RecipientEdgeTable DeleteItem
    // - Mutation.deleteContent → Pipeline: Delete from S3 + ContentTable + RecipientEdgeTable

    // ==================== OUTPUTS ====================
    new cdk.CfnOutput(this, 'GraphQLApiUrl', {
      value: this.api.graphqlUrl,
      description: 'AppSync GraphQL API URL',
      exportName: `Phomo-GraphQLApiUrl-${stageName}`,
    });

    new cdk.CfnOutput(this, 'GraphQLApiId', {
      value: this.api.apiId,
      description: 'AppSync GraphQL API ID',
      exportName: `Phomo-GraphQLApiId-${stageName}`,
    });

    new cdk.CfnOutput(this, 'GraphQLApiKey', {
      value: this.api.apiKey || 'N/A',
      description: 'AppSync API Key (if enabled)',
      exportName: `Phomo-GraphQLApiKey-${stageName}`,
    });
  }
}
