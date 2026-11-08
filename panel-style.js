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
.link-guard-panel {
  box-sizing: border-box !important;
  display: block !important;
  padding: 0 !important;
  border: 2px solid #b36417 !important;
  border-radius: 10px !important;
  background: #fff9ef !important;
  color: #241900 !important;
  font: 14px/1.45 system-ui, sans-serif !important;
  box-shadow: 0 3px 12px #0001 !important;
}
.link-guard-panel > summary {
  display: list-item !important;
  cursor: pointer !important;
  padding: 9px 13px !important;
  font: 700 13px/1.35 system-ui, sans-serif !important;
  color: #633900 !important;
}
.link-guard-panel > summary.link-guard-summary-risk {
  background: #b42332 !important;
  color: #fff !important;
  border-radius: 8px !important;
}
.link-guard-expanded { padding: 8px 15px 15px !important; }

.link-guard-panel * { box-sizing: border-box !important; font-family: system-ui, sans-serif !important; }
.link-guard-panel h2 { margin: 0 0 5px !important; font-size: 18px !important; color: #241900 !important; }
.link-guard-panel h3 { margin: 15px 0 8px !important; font-size: 14px !important; color: #8b2634 !important; }
.link-guard-panel p { margin: 5px 0 !important; color: #241900 !important; }
.link-guard-summary { font-weight: 700 !important; }
.link-guard-instruction, .link-guard-footer { font-size: 12px !important; }
.link-guard-list { margin: 12px 0 !important; display: grid !important; gap: 8px !important; }
.link-guard-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  flex-wrap: wrap !important;
  gap: 10px !important;
  padding: 10px 12px !important;
  border: 1px solid #d8c9af !important;
  border-radius: 7px !important;
  background: #fff !important;
}
.link-guard-row-info { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 8px !important; }
.link-guard-row-info strong { font-size: 15px !important; color: #1d2430 !important; }
.link-guard-row-info small { font-size: 12px !important; color: #4b5563 !important; }
.link-guard-state { padding: 2px 6px !important; border-radius: 4px !important; font-size: 11px !important; font-weight: 700 !important; }
.link-guard-state-pending { background: #ffefd2 !important; color: #7c3f00 !important; }
.link-guard-state-temporary { background: #e3f0ff !important; color: #174a80 !important; }
.link-guard-state-permanent { background: #e1f4e5 !important; color: #1c6030 !important; }
.link-guard-state-blocked { background: #ffe3e6 !important; color: #8b2634 !important; }
.link-guard-actions { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
.link-guard-actions button {
  appearance: none !important;
  padding: 6px 9px !important;
  border: 1px solid #516173 !important;
  border-radius: 5px !important;
  background: #fff !important;
  color: #1d2430 !important;
  font: 600 12px system-ui, sans-serif !important;
  cursor: pointer !important;
}
.link-guard-actions button:hover { background: #eaf0f8 !important; }
.link-guard-actions button:focus-visible { outline: 2px solid #174a80 !important; outline-offset: 2px !important; }
.link-guard-actions button:disabled { opacity: .55 !important; cursor: default !important; }
.link-guard-scope-choice { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
.link-guard-scope-choice p { flex-basis: 100% !important; font-weight: 700 !important; }
.link-guard-risk-confirm { display: flex !important; flex-wrap: wrap !important; gap: 7px !important; max-width: 430px !important; }
.link-guard-risk-confirm strong { flex-basis: 100% !important; padding: 8px !important; border: 2px solid #b42332 !important; border-radius: 5px !important; background: #fff0f1 !important; color: #8b1422 !important; font-size: 13px !important; }
.link-guard-risk { display: block !important; flex-basis: 100% !important; color: #9d1725 !important; font-size: 13px !important; }
.link-guard-unsafe, .link-guard-error {
  padding: 7px 9px !important;
  border-left: 3px solid #a82232 !important;
  background: #fff0f1 !important;
  color: #7c1d2a !important;
  font-size: 12px !important;
}
`;
