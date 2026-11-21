"use client";

import styles from "./ProfileHeader.module.css";

interface Props {
  name: string;
  bio: string;
  avatar: string;
}

export default function ProfileHeader({ name, bio, avatar }: Props) {
  return (
    <header className={styles.header}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.avatar}
        src={avatar}
        alt={name}
        width={96}
        height={96}
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).removeAttribute("src");
        }}
      />
      <h1 className={styles.name}>{name}</h1>
      <p className={styles.bio}>{bio}</p>
    </header>
  );
}
