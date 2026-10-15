export function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0,00';
  
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  
  const parts = absNum.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decPart = parts[1];
  
  return `${isNegative ? '-' : ''}$${intPart},${decPart}`;
}

/**
 * Parsea fechas de forma segura para navegadores móviles (iOS Safari / Android Chrome)
 */
function parseSafeDate(dateString: string): Date {
  if (!dateString) return new Date();
  // Asegurar formato ISO compatible con Safari si viene como "YYYY-MM-DD HH:mm:ss"
  const normalized = dateString.includes(' ') && !dateString.includes('T')
    ? dateString.replace(' ', 'T')
    : dateString;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function formatDate(dateString: string): string {
  try {
    const d = parseSafeDate(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return dateString;
  }
}

export function formatDateShort(dateString: string): string {
  try {
    const d = parseSafeDate(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  } catch {
    return dateString;
  }
}

export function timeAgo(dateString: string): string {
  try {
    const now = new Date();
    const past = parseSafeDate(dateString);
    const diffMs = now.getTime() - past.getTime();

    // Si la anotación es reciente o hay leves desfasajes de segundos
    if (diffMs < 60000) return 'Hace instantes';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} d`;
    return formatDateShort(dateString);
  } catch {
    return '';
  }
}

/**
 * Normaliza y formatea números telefónicos para WhatsApp Argentina (+54).
 * Siempre antepone el código de país +54 y asegura el formato de telefonía móvil.
 */
export function normalizeArgentinePhone(phone?: string | null): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Quitar 0 inicial si el usuario lo escribió (ej: 011 -> 11)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // Si no tiene el 54 de Argentina, agregarlo
  if (!cleaned.startsWith('54')) {
    cleaned = '54' + cleaned;
  }

  // En WhatsApp Argentina los celulares llevan '9' luego del 54 (549...)
  if (cleaned.startsWith('54') && !cleaned.startsWith('549')) {
    cleaned = '549' + cleaned.substring(2);
  }

  const codPais = '+54';
  const rest = cleaned.substring(3); // después de 549
  
  if (rest.length === 10) {
    // Formato AMBA/Capital: 11 XXXX-XXXX o interior (ej: 351 XXX-XXXX)
    const area = rest.substring(0, 2);
    const num1 = rest.substring(2, 6);
    const num2 = rest.substring(6);
    return `${codPais} 9 ${area} ${num1}-${num2}`;
  } else if (rest.length > 5) {
    const area = rest.substring(0, 3);
    const num = rest.substring(3);
    return `${codPais} 9 ${area} ${num}`;
  }

  return `${codPais} 9 ${rest}`;
}

/**
 * Obtiene los dígitos limpios para el protocolo wa.me/ en Argentina (549...).
 */
export function getWhatsAppCleanNumber(phone?: string | null): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  if (!digits.startsWith('54')) {
    digits = '549' + digits;
  } else if (!digits.startsWith('549')) {
    digits = '549' + digits.substring(2);
  }

  return digits;
}
