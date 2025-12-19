
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export function validatePassword(password: string): boolean {
    return password.length >= 8;
}

export interface OfferItemInput {
    product_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    vat_rate: number;
    net_amount: number;
    vat_amount: number;
    gross_amount: number;
    cost_price?: number;
    margin_percent?: number;
    discount_percent?: number;
    original_price?: number;
}

export interface CreateOfferInput {
    client_name: string;
    client_email?: string;
    client_phone?: string;
    delivery_days: number;
    valid_days: number;
    items: OfferItemInput[];
    total_net: number;
    total_vat: number;
    total_gross: number;
    status: string;
}

export function validateCreateOffer(data: any): ValidationResult {
    const errors: string[] = [];

    if (!data.client_name || typeof data.client_name !== 'string') {
        errors.push('Nazwa klienta jest wymagana');
    }

    if (typeof data.delivery_days !== 'number' || data.delivery_days < 0) {
        errors.push('Nieprawidłowy czas dostawy');
    }

    if (typeof data.valid_days !== 'number' || data.valid_days < 0) {
        errors.push('Nieprawidłowy czas ważności oferty');
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
        errors.push('Oferta musi zawierać przynajmniej jedną pozycję');
    } else {
        data.items.forEach((item: any, index: number) => {
            if (!item.product_name) errors.push(`Pozycja ${index + 1}: Brak nazwy produktu`);
            if (typeof item.quantity !== 'number' || item.quantity <= 0) errors.push(`Pozycja ${index + 1}: Nieprawidłowa ilość`);
            if (typeof item.unit_price !== 'number' || item.unit_price < 0) errors.push(`Pozycja ${index + 1}: Nieprawidłowa cena`);
            if (!item.unit) errors.push(`Pozycja ${index + 1}: Brak jednostki`);
        });
    }

    if (typeof data.total_gross !== 'number') {
        errors.push('Nieprawidłowa suma brutto');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}
