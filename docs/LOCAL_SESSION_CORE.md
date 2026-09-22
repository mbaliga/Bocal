# Local session core

Bocal does not currently have a live cross-device multiplayer transport. Its beta build now has an
opt-in bridge to the authoritative `dev.aarso:local-session-core` module in Shared-Libraries-asoc.
That module owns session identity, packet vocabulary, event ordering and duplicate suppression.
Bocal's beta bridge now exposes the shared TCP local-network transport as well. The bridge can pass
a six-digit pairing code to the shared handshake before accepting packets; Bocal remains responsible
for discovery, code display/entry, reconnect policy, encryption/platform identity and mapping
instrument events.

Build the beta bridge with:

```bash
./gradlew -PsharedLibrariesDir=/absolute/path/to/Shared-Libraries-asoc assembleDebug
```

The bridge is intentionally not enabled in ordinary builds until a real transport and physical
two-device acceptance run exist.
