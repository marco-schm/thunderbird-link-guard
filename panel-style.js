"use strict";

// Inline styles cannot reach a host's pseudo-elements, so message CSS could inject text
// with ::before/::after or fade it with ::first-line/::first-letter. Rules inside the
// host's shadow tree win over the message's rules when both are !important, so every
// shadow root Link Guard puts on the page (panel and inline labels) starts with these.
globalThis.LinkGuardHostGuardCss = `
:host::before, :host::after { content: none !important; display: none !important; }
:host::first-line, :host::first-letter {
  color: inherit !important; background: transparent !important; font: inherit !important;
  text-decoration: inherit !important; text-shadow: none !important;
}
`;

// Styles for the Link Guard panel. They live in a JavaScript string because the panel is
// rendered inside a closed shadow root, which document-level stylesheets cannot reach and
// which message-authored CSS cannot target.
globalThis.LinkGuardPanelCss = globalThis.LinkGuardHostGuardCss + `
/* Thunderbird look: neutral greys, Thunderbird blue, small radii, the system font. The
   colour tokens are set on the panel itself, so values a message sets on its own
   elements cannot be inherited into the shadow tree. */
.link-guard-panel {
  --lg-surface: #ffffff !important; --lg-surface-2: #f4f4f5 !important; --lg-surface-3: #e4e4e7 !important;
  --lg-border: #d4d4d8 !important; --lg-border-soft: #e4e4e7 !important;
  --lg-text: #18181b !important; --lg-text-2: #52525b !important; --lg-text-3: #71717a !important;
  --lg-accent: #1373d9 !important; --lg-accent-hover: #0b4cba !important; --lg-accent-text: #0b4cba !important;
  --lg-on-accent: #ffffff !important; --lg-accent-tint: #eff6ff !important;
  --lg-danger: #b91c1c !important; --lg-danger-strong: #dc2626 !important; --lg-danger-tint: #fef2f2 !important; --lg-danger-line: #fecaca !important;
  --lg-warning: #92400e !important; --lg-warning-strong: #d97706 !important; --lg-warning-tint: #fffbeb !important; --lg-warning-line: #fde68a !important;
  --lg-success: #15803d !important; --lg-success-tint: #f0fdf4 !important; --lg-success-line: #bbf7d0 !important;
  --lg-info: #1d4ed8 !important; --lg-info-tint: #eff6ff !important; --lg-info-line: #bfdbfe !important;
  --lg-shadow: 0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08) !important;
  box-sizing: border-box !important;
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 1px solid var(--lg-border) !important;
  border-radius: 6px !important;
  background: var(--lg-surface-2) !important;
  color: var(--lg-text) !important;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Ubuntu, Cantarell, sans-serif !important;
  text-align: start !important;
  overflow: hidden !important;
  box-shadow: var(--lg-shadow) !important;
}
@media (prefers-color-scheme: dark) {
  .link-guard-panel {
    --lg-surface: #27272a !important; --lg-surface-2: #1f1f23 !important; --lg-surface-3: #3f3f46 !important;
    --lg-border: #3f3f46 !important; --lg-border-soft: #34343a !important;
    --lg-text: #f4f4f5 !important; --lg-text-2: #d4d4d8 !important; --lg-text-3: #a1a1aa !important;
    --lg-accent: #1373d9 !important; --lg-accent-hover: #3b8fe8 !important; --lg-accent-text: #7cb6f5 !important;
    --lg-accent-tint: #172a45 !important;
    --lg-danger: #fca5a5 !important; --lg-danger-strong: #f87171 !important; --lg-danger-tint: #3b1214 !important; --lg-danger-line: #7f1d1d !important;
    --lg-warning: #fcd34d !important; --lg-warning-strong: #f59e0b !important; --lg-warning-tint: #3a2508 !important; --lg-warning-line: #78350f !important;
    --lg-success: #86efac !important; --lg-success-tint: #0f2a1a !important; --lg-success-line: #166534 !important;
    --lg-info: #93c5fd !important; --lg-info-tint: #172a45 !important; --lg-info-line: #1e3a8a !important;
    --lg-shadow: 0 1px 3px rgba(0,0,0,.4) !important;
  }
}
/* The panel takes focus when an inactive link is clicked; its summary shows the ring. */
.link-guard-panel:focus { outline: none !important; }
.link-guard-panel * { box-sizing: border-box !important; font-family: inherit !important; letter-spacing: normal !important; }
.link-guard-panel p, .link-guard-panel h3, .link-guard-panel ul { margin: 0 !important; }
.link-guard-panel ul { padding: 0 !important; list-style: none !important; }

/* Summary bar: Thunderbird's notification bar */
.lg-summary {
  display: flex !important; align-items: center !important; gap: 10px !important;
  padding: 9px 12px !important; cursor: pointer !important; list-style: none !important;
  background: var(--lg-warning-tint) !important; color: var(--lg-text) !important;
  border-inline-start: 4px solid var(--lg-warning-strong) !important;
}
.lg-summary::-webkit-details-marker, .lg-summary::marker { display: none !important; content: "" !important; }
.link-guard-panel[data-tone="danger"] > .lg-summary, .link-guard-panel[data-tone="blocked"] > .lg-summary {
  background: var(--lg-danger-tint) !important; border-inline-start-color: var(--lg-danger-strong) !important;
}
.lg-summary:focus-visible { outline: 2px solid var(--lg-accent) !important; outline-offset: -2px !important; }
.lg-summary-icon { width: 20px !important; height: 20px !important; color: var(--lg-warning-strong) !important; }
.link-guard-panel[data-tone="danger"] .lg-summary-icon, .link-guard-panel[data-tone="blocked"] .lg-summary-icon { color: var(--lg-danger-strong) !important; }
.lg-summary-text { display: flex !important; flex-direction: column !important; flex: 1 1 auto !important; min-width: 0 !important; }
.lg-summary-title { font-weight: 600 !important; font-size: 14px !important; color: var(--lg-text) !important; }
.lg-summary-counts { font-size: 12px !important; color: var(--lg-text-2) !important; }
.lg-summary-chevron { width: 16px !important; height: 16px !important; color: var(--lg-text-2) !important; transform: rotate(90deg) !important; transition: transform .12s !important; }
.link-guard-panel[open] .lg-summary-chevron { transform: rotate(-90deg) !important; }
.link-guard-panel[open] > .lg-summary { border-bottom: 1px solid var(--lg-border) !important; }

/* Body, sections, cards */
.lg-body { display: flex !important; flex-direction: column !important; gap: 14px !important; padding: 12px !important; }
.lg-section { display: flex !important; flex-direction: column !important; gap: 8px !important; }
.lg-section-title, .lg-section-toggle {
  display: flex !important; align-items: center !important; gap: 6px !important;
  font-size: 13px !important; font-weight: 600 !important; color: var(--lg-text) !important;
}
.lg-count {
  display: inline-flex !important; align-items: center !important; justify-content: center !important;
  min-width: 20px !important; height: 18px !important; padding: 0 6px !important;
  border-radius: 9px !important; background: var(--lg-surface-3) !important; color: var(--lg-text-2) !important;
  font-size: 11px !important; font-weight: 600 !important;
}
.lg-card {
  display: flex !important; flex-direction: column !important; gap: 8px !important; min-width: 0 !important;
  padding: 10px 12px !important; border: 1px solid var(--lg-border) !important; border-radius: 6px !important;
  background: var(--lg-surface) !important;
}
.lg-card-risk { border-color: var(--lg-danger-line) !important; box-shadow: inset 3px 0 0 var(--lg-danger-strong) !important; }
.lg-card-blocked { background: var(--lg-surface-2) !important; }
.lg-card-head, .lg-compact-row { display: flex !important; align-items: center !important; gap: 8px !important; min-width: 0 !important; }
.lg-icon { width: 18px !important; height: 18px !important; flex: 0 0 auto !important; fill: none !important;
  stroke: currentColor !important; stroke-width: 1.5 !important; stroke-linecap: round !important; stroke-linejoin: round !important; }
.lg-icon-small { width: 14px !important; height: 14px !important; }
.lg-host-icon { color: var(--lg-text-3) !important; }
.lg-ok { color: var(--lg-success) !important; }
.lg-host-name { flex: 1 1 auto !important; min-width: 0 !important; overflow-wrap: anywhere !important; color: var(--lg-text-2) !important; font-size: 14px !important; }
.lg-host-name strong { color: var(--lg-text) !important; font-weight: 600 !important; }
.lg-badge {
  flex: 0 0 auto !important; padding: 1px 7px !important; border-radius: 4px !important; border: 1px solid transparent !important;
  font-size: 11px !important; font-weight: 600 !important; line-height: 16px !important; white-space: nowrap !important;
}
.lg-badge-danger { background: var(--lg-danger-tint) !important; color: var(--lg-danger) !important; border-color: var(--lg-danger-line) !important; }
.lg-badge-warning { background: var(--lg-warning-tint) !important; color: var(--lg-warning) !important; border-color: var(--lg-warning-line) !important; }
.lg-badge-success { background: var(--lg-success-tint) !important; color: var(--lg-success) !important; border-color: var(--lg-success-line) !important; }
.lg-badge-info { background: var(--lg-info-tint) !important; color: var(--lg-info) !important; border-color: var(--lg-info-line) !important; }

/* Warnings and hints */
.link-guard-panel .link-guard-risk { display: block !important; margin: 0 !important; }
.link-guard-panel .link-guard-risk-box {
  display: flex !important; align-items: flex-start !important; gap: 7px !important;
  padding: 5px 8px !important; border-radius: 4px !important;
  background: var(--lg-danger-tint) !important; color: var(--lg-danger) !important;
  font-size: 13px !important; font-weight: 500 !important; line-height: 1.4 !important;
}
.link-guard-panel .link-guard-note .link-guard-risk-box { background: var(--lg-warning-tint) !important; color: var(--lg-warning) !important; }
.link-guard-panel .lg-icon-mark { stroke: var(--lg-surface) !important; }
.link-guard-panel .lg-icon-dot { fill: var(--lg-surface) !important; }
.link-guard-panel .link-guard-risk-icon { flex: 0 0 16px !important; width: 16px !important; height: 16px !important; margin-top: 1px !important; }

/* Buttons: Thunderbird's in-content buttons */
.link-guard-panel button {
  appearance: none !important; display: inline-flex !important; align-items: center !important; gap: 5px !important;
  min-height: 28px !important; padding: 4px 11px !important; margin: 0 !important;
  border: 1px solid var(--lg-border) !important; border-radius: 4px !important;
  background: var(--lg-surface-3) !important; color: var(--lg-text) !important;
  font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", Ubuntu, Cantarell, sans-serif !important;
  text-align: start !important; cursor: pointer !important;
}
.link-guard-panel button:hover { filter: brightness(.95) !important; }
.link-guard-panel button:focus-visible { outline: 2px solid var(--lg-accent) !important; outline-offset: 1px !important; }
.link-guard-panel button:disabled { opacity: .5 !important; cursor: default !important; filter: none !important; }
.link-guard-panel .lg-btn-primary { background: var(--lg-accent) !important; border-color: var(--lg-accent) !important; color: var(--lg-on-accent) !important; }
.link-guard-panel .lg-btn-primary:hover { background: var(--lg-accent-hover) !important; filter: none !important; }
.link-guard-panel .lg-btn-subtle-danger { background: transparent !important; border-color: transparent !important; color: var(--lg-danger) !important; }
.link-guard-panel .lg-btn-subtle-danger:hover { background: var(--lg-danger-tint) !important; filter: none !important; }
.link-guard-panel .lg-btn-menu { width: 100% !important; background: transparent !important; border-color: transparent !important; }
.link-guard-panel .lg-btn-menu:hover { background: var(--lg-surface-3) !important; filter: none !important; }
.link-guard-panel .lg-btn-small { min-height: 24px !important; padding: 2px 8px !important; font-size: 12px !important; background: transparent !important; color: var(--lg-accent-text) !important; border-color: transparent !important; }
.link-guard-panel .lg-btn-small:hover { background: var(--lg-accent-tint) !important; filter: none !important; }
.link-guard-panel .lg-icon-btn {
  min-height: 0 !important; width: 28px !important; height: 28px !important; padding: 0 !important; justify-content: center !important;
  background: transparent !important; border-color: transparent !important; color: var(--lg-text-2) !important;
}
.link-guard-panel .lg-icon-btn:hover, .link-guard-panel .lg-icon-btn[aria-expanded="true"] { background: var(--lg-surface-3) !important; filter: none !important; }
.link-guard-panel .lg-toggle {
  min-height: 0 !important; padding: 2px 4px 2px 0 !important; width: fit-content !important;
  background: transparent !important; border-color: transparent !important; color: var(--lg-accent-text) !important; font-size: 12px !important;
}
.link-guard-panel .lg-toggle:hover { text-decoration: underline !important; filter: none !important; }
.link-guard-panel .lg-section-toggle { color: var(--lg-text) !important; font-size: 13px !important; font-weight: 600 !important; }
.lg-chevron { transition: transform .12s !important; }
.lg-toggle[aria-expanded="true"] .lg-chevron { transform: rotate(90deg) !important; }
.lg-actions { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 6px !important; }
.lg-menu { display: flex !important; flex-direction: column !important; gap: 2px !important; padding: 4px !important;
  border: 1px solid var(--lg-border-soft) !important; border-radius: 4px !important; background: var(--lg-surface-2) !important; }

/* Links of a host */
.lg-links { display: flex !important; flex-direction: column !important; border-top: 1px solid var(--lg-border-soft) !important; }
.lg-link { display: flex !important; flex-direction: column !important; align-items: flex-start !important; gap: 2px !important;
  padding: 7px 0 !important; border-bottom: 1px solid var(--lg-border-soft) !important; min-width: 0 !important; }
.lg-link:last-child { border-bottom: 0 !important; padding-bottom: 0 !important; }
.lg-link-text { font-size: 13px !important; color: var(--lg-text) !important; overflow-wrap: anywhere !important; }
.lg-empty { color: var(--lg-text-3) !important; font-style: italic !important; }
.lg-link-url { max-width: 100% !important; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  color: var(--lg-text-3) !important; word-break: break-all !important; user-select: text !important; }

/* Approved hosts */
.lg-compact { gap: 0 !important; padding: 2px 0 !important; }
.lg-compact-row { padding: 6px 12px !important; }
.lg-compact-row + .lg-compact-row, .lg-compact-detail + .lg-compact-row { border-top: 1px solid var(--lg-border-soft) !important; }
.lg-compact-detail { padding: 0 12px 8px 38px !important; }
.lg-compact-detail.lg-menu { margin: 0 12px 8px 38px !important; padding: 4px !important; }

/* Confirmations, notes and errors */
.link-guard-risk-confirm { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
.link-guard-risk-confirm strong { flex-basis: 100% !important; padding: 7px 9px !important; border: 1px solid var(--lg-danger-line) !important;
  border-radius: 4px !important; background: var(--lg-danger-tint) !important; color: var(--lg-danger) !important; font-size: 13px !important; font-weight: 600 !important; }
.link-guard-scope-choice { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 6px !important; }
.link-guard-scope-choice p { flex-basis: 100% !important; margin: 0 0 2px !important; color: var(--lg-text) !important; font-size: 13px !important; font-weight: 600 !important; }
.link-guard-panel .link-guard-blocked-note { flex-basis: 100% !important; color: var(--lg-text-2) !important; font-size: 12px !important; }
.lg-footnote { font-size: 12px !important; color: var(--lg-text-2) !important; }
.lg-error { padding: 7px 9px !important; border-radius: 4px !important; background: var(--lg-danger-tint) !important; color: var(--lg-danger) !important; font-size: 13px !important; }
@media (prefers-reduced-motion: reduce) { .link-guard-panel * { transition: none !important; } }
`;
