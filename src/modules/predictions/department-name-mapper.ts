/**
 * Maps internal department names (stored in DB) to nama_poli values
 * accepted by SmartQueue AI API v5.
 *
 * Valid values: anak, gigi, jantung, kandungan, penyakit dalam, umum
 */
const DEPT_NAME_MAP: Record<string, string> = {
  // Anak
  anak: "anak",
  "poli anak": "anak",
  "kesehatan anak": "anak",
  pediatri: "anak",
  pediatrics: "anak",

  // Gigi
  gigi: "gigi",
  "poli gigi": "gigi",
  "gigi dan mulut": "gigi",
  dental: "gigi",
  dentistry: "gigi",

  // Jantung
  jantung: "jantung",
  "poli jantung": "jantung",
  kardiologi: "jantung",
  cardiology: "jantung",
  "jantung dan pembuluh darah": "jantung",

  // Kandungan / OBGYN
  kandungan: "kandungan",
  "poli kandungan": "kandungan",
  kebidanan: "kandungan",
  obgyn: "kandungan",
  "obstetri dan ginekologi": "kandungan",
  "obstetri ginekologi": "kandungan",

  // Penyakit Dalam
  "penyakit dalam": "penyakit dalam",
  "poli penyakit dalam": "penyakit dalam",
  interna: "penyakit dalam",
  "internal medicine": "penyakit dalam",

  // Umum (fallback for general practice and unmapped specialties e.g. mata)
  umum: "umum",
  "poli umum": "umum",
  "pelayanan umum": "umum",
  "general practice": "umum",
  mata: "umum",
  "poli mata": "umum",
  oftalmologi: "umum",
  ophthalmology: "umum",
};

const FALLBACK_POLI = "umum";

/**
 * Maps a department name from the database to the accepted nama_poli value
 * for the SmartQueue AI API. Falls back to "umum" if not recognized.
 */
export function mapDepartmentName(name: string): string {
  const normalized = name.toLowerCase().trim();
  return DEPT_NAME_MAP[normalized] ?? FALLBACK_POLI;
}
