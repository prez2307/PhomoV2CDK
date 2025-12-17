import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export interface DatabaseStackProps extends cdk.StackProps {
  stageName: string;
}

export class DatabaseStack extends cdk.Stack {
  // Export table references for other stacks
  public readonly userTable: dynamodb.Table;
  public readonly friendshipTable: dynamodb.Table;
  public readonly contentTable: dynamodb.Table;
  public readonly recipientEdgeTable: dynamodb.Table;
  public readonly feedEntryTable: dynamodb.Table;
  public readonly faceIdentityTable: dynamodb.Table;
  public readonly contentFaceTable: dynamodb.Table;
  public readonly eventTable: dynamodb.Table;
  public readonly eventMemberTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { stageName } = props;
    const isProd = stageName === 'prod';

    // ==================== 1. USER TABLE ====================
    // Purpose: User profiles with face enrollment tracking
    // Attributes: displayName, profilePhotoS3Key, primaryFaceIdentityId,
    //             faceCount, expoPushToken, blockedUserIds, phoneNumber
    this.userTable = new dynamodb.Table(this, 'UserTable', {
      tableName: `User-${stageName}`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query users by phone number (contact discovery)
    this.userTable.addGlobalSecondaryIndex({
      indexName: 'PhoneNumberIndex',
      partitionKey: {
        name: 'phoneNumber',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== 2. FRIENDSHIP TABLE ====================
    // Purpose: Friend relationships with bidirectional access
    // Design: user1Id < user2Id (lexicographically) to prevent duplicate edges
    // Attributes: user1Id, user2Id, status (PENDING | ACCEPTED),
    //             requesterId, createdAt, acceptedAt
    this.friendshipTable = new dynamodb.Table(this, 'FriendshipTable', {
      tableName: `Friendship-${stageName}`,
      partitionKey: {
        name: 'friendshipId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query friendships where I'm user1
    this.friendshipTable.addGlobalSecondaryIndex({
      indexName: 'User1Index',
      partitionKey: {
        name: 'user1Id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Query friendships where I'm user2
    this.friendshipTable.addGlobalSecondaryIndex({
      indexName: 'User2Index',
      partitionKey: {
        name: 'user2Id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Fast "are we friends?" lookup (e.g., "alice#bob")
    this.friendshipTable.addGlobalSecondaryIndex({
      indexName: 'UserPairIndex',
      partitionKey: {
        name: 'userPair',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== 3. CONTENT TABLE ====================
    // Purpose: Content metadata (photos/videos - binaries in S3)
    // Attributes: ownerId, ownerIdentityId, s3Key, thumbS3Key,
    //             eventId (nullable), createdAt
    this.contentTable = new dynamodb.Table(this, 'ContentTable', {
      tableName: `Content-${stageName}`,
      partitionKey: {
        name: 'contentId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query "all content I created"
    this.contentTable.addGlobalSecondaryIndex({
      indexName: 'OwnerContentIndex',
      partitionKey: {
        name: 'ownerId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Query "all content from this event"
    this.contentTable.addGlobalSecondaryIndex({
      indexName: 'EventContentIndex',
      partitionKey: {
        name: 'eventId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== 4. RECIPIENT EDGE TABLE ⭐ ====================
    // Purpose: Permission graph - WHO can see WHICH content and WHY
    // This is the source of truth for access control
    // Stream enabled: Triggers FeedEntry sync Lambda
    // Attributes: contentId, recipientUserId, contentOwnerId,
    //             method (FACE_MATCH | SHARED_CAMERA | MANUAL),
    //             confidence (0-100), sourceType (REALTIME | RETROACTIVE), createdAt
    this.recipientEdgeTable = new dynamodb.Table(this, 'RecipientEdgeTable', {
      tableName: `RecipientEdge-${stageName}`,
      partitionKey: {
        name: 'edgeId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_IMAGE, // Trigger FeedEntry sync
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query "all content I can see"
    this.recipientEdgeTable.addGlobalSecondaryIndex({
      indexName: 'RecipientContentIndex',
      partitionKey: {
        name: 'recipientUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Query "who can see this content"
    this.recipientEdgeTable.addGlobalSecondaryIndex({
      indexName: 'ContentRecipientsIndex',
      partitionKey: {
        name: 'contentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'recipientUserId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Query "all my content that Alice can see"
    this.recipientEdgeTable.addGlobalSecondaryIndex({
      indexName: 'OwnerRecipientIndex',
      partitionKey: {
        name: 'contentOwnerId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'recipientUserId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== 5. FEED ENTRY TABLE ⭐ ====================
    // Purpose: Presentation layer for fast feed queries
    // Denormalized from RecipientEdge + Content metadata
    // Created automatically via DynamoDB stream trigger
    // Attributes: recipientUserId, contentId, contentOwnerId,
    //             contentS3Key, contentThumbS3Key, contentCreatedAt,
    //             edgeCreatedAt, method, confidence
    this.feedEntryTable = new dynamodb.Table(this, 'FeedEntryTable', {
      tableName: `FeedEntry-${stageName}`,
      partitionKey: {
        name: 'feedEntryId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query "my feed, newest first"
    this.feedEntryTable.addGlobalSecondaryIndex({
      indexName: 'UserFeedIndex',
      partitionKey: {
        name: 'recipientUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'edgeCreatedAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== 6. FACE IDENTITY TABLE ====================
    // Purpose: Per-owner unknown faces (privacy-preserving)
    // When Alice photographs unknown person X, only Alice knows about it
    // Enables efficient retroactive matching when friendships accepted
    // Attributes: ownerId (photo taker), faceId (Rekognition),
    //             status (UNKNOWN | RESOLVED), resolvedToUserId,
    //             firstSeenContentId, lastSeenContentId, detectionCount,
    //             createdAt, resolvedAt
    this.faceIdentityTable = new dynamodb.Table(this, 'FaceIdentityTable', {
      tableName: `FaceIdentity-${stageName}`,
      partitionKey: {
        name: 'faceIdentityId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query "my unknown faces" (critical for retroactive matching)
    this.faceIdentityTable.addGlobalSecondaryIndex({
      indexName: 'OwnerUnknownFacesIndex',
      partitionKey: {
        name: 'ownerId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Lookup by Rekognition faceId
    this.faceIdentityTable.addGlobalSecondaryIndex({
      indexName: 'FaceIdIndex',
      partitionKey: {
        name: 'faceId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== 7. CONTENT FACE TABLE ====================
    // Purpose: Junction table linking content to faces (reverse index)
    // Critical for retroactive matching: "Find all content with unknown face X"
    // Attributes: contentId, faceIdentityId, boundingBox, confidence, createdAt
    this.contentFaceTable = new dynamodb.Table(this, 'ContentFaceTable', {
      tableName: `ContentFace-${stageName}`,
      partitionKey: {
        name: 'contentFaceId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query "all faces in content X"
    this.contentFaceTable.addGlobalSecondaryIndex({
      indexName: 'ContentFacesIndex',
      partitionKey: {
        name: 'contentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'faceIdentityId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Query "all content with unknown face Y" (retroactive matching)
    this.contentFaceTable.addGlobalSecondaryIndex({
      indexName: 'FaceIdentityContentIndex',
      partitionKey: {
        name: 'faceIdentityId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'contentId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== 8. EVENT TABLE ====================
    // Purpose: Events where multiple people can upload photos/videos
    // Attributes: name, ownerId, memberUserIds (array), createdAt,
    //             eventDate, eventStartTime, eventEndTime (for reminders)
    this.eventTable = new dynamodb.Table(this, 'EventTable', {
      tableName: `Phomo-Event-${stageName}`,
      partitionKey: {
        name: 'eventId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query "events I own"
    this.eventTable.addGlobalSecondaryIndex({
      indexName: 'OwnerEventsIndex',
      partitionKey: {
        name: 'ownerId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== 9. EVENT MEMBER TABLE ====================
    // Purpose: Junction table for event membership (owner + invited members)
    // Enables: "Get all events I'm part of" and "Get all members of event"
    // Attributes: eventId, userId, role (OWNER | MEMBER),
    //             invitedBy, status (INVITED | ACCEPTED), joinedAt
    this.eventMemberTable = new dynamodb.Table(this, 'EventMemberTable', {
      tableName: `Phomo-EventMember-${stageName}`,
      partitionKey: {
        name: 'eventMemberId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // GSI: Query "all events I'm part of" (owner OR member)
    this.eventMemberTable.addGlobalSecondaryIndex({
      indexName: 'UserEventsIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'joinedAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Query "all members of this event"
    this.eventMemberTable.addGlobalSecondaryIndex({
      indexName: 'EventMembersIndex',
      partitionKey: {
        name: 'eventId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ==================== OUTPUTS ====================
    new cdk.CfnOutput(this, 'UserTableName', {
      value: this.userTable.tableName,
      exportName: `UserTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'FriendshipTableName', {
      value: this.friendshipTable.tableName,
      exportName: `FriendshipTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'ContentTableName', {
      value: this.contentTable.tableName,
      exportName: `ContentTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'RecipientEdgeTableName', {
      value: this.recipientEdgeTable.tableName,
      exportName: `RecipientEdgeTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'FeedEntryTableName', {
      value: this.feedEntryTable.tableName,
      exportName: `FeedEntryTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'FaceIdentityTableName', {
      value: this.faceIdentityTable.tableName,
      exportName: `FaceIdentityTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'ContentFaceTableName', {
      value: this.contentFaceTable.tableName,
      exportName: `ContentFaceTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'EventTableName', {
      value: this.eventTable.tableName,
      exportName: `Phomo-EventTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'EventMemberTableName', {
      value: this.eventMemberTable.tableName,
      exportName: `Phomo-EventMemberTableName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'RecipientEdgeTableStreamArn', {
      value: this.recipientEdgeTable.tableStreamArn!,
      description: 'DynamoDB stream ARN for RecipientEdge table (triggers FeedEntry sync)',
      exportName: `Phomo-RecipientEdgeStreamArn-${stageName}`,
    });
  }
}
