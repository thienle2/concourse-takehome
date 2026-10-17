// Addresses in cases.json are one string: "418 Larkspur Ct, Apt 2, Alder Falls" (street, optional
// unit, city). The data has no state or ZIP, so both are invented here.
// PLACEHOLDER: "AD" is a made-up state (not a real US state code), and ZIPs fall in the
// unused 000xx range. Each street name always maps to the same ZIP.

export interface Address {
  /** Street line, including any unit: "418 Larkspur Ct, Apt 2" */
  street: string;
  city: string;
  state: string;
  zip: string;
}

export const PLACEHOLDER_STATE = 'AD';

/** "418 Larkspur Ct, Apt 2" -> "larkspur ct" (drops the house number and unit). */
function streetName(street: string): string {
  return street.split(',')[0].replace(/^\s*\d+[A-Za-z]?\s+/, '').trim().toLowerCase();
}

function placeholderZip(street: string): string {
  let h = 0;
  for (const ch of streetName(street)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `000${String(10 + (h % 90)).padStart(2, '0')}`;
}

export function parseAddress(raw: string): Address {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[parts.length - 1] : '';
  const street = (parts.length > 1 ? parts.slice(0, -1) : parts).join(', ');
  return { street, city, state: PLACEHOLDER_STATE, zip: placeholderZip(street) };
}

/** One line: "418 Larkspur Ct, Apt 2, Alder Falls, AD 00023" */
export function formatAddress(a: Address): string {
  const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a.street, cityLine].filter(Boolean).join(', ');
}

/** "Alder Falls, AD 00023" */
export const cityStateZip = (a: Address) => `${a.city}, ${a.state} ${a.zip}`;
