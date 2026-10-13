# Local session core

Bocal does not currently have a live cross-device multiplayer transport. Its beta build now has an
opt-in bridge to the authoritative `dev.aarso:local-session-core` module in Shared-Libraries-asoc.
That module owns session identity, packet vocabulary, event ordering and duplicate suppression.
Bocal's beta bridge now exposes the shared TCP local-network transport as well. The bridge can pass
a six-digit pairing code to the shared handshake before accepting packets. The shared transport also
rejects frames larger than 64 KiB. Bocal remains responsible for discovery, code display/entry,
reconnect policy, encryption/platform identity and mapping instrument events.

Build the separate beta variant with the optional shared library. This variant
has Android's `INTERNET` permission for TCP peer connections; standard debug and
release builds do not include the beta bridge or that permission.

```bash
./gradlew -PsharedLibrariesDir=/absolute/path/to/Shared-Libraries-asoc assembleBeta
```

The bridge is intentionally not enabled in ordinary builds until a real transport and physical
two-device acceptance run exist.
