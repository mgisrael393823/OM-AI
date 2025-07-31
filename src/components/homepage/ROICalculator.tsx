import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { Calculator, Clock, DollarSign, TrendingUp } from 'lucide-react'
import { typography, componentTypography } from '@/lib/typography'
import { cn } from '@/lib/utils'

export function ROICalculator() {
  const [dealSize, setDealSize] = useState(10)
  const [currentTime, setCurrentTime] = useState(20)
  const [hourlyRate, setHourlyRate] = useState(150)

  const calculations = useMemo(() => {
    const timeSaved = currentTime * 0.75 // 75% time reduction
    const costSavings = timeSaved * hourlyRate
    const annualSavings = costSavings * dealSize * 12 // Monthly deal volume
    const roi = ((annualSavings - 3588) / 3588) * 100 // Annual Professional plan cost

    return {
      timeSaved: Math.round(timeSaved),
      costSavings: Math.round(costSavings),
      annualSavings: Math.round(annualSavings),
      roi: Math.round(roi)
    }
  }, [dealSize, currentTime, hourlyRate])

  return (
    <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className={cn('tracking-tight text-slate-900 dark:text-white mb-4', typography.sectionHeader)}>
              Calculate Your ROI
            </h2>
            <p className={cn('text-slate-600 dark:text-slate-300', typography.bodyLarge)}>
              See how much time and money you could save with OM Intel Chat
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
            <div className="grid md:grid-cols-2 gap-6 md:gap-8">
              {/* Input Section */}
              <div className="space-y-6">
                <h3 className={cn('text-slate-900 dark:text-white', componentTypography.card.title)}>
                  Your Current Process
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className={cn('text-slate-700 dark:text-slate-300 mb-2 block', componentTypography.form.label)}>
                      Average deals analyzed per month
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={dealSize}
                      onChange={(e) => setDealSize(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-1">
                      <span className={typography.bodySmall}>{dealSize} deals</span>
                    </div>
                  </div>

                  <div>
                    <label className={cn('text-slate-700 dark:text-slate-300 mb-2 block', componentTypography.form.label)}>
                      Hours spent per OM analysis
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="40"
                      value={currentTime}
                      onChange={(e) => setCurrentTime(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-1">
                      <span className={typography.bodySmall}>{currentTime} hours</span>
                    </div>
                  </div>

                  <div>
                    <label className={cn('text-slate-700 dark:text-slate-300 mb-2 block', componentTypography.form.label)}>
                      Team hourly rate
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="500"
                      step="10"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-1">
                      <span className={typography.bodySmall}>${hourlyRate}/hour</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Results Section */}
              <div className="space-y-6">
                <h3 className={cn('text-slate-900 dark:text-white', componentTypography.card.title)}>
                  Your Potential Savings
                </h3>
                
                <div className="space-y-4">
                  <div className="bg-primary/5 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-primary" />
                      <div>
                        <p className={cn('text-slate-600 dark:text-slate-400', typography.bodySmall)}>
                          Time saved per analysis
                        </p>
                        <p className={cn('text-slate-900 dark:text-white', typography.emphasis)}>
                          {calculations.timeSaved} hours
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/5 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-primary" />
                      <div>
                        <p className={cn('text-slate-600 dark:text-slate-400', typography.bodySmall)}>
                          Cost savings per analysis
                        </p>
                        <p className={cn('text-slate-900 dark:text-white', typography.emphasis)}>
                          ${calculations.costSavings.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/5 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      <div>
                        <p className={cn('text-slate-600 dark:text-slate-400', typography.bodySmall)}>
                          Annual savings
                        </p>
                        <p className={cn('text-slate-900 dark:text-white', typography.emphasis)}>
                          ${calculations.annualSavings.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary rounded-lg p-4 text-primary-foreground">
                    <div className="flex items-center gap-3">
                      <Calculator className="w-5 h-5" />
                      <div>
                        <p className={cn('opacity-90', typography.bodySmall)}>
                          Return on Investment
                        </p>
                        <p className={cn('font-bold', typography.emphasis)}>
                          {calculations.roi.toLocaleString()}% ROI
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <p className={cn('text-slate-600 dark:text-slate-400 mb-4', typography.bodySmall)}>
                Based on Professional plan at $299/month
              </p>
              <Link href="/auth/register" className={cn('inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-primary/90 transition-colors', componentTypography.button.primary)}>
                Start Saving Today →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}