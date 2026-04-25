# Security Policy

## Supported Versions

Only the latest `v0.x` minor release receives security fixes.

## Reporting a Vulnerability

**Do not open a public issue.** Email `info@martincollado.dev` with:
- Description of the issue
- Steps to reproduce
- Affected version(s)
- Suggested mitigation (optional)

You will receive an acknowledgement within 72 hours. Coordinated disclosure timeline: 90 days or on patch release, whichever is sooner.

## Scope

In scope:
- Go engine (`engine/`) — RBAC escape, privilege escalation, DoS
- WebSocket protocol — deserialization, resource exhaustion
- Frontend — XSS from untrusted cluster names, prototype pollution
- Helm chart — insecure defaults, excessive RBAC

Out of scope: browser extensions, user cluster misconfiguration.
