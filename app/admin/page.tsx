"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase as sb, isSupabaseConfigured } from "@/lib/supabase";
import styles from "./admin.module.css";

const BUCKET = "product-images";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Product {
  id: number;
  title: string;
  image: string | null;
  url: string;
  sort_order: number;
  is_active: boolean;
}

// ----------------------------------------------------------------
// Image resize helper (Canvas max 480px, JPEG 0.85)
// ----------------------------------------------------------------
function shrink(file: File, max = 480): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Gagal memproses gambar")),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => reject(new Error("File bukan gambar yang valid"));
    img.src = URL.createObjectURL(file);
  });
}

// ----------------------------------------------------------------
// Admin Page Component (Redesain Minimalis)
// ----------------------------------------------------------------
export default function AdminPage() {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(() => !isSupabaseConfigured);

  // Login form state
  const [authMode, setAuthMode] = useState<"password" | "magic-link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  // Product list
  const [items, setItems] = useState<Product[]>([]);

  // Product Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [active, setActive] = useState(true);
  const [previewSrc, setPreviewSrc] = useState("");
  const [formMsg, setFormMsg] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  // ---- Load produk ----
  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .order("sort_order")
      .order("id");

    if (error) {
      setFormMsg({ text: "Gagal memuat produk: " + error.message, isError: true });
      return;
    }
    setItems((data as Product[]) ?? []);
  }, []);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // ---- Auth Listener ----
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Ambil session awal
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      if (data.session) {
        setTimeout(() => loadRef.current?.(), 0);
      }
    });

    // Subscribe auth changes — defer panggil supabase via setTimeout agar tidak deadlock
    const { data: listener } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
      if (s) {
        setTimeout(() => loadRef.current?.(), 0);
      } else {
        setTimeout(() => setItems([]), 0);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // ---- Login Handlers ----
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthFeedback(null);
    setAuthLoading(true);

    try {
      const { error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          setAuthFeedback({
            text: "Email atau password salah. Pastikan akun sudah dibuat di Supabase Authentication → Users.",
            isError: true,
          });
        } else if (error.message.toLowerCase().includes("email not confirmed")) {
          setAuthFeedback({
            text: "Email belum dikonfirmasi di Supabase. Buka dashboard Supabase → Authentication → Users lalu pilih opsi Confirm User.",
            isError: true,
          });
        } else {
          setAuthFeedback({ text: error.message, isError: true });
        }
      }
    } catch (err: unknown) {
      setAuthFeedback({
        text: err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.",
        isError: true,
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setAuthFeedback(null);
    setAuthLoading(true);

    try {
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined,
        },
      });

      if (error) {
        setAuthFeedback({ text: error.message, isError: true });
      } else {
        setOtpSent(true);
        setAuthFeedback({
          text: `Tautan masuk dan kode OTP telah dikirim ke ${email}. Cek inbox (atau folder spam) email Anda dan klik link tersebut atau masukkan kode OTP di bawah.`,
          isError: false,
        });
      }
    } catch (err: unknown) {
      setAuthFeedback({
        text: err instanceof Error ? err.message : "Gagal mengirim tautan masuk.",
        isError: true,
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setAuthFeedback(null);
    setAuthLoading(true);

    try {
      const { error } = await sb.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "email",
      });

      if (error) {
        setAuthFeedback({ text: "Kode verifikasi salah atau kedaluwarsa: " + error.message, isError: true });
      }
    } catch (err: unknown) {
      setAuthFeedback({
        text: err instanceof Error ? err.message : "Gagal memverifikasi kode.",
        isError: true,
      });
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    sb.auth.signOut();
  }

  // ---- Form Handlers ----
  function resetForm() {
    setEditingId(null);
    setTitle("");
    setUrl("");
    setImageUrl("");
    setActive(true);
    setPreviewSrc("");
    setFormMsg(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function startEdit(it: Product) {
    setEditingId(it.id);
    setTitle(it.title);
    setUrl(it.url);
    setImageUrl(it.image ?? "");
    setActive(it.is_active);
    setPreviewSrc(it.image ?? "");
    setFormMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormMsg(null);

    const row = {
      title: title.trim(),
      url: url.trim(),
      image: imageUrl.trim() || null,
      is_active: active,
    };

    let error;
    if (editingId !== null) {
      ({ error } = await sb.from("products").update(row).eq("id", editingId));
    } else {
      const next = items.length
        ? Math.max(...items.map((x) => x.sort_order)) + 1
        : 0;
      ({ error } = await sb
        .from("products")
        .insert({ ...row, sort_order: next }));
    }

    setSaving(false);
    if (error) {
      setFormMsg({ text: "Gagal menyimpan: " + error.message, isError: true });
      return;
    }

    resetForm();
    setFormMsg({ text: "Produk berhasil disimpan!", isError: false });
    load();
  }

  async function handleToggle(it: Product, val: boolean) {
    const { error } = await sb
      .from("products")
      .update({ is_active: val })
      .eq("id", it.id);

    if (error) {
      setFormMsg({ text: "Gagal mengubah status: " + error.message, isError: true });
    }
    load();
  }

  async function handleMove(i: number, dir: number) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    arr.forEach((x, k) => (x.sort_order = k));

    const { error } = await sb.from("products").upsert(arr);
    if (error) {
      setFormMsg({ text: "Gagal mengubah urutan: " + error.message, isError: true });
    }
    load();
  }

  async function handleRemove(it: Product) {
    if (!confirm(`Hapus produk "${it.title}"?`)) return;
    const { error } = await sb.from("products").delete().eq("id", it.id);

    if (error) {
      setFormMsg({ text: "Gagal menghapus: " + error.message, isError: true });
    }
    if (editingId === it.id) resetForm();
    load();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setUploading(true);
    setFormMsg({ text: "Memproses & mengunggah foto…", isError: false });

    try {
      const blob = await shrink(f);
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

      const { error } = await sb.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });

      if (error) throw error;

      const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      setImageUrl(publicUrl);
      setPreviewSrc(publicUrl);
      setFormMsg({ text: "Foto berhasil diunggah!", isError: false });
    } catch (err: unknown) {
      setFormMsg({
        text: "Gagal unggah foto: " + (err instanceof Error ? err.message : String(err)),
        isError: true,
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setUploading(false);
    }
  }

  // ---- Tampilan jika Supabase belum dikonfigurasi ----
  if (!isSupabaseConfigured) {
    return (
      <div className={styles.root}>
        <main className={styles.loginContainer}>
          <div>
            <h1 className={styles.h1}>Konfigurasi Belum Lengkap</h1>
            <p className={styles.subtitle} style={{ color: "var(--danger)" }}>
              Environment variable <code>NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> belum diisi di <code>.env.local</code>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!authReady) return null;

  // ---- TAMPILAN LOGIN MINIMALIS ----
  if (!session) {
    return (
      <div className={styles.root}>
        <main className={styles.loginContainer}>
          <div>
            <h1 className={styles.h1}>Masuk Admin</h1>
            <p className={styles.subtitle}>Kelola produk bio-link</p>
          </div>

          {/* Mode Tabs */}
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${authMode === "password" ? styles.tabActive : ""}`}
              onClick={() => {
                setAuthMode("password");
                setAuthFeedback(null);
              }}
            >
              Password
            </button>
            <button
              type="button"
              className={`${styles.tab} ${authMode === "magic-link" ? styles.tabActive : ""}`}
              onClick={() => {
                setAuthMode("magic-link");
                setAuthFeedback(null);
              }}
            >
              Link Email / OTP
            </button>
          </div>

          {/* Form Password */}
          {authMode === "password" && (
            <form onSubmit={handlePasswordLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="login-email">
                  Email akun Supabase
                </label>
                <input
                  id="login-email"
                  className={styles.fld}
                  type="email"
                  required
                  placeholder="admin@email.com"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="login-password">
                  Password
                </label>
                <input
                  id="login-password"
                  className={styles.fld}
                  type="password"
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className={styles.saveBtn}
                style={{ width: "100%", justifyContent: "center", marginTop: "4px" }}
                disabled={authLoading}
              >
                {authLoading ? "Memproses..." : "Masuk dengan Password"}
              </button>
            </form>
          )}

          {/* Form Magic Link / OTP */}
          {authMode === "magic-link" && (
            <div>
              {!otpSent ? (
                <form onSubmit={handleMagicLink} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="magic-email">
                      Email terdaftar di Supabase
                    </label>
                    <input
                      id="magic-email"
                      className={styles.fld}
                      type="email"
                      required
                      placeholder="admin@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className={styles.saveBtn}
                    style={{ width: "100%", justifyContent: "center", marginTop: "4px" }}
                    disabled={authLoading}
                  >
                    {authLoading ? "Mengirim..." : "Kirim Tautan / OTP ke Email"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="otp-input">
                      Masukkan Kode OTP 6 Digit dari Email
                    </label>
                    <input
                      id="otp-input"
                      className={styles.fld}
                      type="text"
                      required
                      placeholder="123456"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className={styles.saveBtn}
                    style={{ width: "100%", justifyContent: "center" }}
                    disabled={authLoading}
                  >
                    {authLoading ? "Memverifikasi..." : "Verifikasi & Masuk"}
                  </button>

                  <button
                    type="button"
                    className={styles.lnk}
                    style={{ justifyContent: "center" }}
                    onClick={() => setOtpSent(false)}
                  >
                    Kirim ulang ke email lain
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Feedback */}
          {authFeedback && (
            <div
              className={`${styles.feedback} ${
                authFeedback.isError ? styles.feedbackError : styles.feedbackSuccess
              }`}
            >
              {authFeedback.text}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ---- TAMPILAN DASHBOARD REDESAIN MINIMALIS ----
  return (
    <div className={styles.root}>
      <div className={styles.container}>
        {/* Header Sesuai Desain Minimalis */}
        <header className={styles.header}>
          <div>
            <h1 className={styles.h1}>Produk</h1>
            <p className={styles.subtitle}>Kelola produk bio-link</p>
          </div>
          <nav className={styles.nav}>
            {session.user?.email && (
              <span className={styles.userEmail}>{session.user.email}</span>
            )}
            <a className={styles.lnk} href="/" target="_blank" rel="noopener noreferrer">
              Lihat web
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </a>
            <button type="button" className={styles.lnk} onClick={handleLogout}>
              Keluar
            </button>
          </nav>
        </header>

        {/* Section Form Tambah / Edit */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.h2}>
              {editingId !== null ? "Edit produk" : "Tambah produk baru"}
            </h2>
            {editingId !== null && (
              <button type="button" className={styles.lnk} onClick={resetForm}>
                Batal edit
              </button>
            )}
          </div>

          <form onSubmit={handleSaveProduct} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className={styles.formGroup}>
              <label htmlFor="judul" className={styles.label}>
                Judul produk
              </label>
              <input
                className={styles.fld}
                id="judul"
                type="text"
                required
                placeholder="Contoh: Kemeja Oversize Linen Premium"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="link" className={styles.label}>
                Link produk <span className={styles.labelDesc}>(afiliasi / toko online)</span>
              </label>
              <input
                className={styles.fld}
                id="link"
                type="url"
                required
                placeholder="https://shopee.co.id/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {/* Bagian Foto Produk */}
            <div className={styles.formGroup}>
              <span className={styles.label}>Foto produk</span>
              <div className={styles.photoRow}>
                <div className={styles.photoPreview}>
                  {previewSrc ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={previewSrc} alt="" onError={() => setPreviewSrc("")} />
                  ) : (
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="9" cy="9" r="1.5" />
                      <path d="m21 15-4.5-4.5L6 21" />
                    </svg>
                  )}
                </div>

                <div className={styles.photoActions}>
                  <label className={styles.btnO} htmlFor="foto">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" />
                    </svg>
                    {uploading ? "Mengunggah..." : "Pilih berkas foto"}
                    <input
                      className={styles.sr}
                      id="foto"
                      type="file"
                      accept="image/*"
                      ref={fileRef}
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>

                  <input
                    className={styles.fld}
                    id="url-foto"
                    type="url"
                    aria-label="Link gambar"
                    placeholder="Atau tempel link gambar (URL)"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setPreviewSrc(e.target.value.trim());
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Switch Tampilkan di Website */}
            <label className={styles.switchRow}>
              <span className={styles.switchText}>
                <span className={styles.switchTitle}>Tampilkan di website</span>
                <span className={styles.switchDesc}>Produk langsung terlihat oleh pengunjung web</span>
              </span>
              <input
                className={styles.switch}
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
            </label>

            {/* Tombol Simpan */}
            <div className={styles.formActionsRow}>
              <button className={styles.saveBtn} type="submit" disabled={saving || uploading}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 12 5 5L20 7" />
                </svg>
                {saving
                  ? "Menyimpan..."
                  : editingId !== null
                  ? "Perbarui produk"
                  : "Simpan produk"}
              </button>

              {editingId !== null && (
                <button className={styles.btnO} type="button" onClick={resetForm}>
                  Batal
                </button>
              )}
            </div>

            {/* Feedback simpan */}
            {formMsg && (
              <div
                className={`${styles.feedback} ${
                  formMsg.isError ? styles.feedbackError : styles.feedbackSuccess
                }`}
              >
                {formMsg.text}
              </div>
            )}
          </form>
        </section>

        {/* Section Daftar Produk */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.h2}>Daftar produk</h2>
            <span className={styles.count}>{items.length}</span>
          </div>

          {items.length === 0 ? (
            <div className={styles.emptyBox}>
              <p className={styles.emptyTitle}>Belum ada produk</p>
              <p className={styles.emptyDesc}>
                Gunakan formulir di atas untuk menambahkan produk pertama Anda.
              </p>
            </div>
          ) : (
            <ol className={styles.productList}>
              {items.map((it, i) => (
                <li
                  key={it.id}
                  className={`${styles.productItem} ${!it.is_active ? styles.productItemOff : ""}`}
                >
                  <span className={styles.productIndex}>{i + 1}</span>

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.productThumb}
                    src={it.image ?? undefined}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).removeAttribute("src");
                    }}
                  />

                  <div className={styles.productInfo}>
                    <div className={styles.productTitle}>{it.title}</div>
                    <a
                      className={styles.productUrl}
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={it.url}
                    >
                      {it.url}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M7 17 17 7M8 7h9v9" />
                      </svg>
                    </a>
                  </div>

                  <div className={styles.productActions}>
                    <label className={styles.productToggleLabel}>
                      <input
                        className={styles.switch}
                        style={{ width: "36px", height: "20px" }}
                        type="checkbox"
                        checked={it.is_active}
                        onChange={(e) => handleToggle(it, e.target.checked)}
                      />
                      {it.is_active ? "Tampil di website" : "Disembunyikan"}
                    </label>

                    <div className={styles.btnGroup}>
                      <button
                        type="button"
                        className={`${styles.btnO} ${styles.btnIcon}`}
                        disabled={i === 0}
                        aria-label="Naikkan urutan"
                        title="Naikkan urutan"
                        onClick={() => handleMove(i, -1)}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        className={`${styles.btnO} ${styles.btnIcon}`}
                        disabled={i === items.length - 1}
                        aria-label="Turunkan urutan"
                        title="Turunkan urutan"
                        onClick={() => handleMove(i, 1)}
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        className={`${styles.btnO} ${styles.btnSmall}`}
                        onClick={() => startEdit(it)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className={`${styles.btnO} ${styles.btnSmall} ${styles.btnDanger}`}
                        onClick={() => handleRemove(it)}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
