import './DiceLoader.css';

/** 原作是七秒变色位移动画，业务配色由调用方局部适配。 */
export function DiceLoader({ label = '加载中' }: { label?: string }) {
  return <span className="uv-dice-loader" role="status" aria-label={label} />;
}
