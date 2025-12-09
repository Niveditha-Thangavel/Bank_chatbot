// App.tsx — Complete, self-contained. Replaces previous App.tsx.
import './index.css'
import React, { useEffect, useMemo, useRef, useState } from 'react'

type View = 'chat' | 'rules' | 'history' | 'settings' | 'help'
type ChatMessage = { id: string; from: 'user' | 'ai'; text: string }

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const SESSION_STORAGE_KEY = 'bank_session_id'

function App() {
  const [view, setView] = useState<View>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      from: 'ai',
      text:
        "👋 Hi, I'm your Banking Agent.\n\nAsk about a loan and I'll confirm the customer ID, fetch bank statements, credit cards, and loans, run the rules, and share a clear decision with reasons.",
    },
  ])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // session id (persisted to localStorage)
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY)
    } catch {
      return null
    }
  })

  const saveSessionId = (id: string | null) => {
    try {
      if (id) localStorage.setItem(SESSION_STORAGE_KEY, id)
      else localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // ignore storage errors
    }
    setSessionId(id)
  }

  const makeId = useMemo(
    () => () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as any).randomUUID()
        : Math.random().toString(36).slice(2),
    [],
  )

  // auto-scroll ref
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isSending])

  // helper to add a message locally
  const pushMessage = (m: ChatMessage) => setMessages((prev) => [...prev, m])

  // handle sending messages, now sends session_id and stores returned session_id
  const handleSend = async (text: string, opts?: { endSession?: boolean }) => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    setError(null)
    const userMessage: ChatMessage = { id: makeId(), from: 'user', text: trimmed }
    pushMessage(userMessage)
    setIsSending(true)

    try {
      const payload: any = { message: trimmed }
      if (sessionId) payload.session_id = sessionId
      if (opts?.endSession) payload.end_session = true

      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Backend responded with status ${response.status}`)
      }

      // parse response that may be JSON or text
      let data: unknown
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        data = await response.json()
      } else {
        const textData = await response.text()
        try {
          data = JSON.parse(textData)
        } catch {
          data = textData
        }
      }

      // If server returned a session_id, persist it (server-created or continued)
      if (data && typeof data === 'object' && 'session_id' in (data as any)) {
        const sid = String((data as any).session_id)
        saveSessionId(sid)
      }

      // The server might return { reply: "...", session_id: "..." } or raw reply
      const replyPayload = (data && typeof data === 'object' && 'reply' in (data as any)) ? (data as any).reply : data
      const replyText: string = formatReply(replyPayload)

      const aiMessage: ChatMessage = { id: makeId(), from: 'ai', text: replyText }
      pushMessage(aiMessage)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error'
      setError(message)
      const aiMessage: ChatMessage = {
        id: makeId(),
        from: 'ai',
        text: 'Sorry, something went wrong while contacting the assistant.',
      }
      pushMessage(aiMessage)
    } finally {
      setIsSending(false)
    }
  }

  const quickPrompts = [
    'Check eligibility for customer C101',
    'Show credit and loan details for customer C102',
    'Explain how the decision was made for C104',
  ]

  // Reset to a new fresh session and reset messages
  const newSession = () => {
    saveSessionId(null)
    setMessages([
      {
        id: 'welcome',
        from: 'ai',
        text:
          "👋 Hi, I'm your Banking Agent.\n\nAsk about a loan and I'll confirm the customer ID, fetch bank statements, credit cards, and loans, run the rules, and share a clear decision with reasons.",
      },
    ])
    setError(null)
  }

  // Archive / end current session on server (if any)
  const endAndArchiveSession = async () => {
    if (!sessionId) {
      // nothing to archive
      newSession()
      return
    }
    // send a dummy message with end_session flag so server archives after reply
    await handleSend('End session', { endSession: true })
    // clear local session id — server has archived it
    saveSessionId(null)
  }

  return (
    <div className="min-h-screen bg-background text-navy-900">
      <div className="flex h-screen max-h-screen flex-col overflow-hidden">
        <TopBar
          sessionId={sessionId}
          onNewSession={newSession}
          onEndSession={endAndArchiveSession}
        />
        <div className="flex flex-1 overflow-hidden relative">
          {/* Desktop Sidebar Menu */}
          <MenuBar currentView={view} onNavigate={setView} />

          {/* Main Content */}
          {view === 'chat' ? (
            <main className="flex flex-1 overflow-hidden px-2 pb-16 sm:pb-4 pt-2 sm:pt-3 sm:px-4 md:px-6">
              <ChatWindow
                messages={messages}
                onSend={handleSend}
                isSending={isSending}
                error={error}
                quickPrompts={quickPrompts}
                scrollRef={scrollRef}
              />
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
        {/* Floating popup always available */}
        <FloatingPopup />
      </div>
    </div>
  )
}

/* ------------------ small UI components ------------------ */

function TopBar({
  sessionId,
  onNewSession,
  onEndSession,
}: {
  sessionId: string | null
  onNewSession: () => void
  onEndSession: () => void
}) {
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

      <div className="flex items-center gap-3">
        <div className="text-xs text-muted hidden sm:block">Session: <span className="font-mono text-[11px] text-navy-700">{sessionId ?? '—'}</span></div>

        <div className="flex gap-2">
          <button onClick={onNewSession} className="rounded-md px-3 py-1 border hover:bg-navy-50 text-sm">New Session</button>
          <button onClick={onEndSession} className="rounded-md px-3 py-1 border hover:bg-navy-50 text-sm">End & Archive Session</button>
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
    { id: 'chat' as View, label: 'Chat', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>) },
    { id: 'history' as View, label: 'History', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>) },
    { id: 'rules' as View, label: 'Rules', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>) },
    { id: 'settings' as View, label: 'Settings', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>) },
    { id: 'help' as View, label: 'Help', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>) },
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
    { id: 'chat' as View, label: 'Chat', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>) },
    { id: 'history' as View, label: 'History', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>) },
    { id: 'rules' as View, label: 'Rules', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>) },
    { id: 'settings' as View, label: 'Settings', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>) },
    { id: 'help' as View, label: 'Help', icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>) },
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
              currentView === item.id ? 'text-primary-700' : 'text-navy-600'
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

/* Chat window and composer */
function ChatWindow({
  messages,
  onSend,
  isSending,
  error,
  quickPrompts,
  scrollRef,
}: {
  messages: ChatMessage[]
  onSend: (text: string, opts?: { endSession?: boolean }) => Promise<void> | void
  isSending: boolean
  error: string | null
  quickPrompts: string[]
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col w-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 sm:px-3 sm:py-3 md:px-4">
        <div className="mx-auto flex max-w-2xl w-full flex-col gap-3 items-start">
          {messages.map((message) =>
            message.from === 'ai' ? (
              <AIBubble key={message.id} label="Banking Agent">
                <MessageText text={message.text} />
              </AIBubble>
            ) : (
              <UserBubble key={message.id} label="You">
                <MessageText text={message.text} />
              </UserBubble>
            ),
          )}
          {error && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] sm:text-xs text-amber-800 w-full">
              {error}
            </div>
          )}
          <div className="py-2 text-center text-[10px] sm:text-[11px] text-muted w-full">
            Start by asking a question or tap a quick prompt below.
          </div>
        </div>
      </div>

      <ChatComposer onSend={(t) => onSend(t)} isSending={isSending} quickPrompts={quickPrompts} />
    </section>
  )
}

function AIBubble({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="flex items-start justify-start gap-2 w-full">
      <div className="max-w-[85%] sm:max-w-xl text-sm sm:text-base text-navy-700 leading-relaxed text-left break-words">
        {label && <div className="text-[11px] sm:text-xs font-semibold text-primary-700 mb-1">{label}</div>}
        {children}
      </div>
    </div>
  )
}

function UserBubble({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="flex items-start justify-end gap-2 w-full">
      <div className="max-w-[85%] sm:max-w-xl rounded-2xl bg-gradient-to-r from-primary-400 to-primary-500 px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-white shadow-sm break-words text-left">
        {label && <div className="text-[10px] sm:text-[11px] font-semibold text-black mb-1">{label}</div>}
        {children}
      </div>
    </div>
  )
}

function ChatComposer({
  onSend,
  isSending,
  quickPrompts,
}: {
  onSend: (text: string, opts?: { endSession?: boolean }) => Promise<void> | void
  isSending: boolean
  quickPrompts: string[]
}) {
  const [value, setValue] = useState('')

  const handleSubmit = async () => {
    const text = value.trim()
    if (!text) return
    setValue('')
    await onSend(text)
  }

  return (
    <div className="px-2 py-2 sm:px-3 sm:py-2 flex-shrink-0 space-y-2">
      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSend(prompt)}
            className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-[11px] sm:text-xs text-primary-800 hover:bg-primary-100 transition"
            disabled={isSending}
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2 rounded-xl sm:rounded-2xl border border-navy-200 bg-white px-2 py-2 sm:px-3 sm:py-2 text-xs sm:text-sm shadow-sm">
        <input
          className="flex-1 border-0 bg-transparent text-xs sm:text-sm text-navy-900 outline-none placeholder:text-muted min-w-0"
          placeholder="Ask to check eligibility, explain the score..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          className="rounded-lg bg-navy-100 p-1.5 sm:px-2 sm:py-1 text-navy-600 hover:bg-navy-200 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          aria-label="Upload file"
          type="button"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </button>
        <button
          aria-label="Send message"
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors shadow-sm flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          type="button"
          onClick={handleSubmit}
          disabled={isSending}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function MessageText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap leading-relaxed text-navy-800 text-sm sm:text-base">
      {text}
    </div>
  )
}

/* Helper that formats backend replies (same logic as before) */
function formatReply(raw: unknown): string {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return formatReply(parsed)
    } catch {
      return raw
    }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, any>
    if ('decision' in obj && 'reason' in obj) {
      return `Decision: ${String(obj.decision)}\nReason: ${String(obj.reason)}`
    }
    if ('bank_statement' in obj || 'credit_profile' in obj) {
      const bank = obj.bank_statement ?? {}
      const credit = obj.credit_profile ?? {}
      const txCount = Array.isArray(bank?.transactions) ? bank.transactions.length : 0
      const cardCount = Array.isArray(credit?.credit_cards) ? credit.credit_cards.length : 0
      const loanCount = Array.isArray(credit?.loans) ? credit.loans.length : 0
      return [
        `Customer: ${obj.customer_id ?? 'N/A'}`,
        `Bank statement: ${txCount} transactions`,
        `Credit cards: ${cardCount} card(s)`,
        `Loans: ${loanCount} loan(s)`,
      ].join('\n')
    }
    try {
      const keys = Object.keys(obj)
      if (keys.length === 0) return 'No reply returned from the assistant.'
      return keys
        .slice(0, 8)
        .map((k) => {
          const val = obj[k]
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            return `${k}: ${String(val)}`
          }
          if (Array.isArray(val)) {
            return `${k}: [${val.length} items]`
          }
          return `${k}: {...}`
        })
        .join('\n')
    } catch {
      return 'No reply returned from the assistant.'
    }
  }
  return 'No reply returned from the assistant. Please try again.'
}

/* --- static pages --- */
function RulesPage() {
  return (
    <>
      <h1 className="text-base sm:text-lg font-semibold text-navy-900">Eligibility rules</h1>
      <p className="mt-1 text-xs sm:text-sm text-muted">These are the core checks used by the Banking Agent when running an eligibility decision.</p>
    </>
  )
}
function HistoryPage() { return (<><h1 className="text-base sm:text-lg font-semibold text-navy-900">Recent decisions</h1></>) }
function SettingsPage() { return (<><h1 className="text-base sm:text-lg font-semibold text-navy-900">Settings</h1></>) }
function HelpPage() { return (<><h1 className="text-base sm:text-lg font-semibold text-navy-900">Help center</h1></>) }

/* ---------------- FloatingPopup + Manager Chat ----------------
   ManagerChat auto-loads customer info and only uses /update-decisions to save.
*/

type DecisionRecord = { decision: string; reason?: string; updated_at?: string }

function ManagerChat({
  custId,
  initialDecision,
  onSavedDecision,
  onClose,
}: {
  custId: string
  initialDecision: DecisionRecord
  onSavedDecision: (rec: DecisionRecord) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'chat' | 'decisions'>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 'sys', from: 'ai', text: `Manager chat opened for ${custId}.` },
  ])
  const [isSending, setIsSending] = useState(false)
  const [decision, setDecision] = useState<string>(initialDecision.decision ?? '')
  const [reason, setReason] = useState<string>(initialDecision.reason ?? '')
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(initialDecision.updated_at)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  const makeId = useMemo(
    () => () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as any).randomUUID()
        : Math.random().toString(36).slice(2),
    [],
  )

  const pushMessage = (m: ChatMessage) => setMessages((prev) => [...prev, m])

  // read stored session id so manager chat attaches to same session if present
  const getStoredSessionId = (): string | null => {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY)
    } catch {
      return null
    }
  }

  // Core function that sends queries to backend /chat (includes session and customer_id)
  const sendManagerQuery = async (text: string) => {
    if (!text.trim()) return
    const userMsg: ChatMessage = { id: makeId(), from: 'user', text }
    pushMessage(userMsg)
    setIsSending(true)
    try {
      const payload: any = { message: text, customer_id: custId }
      const sid = getStoredSessionId()
      if (sid) payload.session_id = sid

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const contentType = res.headers.get('content-type') || ''
      let data: unknown
      if (contentType.includes('application/json')) data = await res.json()
      else {
        const txt = await res.text()
        try {
          data = JSON.parse(txt)
        } catch {
          data = txt
        }
      }

      // persist any returned session id
      if (data && typeof data === 'object' && 'session_id' in (data as any)) {
        const newSid = String((data as any).session_id)
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, newSid)
        } catch {
          // ignore storage errors
        }
      }

      // Extract reply (server may return { reply: "...", session_id: "..." } or raw text)
      const replyPayload = (data && typeof data === 'object' && 'reply' in (data as any)) ? (data as any).reply : data
      const replyText = formatReply(replyPayload)
      const aiMsg: ChatMessage = { id: makeId(), from: 'ai', text: replyText }
      pushMessage(aiMsg)
    } catch (err: any) {
      const aiMsg: ChatMessage = { id: makeId(), from: 'ai', text: `Error contacting assistant: ${String(err?.message ?? err)}` }
      pushMessage(aiMsg)
    } finally {
      setIsSending(false)
    }
  }

  // automatically load customer data when ManagerChat opens
  useEffect(() => {
    const initialLoad = async () => {
      const alreadyLoaded = messages.some((m) =>
        typeof m.text === 'string' && (m.text.includes('Bank statement:') || m.text.includes('Customer:'))
      )
      if (alreadyLoaded) return

      const loadPrompt =
        `Load full customer profile for ${custId}. ` +
        `Please fetch bank_statement and credit_profile using the tool and return a concise JSON object containing at least: customer_id, bank_statement, credit_profile.`

      await sendManagerQuery(loadPrompt)
    }

    initialLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custId])

  // Save updated decision (only endpoint used is /update-decisions)
  const saveDecision = async () => {
    setSaveStatus('saving')
    const payload = { customer_id: custId, decision, reason }

    // Try server update endpoint
    try {
      const res = await fetch(`${API_BASE}/update-decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const now = new Date().toISOString()
        setSaveStatus('saved (server)')
        setUpdatedAt(now)
        onSavedDecision({ decision, reason, updated_at: now })
        return
      }
      const txt = await res.text().catch(() => '')
      setSaveStatus(`server error: ${res.status} ${txt}`)
    } catch (err: any) {
      setSaveStatus(String(err?.message ?? err))
    }


    setSaveStatus('No server endpoint and File System Access API not available in this browser.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative z-10 w-full max-w-4xl rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">Manager chat — {custId}</h3>
            <div className="text-sm text-muted">Tabs: Chat / Decisions</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1 border hover:bg-navy-50">Close</button>
          </div>
        </div>

        <div className="mb-3">
          <nav className="flex gap-2">
            <button onClick={() => setTab('chat')} className={`px-3 py-1 rounded ${tab === 'chat' ? 'bg-primary-50' : 'bg-navy-50'}`}>Chat</button>
            <button onClick={() => setTab('decisions')} className={`px-3 py-1 rounded ${tab === 'decisions' ? 'bg-primary-50' : 'bg-navy-50'}`}>Decisions</button>
          </nav>
        </div>

        <div className="min-h-[240px]">
          {tab === 'chat' ? (
            <>
              <div className="max-h-72 overflow-auto border rounded p-2 bg-white mb-2">
                {messages.map((m) => (
                  <div key={m.id} className={`mb-2 ${m.from === 'ai' ? 'text-navy-700' : 'text-white'}`}>
                    <div className={m.from === 'ai' ? 'bg-navy-50 p-2 rounded' : 'bg-primary-500 p-2 rounded text-white'}>{m.text}</div>
                  </div>
                ))}
              </div>
              <ManagerChatComposer onSend={sendManagerQuery} isSending={isSending} />
              <div className="mt-2 text-xs text-muted">Manager queries are sent to your /chat backend with the current customer_id and current session (if one exists).</div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-navy-700">Decision</label>
                  <select value={decision} onChange={(e) => setDecision(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2">
                    <option value="APPROVE">APPROVE</option>
                    <option value="REVIEW">REVIEW</option>
                    <option value="REJECT">REJECT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-navy-700">Reason</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 h-24" />
                </div>

                <div className="flex items-center gap-2">
                  {/* Save button only — calls /update-decisions */}
                  <button onClick={saveDecision} className="rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700">Save</button>

                  <div className="text-sm text-muted">{saveStatus ?? ''}</div>
                </div>

                <div className="text-xs text-muted">Updated at: {updatedAt ?? '-'}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ManagerChatComposer({ onSend, isSending }: { onSend: (text: string) => Promise<void> | void; isSending: boolean }) {
  const [value, setValue] = useState('')
  const handleSubmit = async () => {
    const t = value.trim()
    if (!t) return
    setValue('')
    await onSend(t)
  }
  return (
    <div className="flex items-center gap-2 mt-2">
      <input value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 border rounded px-3 py-2" placeholder="Ask about this customer's details..." />
      <button onClick={handleSubmit} disabled={isSending} className="rounded px-3 py-2 bg-primary-600 text-white">Send</button>
    </div>
  )
}

/* Floating popup component with summary and Open chat -> ManagerChat flow */
const FloatingPopup: React.FC = () => {
  const [open, setOpen] = useState<boolean>(false)

  // credentials (demo)
  const [email, setEmail] = useState<string>('manager@gmail.com')
  const [password, setPassword] = useState<string>('manager')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState<boolean>(false)

  // decisions state
  const [decisions, setDecisions] = useState<Record<string, DecisionRecord>>({})
  const [loading, setLoading] = useState<boolean>(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // UI
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  const [openManagerChatFor, setOpenManagerChatFor] = useState<string | null>(null)

  // close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // prevent background scroll when open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // fetch when authenticated & open
  useEffect(() => {
    if (open && authenticated) fetchDecisions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, authenticated])

  const tryUrls = ['/decisions.json', 'decisions.json', './decisions.json', `${API_BASE}/decisions.json`, `${API_BASE}/decisions-from-disk`]

  const fetchDecisions = async () => {
    setLoading(true)
    setFetchError(null)
    setDecisions({})
    for (const url of tryUrls) {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) continue
        const payload = await res.json()
        let mapping: Record<string, any> = {}
        if (payload && typeof payload === 'object') {
          mapping = ('decisions' in payload && typeof payload.decisions === 'object') ? payload.decisions : payload
        } else {
          continue
        }
        const normalized: Record<string, DecisionRecord> = {}
        for (const [k, v] of Object.entries(mapping)) {
          if (v && typeof v === 'object') {
            normalized[k] = {
              decision: String(v.decision ?? v.status ?? '').toUpperCase(),
              reason: v.reason ?? v.explanation ?? '',
              updated_at: v.updated_at ?? v.updatedAt ?? v.ts ?? undefined,
            }
          } else {
            normalized[k] = { decision: String(v ?? '').toUpperCase(), reason: '' }
          }
        }
        setDecisions(normalized)
        setLoading(false)
        return
      } catch (err) {
        // try next
      }
    }
    setLoading(false)
    setFetchError('Could not fetch decisions.json from expected locations. Place the file in public folder or expose it via backend.')
  }

  const handleClose = () => {
    setOpen(false)
    setAuthenticated(false)
    setAuthError(null)
    setDecisions({})
    setFetchError(null)
    setLoading(false)
    setExpandedCustomer(null)
    setOpenManagerChatFor(null)
  }

  const handleLogin = (e?: React.FormEvent) => {
    e?.preventDefault()
    setAuthError(null)
    if (email.trim().toLowerCase() === 'manager@gmail.com' && password === 'manager') {
      setAuthenticated(true)
    } else {
      setAuthError('Invalid credentials')
    }
  }

  // Called when ManagerChat saved a decision
  const onSavedDecision = (custId: string, rec: DecisionRecord) => {
    setDecisions((prev) => ({ ...prev, [custId]: rec }))
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open manager area"
        className="fixed bottom-6 right-6 bg-primary-600 text-white p-4 rounded-full shadow-lg hover:bg-primary-700 transition z-40"
        type="button"
      >
        🧑
      </button>

      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

          <div className="relative z-10 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-navy-900">Manager's Area</h3>
                <p className="text-sm text-navy-600 mt-1">Sign in to view and edit decisions. Click "Open chat" to manage a customer directly.</p>
              </div>
              <div className="flex gap-2 items-center">
                {authenticated && (
                  <button onClick={() => { setAuthenticated(false); setDecisions({}); }} className="text-sm rounded-md border border-navy-200 px-3 py-1 hover:bg-navy-50">Logout</button>
                )}
                <button onClick={handleClose} className="rounded-md p-1 hover:bg-navy-50">✕</button>
              </div>
            </div>

            <div className="mt-4">
              {!authenticated ? (
                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-navy-700">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-navy-700">Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm outline-none" />
                  </div>

                  {authError && <div className="text-sm text-rose-600">{authError}</div>}

                  <div className="flex items-center gap-2">
                    <button type="submit" className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm hover:bg-primary-700 transition">Sign in</button>
                    <button type="button" onClick={handleClose} className="rounded-lg border border-navy-200 px-4 py-2 text-sm hover:bg-navy-50">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-navy-600">Logged in as <span className="font-medium">manager@gmail.com</span></div>
                    <div className="text-sm text-muted">Decisions: {Object.keys(decisions).length}</div>
                  </div>

                  {loading ? (
                    <div className="text-sm text-navy-600">Loading decisions…</div>
                  ) : fetchError ? (
                    <div className="rounded-md bg-rose-50 border border-rose-100 p-3 text-sm text-rose-700">{fetchError}</div>
                  ) : Object.keys(decisions).length === 0 ? (
                    <div className="text-sm text-navy-600">No decisions found.</div>
                  ) : (
                    <div className="overflow-auto max-h-96 rounded-md border border-navy-100">
                      <table className="min-w-full divide-y divide-navy-100">
                        <thead className="bg-navy-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-navy-800">Customer ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-navy-800">Decision</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-navy-800">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-navy-100">
                          {Object.entries(decisions).map(([custId, rec]) => (
                            <React.Fragment key={custId}>
                              <tr>
                                <td className="px-3 py-2 text-sm text-navy-700 font-medium whitespace-nowrap">{custId}</td>
                                <td className="px-3 py-2 text-sm text-navy-700">{rec.decision}</td>
                                <td className="px-3 py-2 text-sm text-navy-700 flex gap-2">
                                  <button onClick={() => setExpandedCustomer((prev) => (prev === custId ? null : custId))} className="rounded-md border px-2 py-1">View reason</button>
                                  <button onClick={() => setOpenManagerChatFor(custId)} className="rounded-md border px-2 py-1">Open chat</button>
                                </td>
                              </tr>
                              {expandedCustomer === custId && (
                                <tr>
                                  <td colSpan={3} className="px-3 py-2 bg-navy-50">
                                    <div className="text-sm">{rec.reason ?? '-'}</div>
                                    <div className="text-xs text-muted mt-1">Updated at: {rec.updated_at ?? '-'}</div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ManagerChat modal */}
      {openManagerChatFor && (
      <ManagerChat
        custId={openManagerChatFor}
        initialDecision={decisions[openManagerChatFor] ?? { decision: '', reason: '' }}
        onSavedDecision={(rec) => {
          // update parent decisions state (wrapper defined above)
          onSavedDecision(openManagerChatFor, rec);
          // close manager chat
          setOpenManagerChatFor(null);
          // re-fetch decisions.json from backend to reflect persisted file content
          fetchDecisions().catch(() => {});
        }}
        onClose={() => {
          setOpenManagerChatFor(null);
          fetchDecisions().catch(() => {});
        }}
      />
    )}

    </>
  )
}

export default App
