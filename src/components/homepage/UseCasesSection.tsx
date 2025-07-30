import React, { useState } from 'react'
import { Building, TrendingUp, Users, Banknote, ChevronRight } from 'lucide-react'
import { typography, componentTypography } from '@/lib/typography'
import { cn } from '@/lib/utils'

const useCases = [
  {
    id: 'acquisitions',
    title: 'Acquisitions Analysts',
    icon: Building,
    benefits: [
      'Instantly extract key financial metrics and assumptions',
      'Compare multiple deals side-by-side with AI analysis',
      'Identify red flags and opportunities faster',
      'Generate investment committee memos in minutes'
    ],
    workflow: 'Upload OM → Extract metrics → Analyze assumptions → Generate IC memo'
  },
  {
    id: 'asset-managers',
    title: 'Asset Managers',
    icon: TrendingUp,
    benefits: [
      'Track portfolio performance against OM projections',
      'Analyze operating agreements and waterfall structures',
      'Monitor covenant compliance across properties',
      'Generate quarterly investor reports automatically'
    ],
    workflow: 'Upload documents → Track performance → Monitor compliance → Report to LPs'
  },
  {
    id: 'brokers',
    title: 'Brokers',
    icon: Users,
    benefits: [
      'Quickly understand deal highlights for client calls',
      'Create compelling property summaries',
      'Answer buyer questions instantly with AI search',
      'Track buyer interest and engagement metrics'
    ],
    workflow: 'Upload listing → Generate summary → Share with buyers → Track engagement'
  },
  {
    id: 'lenders',
    title: 'Lenders',
    icon: Banknote,
    benefits: [
      'Assess debt service coverage and loan metrics',
      'Analyze property cash flows and assumptions',
      'Review borrower track record and experience',
      'Generate loan committee packages efficiently'
    ],
    workflow: 'Upload OM → Analyze DSCR → Review assumptions → Create loan package'
  }
]

export function UseCasesSection() {
  const [activeTab, setActiveTab] = useState('acquisitions')
  const activeCase = useCases.find(c => c.id === activeTab)!

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className={cn('tracking-tight text-slate-900 dark:text-white mb-4', typography.sectionHeader)}>
              Built for Every CRE Professional
            </h2>
            <p className={cn('text-slate-600 dark:text-slate-300', typography.bodyLarge)}>
              See how OM Intel Chat transforms workflows across the industry
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {useCases.map((useCase) => {
              const Icon = useCase.icon
              return (
                <button
                  key={useCase.id}
                  onClick={() => setActiveTab(useCase.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors',
                    activeTab === useCase.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                    componentTypography.button.secondary
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm sm:text-base">{useCase.title}</span>
                </button>
              )
            })}
          </div>

          {/* Active Tab Content */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
            <div className="grid md:grid-cols-2 gap-6 md:gap-8">
              {/* Benefits */}
              <div>
                <h3 className={cn('text-slate-900 dark:text-white mb-6', componentTypography.card.title)}>
                  Key Benefits
                </h3>
                <ul className="space-y-4">
                  {activeCase.benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <ChevronRight className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className={cn('text-slate-700 dark:text-slate-300', typography.body)}>
                        {benefit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Workflow */}
              <div>
                <h3 className={cn('text-slate-900 dark:text-white mb-6', componentTypography.card.title)}>
                  Typical Workflow
                </h3>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 sm:p-6">
                  <p className={cn('text-slate-700 dark:text-slate-300', typography.body)}>
                    {activeCase.workflow}
                  </p>
                  
                  <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <p className={cn('text-primary font-semibold mb-2', typography.strong)}>
                      Time Saved: 75%+
                    </p>
                    <p className={cn('text-slate-600 dark:text-slate-400', typography.bodySmall)}>
                      What used to take hours now takes minutes
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <a 
                href="/auth/register" 
                className={cn('inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-primary/90 transition-colors', componentTypography.button.primary)}
              >
                Start Your Free Trial →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}