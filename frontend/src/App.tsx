import './index.css'
import { useState } from 'react'
import type React from 'react'

type View = 'chat' | 'rules' | 'history' | 'settings' | 'help'

function App() {
  const [view, setView] = useState<View>('chat')

  return (
    <div className="min-h-screen bg-surface text-slate-900">
      <div className="flex h-screen max-h-screen flex-col">
        <TopBar currentView={view} onNavigate={setView} />
        {view === 'chat' ? (
          <main className="flex flex-1 gap-3 overflow-hidden px-3 pb-4 pt-3 md:gap-4 md:px-6">
            <Sidebar />
            <ChatWindow />
            <DecisionPanel />
          </main>
        ) : (
          <main className="flex flex-1 overflow-hidden px-3 pb-4 pt-3 md:px-6">
            <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
              {view === 'rules' && <RulesPage />}
              {view === 'history' && <HistoryPage />}
              {view === 'settings' && <SettingsPage />}
              {view === 'help' && <HelpPage />}
            </section>
          </main>
        )}
      </div>
    </div>
  )
}

function TopBar({
  currentView,
  onNavigate,
}: {
  currentView: View
  onNavigate: (view: View) => void
}) {
  return (
    <header className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-r from-primary via-primary/95 to-accent px-4 py-2 text-white shadow-sm md:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-xs font-semibold">
          LC
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-white">
            Loan Checker Agent
          </span>
          <span className="text-xs text-blue-100">
            Welcome customers, check eligibility, and answer questions
          </span>
        </div>
      </div>
      <nav className="hidden items-center gap-4 text-xs text-blue-100 md:flex">
        <TopNavItem
          label="Chat"
          active={currentView === 'chat'}
          onClick={() => onNavigate('chat')}
        />
        <TopNavItem
          label="Rules"
          active={currentView === 'rules'}
          onClick={() => onNavigate('rules')}
        />
        <TopNavItem
          label="History"
          active={currentView === 'history'}
          onClick={() => onNavigate('history')}
        />
        <TopNavItem
          label="Settings"
          active={currentView === 'settings'}
          onClick={() => onNavigate('settings')}
        />
        <TopNavItem
          label="Help center"
          active={currentView === 'help'}
          onClick={() => onNavigate('help')}
        />
      </nav>
    </header>
  )
}

function TopNavItem({
  label,
  active,
  onClick,
}: {
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-white/90 text-primary'
          : 'text-blue-100/80 hover:bg-white/20 hover:text-white'
      }`}
    >
      <span>{label}</span>
    </button>
  )
}

function Sidebar() {
  return (
    <aside className="hidden w-64 flex-none flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 text-xs lg:flex">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Session
        </p>
        <h2 className="mt-1 text-sm font-semibold text-slate-50">
          Customer context
        </h2>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] text-slate-500">
          Customer ID
          <div className="mt-1 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
            <input
              className="flex-1 border-0 bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="e.g. CUST-102938"
            />
            <button className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
              Load
            </button>
          </div>
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <Stat label="Monthly income" value="₹1,20,000" />
          <Stat label="Utilization" value="42%" />
          <Stat label="Active loans" value="3" />
          <Stat label="Score band" value="Good" />
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-accent/30 bg-accent/10 p-3 text-[11px] text-slate-700">
        <p className="mb-1 font-medium text-slate-900">
          Upload bank / credit statements
        </p>
        <div className="mt-2 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-accent/60 bg-white px-3 py-4 text-center">
          <p className="text-[11px] text-slate-600">
            Drag &amp; drop PDF, CSV, or images
          </p>
          <p className="text-[10px] text-slate-400">
            Auto-extracts transactions &amp; KYC markers
          </p>
        </div>
      </div>
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-xs font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function ChatWindow() {
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto px-3 py-3 text-sm sm:px-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <AIBubble>
            Hi, I&apos;m your Loan Checker Agent. I can welcome customers, check
            loan eligibility, and explain every decision in simple terms.
            <br />
            <br />
            Ask about a loan and I&apos;ll first confirm the customer ID. If
            they are new, I&apos;ll assign one, fetch their bank statements,
            credit card details and loans, run the eligibility rules, and show
            the result in the panel on the right.
          </AIBubble>
          <div className="py-2 text-center text-[11px] text-slate-400">
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
    <div className="flex items-start gap-2">
      <div className="max-w-xl text-xs text-slate-900">
        {children}
      </div>
    </div>
  )
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-end gap-2">
      <div className="max-w-xl rounded-2xl bg-gradient-to-r from-primary to-accent px-3 py-2 text-xs text-white shadow-sm">
        {children}
      </div>
    </div>
  )
}

function ChatComposer() {
  return (
    <div className="px-3 py-2">
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs">
        <input
          className="flex-1 border-0 bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-400"
          placeholder="Ask to check eligibility, explain the score, or analyse an uploaded statement…"
        />
        <button className="rounded-full bg-slate-100 px-2 py-1 text-[13px] text-slate-500">
          ⬆
        </button>
        <button
          aria-label="Send message"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-sm"
        >
          ➤
        </button>
      </div>
    </div>
  )
}

function DecisionPanel() {
  return (
    <aside className="hidden w-80 flex-none flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs xl:flex">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Decision
        </p>
        <h2 className="mt-1 text-sm font-semibold text-slate-900">
          Eligibility verdict
        </h2>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-orange-100 via-white to-pink-50 p-3 text-xs text-slate-900">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-600">Current status</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-700">
            Confidence 78%
          </span>
        </div>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-pink-100 px-3 py-1 text-[11px] font-semibold text-red-600">
          <span className="text-xs">⚠</span>
          REVIEW
        </div>
        <p className="mt-2 text-[11px] text-slate-700">
          Eligible in principle, but high recent utilization and 2 late
          payments trigger a manual review requirement.
        </p>
      </div>

      <RuleInspector />

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-medium text-slate-900">Actions</span>
        </div>
        <div className="mt-2 space-y-1.5">
          <button className="w-full rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-white">
            Export decision JSON
          </button>
          <button className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700">
            Re-run with different rules
          </button>
        </div>
      </div>
    </aside>
  )
}

function RuleInspector() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[11px] text-slate-700">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-slate-900">Rule checklist</span>
        <span className="text-[10px] text-slate-500">12 rules</span>
      </div>
      <div className="mt-1 space-y-1.5">
        <RuleRow
          label="Income stability &gt;= 6 months"
          status="pass"
          evidence="Salary credits from same employer for 14 months."
        />
        <RuleRow
          label="Credit utilization &lt; 50%"
          status="borderline"
          evidence="Current utilization 47% with rising trend."
        />
        <RuleRow
          label="No 60+ DPD in last 12 months"
          status="fail"
          evidence="1 instance of 62 DPD on card ending ••49."
        />
      </div>
    </div>
  )
}

function RuleRow(props: {
  label: string
  status: 'pass' | 'borderline' | 'fail'
  evidence: string
}) {
  const { label, status, evidence } = props
  const color =
    status === 'pass'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'borderline'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200'

  const symbol = status === 'pass' ? '✓' : status === 'borderline' ? '!' : '✕'

  return (
    <div className="group rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${color}`}
        >
          {symbol}
        </span>
        <span className="flex-1 text-[11px] font-medium text-slate-900">
          {label}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500 group-hover:text-slate-700">
        {evidence}
      </p>
    </div>
  )
}

function RulesPage() {
  return (
    <>
      <h1 className="text-base font-semibold text-slate-900">Eligibility rules</h1>
      <p className="mt-1 text-xs text-slate-500">
        These are the core checks used by the Loan Checker Agent when running an
        eligibility decision.
      </p>
      <div className="mt-4 space-y-2 text-xs">
        <p className="font-medium text-slate-800">Examples:</p>
        <ul className="list-disc space-y-1 pl-4 text-slate-600">
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
      <h1 className="text-base font-semibold text-slate-900">Recent decisions</h1>
      <p className="mt-1 text-xs text-slate-500">
        A simple overview of past eligibility checks. You can later replace this
        with real data from your backend.
      </p>
      <ul className="mt-4 space-y-1 text-xs text-slate-600">
        <li>CUST-102938 · REVIEW · Personal loan · Today</li>
        <li>CUST-948572 · APPROVE · Credit card · Yesterday</li>
      </ul>
    </>
  )
}

function SettingsPage() {
  return (
    <>
      <h1 className="text-base font-semibold text-slate-900">Settings</h1>
      <p className="mt-1 text-xs text-slate-500">
        Configure how the Loan Checker Agent behaves. This is a placeholder
        where you can add real settings (rulesets, thresholds, notification
        options) later.
      </p>
    </>
  )
}

function HelpPage() {
  return (
    <>
      <h1 className="text-base font-semibold text-slate-900">Help center</h1>
      <p className="mt-1 text-xs text-slate-500">
        Brief guidance for analysts using the Loan Checker Agent.
      </p>
      <div className="mt-4 space-y-1 text-xs text-slate-600">
        <p>Use Chat to welcome customers and answer open questions.</p>
        <p>
          When asked about loan eligibility, the agent will request a customer
          ID, fetch their data, run the rules, and show the result on the right.
        </p>
      </div>
    </>
  )
}

export default App

