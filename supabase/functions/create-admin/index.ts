import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const authEmail = (username: string) =>
  `account-${username.trim().toLowerCase()}@school-auth.invalid`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const setupCode = Deno.env.get('ADMIN_SETUP_CODE')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')

  if (!setupCode || !serviceKey || !supabaseUrl) {
    return json({ error: 'ระบบผู้ดูแลยังตั้งค่าไม่ครบ: ADMIN_SETUP_CODE หรือ Supabase secret หาย' }, 500)
  }

  let body: any
  try { body = await req.json() } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400) }

  const username = String(body.username || '').trim()
  const name = String(body.name || '').trim()
  const password = String(body.password || '')
  const providedCode = String(body.setup_code || '')

  if (providedCode !== setupCode) return json({ error: 'รหัสเปิดสมัครผู้ดูแลไม่ถูกต้อง' }, 403)
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(username)) return json({ error: 'Username ไม่ถูกต้อง' }, 400)
  if (name.length < 2 || name.length > 100) return json({ error: 'ชื่อผู้ดูแลไม่ถูกต้อง' }, 400)
  if (password.length < 8 || password.length > 72) return json({ error: 'รหัสผ่านต้องมี 8-72 ตัวอักษร' }, 400)

  const adminClient = createClient(supabaseUrl, serviceKey)
  const studentId = `ADMIN_${username.toUpperCase()}`
  const email = authEmail(username)

  const { data: existing } = await adminClient
    .from('profiles')
    .select('id')
    .or(`student_id.eq.${studentId},email.eq.${email}`)
    .maybeSingle()

  if (existing) return json({ error: 'Username นี้มีอยู่แล้ว' }, 409)

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, name, role: 'admin' },
  })

  if (createError || !created.user) {
    return json({ error: createError?.message || 'สร้างบัญชีไม่สำเร็จ' }, 400)
  }

  const { error: profileError } = await adminClient.from('profiles').insert({
    id: created.user.id,
    student_id: studentId,
    name,
    role: 'admin',
    classroom: 'ผู้ดูแลระบบ',
    email,
  })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id)
    return json({ error: profileError.message }, 400)
  }

  return json({ ok: true, username, student_id: studentId })
})
