import {
  AddNumbersExecutor,
  CalculatePercentageExecutor,
  DivideNumbersExecutor,
  MultiplyNumbersExecutor,
  RoundNumberExecutor,
  SubtractNumbersExecutor,
} from './calculator.executors';

describe('calculator executors', () => {
  it.each([
    [1.005, 2, 1.01],
    [-1.5, 0, -2],
    [1e308, 10, 1e308],
    [0, 0, 0],
  ])('十进制取整 %s', async (value, digits, expected) => {
    expect(
      (await new RoundNumberExecutor().execute({ value, digits })).result,
    ).toBe(expected);
  });
  it.each([
    [new AddNumbersExecutor(), { a: 1.5, b: -2 }, -0.5, 'add'],
    [new SubtractNumbersExecutor(), { a: 10, b: 3 }, 7, 'subtract'],
    [new MultiplyNumbersExecutor(), { a: -4, b: 2.5 }, -10, 'multiply'],
    [new DivideNumbersExecutor(), { dividend: 9, divisor: 4 }, 2.25, 'divide'],
    [
      new CalculatePercentageExecutor(),
      { value: 128, percentage: 85 },
      108.8,
      'percentage',
    ],
  ])('%s 返回结构化计算结果', async (executor, args, expected, operation) => {
    await expect(executor.execute(args)).resolves.toEqual({
      operation,
      inputs: args,
      result: expected,
    });
  });

  it('拒绝除数为零', async () => {
    await expect(
      new DivideNumbersExecutor().execute({ dividend: 10, divisor: 0 }),
    ).rejects.toThrow('除数不能为零');
  });

  it('按指定小数位四舍五入', async () => {
    await expect(
      new RoundNumberExecutor().execute({ value: 3.14159, digits: 3 }),
    ).resolves.toEqual({
      operation: 'round',
      inputs: { value: 3.14159, digits: 3 },
      result: 3.142,
    });
  });

  it.each([-1, 1.5, 11])('拒绝非法小数位 %s', async (digits) => {
    await expect(
      new RoundNumberExecutor().execute({ value: 1.23, digits }),
    ).rejects.toThrow('digits 必须是 0 至 10 的整数');
  });

  it('拒绝非有限数值', async () => {
    await expect(
      new AddNumbersExecutor().execute({ a: Number.POSITIVE_INFINITY, b: 1 }),
    ).rejects.toThrow('a 必须是有限数字');
  });
});
