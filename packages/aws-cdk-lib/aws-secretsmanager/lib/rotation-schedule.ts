import { Construct } from 'constructs';
import { ISecret, Secret } from './secret';
import { CfnRotationSchedule } from './secretsmanager.generated';
import * as ec2 from '../../aws-ec2';
import { Schedule } from '../../aws-events';
import * as iam from '../../aws-iam';
import * as kms from '../../aws-kms';
import * as lambda from '../../aws-lambda';
import { Duration, Resource, Stack, UnscopedValidationError, ValidationError } from '../../core';
import { addConstructMetadata } from '../../core/lib/metadata-resource';
import { propertyInjectable } from '../../core/lib/prop-injectable';

/**
 * The default set of characters we exclude from generated passwords for database users.
 * It's a combination of characters that have a tendency to cause problems in shell scripts,
 * some engine-specific characters (for example, Oracle doesn't like '@' in its passwords),
 * and some that trip up other services, like DMS.
 */
const DEFAULT_PASSWORD_EXCLUDE_CHARS = " %+~`#$&*()|[]{}:;<>?!'/@\"\\";

/**
 * Options to add a rotation schedule to a secret.
 */
export interface RotationScheduleOptions {
  /**
   * A Lambda function that can rotate the secret.
   *
   * @default - either `rotationLambda` or `hostedRotation` must be specified
   */
  readonly rotationLambda?: lambda.IFunction;

  /**
   * Hosted rotation
   *
   * @default - either `rotationLambda` or `hostedRotation` must be specified
   */
  readonly hostedRotation?: HostedRotation;

  /**
   * Specifies the number of days after the previous rotation before
   * Secrets Manager triggers the next automatic rotation.
   *
   * The minimum value is 4 hours.
   * The maximum value is 1000 days.
   *
   * A value of zero (`Duration.days(0)`) will not create RotationRules.
   *
   * @default Duration.days(30)
   */
  readonly automaticallyAfter?: Duration;

  /**
   * Specifies whether to rotate the secret immediately or wait until the next
   * scheduled rotation window.
   *
   * @default true
   */
  readonly rotateImmediatelyOnUpdate?: boolean;
}

/**
 * Construction properties for a RotationSchedule.
 */
export interface RotationScheduleProps extends RotationScheduleOptions {
  /**
   * The secret to rotate.
   *
   * If hosted rotation is used, this must be a JSON string with the following format:
   *
   * ```
   * {
   *   "engine": <required: database engine>,
   *   "host": <required: instance host name>,
   *   "username": <required: username>,
   *   "password": <required: password>,
   *   "dbname": <optional: database name>,
   *   "port": <optional: if not specified, default port will be used>,
   *   "masterarn": <required for multi user rotation: the arn of the master secret which will be used to create users/change passwords>
   * }
   * ```
   *
   * This is typically the case for a secret referenced from an `AWS::SecretsManager::SecretTargetAttachment`
   * or an `ISecret` returned by the `attach()` method of `Secret`.
   */
  readonly secret: ISecret;
}

/**
 * A rotation schedule.
 */
@propertyInjectable
export class RotationSchedule extends Resource {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-secretsmanager.RotationSchedule';

  constructor(scope: Construct, id: string, props: RotationScheduleProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    if ((!props.rotationLambda && !props.hostedRotation) || (props.rotationLambda && props.hostedRotation)) {
      throw new ValidationError('One of `rotationLambda` or `hostedRotation` must be specified.', this);
    }

    if (props.rotationLambda?.permissionsNode.defaultChild) {
      if (props.secret.encryptionKey) {
        props.secret.encryptionKey.grantEncryptDecrypt(
          new kms.ViaServicePrincipal(
            `secretsmanager.${Stack.of(this).region}.amazonaws.com`,
            props.rotationLambda.grantPrincipal,
          ),
        );
      }

      const grant = props.rotationLambda.grantInvoke(new iam.ServicePrincipal('secretsmanager.amazonaws.com'));
      grant.applyBefore(this);

      props.rotationLambda.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'secretsmanager:DescribeSecret',
            'secretsmanager:GetSecretValue',
            'secretsmanager:PutSecretValue',
            'secretsmanager:UpdateSecretVersionStage',
          ],
          resources: [props.secret.secretFullArn ? props.secret.secretFullArn : `${props.secret.secretArn}-??????`],
        }),
      );
      props.rotationLambda.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'secretsmanager:GetRandomPassword',
          ],
          resources: ['*'],
        }),
      );
    }

    let scheduleExpression: string | undefined;
    if (props.automaticallyAfter) {
      const automaticallyAfterMillis = props.automaticallyAfter.toMilliseconds();
      if (automaticallyAfterMillis > 0) {
        if (automaticallyAfterMillis < Duration.hours(4).toMilliseconds()) {
          throw new ValidationError(`automaticallyAfter must not be smaller than 4 hours, got ${props.automaticallyAfter.toHours()} hours`, this);
        }
        if (automaticallyAfterMillis > Duration.days(1000).toMilliseconds()) {
          throw new ValidationError(`automaticallyAfter must not be greater than 1000 days, got ${props.automaticallyAfter.toDays()} days`, this);
        }
        scheduleExpression = Schedule.rate(props.automaticallyAfter).expressionString;
      }
    } else {
      scheduleExpression = Schedule.rate(Duration.days(30)).expressionString;
    }

    let rotationRules: CfnRotationSchedule.RotationRulesProperty | undefined;
    if (scheduleExpression) {
      rotationRules = {
        scheduleExpression,
      };
    }

    new CfnRotationSchedule(this, 'Resource', {
      secretId: props.secret.secretArn,
      rotationLambdaArn: props.rotationLambda?.functionArn,
      hostedRotationLambda: props.hostedRotation?.bind(props.secret, this),
      rotationRules,
      rotateImmediatelyOnUpdate: props.rotateImmediatelyOnUpdate,
    });

    // Prevent secrets deletions when rotation is in place
    props.secret.denyAccountRootDelete();
  }
}

/**
 * Single user hosted rotation options
 */
export interface SingleUserHostedRotationOptions {
  /**
   * A name for the Lambda created to rotate the secret
   *
   * @default - a CloudFormation generated name
   */
  readonly functionName?: string;

  /**
   * A list of security groups for the Lambda created to rotate the secret
   *
   * @default - a new security group is created
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * The VPC where the Lambda rotation function will run.
   *
   * @default - the Lambda is not deployed in a VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * The type of subnets in the VPC where the Lambda rotation function will run.
   *
   * @default - the Vpc default strategy if not specified.
   */
  readonly vpcSubnets?: ec2.SubnetSelection;

  /**
   * A string of the characters that you don't want in the password
   *
   * @default the same exclude characters as the ones used for the
   * secret or " %+~`#$&*()|[]{}:;<>?!'/@\"\\"
   */
  readonly excludeCharacters?: string;
}

/**
 * Multi user hosted rotation options
 */
export interface MultiUserHostedRotationOptions extends SingleUserHostedRotationOptions {
  /**
   * The master secret for a multi user rotation scheme
   */
  readonly masterSecret: ISecret;
}

/**
 * A hosted rotation
 */
export class HostedRotation implements ec2.IConnectable {
  /** MySQL Single User */
  public static mysqlSingleUser(options: SingleUserHostedRotationOptions = {}) {
    return new HostedRotation(HostedRotationType.MYSQL_SINGLE_USER, options);
  }

  /** MySQL Multi User */
  public static mysqlMultiUser(options: MultiUserHostedRotationOptions) {
    return new HostedRotation(HostedRotationType.MYSQL_MULTI_USER, options, options.masterSecret);
  }

  /** PostgreSQL Single User */
  public static postgreSqlSingleUser(options: SingleUserHostedRotationOptions = {}) {
    return new HostedRotation(HostedRotationType.POSTGRESQL_SINGLE_USER, options);
  }

  /** PostgreSQL Multi User */
  public static postgreSqlMultiUser(options: MultiUserHostedRotationOptions) {
    return new HostedRotation(HostedRotationType.POSTGRESQL_MULTI_USER, options, options.masterSecret);
  }

  /** Oracle Single User */
  public static oracleSingleUser(options: SingleUserHostedRotationOptions = {}) {
    return new HostedRotation(HostedRotationType.ORACLE_SINGLE_USER, options);
  }

  /** Oracle Multi User */
  public static oracleMultiUser(options: MultiUserHostedRotationOptions) {
    return new HostedRotation(HostedRotationType.ORACLE_MULTI_USER, options, options.masterSecret);
  }

  /** MariaDB Single User */
  public static mariaDbSingleUser(options: SingleUserHostedRotationOptions = {}) {
    return new HostedRotation(HostedRotationType.MARIADB_SINGLE_USER, options);
  }

  /** MariaDB Multi User */
  public static mariaDbMultiUser(options: MultiUserHostedRotationOptions) {
    return new HostedRotation(HostedRotationType.MARIADB_MULTI_USER, options, options.masterSecret);
  }

  /** SQL Server Single User */
  public static sqlServerSingleUser(options: SingleUserHostedRotationOptions = {}) {
    return new HostedRotation(HostedRotationType.SQLSERVER_SINGLE_USER, options);
  }

  /** SQL Server Multi User */
  public static sqlServerMultiUser(options: MultiUserHostedRotationOptions) {
    return new HostedRotation(HostedRotationType.SQLSERVER_MULTI_USER, options, options.masterSecret);
  }

  /** Redshift Single User */
  public static redshiftSingleUser(options: SingleUserHostedRotationOptions = {}) {
    return new HostedRotation(HostedRotationType.REDSHIFT_SINGLE_USER, options);
  }

  /** Redshift Multi User */
  public static redshiftMultiUser(options: MultiUserHostedRotationOptions) {
    return new HostedRotation(HostedRotationType.REDSHIFT_MULTI_USER, options, options.masterSecret);
  }

  /** MongoDB Single User */
  public static mongoDbSingleUser(options: SingleUserHostedRotationOptions = {}) {
    return new HostedRotation(HostedRotationType.MONGODB_SINGLE_USER, options);
  }

  /** MongoDB Multi User */
  public static mongoDbMultiUser(options: MultiUserHostedRotationOptions) {
    return new HostedRotation(HostedRotationType.MONGODB_MULTI_USER, options, options.masterSecret);
  }

  private _connections?: ec2.Connections;

  private constructor(
    private readonly type: HostedRotationType,
    private readonly props: SingleUserHostedRotationOptions | MultiUserHostedRotationOptions,
    private readonly masterSecret?: ISecret,
  ) {
    if (type.isMultiUser && !masterSecret) {
      throw new UnscopedValidationError('The `masterSecret` must be specified when using the multi user scheme.');
    }
  }

  /**
   * Binds this hosted rotation to a secret
   */
  public bind(secret: ISecret, scope: Construct): CfnRotationSchedule.HostedRotationLambdaProperty {
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-secretsmanager-rotationschedule-hostedrotationlambda.html
    Stack.of(scope).addTransform('AWS::SecretsManager-2020-07-23');

    if (!this.props.vpc && this.props.securityGroups) {
      throw new ValidationError('`vpc` must be specified when specifying `securityGroups`.', secret);
    }

    if (this.props.vpc) {
      this._connections = new ec2.Connections({
        securityGroups: this.props.securityGroups || [new ec2.SecurityGroup(scope, 'SecurityGroup', {
          vpc: this.props.vpc,
        })],
      });
    }

    // Prevent master secret deletion when rotation is in place
    if (this.masterSecret) {
      this.masterSecret.denyAccountRootDelete();
    }

    let masterSecretArn: string | undefined;
    if (this.masterSecret?.secretFullArn) {
      masterSecretArn = this.masterSecret.secretArn;
    } else if (this.masterSecret) { // ISecret as an imported secret with partial ARN
      masterSecretArn = this.masterSecret.secretArn + '-??????';
    }

    const defaultExcludeCharacters = Secret.isSecret(secret)
      ? secret.excludeCharacters ?? DEFAULT_PASSWORD_EXCLUDE_CHARS
      : DEFAULT_PASSWORD_EXCLUDE_CHARS;

    return {
      rotationType: this.type.name,
      kmsKeyArn: secret.encryptionKey?.keyArn,
      masterSecretArn: masterSecretArn,
      masterSecretKmsKeyArn: this.masterSecret?.encryptionKey?.keyArn,
      rotationLambdaName: this.props.functionName,
      vpcSecurityGroupIds: this._connections?.securityGroups?.map(s => s.securityGroupId).join(','),
      vpcSubnetIds: this.props.vpc?.selectSubnets(this.props.vpcSubnets).subnetIds.join(','),
      excludeCharacters: this.props.excludeCharacters ?? defaultExcludeCharacters,
    };
  }

  /**
   * Security group connections for this hosted rotation
   */
  public get connections() {
    if (!this.props.vpc) {
      throw new UnscopedValidationError('Cannot use connections for a hosted rotation that is not deployed in a VPC');
    }

    // If we are in a vpc and bind() has been called _connections should be defined
    if (!this._connections) {
      throw new UnscopedValidationError('Cannot use connections for a hosted rotation that has not been bound to a secret');
    }

    return this._connections;
  }
}

/**
 * Hosted rotation type
 */
export class HostedRotationType {
  /** MySQL Single User */
  public static readonly MYSQL_SINGLE_USER = new HostedRotationType('MySQLSingleUser');

  /** MySQL Multi User */
  public static readonly MYSQL_MULTI_USER = new HostedRotationType('MySQLMultiUser', true);

  /** PostgreSQL Single User */
  public static readonly POSTGRESQL_SINGLE_USER = new HostedRotationType('PostgreSQLSingleUser');

  /** PostgreSQL Multi User */
  public static readonly POSTGRESQL_MULTI_USER = new HostedRotationType('PostgreSQLMultiUser', true);

  /** Oracle Single User */
  public static readonly ORACLE_SINGLE_USER = new HostedRotationType('OracleSingleUser');

  /** Oracle Multi User */
  public static readonly ORACLE_MULTI_USER = new HostedRotationType('OracleMultiUser', true);

  /** MariaDB Single User */
  public static readonly MARIADB_SINGLE_USER = new HostedRotationType('MariaDBSingleUser');

  /** MariaDB Multi User */
  public static readonly MARIADB_MULTI_USER = new HostedRotationType('MariaDBMultiUser', true);

  /** SQL Server Single User */
  public static readonly SQLSERVER_SINGLE_USER = new HostedRotationType('SQLServerSingleUser');

  /** SQL Server Multi User */
  public static readonly SQLSERVER_MULTI_USER = new HostedRotationType('SQLServerMultiUser', true);

  /** Redshift Single User */
  public static readonly REDSHIFT_SINGLE_USER = new HostedRotationType('RedshiftSingleUser');

  /** Redshift Multi User */
  public static readonly REDSHIFT_MULTI_USER = new HostedRotationType('RedshiftMultiUser', true);

  /** MongoDB Single User */
  public static readonly MONGODB_SINGLE_USER = new HostedRotationType('MongoDBSingleUser');

  /** MongoDB Multi User */
  public static readonly MONGODB_MULTI_USER = new HostedRotationType('MongoDBMultiUser', true);

  /**
   * @param name The type of rotation
   * @param isMultiUser Whether the rotation uses the mutli user scheme
   */
  private constructor(public readonly name: string, public readonly isMultiUser?: boolean) {}
}
