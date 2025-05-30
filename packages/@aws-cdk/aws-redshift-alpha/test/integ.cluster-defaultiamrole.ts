#!/usr/bin/env node
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Stack, App, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import * as integ from '@aws-cdk/integ-tests-alpha';
import { Construct } from 'constructs';
import * as redshift from '../lib';

class RedshiftEnv extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'VPC', { restrictDefaultSecurityGroup: false });
    const defaultRole = new iam.Role(this, 'IAM', {
      assumedBy: new iam.ServicePrincipal('redshift.amazonaws.com'),
    });

    // Adding default role on cluster creation
    new redshift.Cluster(this, 'Cluster1', {
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      masterUser: {
        masterUsername: 'admin',
      },
      roles: [defaultRole],
      defaultRole: defaultRole,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Adding default role after cluster creation
    const redshiftCluster = new redshift.Cluster(this, 'Cluster2', {
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      masterUser: {
        masterUsername: 'admin',
      },
      roles: [defaultRole],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    redshiftCluster.addDefaultIamRole(defaultRole);
  }
}

const app = new App({
  postCliContext: {
    '@aws-cdk/aws-lambda:useCdkManagedLogGroup': false,
  },
});

new integ.IntegTest(app, 'DefaultIamRoleInteg', {
  testCases: [new RedshiftEnv(app, 'redshift-defaultiamrole-integ')],
});

app.synth();
