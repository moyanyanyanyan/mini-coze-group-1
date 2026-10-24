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
      <div className={styles.card}>

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>

        {children}

        <p className={styles.footer}>
          {footer.text}
          <AppLink className={styles.footerLink} to={footer.to}>{footer.label}</AppLink>
        </p>
      </div>
    </div>
  );
}
