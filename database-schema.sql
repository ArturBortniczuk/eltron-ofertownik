-- Schema bazy danych dla Neon PostgreSQL
-- Wykonaj te komendy w konsoli Neon

-- Tabela użytkowników (handlowców)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
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
    used_by INTEGER REFERENCES users(id),
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    position_order INTEGER DEFAULT 1
);

-- Indeksy dla lepszej wydajności
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('polish', name));
CREATE INDEX idx_offers_created_at ON offers(created_at);
CREATE INDEX idx_offers_user_id ON offers(user_id);
CREATE INDEX idx_offers_client_id ON offers(client_id);
CREATE INDEX idx_clients_created_by ON clients(created_by);
CREATE INDEX idx_product_prices_product_id ON product_prices(product_id);
CREATE INDEX idx_offer_items_offer_id ON offer_items(offer_id);

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
DELETE FROM offer_items;
DELETE FROM offers;
DELETE FROM clients;
DELETE FROM product_prices;
DELETE FROM products;
DELETE FROM users;

-- Użytkownicy z prostymi hasłami (DO ZMIANY W PRODUKCJI!)
INSERT INTO users (email, password_hash, name) VALUES 
('admin@eltron.pl', 'admin123', 'Administrator'),
('sprzedaz1@eltron.pl', 'sprzedaz123', 'Jan Kowalski'),
('sprzedaz2@eltron.pl', 'sprzedaz123', 'Anna Nowak');

-- Przykładowi klienci
INSERT INTO clients (name, email, phone, address, nip, contact_person, created_by) VALUES 
('ABC Elektro Sp. z o.o.', 'zamowienia@abc-elektro.pl', '+48 22 123 45 67', 'ul. Przemysłowa 15
02-456 Warszawa', '1234567890', 'Marek Kowalczyk', 1),
('Instalacje XYZ', 'biuro@instalacje-xyz.pl', '+48 61 987 65 43', 'ul. Elektryczna 8
60-123 Poznań', '0987654321', 'Anna Wiśniewska', 1),
('Technika Nowoczesna', 'info@technika-nowoczesna.pl', '+48 12 555 44 33', 'al. Techniczna 22
30-789 Kraków', '1122334455', 'Piotr Nowak', 2);

-- Przykładowe produkty z załączonych obrazów
INSERT INTO products (name, unit, created_by) VALUES 
('WYŁĄCZNIK NADPRĄDOWY FB1-63 1P B 6A 6kA', 'szt', 1),
('Przewód LgY 1,5 (H07V-K) żółto-zielony', 'm', 1),
('Tulejka kablowa izolowana czarna (100 szt)', 'opak', 1),
('RURA GIĘTKA KARBOWANA 18/13.5 CAŁA', 'm', 1),
('RURA GIĘTKA KARBOWANA 22/18 Z POLIETYLENU', 'm', 1),
('Przewód OMY 3x0,5 (H03VV-F)', 'm', 1),
('Przewód LgY 1,5 (H07V-K) czarny', 'm', 1),
('Łącznik jednobiegunowy', 'szt', 2),
('Gniazdo z uziemieniem', 'szt', 2),
('Oprawa LED 18W', 'szt', 2);

-- Przykładowe ceny
INSERT INTO product_prices (product_id, price, used_by) VALUES 
(1, 12.50, 1),
(2, 2.30, 1),
(3, 45.00, 1),
(4, 3.20, 1),
(5, 4.50, 1),
(6, 5.80, 1),
(7, 2.30, 1),
(8, 8.90, 2),
(9, 15.60, 2),
(10, 45.00, 2);
