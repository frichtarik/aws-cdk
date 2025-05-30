import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Aws, Duration, IResource, Lazy, RemovalPolicy, Resource, Token } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { Endpoint } from './endpoint';
import { InstanceType } from './instance';
import { CfnDBCluster, CfnDBInstance } from 'aws-cdk-lib/aws-neptune';
import { IClusterParameterGroup, IParameterGroup } from './parameter-group';
import { ISubnetGroup, SubnetGroup } from './subnet-group';
import { addConstructMetadata } from 'aws-cdk-lib/core/lib/metadata-resource';
import { propertyInjectable } from 'aws-cdk-lib/core/lib/prop-injectable';

/**
 * Possible Instances Types to use in Neptune cluster
 * used for defining `DatabaseClusterProps.engineVersion`.
 */
export class EngineVersion {
  /**
   * Neptune engine version 1.0.1.0
   */
  public static readonly V1_0_1_0 = new EngineVersion('1.0.1.0');
  /**
   * Neptune engine version 1.0.1.1
   */
  public static readonly V1_0_1_1 = new EngineVersion('1.0.1.1');
  /**
   * Neptune engine version 1.0.1.2
   */
  public static readonly V1_0_1_2 = new EngineVersion('1.0.1.2');
  /**
   * Neptune engine version 1.0.2.1
   */
  public static readonly V1_0_2_1 = new EngineVersion('1.0.2.1');
  /**
   * Neptune engine version 1.0.2.2
   */
  public static readonly V1_0_2_2 = new EngineVersion('1.0.2.2');
  /**
   * Neptune engine version 1.0.3.0
   */
  public static readonly V1_0_3_0 = new EngineVersion('1.0.3.0');
  /**
   * Neptune engine version 1.0.4.0
   */
  public static readonly V1_0_4_0 = new EngineVersion('1.0.4.0');
  /**
   * Neptune engine version 1.0.4.1
   */
  public static readonly V1_0_4_1 = new EngineVersion('1.0.4.1');
  /**
   * Neptune engine version 1.0.5.0
   */
  public static readonly V1_0_5_0 = new EngineVersion('1.0.5.0');
  /**
   * Neptune engine version 1.1.0.0
   */
  public static readonly V1_1_0_0 = new EngineVersion('1.1.0.0');
  /**
   * Neptune engine version 1.1.1.0
   */
  public static readonly V1_1_1_0 = new EngineVersion('1.1.1.0');
  /**
   * Neptune engine version 1.2.0.0
   */
  public static readonly V1_2_0_0 = new EngineVersion('1.2.0.0');
  /**
   * Neptune engine version 1.2.0.1
   */
  public static readonly V1_2_0_1 = new EngineVersion('1.2.0.1');
  /**
   * Neptune engine version 1.2.0.2
   */
  public static readonly V1_2_0_2 = new EngineVersion('1.2.0.2');
  /**
   * Neptune engine version 1.2.1.0
   */
  public static readonly V1_2_1_0 = new EngineVersion('1.2.1.0');
  /**
   * Neptune engine version 1.2.1.1
   */
  public static readonly V1_2_1_1 = new EngineVersion('1.2.1.1');
  /**
   * Neptune engine version 1.2.1.2
   */
  public static readonly V1_2_1_2 = new EngineVersion('1.2.1.2');
  /**
   * Neptune engine version 1.3.0.0
   */
  public static readonly V1_3_0_0 = new EngineVersion('1.3.0.0');
  /**
   * Neptune engine version 1.3.1.0
   */
  public static readonly V1_3_1_0 = new EngineVersion('1.3.1.0');
  /**
   * Neptune engine version 1.3.2.0
   */
  public static readonly V1_3_2_0 = new EngineVersion('1.3.2.0');
  /**
   * Neptune engine version 1.3.2.1
   */
  public static readonly V1_3_2_1 = new EngineVersion('1.3.2.1');
  /**
   * Neptune engine version 1.3.3.0
   */
  public static readonly V1_3_3_0 = new EngineVersion('1.3.3.0');
  /**
   * Neptune engine version 1.3.4.0
   */
  public static readonly V1_3_4_0 = new EngineVersion('1.3.4.0');
  /**
   * Neptune engine version 1.4.0.0
   */
  public static readonly V1_4_0_0 = new EngineVersion('1.4.0.0');
  /**
   * Neptune engine version 1.4.1.0
   */
  public static readonly V1_4_1_0 = new EngineVersion('1.4.1.0');
  /**
   * Neptune engine version 1.4.2.0
   */
  public static readonly V1_4_2_0 = new EngineVersion('1.4.2.0');
  /**
   * Neptune engine version 1.4.3.0
   */
  public static readonly V1_4_3_0 = new EngineVersion('1.4.3.0');
  /**
   * Neptune engine version 1.4.4.0
   */
  public static readonly V1_4_4_0 = new EngineVersion('1.4.4.0');
  /**
   * Neptune engine version 1.4.5.0
   */
  public static readonly V1_4_5_0 = new EngineVersion('1.4.5.0');

  /**
   * Constructor for specifying a custom engine version
   * @param version the engine version of Neptune
   */
  public constructor(public readonly version: string) { }
}

/**
 * Neptune log types that can be exported to CloudWatch logs
 *
 * @see https://docs.aws.amazon.com/neptune/latest/userguide/cloudwatch-logs.html
 */
export class LogType {
  /**
   * Audit logs
   *
   * @see https://docs.aws.amazon.com/neptune/latest/userguide/auditing.html
   */
  public static readonly AUDIT = new LogType('audit');

  /**
   * Constructor for specifying a custom log type
   * @param value the log type
   */
  public constructor(public readonly value: string) { }
}

export interface ServerlessScalingConfiguration {
  /**
   * Minimum NCU capacity (min value 1)
   */
  readonly minCapacity: number;

  /**
   * Maximum NCU capacity (min value 2.5 - max value 128)
   */
  readonly maxCapacity: number;
}

/**
 * Properties for a new database cluster
 */
export interface DatabaseClusterProps {
  /**
   * What version of the database to start
   *
   * @default - The default engine version.
   */
  readonly engineVersion?: EngineVersion;

  /**
   * How many days to retain the backup
   *
   * @default - cdk.Duration.days(1)
   */
  readonly backupRetention?: Duration;

  /**
   * A daily time range in 24-hours UTC format in which backups preferably execute.
   *
   * Must be at least 30 minutes long.
   *
   * Example: '01:00-02:00'
   *
   * @default - a 30-minute window selected at random from an 8-hour block of
   * time for each AWS Region. To see the time blocks available, see
   */
  readonly preferredBackupWindow?: string;

  /**
   * The KMS key for storage encryption.
   *
   * @default - default master key.
   */
  readonly kmsKey?: kms.IKey;

  /**
   * Whether to enable storage encryption
   *
   * @default true
   */
  readonly storageEncrypted?: boolean;

  /**
   * Number of Neptune compute instances
   *
   * @default 1
   */
  readonly instances?: number;

  /**
   * An optional identifier for the cluster
   *
   * @default - A name is automatically generated.
   */
  readonly dbClusterName?: string;

  /**
   * Map AWS Identity and Access Management (IAM) accounts to database accounts
   *
   * @default - `false`
   */
  readonly iamAuthentication?: boolean;

  /**
   * Base identifier for instances
   *
   * Every replica is named by appending the replica number to this string, 1-based.
   *
   * @default - `dbClusterName` is used with the word "Instance" appended. If `dbClusterName` is not provided, the
   * identifier is automatically generated.
   */
  readonly instanceIdentifierBase?: string;

  /**
   * What type of instance to start for the replicas
   */
  readonly instanceType: InstanceType;

  /**
   * A list of AWS Identity and Access Management (IAM) role that can be used by the cluster to access other AWS services.
   *
   * @default - No role is attached to the cluster.
   */
  readonly associatedRoles?: iam.IRole[];

  /**
   * Indicates whether the DB cluster should have deletion protection enabled.
   *
   * @default - true if ``removalPolicy`` is RETAIN, false otherwise
   */
  readonly deletionProtection?: boolean;

  /**
   * A weekly time range in which maintenance should preferably execute.
   *
   * Must be at least 30 minutes long.
   *
   * Example: 'tue:04:17-tue:04:47'
   *
   * @default - 30-minute window selected at random from an 8-hour block of time for
   * each AWS Region, occurring on a random day of the week.
   */
  readonly preferredMaintenanceWindow?: string;

  /**
   * Additional parameters to pass to the database engine
   *
   * @default - No parameter group.
   */
  readonly clusterParameterGroup?: IClusterParameterGroup;

  /**
   * The DB parameter group to associate with the instance.
   *
   * @default no parameter group
   */
  readonly parameterGroup?: IParameterGroup;

  /**
   * Existing subnet group for the cluster.
   *
   * @default - a new subnet group will be created.
   */
  readonly subnetGroup?: ISubnetGroup;

  /**
   * What subnets to run the Neptune instances in.
   *
   * Must be at least 2 subnets in two different AZs.
   */
  readonly vpc: ec2.IVpc;

  /**
   * Where to place the instances within the VPC
   *
   * @default private subnets
   */
  readonly vpcSubnets?: ec2.SubnetSelection;

  /**
   * Security group.
   *
   * @default a new security group is created.
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * The removal policy to apply when the cluster and its instances are removed
   * or replaced during a stack update, or when the stack is deleted. This
   * removal policy also applies to the implicit security group created for the
   * cluster if one is not supplied as a parameter.
   *
   * @default - Retain cluster.
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * If set to true, Neptune will automatically update the engine of the entire
   * cluster to the latest minor version after a stabilization window of 2 to 3 weeks.
   *
   * @default - false
   */
  readonly autoMinorVersionUpgrade?: boolean;

  /**
   * The list of log types that need to be enabled for exporting to
   * CloudWatch Logs.
   *
   * @see https://docs.aws.amazon.com/neptune/latest/userguide/cloudwatch-logs.html
   * @see https://docs.aws.amazon.com/neptune/latest/userguide/auditing.html#auditing-enable
   *
   * @default - no log exports
   */
  readonly cloudwatchLogsExports?: LogType[];

  /**
   * The number of days log events are kept in CloudWatch Logs. When updating
   * this property, unsetting it doesn't remove the log retention policy. To
   * remove the retention policy, set the value to `Infinity`.
   *
   * @default - logs never expire
   */
  readonly cloudwatchLogsRetention?: logs.RetentionDays;

  /**
   * The IAM role for the Lambda function associated with the custom resource
   * that sets the retention policy.
   *
   * @default - a new role is created.
   */
  readonly cloudwatchLogsRetentionRole?: iam.IRole;

  /**
   * Specify minimum and maximum NCUs capacity for a serverless cluster.
   * See https://docs.aws.amazon.com/neptune/latest/userguide/neptune-serverless-capacity-scaling.html
   *
   * @default - required if instanceType is db.serverless
   */
  readonly serverlessScalingConfiguration?: ServerlessScalingConfiguration;

  /**
   * Whether to copy tags to the snapshot when a snapshot is created.
   *
   * @default - false
   */
  readonly copyTagsToSnapshot?: boolean;

  /**
   * The port number on which the DB instances in the DB cluster accept connections.
   *
   * @default 8182
   */
  readonly port?: number;
}

/**
 * Create a clustered database with a given number of instances.
 */
export interface IDatabaseCluster extends IResource, ec2.IConnectable {
  /**
   * Identifier of the cluster
   */
  readonly clusterIdentifier: string;

  /**
   * Resource identifier of the cluster
   * @attribute ClusterResourceId
   */
  readonly clusterResourceIdentifier: string;

  /**
   * The endpoint to use for read/write operations
   * @attribute Endpoint,Port
   */
  readonly clusterEndpoint: Endpoint;

  /**
   * Endpoint to use for load-balanced read-only operations.
   * @attribute ReadEndpoint
   */
  readonly clusterReadEndpoint: Endpoint;

  /**
   * Grant the given identity the specified actions
   * @param grantee the identity to be granted the actions
   * @param actions the data-access actions
   *
   * @see https://docs.aws.amazon.com/neptune/latest/userguide/iam-dp-actions.html
   */
  grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant;

  /**
   * Grant the given identity connection access to the database.
   */
  grantConnect(grantee: iam.IGrantable): iam.Grant;

  /**
   * Return the given named metric associated with this DatabaseCluster instance
   *
   * @see https://docs.aws.amazon.com/neptune/latest/userguide/cw-metrics.html
   * @see https://docs.aws.amazon.com/neptune/latest/userguide/cw-dimensions.html
   */
  metric(metricName: string, props?: cloudwatch.MetricOptions): cloudwatch.Metric;
}

/**
 * Properties that describe an existing cluster instance
 */
export interface DatabaseClusterAttributes {
  /**
   * The database port
   */
  readonly port: number;

  /**
   * The security group of the database cluster
   */
  readonly securityGroup: ec2.ISecurityGroup;

  /**
   * Identifier for the cluster
   */
  readonly clusterIdentifier: string;

  /**
   * Resource Identifier for the cluster
   */
  readonly clusterResourceIdentifier: string;

  /**
   * Cluster endpoint address
   */
  readonly clusterEndpointAddress: string;

  /**
   * Reader endpoint address
   */
  readonly readerEndpointAddress: string;
}

/**
 * A new or imported database cluster.
 */
export abstract class DatabaseClusterBase extends Resource implements IDatabaseCluster {
  /**
   * Import an existing DatabaseCluster from properties
   */
  public static fromDatabaseClusterAttributes(scope: Construct, id: string, attrs: DatabaseClusterAttributes): IDatabaseCluster {
    class Import extends DatabaseClusterBase implements IDatabaseCluster {
      public readonly defaultPort = ec2.Port.tcp(attrs.port);
      public readonly connections = new ec2.Connections({
        securityGroups: [attrs.securityGroup],
        defaultPort: this.defaultPort,
      });
      public readonly clusterIdentifier = attrs.clusterIdentifier;
      public readonly clusterResourceIdentifier = attrs.clusterResourceIdentifier;
      public readonly clusterEndpoint = new Endpoint(attrs.clusterEndpointAddress, attrs.port);
      public readonly clusterReadEndpoint = new Endpoint(attrs.readerEndpointAddress, attrs.port);
      protected enableIamAuthentication = true;
    }

    return new Import(scope, id);
  }

  /**
   * Identifier of the cluster
   */
  public abstract readonly clusterIdentifier: string;

  /**
   * Resource identifier of the cluster
   */
  public abstract readonly clusterResourceIdentifier: string;

  /**
   * The endpoint to use for read/write operations
   */
  public abstract readonly clusterEndpoint: Endpoint;

  /**
   * Endpoint to use for load-balanced read-only operations.
   */
  public abstract readonly clusterReadEndpoint: Endpoint;

  /**
   * The connections object to implement IConnectable
   */
  public abstract readonly connections: ec2.Connections;

  protected abstract enableIamAuthentication?: boolean;

  public grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant {
    if (this.enableIamAuthentication === false) {
      throw new Error('Cannot grant permissions when IAM authentication is disabled');
    }

    this.enableIamAuthentication = true;
    return iam.Grant.addToPrincipal({
      grantee,
      actions,
      resourceArns: [
        [
          'arn',
          Aws.PARTITION,
          'neptune-db',
          Aws.REGION,
          Aws.ACCOUNT_ID,
          `${this.clusterResourceIdentifier}/*`,
        ].join(':'),
      ],
    });
  }

  public grantConnect(grantee: iam.IGrantable): iam.Grant {
    return this.grant(grantee, 'neptune-db:*');
  }

  public metric(metricName: string, props?: cloudwatch.MetricOptions): cloudwatch.Metric {
    return new cloudwatch.Metric({
      namespace: 'AWS/Neptune',
      dimensionsMap: {
        DBClusterIdentifier: this.clusterIdentifier,
      },
      metricName,
      ...props,
    });
  }
}

/**
 * Create a clustered database with a given number of instances.
 *
 * @resource AWS::Neptune::DBCluster
 */
@propertyInjectable
export class DatabaseCluster extends DatabaseClusterBase implements IDatabaseCluster {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-neptune-alpha.DatabaseCluster';
  /**
   * The default number of instances in the Neptune cluster if none are
   * specified
   */
  public static readonly DEFAULT_NUM_INSTANCES = 1;

  public readonly clusterIdentifier: string;
  public readonly clusterEndpoint: Endpoint;
  public readonly clusterReadEndpoint: Endpoint;
  public readonly connections: ec2.Connections;

  /**
   * The resource id for the cluster; for example: cluster-ABCD1234EFGH5678IJKL90MNOP. The cluster ID uniquely
   * identifies the cluster and is used in things like IAM authentication policies.
   * @attribute ClusterResourceId
   */
  public readonly clusterResourceIdentifier: string;

  /**
   * The VPC where the DB subnet group is created.
   */
  public readonly vpc: ec2.IVpc;

  /**
   * The subnets used by the DB subnet group.
   */
  public readonly vpcSubnets: ec2.SubnetSelection;

  /**
   * Subnet group used by the DB
   */
  public readonly subnetGroup: ISubnetGroup;

  /**
   * Identifiers of the instance
   */
  public readonly instanceIdentifiers: string[] = [];

  /**
   * Endpoints which address each individual instance.
   */
  public readonly instanceEndpoints: Endpoint[] = [];

  protected enableIamAuthentication?: boolean;

  constructor(scope: Construct, id: string, props: DatabaseClusterProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.vpc = props.vpc;
    this.vpcSubnets = props.vpcSubnets ?? { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };

    // Determine the subnet(s) to deploy the Neptune cluster to
    const { subnetIds, internetConnectivityEstablished } = this.vpc.selectSubnets(this.vpcSubnets);

    // Cannot test whether the subnets are in different AZs, but at least we can test the amount.
    if (subnetIds.length < 2) {
      throw new Error(`Cluster requires at least 2 subnets, got ${subnetIds.length}`);
    }

    this.subnetGroup = props.subnetGroup ?? new SubnetGroup(this, 'Subnets', {
      description: `Subnets for ${id} database`,
      vpc: this.vpc,
      vpcSubnets: this.vpcSubnets,
      removalPolicy: props.removalPolicy === RemovalPolicy.RETAIN ? props.removalPolicy : undefined,
    });

    const securityGroups = props.securityGroups ?? [
      new ec2.SecurityGroup(this, 'SecurityGroup', {
        description: 'Neptune security group',
        vpc: this.vpc,
      }),
    ];

    // Default to encrypted storage
    const storageEncrypted = props.storageEncrypted ?? true;

    if (props.kmsKey && !storageEncrypted) {
      throw new Error('KMS key supplied but storageEncrypted is false');
    }

    const deletionProtection = props.deletionProtection ?? (props.removalPolicy === RemovalPolicy.RETAIN ? true : undefined);

    this.enableIamAuthentication = props.iamAuthentication;

    if (props.instanceType === InstanceType.SERVERLESS && !props.serverlessScalingConfiguration) {
      throw new Error('You need to specify a serverless scaling configuration with a db.serverless instance type.');
    }

    this.validateServerlessScalingConfiguration(props.serverlessScalingConfiguration);

    // Create the Neptune cluster
    const cluster = new CfnDBCluster(this, 'Resource', {
      // Basic
      engineVersion: props.engineVersion?.version,
      dbClusterIdentifier: props.dbClusterName,
      dbSubnetGroupName: this.subnetGroup.subnetGroupName,
      vpcSecurityGroupIds: securityGroups.map(sg => sg.securityGroupId),
      dbClusterParameterGroupName: props.clusterParameterGroup?.clusterParameterGroupName,
      deletionProtection: deletionProtection,
      associatedRoles: props.associatedRoles ? props.associatedRoles.map(role => ({ roleArn: role.roleArn })) : undefined,
      iamAuthEnabled: Lazy.any({ produce: () => this.enableIamAuthentication }),
      dbPort: props.port,
      // Backup
      backupRetentionPeriod: props.backupRetention?.toDays(),
      preferredBackupWindow: props.preferredBackupWindow,
      preferredMaintenanceWindow: props.preferredMaintenanceWindow,
      // Encryption
      kmsKeyId: props.kmsKey?.keyArn,
      // CloudWatch Logs exports
      enableCloudwatchLogsExports: props.cloudwatchLogsExports?.map(logType => logType.value),
      storageEncrypted,
      serverlessScalingConfiguration: props.serverlessScalingConfiguration,
      // Tags
      copyTagsToSnapshot: props.copyTagsToSnapshot,
    });

    cluster.applyRemovalPolicy(props.removalPolicy, {
      applyToUpdateReplacePolicy: true,
    });

    this.clusterIdentifier = cluster.ref;
    this.clusterResourceIdentifier = cluster.attrClusterResourceId;

    const port = Token.asNumber(cluster.attrPort);
    this.clusterEndpoint = new Endpoint(cluster.attrEndpoint, port);
    this.clusterReadEndpoint = new Endpoint(cluster.attrReadEndpoint, port);

    // Log retention
    const retention = props.cloudwatchLogsRetention;
    if (retention) {
      props.cloudwatchLogsExports?.forEach(logType => {
        new logs.LogRetention(this, `${logType.value}LogRetention`, {
          logGroupName: `/aws/neptune/${this.clusterIdentifier}/${logType.value}`,
          role: props.cloudwatchLogsRetentionRole,
          retention,
        });
      });
    }

    // Create the instances
    const instanceCount = props.instances ?? DatabaseCluster.DEFAULT_NUM_INSTANCES;
    if (instanceCount < 1) {
      throw new Error('At least one instance is required');
    }

    for (let i = 0; i < instanceCount; i++) {
      const instanceIndex = i + 1;

      const instanceIdentifier = props.instanceIdentifierBase != null ? `${props.instanceIdentifierBase}${instanceIndex}`
        : props.dbClusterName != null ? `${props.dbClusterName}instance${instanceIndex}` : undefined;

      const instance = new CfnDBInstance(this, `Instance${instanceIndex}`, {
        // Link to cluster
        dbClusterIdentifier: cluster.ref,
        dbInstanceIdentifier: instanceIdentifier,
        // Instance properties
        dbInstanceClass: props.instanceType._instanceType,
        dbParameterGroupName: props.parameterGroup?.parameterGroupName,
        autoMinorVersionUpgrade: props.autoMinorVersionUpgrade === true,
      });

      // We must have a dependency on the NAT gateway provider here to create
      // things in the right order.
      instance.node.addDependency(internetConnectivityEstablished);

      instance.applyRemovalPolicy(props.removalPolicy, {
        applyToUpdateReplacePolicy: true,
      });

      this.instanceIdentifiers.push(instance.ref);
      this.instanceEndpoints.push(new Endpoint(instance.attrEndpoint, port));
    }

    this.connections = new ec2.Connections({
      defaultPort: ec2.Port.tcp(port),
      securityGroups: securityGroups,
    });
  }

  private validateServerlessScalingConfiguration(serverlessScalingConfiguration?: ServerlessScalingConfiguration) {
    if (!serverlessScalingConfiguration) return;
    if (serverlessScalingConfiguration.minCapacity < 1) {
      throw new Error(`ServerlessScalingConfiguration minCapacity must be greater or equal than 1, received ${serverlessScalingConfiguration.minCapacity}`);
    }
    if (serverlessScalingConfiguration.maxCapacity < 2.5 || serverlessScalingConfiguration.maxCapacity > 128) {
      throw new Error(`ServerlessScalingConfiguration maxCapacity must be between 2.5 and 128, received ${serverlessScalingConfiguration.maxCapacity}`);
    }
    if (serverlessScalingConfiguration.minCapacity >= serverlessScalingConfiguration.maxCapacity) {
      throw new Error(`ServerlessScalingConfiguration minCapacity ${serverlessScalingConfiguration.minCapacity} ` +
        `must be less than serverlessScalingConfiguration maxCapacity ${serverlessScalingConfiguration.maxCapacity}`);
    }
  }
}
