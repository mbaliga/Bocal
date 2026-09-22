package com.bocal.music.session

import dev.aarso.session.LocalSessionLedger
import dev.aarso.session.ParticipantId
import dev.aarso.session.SessionId
import dev.aarso.session.SessionRole

/** Bocal's beta host bridge; platform discovery/transport is deliberately injected by the app. */
class LocalSessionBridge(
    sessionId: String,
    participantId: String,
) {
    private val ledger = LocalSessionLedger(
        sessionId = SessionId(sessionId),
        localParticipant = ParticipantId(participantId),
        role = SessionRole.HOST,
    )

    fun snapshot() = ledger.snapshot()

    fun appendLocalEvent(sequence: Long, eventId: String, payload: String) =
        ledger.localEvent(sequence, eventId, payload)
}
