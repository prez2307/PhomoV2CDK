import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';
import { DatabaseStack } from './database-stack';

export interface ScheduledJobsStackProps extends cdk.StackProps {
  stageName: string;
  databaseStack: DatabaseStack;
}

export class ScheduledJobsStack extends cdk.Stack {
  public readonly sendEventRemindersFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ScheduledJobsStackProps) {
    super(scope, id, props);

    const { stageName, databaseStack } = props;

    // ==================== LAMBDA FUNCTION ====================

    // Lambda: Send event reminders (checks for ongoing events)
    this.sendEventRemindersFunction = new lambdaNodejs.NodejsFunction(
      this,
      'SendEventRemindersFunction',
      {
        functionName: `phomo-send-event-reminders-${stageName}`,
        entry: path.join(__dirname, '../lambdas/src/scheduled-jobs/send-event-reminders.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(60), // May need to scan many events
        memorySize: 256,
        environment: {
          STAGE_NAME: stageName,
          EVENT_TABLE_NAME: databaseStack.eventTable.tableName,
          EVENT_MEMBER_TABLE_NAME: databaseStack.eventMemberTable.tableName,
          USER_TABLE_NAME: databaseStack.userTable.tableName,
        },
        bundling: {
          minify: true,
          sourceMap: true,
          forceDockerBundling: false, // Use local esbuild
        },
      }
    );

    // ==================== EVENTBRIDGE CRON RULE ====================

    // Run every hour to check for ongoing events
    const eventReminderRule = new events.Rule(this, 'EventReminderRule', {
      ruleName: `phomo-event-reminder-${stageName}`,
      schedule: events.Schedule.rate(cdk.Duration.hours(1)), // Every hour
      description: 'Check for ongoing events and send reminders',
    });

    eventReminderRule.addTarget(
      new targets.LambdaFunction(this.sendEventRemindersFunction)
    );

    // ==================== IAM PERMISSIONS ====================

    // Grant read access to Event and EventMember tables
    databaseStack.eventTable.grantReadData(this.sendEventRemindersFunction);
    databaseStack.eventMemberTable.grantReadData(this.sendEventRemindersFunction);
    databaseStack.userTable.grantReadData(this.sendEventRemindersFunction);

    // ==================== OUTPUTS ====================

    new cdk.CfnOutput(this, 'SendEventRemindersFunctionArn', {
      value: this.sendEventRemindersFunction.functionArn,
      exportName: `Phomo-SendEventRemindersFunctionArn-${stageName}`,
    });
  }
}
