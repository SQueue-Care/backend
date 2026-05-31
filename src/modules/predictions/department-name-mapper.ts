/**
 * Maps internal department names (stored in DB) to the nama_poli values
 * accepted by the SmartQueue AI FastAPI service.
 *
 * FastAPI supported values:
 * Anak, Poli Anak, Gigi, Poli Gigi, Jantung, Poli Jantung,
 * Mata, Poli Mata, Penyakit Dalam, Poli Penyakit Dalam, Umum, Poli Umum
 */
const DEPT_NAME_MAP: Record<string, string> = {
  // Anak
  anak: "Poli Anak",
  "poli anak": "Poli Anak",
  "kesehatan anak": "Poli Anak",
  pediatri: "Poli Anak",
  pediatrics: "Poli Anak",

  // Gigi
  gigi: "Poli Gigi",
  "poli gigi": "Poli Gigi",
  "gigi dan mulut": "Poli Gigi",
  dental: "Poli Gigi",
  dentistry: "Poli Gigi",

  // Jantung
  jantung: "Poli Jantung",
  "poli jantung": "Poli Jantung",
  kardiologi: "Poli Jantung",
  cardiology: "Poli Jantung",
  "jantung dan pembuluh darah": "Poli Jantung",

  // Mata
  mata: "Poli Mata",
  "poli mata": "Poli Mata",
  oftalmologi: "Poli Mata",
  ophthalmology: "Poli Mata",

  // Penyakit Dalam
  "penyakit dalam": "Penyakit Dalam",
  "poli penyakit dalam": "Penyakit Dalam",
  interna: "Penyakit Dalam",
  "internal medicine": "Penyakit Dalam",

  // Umum
  umum: "Poli Umum",
  "poli umum": "Poli Umum",
  "pelayanan umum": "Poli Umum",
  "general practice": "Poli Umum",
};

const FALLBACK_POLI = "Poli Umum";

/**
 * Maps a department name from the database to the accepted nama_poli value
 * for the SmartQueue AI FastAPI service. Falls back to "Poli Umum" if
 * the department name is not recognized.
 */
export function mapDepartmentName(name: string): string {
  const normalized = name.toLowerCase().trim();
  return DEPT_NAME_MAP[normalized] ?? FALLBACK_POLI;
}
