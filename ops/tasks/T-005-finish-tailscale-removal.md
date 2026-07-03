---
id: T-005
owner: founder
state: NEW
gate: none
due: none
---
Housekeeping from KHAVION-AUTOMATION-DESIGN.md §11.7: the root-owned
Tailscale bundle is still on this Mac (logged out, inert). Run
`brew uninstall --cask --zap tailscale-app && sudo rm -f /usr/local/bin/tailscale`
in Terminal with the admin password.
Acceptance: /Applications/Tailscale.app gone; systemextensionsctl list shows
no tailscale entries.
