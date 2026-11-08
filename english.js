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
  "panelTitle": {
    "message": "Review links"
  },
  "panelCompact": {
    "message": "Links pending: $COUNT$",
    "placeholders": {
      "count": {
        "content": "$1"
      }
    }
  },
  "panelCompactRisk": {
    "message": "⚠ Warnings: $RISK$ · Pending: $BLOCKED$",
    "placeholders": {
      "risk": {
        "content": "$2"
      },
      "blocked": {
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
  "scopePrompt": {
    "message": "Which scope should be approved permanently?"
  },
  "blockScopePrompt": {
    "message": "Which scope should be blocked?"
  },
  "scopePromptShared": {
    "message": "Others can publish content here. Approve only this host."
  },
  "linkDestinationInline": {
    "message": "↗ $HOST$",
    "placeholders": {
      "host": {
        "content": "$1"
      }
    }
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
  "risk_insecureHttp": {
    "message": "HTTP is unencrypted."
  },
  "risk_credentials": {
    "message": "Credentials in the URL."
  },
  "risk_ipAddress": {
    "message": "Direct IP address."
  },
  "risk_unusualPort": {
    "message": "Unusual port."
  },
  "risk_textMismatch": {
    "message": "Link text and destination differ."
  },
  "riskInline_insecureHttp": {
    "message": "⚠ HTTP"
  },
  "riskInline_credentials": {
    "message": "⚠ Credentials in URL"
  },
  "riskInline_ipAddress": {
    "message": "⚠ IP address"
  },
  "riskInline_unusualPort": {
    "message": "⚠ Unusual port"
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
  "reason_insecureHttp": {
    "message": "Link uses unencrypted HTTP"
  },
  "reason_unusualPort": {
    "message": "Link uses an unusual port"
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
    "message": "Blocked domains"
  },
  "blockedHint": {
    "message": "This list overrides approvals and imports. Use *.example.com to block the domain and all subdomains; a temporary approval applies only to this message."
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
    "message": "Import a JSON file or link an HTTPS list. Each list is displayed before activation and applied only after your review. Remote changes require your approval again."
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
    "message": "Remote servers must allow CORS. No message content is sent. At most 64 KiB, 500 hostnames and 20 lists; no redirects. Load lists only from trusted sources."
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
    "message": "List is too large (maximum 64 KiB)."
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
    "message": "Up to 500 hostnames per list."
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
  }
};
