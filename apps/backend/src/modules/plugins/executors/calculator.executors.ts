import type { PluginToolDefinition } from '../types/plugin-tool';
import {
  ToolExecutionError,
  type ToolExecutor,
} from './tool-executor.interface';

const PLUGIN_ID = 'plugin_calculator';

function numberParameter(description: string) {
  return { type: 'number', description };
}

function binaryDefinition(
  name: string,
  description: string,
  leftName: string,
  leftDescription: string,
  rightName: string,
  rightDescription: string,
): PluginToolDefinition {
  return {
    pluginId: PLUGIN_ID,
    name,
    description,
    parameters: {
      type: 'object',
      properties: {
        [leftName]: numberParameter(leftDescription),
        [rightName]: numberParameter(rightDescription),
      },
      required: [leftName, rightName],
      additionalProperties: false,
    },
  };
}

function finiteNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ToolExecutionError(`${key} 必须是有限数字`);
  }
  return value;
}

function result(
  operation: string,
  inputs: Record<string, number>,
  value: number,
): Record<string, unknown> {
  if (!Number.isFinite(value)) {
    throw new ToolExecutionError('计算结果超出有限数字范围');
  }
  return { operation, inputs, result: value };
}

abstract class BinaryCalculatorExecutor implements ToolExecutor {
  abstract readonly definition: PluginToolDefinition;

  constructor(
    private readonly operation: string,
    private readonly leftName: string,
    private readonly rightName: string,
    private readonly calculate: (left: number, right: number) => number,
  ) {}

  async execute(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const left = finiteNumber(args, this.leftName);
    const right = finiteNumber(args, this.rightName);
    return result(
      this.operation,
      { [this.leftName]: left, [this.rightName]: right },
      this.calculate(left, right),
    );
  }
}

export class AddNumbersExecutor extends BinaryCalculatorExecutor {
  readonly definition = binaryDefinition(
    'add_numbers',
    '计算两个数字的和。用于金额合计或普通加法。',
    'a',
    '第一个加数',
    'b',
    '第二个加数',
  );

  constructor() {
    super('add', 'a', 'b', (a, b) => a + b);
  }
}

export class SubtractNumbersExecutor extends BinaryCalculatorExecutor {
  readonly definition = binaryDefinition(
    'subtract_numbers',
    '计算 a 减去 b 的结果。',
    'a',
    '被减数',
    'b',
    '减数',
  );

  constructor() {
    super('subtract', 'a', 'b', (a, b) => a - b);
  }
}

export class MultiplyNumbersExecutor extends BinaryCalculatorExecutor {
  readonly definition = binaryDefinition(
    'multiply_numbers',
    '计算两个数字的乘积。',
    'a',
    '第一个乘数',
    'b',
    '第二个乘数',
  );

  constructor() {
    super('multiply', 'a', 'b', (a, b) => a * b);
  }
}

export class DivideNumbersExecutor extends BinaryCalculatorExecutor {
  readonly definition = binaryDefinition(
    'divide_numbers',
    '计算 dividend 除以 divisor 的结果；除数不能为零。',
    'dividend',
    '被除数',
    'divisor',
    '除数',
  );

  constructor() {
    super('divide', 'dividend', 'divisor', (dividend, divisor) => {
      if (divisor === 0) {
        throw new ToolExecutionError('除数不能为零');
      }
      return dividend / divisor;
    });
  }
}

export class CalculatePercentageExecutor extends BinaryCalculatorExecutor {
  readonly definition = binaryDefinition(
    'calculate_percentage',
    '计算 value 的 percentage%，适合折扣、比例和百分比金额计算。例如 128 的 85% 为 108.8。',
    'value',
    '原始数值',
    'percentage',
    '百分比数值，例如 85 表示 85%',
  );

  constructor() {
    super(
      'percentage',
      'value',
      'percentage',
      (value, percentage) => (value * percentage) / 100,
    );
  }
}

export class RoundNumberExecutor implements ToolExecutor {
  readonly definition: PluginToolDefinition = {
    pluginId: PLUGIN_ID,
    name: 'round_number',
    description: '将数字四舍五入到 0 至 10 位小数。',
    parameters: {
      type: 'object',
      properties: {
        value: numberParameter('需要取整的数字'),
        digits: numberParameter('保留的小数位，必须是 0 至 10 的整数'),
      },
      required: ['value', 'digits'],
      additionalProperties: false,
    },
  };

  async execute(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const value = finiteNumber(args, 'value');
    const digits = finiteNumber(args, 'digits');
    if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
      throw new ToolExecutionError('digits 必须是 0 至 10 的整数');
    }
    // 从十进制字符串构造整数，避免二进制小数缩放导致 1.005 取整错误。
    const [mantissa, exponent = '0'] = Math.abs(value).toString().split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    const coefficient = BigInt(whole + fraction);
    const shift = Number(exponent) - fraction.length + digits;
    let rounded: bigint;
    if (shift >= 0) {
      rounded = coefficient * 10n ** BigInt(shift);
    } else {
      const divisor = 10n ** BigInt(-shift);
      rounded = coefficient / divisor;
      if ((coefficient % divisor) * 2n >= divisor) {
        rounded += 1n;
      }
    }
    const decimal = rounded.toString().padStart(digits + 1, '0');
    const numeric =
      digits === 0
        ? decimal
        : decimal.slice(0, -digits) + '.' + decimal.slice(-digits);
    return result(
      'round',
      { value, digits },
      Number(numeric) * (value < 0 ? -1 : 1),
    );
  }
}

export function createCalculatorExecutors(): ToolExecutor[] {
  return [
    new AddNumbersExecutor(),
    new SubtractNumbersExecutor(),
    new MultiplyNumbersExecutor(),
    new DivideNumbersExecutor(),
    new CalculatePercentageExecutor(),
    new RoundNumberExecutor(),
  ];
}
