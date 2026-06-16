export type PersonNameParts = {
  nameEnglish: string;
  nameNepali?: string | null;
  salutation?: string | null;
};

/** The name we show in lists — prefers Nepali, falls back to English. */
export function personDisplayName(p: PersonNameParts): string {
  const nepali = p.nameNepali?.trim();
  return nepali && nepali.length > 0 ? nepali : p.nameEnglish.trim();
}

/**
 * The default text printed on an invitation for a person: salutation +
 * (Nepali or English) name. Used when first attaching a person to a card; can
 * be overridden per invitation afterwards.
 */
export function guestDefaultText(p: PersonNameParts): string {
  const base = personDisplayName(p);
  const sal = p.salutation?.trim();
  return sal && sal.length > 0 ? `${sal} ${base}` : base;
}
