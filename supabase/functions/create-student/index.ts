import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const authEmail = (studentId: string) =>
  `account-${studentId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}@school-auth.invalid`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceKey)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400) }

  const studentId = String(body.student_id || '').trim()
  const name = String(body.name || '').trim()
  const classroom = String(body.classroom || '').trim()
  const password = String(body.password || '')

  // Public self-registration: students may create only student accounts.
  // No email is requested; an internal non-deliverable identifier is used only by Supabase Auth.
  if (!/^\d{5}$/.test(studentId) || name.length < 2 || classroom.length < 1 || password.length < 6 || password.length > 72) {
    return json({ error: 'กรุณากรอกข้อมูลให้ถูกต้อง: รหัสนักเรียน 5 หลัก และรหัสผ่าน 6-72 ตัวอักษร' }, 400)
  }

  const { data: existing } = await adminClient
    .from('profiles')
    .select('id')
    .eq('student_id', studentId)
    .maybeSingle()
  if (existing) return json({ error: 'รหัสนักเรียนนี้มีอยู่แล้ว' }, 409)

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: authEmail(studentId),
    password,
    email_confirm: true,
    user_metadata: { student_id: studentId, name, classroom, role: 'student' },
  })
  if (createError || !created.user) return json({ error: createError?.message || 'สร้างบัญชีไม่สำเร็จ' }, 400)

  const { error: profileError } = await adminClient.from('profiles').insert({
    id: created.user.id,
    student_id: studentId,
    name,
    classroom,
    role: 'student',
    email: authEmail(studentId),
  })
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id)
    return json({ error: profileError.message }, 400)
  }

  return json({ ok: true, student_id: studentId })
})
