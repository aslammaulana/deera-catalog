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
// Image resize helper
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
          b
            ? resolve(b)
            : reject(new Error("Gagal memproses gambar")),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => reject(new Error("File bukan gambar yang valid"));
    img.src = URL.createObjectURL(file);
  });
}

// ----------------------------------------------------------------
// Admin Page
// ----------------------------------------------------------------
export default function AdminPage() {
  // Auth
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(() => !isSupabaseConfigured);

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMsg, setLoginMsg] = useState("");

  // Product list
  const [items, setItems] = useState<Product[]>([]);

  // Form
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("Tambah produk");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [active, setActive] = useState(true);
  const [previewSrc, setPreviewSrc] = useState("");
  const [msg, setMsg] = useState("");
  const [msgErr, setMsgErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  // loadRef memungkinkan onAuthStateChange memanggil load() versi terbaru
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  // ---- Load produk ----
  const load = useCallback(async () => {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .order("sort_order")
      .order("id");
    if (error) {
      setMsg("Gagal memuat: " + error.message);
      setMsgErr(true);
      return;
    }
    setItems((data as Product[]) ?? []);
  }, []);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // ---- Auth ----
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Ambil session awal
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      // Jika sudah login saat mount, muat data
      if (data.session) {
        setTimeout(() => loadRef.current?.(), 0);
      }
    });

    // Subscribe perubahan auth.
    // JANGAN panggil Supabase langsung di sini (deadlock).
    // Gunakan setTimeout agar keluar dari stack onAuthStateChange.
    const { data: listener } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
      if (s) {
        setTimeout(() => loadRef.current?.(), 0);
      } else {
        // Logout: bersihkan daftar di luar call stack Supabase
        setTimeout(() => setItems([]), 0);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // ---- Login ----
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginMsg("");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) setLoginMsg("Email atau password salah.");
  }

  function handleLogout() {
    sb.auth.signOut();
  }

  // ---- Image preview ----
  function showPreview(val: string) {
    setPreviewSrc(val.trim());
  }

  // ---- Reset form ----
  function resetForm() {
    setEditingId(null);
    setFormTitle("Tambah produk");
    setTitle("");
    setUrl("");
    setImageUrl("");
    setActive(true);
    setPreviewSrc("");
    setShowCancel(false);
    setMsg("");
    setMsgErr(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ---- Start edit ----
  function startEdit(it: Product) {
    setEditingId(it.id);
    setFormTitle("Edit produk");
    setTitle(it.title);
    setUrl(it.url);
    setImageUrl(it.image ?? "");
    setActive(it.is_active);
    setPreviewSrc(it.image ?? "");
    setShowCancel(true);
    setMsg("");
    setMsgErr(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Save ----
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
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
      setMsg("Gagal menyimpan: " + error.message);
      setMsgErr(true);
      return;
    }
    resetForm();
    setMsg("Tersimpan.");
    setMsgErr(false);
    load();
  }

  // ---- Toggle ----
  async function toggle(it: Product, value: boolean) {
    const { error } = await sb
      .from("products")
      .update({ is_active: value })
      .eq("id", it.id);
    if (error) {
      setMsg(error.message);
      setMsgErr(true);
    }
    load();
  }

  // ---- Move ----
  async function move(i: number, dir: number) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    arr.forEach((x, k) => (x.sort_order = k));
    const { error } = await sb.from("products").upsert(arr);
    if (error) {
      setMsg(error.message);
      setMsgErr(true);
    }
    load();
  }

  // ---- Remove ----
  async function remove(it: Product) {
    if (!confirm(`Hapus "${it.title}"?`)) return;
    const { error } = await sb.from("products").delete().eq("id", it.id);
    if (error) {
      setMsg(error.message);
      setMsgErr(true);
    }
    if (editingId === it.id) resetForm();
    load();
  }

  // ---- File upload ----
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSaving(true);
    setMsg("Mengunggah foto…");
    setMsgErr(false);
    try {
      const blob = await shrink(f);
      const path =
        Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data
        .publicUrl;
      setImageUrl(publicUrl);
      showPreview(publicUrl);
      setMsg("Foto terunggah.");
      setMsgErr(false);
    } catch (err: unknown) {
      setMsg("Gagal unggah: " + (err instanceof Error ? err.message : String(err)));
      setMsgErr(true);
    }
    if (fileRef.current) fileRef.current.value = "";
    setSaving(false);
  }

  // ---- Env belum diisi ----
  if (!isSupabaseConfigured) {
    return (
      <div className={styles.root}>
        <main className={styles.loginMain}>
          <div className={styles.panel}>
            <h1 className={styles.h1}>Konfigurasi belum lengkap</h1>
            <p
              className={styles.msg}
              style={{ marginTop: "12px", color: "var(--danger)" }}
            >
              Environment variable{" "}
              <code>NEXT_PUBLIC_SUPABASE_URL</code> dan{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> belum diisi di{" "}
              <code>.env.local</code>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ---- Belum siap ----
  if (!authReady) return null;

  // ---- Login form ----
  if (!session) {
    return (
      <div className={styles.root}>
        <main className={styles.loginMain}>
          <div className={styles.panel}>
            <h1 className={styles.h1}>Masuk admin</h1>
            <form onSubmit={handleLogin}>
              <label className={styles.label} htmlFor="email">
                Email
              </label>
              <input
                className={styles.input}
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className={styles.label} htmlFor="password">
                Password
              </label>
              <input
                className={styles.input}
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className={styles.actions}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  type="submit"
                >
                  Masuk
                </button>
              </div>
              {loginMsg && (
                <p className={`${styles.msg} ${styles.msgErr}`}>{loginMsg}</p>
              )}
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ---- Dashboard ----
  return (
    <div className={styles.root}>
      <main className={styles.main}>
        {/* Top bar */}
        <div className={styles.top}>
          <h1 className={styles.h1}>Admin Produk</h1>
          <button className={styles.btn} type="button" onClick={handleLogout}>
            Keluar
          </button>
        </div>

        {/* Form tambah / edit */}
        <section className={styles.panel}>
          <h2 className={styles.h2}>{formTitle}</h2>
          <form onSubmit={handleSave}>
            <label className={styles.label} htmlFor="f-title">
              Judul
            </label>
            <input
              className={styles.input}
              id="f-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <label className={styles.label} htmlFor="f-url">
              Link produk
            </label>
            <input
              className={styles.input}
              id="f-url"
              type="url"
              required
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            <label className={styles.label} htmlFor="f-file">
              Foto
            </label>
            {previewSrc && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className={styles.preview}
                src={previewSrc}
                alt=""
              />
            )}
            <input
              className={styles.fileInput}
              id="f-file"
              type="file"
              accept="image/*"
              ref={fileRef}
              onChange={handleFileChange}
            />
            <input
              className={styles.input}
              id="f-image"
              type="url"
              placeholder="atau tempel link gambar di sini"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                showPreview(e.target.value);
              }}
            />

            <label className={styles.checkLabel} style={{ marginTop: "12px" }}>
              <input
                className={styles.checkInput}
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Tampilkan di web
            </label>

            <div className={styles.actions}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                type="submit"
                disabled={saving}
              >
                Simpan
              </button>
              {showCancel && (
                <button
                  className={styles.btn}
                  type="button"
                  onClick={resetForm}
                >
                  Batal
                </button>
              )}
            </div>
            {msg && (
              <p className={`${styles.msg}${msgErr ? " " + styles.msgErr : ""}`}>
                {msg}
              </p>
            )}
          </form>
        </section>

        {/* Daftar produk */}
        <section>
          <h2 className={styles.h2}>
            Daftar produk ({items.length})
          </h2>
          <ol className={styles.list}>
            {items.length === 0 ? (
              <li className={styles.empty}>
                Belum ada produk. Tambahkan lewat form di atas.
              </li>
            ) : (
              items.map((it, i) => (
                <li
                  key={it.id}
                  className={`${styles.row}${!it.is_active ? " " + styles.rowOff : ""}`}
                >
                  <span className={styles.rowNo}>{i + 1}</span>

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.rowThumb}
                    src={it.image ?? undefined}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                  />

                  <div>
                    <div className={styles.rowTitle}>{it.title}</div>
                    <div className={styles.rowUrl}>{it.url}</div>
                  </div>

                  <div className={styles.tools}>
                    <label className={styles.toolsCheck}>
                      <input
                        type="checkbox"
                        checked={it.is_active}
                        onChange={(e) => toggle(it, e.target.checked)}
                      />
                      Tampil
                    </label>

                    <button
                      className={styles.toolsBtn}
                      type="button"
                      disabled={i === 0}
                      aria-label="Naikkan"
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className={styles.toolsBtn}
                      type="button"
                      disabled={i === items.length - 1}
                      aria-label="Turunkan"
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className={styles.toolsBtn}
                      type="button"
                      onClick={() => startEdit(it)}
                    >
                      Edit
                    </button>
                    <button
                      className={`${styles.toolsBtn} ${styles.toolsBtnDanger}`}
                      type="button"
                      onClick={() => remove(it)}
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              ))
            )}
          </ol>
        </section>
      </main>
    </div>
  );
}
