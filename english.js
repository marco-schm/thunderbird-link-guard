"use strict";

globalThis.LinkGuardEnglish = {
  "extensionName": {
    "message": "Link Guard"
  },
  "extensionDescription": {
    "message": "Checks web links in email and requires explicit approval for suspicious destinations."
  },
  "optionsAction": {
    "message": "Link Guard – open settings"
  },
  "toolbarInitial": {
    "message": "Link Guard is checking links in this message"
  },
  "toolbarDisabled": {
    "message": "Link Guard is disabled"
  },
  "toolbarOverflow": {
    "message": "Link Guard: too many links; remaining links are blocked"
  },
  "toolbarPending": {
    "message": "Link Guard: $COUNT$ blocked links",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "toolbarClear": {
    "message": "Link Guard: no blocked web links"
  },
  "toolbarRisk": {
    "message": "Link Guard: $COUNT$ suspicious domains",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "panelSummary": {
    "message": "$TOTAL$ web links checked · $BLOCKED$ blocked",
    "placeholders": {
      "total": {
        "content": "$1"
      },
      "blocked": {
        "content": "$2"
      }
    }
  },
  "panelInstruction": {
    "message": "Check the destination independently of this email. Permanent approval can cover the exact host or the entire domain. Public short links require an extra confirmation for this message."
  },
  "linksForHost": {
    "message": "Links in this email: $COUNT$",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "status_pending": {
    "message": "Not approved"
  },
  "status_temporary": {
    "message": "For this message"
  },
  "status_permanent": {
    "message": "Permanently approved"
  },
  "status_broad": {
    "message": "Approved via whole domain"
  },
  "status_blocked": {
    "message": "Blocked"
  },
  "allowTemporary": {
    "message": "Allow temporarily"
  },
  "allowPermanent": {
    "message": "Allow permanently"
  },
  "blockHost": {
    "message": "Block"
  },
  "unblockHost": {
    "message": "Unblock"
  },
  "unblockConfirm": {
    "message": "Unblock $HOST$? Links to it will no longer be blocked in any message.",
    "placeholders": {
      "host": {
        "content": "$1"
      }
    }
  },
  "unblockDomainConfirm": {
    "message": "Unblock $DOMAIN$ and all its subdomains? Links to them will no longer be blocked in any message.",
    "placeholders": {
      "domain": {
        "content": "$1"
      }
    }
  },
  "blockedByList": {
    "message": "Blocked by an imported list. You can change the list in Settings."
  },
  "openSettings": {
    "message": "Open settings"
  },
  "linkDestinationInline": {
    "message": "↗ $HOST$",
    "placeholders": {
      "host": {
        "content": "$1"
      }
    }
  },
  "riskIdn": {
    "message": "Similar-looking characters may be present."
  },
  "riskLookalike": {
    "message": "Resembles $DOMAIN$.",
    "placeholders": {
      "domain": {
        "content": "$1"
      }
    }
  },
  "riskIdnInline": {
    "message": "⚠ Similar characters"
  },
  "riskLookalikeInline": {
    "message": "⚠ Similar to $DOMAIN$",
    "placeholders": {
      "domain": {
        "content": "$1"
      }
    }
  },
  "riskUnverified": {
    "message": "Domain check unavailable."
  },
  "riskUnverifiedInline": {
    "message": "⚠ Domain unchecked"
  },
  "risk_credentials": {
    "message": "Credentials in the URL."
  },
  "risk_ipAddress": {
    "message": "Direct IP address."
  },
  "risk_textMismatch": {
    "message": "Link text and destination differ."
  },
  "riskInline_credentials": {
    "message": "⚠ Credentials in URL"
  },
  "riskInline_ipAddress": {
    "message": "⚠ IP address"
  },
  "riskInline_textMismatch": {
    "message": "⚠ Text ≠ destination"
  },
  "unsafeTitle": {
    "message": "Links that cannot be approved"
  },
  "unknownHost": {
    "message": "Unknown destination"
  },
  "reason_invalidUrl": {
    "message": "Link target is invalid or too long"
  },
  "reason_badScheme": {
    "message": "Link uses an unsupported protocol"
  },
  "reason_credentials": {
    "message": "Link target contains credentials"
  },
  "reason_ipAddress": {
    "message": "Link leads directly to an IP address"
  },
  "reason_textMismatch": {
    "message": "Displayed and actual domains differ"
  },
  "reason_redirectUnsafe": {
    "message": "Redirect target is unsafe or cannot be checked"
  },
  "overflowNotice": {
    "message": "More than 500 links: Additional links remain blocked and are not listed here."
  },
  "exactHostNotice": {
    "message": "Parent and subdomains are always separate. Displayed link text can be misleading."
  },
  "stateUnavailable": {
    "message": "Approvals could not be loaded. Web links remain blocked."
  },
  "saveFailed": {
    "message": "Decision could not be saved. The link remains blocked."
  },
  "settingsTitle": {
    "message": "Link Guard settings"
  },
  "settingsSubtitle": {
    "message": "Choose which exact hostnames you trust for web links in email."
  },
  "enabledLabel": {
    "message": "Enable Link Guard"
  },
  "enabledHint": {
    "message": "Disabling protection makes links directly clickable again."
  },
  "destinationsLabel": {
    "message": "Show link destinations"
  },
  "destinationsHint": {
    "message": "Shows the real domain next to links whose text does not name it. Turn it off if it breaks a message's layout. Warnings are always shown, and the panel always names every destination."
  },
  "hostCount": {
    "message": "Hostnames: $COUNT$",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "customTitle": {
    "message": "My permanent approvals"
  },
  "customHint": {
    "message": "Domains approved permanently in a message appear here. You can also edit them directly."
  },
  "blockedTitle": {
    "message": "Blocked hosts"
  },
  "blockedHint": {
    "message": "Blocks exactly these hosts. This list overrides approvals and imports; a temporary approval applies only to this message."
  },
  "blockedDomainsTitle": {
    "message": "Block whole domains"
  },
  "blockedDomainsHint": {
    "message": "Use *.example.com to block the domain and all its subdomains, including example.com. This list overrides approvals and imports."
  },
  "broadTitle": {
    "message": "Approve whole domains"
  },
  "broadHint": {
    "message": "Use *.example.com to approve the domain and its subdomains, including example.com. Shared-content hosts stay separate; use broad approval only for domains you control."
  },
  "broadInvalid": {
    "message": "$DOMAIN$ is not a registrable domain according to the bundled Public Suffix List.",
    "placeholders": {
      "domain": {
        "content": "$1"
      }
    }
  },
  "importsTitle": {
    "message": "Custom and remote lists"
  },
  "importsHint": {
    "message": "Import a JSON file or link an HTTPS list. Each list is displayed before activation and applied only after your review. Remote allowlist changes require your approval again."
  },
  "importFileLabel": {
    "message": "Choose a JSON file"
  },
  "importUrlLabel": {
    "message": "HTTPS URL of a JSON list"
  },
  "previewRemote": {
    "message": "Check remote list"
  },
  "importSecurityHint": {
    "message": "Remote servers must allow CORS. No message content is sent. At most 512 KiB, 5,000 hostnames and 20 lists; no redirects. Load lists only from trusted sources."
  },
  "importPreviewTitle": {
    "message": "Preview"
  },
  "refreshTitle": {
    "message": "Review update"
  },
  "stageImport": {
    "message": "Stage as disabled list"
  },
  "stageRefresh": {
    "message": "Stage update"
  },
  "cancelPreview": {
    "message": "Cancel"
  },
  "refreshPreview": {
    "message": "Review remote update"
  },
  "removeList": {
    "message": "Remove list"
  },
  "importStaged": {
    "message": "List staged. Save below to apply."
  },
  "importReady": {
    "message": "List checked. Review hostnames in the preview."
  },
  "importLoading": {
    "message": "Loading and checking list …"
  },
  "importTooLarge": {
    "message": "List is too large (maximum $SIZE$ KiB).",
    "placeholders": {
      "size": {
        "content": "$1"
      }
    }
  },
  "importFormat": {
    "message": "Invalid list format. Expected: format, version, name, category, and hosts."
  },
  "importDuplicate": {
    "message": "List contains a duplicate hostname."
  },
  "importUrl": {
    "message": "Only an HTTPS file URL without credentials, port, query, or fragment is allowed."
  },
  "importFetch": {
    "message": "Remote list could not be loaded safely. Check HTTPS, JSON, CORS, and redirects."
  },
  "importListLimit": {
    "message": "At most 20 imported lists."
  },
  "importEmpty": {
    "message": "An imported list must not be empty."
  },
  "category_news": {
    "message": "News"
  },
  "category_social": {
    "message": "Social media"
  },
  "category_companies": {
    "message": "Companies"
  },
  "category_other": {
    "message": "Other"
  },
  "hostListLabel": {
    "message": "One rule per line"
  },
  "saveSettings": {
    "message": "Save changes"
  },
  "settingsSaved": {
    "message": "Settings saved."
  },
  "settingsLoadFailed": {
    "message": "Settings could not be loaded."
  },
  "settingsSaveFailed": {
    "message": "Settings could not be saved."
  },
  "settingsChanged": {
    "message": "Lists changed elsewhere. Reload this page before saving."
  },
  "invalidHostLine": {
    "message": "Invalid hostname on line $LINE$.",
    "placeholders": {
      "line": {
        "content": "$1"
      }
    }
  },
  "hostLimit": {
    "message": "Up to $LIMIT$ hostnames per list.",
    "placeholders": {
      "limit": {
        "content": "$1"
      }
    }
  },
  "hostFormatHint": {
    "message": "Exact hosts have no wildcard. A whole-domain rule uses *.example.com and includes example.com itself."
  },
  "exactHostExample": {
    "message": "login.google.de and google.de are different hostnames and require separate approvals."
  },
  "risk_shortLink": {
    "message": "Short link: destination hidden."
  },
  "riskInline_shortLink": {
    "message": "⚠ Short link"
  },
  "risk_scriptInUrl": {
    "message": "The link contains script or HTML code."
  },
  "riskInline_scriptInUrl": {
    "message": "⚠ Code in link"
  },
  "risk_redirect": {
    "message": "Possible redirect to $HOST$ (not approved).",
    "placeholders": {
      "host": {
        "content": "$1"
      }
    }
  },
  "riskInline_redirect": {
    "message": "⚠ Redirect → $HOST$",
    "placeholders": {
      "host": {
        "content": "$1"
      }
    }
  },
  "note_namedTarget": {
    "message": "Names $TARGET$, but $HOST$ decides where the link really leads.",
    "placeholders": {
      "target": {
        "content": "$1"
      },
      "host": {
        "content": "$2"
      }
    }
  },
  "riskyApprovalWarning": {
    "message": "This short link hides its destination. Allow it for this message?"
  },
  "riskyApprovalConfirm": {
    "message": "Allow for this message"
  },
  "importedEnable": {
    "message": "Enable list"
  },
  "listViewEdit": {
    "message": "View and edit list"
  },
  "listHosts": {
    "message": "Exact hostnames in this list"
  },
  "kind_allow": {
    "message": "Allowlist"
  },
  "kind_block": {
    "message": "Blocklist"
  },
  "listBlockedHosts": {
    "message": "Blocked entries in this list (*.example.com blocks the domain and all subdomains)"
  },
  "importBlockHint": {
    "message": "A list with \"kind\": \"block\" is a blocklist. Once enabled, it overrides approvals and imported allowlists, and may contain *.example.com entries. Blocklists can optionally update themselves about once a day; allowlists never do."
  },
  "autoRefreshLabel": {
    "message": "Update automatically about once a day (replaces local edits)"
  },
  "autoRefreshKind": {
    "message": "The source now declares a different list type, so the list was not changed. Review it manually."
  },
  "autoRefreshOk": {
    "message": "Last automatic check: $DATE$",
    "placeholders": {
      "date": {
        "content": "$1"
      }
    }
  },
  "autoRefreshFailed": {
    "message": "Automatic update failed on $DATE$. The previous list stays active.",
    "placeholders": {
      "date": {
        "content": "$1"
      }
    }
  },
  "autoRefreshReview": {
    "message": "The automatic update was not applied because it is large or would block something you approved. The previous list stays active; use \"Review remote update\"."
  },
  "warningsTitle": {
    "message": "Warnings"
  },
  "warningsHint": {
    "message": "Choose which checks raise a warning and add your own. A link with a warning stays inactive until you approve its exact host."
  },
  "builtinWarningsTitle": {
    "message": "Built-in warnings"
  },
  "builtinWarningsHint": {
    "message": "Switching a warning off also drops the extra approval it requires. A link whose check failed always shows a warning."
  },
  "warn_lookalike": {
    "message": "Domain resembles an approved domain"
  },
  "warn_idn": {
    "message": "Internationalized domain name"
  },
  "warn_textMismatch": {
    "message": "Link text shows a different host"
  },
  "warn_credentials": {
    "message": "User name or password in the link"
  },
  "warn_ipAddress": {
    "message": "IP address instead of a host name"
  },
  "warn_shortLink": {
    "message": "Public URL shortener"
  },
  "warn_scriptInUrl": {
    "message": "Script or HTML code in the link"
  },
  "warn_redirect": {
    "message": "Link redirects to a site you have not approved"
  },
  "customRulesTitle": {
    "message": "My warning rules"
  },
  "customRulesHint": {
    "message": "A rule shows its label as a warning when its pattern matches the host, the full URL or the link text. Patterns are case-insensitive regular expressions of up to 200 characters without backreferences, lookaround or \\b, and are matched in linear time."
  },
  "ruleLabel": {
    "message": "Label"
  },
  "ruleTarget": {
    "message": "Checks"
  },
  "rulePattern": {
    "message": "Pattern"
  },
  "ruleTarget_host": {
    "message": "Host"
  },
  "ruleTarget_url": {
    "message": "Full URL"
  },
  "ruleTarget_text": {
    "message": "Link text"
  },
  "addRule": {
    "message": "Add rule"
  },
  "removeRule": {
    "message": "Remove"
  },
  "ruleInvalid": {
    "message": "Rule $NUMBER$: $REASON$",
    "placeholders": {
      "number": {
        "content": "$1"
      },
      "reason": {
        "content": "$2"
      }
    }
  },
  "regexSyntax": {
    "message": "the pattern is not a valid regular expression."
  },
  "regexTooLong": {
    "message": "the pattern is longer than 200 characters."
  },
  "regexUnsupported": {
    "message": "backreferences, lookaround, \\b and \\u escapes are not supported."
  },
  "regexTooComplex": {
    "message": "the pattern is too complex."
  },
  "labelInvalid": {
    "message": "the label needs 1 to 60 characters without control characters."
  },
  "ruleFormat": {
    "message": "the rule is incomplete."
  },
  "warningRuleLimit": {
    "message": "Too many warning rules: at most 50 of your own and 200 in effect."
  },
  "warningListsTitle": {
    "message": "Warning lists"
  },
  "warningListsHint": {
    "message": "Import rules from a JSON file or an HTTPS URL. Lists are shown for review and start disabled. They can only add warnings, never approve a link, and remote lists change only when you refresh them."
  },
  "warningListFormat": {
    "message": "Invalid warning list. Expected: format \"link-guard-warnings\", version 1, name, and rules."
  },
  "warningListLimit": {
    "message": "At most 10 warning lists."
  },
  "ruleCount": {
    "message": "Rules: $COUNT$",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "warningListPreviewTitle": {
    "message": "Warning list preview"
  },
  "riskCustom": {
    "message": "$SOURCE$: $LABEL$",
    "placeholders": {
      "label": {
        "content": "$1"
      },
      "source": {
        "content": "$2"
      }
    }
  },
  "riskCustomInline": {
    "message": "⚠ $LABEL$",
    "placeholders": {
      "label": {
        "content": "$1"
      }
    }
  },
  "ruleSourceOwn": {
    "message": "My rule"
  },
  "riskCustomSkipped": {
    "message": "Warning rules could not be checked for this link."
  },
  "riskCustomSkippedInline": {
    "message": "⚠ Rules not checked"
  },
  "showRules": {
    "message": "Show rules"
  },
  "panelTitleDanger": {
    "message": "Suspicious links in this message"
  },
  "panelTitleBlocked": {
    "message": "This message links to blocked sites"
  },
  "panelTitlePending": {
    "message": "Links in this message are waiting for approval"
  },
  "countWarnings": {
    "message": "Warnings: $COUNT$",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "countPending": {
    "message": "Not approved: $COUNT$",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "countBlocked": {
    "message": "Blocked: $COUNT$",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "countLinks": {
    "message": "Links: $COUNT$",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "sectionAttention": {
    "message": "Needs attention"
  },
  "sectionPending": {
    "message": "Not yet approved"
  },
  "sectionBlocked": {
    "message": "Blocked"
  },
  "sectionApproved": {
    "message": "Approved"
  },
  "moreActions": {
    "message": "More actions for $HOST$",
    "placeholders": {
      "host": {
        "content": "$1"
      }
    }
  },
  "showLinks": {
    "message": "Show links ($COUNT$)",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "hideLinks": {
    "message": "Hide links"
  },
  "showInMessage": {
    "message": "Show in message"
  },
  "noLinkText": {
    "message": "(no link text)"
  },
  "allowDomain": {
    "message": "Allow $DOMAIN$ and all subdomains",
    "placeholders": {
      "domain": {
        "content": "$1"
      }
    }
  },
  "blockDomain": {
    "message": "Block $DOMAIN$ and all subdomains",
    "placeholders": {
      "domain": {
        "content": "$1"
      }
    }
  },
  "scopePrompt": {
    "message": "Which scope should be approved permanently?"
  },
  "blockScopePrompt": {
    "message": "Which scope should be blocked?"
  },
  "scopeExact": {
    "message": "Only $HOST$",
    "placeholders": {
      "host": {
        "content": "$1"
      }
    }
  },
  "scopeBroad": {
    "message": "$DOMAIN$ and all subdomains",
    "placeholders": {
      "domain": {
        "content": "$1"
      }
    }
  }
};
