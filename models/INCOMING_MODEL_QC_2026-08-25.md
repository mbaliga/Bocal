# Incoming third-party model QC — 2026-08-25

## Decision

**No supplied archive is approved for repository import or runtime use.**

Each archive is a structurally readable OBJ bundle, but none contains a license,
author/source URL, acquisition record, units/orientation declaration, source
checksum manifest, or player-reviewed fingering map. A filename containing
"Free" is not a commercial-use license. The duplicate Bassoon archive has the
same listed contents and is treated as one candidate.

These files may be reconsidered only after a rights holder or marketplace record
supplies commercial-use terms, attribution text, immutable source URL and
acquisition date. Any later educational use also requires a scale/orientation
review and an instrument-specific player/teacher sign-off. Until then, they are
not copied into `models/`, Android assets, or the web runtime.

## Structural inspection

| Candidate | OBJ vertices | OBJ faces | Structural result | Release decision |
| --- | ---: | ---: | --- | --- |
| Bugle v02 | 12,162 | 12,160 | OBJ/MTL/preview present | Rejected: provenance/license absent |
| Bassoon v1 | 74,984 | 76,294 | OBJ/MTL/preview present | Rejected: provenance/license/fingering evidence absent |
| Clarinet v05 | 52,966 | 52,816 | OBJ/MTL/preview present | Rejected: provenance/license/fingering evidence absent |
| Electric Guitar v03 | 15,562 | 15,470 | OBJ/MTL/preview present | Rejected: provenance/license absent |
| Electric Bass v01 | 14,938 | 14,856 | OBJ/MTL/preview present | Rejected: provenance/license absent |
| English Horn v1 | 74,380 | 74,240 | OBJ/MTL/preview present | Rejected: provenance/license/fingering evidence absent |
| Pedal Harp v1 | 74,972 | 74,792 | OBJ/MTL/preview present | Rejected: provenance/license absent |
| Sousaphone v1 | 104,546 | 104,512 | OBJ/MTL/preview present | Rejected: provenance/license/fingering evidence absent |
| Trumpet v1 | 58,037 | 57,944 | OBJ/MTL/preview present | Rejected: provenance/license/fingering evidence absent |
| Tuba v2 | 86,916 | 84,366 | OBJ/MTL/preview present | Rejected: provenance/license/fingering evidence absent |
| Violin | 17,398 | 16,968 | OBJ/MTL/preview present | Rejected: provenance/license absent |
| Viola v1 | 66,510 | 66,488 | OBJ/MTL/preview present | Rejected: provenance/license absent |

## Required approval packet

1. Author/publisher, immutable source URL, purchase/download record, and a
   commercial-use license or written grant.
2. Original archive SHA-256, unpacked-file manifest, declared unit scale and
   forward/up orientation.
3. Conversion recipe and derived-file checksums.
4. For an instructional overlay: named player/teacher review, instrument and
   key-system scope, marker-to-mesh evidence, and date/versioned fingering map.
