import { Outlet } from "react-router";
import styles from "./AppShell.module.css";
import { Sidebar } from "../components/layout/Sidebar";
import { TopNav } from "../components/layout/TopNav";

export function AppShell({ onLogout }: { onLogout?: () => void }) {
  return (
    <div className={styles.shell}>
      <TopNav onLogout={onLogout} />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
