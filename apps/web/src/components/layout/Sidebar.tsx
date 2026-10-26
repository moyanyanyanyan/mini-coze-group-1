import { NavLink } from "react-router";
import styles from "./Sidebar.module.css";
import { menus } from "./menus";

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav}>
        {menus.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive ? `${styles.menuItem} ${styles.menuItemActive}` : styles.menuItem
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className={styles.footer}>MiniCoze v0.1</div>
    </aside>
  );
}
