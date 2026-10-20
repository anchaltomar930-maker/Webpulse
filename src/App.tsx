import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { projectId, publicAnonKey } from "../utils/supabase/info";

type Priority = "HIGH" | "MEDIUM" | "LOW" | "BASELINE";
type Website = {
  id: number;
  name: string;
  url: string;
  requestedUrl: string;
  title?: string;
  category: string;
  focus: string;
  lastChecked?: string;
  latestChange: string;
  priority: Priority;
  checks: number;
  snapshot?: string;
};
type Report = {
  id: number;
  websiteId: number;
  website: string;
  url: string;
  timestamp: string;
  summary: string;
  category: string;
  priority: Exclude<Priority, "BASELINE">;
  previous: string;
  updated: string;
  impact: string;
  recheck: string;
};
type TimelineEntry = {
  id: number;
  websiteId: number;
  website: string;
  timestamp: string;
  summary: string;
  priority: Priority | "FAILED";
  reportId?: number;
};
type LiveFetch = {
  website: string;
  title: string;
  url: string;
  text: string;
  timestamp: string;
};
type Theme = "light" | "dark";

class FetchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const STORAGE_KEY = "webpulse-verified-v2";
const TINYFISH_ENDPOINT = `https://${projectId}.supabase.co/functions/v1/make-server-3b6589d5/tinyfish/fetch`;

function getInitialTheme(): Theme {
  try {
    return localStorage.getItem("webpulse-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

const icons: Record<string, ReactNode> = {
  pulse: <><path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" /></>,
  file: <><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  spark: <><path d="m12 3 1.3 4.2a5 5 0 0 0 3.5 3.5L21 12l-4.2 1.3a5 5 0 0 0-3.5 3.5L12 21l-1.3-4.2a5 5 0 0 0-3.5-3.5L3 12l4.2-1.3a5 5 0 0 0 3.5-3.5Z" /></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.5-1.5L20 9M4 15l2.4 2.5A7 7 0 0 0 18 16" /></>,
  external: <><path d="M14 5h5v5M19 5l-8 8M19 14v5H5V5h5" /></>,
  chevron: <><path d="m9 18 6-6-6-6" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" /></>,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

function PriorityBadge({ value }: { value: Priority | "FAILED" }) {
  return <span className={`badge badge-${value.toLowerCase()}`}><span className="badge-dot" />{value}</span>;
}

function timeLabel(iso?: string) {
  if (!iso) return "Not checked";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function cleanSnapshot(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 80000);
}

function changedExcerpt(previous: string, updated: string, focus: string) {
  const previousLines = previous.split("\n").map((line) => line.trim()).filter((line) => line.length >= 12);
  const updatedLines = updated.split("\n").map((line) => line.trim()).filter((line) => line.length >= 12);
  const previousSet = new Set(previousLines);
  const updatedSet = new Set(updatedLines);
  const removed = previousLines.filter((line) => !updatedSet.has(line));
  const added = updatedLines.filter((line) => !previousSet.has(line));
  const focusTerms = focus.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
  const score = (line: string) => focusTerms.reduce((total, term) =>
    total + (line.toLowerCase().includes(term) ? 1 : 0), 0);
  const pick = (lines: string[], fallback: string) =>
    [...lines].sort((a, b) => score(b) - score(a) || b.length - a.length)[0]?.slice(0, 500) || fallback;
  return { previous: pick(removed, "Previous page content"), updated: pick(added, "Updated page content") };
}

async function fetchWebsite(site: Website) {
  const response = await fetch(TINYFISH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify({
      url: site.requestedUrl,
      purpose: site.focus
        ? `Monitor this page for changes to: ${site.focus}`
        : "Monitor this page for meaningful content changes.",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new FetchError(response.status, data.error || "The website could not be retrieved.");
  }
  if (typeof data.text !== "string" || !data.text.trim()) {
    throw new FetchError(response.status, "The website returned no readable content.");
  }
  return {
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : new URL(site.requestedUrl).hostname,
    url: typeof data.url === "string" ? data.url : site.requestedUrl,
    text: cleanSnapshot(data.text),
  };
}

function App() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", category: "", focus: "" });
  const [formError, setFormError] = useState("");
  const [lastFetch, setLastFetch] = useState<LiveFetch | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setWebsites(Array.isArray(data.websites) ? data.websites : []);
        setReports(Array.isArray(data.reports) ? data.reports : []);
        setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
        setLastFetch(data.lastFetch || null);
        if (data.reports?.[0]) setSelectedReport(data.reports[0]);
      }
    } catch {
      // A corrupted local cache should not prevent the app from opening.
    } finally {
      localStorage.removeItem("webpulse-demo-v1");
      localStorage.removeItem("webpulse-live-v1");
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ websites, reports, timeline, lastFetch }));
  }, [hydrated, websites, reports, timeline, lastFetch]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem("webpulse-theme", theme);
    } catch {
      // Theme still applies for this session when browser storage is unavailable.
    }
  }, [theme]);

  const visibleWebsites = useMemo(() => websites.filter((site) =>
    `${site.name} ${site.category}`.toLowerCase().includes(search.toLowerCase())
  ), [search, websites]);

  const highPriority = reports.filter((report) => report.priority === "HIGH").length;
  const lastChecked = websites.map((site) => site.lastChecked).filter(Boolean).sort().reverse()[0];

  function navigate(label: string, id: string) {
    setActiveNav(label);
    setMobileNav(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submitWebsite(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim() || !form.category) {
      setFormError("Please complete all required fields.");
      return;
    }
    try {
      const url = new URL(form.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      setFormError("Enter a valid URL beginning with http:// or https://.");
      return;
    }
    const site: Website = {
      id: Date.now(), name: form.name.trim(), url: form.url.trim(), requestedUrl: form.url.trim(), category: form.category,
      focus: form.focus.trim(), latestChange: "Waiting for first check", priority: "BASELINE", checks: 0,
    };
    setWebsites((current) => [site, ...current]);
    setForm({ name: "", url: "", category: "", focus: "" });
    setFormError("");
    setModalOpen(false);
    setToast(`${site.name} is now being monitored.`);
    setTimeout(() => document.getElementById("websites")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function checkWebsite(site: Website) {
    setCheckingId(site.id);
    setFetchError("");
    const timestamp = new Date().toISOString();
    try {
      const result = await fetchWebsite(site);
      const snapshot = result.text;
      setLastFetch({
        website: result.title,
        title: result.title,
        url: result.url,
        text: result.text,
        timestamp,
      });
      if (!site.snapshot) {
        setWebsites((current) => current.map((item) => item.id === site.id
          ? { ...item, name: result.title, title: result.title, url: result.url, snapshot, checks: item.checks + 1, lastChecked: timestamp, latestChange: "Verified baseline saved", priority: "BASELINE" }
          : item
        ));
        setTimeline((current) => [{
          id: Date.now(), websiteId: site.id, website: result.title, timestamp,
          summary: `Verified baseline saved from ${result.url}`, priority: "BASELINE",
        }, ...current]);
        setToast("Live baseline saved. Check again to compare for changes.");
      } else if (site.snapshot === snapshot) {
        setWebsites((current) => current.map((item) => item.id === site.id
          ? { ...item, name: result.title, title: result.title, url: result.url, snapshot, checks: item.checks + 1, lastChecked: timestamp, latestChange: "No content change detected", priority: "LOW" }
          : item
        ));
        setTimeline((current) => [{
          id: Date.now(), websiteId: site.id, website: site.name, timestamp,
          summary: "Live check complete — no content change detected", priority: "LOW",
        }, ...current]);
        setToast("Check complete. No content changes were detected.");
      } else {
        const excerpts = changedExcerpt(site.snapshot, snapshot, site.focus);
        const focusLabel = site.focus.trim() || "the information you monitor";
        const report: Report = {
          id: Date.now(), websiteId: site.id, website: result.title, url: result.url, timestamp,
          summary: "The page content changed since the previous live snapshot.",
          category: "Content update", priority: "MEDIUM",
          previous: excerpts.previous, updated: excerpts.updated,
          impact: `This change may affect ${focusLabel.toLowerCase()}. Review the source before acting on it.`,
          recheck: `Verify the changed text and related details on the official page, especially ${focusLabel.toLowerCase()}.`,
        };
        setReports((current) => [report, ...current]);
        setSelectedReport(report);
        setWebsites((current) => current.map((item) => item.id === site.id
          ? { ...item, name: result.title, title: result.title, url: result.url, snapshot, checks: item.checks + 1, lastChecked: timestamp, latestChange: report.summary, priority: report.priority }
          : item
        ));
        setTimeline((current) => [{
          id: Date.now(), websiteId: site.id, website: site.name, timestamp,
          summary: report.summary, priority: report.priority, reportId: report.id,
        }, ...current]);
        setToast("Change detected and impact report generated.");
        setTimeout(() => document.getElementById("reports")?.scrollIntoView({ behavior: "smooth" }), 80);
      }
    } catch (error) {
      const status = error instanceof FetchError ? error.status : 0;
      const safeMessage = error instanceof Error ? error.message : "The live check failed.";
      const message = `${status ? `HTTP ${status}: ` : ""}${safeMessage}`;
      setFetchError(message);
      setTimeline((current) => [{
        id: Date.now(), websiteId: site.id, website: site.name, timestamp,
        summary: `Content retrieval failed — ${message}`, priority: "FAILED",
      }, ...current]);
      setToast(message);
    } finally {
      setCheckingId(null);
    }
  }

  function viewReport(siteId: number) {
    const report = reports.find((item) => item.websiteId === siteId);
    if (!report) {
      setToast("No report yet. Run two checks to compare snapshots.");
      return;
    }
    setSelectedReport(report);
    navigate("Change Reports", "reports");
  }

  const navItems = [
    ["Dashboard", "grid", "dashboard"],
    ["Monitored Websites", "globe", "websites"],
    ["Change Reports", "file", "reports"],
    ["Timeline", "clock", "timeline"],
    ["Settings", "settings", "settings"],
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><Icon name="pulse" size={22} /></span><span>WebPulse</span></div>
        <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><Icon name="close" /></button>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(([label, icon, id]) => (
            <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} onClick={() => navigate(label, id)}>
              <Icon name={icon} /><span>{label}</span>
              {label === "Change Reports" && reports.length > 0 && <span className="nav-count">{reports.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-box"><div className="demo-icon"><Icon name="spark" size={16} /></div><div><strong>{lastFetch ? "Live monitoring" : "Demo mode"}</strong><p>{lastFetch ? "TinyFish fetch verified." : "No verified website data yet."}</p></div></div>
          <div className="profile"><span className="avatar">AR</span><div><strong>Alex Rivera</strong><p>Student workspace</p></div><Icon name="chevron" size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar" id="dashboard">
          <div className="title-row">
            <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Icon name="menu" /></button>
            <div><h1>Web Intelligence Dashboard</h1><p>Track meaningful changes across the web.</p></div>
          </div>
          <div className="header-actions">
            <label className="search-box"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search websites..." /></label>
            <button
              className="theme-toggle"
              onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              aria-pressed={theme === "dark"}
            >
              <Icon name={theme === "light" ? "moon" : "sun"} size={17} />
            </button>
            <button className="primary-button" onClick={() => setModalOpen(true)}><Icon name="plus" size={17} /><span>Add Website</span></button>
          </div>
        </header>

        <section className="content">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-kicker"><span><Icon name="pulse" size={14} /></span>WebPulse</div>
            <h2 id="hero-title">THE WEB CHANGES. WE FIND WHAT MATTERS.</h2>
            <p>Monitor websites, detect meaningful changes, and understand what needs your attention — all in one place.</p>
          </section>

          <div className="notice"><div><Icon name="spark" size={17} /></div><p><strong>{lastFetch ? "Live retrieval verified." : "Demo mode is active."}</strong> {lastFetch ? "Every value below comes from a successful TinyFish response or a comparison of verified snapshots." : "No sample records are shown. Add a website and run Check Now to create the first verified baseline."}</p></div>
          {fetchError && <div className="fetch-error" role="alert"><strong>Fetch failed</strong><span>{fetchError}</span></div>}

          <div className="metrics-grid">
            <MetricCard label="Websites Monitored" value={websites.length.toString().padStart(2, "0")} hint="Active monitors" icon="globe" tone="indigo" />
            <MetricCard label="Changes Detected" value={reports.length.toString().padStart(2, "0")} hint="Across saved snapshots" icon="pulse" tone="violet" />
            <MetricCard label="High-Priority Changes" value={highPriority.toString().padStart(2, "0")} hint="Needs your attention" icon="spark" tone="coral" />
            <MetricCard label="Last Successful Check" value={lastChecked ? timeLabel(lastChecked) : "—"} hint="Live content retrieval" icon="clock" tone="mint" />
          </div>

          <section className="card website-card" id="websites">
            <div className="section-header"><div><h2>Monitored Websites</h2><p>Sites WebPulse is watching for meaningful updates</p></div><button className="text-button" onClick={() => setModalOpen(true)}><Icon name="plus" size={16} />Add new</button></div>
            {visibleWebsites.length === 0 ? (
              <div className="empty-state"><Icon name="globe" size={28} /><h3>No verified websites yet</h3><p>Add a website, then use Check Now to fetch its first real snapshot.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Website</th><th>Category</th><th>Last Checked</th><th>Latest Change</th><th>Priority</th><th>Actions</th></tr></thead>
                  <tbody>
                    {visibleWebsites.map((site) => (
                      <tr key={site.id}>
                        <td><div className="site-cell"><span className="site-icon">{site.name.charAt(0)}</span><div><strong>{site.name}</strong><span>{new URL(site.url).hostname}</span></div></div></td>
                        <td><span className="category-pill">{site.category}</span></td>
                        <td><span className="muted-cell">{timeLabel(site.lastChecked)}</span></td>
                        <td><span className="change-cell">{site.latestChange}</span></td>
                        <td><PriorityBadge value={site.priority} /></td>
                        <td><div className="row-actions">
                          <button className="check-button" disabled={checkingId !== null} onClick={() => checkWebsite(site)}>
                            <span className={checkingId === site.id ? "spinning" : ""}><Icon name="refresh" size={15} /></span>{checkingId === site.id ? "Checking..." : "Check Now"}
                          </button>
                          <button className="icon-button" onClick={() => viewReport(site.id)} aria-label={`View report for ${site.name}`}><Icon name="chevron" size={17} /></button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {lastFetch && (
            <section className="card fetch-result-card" aria-live="polite">
              <div className="section-header">
                <div><h2>Latest live fetch</h2><p>Actual content returned by TinyFish</p></div>
                <span className="live-label"><span />LIVE</span>
              </div>
              <div className="fetch-result-body">
                <div className="fetch-result-meta">
                  <div><span>Page title</span><strong>{lastFetch.title}</strong></div>
                  <div><span>Fetched URL</span><a href={lastFetch.url} target="_blank" rel="noreferrer">{lastFetch.url}<Icon name="external" size={13} /></a></div>
                  <div><span>Retrieved</span><strong>{fullDate(lastFetch.timestamp)}</strong></div>
                </div>
                <pre>{lastFetch.text}</pre>
              </div>
            </section>
          )}

          <section id="reports" className="report-section">
            {selectedReport ? <>
            <div className="section-title-line"><div><span className="eyebrow">LATEST CHANGE REPORT</span><h2>{selectedReport.website}</h2></div><div className="title-meta"><span className="demo-label">VERIFIED CHANGE</span><span>{fullDate(selectedReport.timestamp)}</span></div></div>
            <div className="report-grid">
              <article className="card comparison-card">
                <div className="report-heading"><div className="report-icon"><Icon name="pulse" /></div><div><h3>{selectedReport.summary}</h3><p>{selectedReport.category} · Meaningful content change</p></div><PriorityBadge value={selectedReport.priority} /></div>
                <div className="comparison">
                  <div className="value-panel previous"><span className="value-label"><span>−</span> PREVIOUS VALUE</span><p>{selectedReport.previous}</p></div>
                  <div className="comparison-arrow"><Icon name="arrow" size={20} /></div>
                  <div className="value-panel updated"><span className="value-label"><span>+</span> UPDATED VALUE</span><p>{selectedReport.updated}</p></div>
                </div>
                <div className="source-row"><div><span>Source website</span><a href={selectedReport.url} target="_blank" rel="noreferrer">{selectedReport.url}<Icon name="external" size={13} /></a></div><span>Checked {timeLabel(selectedReport.timestamp)}</span></div>
              </article>
              <article className="impact-card">
                <div className="impact-title"><span><Icon name="spark" size={18} /></span><div><h3>Impact Analysis</h3><p>Rule-based fallback</p></div></div>
                <div className="analysis-block"><span>WHY THIS MATTERS</span><p>{selectedReport.impact}</p></div>
                <div className="analysis-block"><span>WHAT TO RECHECK</span><p>{selectedReport.recheck}</p></div>
                <div className="grounded-note"><Icon name="check" size={15} /><span>Grounded in the saved old and new text. No AI service was used.</span></div>
                <a className="report-link" href={selectedReport.url} target="_blank" rel="noreferrer">Open source page <Icon name="external" size={15} /></a>
              </article>
            </div>
            </> : <div className="card empty-state"><Icon name="file" size={28} /><h3>No verified changes detected</h3><p>A report appears only when a new live snapshot differs from its saved baseline.</p></div>}
          </section>

          <section className="card timeline-card" id="timeline">
            <div className="section-header"><div><h2>Change Timeline</h2><p>A persistent browser history of checks and detected changes</p></div><span className="local-label">Saved locally</span></div>
            <div className="timeline-list">
              {timeline.length === 0 ? <div className="empty-state"><Icon name="clock" size={26} /><h3>No checks yet</h3><p>Verified fetches and safe errors will appear here.</p></div> : timeline.map((entry, index) => (
                <div className="timeline-item" key={entry.id}>
                  <div className="timeline-rail"><span className={`timeline-dot dot-${entry.priority.toLowerCase()}`} />{index < timeline.length - 1 && <span className="timeline-line" />}</div>
                  <div className="timeline-content"><div><strong>{entry.website}</strong><p>{entry.summary}</p></div><div className="timeline-meta"><span>{fullDate(entry.timestamp)}</span><PriorityBadge value={entry.priority} />{entry.reportId && <button onClick={() => { const report = reports.find((item) => item.id === entry.reportId); if (report) { setSelectedReport(report); navigate("Change Reports", "reports"); } }}>View report <Icon name="arrow" size={13} /></button>}</div></div>
                </div>
              ))}
            </div>
          </section>

          <section className="card settings-card" id="settings">
            <div><span className="settings-icon"><Icon name="settings" /></span><div><h2>Integration settings</h2><p>{lastFetch ? "TinyFish is connected through a secure Supabase Edge Function." : "Supabase is configured; live status requires a successful fetch."} Impact analysis remains rule-based.</p></div></div>
            <button className="secondary-button" onClick={() => setToast(lastFetch ? "TinyFish is connected. API credentials remain securely stored on the server." : "Demo mode remains active until the Edge Function is deployed and a fetch succeeds.")}>Check connection</button>
          </section>
        </section>
      </main>

      {modalOpen && <div className="modal-backdrop" onMouseDown={() => setModalOpen(false)}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-header"><div><span className="modal-icon"><Icon name="globe" /></span><div><h2 id="add-title">Add a website</h2><p>Choose what WebPulse should monitor.</p></div></div><button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Close"><Icon name="close" /></button></div>
          <form onSubmit={submitWebsite}>
            <label className="field"><span>Website name <b>*</b></span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Summer Research Programme" /></label>
            <label className="field"><span>Website URL <b>*</b></span><input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://example.com/programme" /></label>
            <label className="field"><span>Monitoring category <b>*</b></span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">Select a category</option><option>Education & Research</option><option>Product & Pricing</option><option>Developer Documentation</option><option>Policy & Regulation</option><option>News & Announcements</option></select></label>
            <label className="field"><span>What information matters most to you? <small>Optional</small></span><textarea value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })} placeholder="e.g. Application dates, eligibility, and required documents" rows={3} /></label>
            {formError && <div className="form-error">{formError}</div>}
            <div className="modal-note"><Icon name="spark" size={16} /><span>The first live check saves a baseline snapshot for future comparisons.</span></div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="primary-button">Add Website <Icon name="arrow" size={16} /></button></div>
          </form>
        </div>
      </div>}

      {toast && <div className="toast"><span><Icon name="check" size={15} /></span>{toast}</div>}
    </div>
  );
}

function MetricCard({ label, value, hint, icon, tone }: { label: string; value: string; hint: string; icon: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon name={icon} size={19} /></div><div><span>{label}</span><strong>{value}</strong><p>{hint}</p></div></article>;
}

export default App;
