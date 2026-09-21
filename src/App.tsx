import { useMemo, useState } from 'react'
import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { applications } from './data'
import type { ApplicationStatus } from './types'

const nav = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Applications', icon: FolderKanban },
  { label: 'Forms', icon: FileText },
  { label: 'Screening', icon: ShieldCheck },
  { label: 'Reviews', icon: ClipboardList },
  { label: 'Analytics', icon: BarChart3 },
]

const bottomNav = [
  { label: 'Team', icon: Users },
  { label: 'Settings', icon: Settings },
]

const statusStyles: Record<ApplicationStatus, string> = {
  Draft: 'status neutral',
  Published: 'status blue',
  Screening: 'status amber',
  Closed: 'status neutral',
  Completed: 'status green',
}

function StatCard({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Users }) {
  return (
    <div className="card stat-card">
      <div className="stat-icon"><Icon size={18} /></div>
      <div>
        <p className="eyebrow">{label}</p>
        <div className="stat-value">{value}</div>
        <p className="muted">{note}</p>
      </div>
    </div>
  )
}

function App() {
  const [active, setActive] = useState('Dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filteredApplications = useMemo(
    () => applications.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
    [query],
  )

  const totalSubmitted = applications.reduce((sum, item) => sum + item.submitted, 0)
  const totalEligible = applications.reduce((sum, item) => sum + item.eligible, 0)

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>ApplyFlow</strong>
            <span>Application OS</span>
          </div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">E</div>
          <div className="workspace-copy"><strong>Emerging Communities</strong><span>Organisation</span></div>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <nav className="nav-group">
          <p className="nav-label">Workspace</p>
          {nav.map(({ label, icon: Icon }) => (
            <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(label); setSidebarOpen(false) }}>
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Screening' && <span className="nav-count">12</span>}
            </button>
          ))}
        </nav>

        <nav className="nav-group bottom">
          <p className="nav-label">Manage</p>
          {bottomNav.map(({ label, icon: Icon }) => (
            <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(label); setSidebarOpen(false) }}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="help-card">
            <Sparkles size={17} />
            <div><strong>AI screening</strong><span>Coming in the next phase</span></div>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">CA</div>
            <div><strong>Cyril Adesegha</strong><span>Owner</span></div>
            <ChevronDown size={15} className="muted-icon" />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{active}</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications"><Bell size={18} /><span className="notification-dot" /></button>
            <div className="top-avatar">CA</div>
          </div>
        </header>

        <div className="content">
          {active === 'Dashboard' ? (
            <>
              <section className="page-heading">
                <div><p className="eyebrow">Monday, September 21, 2026</p><h1>Good evening, Cyril.</h1><p className="subtitle">Here’s what is happening across your programmes.</p></div>
                <button className="primary-button" onClick={() => setActive('Applications')}><Plus size={17} /> New application</button>
              </section>

              <section className="stats-grid">
                <StatCard label="Applications" value={totalSubmitted.toLocaleString()} note="Across all programmes" icon={FolderKanban} />
                <StatCard label="Eligible" value={totalEligible.toLocaleString()} note="85% of submitted" icon={FileCheck2} />
                <StatCard label="In screening" value="210" note="Awaiting review" icon={ShieldCheck} />
                <StatCard label="Selected" value="120" note="Across active programmes" icon={Users} />
              </section>

              <section className="dashboard-grid">
                <div className="card table-card">
                  <div className="card-header"><div><h2>Active applications</h2><p>Programmes currently accepting or screening applicants.</p></div><button className="text-button" onClick={() => setActive('Applications')}>View all</button></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Programme</th><th>Status</th><th>Applications</th><th>Deadline</th></tr></thead>
                      <tbody>{applications.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><span className="table-sub">{item.description}</span></td><td><span className={statusStyles[item.status]}>{item.status}</span></td><td>{item.submitted.toLocaleString()}</td><td>{item.deadline}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>

                <div className="card funnel-card">
                  <div className="card-header"><div><h2>Screening funnel</h2><p>Hertisan Cohort 3</p></div><button className="icon-button"><ChevronDown size={17} /></button></div>
                  <div className="funnel">
                    {[['Submitted', 450, 100], ['Eligible', 382, 85], ['Shortlisted', 210, 47], ['Selected', 120, 27]].map(([label, value, width]) => <div className="funnel-row" key={label}><div className="funnel-label"><span>{label}</span><strong>{value}</strong></div><div className="funnel-track"><div className="funnel-fill" style={{ width: width + '%' }} /></div></div>)}
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section>
              <div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>{active}</h1><p className="subtitle">This workspace is scaffolded and ready for the next implementation phase.</p></div>{active === 'Applications' && <button className="primary-button"><Plus size={17} /> New application</button>}</div>
              {active === 'Applications' && <div className="card table-card"><div className="toolbar"><div className="search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applications..." /></div><button className="secondary-button">All status <ChevronDown size={15} /></button></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Submitted</th><th>Target</th><th>Deadline</th></tr></thead><tbody>{filteredApplications.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><span className="table-sub">{item.description}</span></td><td><span className={statusStyles[item.status]}>{item.status}</span></td><td>{item.submitted.toLocaleString()}</td><td>{item.target.toLocaleString()}</td><td>{item.deadline}</td></tr>)}</tbody></table></div></div>}
              {active !== 'Applications' && <div className="empty-state card"><div className="empty-icon"><Sparkles size={22} /></div><h2>{active} is coming next</h2><p>The core navigation and visual foundation are in place. We’ll build this module on top of the shared ApplyFlow architecture.</p></div>}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

export default App