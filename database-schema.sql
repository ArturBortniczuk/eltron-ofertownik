-- Schema bazy danych dla Neon PostgreSQL
-- Wykonaj te komendy w konsoli Neon

-- Tabela użytkowników (handlowców)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'user', -- 'user', 'handlowiec', 'zarząd', 'centrum elektryczne'
    market_region VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela prób rejestracji
CREATE TABLE registration_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50),
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela klientów
CREATE TABLE clients (
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

-- Tabela produktów
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'szt',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Historia cen produktów
CREATE TABLE product_prices (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) DEFAULT 0,
    sale_price DECIMAL(10,2), -- Może być redundancyjne do price, ale używane w kodzie
    margin_percent DECIMAL(5,2) DEFAULT 0,
    used_by INTEGER REFERENCES users(id),
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Marże produktów (per użytkownik/region)
CREATE TABLE product_margins (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    cost_price DECIMAL(10,2) NOT NULL,
    margin_percent DECIMAL(5,2) DEFAULT 0,
    min_margin_percent DECIMAL(5,2) DEFAULT 10,
    max_discount_percent DECIMAL(5,2) DEFAULT 15,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
);

-- Oferty
CREATE TABLE offers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    client_id INTEGER REFERENCES clients(id),
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    delivery_days INTEGER DEFAULT 14,
    valid_days INTEGER DEFAULT 30,
    additional_costs DECIMAL(10,2) DEFAULT 0,
    additional_costs_description TEXT,
    notes TEXT,
    total_net DECIMAL(10,2) DEFAULT 0,
    total_vat DECIMAL(10,2) DEFAULT 0,
    total_gross DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'draft' -- draft, sent, accepted, rejected
);

-- Pozycje w ofercie
CREATE TABLE offer_items (
    id SERIAL PRIMARY KEY,
    offer_id INTEGER REFERENCES offers(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(500) NOT NULL, -- kopia nazwy na wypadek usunięcia produktu
    quantity DECIMAL(10,3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    vat_rate DECIMAL(5,2) DEFAULT 23.00,
    net_amount DECIMAL(10,2) NOT NULL,
    vat_amount DECIMAL(10,2) NOT NULL,
    gross_amount DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) DEFAULT 0,
    margin_percent DECIMAL(5,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    original_price DECIMAL(10,2),
    position_order INTEGER DEFAULT 1
);

-- Widok podsumowania marży dla ofert
CREATE OR REPLACE VIEW offer_margin_summary AS
SELECT 
    offer_id,
    SUM(cost_price * quantity) as total_cost,
    SUM(net_amount - (cost_price * quantity)) as total_margin,
    CASE 
        WHEN SUM(net_amount) > 0 THEN 
            (SUM(net_amount - (cost_price * quantity)) / SUM(net_amount)) * 100
        ELSE 0 
    END as margin_percent
FROM offer_items
GROUP BY offer_id;

-- Indeksy dla lepszej wydajności
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('polish', name));
CREATE INDEX idx_offers_created_at ON offers(created_at);
CREATE INDEX idx_offers_user_id ON offers(user_id);
CREATE INDEX idx_offers_client_id ON offers(client_id);
CREATE INDEX idx_clients_created_by ON clients(created_by);
CREATE INDEX idx_product_prices_product_id ON product_prices(product_id);
CREATE INDEX idx_offer_items_offer_id ON offer_items(offer_id);
CREATE INDEX idx_product_margins_product_user ON product_margins(product_id, user_id);

-- Funkcja do automatycznego czyszczenia starych ofert (starszych niż 2 miesiące)
CREATE OR REPLACE FUNCTION cleanup_old_offers()
RETURNS void AS $$
BEGIN
    DELETE FROM offers 
    WHERE created_at < NOW() - INTERVAL '2 months' 
    AND status = 'draft';
END;
$$ LANGUAGE plpgsql;

-- Przykładowe dane testowe - NAJPIERW USUŃ ISTNIEJĄCE DANE
-- DELETE FROM offer_items;
-- DELETE FROM offers;
-- DELETE FROM clients;
-- DELETE FROM product_prices;
-- DELETE FROM product_margins;
-- DELETE FROM products;
-- DELETE FROM users;

-- Użytkownicy
INSERT INTO users (email, password_hash, name, role, is_active) VALUES 
('admin@eltron.pl', '$2a$10$X...', 'Administrator', 'zarząd', true),
('sprzedaz1@eltron.pl', '$2a$10$X...', 'Jan Kowalski', 'handlowiec', true);

