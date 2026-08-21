import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const authEmail = (studentId: string) => `account-${studentId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}@school-auth.invalid`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'Unauthorized' }, 401)

  const adminClient = createClient(supabaseUrl, serviceKey)
  const { data: adminProfile, error: adminError } = await adminClient
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (adminError || adminProfile?.role !== 'admin') return json({ error: 'Admin only' }, 403)

  const body = await req.json()
  const studentId = String(body.student_id || '').trim()
  const name = String(body.name || '').trim()
  const classroom = String(body.classroom || '').trim()
  const password = String(body.password || '')
  if (!/^\\d{5}$/.test(studentId) || !name || !classroom || password.length < 6) {
    return json({ error: 'ข้อมูลไม่ครบ หรือรหัสนักเรียน/รหัสผ่านไม่ถูกต้อง' }, 400)
  }

  const { data: existing } = await adminClient.from('profiles').select('id').eq('student_id', studentId).maybeSingle()
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
