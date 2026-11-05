import type { ReactNode } from 'react';
import { AppLink } from '../../../shared/routing/AppLink';
import styles from '../auth.module.css';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  footer: {
    text: string;
    label: string;
    to: string;
  };
}

export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      {/* 左侧品牌面板：纯展示，不承载交互 */}
      <aside className={styles.panel}>
        <div className={styles.panelBrand}>
          <span className={styles.brandMark} aria-hidden="true">M</span>
          <span className={styles.brandName}>MiniCoze</span>
        </div>

        <div className={styles.panelBody}>
          <p className={styles.panelEyebrow}>Agent Workspace</p>
          <h2 className={styles.panelTitle}>
            把想法，<br />
            搭成<em>能跑</em>的智能体。
          </h2>
          <p className={styles.panelText}>喂资料、装工具、把步骤拖成一条线——不写代码，让 AI 替你干活。</p>
        </div>

        <p className={styles.panelFoot}>MINICOZE — MAKE AGENTS, WITH CLARITY</p>
      </aside>

      <main className={styles.main}>
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>

          {children}

          <p className={styles.footer}>
            {footer.text}
            <AppLink className={styles.footerLink} to={footer.to}>{footer.label}</AppLink>
          </p>
        </div>
      </main>
    </div>
  );
}
