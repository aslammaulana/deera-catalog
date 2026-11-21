"use client";

import { CgArrowTopRight } from "react-icons/cg";
import ProfileHeader from "./ProfileHeader";
import styles from "./ProductList.module.css";
import { PROFILE } from "@/config/profile";

interface Product {
  id: number;
  title: string;
  image: string | null;
  url: string;
}

interface Props {
  products: Product[];
}

export default function ProductList({ products }: Props) {
  return (
    <div className={styles.wrapper}>
      <ProfileHeader
        name={PROFILE.name}
        bio={PROFILE.bio}
        avatar={PROFILE.avatar}
      />

      {products.length === 0 ? (
        <p className={styles.empty}>Belum ada produk.</p>
      ) : (
        <ol className={styles.list}>
          {products.map((product, index) => (
            <li key={product.id} className={styles.item}>
              <span className={styles.no}>{index + 1}</span>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.thumb}
                src={product.image ?? undefined}
                alt={product.title}
                width={72}
                height={72}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).removeAttribute("src");
                }}
              />

              <span className={styles.title}>{product.title}</span>

              <a
                className={styles.go}
                href={product.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                aria-label={`Buka link ${product.title}`}
              >
                <CgArrowTopRight className={styles.goIcon} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
