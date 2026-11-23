/**
 * Soporte por WhatsApp (23/11/2026). ÚNICO lugar donde se define el número.
 *
 * El número actual es FICTICIO y solo sirve como marcador. Cuando IMC entregue el número oficial:
 *   1. reemplaza `whatsappNumber` (solo dígitos, con código de país, sin «+»);
 *   2. cambia `provisional` a `false` para quitar el aviso «provisional» del botón.
 */
export const SUPPORT_CONFIG = {
  whatsappNumber: '51123456789',
  provisional: true,
} as const;

export const supportWhatsappUrl = (): string => `https://wa.me/${SUPPORT_CONFIG.whatsappNumber}`;
