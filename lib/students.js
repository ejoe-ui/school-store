import { supabase } from './supabase'

export async function searchStudents(query) {
  const q = (query || '').trim()
  if (q.length < 2) return []
  const { data } = await supabase
    .from('students')
    .select('id, first_name, last_name, full_name, photo_file')
    .ilike('full_name', `%${q}%`)
    .order('full_name')
    .limit(8)
  return data || []
}

export async function getStudentPhotoUrl(photoFile) {
  if (!photoFile) return null
  const { data } = await supabase.storage
    .from('student-photos')
    .createSignedUrl(photoFile, 300)
  return data?.signedUrl || null
}
