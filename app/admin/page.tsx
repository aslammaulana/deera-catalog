"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase as sb, isSupabaseConfigured } from "@/lib/supabase";
import styles from "./admin.module.css";
import {
  FiLock,
  FiMail,
  FiEye,
  FiEyeOff,
  FiLogOut,
  FiExternalLink,
  FiUploadCloud,
  FiCheck,
  FiArrowUp,
  FiArrowDown,
  FiEdit2,
  FiTrash2,
  FiAlertCircle,
  FiImage,
  FiPackage,
  FiUser,
} from "react-icons/fi";

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
// Admin Page Component
// ----------------------------------------------------------------
export default function AdminPage() {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(() => !isSupabaseConfigured);

  // Login form state
  const [authMode, setAuthMode] = useState<"password" | "magic-link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          <div className={styles.panel}>
            <div className={styles.panelTitle} style={{ color: "var(--danger)" }}>
              <FiAlertCircle /> Konfigurasi Belum Lengkap
            </div>
            <p className={styles.switchDesc} style={{ marginTop: "8px" }}>
              Environment variable <code>NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> belum diisi di{" "}
              <code>.env.local</code>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!authReady) return null;

  // ---- TAMPILAN LOGIN ----
  if (!session) {
    return (
      <div className={styles.root}>
        <main className={styles.loginContainer}>
          <div className={styles.panel}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div
                className={styles.brandIcon}
                style={{ margin: "0 auto 12px", width: "48px", height: "48px", fontSize: "1.5rem" }}
              >
                <FiLock />
              </div>
              <h1 className={styles.panelTitle} style={{ justifyContent: "center", fontSize: "1.35rem" }}>
                Admin Masuk
              </h1>
              <p className={styles.switchDesc} style={{ marginTop: "4px" }}>
                Masuk menggunakan akun Supabase Authentication Anda
              </p>
            </div>

            {/* Tabs Mode Login */}
            <div className={styles.authTabs}>
              <button
                type="button"
                className={`${styles.authTab} ${authMode === "password" ? styles.authTabActive : ""}`}
                onClick={() => {
                  setAuthMode("password");
                  setAuthFeedback(null);
                }}
              >
                <FiLock /> Password
              </button>
              <button
                type="button"
                className={`${styles.authTab} ${authMode === "magic-link" ? styles.authTabActive : ""}`}
                onClick={() => {
                  setAuthMode("magic-link");
                  setAuthFeedback(null);
                }}
              >
                <FiMail /> Link Email / OTP
              </button>
            </div>

            {/* Form Mode Password */}
            {authMode === "password" && (
              <form onSubmit={handlePasswordLogin}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="login-email">
                    Email Akun Supabase
                  </label>
                  <div className={styles.inputWrapper}>
                    <FiMail className={styles.inputIcon} />
                    <input
                      id="login-email"
                      className={`${styles.input} ${styles.inputWithIcon}`}
                      type="email"
                      required
                      placeholder="admin@email.com"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="login-password">
                    Password
                  </label>
                  <div className={styles.inputWrapper}>
                    <FiLock className={styles.inputIcon} />
                    <input
                      id="login-password"
                      className={`${styles.input} ${styles.inputWithIcon}`}
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.togglePasswordBtn}
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Lihat password"
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ width: "100%", marginTop: "8px" }}
                  disabled={authLoading}
                >
                  {authLoading ? <div className={styles.spinner} /> : "Masuk dengan Password"}
                </button>
              </form>
            )}

            {/* Form Mode Magic Link / OTP */}
            {authMode === "magic-link" && (
              <div>
                {!otpSent ? (
                  <form onSubmit={handleMagicLink}>
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="magic-email">
                        Email Terdaftar di Supabase
                      </label>
                      <div className={styles.inputWrapper}>
                        <FiMail className={styles.inputIcon} />
                        <input
                          id="magic-email"
                          className={`${styles.input} ${styles.inputWithIcon}`}
                          type="email"
                          required
                          placeholder="admin@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      style={{ width: "100%", marginTop: "8px" }}
                      disabled={authLoading}
                    >
                      {authLoading ? <div className={styles.spinner} /> : "Kirim Tautan / OTP ke Email"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp}>
                    <div className={styles.formGroup}>
                      <label className={styles.label} htmlFor="otp-input">
                        Masukkan Kode OTP 6 Digit dari Email
                      </label>
                      <div className={styles.inputWrapper}>
                        <FiLock className={styles.inputIcon} />
                        <input
                          id="otp-input"
                          className={`${styles.input} ${styles.inputWithIcon}`}
                          type="text"
                          required
                          placeholder="123456"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      style={{ width: "100%", marginTop: "8px" }}
                      disabled={authLoading}
                    >
                      {authLoading ? <div className={styles.spinner} /> : "Verifikasi & Masuk"}
                    </button>

                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      style={{ width: "100%", marginTop: "8px" }}
                      onClick={() => setOtpSent(false)}
                    >
                      Kirim ulang ke email lain
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Feedback Message */}
            {authFeedback && (
              <div
                className={`${styles.alert} ${
                  authFeedback.isError ? styles.alertError : styles.alertSuccess
                }`}
              >
                <FiAlertCircle style={{ fontSize: "1.1rem", flexShrink: 0, marginTop: "2px" }} />
                <span>{authFeedback.text}</span>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ---- TAMPILAN DASHBOARD ADMIN ----
  return (
    <div className={styles.root}>
      <main className={styles.container}>
        {/* Top Navbar */}
        <header className={styles.topBar}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>
              <FiPackage />
            </div>
            <div>
              <div className={styles.brandTitle}>Admin Produk</div>
              <div className={styles.switchDesc}>Kelola produk bio-link</div>
            </div>
          </div>

          <div className={styles.topActions}>
            {session.user?.email && (
              <span className={styles.userBadge} title={session.user.email}>
                <FiUser /> {session.user.email}
              </span>
            )}
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className={`${styles.btn} ${styles.btnSmall}`}
              title="Buka halaman publik di tab baru"
            >
              <FiExternalLink /> Lihat Web
            </a>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`}
              onClick={handleLogout}
            >
              <FiLogOut /> Keluar
            </button>
          </div>
        </header>

        {/* Panel Form Tambah/Edit */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>
              {editingId !== null ? (
                <>
                  <FiEdit2 /> Edit Produk
                  <span className={styles.badgeCount}>Mode Edit</span>
                </>
              ) : (
                <>
                  <FiPackage /> Tambah Produk Baru
                </>
              )}
            </h2>
            {editingId !== null && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}
                onClick={resetForm}
              >
                Batal Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSaveProduct}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="product-title">
                Judul Produk
              </label>
              <input
                id="product-title"
                className={styles.input}
                type="text"
                required
                placeholder="Contoh: Kemeja Oversize Linen Premium"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="product-url">
                Link Produk (Afiliasi / Toko Online)
              </label>
              <input
                id="product-url"
                className={styles.input}
                type="url"
                required
                placeholder="https://shopee.co.id/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {/* Bagian Upload Foto */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Foto Produk</label>
              <div className={styles.uploadSection}>
                {previewSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    className={styles.previewThumb}
                    src={previewSrc}
                    alt="Pratinjau"
                    onError={() => setPreviewSrc("")}
                  />
                ) : (
                  <div className={styles.previewPlaceholder}>
                    <FiImage />
                  </div>
                )}

                <div className={styles.uploadInputs}>
                  <label className={styles.fileBtn}>
                    <FiUploadCloud /> {uploading ? "Mengunggah..." : "Pilih Berkas Foto"}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className={styles.hiddenFileInput}
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>

                  <input
                    className={styles.input}
                    type="url"
                    placeholder="Atau tempel link gambar (URL) di sini..."
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setPreviewSrc(e.target.value.trim());
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Toggle Status Aktif */}
            <div
              className={styles.switchContainer}
              onClick={() => setActive(!active)}
              role="button"
              tabIndex={0}
            >
              <div className={styles.switchInfo}>
                <span className={styles.switchLabel}>Tampilkan di Website</span>
                <span className={styles.switchDesc}>
                  {active
                    ? "Produk ini akan langsung terlihat oleh pengunjung web"
                    : "Produk ini disembunyikan sementara dari web"}
                </span>
              </div>
              <div className={`${styles.switchPill} ${active ? styles.switchPillActive : ""}`}>
                <div className={`${styles.switchKnob} ${active ? styles.switchKnobActive : ""}`} />
              </div>
            </div>

            {/* Tombol Aksi Form */}
            <div className={styles.formActions}>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={saving || uploading}
              >
                {saving ? (
                  <>
                    <div className={styles.spinner} /> Menyimpan...
                  </>
                ) : (
                  <>
                    <FiCheck /> {editingId !== null ? "Perbarui Produk" : "Simpan Produk"}
                  </>
                )}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  className={styles.btn}
                  onClick={resetForm}
                >
                  Batal
                </button>
              )}
            </div>

            {/* Form Alert Message */}
            {formMsg && (
              <div
                className={`${styles.alert} ${
                  formMsg.isError ? styles.alertError : styles.alertSuccess
                }`}
              >
                <FiAlertCircle style={{ fontSize: "1.1rem", flexShrink: 0, marginTop: "2px" }} />
                <span>{formMsg.text}</span>
              </div>
            )}
          </form>
        </section>

        {/* Panel Daftar Produk */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>
              Daftar Produk <span className={styles.badgeCount}>{items.length}</span>
            </h2>
          </div>

          {items.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <FiPackage />
              </div>
              <div className={styles.emptyText}>Belum ada produk</div>
              <p className={styles.switchDesc} style={{ marginTop: "4px" }}>
                Gunakan formulir di atas untuk menambahkan produk pertama Anda.
              </p>
            </div>
          ) : (
            <ol className={styles.list}>
              {items.map((it, i) => (
                <li
                  key={it.id}
                  className={`${styles.cardRow} ${!it.is_active ? styles.cardRowOff : ""}`}
                >
                  {/* Nomor Urut */}
                  <div className={styles.rowNumber}>{i + 1}</div>

                  {/* Thumbnail Gambar */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.rowThumb}
                    src={it.image ?? undefined}
                    alt={it.title}
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).removeAttribute("src");
                    }}
                  />

                  {/* Detail Produk */}
                  <div className={styles.rowDetails}>
                    <div className={styles.rowTitle}>{it.title}</div>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.rowUrl}
                      title="Buka link produk"
                    >
                      <FiExternalLink /> {it.url}
                    </a>
                    <span
                      className={`${styles.statusBadge} ${
                        it.is_active ? styles.statusActive : styles.statusInactive
                      }`}
                    >
                      <span className={styles.statusDot} />
                      {it.is_active ? "Tampil di Web" : "Disembunyikan"}
                    </span>
                  </div>

                  {/* Tombol Aksi */}
                  <div className={styles.rowTools}>
                    <label className={styles.toolCheckLabel}>
                      <input
                        type="checkbox"
                        checked={it.is_active}
                        onChange={(e) => handleToggle(it, e.target.checked)}
                      />
                      Aktifkan
                    </label>

                    <div className={styles.toolGroup}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSmall} ${styles.btnIconOnly}`}
                        disabled={i === 0}
                        aria-label="Naikkan urutan"
                        title="Naikkan urutan"
                        onClick={() => handleMove(i, -1)}
                      >
                        <FiArrowUp />
                      </button>

                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSmall} ${styles.btnIconOnly}`}
                        disabled={i === items.length - 1}
                        aria-label="Turunkan urutan"
                        title="Turunkan urutan"
                        onClick={() => handleMove(i, 1)}
                      >
                        <FiArrowDown />
                      </button>

                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSmall}`}
                        onClick={() => startEdit(it)}
                      >
                        <FiEdit2 /> Edit
                      </button>

                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`}
                        onClick={() => handleRemove(it)}
                      >
                        <FiTrash2 /> Hapus
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
