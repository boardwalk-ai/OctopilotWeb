"use client";

import NotificationBell from "./NotificationBell";
import PlanInfo from "./PlanInfo";
import StoreButton from "./StoreButton";
import SaveButton from "./SaveButton";
import ReportButton from "./ReportButton";
import UserAvatar from "./UserAvatar";
import styles from "./MainHeaderActions.module.css";

export default function MainHeaderActions() {
  return (
    <div className={styles.actions}>
      <NotificationBell />
      <div className={styles.plan}>
        <PlanInfo />
      </div>
      <div className={styles.iconBtn}>
        <StoreButton />
      </div>
      <div className={styles.iconBtn}>
        <SaveButton />
      </div>
      <div className={styles.iconBtn}>
        <ReportButton />
      </div>
      <div className={styles.avatar}>
        <UserAvatar />
      </div>
    </div>
  );
}
