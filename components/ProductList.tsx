"use client";

import { useState, useEffect } from "react";
import { CgArrowTopRight, CgClose } from "react-icons/cg";
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
  const [selectedImage, setSelectedImage] = useState<{
    src: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedImage(null);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedImage]);

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

              {product.image ? (
                <button
                  type="button"
                  className={styles.thumbButton}
                  onClick={() =>
                    setSelectedImage({
                      src: product.image!,
                      title: product.title,
                    })
                  }
                  aria-label={`Lihat foto ${product.title}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.thumb}
                    src={product.image}
                    alt={product.title}
                    width={72}
                    height={72}
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).removeAttribute("src");
                    }}
                  />
                </button>
              ) : (
                <div className={styles.thumbPlaceholder} aria-hidden="true" />
              )}

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

      {selectedImage && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Tampilan gambar penuh"
        >
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setSelectedImage(null)}
            aria-label="Tutup"
          >
            <CgClose className={styles.closeIcon} aria-hidden="true" />
          </button>

          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.fullImage}
              src={selectedImage.src}
              alt={selectedImage.title}
            />
            {selectedImage.title && (
              <p className={styles.modalCaption}>{selectedImage.title}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
