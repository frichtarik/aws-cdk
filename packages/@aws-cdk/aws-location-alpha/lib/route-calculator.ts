import * as iam from 'aws-cdk-lib/aws-iam';
import { ArnFormat, IResource, Lazy, Resource, Stack, Token, UnscopedValidationError, ValidationError } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { CfnRouteCalculator } from 'aws-cdk-lib/aws-location';
import { generateUniqueId, DataSource } from './util';
import { addConstructMetadata, MethodMetadata } from 'aws-cdk-lib/core/lib/metadata-resource';
import { propertyInjectable } from 'aws-cdk-lib/core/lib/prop-injectable';

/**
 * A Route Calculator
 */
export interface IRouteCalculator extends IResource {
  /**
   * The name of the route calculator
   *
   * @attribute
   */
  readonly routeCalculatorName: string;

  /**
   * The Amazon Resource Name (ARN) of the route calculator resource
   *
   * @attribute Arn,CalculatorArn
   */
  readonly routeCalculatorArn: string;
}

/**
 * Properties for a route calculator
 */
export interface RouteCalculatorProps {
  /**
   * A name for the route calculator
   *
   * Must be between 1 and 100 characters and contain only alphanumeric characters,
   * hyphens, periods and underscores.
   *
   * @default - A name is automatically generated
   */
  readonly routeCalculatorName?: string;

  /**
   * Data source for the route calculator
   */
  readonly dataSource: DataSource;

  /**
   * A description for the route calculator
   *
   * @default - no description
   */
  readonly description?: string;
}

/**
 * A Route Calculator
 *
 * @see https://docs.aws.amazon.com/location/latest/developerguide/places-concepts.html
 */
@propertyInjectable
export class RouteCalculator extends Resource implements IRouteCalculator {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-location-alpha.RouteCalculator';

  /**
   * Use an existing route calculator by name
   */
  public static fromRouteCalculatorName(scope: Construct, id: string, routeCalculatorName: string): IRouteCalculator {
    const routeCalculatorArn = Stack.of(scope).formatArn({
      service: 'geo',
      resource: 'route-calculator',
      resourceName: routeCalculatorName,
    });

    return RouteCalculator.fromRouteCalculatorArn(scope, id, routeCalculatorArn);
  }

  /**
   * Use an existing route calculator by ARN
   */
  public static fromRouteCalculatorArn(scope: Construct, id: string, routeCalculatorArn: string): IRouteCalculator {
    const parsedArn = Stack.of(scope).splitArn(routeCalculatorArn, ArnFormat.SLASH_RESOURCE_NAME);

    if (!parsedArn.resourceName) {
      throw new UnscopedValidationError(`Route Calculator Arn ${routeCalculatorArn} does not have a resource name.`);
    }

    class Import extends Resource implements IRouteCalculator {
      public readonly routeCalculatorName = parsedArn.resourceName!;
      public readonly routeCalculatorArn = routeCalculatorArn;
    }

    return new Import(scope, id, {
      account: parsedArn.account,
      region: parsedArn.region,
    });
  }

  public readonly routeCalculatorName: string;

  public readonly routeCalculatorArn: string;

  /**
   * The timestamp for when the route calculator resource was created in ISO 8601 format
   *
   * @attribute
   */
  public readonly routeCalculatorCreateTime: string;

  /**
   * The timestamp for when the route calculator resource was last updated in ISO 8601 format
   *
   * @attribute
   */
  public readonly routeCalculatorUpdateTime: string;

  constructor(scope: Construct, id: string, props: RouteCalculatorProps) {
    super(scope, id, {
      physicalName: props.routeCalculatorName ?? Lazy.string({ produce: () => generateUniqueId(this) }),
    });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    if (props.description && !Token.isUnresolved(props.description) && props.description.length > 1000) {
      throw new ValidationError(`\`description\` must be between 0 and 1000 characters. Received: ${props.description.length} characters`, this);
    }

    if (props.routeCalculatorName !== undefined && !Token.isUnresolved(props.routeCalculatorName)) {
      if (props.routeCalculatorName.length < 1 || props.routeCalculatorName.length > 100) {
        throw new ValidationError(`\`routeCalculatorName\` must be between 1 and 100 characters, got: ${props.routeCalculatorName.length} characters.`, this);
      }

      if (!/^[-._\w]+$/.test(props.routeCalculatorName)) {
        throw new ValidationError(`\`routeCalculatorName\` must contain only alphanumeric characters, hyphens, periods and underscores, got: ${props.routeCalculatorName}.`, this);
      }
    }

    const routeCalculator = new CfnRouteCalculator(this, 'Resource', {
      calculatorName: this.physicalName,
      dataSource: props.dataSource ?? DataSource.ESRI,
      description: props.description,
    });

    this.routeCalculatorName = routeCalculator.ref;
    this.routeCalculatorArn = routeCalculator.attrArn;
    this.routeCalculatorCreateTime = routeCalculator.attrCreateTime;
    this.routeCalculatorUpdateTime = routeCalculator.attrUpdateTime;
  }

  /**
   * Grant the given principal identity permissions to perform the actions on this route calculator.
   */
  @MethodMetadata()
  public grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee: grantee,
      actions: actions,
      resourceArns: [this.routeCalculatorArn],
    });
  }

  /**
   * Grant the given identity permissions to access to a route calculator resource to calculate a route.
   *
   * @see https://docs.aws.amazon.com/location/latest/developerguide/security_iam_id-based-policy-examples.html#security_iam_id-based-policy-examples-calculate-route
   */
  @MethodMetadata()
  public grantRead(grantee: iam.IGrantable): iam.Grant {
    return this.grant(grantee,
      'geo:CalculateRoute',
    );
  }
}
