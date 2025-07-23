const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

// Read environment variables from .env.local
const envContent = fs.readFileSync('.env.local', 'utf8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=')
  if (key && value) {
    envVars[key] = value.replace(/"/g, '')
  }
})

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

async function setupStorage() {
  try {
    console.log('Setting up Supabase Storage...')
    
    // Create documents bucket
    const { data, error } = await supabase
      .storage
      .createBucket('documents', {
        public: false,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['application/pdf']
      })

    if (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ Documents bucket already exists')
      } else {
        throw error
      }
    } else {
      console.log('✅ Documents bucket created successfully')
    }

    // Check bucket exists and is configured
    const { data: buckets, error: listError } = await supabase
      .storage
      .listBuckets()
    
    if (listError) throw listError
    
    const documentsBucket = buckets.find(b => b.name === 'documents')
    if (documentsBucket) {
      console.log('✅ Documents bucket configured:', {
        name: documentsBucket.name,
        public: documentsBucket.public,
        id: documentsBucket.id
      })
    }

    console.log('\n📝 Next steps:')
    console.log('1. Go to Supabase Dashboard > Storage > Documents bucket')
    console.log('2. Configure RLS policies for user access')
    console.log('3. Test file upload through the app')

  } catch (error) {
    console.error('❌ Error setting up storage:', error.message)
  }
}

setupStorage()