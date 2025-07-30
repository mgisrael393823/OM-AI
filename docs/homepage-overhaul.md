# OM-Analyzer Homepage Content Overhaul Strategy

## 🎯 Hero Section Overhaul

**Headline:** "Analyze Offering Memorandums in Minutes, Not Hours"  
**Subheadline:** "AI-powered CRE analysis that extracts key metrics, evaluates deals, and answers complex questions instantly"  
**CTA Button:** "Start Free 7-Day Trial"  
**Secondary CTA:** "Watch 2-Min Demo"  
**Trust Bar:** "Trusted by 2,000+ CRE professionals | 50,000+ OMs analyzed | SOC 2 Compliant"

**Claude Code Prompt:**
```
Update the hero section with:
- Bold headline (text-5xl or text-6xl)
- Subheadline (text-xl, muted)
- CTA: "Start Free 7-Day Trial" → /auth/register
- Secondary CTA: "Watch Demo"
- Trust bar below CTAs with usage stats
```

---

## 📊 How It Works Section

**Title:** "From Upload to Insights in 3 Simple Steps"  
**Steps:**
1. Upload Your OM — Drag & drop any PDF, Word, or Excel file.  
2. AI Extracts Everything — 50+ metrics extracted instantly.  
3. Ask Anything — Get detailed answers with source citations.

**Claude Code Prompt:**
```
Create 3-column grid (stack on mobile):
- Icons: Upload, Sparkles, MessageCircle (lucide-react)
- Descriptions styled with subtle card backgrounds
- Large icons (w-12 h-12), titles bold (font-semibold)
```

---

## 🚀 Features Grid Section

**Title:** "Everything You Need for CRE Deal Analysis"  
**Subtitle:** "Purpose-built for commercial real estate professionals"

**Feature Cards (3x2 grid):**
1. Intelligent Data Extraction  
2. Financial Modeling  
3. Natural Language Analysis  
4. Comp Analysis  
5. Team Collaboration  
6. Professional Reports

**Claude Code Prompt:**
```
Create responsive grid:
- Icons: FileSearch, Calculator, MessageSquare, BarChart3, Users, FileText
- Use primary color for icons
- Add hover effects, subtle borders
```

---

## 💰 ROI Calculator Section

**Title:** "See Your ROI in Seconds"  
**Inputs:**
- OMs per week: 10
- Manual hours per OM: 3
- Hourly rate: $150

**Live Outputs:**
- Time saved/month
- Value of time saved
- ROI on OM-Analyzer

**Claude Code Prompt:**
```
2-column layout:
- Left: Inputs (React state)
- Right: Outputs (calculated live)
Add CTA: "Start Saving Time Today"
```

---

## 👥 Use Cases Section

**Title:** "Built for Every CRE Professional"

**Tabs:**
- Acquisitions: Analyze 20+ deals daily instead of 3-4  
- Brokers: Create compelling investment summaries  
- Asset Managers: Track performance portfolio-wide  
- Lenders: Evaluate risk instantly and speed up approvals

**Claude Code Prompt:**
```
Create tabbed section with:
- Large quote in italics
- Benefits list with checkmark icons
- Icons for each role
```

---

## 💳 Pricing Section

**Title:** "Simple, Transparent Pricing"  
**Subtitle:** "Start free, upgrade when you're ready"

**Plans:**
- Starter: $99/month (10 OMs, email support, basic reports)
- Professional: $299/month (Most Popular, 50 OMs, advanced modeling, 3 users)
- Enterprise: Custom (Unlimited, API, dedicated support)

**Claude Code Prompt:**
```
3-column pricing grid:
- Highlight Professional tier with border/shadow
- Add checkmark icons
- Below grid: "7-day free trial • No credit card required • Cancel anytime"
```

---

## 🚦 Final CTA Section

**Headline:** "Ready to Transform Your Deal Analysis?"  
**Subheadline:** "Join 2,000+ CRE professionals saving hours every week"  
**CTA Button:** "Start Your Free Trial"  
**Secondary text:** "No credit card required • 7-day free trial • Cancel anytime"

**Claude Code Prompt:**
```
Centered section with gradient background
Large headline, muted subheadline
Primary button CTA + small muted assurance text
```

---

## 📱 Footer Enhancement

**Columns:**

**Product:** Features, Pricing, Security, API Docs  
**Company:** About Us, Careers, Blog, Contact  
**Resources:** OM Templates, CRE Glossary, Tutorials, Help Center  
**Legal:** Privacy Policy, Terms of Service, SOC 2 Compliance, Data Security  
**Newsletter Signup:** "Get CRE insights delivered weekly"

**Claude Code Prompt:**
```
4-column responsive layout
Newsletter email input + subscribe CTA at bottom
Links with proper routes and semantic structure
```

---

## 🎨 Additional UI Enhancements

**Claude Code Prompt:**
```
Apply polish site-wide:
1. Add fade-in on scroll, hover effects, and smooth transitions
2. Add security trust badges (SOC 2, 256-bit encryption, G2)
3. Floating "See Demo" button, bottom-right
4. Touch-friendly buttons (min 44px), readable fonts
5. Loading states (skeleton screens for dynamic content)
```

This file now serves as the implementation masterplan for the homepage overhaul.