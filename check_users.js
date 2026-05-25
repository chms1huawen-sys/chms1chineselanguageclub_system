import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xvzxewqeadppzsbczfak.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2enhld3FlYWRwcHpzYmN6ZmFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MDU0OTksImV4cCI6MjA5NTE4MTQ5OX0.Fo0eH2Kt8q-qBJSf4ry_N3-sRa9CjrjlIHi9COCSbKA'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkUsers() {
  console.log('Querying users table...')
  const { data, error } = await supabase
    .from('users')
    .select('*')
  
  if (error) {
    console.error('Error fetching users:', error)
  } else {
    console.log('Users in database:', JSON.stringify(data, null, 2))
  }
}

checkUsers()
