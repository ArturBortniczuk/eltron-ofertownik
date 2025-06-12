import { Pool } from 'pg';

declare global {
  var _pg: Pool | undefined;
}

const pool = globalThis._pg ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

if (process.env.NODE_ENV !== 'production') {
  globalThis._pg = pool;
}

export { pool as db };

// Typy dla TypeScript
export interface User {
  id: number;
  email: string;
  name: string;
  created_at: Date;
}

export interface Product {
  id: number;
  name: string;
  unit: string;
  created_by: number;
  created_at: Date;
  last_used: Date;
  last_price?: number;
  last_used_by?: string;
}

export interface ProductPrice {
  id: number;
  product_id: number;
  price: number;
  used_by: number;
  used_at: Date;
  user_name?: string;
}

export interface Offer {
  id: number;
  user_id: number;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  delivery_days: number;
  valid_days: number;
  additional_costs: number;
  additional_costs_description?: string;
  notes?: string;
  total_net: number;
  total_vat: number;
  total_gross: number;
  created_at: Date;
  status: string;
}

export interface OfferItem {
  id: number;
  offer_id: number;
  product_id?: number;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  position_order: number;
}