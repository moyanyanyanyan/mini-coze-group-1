import styles from "./TopNav.module.css";

type TopNavProps = {
  username?: string;
  onLogout?: () => void;
};

export function TopNav({ username, onLogout }: TopNavProps) {
  return (
    <header className={styles.topNav}>
      <div className={styles.brand}>
        <span className={styles.dot} />
        <span className={styles.logo}>MiniCoze</span>
        <span className={styles.workspace}>我的工作区</span>
      </div>

      <div className={styles.right}>
        {username ? (
          <>
            <span className={styles.avatar}>{username.slice(0, 1).toUpperCase()}</span>
            <span className={styles.username}>{username}</span>
          </>
        ) : null}
        <button type="button" className={styles.logoutBtn} onClick={onLogout}>退出</button>
      </div>
    </header>
  );
}
