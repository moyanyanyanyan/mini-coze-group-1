import './FolderCard.css';

/** 将 Cobp 的 Tailwind 原作逐项转为局部 CSS，不依赖 Tailwind 运行时。 */
export function FolderCard({ label, onClick, disabled = false }: { label: string; onClick?: () => void; disabled?: boolean }) {
  const Container = onClick ? 'button' : 'div';
  return <Container className="uv-folder" {...(onClick ? { type: 'button' as const, onClick, disabled } : {})}>
    <span className="uv-folder-file" aria-hidden="true">
      <span className="uv-folder-back" />
      <span className="uv-folder-sheet uv-folder-sheet4" />
      <span className="uv-folder-sheet uv-folder-sheet3" />
      <span className="uv-folder-sheet uv-folder-sheet2" />
      <span className="uv-folder-front" />
    </span>
    <span className="uv-folder-caption">{label}</span>
  </Container>;
}
