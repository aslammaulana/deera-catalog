import { createClient } from "@supabase/supabase-js";
import ProductList from "@/components/ProductList";

export const revalidate = 60;

interface Product {
  id: number;
  title: string;
  image: string | null;
  url: string;
}

async function getProducts(): Promise<Product[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return [];

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("products")
      .select("id, title, image, url")
      .eq("is_active", true)
      .order("sort_order")
      .order("id");

    if (error) {
      console.error("Supabase error:", error.message);
      return [];
    }

    return (data as Product[]) ?? [];
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return [];
  }
}

export default async function HomePage() {
  const products = await getProducts();
  return <ProductList products={products} />;
}
