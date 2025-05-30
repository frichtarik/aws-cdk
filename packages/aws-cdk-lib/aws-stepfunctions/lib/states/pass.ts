import { Construct } from 'constructs';
import { StateType } from './private/state-type';
import { AssignableStateOptions, JsonataCommonOptions, JsonPathCommonOptions, renderJsonPath, State, StateBaseProps } from './state';
import { Chain } from '../chain';
import { FieldUtils } from '../fields';
import { IChainable, INextable, QueryLanguage } from '../types';

/**
 * The result of a Pass operation
 */
export class Result {
  /**
   * The result of the operation is a string
   */
  public static fromString(value: string): Result {
    return new Result(value);
  }

  /**
   * The result of the operation is a number
   */
  public static fromNumber(value: number): Result {
    return new Result(value);
  }

  /**
   * The result of the operation is a boolean
   */
  public static fromBoolean(value: boolean): Result {
    return new Result(value);
  }

  /**
   * The result of the operation is an object
   */
  public static fromObject(value: {[key: string]: any}): Result {
    return new Result(value);
  }

  /**
   * The result of the operation is an array
   */
  public static fromArray(value: any[]): Result {
    return new Result(value);
  }

  /**
   *
   * @param value result of the Pass operation
   */
  protected constructor(public readonly value: any) {
  }
}

interface PassJsonPathOptions extends JsonPathCommonOptions {
  /**
   * If given, treat as the result of this operation
   *
   * Can be used to inject or replace the current execution state.
   *
   * @default No injected result
   */
  readonly result?: Result;

  /**
   * JSONPath expression to indicate where to inject the state's output
   *
   * May also be the special value JsonPath.DISCARD, which will cause the state's
   * input to become its output.
   *
   * @default $
   */
  readonly resultPath?: string;

  /**
   * Parameters pass a collection of key-value pairs, either static values or JSONPath expressions that select from the input.
   *
   * @see
   * https://docs.aws.amazon.com/step-functions/latest/dg/input-output-inputpath-params.html#input-output-parameters
   *
   * @default No parameters
   */
  readonly parameters?: { [name: string]: any };
}

/**
 * Properties for defining a Pass state that using JSONPath
 */
export interface PassJsonPathProps extends StateBaseProps, AssignableStateOptions, PassJsonPathOptions {}

/**
 * Properties for defining a Pass state that using JSONata
 */
export interface PassJsonataProps extends StateBaseProps, AssignableStateOptions, JsonataCommonOptions {}

/**
 * Properties for defining a Pass state
 */
export interface PassProps extends StateBaseProps, AssignableStateOptions, PassJsonPathOptions, JsonataCommonOptions {}

/**
 * Define a Pass in the state machine
 *
 * A Pass state can be used to transform the current execution's state.
 */
export class Pass extends State implements INextable {
  /**
   * Define a Pass using JSONPath in the state machine
   *
   * A Pass state can be used to transform the current execution's state.
   */
  public static jsonPath(scope: Construct, id: string, props: PassJsonPathProps = {}) {
    return new Pass(scope, id, props);
  }
  /**
   * Define a Pass using JSONata in the state machine
   *
   * A Pass state can be used to transform the current execution's state.
   */
  public static jsonata(scope: Construct, id: string, props: PassJsonataProps = {}) {
    return new Pass(scope, id, {
      ...props,
      queryLanguage: QueryLanguage.JSONATA,
    });
  }
  public readonly endStates: INextable[];

  private readonly result?: Result;

  constructor(scope: Construct, id: string, props: PassProps = {}) {
    super(scope, id, props);

    this.result = props.result;
    this.endStates = [this];
  }

  /**
   * Continue normal execution with the given state
   */
  public next(next: IChainable): Chain {
    super.makeNext(next.startState);
    return Chain.sequence(this, next);
  }

  /**
   * Return the Amazon States Language object for this state
   */
  public toStateJson(topLevelQueryLanguage?: QueryLanguage): object {
    return {
      Type: StateType.PASS,
      ...this.renderQueryLanguage(topLevelQueryLanguage),
      Comment: this.comment,
      Result: this.result?.value,
      ResultPath: renderJsonPath(this.resultPath),
      ...this.renderInputOutput(),
      ...this.renderParameters(),
      ...this.renderNextEnd(),
      ...this.renderAssign(topLevelQueryLanguage),
    };
  }

  /**
   * Render Parameters in ASL JSON format
   */
  private renderParameters(): any {
    return FieldUtils.renderObject({
      Parameters: this.parameters,
    });
  }
}
