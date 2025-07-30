import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import {
  Settings,
  User,
  Brain,
  Palette,
  Shield,
  CreditCard,
  Save,
  ArrowLeft
} from 'lucide-react'
import { componentTypography, typography } from '@/lib/typography'

interface UserSettings {
  // Profile
  fullName: string
  email: string
  avatarUrl?: string
  
  // AI Preferences
  preferredModel: string
  temperature: number
  maxTokens: number
  
  // Display Preferences
  theme: 'light' | 'dark' | 'system'
  language: string
  
  // Notifications
  emailNotifications: boolean
  pushNotifications: boolean
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [settings, setSettings] = useState<UserSettings>({
    fullName: '',
    email: '',
    preferredModel: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 4000,
    theme: 'system',
    language: 'en',
    emailNotifications: true,
    pushNotifications: false
  })
  const [isSaving, setIsSaving] = useState(false)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [loading, user, router])

  // Load user settings from API
  useEffect(() => {
    if (user && profile) {
      loadSettings();
    }
  }, [user, profile]);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const preferences = data.preferences;
        
        setSettings({
          fullName: profile?.full_name || '',
          email: user?.email || '',
          preferredModel: preferences.ai?.preferredModel || 'gpt-4-turbo-preview',
          temperature: preferences.ai?.temperature || 0.7,
          maxTokens: preferences.ai?.maxTokens || 4000,
          theme: preferences.display?.theme || 'system',
          language: preferences.display?.language || 'en',
          emailNotifications: preferences.notifications?.email ?? true,
          pushNotifications: preferences.notifications?.push ?? false
        });
      } else {
        // Fall back to defaults if API fails
        setSettings({
          fullName: profile?.full_name || '',
          email: user?.email || '',
          preferredModel: 'gpt-4-turbo-preview',
          temperature: 0.7,
          maxTokens: 4000,
          theme: 'system',
          language: 'en',
          emailNotifications: true,
          pushNotifications: false
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Use defaults on error
      setSettings({
        fullName: profile?.full_name || '',
        email: user?.email || '',
        preferredModel: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 4000,
        theme: 'system',
        language: 'en',
        emailNotifications: true,
        pushNotifications: false
      });
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Prepare preferences payload
      const preferences = {
        ai: {
          preferredModel: settings.preferredModel,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens
        },
        display: {
          theme: settings.theme,
          language: settings.language
        },
        notifications: {
          email: settings.emailNotifications,
          push: settings.pushNotifications
        }
      };

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences)
      });

      if (response.ok) {
        toast.success('Settings saved successfully!');
      } else {
        const errorData = await response.json();
        toast.error(`Failed to save settings: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Settings save error:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Settings - OM AI</title>
        <meta name="description" content="Manage your account settings and preferences" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className={`text-gray-900 dark:text-white ${typography.pageTitle}`}>Settings</h1>
              <p className={`text-gray-600 dark:text-gray-400 ${typography.body}`}>Manage your account and preferences</p>
            </div>
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile" className={`flex items-center gap-2 ${componentTypography.button.secondary}`}>
                <User className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="ai" className={`flex items-center gap-2 ${componentTypography.button.secondary}`}>
                <Brain className="h-4 w-4" />
                AI Preferences
              </TabsTrigger>
              <TabsTrigger value="display" className={`flex items-center gap-2 ${componentTypography.button.secondary}`}>
                <Palette className="h-4 w-4" />
                Display
              </TabsTrigger>
              <TabsTrigger value="account" className={`flex items-center gap-2 ${componentTypography.button.secondary}`}>
                <Shield className="h-4 w-4" />
                Account
              </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className={componentTypography.card.title}>Profile Information</CardTitle>
                  <CardDescription className={componentTypography.card.subtitle}>
                    Update your personal information and profile settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-6">
                    <Avatar className="h-20 w-20">
                      <AvatarFallback className="bg-blue-100 text-blue-600 text-lg">
                        {settings.fullName.split(' ').map((n: string) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <Button variant="outline" size="sm" className={componentTypography.button.secondary}>
                        Change Avatar
                      </Button>
                      <p className={`text-gray-500 mt-1 ${typography.bodySmall}`}>
                        JPG, GIF or PNG. 1MB max.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className={componentTypography.form.label}>Full Name</Label>
                      <Input
                        id="fullName"
                        value={settings.fullName}
                        onChange={(e) => setSettings({ ...settings, fullName: e.target.value })}
                        className={componentTypography.form.input}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className={componentTypography.form.label}>Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={settings.email}
                        disabled
                        className={`bg-gray-50 dark:bg-gray-800 ${componentTypography.form.input}`}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className={componentTypography.form.label}>Subscription</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant={profile?.subscription_tier === 'starter' ? 'secondary' : 'default'} className={typography.label}>
                        {profile?.subscription_tier?.toUpperCase() || 'STARTER'}
                      </Badge>
                      <span className={`text-gray-500 ${typography.bodySmall}`}>
                        {profile?.usage_count || 0} / {profile?.usage_limit || 10} documents this month
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Preferences Tab */}
            <TabsContent value="ai" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className={componentTypography.card.title}>AI Model Settings</CardTitle>
                  <CardDescription className={componentTypography.card.subtitle}>
                    Configure how the AI responds to your queries
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="model" className={componentTypography.form.label}>Preferred Model</Label>
                    <Select
                      value={settings.preferredModel}
                      onValueChange={(value) => setSettings({ ...settings, preferredModel: value })}
                    >
                      <SelectTrigger className={componentTypography.form.input}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4-turbo-preview" className={componentTypography.form.input}>GPT-4 Turbo (Recommended)</SelectItem>
                        <SelectItem value="gpt-4" className={componentTypography.form.input}>GPT-4</SelectItem>
                        <SelectItem value="gpt-3.5-turbo" className={componentTypography.form.input}>GPT-3.5 Turbo (Faster)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className={componentTypography.form.label}>Temperature: {settings.temperature}</Label>
                    <Slider
                      value={[settings.temperature]}
                      onValueChange={([value]) => setSettings({ ...settings, temperature: value })}
                      max={1}
                      min={0}
                      step={0.1}
                      className="w-full"
                    />
                    <p className={`text-gray-500 ${typography.bodySmall}`}>
                      Lower values make responses more focused, higher values more creative
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className={componentTypography.form.label}>Max Tokens: {settings.maxTokens}</Label>
                    <Slider
                      value={[settings.maxTokens]}
                      onValueChange={([value]) => setSettings({ ...settings, maxTokens: value })}
                      max={8000}
                      min={1000}
                      step={500}
                      className="w-full"
                    />
                    <p className={`text-gray-500 ${typography.bodySmall}`}>
                      Maximum length of AI responses (higher = longer responses, more cost)
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Display Tab */}
            <TabsContent value="display" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className={componentTypography.card.title}>Display Preferences</CardTitle>
                  <CardDescription className={componentTypography.card.subtitle}>
                    Customize how the application looks and feels
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className={componentTypography.form.label}>Theme</Label>
                    <Select
                      value={settings.theme}
                      onValueChange={(value: 'light' | 'dark' | 'system') => setSettings({ ...settings, theme: value })}
                    >
                      <SelectTrigger className={componentTypography.form.input}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system" className={componentTypography.form.input}>System Default</SelectItem>
                        <SelectItem value="light" className={componentTypography.form.input}>Light</SelectItem>
                        <SelectItem value="dark" className={componentTypography.form.input}>Dark</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className={componentTypography.form.label}>Language</Label>
                    <Select
                      value={settings.language}
                      onValueChange={(value) => setSettings({ ...settings, language: value })}
                    >
                      <SelectTrigger className={componentTypography.form.input}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en" className={componentTypography.form.input}>English</SelectItem>
                        <SelectItem value="es" className={componentTypography.form.input}>Spanish</SelectItem>
                        <SelectItem value="fr" className={componentTypography.form.input}>French</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className={componentTypography.form.label}>Email Notifications</Label>
                        <p className={`text-gray-500 ${typography.bodySmall}`}>
                          Get notified about important updates
                        </p>
                      </div>
                      <Switch
                        checked={settings.emailNotifications}
                        onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className={componentTypography.form.label}>Push Notifications</Label>
                        <p className={`text-gray-500 ${typography.bodySmall}`}>
                          Get real-time notifications in your browser
                        </p>
                      </div>
                      <Switch
                        checked={settings.pushNotifications}
                        onCheckedChange={(checked) => setSettings({ ...settings, pushNotifications: checked })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Account Tab */}
            <TabsContent value="account" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className={componentTypography.card.title}>Account Security</CardTitle>
                  <CardDescription className={componentTypography.card.subtitle}>
                    Manage your account security and data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Button variant="outline" className={componentTypography.button.secondary}>
                    Change Password
                  </Button>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className={`text-red-600 ${typography.subsectionHeader}`}>Danger Zone</h4>
                    <div className="border border-red-200 rounded-lg p-4 space-y-4">
                      <div>
                        <h5 className={typography.subsectionHeader}>Export Data</h5>
                        <p className={`text-gray-500 mb-2 ${typography.bodySmall}`}>
                          Download all your data including documents and chat history
                        </p>
                        <Button variant="outline" size="sm" className={componentTypography.button.secondary}>
                          Export Data
                        </Button>
                      </div>
                      
                      <div>
                        <h5 className={`text-red-600 ${typography.subsectionHeader}`}>Delete Account</h5>
                        <p className={`text-gray-500 mb-2 ${typography.bodySmall}`}>
                          Permanently delete your account and all associated data
                        </p>
                        <Button variant="destructive" size="sm" className={componentTypography.button.primary}>
                          Delete Account
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <div className="flex justify-end pt-6">
            <Button onClick={handleSave} disabled={isSaving} className={componentTypography.button.primary}>
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}