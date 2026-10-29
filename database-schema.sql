-- Schemat bazy danych Ofertownika (PostgreSQL / Neon)
-- Skrypt jest idempotentny: można go uruchamiać wielokrotnie, także na istniejącej bazie.
-- Aplikacja uruchamia go sama (Logowanie -> "Przygotuj dane demo"), ale można go też wkleić w konsoli Neon.
-- Po zmianie tego pliku uruchom: node scripts/gen-schema.js

-- Użytkownicy (handlowcy, zarząd, ...)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'user', -- 'handlowiec', 'zarząd', 'centrum elektryczne', 'budowy', 'inne'
    market_region VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_target NUMERIC(12,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS registration_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50),
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Klienci
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    nip VARCHAR(50),
    contact_person VARCHAR(255),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Produkty
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'szt',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Historia cen produktów ('sale' = cena sprzedaży z oferty, 'cost' = cena zakupu)
CREATE TABLE IF NOT EXISTS product_prices (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    price NUMERIC(12,2) NOT NULL,
    cost_price NUMERIC(12,2) DEFAULT 0,
    sale_price NUMERIC(12,2),
    margin_percent NUMERIC(8,2) DEFAULT 0,
    used_by INTEGER REFERENCES users(id),
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) DEFAULT 'sale';

-- Marże produktów (per użytkownik)
CREATE TABLE IF NOT EXISTS product_margins (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    margin_percent NUMERIC(8,2) DEFAULT 0,
    min_margin_percent NUMERIC(8,2) DEFAULT 10,
    max_discount_percent NUMERIC(8,2) DEFAULT 15,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
);

-- Rabaty indywidualne klientów
CREATE TABLE IF NOT EXISTS client_discounts (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    discount_percent NUMERIC(5,2) NOT NULL,
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_until DATE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, product_id)
);

-- Tabela rabatów mogła powstać ręcznie w starszej wersji bazy - dopilnuj kompletu kolumn i unikalności pary
ALTER TABLE client_discounts ADD COLUMN IF NOT EXISTS valid_from DATE DEFAULT CURRENT_DATE;
ALTER TABLE client_discounts ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE client_discounts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE client_discounts ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE client_discounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_discounts_pair ON client_discounts(client_id, product_id);

-- Oferty
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    client_id INTEGER REFERENCES clients(id),
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    delivery_days INTEGER DEFAULT 14,
    valid_days INTEGER DEFAULT 30,
    additional_costs NUMERIC(12,2) DEFAULT 0,
    additional_costs_description TEXT,
    notes TEXT,
    total_net NUMERIC(12,2) DEFAULT 0,
    total_vat NUMERIC(12,2) DEFAULT 0,
    total_gross NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'draft' -- draft, sent, accepted, rejected
);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS public_token VARCHAR(64);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS lost_reason TEXT;
-- Akceptacja zarządu: none | pending | approved | rejected
ALTER TABLE offers ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'none';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS approval_note TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
-- Stare oferty dostają token publicznego linku (przed utworzeniem unikalnego indeksu)
UPDATE offers SET public_token = md5(random()::text || id::text || clock_timestamp()::text) WHERE public_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_public_token ON offers(public_token);

-- Pozycje w ofercie
CREATE TABLE IF NOT EXISTS offer_items (
    id SERIAL PRIMARY KEY,
    offer_id INTEGER REFERENCES offers(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(500) NOT NULL, -- kopia nazwy na wypadek usunięcia produktu
    quantity NUMERIC(12,3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    vat_rate NUMERIC(5,2) DEFAULT 23.00,
    net_amount NUMERIC(12,2) NOT NULL,
    vat_amount NUMERIC(12,2) NOT NULL,
    gross_amount NUMERIC(12,2) NOT NULL,
    cost_price NUMERIC(12,2) DEFAULT 0,
    margin_percent NUMERIC(8,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    original_price NUMERIC(12,2),
    position_order INTEGER DEFAULT 1
);

-- Historia aktywności oferty (zmiany statusu, komentarze, wysyłki, akceptacje)
CREATE TABLE IF NOT EXISTS offer_activity (
    id SERIAL PRIMARY KEY,
    offer_id INTEGER REFERENCES offers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    type VARCHAR(50) NOT NULL, -- created, status, comment, email, approval, viewed, client_response, edited
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kontakty z klientem (telefon, spotkanie, e-mail, notatka)
CREATE TABLE IF NOT EXISTS client_interactions (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL, -- call, meeting, email, note
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zadania / przypomnienia
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    offer_id INTEGER REFERENCES offers(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    due_date DATE,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Szablony ofert
CREATE TABLE IF NOT EXISTS offer_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Widok podsumowania marży ofert (marża liczona od kosztu: (sprzedaż - koszt) / koszt)
-- Widok nie przechowuje danych, więc można go bezpiecznie odtworzyć (także gdy starszy miał inną strukturę)
DROP VIEW IF EXISTS offer_margin_summary;
CREATE VIEW offer_margin_summary AS
SELECT
    oi.offer_id,
    SUM(oi.cost_price * oi.quantity) AS total_cost,
    SUM(oi.net_amount - (oi.cost_price * oi.quantity)) AS total_margin,
    CASE
        WHEN SUM(oi.cost_price * oi.quantity) > 0 THEN
            (SUM(oi.net_amount - (oi.cost_price * oi.quantity)) / SUM(oi.cost_price * oi.quantity)) * 100
        ELSE 0
    END AS margin_percent,
    MAX(o.user_id) AS user_id,
    MAX(o.status) AS status,
    MAX(o.created_at) AS created_at,
    SUM(oi.net_amount) AS total_net_items
FROM offer_items oi
JOIN offers o ON o.id = oi.offer_id
GROUP BY oi.offer_id;

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers(created_at);
CREATE INDEX IF NOT EXISTS idx_offers_user_id ON offers(user_id);
CREATE INDEX IF NOT EXISTS idx_offers_client_id ON offers(client_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_product_prices_product_id ON product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_offer_id ON offer_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_product_margins_product_user ON product_margins(product_id, user_id);
CREATE INDEX IF NOT EXISTS idx_offer_activity_offer_id ON offer_activity(offer_id);
CREATE INDEX IF NOT EXISTS idx_client_interactions_client_id ON client_interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
