import type { ReactNode } from 'react';
import { BRAND_NAME, BRAND_TAGLINE } from '../../brand';
import { BrandMark } from '../../components/BrandMark';
import type { LinkComponentType } from '../../layouts/types';
import styles from './auth.module.css';

interface AuthLayoutProps {
  LinkComponent: LinkComponentType;
  title: string;
  description: string;
  children: ReactNode;
  footer: {
    text: string;
    label: string;
    to: string;
  };
  /** 左上角「返回首页」入口；不传则不渲染 */
  homeRoute?: string;
}

function HomeLink({ className, to, LinkComponent }: {
  className: string;
  to: string;
  LinkComponent: LinkComponentType;
}) {
  return (
    <LinkComponent className={className} to={to}>
      <svg
        className={styles.homeIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
      <span>返回首页</span>
    </LinkComponent>
  );
}

export function AuthLayout({ title, description, children, footer, LinkComponent, homeRoute }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <aside className={styles.panel}>
        <div className={styles.panelTop}>
          {homeRoute ? <HomeLink className={styles.homeLink} to={homeRoute} LinkComponent={LinkComponent} /> : null}

          <div className={styles.panelBrand}>
            <BrandMark className={styles.brandMark} />
            <span className={styles.brandName}>{BRAND_NAME}</span>
          </div>
        </div>

        <div className={styles.panelBody}>
          <p className={styles.panelEyebrow}>MODULAR AGENT WORKSPACE</p>
          <h2 className={styles.panelTitle}>
            把灵感，<br />
            一块块搭成<em>能做事</em>的智能体。
          </h2>
          <p className={styles.panelText}>组合角色、知识、工具与流程，让每一块能力都能在真实任务中运转。</p>
        </div>

        <p className={styles.panelFoot}>{BRAND_NAME} — {BRAND_TAGLINE}</p>
      </aside>

      <main className={styles.main}>
        {/* 移动端左侧品牌面板隐藏，这里补一个同样作用的入口 */}
        {homeRoute ? <HomeLink className={styles.homeLinkMobile} to={homeRoute} LinkComponent={LinkComponent} /> : null}

        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
          {children}
          <p className={styles.footer}>
            {footer.text}
            <LinkComponent className={styles.footerLink} to={footer.to}>{footer.label}</LinkComponent>
          </p>
        </div>
      </main>
    </div>
  );
}
