import { supabase } from './supabase'

export async function searchStudents(query) {
  const q = (query || '').trim()
  if (q.length < 2) return []
  const { data } = await supabase
    .from('students')
    .select('id, first_name, last_name, full_name, photo_file')
    .ilike('full_name', `%${q}%`)
    .order('full_name')
    .limit(30)
  // students has one row per (student, period) — dedupe by id before returning
  const seen = new Set()
  const unique = []
  for (const s of data || []) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    unique.push(s)
    if (unique.length >= 8) break
  }
  return unique
}

export async function getStudentPhotoUrl(photoFile) {
  if (!photoFile) return null
  const { data } = await supabase.storage
    .from('student-photos')
    .createSignedUrl(photoFile, 300)
  return data?.signedUrl || null
}
