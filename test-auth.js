const { createClient } = require('@supabase/supabase-js')

async function testAuth() {
  const supabase = createClient(
    'https://dewhycvbsaueixiimwow.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2h5Y3Zic2F1ZWl4aWltd293Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzIyMjAwMywiZXhwIjoyMDY4Nzk4MDAzfQ.5UYy8XP0y1jvLeuPujSqES9ap2NdJvBiNnNn2yFCwy0'
  )
  
  // Test with anon key token
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2h5Y3Zic2F1ZWl4aWltd293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjIwMDMsImV4cCI6MjA2ODc5ODAwM30.MO3MBRbwzVdPR6uTetuFLP6xheMtftl5O4Mhasxslkc'
  
  try {
    console.log('Testing auth with token...')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error) {
      console.error('Auth error:', error)
    } else if (!user) {
      console.log('No user found')
    } else {
      console.log('User found:', user.id)
    }
  } catch (err) {
    console.error('Unexpected error:', err)
  }
}

testAuth()