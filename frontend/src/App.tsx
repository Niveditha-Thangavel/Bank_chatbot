import './index.css'
import { useState } from 'react'
import type React from 'react'

type View = 'chat' | 'rules' | 'history' | 'settings' | 'help'

function App() {
  const [view, setView] = useState<View>('chat')

  return (
    <div className="min-h-screen bg-background text-navy-900">
      <div className="flex h-screen max-h-screen flex-col overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden relative">
          {/* Desktop Sidebar Menu */}
          <MenuBar currentView={view} onNavigate={setView} />
          
          {/* Main Content */}
          {view === 'chat' ? (
            <main className="flex flex-1 overflow-hidden px-2 pb-16 sm:pb-4 pt-2 sm:pt-3 sm:px-4 md:px-6">
              <ChatWindow />
            </main>
          ) : (
            <main className="flex flex-1 overflow-hidden px-2 pb-16 sm:pb-4 pt-2 sm:pt-3 sm:px-4 md:px-6">
              <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col rounded-lg sm:rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 md:p-6 shadow-sm overflow-y-auto">
                {view === 'rules' && <RulesPage />}
                {view === 'history' && <HistoryPage />}
                {view === 'settings' && <SettingsPage />}
                {view === 'help' && <HelpPage />}
              </section>
            </main>
          )}
        </div>
        
        {/* Mobile Bottom Navigation */}
        <MobileMenuBar currentView={view} onNavigate={setView} />
      </div>
    </div>
  )
}

function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-navy-200 bg-white px-3 py-2 sm:px-4 sm:py-3 md:px-6 shadow-sm flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-primary-700 text-xs sm:text-sm font-bold text-white shadow-sm">
          LC
        </div>
        <div className="flex flex-col">
          <span className="text-xs sm:text-sm font-semibold tracking-tight text-navy-900">
            Banking Agent
          </span>
          <span className="hidden sm:block text-xs text-muted">
            Welcome customers, check eligibility, and answer questions
          </span>
        </div>
      </div>
    </header>
  )
}

function MenuBar({
  currentView,
  onNavigate,
}: {
  currentView: View
  onNavigate: (view: View) => void
}) {
  const menuItems = [
    { 
      id: 'chat' as View, 
      label: 'Chat', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    },
    { 
      id: 'history' as View, 
      label: 'History', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    { 
      id: 'rules' as View, 
      label: 'Rules', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    { 
      id: 'settings' as View, 
      label: 'Settings', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    { 
      id: 'help' as View, 
      label: 'Help', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
  ]

  return (
    <aside className="hidden sm:flex w-20 flex-none flex-col border-r border-navy-200 bg-white md:w-56">
      <nav className="flex flex-col gap-1 p-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              currentView === item.id
                ? 'bg-primary-50 text-primary-700 shadow-sm'
                : 'text-navy-600 hover:bg-navy-50 hover:text-navy-900'
            }`}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className="hidden md:inline">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

function MobileMenuBar({
  currentView,
  onNavigate,
}: {
  currentView: View
  onNavigate: (view: View) => void
}) {
  const menuItems = [
    { 
      id: 'chat' as View, 
      label: 'Chat', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    },
    { 
      id: 'history' as View, 
      label: 'History', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    { 
      id: 'rules' as View, 
      label: 'Rules', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    { 
      id: 'settings' as View, 
      label: 'Settings', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    { 
      id: 'help' as View, 
      label: 'Help', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
  ]

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 border-t border-navy-200 bg-white z-50 safe-area-inset-bottom">
      <div className="grid grid-cols-5 h-16">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center justify-center gap-1 transition-all min-h-[44px] ${
              currentView === item.id
                ? 'text-primary-700'
                : 'text-navy-600'
            }`}
            aria-label={item.label}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function ChatWindow() {
  return (
    <section className="flex min-w-0 flex-1 flex-col w-full">
      <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-3 sm:py-3 md:px-4">
        <div className="mx-auto flex max-w-2xl w-full flex-col gap-3 items-start">
          <AIBubble>
            Hi, I&apos;m your Banking Agent. I can welcome customers, check
            loan eligibility, and explain every decision in simple terms.
            <br />
            <br />
            Ask about a loan and I&apos;ll first confirm the customer ID. If
            they are new, I&apos;ll assign one, fetch their bank statements,
            credit card details and loans, run the eligibility rules, and show
            the result.
          </AIBubble>
          <div className="py-2 text-center text-[10px] sm:text-[11px] text-muted w-full">
            Start by asking a question or pasting data here.
          </div>
        </div>
      </div>

      <ChatComposer />
    </section>
  )
}

function AIBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-start gap-2 w-full">
      <div className="max-w-[85%] sm:max-w-xl text-sm sm:text-base text-navy-700 leading-relaxed text-left break-words">
        {children}
      </div>
    </div>
  )
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-end gap-2 w-full">
      <div className="max-w-[85%] sm:max-w-xl rounded-2xl bg-gradient-to-r from-primary-600 to-primary-700 px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-white shadow-sm break-words">
        {children}
      </div>
    </div>
  )
}

function ChatComposer() {
  return (
    <div className="px-2 py-2 sm:px-3 sm:py-2 flex-shrink-0">
      <div className="flex items-end gap-2 rounded-xl sm:rounded-2xl border border-navy-200 bg-white px-2 py-2 sm:px-3 sm:py-2 text-xs sm:text-sm shadow-sm">
        <input
          className="flex-1 border-0 bg-transparent text-xs sm:text-sm text-navy-900 outline-none placeholder:text-muted min-w-0"
          placeholder="Ask to check eligibility, explain the score..."
        />
        <button 
          className="rounded-lg bg-navy-100 p-1.5 sm:px-2 sm:py-1 text-navy-600 hover:bg-navy-200 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          aria-label="Upload file"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </button>
        <button
          aria-label="Send message"
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-sm flex-shrink-0"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function RulesPage() {
  return (
    <>
      <h1 className="text-base sm:text-lg font-semibold text-navy-900">Eligibility rules</h1>
      <p className="mt-1 text-xs sm:text-sm text-muted">
        These are the core checks used by the Banking Agent when running an
        eligibility decision.
      </p>
      <div className="mt-4 space-y-2 text-xs sm:text-sm">
        <p className="font-medium text-navy-800">Examples:</p>
        <ul className="list-disc space-y-1 pl-4 text-navy-600">
          <li>Income stability &ge; 6 months with consistent salary credits.</li>
          <li>Credit utilization ideally below 50% across open credit lines.</li>
          <li>No severe delinquencies (60+ DPD) in the last 12 months.</li>
        </ul>
      </div>
    </>
  )
}

function HistoryPage() {
  return (
    <>
      <h1 className="text-base sm:text-lg font-semibold text-navy-900">Recent decisions</h1>
      <p className="mt-1 text-xs sm:text-sm text-muted">
        A simple overview of past eligibility checks. You can later replace this
        with real data from your backend.
      </p>
      <ul className="mt-4 space-y-2 text-xs sm:text-sm text-navy-600">
        <li className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 rounded-lg border border-navy-200 bg-white p-2 sm:px-3 sm:py-2">
          <span className="font-medium">CUST-102938</span>
          <span className="hidden sm:inline text-muted">·</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-amber-800 inline-flex w-fit">REVIEW</span>
          <span className="hidden sm:inline text-muted">·</span>
          <span>Personal loan</span>
          <span className="hidden sm:inline text-muted">·</span>
          <span className="text-muted">Today</span>
        </li>
        <li className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 rounded-lg border border-navy-200 bg-white p-2 sm:px-3 sm:py-2">
          <span className="font-medium">CUST-948572</span>
          <span className="hidden sm:inline text-muted">·</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-emerald-800 inline-flex w-fit">APPROVE</span>
          <span className="hidden sm:inline text-muted">·</span>
          <span>Credit card</span>
          <span className="hidden sm:inline text-muted">·</span>
          <span className="text-muted">Yesterday</span>
        </li>
      </ul>
    </>
  )
}

function SettingsPage() {
  return (
    <>
      <h1 className="text-base sm:text-lg font-semibold text-navy-900">Settings</h1>
      <p className="mt-1 text-xs sm:text-sm text-muted">
        Configure how the Banking Agent behaves. This is a placeholder
        where you can add real settings (rulesets, thresholds, notification
        options) later.
      </p>
    </>
  )
}

function HelpPage() {
  return (
    <>
      <h1 className="text-base sm:text-lg font-semibold text-navy-900">Help center</h1>
      <p className="mt-1 text-xs sm:text-sm text-muted">
        Brief guidance for analysts using the Banking Agent.
      </p>
      <div className="mt-4 space-y-2 text-xs sm:text-sm text-navy-600">
        <p>Use Chat to welcome customers and answer open questions.</p>
        <p>
          When asked about loan eligibility, the agent will request a customer
          ID, fetch their data, run the rules, and show the result.
        </p>
      </div>
    </>
  )
}

export default App
